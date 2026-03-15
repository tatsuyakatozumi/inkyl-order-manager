/**
 * MonotaRO auto-order test — uses the same code path as the production flow.
 * Tests: ensureLoggedIn → addSingleItemToCart → cart verification → cleanup
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MonotaroAutoOrder } from '../src/lib/auto-order/monotaro';
import type { AutoOrderItem } from '../src/lib/auto-order/base';

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const ENCRYPTION_KEY = env['ENCRYPTION_KEY'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function decrypt(encoded: string, keyHex: string): string {
  const [ivHex, tagHex, ciphertextHex] = encoded.split(':');
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function supabaseGet(table: string, query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function fetchCredentials(): Promise<{ username: string; password: string }> {
  const rows = await supabaseGet('ord_suppliers', 'name=eq.MonotaRO&select=credentials_encrypted');
  if (!rows?.[0]?.credentials_encrypted) throw new Error('MonotaRO credentials not found');
  return JSON.parse(decrypt(rows[0].credentials_encrypted, ENCRYPTION_KEY));
}

async function fetchTestItem(): Promise<AutoOrderItem> {
  const suppliers = await supabaseGet('ord_suppliers', 'name=eq.MonotaRO&select=id');
  if (!suppliers?.[0]?.id) throw new Error('MonotaRO supplier not found');

  const items = await supabaseGet(
    'ord_items',
    `supplier_id=eq.${suppliers[0].id}&product_url=not.is.null&is_active=eq.true&limit=1&select=id,name,product_url,unit_price`,
  );
  if (!items?.[0]?.product_url) throw new Error('No MonotaRO items with product_url found');
  return {
    itemId: items[0].id,
    name: items[0].name,
    productUrl: items[0].product_url,
    supplierProductCode: null,
    quantity: 1,
    unitPrice: items[0].unit_price ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== MonotaRO 自動発注テスト（本番フロー使用） ===\n');

  // Prepare
  console.log('[準備] 認証情報・テスト品目を取得...');
  const credentials = await fetchCredentials();
  console.log(`  ユーザー: ${credentials.username}`);
  const testItem = await fetchTestItem();
  console.log(`  品目: ${testItem.name}`);
  console.log(`  URL:  ${testItem.productUrl}\n`);

  // Create module and initialize browser (same as executeOrder)
  const monotaro = new MonotaroAutoOrder();
  await monotaro.initialize();
  const page = (monotaro as any).page!;

  try {
    // === Step 1: ensureLoggedIn (top page → check → login if needed) ===
    console.log('[Step 1] ensureLoggedIn...');
    const loginOk = await monotaro.ensureLoggedIn(credentials);
    console.log(`  結果: ${loginOk ? '✅ ログイン成功' : '❌ ログイン失敗'}`);
    console.log(`  URL: ${page.url()}`);
    await monotaro.takeScreenshot('test_01_after_login');
    if (!loginOk) {
      console.log('  テスト中断');
      process.exit(1);
    }

    // Verify logged-in state
    const loggedIn = await monotaro.isLoggedIn();
    console.log(`  isLoggedIn(): ${loggedIn ? '✅ true' : '❌ false'}\n`);

    // === Step 2: navigate to product page ===
    console.log('[Step 2] 商品ページにアクセス...');
    await page.goto(testItem.productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`  URL: ${page.url()}`);

    // Verify still logged in on product page
    const stillLoggedIn = await monotaro.isLoggedIn();
    console.log(`  isLoggedIn(): ${stillLoggedIn ? '✅ true' : '❌ false'}`);
    await monotaro.takeScreenshot('test_02_product_page');
    console.log('');

    // === Step 3: addSingleItemToCart ===
    console.log('[Step 3] addSingleItemToCart(1)...');
    const added = await monotaro.addSingleItemToCart(1);
    console.log(`  結果: ${added ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`  URL: ${page.url()}`);
    await monotaro.takeScreenshot('test_03_after_add');
    console.log('');

    // === Step 4: cart page — verify logged in ===
    console.log('[Step 4] カートページ確認...');
    // Navigate to cart via header link (same as user would)
    const basketLink = await page.$('a:has-text("バスケット")');
    if (basketLink) {
      await basketLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
    }

    console.log(`  URL: ${page.url()}`);
    await monotaro.takeScreenshot('test_04_cart');

    // Check cart content and login state
    const bodyText: string = await page.$eval('body', (el: Element) => el.textContent ?? '');
    const hasItems = bodyText.includes('バスケットの内容') && !bodyText.includes('何も入っていません');
    const cartLoggedIn = await monotaro.isLoggedIn();

    console.log(`  カートに商品あり: ${hasItems ? '✅ YES' : '❌ NO'}`);
    console.log(`  ログイン済み:     ${cartLoggedIn ? '✅ YES' : '❌ NO'}`);
    console.log('');

    // === Step 5: cleanup cart ===
    console.log('[Step 5] カートクリア...');
    page.once('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    const deleteBtn = await page.$('button:has-text("削除"), a:has-text("削除")');
    if (deleteBtn) {
      await deleteBtn.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      console.log('  ✅ 削除完了');
    } else {
      console.log('  ⚠️ 削除ボタンなし');
    }
    await monotaro.takeScreenshot('test_05_cleared');

    // === Summary ===
    console.log('\n=== 結果 ===');
    console.log(`  ログイン:         ${loginOk ? 'PASS' : 'FAIL'}`);
    console.log(`  カート投入:       ${added ? 'PASS' : 'FAIL'}`);
    console.log(`  カートにログイン: ${cartLoggedIn ? 'PASS' : 'FAIL'}`);
    console.log(`  全体:             ${loginOk && added && cartLoggedIn ? '✅ ALL PASS' : '❌ SOME FAILED'}`);
  } catch (e: any) {
    console.error(`\n❌ エラー: ${e.message}`);
    await monotaro.takeScreenshot('test_error');
    process.exit(1);
  } finally {
    console.log('\n5秒後にブラウザを閉じます...');
    await page.waitForTimeout(5000);
    await monotaro.cleanup();
  }
}

main();
