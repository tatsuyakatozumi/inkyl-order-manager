import { BaseAutoOrder } from './base';
import { fetchShopifyVerificationCode } from '../gmail/client';

const FLAG_TATTOO_BASE_URL = 'https://flag-ts.com';

export class FlagTattooAutoOrder extends BaseAutoOrder {
  protected loginRequired = true;

  constructor() {
    super('FLAG Tattoo Supply');
  }

  /**
   * Override: use headed Chromium to bypass Shopify/Cloudflare bot detection.
   * Requires Xvfb in Docker (see docker-entrypoint.sh).
   */
  async initialize(): Promise<void> {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-http2',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    this.page = await this.browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US', 'en'] });
    });

    this.loggedIn = false;
  }

  getTopPageUrl(): string {
    return `${FLAG_TATTOO_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${FLAG_TATTOO_BASE_URL}/cart`;
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    const el = await this.page.$('.account-menu, .logout-link, .user-name, a[href*="logout"], a[href*="account"]');
    return el !== null;
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    // Shopify redirects /account/login to shopify.com/…/account
    await this.page.goto(`${FLAG_TATTOO_BASE_URL}/account/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  }

  async login(credentials: { username: string; password: string; gmail_refresh_token?: string }): Promise<boolean> {
    if (!this.page) return false;

    const email = credentials.username;
    const refreshToken = credentials.gmail_refresh_token ?? '';

    if (!email) {
      console.warn('[FlagTattoo] No email address configured, skipping login');
      return false;
    }

    // refreshToken が空でも GMAIL_TOKEN_JSON 環境変数にフォールバックするので
    // ここではブロックしない（gmail/client.ts 側で処理）

    try {
      // Record timestamp before requesting code so we only fetch newer emails
      const beforeCodeRequest = new Date();

      console.log('[FlagTattoo] Starting Shopify email verification login');
      console.log('[FlagTattoo] Current URL:', this.page.url());
      await this.takeScreenshot('login_page');

      // Step 1: メール入力欄を探す
      // placeholder "メールを送信する" の input を探す
      const emailInput = await this.page.waitForSelector(
        'input[placeholder*="メール"], input[type="email"], input[name="email"], input[autocomplete="email"]',
        { timeout: 15000 },
      );
      if (!emailInput) {
        console.warn('[FlagTattoo] Email input not found on login page');
        await this.takeScreenshot('login_no_email_input');
        return false;
      }

      await emailInput.fill(email);
      console.log('[FlagTattoo] Email entered');
      await this.takeScreenshot('login_email_entered');

      // Step 2: "続行" ボタンをクリック
      // 注意: "shop で続行する" ボタンもあるので、正確にマッチさせる
      // テキストが完全一致する "続行" ボタンを優先（Shop Pay の "shop で続行する" を避ける）
      let submitButton = await this.page.$('button:text-is("続行")');
      if (!submitButton) {
        // フォールバック: submit ボタンまたは "Continue" 等
        submitButton = await this.page.$(
          'button[type="submit"]:not(:has-text("shop")), button:text-is("Continue")',
        );
      }
      if (submitButton) {
        await submitButton.click();
        console.log('[FlagTattoo] "続行" button clicked');
      } else {
        await emailInput.press('Enter');
        console.log('[FlagTattoo] Pressed Enter to submit email');
      }

      // ページ遷移を待つ
      await this.page.waitForTimeout(3000);
      console.log('[FlagTattoo] After submit, URL:', this.page.url());
      await this.takeScreenshot('login_after_email_submit');

      // Step 3: 認証コード入力欄が表示されるのを待つ
      const codeInput = await this.page.waitForSelector(
        'input[autocomplete="one-time-code"], input[name="code"], input[inputmode="numeric"], input[type="number"], input[placeholder*="コード"], input[placeholder*="code"], input[data-action*="verify"]',
        { timeout: 20000 },
      ).catch(() => null);

      if (!codeInput) {
        console.warn('[FlagTattoo] Verification code input not found');
        await this.takeScreenshot('login_no_code_input');
        return false;
      }

      await this.takeScreenshot('login_code_input_visible');
      console.log('[FlagTattoo] Verification code input appeared');

      // Step 4: Gmail から認証コードを取得
      console.log('[FlagTattoo] Fetching verification code from Gmail...');
      const code = await fetchShopifyVerificationCode(
        { refreshToken },
        beforeCodeRequest,
        90_000, // 90秒待機
        5_000,  // 5秒間隔でポーリング
      );

      if (!code) {
        console.warn('[FlagTattoo] Failed to retrieve verification code from Gmail');
        await this.takeScreenshot('login_code_not_found');
        return false;
      }

      console.log('[FlagTattoo] Verification code retrieved, entering code');

      // Step 5: 認証コードを入力
      // 個別の入力欄（6つ）の場合もあるので、まず1つの入力欄に fill を試みる
      await codeInput.fill(code);
      await this.page.waitForTimeout(500);
      await this.takeScreenshot('login_code_entered');

      // Step 6: 送信ボタンをクリック
      // "ログイン", "認証する", "確認", "送信" 等の日本語ボタンを探す
      const verifyButton = await this.page.$(
        'button[type="submit"], button:has-text("ログイン"), button:has-text("認証"), button:has-text("確認"), button:has-text("送信"), button:has-text("Verify"), button:has-text("Submit")',
      );
      if (verifyButton) {
        await verifyButton.click();
        console.log('[FlagTattoo] Verify button clicked');
      } else {
        await codeInput.press('Enter');
        console.log('[FlagTattoo] Pressed Enter to submit code');
      }

      // Step 7: ログイン完了を待つ
      console.log('[FlagTattoo] Code submitted, waiting for login to complete...');
      await this.page.waitForTimeout(5000);
      console.log('[FlagTattoo] After code submit, URL:', this.page.url());
      await this.takeScreenshot('login_after_code_submit');

      // ストアのトップページに戻ってログイン状態を確認
      await this.page.goto(this.getTopPageUrl(), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await this.page.waitForTimeout(2000);

      const loggedIn = await this.isLoggedIn();
      console.log('[FlagTattoo] Login result:', loggedIn);
      await this.takeScreenshot('login_final');
      return loggedIn;
    } catch (e) {
      console.warn('[FlagTattoo] Login error:', e);
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async addSingleItemToCart(quantity: number, spec: string | null): Promise<boolean> {
    if (!this.page) return false;

    // Spec/variant selection (tolerant — does nothing if selector not found)
    if (spec) {
      try {
        const variantBtn = await this.page.$(
          `button:has-text("${spec}"), label:has-text("${spec}"), a:has-text("${spec}"), [data-value="${spec}"], .swatch-element:has-text("${spec}")`,
        );
        if (variantBtn) {
          await variantBtn.click();
          await this.page.waitForTimeout(1000);
        } else {
          const selects = await this.page.$$('select');
          for (const sel of selects) {
            const options = await sel.$$eval('option', (opts, s) =>
              opts.filter(o => o.textContent?.includes(s as string)).map(o => o.value), spec);
            if (options.length > 0) {
              await sel.selectOption(options[0]);
              await this.page.waitForTimeout(1000);
              break;
            }
          }
          console.log(`[FlagTattoo] Variant selector not found for spec "${spec}", continuing`);
        }
      } catch (e) {
        console.log(`[FlagTattoo] Variant selection failed for "${spec}", continuing:`, e);
      }
    }

    if (quantity > 1) {
      const qtyInput = await this.page.$(
        'input[name="quantity"], input.quantity-input, #quantity',
      );
      if (qtyInput) {
        await qtyInput.fill('');
        await qtyInput.fill(quantity.toString());
      }
    }

    await this.page.click(
      'button:has-text("カートに入れる"), button:has-text("Add to Cart"), .add-to-cart-button, input[type="submit"][value*="カート"]',
    );

    await this.page
      .waitForSelector('.cart-notification, .success-message, .cart-count-update', {
        timeout: 10000,
      })
      .catch(() => null);

    return true;
  }
}
