import { createServerSupabaseClient } from '@/lib/supabase/server'
import ItemsTable from '@/components/items/ItemsTable'

export default async function ItemsPage() {
  const supabase = await createServerSupabaseClient()

  // Fetch items with supplier info
  const { data: items } = await supabase
    .from('ord_items')
    .select('*, supplier:ord_suppliers!supplier_id(id, name)')
    .order('category_large')
    .order('category_medium')
    .order('name')

  // Fetch all active suppliers for dropdowns
  const { data: suppliers } = await supabase
    .from('ord_suppliers')
    .select('*')
    .order('name')

  // Get distinct category_large values for filter
  const { data: categories } = await supabase
    .from('ord_items')
    .select('category_large')

  const categoryLargeOptions = Array.from(
    new Set((categories ?? []).map((c) => c.category_large))
  ).sort()

  return (
    <ItemsTable
      items={items ?? []}
      suppliers={suppliers ?? []}
      categoryLargeOptions={categoryLargeOptions}
    />
  )
}
