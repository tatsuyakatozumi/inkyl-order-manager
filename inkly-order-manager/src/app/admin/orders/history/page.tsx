import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OrderHistory } from '@/components/orders/OrderHistory';

export default async function OrderHistoryPage() {
  const supabase = await createServerSupabaseClient();

  const { data: suppliers } = await supabase
    .from('ord_suppliers')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">発注履歴</h1>
      <OrderHistory suppliers={suppliers ?? []} />
    </div>
  );
}
