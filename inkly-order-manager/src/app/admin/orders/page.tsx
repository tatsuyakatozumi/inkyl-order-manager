import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MonthlyOrders } from '@/components/orders/MonthlyOrders';

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient();

  const { data: suppliers, error } = await supabase
    .from('ord_suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    return (
      <div className="text-red-600">
        サプライヤーの取得に失敗しました: {error.message}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">月次発注一覧</h1>
      <MonthlyOrders suppliers={suppliers ?? []} />
    </div>
  );
}
