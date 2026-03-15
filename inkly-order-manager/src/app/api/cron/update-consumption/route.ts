import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for Vercel Cron Jobs
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Calculate the date range for the last 6 months
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const startYearMonth = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    const endYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get order history for the last 6 months, aggregated by item
    const { data: orderHistory, error: historyError } = await supabase
      .from('ord_order_history')
      .select('item_id, quantity, order_date')
      .gte('order_date', `${startYearMonth}-01`)
      .lt('order_date', `${endYearMonth}-01`)
      .eq('order_type', 'monthly_regular');

    if (historyError) {
      return NextResponse.json(
        { error: historyError.message },
        { status: 500 },
      );
    }

    // Get visitor stats for the same period
    const { data: visitorStats, error: visitorError } = await supabase
      .from('ord_visitor_stats')
      .select('year_month, actual_visitors')
      .gte('year_month', startYearMonth)
      .lt('year_month', endYearMonth);

    if (visitorError) {
      return NextResponse.json(
        { error: visitorError.message },
        { status: 500 },
      );
    }

    // Calculate total visitors over the period
    const totalVisitors = (visitorStats ?? []).reduce(
      (sum, stat) => sum + stat.actual_visitors,
      0,
    );

    if (totalVisitors === 0) {
      return NextResponse.json({
        message: 'No visitor data available for the period',
        updates: [],
        alerts: [],
      });
    }

    // Aggregate order quantities by item_id
    const itemTotals = new Map<string, number>();
    for (const order of orderHistory ?? []) {
      const current = itemTotals.get(order.item_id) ?? 0;
      itemTotals.set(order.item_id, current + order.quantity);
    }

    // Get current items that are visitor-linked
    const itemIdsArray = Array.from(itemTotals.keys());
    if (itemIdsArray.length === 0) {
      return NextResponse.json({
        message: 'No order history found for the period',
        updates: [],
        alerts: [],
      });
    }

    const { data: items, error: itemsError } = await supabase
      .from('ord_items')
      .select('id, name, consumption_per_visit, is_visitor_linked')
      .in('id', itemIdsArray)
      .eq('is_visitor_linked', true)
      .eq('is_active', true);

    if (itemsError) {
      return NextResponse.json(
        { error: itemsError.message },
        { status: 500 },
      );
    }

    const updates: {
      itemId: string;
      name: string;
      oldValue: number | null;
      newValue: number;
      diffPercent: number;
    }[] = [];
    const alerts: {
      itemId: string;
      name: string;
      oldValue: number | null;
      newValue: number;
      diffPercent: number;
    }[] = [];

    for (const item of items ?? []) {
      const totalQuantity = itemTotals.get(item.id) ?? 0;
      const newConsumptionPerVisit = totalQuantity / totalVisitors;
      const oldValue = item.consumption_per_visit;

      // Calculate percentage difference
      let diffPercent = 0;
      if (oldValue !== null && oldValue > 0) {
        diffPercent =
          Math.abs(newConsumptionPerVisit - oldValue) / oldValue * 100;
      } else {
        diffPercent = 100; // Treat null/zero as 100% difference
      }

      const entry = {
        itemId: item.id,
        name: item.name,
        oldValue,
        newValue: Math.round(newConsumptionPerVisit * 10000) / 10000,
        diffPercent: Math.round(diffPercent * 100) / 100,
      };

      if (diffPercent > 20) {
        // Large difference: send alert, do NOT auto-update
        alerts.push(entry);
      } else {
        // Small difference: auto-update
        const { error: updateError } = await supabase
          .from('ord_items')
          .update({
            consumption_per_visit: entry.newValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(
            `Failed to update consumption for ${item.name}:`,
            updateError,
          );
        } else {
          updates.push(entry);
        }
      }
    }

    // Send Slack alert for items with large differences
    if (alerts.length > 0) {
      const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (slackWebhookUrl) {
        const alertLines = alerts.map(
          (a) =>
            `- *${a.name}*: ${a.oldValue ?? 'N/A'} -> ${a.newValue} (${a.diffPercent}% change)`,
        );
        const message = {
          text:
            `Consumption rate alert: The following items have >20% change in consumption_per_visit and were NOT auto-updated:\n\n` +
            alertLines.join('\n') +
            `\n\nPlease review and update manually if appropriate.`,
        };

        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      }
    }

    return NextResponse.json({
      period: { start: startYearMonth, end: endYearMonth },
      totalVisitors,
      updates,
      alerts,
      summary: {
        autoUpdated: updates.length,
        alertsSent: alerts.length,
      },
    });
  } catch (error) {
    console.error('Update consumption cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
