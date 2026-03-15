import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AlertsList } from '@/components/alerts/AlertsList';

export default async function AlertsPage() {
  const supabase = await createServerSupabaseClient();

  const { data: alerts, error } = await supabase
    .from('ord_stock_alerts')
    .select('*, item:ord_items(*)')
    .order('reported_at', { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="text-red-600">
        在庫報告の取得に失敗しました: {error.message}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">在庫報告</h1>
      <AlertsList alerts={alerts ?? []} />
    </div>
  );
}
