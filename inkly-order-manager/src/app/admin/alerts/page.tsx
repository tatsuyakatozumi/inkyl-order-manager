import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AlertsList } from '@/components/alerts/AlertsList';

export default async function AlertsPage() {
  const supabase = await createServerSupabaseClient();

  const { data: alerts, error } = await supabase
    .from('ord_stock_alerts')
    .select('id,item_id,alert_type,raw_message,parsed_item_name,parsed_quantity,slack_user_id,slack_ts,reported_at,item:ord_items(id,name)')
    .order('reported_at', { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Failed to fetch stock alerts: {error.message}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold md:text-2xl">Stock Alerts</h1>
      <AlertsList alerts={(alerts ?? []) as any} />
    </div>
  );
}
