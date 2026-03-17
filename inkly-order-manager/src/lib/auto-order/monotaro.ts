import { BaseAutoOrder } from './base';

const MONOTARO_BASE_URL = 'https://www.monotaro.com';
const CHECKOUT_URL = `${MONOTARO_BASE_URL}/monotaroMain.py?func=monotaro.checkout.confirm.show_init_edit_servlet.ShowInitEditServlet`;

/**
 * Login submission wait time per strategy.
 * Previous value (3s) was too short for AJAX login + redirect.
 */
const LOGIN_WAIT_MS = 15000;

export class MonotaroAutoOrder extends BaseAutoOrder {
  constructor() {
    super('MonotaRO');
  }

  /** Override: use Firefox instead of Chromium to avoid Akamai HTTP/2 protocol errors. */
  async initialize(): Promise<void> {
    console.log('[MonotaRO] initialize: launching Firefox');
    const { firefox } = await import('playwright');

    this.browser = await firefox.launch({
      headless: true,
      args: [],
    });

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      locale: 'ja-JP',
      viewport: { width: 1280, height: 800 },
    });

    this.page = await context.newPage();
    this.loggedIn = false;
  }

  getTopPageUrl(): string {
    return `${MONOTARO_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${MONOTARO_BASE_URL}/monotaroMain.py?func=monotaro.basket.showListServlet.ShowListServlet`;
  }

  /**
   * Check if the user is logged in using multiple signals:
   * 1. Positive DOM indicators (logout link, user name display)
   * 2. Secondary DOM indicators (mypage + order history + no header login link)
   * 3. Session cookies + no header login link
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      // 1. Primary: positive DOM indicators
      const hasLogoutLink = await this.page.locator('a:has-text("ログアウト")').first().count() > 0;
      const hasUserInfo = await this.page.locator('.LoginUserName, .user-name, [class*="userName"]').first().count() > 0;

      if (hasLogoutLink || hasUserInfo) {
        console.log(`[MonotaRO] isLoggedIn: positive (logoutLink=${hasLogoutLink}, userInfo=${hasUserInfo})`);
        return true;
      }

      // 2. Secondary: mypage links + no login link in header
      const hasMyPage = await this.page.locator('a[href*="/mypage/"]').first().count() > 0;
      const hasOrderHistory = await this.page.locator('a:has-text("ご購入履歴")').first().count() > 0;
      const headerLoginCount = await this.page.evaluate(() => {
        const headerArea = document.querySelector('#headerArea, header, .header, .Header');
        if (!headerArea) return 0;
        let count = 0;
        for (const link of headerArea.querySelectorAll('a')) {
          if (link.textContent?.includes('ログイン') && !link.textContent?.includes('ログアウト')) count++;
        }
        return count;
      });

      if (hasMyPage && hasOrderHistory && headerLoginCount === 0) {
        console.log('[MonotaRO] isLoggedIn: secondary positive (myPage + orderHistory + no header login)');
        return true;
      }

      // 3. Tertiary: session cookie check
      const cookies = await this.page.context().cookies('https://www.monotaro.com');
      const sessionCookies = cookies.filter(c =>
        /session|sid|login|auth|user/i.test(c.name) && c.value.length > 0
      );
      console.log(`[MonotaRO] isLoggedIn: cookies total=${cookies.length}, session-like=${sessionCookies.length} [${sessionCookies.map(c => c.name).join(', ')}]`);

      if (sessionCookies.length > 0 && headerLoginCount === 0) {
        console.log('[MonotaRO] isLoggedIn: session cookie + no header login → true');
        return true;
      }

      console.log(`[MonotaRO] isLoggedIn: NOT logged in (logout=${hasLogoutLink}, userInfo=${hasUserInfo}, myPage=${hasMyPage}, orderHist=${hasOrderHistory}, headerLogin=${headerLoginCount})`);
      return false;
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

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log('[MonotaRO] login: starting');

      await this.page.goto(`${MONOTARO_BASE_URL}/login/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      console.log('[MonotaRO] login: on page, URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('login_page');

      const filled = await this.fillLoginForm(credentials);
      if (!filled) {
        console.log('[MonotaRO] login: could not fill login form');
        return false;
      }

      const submitted = await this.submitLoginForm();
      if (!submitted) {
        console.log('[MonotaRO] login: all submission strategies failed');
        await this.takeScreenshot('login_all_failed');
        return false;
      }

      // Verify: navigate to top page and check login state
      console.log('[MonotaRO] login: verifying on top page');
      await this.page.goto(this.getTopPageUrl(), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await this.page.waitForTimeout(2000);
      const loggedIn = await this.isLoggedIn();
      console.log('[MonotaRO] login: verification:', loggedIn);
      await this.takeScreenshot('login_verified');

      if (!loggedIn) {
        const pageInfo = await this.page.evaluate(() => ({
          url: location.href,
          title: document.title,
          bodySnippet: document.body.innerText.substring(0, 500),
        }));
        console.log('[MonotaRO] login: failed verification, page:', JSON.stringify(pageInfo));
      }

      return loggedIn;
    } catch (e) {
      console.log('[MonotaRO] login: EXCEPTION:', (e as Error).message);
      await this.takeScreenshot('login_exception');
      return false;
    }
  }

  /** Fill userId and password fields on the current page's login form. */
  private async fillLoginForm(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;

    const userIdSelectors = [
      'input[name="userId"]',
      'input[name="loginId"]',
      'input[id="userId"]',
      'input[type="email"]',
    ];
    const passwordSelectors = [
      'input[name="password"]',
      'input[id="password"]',
      'input[type="password"]',
    ];

    let userIdField = null;
    for (const sel of userIdSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        userIdField = el;
        console.log(`[MonotaRO] fillLoginForm: userId: ${sel}`);
        break;
      }
    }
    if (!userIdField) {
      console.log('[MonotaRO] fillLoginForm: userId NOT FOUND');
      await this.takeScreenshot('login_no_userid');
      return false;
    }

    let passwordField = null;
    for (const sel of passwordSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        passwordField = el;
        console.log(`[MonotaRO] fillLoginForm: password: ${sel}`);
        break;
      }
    }
    if (!passwordField) {
      console.log('[MonotaRO] fillLoginForm: password NOT FOUND');
      await this.takeScreenshot('login_no_password');
      return false;
    }

    await userIdField.fill(credentials.username);
    await passwordField.fill(credentials.password);
    console.log('[MonotaRO] fillLoginForm: credentials filled');
    return true;
  }

  /**
   * Submit the login form using reliable strategies.
   *
   * IMPORTANT: form.submit() is intentionally EXCLUDED.
   * It bypasses JavaScript event handlers, so the AJAX login mechanism
   * does not fire, session cookies are not set, and the URL change
   * gives a false impression of success.
   *
   * Strategies (each waits up to 15s for navigation):
   * 1. locator.click() on submit button + waitForResponse + waitForURL
   * 2. Enter key in password field + waitForResponse + waitForURL
   * 3. form.requestSubmit() (fires submit event with validation) + waitForURL
   */
  private async submitLoginForm(): Promise<boolean> {
    if (!this.page) return false;

    console.log(`[MonotaRO] submitLoginForm: URL before: ${this.page.url()}`);

    // Strategy 1: locator.click() on submit button
    console.log('[MonotaRO] submitLoginForm: strategy 1 — locator.click()');
    try {
      const loginForm = this.page.locator('form').filter({
        has: this.page.locator('input[name="password"]'),
      }).first();
      const submitBtn = loginForm.locator(
        'button[type="submit"], input[type="submit"], button'
      ).first();

      if (await submitBtn.count() > 0) {
        const btnText = await submitBtn.textContent().catch(() => '') ?? '';
        console.log(`[MonotaRO] submitLoginForm: clicking "${btnText.trim()}"`);

        // Monitor POST response while clicking
        const [response] = await Promise.all([
          this.page.waitForResponse(
            r => r.request().method() === 'POST' && r.url().includes('monotaro'),
            { timeout: LOGIN_WAIT_MS }
          ).catch(() => null),
          submitBtn.click({ timeout: 5000 }),
        ]);

        if (response) {
          console.log(`[MonotaRO] submitLoginForm: POST → ${response.status()} ${response.url()}`);
        } else {
          console.log('[MonotaRO] submitLoginForm: no POST response captured');
        }

        // Wait for URL to leave /login (AJAX response may trigger client-side redirect)
        await this.page.waitForURL(
          (url: URL) => !url.href.includes('/login'),
          { timeout: LOGIN_WAIT_MS }
        ).catch(() => {});

        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        const currentUrl = this.page.url();
        console.log(`[MonotaRO] submitLoginForm: after strategy 1, URL: ${currentUrl}`);

        if (!currentUrl.includes('/login')) {
          console.log('[MonotaRO] submitLoginForm: strategy 1 succeeded');
          return true;
        }
      } else {
        console.log('[MonotaRO] submitLoginForm: no submit button found');
      }
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 1 error:', (e as Error).message);
    }

    // Strategy 2: Enter key in password field
    console.log('[MonotaRO] submitLoginForm: strategy 2 — Enter key');
    try {
      const pwField = this.page.locator('input[name="password"], input[type="password"]').first();
      if (await pwField.count() > 0) {
        await pwField.focus();

        const [response] = await Promise.all([
          this.page.waitForResponse(
            r => r.request().method() === 'POST' && r.url().includes('monotaro'),
            { timeout: LOGIN_WAIT_MS }
          ).catch(() => null),
          this.page.keyboard.press('Enter'),
        ]);

        if (response) {
          console.log(`[MonotaRO] submitLoginForm: POST → ${response.status()} ${response.url()}`);
        } else {
          console.log('[MonotaRO] submitLoginForm: no POST response captured');
        }

        await this.page.waitForURL(
          (url: URL) => !url.href.includes('/login'),
          { timeout: LOGIN_WAIT_MS }
        ).catch(() => {});
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});

        const currentUrl = this.page.url();
        console.log(`[MonotaRO] submitLoginForm: after strategy 2, URL: ${currentUrl}`);

        if (!currentUrl.includes('/login')) {
          console.log('[MonotaRO] submitLoginForm: strategy 2 succeeded');
          return true;
        }
      }
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 2 error:', (e as Error).message);
    }

    // Strategy 3: form.requestSubmit() — fires submit event WITH validation
    // Unlike form.submit(), requestSubmit() triggers onsubmit handlers
    console.log('[MonotaRO] submitLoginForm: strategy 3 — requestSubmit()');
    try {
      await this.page.evaluate(() => {
        const pw = document.querySelector('input[name="password"]');
        const form = pw?.closest('form');
        if (form) form.requestSubmit();
      });

      await this.page.waitForURL(
        (url: URL) => !url.href.includes('/login'),
        { timeout: LOGIN_WAIT_MS }
      ).catch(() => {});
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});

      const currentUrl = this.page.url();
      console.log(`[MonotaRO] submitLoginForm: after strategy 3, URL: ${currentUrl}`);

      if (!currentUrl.includes('/login')) {
        console.log('[MonotaRO] submitLoginForm: strategy 3 succeeded');
        return true;
      }
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 3 error:', (e as Error).message);
    }

    // All strategies exhausted — do NOT fall back to form.submit()
    console.log('[MonotaRO] submitLoginForm: ALL strategies failed. URL:', this.page.url());
    await this.dumpFormStructure();
    await this.takeScreenshot('login_submit_all_failed');
    return false;
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
        // Navigate to checkout again after successful login
        await this.page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log('[MonotaRO] checkout: after re-login nav, URL:', this.page.url());
        await this.takeScreenshot('checkout_after_relogin');
      }

      // If on cart page (session lost or embedded login form), try cart page login
      if (this.isCartPageUrl(this.page.url())) {
        console.log('[MonotaRO] checkout: on cart page, trying embedded login');
        if (!this.credentials) {
          console.log('[MonotaRO] checkout: no credentials');
          return false;
        }
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

  /**
   * Login via the cart page's embedded login form.
   * The cart page may have userId/password fields + a submit button
   * that performs login and proceeds to checkout.
   *
   * Uses the same reliable strategies as submitLoginForm (NO form.submit()).
   */
  private async loginViaCartPage(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;

    console.log('[MonotaRO] loginViaCartPage: filling form');
    const filled = await this.fillLoginForm(credentials);
    if (!filled) return false;

    // Strategy 1: Click submit button + wait for navigation
    console.log('[MonotaRO] loginViaCartPage: strategy 1 — button click');
    try {
      const submitBtn = this.page.locator(
        'button[type="submit"], input[type="submit"], button:has-text("レジへ進む"), button:has-text("ログイン")'
      ).first();

      if (await submitBtn.count() > 0) {
        const [response] = await Promise.all([
          this.page.waitForResponse(
            r => r.request().method() === 'POST' && r.url().includes('monotaro'),
            { timeout: LOGIN_WAIT_MS }
          ).catch(() => null),
          submitBtn.click({ timeout: 5000 }),
        ]);

        if (response) console.log(`[MonotaRO] loginViaCartPage: POST → ${response.status()}`);

        await this.page.waitForURL(
          (url: URL) => !this.isCartPageUrl(url.href),
          { timeout: LOGIN_WAIT_MS }
        ).catch(() => {});
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});

        if (!this.isCartPageUrl(this.page.url())) {
          console.log('[MonotaRO] loginViaCartPage: left cart →', this.page.url());
          return true;
        }
      }
    } catch (e) {
      console.log('[MonotaRO] loginViaCartPage: strategy 1 error:', (e as Error).message);
    }

    // Strategy 2: Enter key
    console.log('[MonotaRO] loginViaCartPage: strategy 2 — Enter key');
    try {
      const pwField = this.page.locator('input[name="password"], input[type="password"]').first();
      if (await pwField.count() > 0) {
        await pwField.focus();
        await this.page.keyboard.press('Enter');

        await this.page.waitForURL(
          (url: URL) => !this.isCartPageUrl(url.href),
          { timeout: LOGIN_WAIT_MS }
        ).catch(() => {});
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});

        if (!this.isCartPageUrl(this.page.url())) {
          console.log('[MonotaRO] loginViaCartPage: left cart →', this.page.url());
          return true;
        }
      }
    } catch (e) {
      console.log('[MonotaRO] loginViaCartPage: strategy 2 error:', (e as Error).message);
    }

    // Strategy 3: requestSubmit() (NO form.submit())
    console.log('[MonotaRO] loginViaCartPage: strategy 3 — requestSubmit()');
    try {
      await this.page.evaluate(() => {
        const pw = document.querySelector('input[name="password"]');
        const form = pw?.closest('form');
        if (form) form.requestSubmit();
      });

      await this.page.waitForURL(
        (url: URL) => !this.isCartPageUrl(url.href),
        { timeout: LOGIN_WAIT_MS }
      ).catch(() => {});
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});

      if (!this.isCartPageUrl(this.page.url())) {
        console.log('[MonotaRO] loginViaCartPage: left cart →', this.page.url());
        return true;
      }
    } catch (e) {
      console.log('[MonotaRO] loginViaCartPage: strategy 3 error:', (e as Error).message);
    }

    console.log('[MonotaRO] loginViaCartPage: all strategies failed');
    await this.takeScreenshot('cart_login_all_failed');
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

    if (['ご注文完了', 'ご注文ありがとう', 'ご注文を承りました'].some(kw => bodyText.includes(kw))) {
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
        const clicked = await this.clickWithMultipleStrategies(el, `intermediate(${sel})`);
        if (clicked) return true;
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
        const clicked = await this.clickWithMultipleStrategies(el, `confirm(${sel})`);
        if (clicked) return true;
      }
    }
    return false;
  }

  /**
   * Click an element using multiple strategies.
   * locator.click → DOM .click() → mouse.click at coordinates → force click
   */
  private async clickWithMultipleStrategies(locator: import('playwright').Locator, label: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await locator.click({ timeout: 5000 });
      console.log(`[MonotaRO] clickMulti(${label}): locator.click succeeded`);
      return true;
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): locator.click failed: ${(e as Error).message}`);
    }

    try {
      await locator.evaluate((el: HTMLElement) => el.click());
      console.log(`[MonotaRO] clickMulti(${label}): element.click() succeeded`);
      return true;
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): element.click() failed: ${(e as Error).message}`);
    }

    try {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await this.page.waitForTimeout(300);
      const box = await locator.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await this.page.mouse.click(x, y);
        console.log(`[MonotaRO] clickMulti(${label}): mouse.click at (${x}, ${y})`);
        return true;
      }
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): mouse.click failed: ${(e as Error).message}`);
    }

    try {
      await locator.click({ force: true, timeout: 5000 });
      console.log(`[MonotaRO] clickMulti(${label}): force-click succeeded`);
      return true;
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): force-click failed: ${(e as Error).message}`);
    }

    return false;
  }

  private async dumpFormStructure(): Promise<void> {
    if (!this.page) return;
    try {
      const forms = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('form')).map((f, i) => ({
          index: i,
          action: f.action,
          method: f.method,
          id: f.id,
          inputs: Array.from(f.querySelectorAll('input, button')).map(el => ({
            tag: el.tagName,
            name: el.getAttribute('name'),
            type: el.getAttribute('type'),
            text: (el.textContent || '').trim().substring(0, 40),
          })),
        }));
      });
      console.log('[MonotaRO] forms:', JSON.stringify(forms, null, 2));
    } catch (e) {
      console.log('[MonotaRO] dumpFormStructure failed:', (e as Error).message);
    }
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
