import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAutoOrderModule } from '@/lib/auto-order';
import { decryptCredentials } from '@/lib/utils/encryption';
import { uploadScreenshot } from '@/lib/utils/screenshot-uploader';

interface AdhocItem {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

function normalizeRel<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const { items, executeAutoOrder } = (await request.json()) as {
      items: AdhocItem[];
      executeAutoOrder: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'items are required' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const itemIds = items.map((i) => i.itemId);
    const { data: dbItems, error: itemsError } = await supabase
      .from('ord_items')
      .select(
        'id,name,supplier_id,product_url,supplier_product_code,unit_price,supplier:ord_suppliers!supplier_id(id,name,auto_order_supported,credentials_encrypted)',
      )
      .in('id', itemIds)
      .limit(5000);

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

    const itemMap = new Map(dbItems.map((i: any) => [i.id, i]));

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
      .select('id,item_id');

    if (historyError) {
      return NextResponse.json(
        { error: historyError.message },
        { status: 500 },
      );
    }

    const orderIds = insertedOrders?.map((o: any) => o.id) ?? [];

    if (!executeAutoOrder) {
      return NextResponse.json({
        success: true,
        orderIds,
        autoOrderResults: [],
      });
    }

    const supplierGroups = new Map<
      string,
      { supplier: any; orderItems: any[]; historyIds: string[] }
    >();

    for (const reqItem of items) {
      const dbItem = itemMap.get(reqItem.itemId) as any;
      if (!dbItem) continue;
      const supplierId = dbItem.supplier_id;
      if (!supplierGroups.has(supplierId)) {
        const supplier = normalizeRel(dbItem.supplier);
        if (!supplier) continue;
        supplierGroups.set(supplierId, {
          supplier,
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
        const decrypted = decryptCredentials(supplier.credentials_encrypted);
        const credentials: { username: string; password: string } = JSON.parse(decrypted);
        const { results, cartUrl, screenshotPath } = await autoOrder.executeOrder(
          credentials,
          group.orderItems,
        );

        let screenshotUrl: string | null = null;
        let screenshotExpiresAt: string | null = null;
        if (screenshotPath) {
          const uploaded = await uploadScreenshot(screenshotPath);
          if (uploaded) {
            screenshotUrl = uploaded.signedUrl;
            screenshotExpiresAt = uploaded.expiresAt;
          }
        }

        for (const result of results) {
          autoOrderResults.push({
            itemId: result.itemId,
            supplierName: supplier.name,
            status: result.status,
            errorMessage: result.errorMessage ?? null,
            cartUrl,
            screenshotUrl,
            screenshotExpiresAt,
          });
        }

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
