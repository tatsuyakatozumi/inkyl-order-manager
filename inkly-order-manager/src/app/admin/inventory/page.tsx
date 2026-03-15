import { createServerSupabaseClient } from '@/lib/supabase/server';
import InventoryForm from '@/components/inventory/InventoryForm';

export default async function InventoryPage() {
  const supabase = await createServerSupabaseClient();

  // Fetch consumable items joined with monthly-cycle suppliers
  const { data: items } = await supabase
    .from('ord_items')
    .select('*, supplier:ord_suppliers!supplier_id(*)')
    .eq('consumable_type', 'consumable')
    .eq('is_active', true)
    .eq('ord_suppliers.order_cycle', 'monthly')
    .order('category_large')
    .order('category_medium')
    .order('name');

  // Filter out items whose supplier didn't match the monthly cycle join filter
  const filteredItems = (items ?? []).filter(
    (item: Record<string, unknown>) => item.supplier !== null
  );

  // Fetch suppliers for filter dropdown (only monthly-cycle, active)
  const { data: suppliers } = await supabase
    .from('ord_suppliers')
    .select('*')
    .eq('order_cycle', 'monthly')
    .eq('is_active', true)
    .order('name');

  // Fetch distinct category_large values for filter
  const categorySet = new Set<string>();
  for (const item of filteredItems) {
    categorySet.add((item as { category_large: string }).category_large);
  }
  const categories = Array.from(categorySet).sort();

  return (
    <InventoryForm
      items={filteredItems as never[]}
      suppliers={suppliers ?? []}
      categories={categories}
    />
  );
}
