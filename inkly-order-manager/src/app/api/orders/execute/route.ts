import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAutoOrderModule } from '@/lib/auto-order';
import { decryptCredentials } from '@/lib/utils/encryption';
import { uploadScreenshot } from '@/lib/utils/screenshot-uploader';

function normalizeRel<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const { supplierName, yearMonth, autoConfirm, itemIds } =
      await request.json();

    if (!supplierName || !yearMonth || !Array.isArray(itemIds)) {
      return NextResponse.json(
        { error: 'supplierName, yearMonth, and itemIds are required' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: monthlyOrders, error: ordersError } = await supabase
      .from('ord_monthly_orders')
      .select(
        'id,item_id,final_quantity,item:ord_items!item_id(id,name,product_url,supplier_product_code,unit_price,supplier:ord_suppliers!supplier_id(id,name))',
      )
      .eq('year_month', yearMonth)
      .in('item_id', itemIds)
      .limit(5000);

    if (ordersError) {
      return NextResponse.json(
        { error: ordersError.message },
        { status: 500 },
      );
    }

    if (!monthlyOrders || monthlyOrders.length === 0) {
      return NextResponse.json(
        { error: 'No orders found for the specified criteria' },
        { status: 404 },
      );
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('ord_suppliers')
      .select(
        'id,name,credentials_encrypted,auto_order_supported,order_cycle,is_active,created_at,updated_at,login_url,lead_time_days,notes',
      )
      .eq('name', supplierName)
      .single();

    if (supplierError || !supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 },
      );
    }

    if (!supplier.credentials_encrypted) {
      return NextResponse.json(
        { error: 'Supplier credentials not configured' },
        { status: 400 },
      );
    }

    const decrypted = decryptCredentials(supplier.credentials_encrypted);
    const credentials: { username: string; password: string } = JSON.parse(decrypted);

    const orderItems = monthlyOrders.map((order: any) => {
      const item = normalizeRel(order.item);
      return {
      itemId: order.item_id,
      name: item?.name ?? '',
      productUrl: item?.product_url ?? '',
      supplierProductCode: item?.supplier_product_code ?? null,
      quantity: order.final_quantity,
      unitPrice: item?.unit_price ?? 0,
    }});

    const autoOrder = getAutoOrderModule(supplierName);
    if (!autoOrder) {
      return NextResponse.json(
        { error: `Auto-order not supported for ${supplierName}` },
        { status: 400 },
      );
    }
    const { results, checkoutSuccess, cartUrl, screenshotPath } = await autoOrder.executeOrder(
      credentials,
      orderItems,
      autoConfirm ?? false,
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

    const historyRecords = results.map((result: any) => {
      const order = monthlyOrders.find(
        (o: any) => o.item_id === result.itemId,
      );
      const item = normalizeRel(order?.item);
      return {
        item_id: result.itemId,
        supplier_id: supplier.id,
        order_date: new Date().toISOString().split('T')[0],
        order_type: 'monthly_regular' as const,
        quantity: order?.final_quantity ?? 0,
        unit_price: item?.unit_price ?? null,
        total_amount:
          order?.final_quantity && item?.unit_price
            ? order.final_quantity * item.unit_price
            : null,
        order_method: 'auto' as const,
        auto_order_status: result.status,
      };
    });

    const { error: historyError } = await supabase
      .from('ord_order_history')
      .insert(historyRecords);

    if (historyError) {
      console.error('Failed to insert order history:', historyError);
    }

    const newStatus = checkoutSuccess ? 'ordered' : 'confirmed';
    const { error: updateError } = await supabase
      .from('ord_monthly_orders')
      .update({ order_status: newStatus })
      .eq('year_month', yearMonth)
      .in('item_id', itemIds);

    if (updateError) {
      console.error('Failed to update monthly order status:', updateError);
    }

    return NextResponse.json({
      supplier: supplierName,
      yearMonth,
      autoConfirm: autoConfirm ?? false,
      checkoutSuccess,
      cartUrl,
      results,
      screenshotUrl,
      screenshotExpiresAt,
    });
  } catch (error) {
    console.error('Order execution error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
