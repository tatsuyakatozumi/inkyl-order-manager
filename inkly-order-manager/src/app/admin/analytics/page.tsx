import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Last month
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthYM = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  // 3 months ago
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAgoYM = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  // 12 months ago
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const twelveMonthsAgoYM = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  // 1. Total active items count
  const { count: totalItems } = await supabase
    .from('ord_items')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // 2. Monthly suppliers count (suppliers with order_cycle = 'monthly' and active)
  const { count: monthlySupplierCount } = await supabase
    .from('ord_suppliers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('order_cycle', 'monthly');

  // 3. Expected visitors for current month from ord_visitor_stats
  const { data: currentVisitorStats } = await supabase
    .from('ord_visitor_stats')
    .select('actual_visitors')
    .eq('year_month', currentYearMonth)
    .maybeSingle();

  // 4. Last month total order amount
  const { data: lastMonthOrders } = await supabase
    .from('ord_order_history')
    .select('total_amount')
    .gte('order_date', `${lastMonthYM}-01`)
    .lt('order_date', `${currentYearMonth}-01`);

  const lastMonthTotal = (lastMonthOrders ?? []).reduce(
    (sum, row) => sum + (row.total_amount ?? 0),
    0
  );

  // 5. Visitor stats last 12 months
  const { data: visitorStats } = await supabase
    .from('ord_visitor_stats')
    .select('year_month, actual_visitors')
    .gte('year_month', twelveMonthsAgoYM)
    .order('year_month', { ascending: false });

  // 6. Supplier order amounts for last 3 months
  const { data: supplierOrders } = await supabase
    .from('ord_order_history')
    .select('supplier_id, total_amount, ord_suppliers(name)')
    .gte('order_date', `${threeMonthsAgoYM}-01`);

  // Aggregate supplier totals
  const supplierTotals = new Map<string, { name: string; total: number }>();
  for (const row of supplierOrders ?? []) {
    const supplierId = row.supplier_id;
    const supplierData = row.ord_suppliers as unknown as { name: string } | null;
    const name = supplierData?.name ?? '不明';
    const existing = supplierTotals.get(supplierId);
    if (existing) {
      existing.total += row.total_amount ?? 0;
    } else {
      supplierTotals.set(supplierId, { name, total: row.total_amount ?? 0 });
    }
  }
  const supplierOrderSummary = Array.from(supplierTotals.values()).sort(
    (a, b) => b.total - a.total
  );

  // 7. Top 10 items by order quantity in last 3 months
  const { data: topItemOrders } = await supabase
    .from('ord_order_history')
    .select('item_id, quantity, ord_items(name)')
    .gte('order_date', `${threeMonthsAgoYM}-01`);

  const itemTotals = new Map<string, { name: string; totalQty: number }>();
  for (const row of topItemOrders ?? []) {
    const itemId = row.item_id;
    const itemData = row.ord_items as unknown as { name: string } | null;
    const name = itemData?.name ?? '不明';
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
      <h1 className="text-2xl font-bold mb-6">分析</h1>
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
