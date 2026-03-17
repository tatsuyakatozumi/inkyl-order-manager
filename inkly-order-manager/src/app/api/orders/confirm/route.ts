import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAutoOrderModule } from '@/lib/auto-order';
import { decryptCredentials } from '@/lib/utils/encryption';
import { uploadScreenshot } from '@/lib/utils/screenshot-uploader';

export async function POST(request: NextRequest) {
  try {
    // Server-side guard: check auto_order_enabled setting
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: setting } = await serviceClient
      .from('ord_settings')
      .select('value')
      .eq('key', 'auto_order_enabled')
      .single();

    if (setting && setting.value === false) {
      return NextResponse.json(
        { error: 'Auto-order (checkout) is currently disabled in settings.' },
        { status: 403 },
      );
    }

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

    const { data: existing } = await supabase
      .from('ord_order_history')
      .select('id,auto_order_status')
      .eq('idempotency_key', idempotencyKey)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        status: existing[0].auto_order_status,
        message: 'Already processed with the same idempotency key.',
      });
    }

    const { data: targetOrders, error: fetchError } = await supabase
      .from('ord_order_history')
      .select('id,auto_order_status,supplier_id')
      .in('id', orderHistoryIds)
      .limit(5000);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!targetOrders || targetOrders.length === 0) {
      return NextResponse.json({ error: 'No orders found' }, { status: 404 });
    }

    const alreadyOrdered = targetOrders.filter(o => o.auto_order_status === 'ordered');
    if (alreadyOrdered.length === targetOrders.length) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        status: 'ordered',
        message: 'Orders are already confirmed.',
      });
    }

    const notCartAdded = targetOrders.filter(o => o.auto_order_status !== 'cart_added');
    if (notCartAdded.length > 0) {
      const invalidStatuses = [...new Set(notCartAdded.map(o => o.auto_order_status))];
      return NextResponse.json({
        error: `Invalid status for confirm: ${invalidStatuses.join(', ')}`,
      }, { status: 400 });
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('ord_suppliers')
      .select(
        'id,name,credentials_encrypted,auto_order_supported,order_cycle,is_active,created_at,updated_at,login_url,lead_time_days,notes',
      )
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

    const decrypted = decryptCredentials(supplier.credentials_encrypted);
    const credentials: { username: string; password: string } = JSON.parse(decrypted);

    let checkoutSuccess = false;
    let screenshotUrl: string | null = null;
    let screenshotExpiresAt: string | null = null;

    try {
      await autoOrder.initialize();
      await autoOrder.ensureLoggedIn(credentials);

      checkoutSuccess = await autoOrder.checkout();

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
        ? 'Order confirmed successfully.'
        : 'Checkout failed. Cart items are kept.',
    });
  } catch (error: any) {
    console.error('Confirm order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
