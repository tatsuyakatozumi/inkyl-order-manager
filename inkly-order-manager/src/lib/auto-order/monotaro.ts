import { BaseAutoOrder } from './base';

const MONOTARO_BASE_URL = 'https://www.monotaro.com';
const CHECKOUT_URL = `${MONOTARO_BASE_URL}/monotaroMain.py?func=monotaro.checkout.confirm.show_init_edit_servlet.ShowInitEditServlet`;

export class MonotaroAutoOrder extends BaseAutoOrder {
  constructor() {
    super('MonotaRO');
  }

  /**
   * Override: use headed Chromium (headless: false) to bypass Akamai bot detection.
   * Akamai blocks Chromium headless at page load level and Firefox headless at
   * login form submission. Headed Chromium with --disable-http2 is the only
   * working configuration. Requires Xvfb in Docker (see docker-entrypoint.sh).
   */
  async initialize(): Promise<void> {
    const { chromium } = await import('playwright');
    console.log('[MonotaRO] initialize: launching headed Chromium (requires DISPLAY)');
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
    });

    // Stealth: hide webdriver flag
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    // Stealth: fake plugins
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    // Stealth: set languages
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ja-JP', 'ja', 'en-US', 'en'],
      });
    });

    this.loggedIn = false;
  }

  getTopPageUrl(): string {
    return `${MONOTARO_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${MONOTARO_BASE_URL}/monotaroMain.py?func=monotaro.basket.showListServlet.ShowListServlet`;
  }

  /**
   * Check if the user is logged in.
   * Same logic as the original working code:
   * - Negative: login link present
   * - Positive: logout link or user name display
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const hasLoginLink = await this.page.locator('a[href*="/login/"]:has-text("ログイン")').count() > 0;
      const hasLogoutLink = await this.page.locator('a:has-text("ログアウト")').count() > 0;
      const hasUserName = await this.page.locator('.LoginUserName').count() > 0;

      const isLoggedIn = !hasLoginLink || hasLogoutLink || hasUserName;
      console.log(`[MonotaRO] isLoggedIn: loginLink=${hasLoginLink}, logoutLink=${hasLogoutLink}, userName=${hasUserName} → ${isLoggedIn}`);
      return isLoggedIn;
    } catch (e) {
      console.log('[MonotaRO] isLoggedIn: error:', (e as Error).message);
      return false;
    }
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    console.log('[MonotaRO] navigateToLoginPage: going to /login/');
    await this.page.goto(`${MONOTARO_BASE_URL}/login/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await this.page.waitForTimeout(2000);
    console.log('[MonotaRO] navigateToLoginPage: URL:', this.page.url());
  }

  /**
   * Login — same logic as the original working code.
   * fill() + click('button:has-text("ログイン")') + waitForLoadState + wait.
   */
  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log('[MonotaRO] login: starting');

      await this.page.goto(`${MONOTARO_BASE_URL}/login/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      console.log('[MonotaRO] login: URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('login_page');

      // Fill credentials — same as original working code
      await this.page.fill('input[name="userId"]', credentials.username);
      await this.page.fill('input[name="password"]', credentials.password);
      console.log('[MonotaRO] login: filled credentials');

      // Click login button — same as original working code
      await this.page.click('button:has-text("ログイン")');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);

      console.log('[MonotaRO] login: after click, URL:', this.page.url());
      await this.takeScreenshot('login_after_click');

      const loggedIn = await this.isLoggedIn();
      console.log('[MonotaRO] login: result:', loggedIn);
      return loggedIn;
    } catch (e) {
      console.log('[MonotaRO] login: error:', (e as Error).message);
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async addSingleItemToCart(quantity: number): Promise<boolean> {
    if (!this.page) return false;

    const cartButtons = await this.page.$$('button:has-text("バスケットに入れる")');
    if (cartButtons.length === 0) {
      await this.takeScreenshot('no_cart_button');
      return false;
    }

    const firstButton = cartButtons[0];

    const row = await firstButton.evaluateHandle((btn: HTMLElement) => {
      let el: HTMLElement | null = btn;
      while (el && el.tagName !== 'TR' && el.tagName !== 'FORM') {
        el = el.parentElement;
      }
      return el ?? btn.parentElement;
    });

    const qtyInput = await row.asElement()?.$('input[name="p"]')
      ?? await this.page.$('input[name="Quantity"]')
      ?? await this.page.$('input[name="quantity"]');

    if (qtyInput) {
      await qtyInput.fill('');
      await qtyInput.fill(quantity.toString());
    }

    await firstButton.click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(3000);

    return true;
  }

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    try {
      // Step 1: Verify cart has items
      console.log('[MonotaRO] checkout: Step 1 — verifying cart');
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_cart');

      const cartInfo = await this.page.evaluate(() => {
        const body = document.body.innerText;
        return {
          hasItems: body.includes('バスケット') && !body.includes('バスケットに商品がありません'),
          url: location.href,
        };
      });
      console.log('[MonotaRO] checkout: cart info:', JSON.stringify(cartInfo));

      if (!cartInfo.hasItems) {
        console.log('[MonotaRO] checkout: cart empty, aborting');
        return false;
      }

      // Step 2: Navigate directly to checkout URL
      console.log('[MonotaRO] checkout: Step 2 — navigating to checkout');
      await this.page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] checkout: after nav, URL:', this.page.url());
      await this.takeScreenshot('checkout_after_nav');

      // If redirected to login page, do a full re-login
      if (this.page.url().includes('/login')) {
        console.log('[MonotaRO] checkout: redirected to login');
        if (!this.credentials) {
          console.log('[MonotaRO] checkout: no credentials for re-login');
          return false;
        }
        const reLoginOk = await this.login(this.credentials);
        if (!reLoginOk) {
          console.log('[MonotaRO] checkout: re-login failed');
          return false;
        }
        await this.page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log('[MonotaRO] checkout: after re-login nav, URL:', this.page.url());
        await this.takeScreenshot('checkout_after_relogin');
      }

      // If on cart page with login form, try cart page login
      if (this.isCartPageUrl(this.page.url())) {
        console.log('[MonotaRO] checkout: on cart page, trying embedded login');
        if (!this.credentials) return false;
        const cartLoginOk = await this.loginViaCartPage(this.credentials);
        if (!cartLoginOk) {
          console.log('[MonotaRO] checkout: cart page login failed');
          await this.takeScreenshot('checkout_cart_login_failed');
          return false;
        }
      }

      // Step 3: Handle intermediate pages
      console.log('[MonotaRO] checkout: Step 3 — intermediate pages');
      const MAX_PAGES = 5;
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = this.page.url();
        const bodyText = await this.page.textContent('body') ?? '';
        console.log(`[MonotaRO] checkout: page ${i + 1}, URL: ${url}`);

        if (this.isCartPageUrl(url)) {
          console.log('[MonotaRO] checkout: stuck on cart page, aborting');
          await this.takeScreenshot('checkout_stuck_cart');
          return false;
        }

        if (bodyText.includes('ご注文内容の確定') || bodyText.includes('まだご注文は確定していません')) {
          console.log('[MonotaRO] checkout: reached confirmation page');
          break;
        }

        if (this.isCompletionPage(url, bodyText)) {
          console.log('[MonotaRO] checkout: order already completed');
          await this.takeScreenshot('checkout_complete');
          return true;
        }

        const clicked = await this.clickIntermediateButton();
        if (!clicked) break;
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(3000);
        await this.takeScreenshot(`checkout_intermediate_${i}`);
      }

      // Step 4: Click order confirmation button
      console.log('[MonotaRO] checkout: Step 4 — confirming order');
      await this.takeScreenshot('checkout_before_confirm');

      const confirmed = await this.clickConfirmButton();
      if (!confirmed) {
        console.log('[MonotaRO] checkout: confirm button not found');
        await this.dumpClickableElements();
        await this.takeScreenshot('checkout_no_confirm');
        return false;
      }

      // Step 5: Check completion
      console.log('[MonotaRO] checkout: Step 5 — checking completion');
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(10000);

      const finalUrl = this.page.url();
      const finalText = await this.page.textContent('body') ?? '';
      console.log('[MonotaRO] checkout: final URL:', finalUrl);
      await this.takeScreenshot('checkout_final');

      const isComplete = this.isCompletionPage(finalUrl, finalText);
      console.log('[MonotaRO] checkout: complete:', isComplete);

      const orderMatch = finalText.match(/注文番号[：:\s]*([A-Z0-9-]+)/);
      if (orderMatch) console.log('[MonotaRO] checkout: order number:', orderMatch[1]);

      return isComplete;
    } catch (e) {
      console.error('[MonotaRO] checkout: error:', e);
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }

  /** Login via the cart page's embedded login form. */
  private async loginViaCartPage(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;

    console.log('[MonotaRO] loginViaCartPage: filling form');

    // Fill credentials on cart page
    const hasUserId = await this.page.locator('input[name="userId"]').count() > 0;
    const hasPassword = await this.page.locator('input[name="password"]').count() > 0;
    if (!hasUserId || !hasPassword) {
      console.log('[MonotaRO] loginViaCartPage: login form not found on cart page');
      return false;
    }

    await this.page.fill('input[name="userId"]', credentials.username);
    await this.page.fill('input[name="password"]', credentials.password);

    // Click the login/checkout button
    const buttonSelectors = [
      'button:has-text("レジへ進む")',
      'button:has-text("ログイン")',
      'input[type="submit"]',
    ];

    for (const sel of buttonSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.count() > 0) {
        console.log(`[MonotaRO] loginViaCartPage: clicking ${sel}`);
        await btn.click();
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(3000);
        console.log('[MonotaRO] loginViaCartPage: after click, URL:', this.page.url());

        if (!this.isCartPageUrl(this.page.url())) {
          console.log('[MonotaRO] loginViaCartPage: left cart page');
          return true;
        }
      }
    }

    console.log('[MonotaRO] loginViaCartPage: failed');
    await this.takeScreenshot('cart_login_failed');
    return false;
  }

  private isCartPageUrl(url: string): boolean {
    return url.includes('basket') || url.includes('showListServlet') || url.includes('/cart');
  }

  private isCompletionPage(url: string, bodyText: string): boolean {
    if (this.isCartPageUrl(url)) return false;

    const urlLower = url.toLowerCase();
    if (['complete', 'finish', 'thankyou', 'done', 'order_finish'].some(kw => urlLower.includes(kw))) {
      console.log('[MonotaRO] isCompletionPage: URL indicates completion');
      return true;
    }

    if (['ご注文完了', 'ご注文の完了', 'ご注文ありがとう', 'ご注文を承りました'].some(kw => bodyText.includes(kw))) {
      console.log('[MonotaRO] isCompletionPage: strong text indicates completion');
      return true;
    }

    if (bodyText.includes('注文番号') && (url.includes('checkout') || url.includes('order'))) {
      console.log('[MonotaRO] isCompletionPage: order number + checkout URL');
      return true;
    }

    return false;
  }

  /** Try to click intermediate buttons (次へ進む, 確認画面へ進む, etc.) */
  private async clickIntermediateButton(): Promise<boolean> {
    if (!this.page) return false;

    const selectors = [
      'button:has-text("次へ進む")', 'a:has-text("次へ進む")',
      'button:has-text("確認画面へ進む")', 'a:has-text("確認画面へ進む")',
      'button:has-text("お届け先の確認")', 'a:has-text("お届け先の確認")',
      'input[type="submit"][value*="次へ"]',
      'input[type="submit"][value*="進む"]',
      'input[type="submit"][value*="確認"]',
    ];

    for (const sel of selectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        const text = await el.textContent().catch(() => '') ?? '';
        console.log(`[MonotaRO] clickIntermediateButton: found "${text.trim()}" via ${sel}`);
        try {
          await el.click({ timeout: 5000 });
          return true;
        } catch {
          // Try force click
          try {
            await el.click({ force: true, timeout: 5000 });
            return true;
          } catch {
            continue;
          }
        }
      }
    }
    return false;
  }

  /** Click the order confirmation button (ご注文内容の確定). */
  private async clickConfirmButton(): Promise<boolean> {
    if (!this.page) return false;

    const selectors = [
      'button:has-text("ご注文内容の確定")',
      'a:has-text("ご注文内容の確定")',
      'input[type="submit"][value*="注文内容の確定"]',
      'button:has-text("注文を確定")',
      'a:has-text("注文を確定")',
      '.order-confirm-button',
    ];

    for (const sel of selectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        const text = await el.textContent().catch(() => '') ?? '';
        console.log(`[MonotaRO] clickConfirmButton: found "${text.trim()}" via ${sel}`);
        try {
          await el.click({ timeout: 5000 });
          return true;
        } catch {
          try {
            await el.click({ force: true, timeout: 5000 });
            return true;
          } catch {
            continue;
          }
        }
      }
    }
    return false;
  }

  private async dumpClickableElements(): Promise<void> {
    if (!this.page) return;
    try {
      const elements = await this.page.$$eval(
        'a, button, input[type="submit"]',
        (els: Element[]) =>
          els.map((el) => ({
            tag: el.tagName,
            text: (el as HTMLElement).innerText?.trim().slice(0, 80) || '',
            href: (el as HTMLAnchorElement).href || '',
            value: (el as HTMLInputElement).value || '',
          })),
      );
      console.log('[MonotaRO] clickable elements:');
      for (const el of elements) {
        if (el.text || el.value) {
          console.log(`  <${el.tag}> text="${el.text}" value="${el.value}" href="${el.href}"`);
        }
      }
    } catch (e) {
      console.log('[MonotaRO] dumpClickableElements failed:', (e as Error).message);
    }
  }
}
