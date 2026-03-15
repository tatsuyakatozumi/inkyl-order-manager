import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthYM = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAgoYM = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const twelveMonthsAgoYM = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  const { count: totalItems } = await supabase
    .from('ord_items')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: monthlySupplierCount } = await supabase
    .from('ord_suppliers')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('order_cycle', 'monthly');

  const { data: currentVisitorStats } = await supabase
    .from('ord_visitor_stats')
    .select('actual_visitors')
    .eq('year_month', currentYearMonth)
    .maybeSingle();

  const { data: lastMonthOrders } = await supabase
    .from('ord_order_history')
    .select('total_amount')
    .gte('order_date', `${lastMonthYM}-01`)
    .lt('order_date', `${currentYearMonth}-01`)
    .limit(10000);

  const lastMonthTotal = (lastMonthOrders ?? []).reduce(
    (sum, row) => sum + (row.total_amount ?? 0),
    0,
  );

  const { data: visitorStats } = await supabase
    .from('ord_visitor_stats')
    .select('year_month,actual_visitors')
    .gte('year_month', twelveMonthsAgoYM)
    .order('year_month', { ascending: false })
    .limit(12);

  const { data: supplierOrders } = await supabase
    .from('ord_order_history')
    .select('supplier_id,total_amount,ord_suppliers(name)')
    .gte('order_date', `${threeMonthsAgoYM}-01`)
    .limit(20000);

  const supplierTotals = new Map<string, { name: string; total: number }>();
  for (const row of supplierOrders ?? []) {
    const supplierId = row.supplier_id;
    const supplierRel = row.ord_suppliers as unknown;
    const supplierData = (Array.isArray(supplierRel)
      ? supplierRel[0]
      : supplierRel) as { name: string } | null;
    const name = supplierData?.name ?? 'Unknown';
    const existing = supplierTotals.get(supplierId);
    if (existing) {
      existing.total += row.total_amount ?? 0;
    } else {
      supplierTotals.set(supplierId, { name, total: row.total_amount ?? 0 });
    }
  }
  const supplierOrderSummary = Array.from(supplierTotals.values()).sort((a, b) => b.total - a.total);

  const { data: topItemOrders } = await supabase
    .from('ord_order_history')
    .select('item_id,quantity,ord_items(name)')
    .gte('order_date', `${threeMonthsAgoYM}-01`)
    .limit(20000);

  const itemTotals = new Map<string, { name: string; totalQty: number }>();
  for (const row of topItemOrders ?? []) {
    const itemId = row.item_id;
    const itemRel = row.ord_items as unknown;
    const itemData = (Array.isArray(itemRel) ? itemRel[0] : itemRel) as {
      name: string;
    } | null;
    const name = itemData?.name ?? 'Unknown';
    const existing = itemTotals.get(itemId);
    if (existing) {
      existing.totalQty += row.quantity;
    } else {
      itemTotals.set(itemId, { name, totalQty: row.quantity });
    }
  }
  const topItems = Array.from(itemTotals.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, 10);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold md:text-2xl">Analytics</h1>
      <AnalyticsDashboard
        totalItems={totalItems ?? 0}
        monthlySupplierCount={monthlySupplierCount ?? 0}
        expectedVisitors={currentVisitorStats?.actual_visitors ?? null}
        lastMonthTotal={lastMonthTotal}
        visitorStats={visitorStats ?? []}
        supplierOrderSummary={supplierOrderSummary}
        topItems={topItems}
      />
    </div>
  );
}
