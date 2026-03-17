import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseStockMessage } from '@/lib/slack/parser';
import { processOrderRequest } from '@/lib/slack/process-order-request';
import { sendMessage } from '@/lib/slack/client';
import crypto from 'crypto';

async function verifySlackSignature(
  request: NextRequest,
  body: string,
): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET is not configured');
    return false;
  }

  const timestamp = request.headers.get('x-slack-request-timestamp');
  const slackSignature = request.headers.get('x-slack-signature');

  if (!timestamp || !slackSignature) {
    return false;
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(slackSignature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function sendSlackReply(channel: string, threadTs: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error('SLACK_BOT_TOKEN is not configured');
    return;
  }

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify Slack signature
    const isValid = await verifySlackSignature(request, rawBody);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 },
      );
    }

    const payload = JSON.parse(rawBody);

    // Handle url_verification challenge
    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge });
    }

    // Handle event callbacks
    if (payload.type === 'event_callback') {
      const event = payload.event;

      // Only process message events (not bot messages)
      if (
        event.type === 'message' &&
        !event.bot_id &&
        !event.subtype
      ) {
        // Route: order request channel
        const orderRequestChannel = process.env.SLACK_CHANNEL_ORDER_REQUESTS;
        if (orderRequestChannel && event.channel === orderRequestChannel) {
          await sendMessage(
            event.channel,
            ':hourglass_flowing_sand: 注文リクエストを処理中です...',
            event.ts,
          );
          // Fire-and-forget background processing
          processOrderRequest(event).catch((err) =>
            console.error('[OrderRequest] Background processing error:', err),
          );
          return NextResponse.json({ ok: true });
        }

        // Route: stock alert (existing flow)
        const supabase = await createServerSupabaseClient();

        // Get all item names for matching
        const { data: items, error: itemsError } = await supabase
          .from('ord_items')
          .select('id, name')
          .eq('is_active', true);

        if (itemsError) {
          console.error('Failed to fetch items:', itemsError);
          return NextResponse.json({ ok: true });
        }

        const itemList = (items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
        }));
        const itemNames = itemList.map((item) => item.name);

        // Parse the stock message
        const parsed = await parseStockMessage(event.text, itemNames);

        if (parsed) {
          // Match parsed item name to item ID
          const matchedItem = itemList.find((item) => item.name === parsed.itemName);

          // Insert stock alert
          const { error: insertError } = await supabase
            .from('ord_stock_alerts')
            .insert({
              item_id: matchedItem?.id ?? null,
              alert_type: parsed.alertType,
              raw_message: event.text,
              parsed_item_name: parsed.itemName ?? null,
              parsed_quantity: parsed.quantity ?? null,
              slack_user_id: event.user ?? null,
              slack_ts: event.ts ?? null,
              reported_at: new Date().toISOString(),
            });

          if (insertError) {
            console.error('Failed to insert stock alert:', insertError);
          }

          // Send confirmation reply
          const itemLabel = parsed.itemName ?? 'unknown item';
          const replyText =
            `Stock alert recorded: ${parsed.alertType} for "${itemLabel}".` +
            (parsed.quantity != null
              ? ` Remaining quantity: ${parsed.quantity}.`
              : '');

          await sendSlackReply(
            event.channel,
            event.ts,
            replyText,
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Slack events error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
