import { createServerSupabaseClient } from '@/lib/supabase/server';
import ItemsTable from '@/components/items/ItemsTable';

export default async function ItemsPage() {
  const supabase = await createServerSupabaseClient();

  const [itemsRes, suppliersRes] = await Promise.all([
    supabase
      .from('ord_items')
      .select(
        'id,name,category_large,category_medium,category_small,supplier_id,alt_supplier_id,spec,unit_price,order_unit,order_unit_quantity,consumption_per_visit,is_visitor_linked,fixed_monthly_consumption,consumable_type,auto_order_enabled,product_url,supplier_product_code,notes,is_active,created_at,updated_at,supplier:ord_suppliers!supplier_id(id,name)',
      )
      .order('category_large')
      .order('category_medium')
      .order('name')
      .limit(2000),
    supabase
      .from('ord_suppliers')
      .select('id,name,is_active')
      .order('name')
      .limit(200),
  ]);

  if (itemsRes.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load items: {itemsRes.error.message}
      </div>
    );
  }

  if (suppliersRes.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load suppliers: {suppliersRes.error.message}
      </div>
    );
  }

  const allItems = (itemsRes.data ?? []).map((item: any) => ({
    ...item,
    supplier: Array.isArray(item.supplier)
      ? (item.supplier[0] ?? null)
      : (item.supplier ?? null),
  }));

  const categoryLargeOptions = Array.from(
    new Set(allItems.map((i: any) => i.category_large as string)),
  ).sort();

  const categoryMediumOptions = Array.from(
    new Set(allItems.map((i: any) => i.category_medium as string)),
  ).sort();

  const categorySmallOptions = Array.from(
    new Set(
      allItems
        .map((i: any) => i.category_small as string | null)
        .filter((v: string | null): v is string => v !== null && v !== ''),
    ),
  ).sort();

  return (
    <ItemsTable
      items={allItems}
      suppliers={suppliersRes.data ?? []}
      categoryLargeOptions={categoryLargeOptions}
      categoryMediumOptions={categoryMediumOptions}
      categorySmallOptions={categorySmallOptions}
    />
  );
}
