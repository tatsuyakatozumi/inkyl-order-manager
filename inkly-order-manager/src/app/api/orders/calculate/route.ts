import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { calculateOrderQuantity } from '@/lib/utils/order-calculator';

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

    // Get active consumable items that belong to monthly-cycle suppliers
    const { data: items, error: itemsError } = await supabase
      .from('ord_items')
      .select('*, supplier:ord_suppliers!supplier_id(*)')
      .eq('consumable_type', 'consumable')
      .eq('is_active', true);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Filter to only items whose supplier has order_cycle = 'monthly'
    const monthlyItems = (items ?? []).filter(
      (item: any) => item.supplier?.order_cycle === 'monthly',
    );

    // Get latest inventory snapshots for all relevant item IDs
    const itemIds = monthlyItems.map((item: any) => item.id);

    const { data: snapshots, error: snapshotsError } = await supabase
      .from('ord_inventory_snapshots')
      .select('*')
      .in('item_id', itemIds)
      .order('snapshot_date', { ascending: false });

    if (snapshotsError) {
      return NextResponse.json(
        { error: snapshotsError.message },
        { status: 500 },
      );
    }

    // Build a map of item_id -> latest inventory quantity
    const latestInventory = new Map<string, number>();
    for (const snap of snapshots ?? []) {
      if (!latestInventory.has(snap.item_id)) {
        latestInventory.set(snap.item_id, snap.quantity);
      }
    }

    // Calculate order quantities and prepare upsert records
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
        item,
        supplier: item.supplier,
        calculation: result,
      });
    }

    // Upsert into ord_monthly_orders (unique on year_month + item_id)
    if (upsertRecords.length > 0) {
      const { error: upsertError } = await supabase
        .from('ord_monthly_orders')
        .upsert(upsertRecords, {
          onConflict: 'year_month,item_id',
        });

      if (upsertError) {
        return NextResponse.json(
          { error: upsertError.message },
          { status: 500 },
        );
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
