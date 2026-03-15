import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OrderHistory } from '@/components/orders/OrderHistory';

export default async function OrderHistoryPage() {
  const supabase = await createServerSupabaseClient();

  const { data: suppliers } = await supabase
    .from('ord_suppliers')
    .select('id,name')
    .eq('is_active', true)
    .order('name')
    .limit(300);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold md:text-2xl">Order History</h1>
      <OrderHistory suppliers={suppliers ?? []} />
    </div>
  );
}
