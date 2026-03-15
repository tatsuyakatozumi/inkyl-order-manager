import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAutoOrderModule } from '@/lib/auto-order';
import { decryptCredentials } from '@/lib/utils/encryption';
import { uploadScreenshot } from '@/lib/utils/screenshot-uploader';

export async function POST(request: NextRequest) {
  try {
    const { supplierName, orderHistoryIds, idempotencyKey } =
      (await request.json()) as {
        supplierName: string;
        orderHistoryIds: string[];
        idempotencyKey: string;
      };

    if (!supplierName || !Array.isArray(orderHistoryIds) || !idempotencyKey) {
      return NextResponse.json(
        { error: 'supplierName, orderHistoryIds, and idempotencyKey are required' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    // Idempotency check: look for existing records with this key
    const { data: existing } = await supabase
      .from('ord_order_history')
      .select('id, auto_order_status')
      .eq('idempotency_key', idempotencyKey)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('[Confirm] Idempotency key already used:', idempotencyKey);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        status: existing[0].auto_order_status,
        message: '既に処理済みです',
      });
    }

    // Verify all target records are in 'cart_added' status
    const { data: targetOrders, error: fetchError } = await supabase
      .from('ord_order_history')
      .select('id, auto_order_status, supplier_id')
      .in('id', orderHistoryIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!targetOrders || targetOrders.length === 0) {
      return NextResponse.json({ error: 'No orders found' }, { status: 404 });
    }

    // Check statuses
    const alreadyOrdered = targetOrders.filter(o => o.auto_order_status === 'ordered');
    if (alreadyOrdered.length === targetOrders.length) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        status: 'ordered',
        message: '既に注文確定済みです',
      });
    }

    const notCartAdded = targetOrders.filter(o => o.auto_order_status !== 'cart_added');
    if (notCartAdded.length > 0) {
      const invalidStatuses = [...new Set(notCartAdded.map(o => o.auto_order_status))];
      return NextResponse.json({
        error: `対象外のステータスが含まれています: ${invalidStatuses.join(', ')}`,
      }, { status: 400 });
    }

    // Get supplier credentials
    const { data: supplier, error: supplierError } = await supabase
      .from('ord_suppliers')
      .select('*')
      .eq('name', supplierName)
      .single();

    if (supplierError || !supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    if (!supplier.credentials_encrypted) {
      return NextResponse.json({ error: 'Credentials not configured' }, { status: 400 });
    }

    const autoOrder = getAutoOrderModule(supplierName);
    if (!autoOrder) {
      return NextResponse.json(
        { error: `Auto-order not supported for ${supplierName}` },
        { status: 400 },
      );
    }

    // Execute checkout only (login → go to cart → checkout)
    const decrypted = decryptCredentials(supplier.credentials_encrypted);
    const credentials: { username: string; password: string } = JSON.parse(decrypted);

    let checkoutSuccess = false;
    let screenshotUrl: string | null = null;
    let screenshotExpiresAt: string | null = null;

    try {
      await autoOrder.initialize();
      await autoOrder.ensureLoggedIn(credentials);

      console.log('[Confirm] proceeding to checkout for', supplierName);
      checkoutSuccess = await autoOrder.checkout();
      console.log('[Confirm] checkout result:', checkoutSuccess);

      const screenshotPath = await autoOrder.takeScreenshot('confirm_result');
      if (screenshotPath) {
        const uploaded = await uploadScreenshot(screenshotPath);
        if (uploaded) {
          screenshotUrl = uploaded.signedUrl;
          screenshotExpiresAt = uploaded.expiresAt;
        }
      }
    } catch (e) {
      console.error('[Confirm] checkout error:', e);
    } finally {
      await autoOrder.cleanup();
    }

    // Update statuses
    const newStatus = checkoutSuccess ? 'ordered' : 'cart_added';
    await supabase
      .from('ord_order_history')
      .update({
        auto_order_status: newStatus,
        idempotency_key: idempotencyKey,
      })
      .in('id', orderHistoryIds);

    return NextResponse.json({
      success: checkoutSuccess,
      alreadyProcessed: false,
      status: newStatus,
      screenshotUrl,
      screenshotExpiresAt,
      message: checkoutSuccess
        ? '注文が確定しました'
        : '注文確定に失敗しました。カートには投入済みです。',
    });
  } catch (error: any) {
    console.error('Confirm order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
