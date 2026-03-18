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
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const yearMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    let expectedVisitors = 300;
    const { data: visitorStats } = await supabase
      .from('ord_visitor_stats')
      .select('actual_visitors')
      .eq('year_month', yearMonth)
      .single();

    if (visitorStats) {
      expectedVisitors = visitorStats.actual_visitors;
    }

    const { data: items, error: itemsError } = await supabase
      .from('ord_items')
      .select(
        'id,name,supplier_id,order_unit_quantity,consumption_per_visit,is_visitor_linked,fixed_monthly_consumption,supplier:ord_suppliers!supplier_id(id,name,order_cycle)',
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
      const { data: snapshotRows } = await supabase
        .from('ord_inventory_snapshots')
        .select('item_id,quantity,snapshot_date')
        .in('item_id', itemIds)
        .order('snapshot_date', { ascending: false })
        .limit(10000);

      snapshots = snapshotRows ?? [];
    }

    const latestInventory = new Map<string, number>();
    for (const snap of snapshots) {
      if (!latestInventory.has(snap.item_id)) {
        latestInventory.set(snap.item_id, snap.quantity);
      }
    }

    const upsertRecords: any[] = [];
    const orderSummary: { name: string; quantity: number; supplier: string }[] = [];

    for (const item of monthlyItems) {
      const inventoryQty = latestInventory.get(item.id) ?? null;

      const result = calculateOrderQuantity({
        expectedVisitors,
        consumptionPerVisit: item.consumption_per_visit,
        isVisitorLinked: item.is_visitor_linked,
        fixedMonthlyConsumption: item.fixed_monthly_consumption,
        orderUnitQuantity: item.order_unit_quantity ?? 1,
        inventoryQuantity: inventoryQty,
        adjustment: 0,
      });

      upsertRecords.push({
        year_month: yearMonth,
        item_id: item.id,
        expected_visitors: expectedVisitors,
        calculated_quantity: result.orderQuantity,
        inventory_quantity: inventoryQty,
        adjustment: 0,
        final_quantity: result.finalQuantity,
        order_status: 'draft' as const,
      });

      if (result.finalQuantity > 0) {
        const supplier = normalizeSupplier(item.supplier);
        orderSummary.push({
          name: item.name,
          quantity: result.finalQuantity,
          supplier: supplier?.name ?? 'Unknown',
        });
      }
    }

    if (upsertRecords.length > 0) {
      for (let i = 0; i < upsertRecords.length; i += BATCH_SIZE) {
        const chunk = upsertRecords.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from('ord_monthly_orders')
          .upsert(chunk, { onConflict: 'year_month,item_id' });

        if (upsertError) {
          return NextResponse.json(
            { error: upsertError.message },
            { status: 500 },
          );
        }
      }
    }

    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhookUrl && orderSummary.length > 0) {
      const summaryLines = orderSummary.map(
        (o) => `- ${o.name}: ${o.quantity} units (${o.supplier})`,
      );
      const message = {
        text:
          `Monthly order plan generated for *${yearMonth}*\n` +
          `Expected visitors: ${expectedVisitors}\n` +
          `Total items: ${orderSummary.length}\n\n` +
          summaryLines.join('\n'),
      };

      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    }

    return NextResponse.json({
      yearMonth,
      expectedVisitors,
      totalItems: upsertRecords.length,
      itemsWithOrders: orderSummary.length,
      summary: orderSummary,
    });
  } catch (error) {
    console.error('Monthly order cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
