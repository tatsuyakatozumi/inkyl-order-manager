import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SuppliersTable } from '@/components/suppliers/SuppliersTable';

export default async function SuppliersPage() {
  const supabase = await createServerSupabaseClient();

  const { data: suppliers, error: suppliersError } = await supabase
    .from('ord_suppliers')
    .select(
      'id,name,order_cycle,auto_order_supported,login_url,credentials_encrypted,lead_time_days,notes,is_active,created_at,updated_at',
    )
    .order('name')
    .limit(300);

  if (suppliersError) {
    return (
      <div className="text-sm text-red-600">
        Failed to fetch suppliers: {suppliersError.message}
      </div>
    );
  }

  const { data: itemCounts, error: itemCountsError } = await supabase
    .from('ord_items')
    .select('supplier_id')
    .eq('is_active', true)
    .limit(5000);

  if (itemCountsError) {
    return (
      <div className="text-sm text-red-600">
        Failed to fetch item counts: {itemCountsError.message}
      </div>
    );
  }

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
      <h1 className="mb-6 text-xl font-bold md:text-2xl">Suppliers</h1>
      <SuppliersTable suppliers={suppliersWithCount} />
    </div>
  );
}
