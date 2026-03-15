import { createServerSupabaseClient } from '@/lib/supabase/server';
import InventoryForm from '@/components/inventory/InventoryForm';

export default async function InventoryPage() {
  const supabase = await createServerSupabaseClient();

  const { data: items } = await supabase
    .from('ord_items')
    .select(
      'id,name,spec,supplier_id,category_large,order_unit,supplier:ord_suppliers!supplier_id(id,name,order_cycle,is_active)',
    )
    .eq('consumable_type', 'consumable')
    .eq('is_active', true)
    .eq('ord_suppliers.order_cycle', 'monthly')
    .eq('ord_suppliers.is_active', true)
    .order('category_large')
    .order('name')
    .limit(1500);

  const filteredItems = (items ?? [])
    .map((item: any) => ({
      ...item,
      supplier: Array.isArray(item.supplier)
        ? (item.supplier[0] ?? null)
        : (item.supplier ?? null),
    }))
    .filter((item: Record<string, unknown>) => item.supplier !== null);

  const { data: suppliers } = await supabase
    .from('ord_suppliers')
    .select('id,name')
    .eq('order_cycle', 'monthly')
    .eq('is_active', true)
    .order('name')
    .limit(200);

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
