import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SuppliersTable } from '@/components/suppliers/SuppliersTable';

export default async function SuppliersPage() {
  const supabase = await createServerSupabaseClient();

  // Fetch suppliers
  const { data: suppliers, error: suppliersError } = await supabase
    .from('ord_suppliers')
    .select('*')
    .order('name');

  if (suppliersError) {
    return (
      <div className="text-red-600">
        サプライヤーの取得に失敗しました: {suppliersError.message}
      </div>
    );
  }

  // Fetch item counts per supplier
  const { data: itemCounts, error: itemCountsError } = await supabase
    .from('ord_items')
    .select('supplier_id');

  if (itemCountsError) {
    return (
      <div className="text-red-600">
        品目数の取得に失敗しました: {itemCountsError.message}
      </div>
    );
  }

  // Build a map of supplier_id -> item count
  const countMap: Record<string, number> = {};
  for (const row of itemCounts ?? []) {
    countMap[row.supplier_id] = (countMap[row.supplier_id] ?? 0) + 1;
  }

  const suppliersWithCount = (suppliers ?? []).map((s) => ({
    ...s,
    item_count: countMap[s.id] ?? 0,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">サプライヤー管理</h1>
      <SuppliersTable suppliers={suppliersWithCount} />
    </div>
  );
}
