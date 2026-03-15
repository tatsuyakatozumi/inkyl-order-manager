import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAutoOrderModule } from '@/lib/auto-order';
import { decryptCredentials } from '@/lib/utils/encryption';

interface AdhocItem {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

export async function POST(request: NextRequest) {
  try {
    const { items, executeAutoOrder, autoConfirm } = (await request.json()) as {
      items: AdhocItem[];
      executeAutoOrder: boolean;
      autoConfirm?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'items are required' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    // Fetch item details with supplier info
    const itemIds = items.map((i) => i.itemId);
    const { data: dbItems, error: itemsError } = await supabase
      .from('ord_items')
      .select('*, supplier:ord_suppliers!supplier_id(*)')
      .in('id', itemIds);

    if (itemsError) {
      return NextResponse.json(
        { error: itemsError.message },
        { status: 500 },
      );
    }

    if (!dbItems || dbItems.length === 0) {
      return NextResponse.json(
        { error: 'No items found' },
        { status: 404 },
      );
    }

    // Build lookup map
    const itemMap = new Map(dbItems.map((i: any) => [i.id, i]));

    // Insert all items into ord_order_history
    const orderDate = new Date().toISOString().split('T')[0];
    const historyRecords = items.map((reqItem) => {
      const dbItem = itemMap.get(reqItem.itemId) as any;
      return {
        item_id: reqItem.itemId,
        supplier_id: dbItem?.supplier_id,
        order_date: orderDate,
        order_type: 'ad_hoc' as const,
        quantity: reqItem.quantity,
        unit_price: reqItem.unitPrice,
        total_amount: reqItem.quantity * reqItem.unitPrice,
        order_method: executeAutoOrder
          ? ('auto' as const)
          : ('manual' as const),
        auto_order_status: executeAutoOrder
          ? ('pending' as const)
          : null,
      };
    });

    const { data: insertedOrders, error: historyError } = await supabase
      .from('ord_order_history')
      .insert(historyRecords)
      .select('id, item_id');

    if (historyError) {
      return NextResponse.json(
        { error: historyError.message },
        { status: 500 },
      );
    }

    const orderIds = insertedOrders?.map((o: any) => o.id) ?? [];

    // If not auto-ordering, just return
    if (!executeAutoOrder) {
      return NextResponse.json({
        success: true,
        orderIds,
        autoOrderResults: [],
      });
    }

    // Group items by supplier for auto-ordering
    const supplierGroups = new Map<
      string,
      { supplier: any; orderItems: any[]; historyIds: string[] }
    >();

    for (const reqItem of items) {
      const dbItem = itemMap.get(reqItem.itemId) as any;
      if (!dbItem) continue;
      const supplierId = dbItem.supplier_id;
      if (!supplierGroups.has(supplierId)) {
        supplierGroups.set(supplierId, {
          supplier: dbItem.supplier,
          orderItems: [],
          historyIds: [],
        });
      }
      const group = supplierGroups.get(supplierId)!;
      group.orderItems.push({
        itemId: reqItem.itemId,
        name: dbItem.name,
        productUrl: dbItem.product_url ?? '',
        supplierProductCode: dbItem.supplier_product_code ?? null,
        quantity: reqItem.quantity,
        unitPrice: reqItem.unitPrice,
      });
      const historyRecord = insertedOrders?.find(
        (o: any) => o.item_id === reqItem.itemId,
      );
      if (historyRecord) group.historyIds.push(historyRecord.id);
    }

    const autoOrderResults: any[] = [];

    for (const [, group] of supplierGroups) {
      const supplier = group.supplier;

      // Check if auto-order is supported
      if (!supplier.auto_order_supported) {
        for (const item of group.orderItems) {
          autoOrderResults.push({
            itemId: item.itemId,
            supplierName: supplier.name,
            status: 'manual_required',
            errorMessage: null,
            cartUrl: null,
          });
        }
        continue;
      }

      // Try auto-order
      const autoOrder = getAutoOrderModule(supplier.name);
      if (!autoOrder || !supplier.credentials_encrypted) {
        for (const item of group.orderItems) {
          autoOrderResults.push({
            itemId: item.itemId,
            supplierName: supplier.name,
            status: 'failed',
            errorMessage: !autoOrder
              ? 'Auto-order module not found'
              : 'Credentials not configured',
            cartUrl: null,
          });
        }
        if (group.historyIds.length > 0) {
          await supabase
            .from('ord_order_history')
            .update({ auto_order_status: 'failed' })
            .in('id', group.historyIds);
        }
        continue;
      }

      try {
        console.log('[Adhoc] executing auto order for supplier:', supplier.name);
        const decrypted = decryptCredentials(supplier.credentials_encrypted);
        const credentials: { username: string; password: string } = JSON.parse(decrypted);
        console.log('[Adhoc] credentials found:', !!credentials);
        console.log('[Adhoc] items to order:', group.orderItems.length);
        console.log('[Adhoc] autoConfirm:', autoConfirm ?? false);
        const { results, checkoutSuccess, cartUrl } = await autoOrder.executeOrder(
          credentials,
          group.orderItems,
          autoConfirm ?? false,
        );

        console.log('[Adhoc] auto order complete, checkoutSuccess:', checkoutSuccess);
        for (const result of results) {
          autoOrderResults.push({
            itemId: result.itemId,
            supplierName: supplier.name,
            status: result.status,
            errorMessage: result.errorMessage ?? null,
            cartUrl,
            checkoutSuccess,
          });
        }

        // Update history statuses
        for (const result of results) {
          const historyRecord = insertedOrders?.find(
            (o: any) => o.item_id === result.itemId,
          );
          if (historyRecord) {
            await supabase
              .from('ord_order_history')
              .update({ auto_order_status: result.status })
              .eq('id', historyRecord.id);
          }
        }
      } catch (e: any) {
        for (const item of group.orderItems) {
          autoOrderResults.push({
            itemId: item.itemId,
            supplierName: supplier.name,
            status: 'failed',
            errorMessage: e.message ?? 'Unknown error',
            cartUrl: null,
          });
        }
        if (group.historyIds.length > 0) {
          await supabase
            .from('ord_order_history')
            .update({ auto_order_status: 'failed' })
            .in('id', group.historyIds);
        }
      }
    }

    return NextResponse.json({
      success: true,
      orderIds,
      autoOrderResults,
    });
  } catch (error: any) {
    console.error('Adhoc order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
