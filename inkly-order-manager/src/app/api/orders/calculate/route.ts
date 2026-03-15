import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { calculateOrderQuantity } from '@/lib/utils/order-calculator';

const BATCH_SIZE = 50;

function normalizeSupplier<T>(supplier: T | T[] | null | undefined): T | null {
  if (Array.isArray(supplier)) return supplier[0] ?? null;
  return supplier ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const { yearMonth, expectedVisitors } = await request.json();

    if (!yearMonth || !expectedVisitors) {
      return NextResponse.json(
        { error: 'yearMonth and expectedVisitors are required' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: items, error: itemsError } = await supabase
      .from('ord_items')
      .select(
        'id,name,supplier_id,spec,unit_price,order_unit_quantity,consumption_per_visit,is_visitor_linked,fixed_monthly_consumption,product_url,supplier_product_code,supplier:ord_suppliers!supplier_id(id,name,order_cycle)',
      )
      .eq('consumable_type', 'consumable')
      .eq('is_active', true)
      .limit(5000);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const monthlyItems = (items ?? []).filter((item: any) => {
      const supplier = normalizeSupplier(item.supplier);
      return supplier?.order_cycle === 'monthly';
    });

    const itemIds = monthlyItems.map((item: any) => item.id);

    let snapshots: Array<{ item_id: string; quantity: number; snapshot_date: string }> = [];
    if (itemIds.length > 0) {
      const { data: snapshotRows, error: snapshotsError } = await supabase
        .from('ord_inventory_snapshots')
        .select('item_id,quantity,snapshot_date')
        .in('item_id', itemIds)
        .order('snapshot_date', { ascending: false })
        .limit(10000);

      if (snapshotsError) {
        return NextResponse.json(
          { error: snapshotsError.message },
          { status: 500 },
        );
      }

      snapshots = snapshotRows ?? [];
    }

    const latestInventory = new Map<string, number>();
    for (const snap of snapshots) {
      if (!latestInventory.has(snap.item_id)) {
        latestInventory.set(snap.item_id, snap.quantity);
      }
    }

    const upsertRecords: any[] = [];
    const calculatedOrders: any[] = [];

    for (const item of monthlyItems) {
      const inventoryQty = latestInventory.get(item.id) ?? null;

      const result = calculateOrderQuantity({
        expectedVisitors,
        consumptionPerVisit: item.consumption_per_visit,
        isVisitorLinked: item.is_visitor_linked,
        fixedMonthlyConsumption: item.fixed_monthly_consumption,
        orderUnitQuantity: item.order_unit_quantity ?? 1,
        inventoryQuantity: inventoryQty,
        isFirstOrder: inventoryQty !== null,
        adjustment: 0,
      });

      const record = {
        year_month: yearMonth,
        item_id: item.id,
        expected_visitors: expectedVisitors,
        calculated_quantity: result.orderQuantity,
        inventory_quantity: inventoryQty,
        adjustment: 0,
        final_quantity: result.finalQuantity,
        order_status: 'draft' as const,
      };

      upsertRecords.push(record);
      calculatedOrders.push({
        ...record,
        item: {
          ...item,
          supplier: normalizeSupplier(item.supplier),
        },
        calculation: result,
      });
    }

    if (upsertRecords.length > 0) {
      for (let i = 0; i < upsertRecords.length; i += BATCH_SIZE) {
        const chunk = upsertRecords.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from('ord_monthly_orders')
          .upsert(chunk, {
            onConflict: 'year_month,item_id',
          });

        if (upsertError) {
          return NextResponse.json(
            { error: upsertError.message },
            { status: 500 },
          );
        }
      }
    }

    return NextResponse.json({
      yearMonth,
      expectedVisitors,
      totalItems: calculatedOrders.length,
      orders: calculatedOrders,
    });
  } catch (error) {
    console.error('Order calculation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
