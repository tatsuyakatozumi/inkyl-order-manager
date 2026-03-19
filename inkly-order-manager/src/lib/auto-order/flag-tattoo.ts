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
      await this.takeScreenshot('login_page');

      // Step 1: Enter email address
      // Shopify login page has an email input field
      const emailInput = await this.page.waitForSelector(
        'input[type="email"], input[name="email"], input[autocomplete="email"], #email',
        { timeout: 15000 },
      );
      if (!emailInput) {
        console.warn('[FlagTattoo] Email input not found on login page');
        await this.takeScreenshot('login_no_email_input');
        return false;
      }

      await emailInput.fill(email);
      console.log('[FlagTattoo] Email entered:', email);
      await this.takeScreenshot('login_email_entered');

      // Step 2: Click continue/submit button
      const submitButton = await this.page.$(
        'button[type="submit"], button:has-text("続行"), button:has-text("Continue"), button:has-text("メールを送信"), button:has-text("Send")',
      );
      if (submitButton) {
        await submitButton.click();
      } else {
        // Try pressing Enter
        await emailInput.press('Enter');
      }

      console.log('[FlagTattoo] Submit clicked, waiting for verification code input');

      // Step 3: Wait for the verification code input to appear
      await this.page.waitForSelector(
        'input[autocomplete="one-time-code"], input[name="code"], input[inputmode="numeric"], input[type="number"]',
        { timeout: 15000 },
      );
      await this.takeScreenshot('login_code_input_visible');
      console.log('[FlagTattoo] Verification code input appeared');

      // Step 4: Fetch verification code from Gmail
      console.log('[FlagTattoo] Fetching verification code from Gmail...');
      const code = await fetchShopifyVerificationCode(
        { refreshToken },
        beforeCodeRequest,
        90_000, // 90 seconds max
        5_000,  // poll every 5 seconds
      );

      if (!code) {
        console.warn('[FlagTattoo] Failed to retrieve verification code from Gmail');
        await this.takeScreenshot('login_code_not_found');
        return false;
      }

      console.log('[FlagTattoo] Verification code retrieved');

      // Step 5: Enter verification code
      const codeInput = await this.page.$(
        'input[autocomplete="one-time-code"], input[name="code"], input[inputmode="numeric"], input[type="number"]',
      );
      if (!codeInput) {
        console.warn('[FlagTattoo] Code input disappeared');
        return false;
      }

      await codeInput.fill(code);
      await this.takeScreenshot('login_code_entered');

      // Step 6: Submit the code (click button or press Enter)
      const verifyButton = await this.page.$(
        'button[type="submit"], button:has-text("ログイン"), button:has-text("確認"), button:has-text("Verify"), button:has-text("Submit"), button:has-text("続行"), button:has-text("Continue")',
      );
      if (verifyButton) {
        await verifyButton.click();
      } else {
        await codeInput.press('Enter');
      }

      // Step 7: Wait for login to complete (redirect back to store)
      console.log('[FlagTattoo] Code submitted, waiting for login to complete...');
      await this.page.waitForTimeout(5000);
      await this.takeScreenshot('login_after_code_submit');

      // Navigate back to the store to verify login
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
