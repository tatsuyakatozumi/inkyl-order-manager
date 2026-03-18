import { createClient } from '@supabase/supabase-js';
import { parseOrderRequest } from './order-request-parser';
import { sendMessage } from './client';
import { getAutoOrderModule } from '@/lib/auto-order';
import { decryptCredentials } from '@/lib/utils/encryption';
import { uploadScreenshot } from '@/lib/utils/screenshot-uploader';

interface SlackEvent {
  channel: string;
  ts: string;
  text: string;
  user?: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function processOrderRequest(event: SlackEvent): Promise<void> {
  const supabase = getServiceClient();

  try {
    // 1. Fetch all active items with supplier info
    const { data: items, error: itemsError } = await supabase
      .from('ord_items')
      .select(
        'id,name,spec,supplier_id,product_url,supplier_product_code,unit_price,supplier:ord_suppliers!supplier_id(id,name,auto_order_supported,credentials_encrypted)',
      )
      .eq('is_active', true)
      .limit(5000);

    if (itemsError || !items || items.length === 0) {
      await sendMessage(event.channel, ':warning: 品目データの取得に失敗しました。', event.ts);
      return;
    }

    const itemNames = items.map((i: any) => i.name);

    // 2. Parse order request with Claude AI
    const parsed = await parseOrderRequest(event.text, itemNames);

    if (parsed.items.length === 0) {
      let reply = ':x: 該当する品目が見つかりませんでした。';
      if (parsed.unmatched.length > 0) {
        reply += `\n\nマッチしなかった項目: ${parsed.unmatched.join(', ')}`;
      }
      await sendMessage(event.channel, reply, event.ts);
      return;
    }

    // 3. Map parsed items to DB items and group by supplier
    const supplierGroups = new Map<
      string,
      {
        supplier: any;
        orderItems: Array<{
          itemId: string;
          name: string;
          productUrl: string;
          supplierProductCode: string | null;
          spec: string | null;
          quantity: number;
          unitPrice: number;
        }>;
      }
    >();

    const matchedItems: Array<{ dbItem: any; quantity: number }> = [];

    for (const parsedItem of parsed.items) {
      const dbItem = items.find((i: any) => i.name === parsedItem.itemName) as any;
      if (!dbItem) continue;

      matchedItems.push({ dbItem, quantity: parsedItem.quantity });

      const supplierId = dbItem.supplier_id;
      const supplier = Array.isArray(dbItem.supplier)
        ? dbItem.supplier[0]
        : dbItem.supplier;
      if (!supplier) continue;

      if (!supplierGroups.has(supplierId)) {
        supplierGroups.set(supplierId, { supplier, orderItems: [] });
      }

      supplierGroups.get(supplierId)!.orderItems.push({
        itemId: dbItem.id,
        name: dbItem.name,
        productUrl: dbItem.product_url ?? '',
        supplierProductCode: dbItem.supplier_product_code ?? null,
        spec: dbItem.spec ?? null,
        quantity: parsedItem.quantity,
        unitPrice: dbItem.unit_price ?? 0,
      });
    }

    // 4. Execute cart addition for each supplier
    const resultLines: string[] = [];
    const orderDate = new Date().toISOString().split('T')[0];

    for (const [, group] of supplierGroups) {
      const { supplier, orderItems } = group;

      // Insert order history records
      const historyRecords = orderItems.map((item) => ({
        item_id: item.itemId,
        supplier_id: supplier.id,
        order_date: orderDate,
        order_type: 'ad_hoc' as const,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_amount: item.quantity * item.unitPrice,
        order_method: 'slack_reported' as const,
        auto_order_status: 'pending' as const,
      }));

      await supabase.from('ord_order_history').insert(historyRecords);

      if (!supplier.auto_order_supported) {
        resultLines.push(`\n*${supplier.name}* (自動発注非対応)`);
        for (const item of orderItems) {
          resultLines.push(`  :clipboard: ${item.name} x${item.quantity}`);
        }
        continue;
      }

      const autoOrder = getAutoOrderModule(supplier.name);
      if (!autoOrder) {
        resultLines.push(`\n*${supplier.name}* (モジュールなし)`);
        for (const item of orderItems) {
          resultLines.push(`  :clipboard: ${item.name} x${item.quantity}`);
        }
        continue;
      }

      try {
        let credentials: { username: string; password: string; gmail_refresh_token?: string } = { username: '', password: '' };
        if (supplier.credentials_encrypted) {
          const decrypted = decryptCredentials(supplier.credentials_encrypted);
          credentials = JSON.parse(decrypted);
        }

        const { results, screenshotPath, cartUrl } = await autoOrder.executeOrder(
          credentials,
          orderItems,
        );

        let screenshotUrl: string | null = null;
        if (screenshotPath) {
          const uploaded = await uploadScreenshot(screenshotPath);
          if (uploaded) {
            screenshotUrl = uploaded.signedUrl;
          }
        }

        // Update order history status
        const successItems = results.filter(
          (r) => r.status === 'cart_added',
        );
        const failedItems = results.filter((r) => r.status === 'failed');

        if (successItems.length > 0) {
          await supabase
            .from('ord_order_history')
            .update({ auto_order_status: 'cart_added' })
            .in(
              'item_id',
              successItems.map((r) => r.itemId),
            )
            .eq('order_date', orderDate)
            .eq('order_method', 'slack_reported');
        }
        if (failedItems.length > 0) {
          await supabase
            .from('ord_order_history')
            .update({ auto_order_status: 'failed' })
            .in(
              'item_id',
              failedItems.map((r) => r.itemId),
            )
            .eq('order_date', orderDate)
            .eq('order_method', 'slack_reported');
        }

        resultLines.push(`\n*${supplier.name}*`);
        for (const item of orderItems) {
          const result = results.find((r) => r.itemId === item.itemId);
          const icon =
            result?.status === 'cart_added'
              ? ':shopping_trolley:'
              : ':warning:';
          resultLines.push(`  ${icon} ${item.name} x${item.quantity}`);
        }
        if (cartUrl) {
          resultLines.push(`  :shopping_bags: <${cartUrl}|カートを確認>`);
        }
        if (screenshotUrl) {
          resultLines.push(`  :camera: <${screenshotUrl}|カート画面スクリーンショット>`);
        }
      } catch (e: any) {
        console.error(
          `[OrderRequest] Error processing ${supplier.name}:`,
          e,
        );
        resultLines.push(`\n*${supplier.name}* :x: エラー: ${e.message ?? 'Unknown'}`);

        await supabase
          .from('ord_order_history')
          .update({ auto_order_status: 'failed' })
          .in(
            'item_id',
            orderItems.map((i) => i.itemId),
          )
          .eq('order_date', orderDate)
          .eq('order_method', 'slack_reported');
      }
    }

    // 5. Build and send final reply
    let reply = ':white_check_mark: *注文リクエスト処理完了*\n';
    reply += resultLines.join('\n');

    if (parsed.unmatched.length > 0) {
      reply += `\n\n:question: マッチしなかった項目: ${parsed.unmatched.join(', ')}`;
    }

    await sendMessage(event.channel, reply, event.ts);
  } catch (e: any) {
    console.error('[OrderRequest] Unexpected error:', e);
    await sendMessage(
      event.channel,
      `:x: 注文リクエストの処理中にエラーが発生しました: ${e.message ?? 'Unknown error'}`,
      event.ts,
    );
  }
}
