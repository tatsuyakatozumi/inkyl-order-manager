import { BaseAutoOrder } from './base';

const MONOTARO_BASE_URL = 'https://www.monotaro.com';

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
      ignoreHTTPSErrors: true,
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

  async addSingleItemToCart(quantity: number, spec: string | null): Promise<boolean> {
    if (!this.page) return false;

    // Spec selection: find the row matching the spec text and use its cart button
    if (spec) {
      try {
        const rows = await this.page.$$('tr');
        for (const row of rows) {
          const text = await row.textContent();
          if (text?.includes(spec)) {
            const qtyInput = await row.$('input[name="p"]')
              ?? await row.$('input[name="Quantity"]')
              ?? await row.$('input[name="quantity"]');
            if (qtyInput) {
              await qtyInput.fill('');
              await qtyInput.fill(quantity.toString());
            }
            const btn = await row.$('button:has-text("バスケットに入れる")');
            if (btn) {
              await btn.click();
              await this.page.waitForLoadState('domcontentloaded');
              await this.page.waitForTimeout(3000);
              return true;
            }
          }
        }
        console.log(`[MonotaRO] Spec "${spec}" row not found, falling back to first button`);
      } catch (e) {
        console.log(`[MonotaRO] Spec selection failed, falling back:`, e);
      }
    }

    // Fallback: use first cart button (original logic)
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

}
