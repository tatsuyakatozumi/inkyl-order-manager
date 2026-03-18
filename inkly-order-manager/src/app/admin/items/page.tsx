import { createServerSupabaseClient } from '@/lib/supabase/server';
import ItemsTable from '@/components/items/ItemsTable';

const PAGE_SIZE = 50;

type PageSearchParams = {
  page?: string;
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams> | PageSearchParams;
}) {
  const params = await searchParams;
  const pageRaw = Number(params?.page ?? '1');
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createServerSupabaseClient();

  const [itemsRes, suppliersRes, categoriesRes] = await Promise.all([
    supabase
      .from('ord_items')
      .select(
        'id,name,category_large,category_medium,category_small,supplier_id,alt_supplier_id,spec,unit_price,order_unit,order_unit_quantity,consumption_per_visit,is_visitor_linked,fixed_monthly_consumption,consumable_type,auto_order_enabled,product_url,supplier_product_code,notes,is_active,created_at,updated_at,supplier:ord_suppliers!supplier_id(id,name)',
        { count: 'exact' },
      )
      .order('category_large')
      .order('category_medium')
      .order('name')
      .range(from, to),
    supabase
      .from('ord_suppliers')
      .select('id,name,is_active')
      .order('name')
      .limit(200),
    supabase
      .from('ord_items')
      .select('category_large,category_medium,category_small')
      .limit(500),
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

  if (categoriesRes.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load categories: {categoriesRes.error.message}
      </div>
    );
  }

  const categoryLargeOptions = Array.from(
    new Set((categoriesRes.data ?? []).map((c) => c.category_large)),
  ).sort();

  const categoryMediumOptions = Array.from(
    new Set((categoriesRes.data ?? []).map((c) => c.category_medium)),
  ).sort();

  const categorySmallOptions = Array.from(
    new Set(
      (categoriesRes.data ?? [])
        .map((c) => c.category_small)
        .filter((v): v is string => v !== null && v !== ''),
    ),
  ).sort();

  const normalizedItems = (itemsRes.data ?? []).map((item: any) => ({
    ...item,
    supplier: Array.isArray(item.supplier)
      ? (item.supplier[0] ?? null)
      : (item.supplier ?? null),
  }));

  return (
    <ItemsTable
      items={normalizedItems}
      suppliers={suppliersRes.data ?? []}
      categoryLargeOptions={categoryLargeOptions}
      categoryMediumOptions={categoryMediumOptions}
      categorySmallOptions={categorySmallOptions}
      page={page}
      totalCount={itemsRes.count ?? 0}
      pageSize={PAGE_SIZE}
    />
  );
}
