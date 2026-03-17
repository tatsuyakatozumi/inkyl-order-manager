import { BaseAutoOrder } from './base';

const MONOTARO_BASE_URL = 'https://www.monotaro.com';
const CHECKOUT_URL = `${MONOTARO_BASE_URL}/monotaroMain.py?func=monotaro.checkout.confirm.show_init_edit_servlet.ShowInitEditServlet`;

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

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const hasLogoutLink = await this.page.locator('a:has-text("ログアウト")').first().count() > 0;
      const hasUserInfo = await this.page.locator('.LoginUserName, .user-name, [class*="userName"]').first().count() > 0;

      // Require a POSITIVE indicator of login (logout link or user info)
      // Absence of login link alone is unreliable (some pages just don't show it)
      const isLoggedIn = hasLogoutLink || hasUserInfo;
      console.log(`[MonotaRO] isLoggedIn: logoutLink=${hasLogoutLink}, userInfo=${hasUserInfo} → ${isLoggedIn}`);

      if (!isLoggedIn) {
        // Secondary check: look for account-related elements
        const hasMyPage = await this.page.locator('a[href*="/mypage/"]').first().count() > 0;
        const hasOrderHistory = await this.page.locator('a:has-text("ご購入履歴")').first().count() > 0;
        // Check if login link is ABSENT from header area (not cart page login section)
        const headerLoginCount = await this.page.evaluate(() => {
          const headerArea = document.querySelector('#headerArea, header, .header, .Header');
          if (!headerArea) return 0;
          const links = headerArea.querySelectorAll('a');
          let count = 0;
          for (const link of links) {
            if (link.textContent?.includes('ログイン') && !link.textContent?.includes('ログアウト')) {
              count++;
            }
          }
          return count;
        });
        const secondaryLoggedIn = hasMyPage && hasOrderHistory && headerLoginCount === 0;
        console.log(`[MonotaRO] isLoggedIn secondary: myPage=${hasMyPage}, orderHistory=${hasOrderHistory}, headerLoginCount=${headerLoginCount} → ${secondaryLoggedIn}`);
        return secondaryLoggedIn;
      }

      return true;
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

      // Navigate to login page
      await this.page.goto(`${MONOTARO_BASE_URL}/login/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      console.log('[MonotaRO] login: URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('login_page');

      // Fill credentials
      const filled = await this.fillLoginForm(credentials);
      if (!filled) {
        console.log('[MonotaRO] login: could not fill login form');
        return false;
      }

      // Try multiple submission strategies until we leave the login page
      const submitted = await this.submitLoginForm();
      if (!submitted) {
        console.log('[MonotaRO] login: all submission strategies failed');
        await this.takeScreenshot('login_all_failed');
        return false;
      }

      // Verify login by navigating to top page and checking
      console.log('[MonotaRO] login: verifying login on top page');
      await this.page.goto(this.getTopPageUrl(), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await this.page.waitForTimeout(2000);
      const loggedIn = await this.isLoggedIn();
      console.log('[MonotaRO] login: verified login:', loggedIn);
      await this.takeScreenshot('login_verified');

      if (!loggedIn) {
        // Dump page state for debugging
        const pageInfo = await this.page.evaluate(() => ({
          url: location.href,
          title: document.title,
          bodyTextSnippet: document.body.innerText.substring(0, 500),
        }));
        console.log('[MonotaRO] login: page info after failed verification:', JSON.stringify(pageInfo));
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
        console.log(`[MonotaRO] fillLoginForm: found userId: ${sel}`);
        break;
      }
    }
    if (!userIdField) {
      console.log('[MonotaRO] fillLoginForm: userId field NOT FOUND');
      await this.takeScreenshot('login_no_userid');
      return false;
    }

    let passwordField = null;
    for (const sel of passwordSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        passwordField = el;
        console.log(`[MonotaRO] fillLoginForm: found password: ${sel}`);
        break;
      }
    }
    if (!passwordField) {
      console.log('[MonotaRO] fillLoginForm: password field NOT FOUND');
      await this.takeScreenshot('login_no_password');
      return false;
    }

    await userIdField.fill(credentials.username);
    await passwordField.fill(credentials.password);
    console.log('[MonotaRO] fillLoginForm: credentials filled');
    return true;
  }

  /**
   * Try multiple strategies to submit the login form.
   * Returns true if we navigated away from the login page.
   */
  private async submitLoginForm(): Promise<boolean> {
    if (!this.page) return false;

    const isOnLoginPage = () => {
      return this.page!.url().includes('/login');
    };

    // Strategy 1: Press Enter in the password field
    // This is the most natural form submission trigger
    console.log('[MonotaRO] submitLoginForm: strategy 1 - Enter key');
    try {
      const pwField = this.page.locator('input[name="password"], input[type="password"]').first();
      if (await pwField.count() > 0) {
        await pwField.focus();
        await this.page.keyboard.press('Enter');
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(3000);
        console.log('[MonotaRO] submitLoginForm: after Enter, URL:', this.page.url());
        if (!isOnLoginPage()) return true;
      }
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 1 failed:', (e as Error).message);
    }

    // Strategy 2: Playwright's locator.click() on submit button
    // Dispatches proper event sequence (mousedown → mouseup → click)
    console.log('[MonotaRO] submitLoginForm: strategy 2 - locator.click()');
    try {
      const loginForm = this.page.locator('form').filter({ has: this.page.locator('input[name="password"]') }).first();
      const submitBtn = loginForm.locator('button[type="submit"], input[type="submit"], button').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click({ timeout: 5000 });
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(3000);
        console.log('[MonotaRO] submitLoginForm: after locator.click, URL:', this.page.url());
        if (!isOnLoginPage()) return true;
      }
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 2 failed:', (e as Error).message);
    }

    // Strategy 3: DOM element.click() via evaluate
    // Triggers click event from JavaScript context
    console.log('[MonotaRO] submitLoginForm: strategy 3 - element.click()');
    try {
      await this.page.evaluate(() => {
        const pwField = document.querySelector('input[name="password"]') as HTMLInputElement;
        const form = pwField?.closest('form');
        if (form) {
          const btn = form.querySelector('button[type="submit"]') || form.querySelector('button') || form.querySelector('input[type="submit"]');
          if (btn) (btn as HTMLElement).click();
        }
      });
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] submitLoginForm: after element.click, URL:', this.page.url());
      if (!isOnLoginPage()) return true;
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 3 failed:', (e as Error).message);
    }

    // Strategy 4: form.requestSubmit() - triggers submit event with validation
    console.log('[MonotaRO] submitLoginForm: strategy 4 - requestSubmit()');
    try {
      await this.page.evaluate(() => {
        const pwField = document.querySelector('input[name="password"]');
        const form = pwField?.closest('form');
        if (form) form.requestSubmit();
      });
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] submitLoginForm: after requestSubmit, URL:', this.page.url());
      if (!isOnLoginPage()) return true;
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 4 failed:', (e as Error).message);
    }

    // Strategy 5: form.submit() - raw form submission (last resort, bypasses JS handlers)
    console.log('[MonotaRO] submitLoginForm: strategy 5 - form.submit()');
    try {
      const result = await this.page.evaluate(() => {
        const pwField = document.querySelector('input[name="password"]');
        const form = pwField?.closest('form');
        if (form) {
          form.submit();
          return { action: form.action, method: form.method };
        }
        return null;
      });
      console.log('[MonotaRO] submitLoginForm: form.submit() info:', JSON.stringify(result));
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] submitLoginForm: after form.submit, URL:', this.page.url());
      if (!isOnLoginPage()) return true;
    } catch (e) {
      console.log('[MonotaRO] submitLoginForm: strategy 5 failed:', (e as Error).message);
    }

    console.log('[MonotaRO] submitLoginForm: ALL strategies failed, still on:', this.page.url());
    await this.dumpFormStructure();
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

    // Find the quantity input in the same row (<tr> or <form>)
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
      console.log('[MonotaRO] checkout: Step 1 - verifying cart');
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_cart');
      console.log('[MonotaRO] checkout: cart URL:', this.page.url());

      const cartInfo = await this.page.evaluate(() => {
        const body = document.body.innerText;
        return {
          hasItems: body.includes('バスケットの内容') && !body.includes('バスケットに商品がありません'),
          isLoggedIn: !document.querySelector('#headerArea a[href*="/login/"]'),
        };
      });
      console.log('[MonotaRO] checkout: cart info:', JSON.stringify(cartInfo));

      if (!cartInfo.hasItems) {
        console.log('[MonotaRO] checkout: cart is empty, aborting');
        return false;
      }

      // Step 2: Navigate directly to checkout URL
      // This is more reliable than clicking "レジへ進む" which may not work in headless mode
      console.log('[MonotaRO] checkout: Step 2 - navigating directly to checkout URL');
      await this.page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] checkout: after direct navigation, URL:', this.page.url());
      await this.takeScreenshot('checkout_direct_nav');

      // If redirected to login page, log in and retry
      if (this.page.url().includes('/login')) {
        console.log('[MonotaRO] checkout: redirected to login, logging in');
        if (this.credentials) {
          const filled = await this.fillLoginForm(this.credentials);
          if (filled) {
            const submitted = await this.submitLoginForm();
            if (submitted) {
              console.log('[MonotaRO] checkout: login submitted, navigating to checkout again');
              await this.page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await this.page.waitForTimeout(3000);
              console.log('[MonotaRO] checkout: after re-login, URL:', this.page.url());
              await this.takeScreenshot('checkout_after_relogin');
            }
          }
        }
      }

      // If still on cart page with login form, try submitting the cart page's login form
      if (this.isCartPageUrl(this.page.url())) {
        console.log('[MonotaRO] checkout: still on cart page, trying cart page login form');
        if (this.credentials) {
          const cartLoginResult = await this.loginViaCartPage(this.credentials);
          if (!cartLoginResult) {
            console.log('[MonotaRO] checkout: cart page login failed');
            await this.takeScreenshot('checkout_cart_login_failed');
            return false;
          }
        }
      }

      // Step 3: Navigate through intermediate pages
      console.log('[MonotaRO] checkout: Step 3 - handling intermediate pages');
      const MAX_PAGES = 5;
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = this.page.url();
        const bodyText = await this.page.textContent('body') ?? '';
        console.log(`[MonotaRO] checkout: page ${i + 1}, URL: ${url}`);

        // Guard: if on cart page, something went wrong
        if (this.isCartPageUrl(url)) {
          console.log('[MonotaRO] checkout: unexpectedly on cart page, aborting');
          await this.dumpClickableElements();
          await this.takeScreenshot('checkout_stuck_on_cart');
          return false;
        }

        // Check if on final confirmation page
        if (bodyText.includes('ご注文内容の確定') || bodyText.includes('まだご注文は確定していません')) {
          console.log('[MonotaRO] checkout: reached order confirmation page');
          break;
        }

        // Check if already completed
        if (this.isCompletionPage(url, bodyText)) {
          console.log('[MonotaRO] checkout: order already completed');
          await this.takeScreenshot('checkout_complete');
          return true;
        }

        // Try to find and click intermediate buttons
        const clicked = await this.clickIntermediateButton();
        if (!clicked) {
          console.log('[MonotaRO] checkout: no intermediate button found');
          break;
        }
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(3000);
        await this.takeScreenshot(`checkout_intermediate_${i}`);
      }

      // Step 4: Click order confirmation button
      console.log('[MonotaRO] checkout: Step 4 - confirming order');
      await this.takeScreenshot('checkout_before_confirm');

      const confirmed = await this.clickConfirmButton();
      if (!confirmed) {
        console.log('[MonotaRO] checkout: confirmation button not found or click failed');
        await this.dumpClickableElements();
        await this.takeScreenshot('checkout_no_confirm_button');
        return false;
      }

      // Step 5: Wait and check completion
      console.log('[MonotaRO] checkout: Step 5 - checking completion');
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(10000);

      const finalUrl = this.page.url();
      const finalText = await this.page.textContent('body') ?? '';
      console.log('[MonotaRO] checkout: final URL:', finalUrl);
      await this.takeScreenshot('checkout_final');

      const isComplete = this.isCompletionPage(finalUrl, finalText);
      console.log('[MonotaRO] checkout: order complete:', isComplete);

      const orderMatch = finalText.match(/注文番号[：:\s]*([A-Z0-9-]+)/);
      if (orderMatch) {
        console.log('[MonotaRO] checkout: order number:', orderMatch[1]);
      }

      return isComplete;
    } catch (e) {
      console.error('[MonotaRO] checkout: error:', e);
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }

  /**
   * Login via the cart page's embedded login form.
   * The cart page has userId/password fields and a "レジへ進む" button
   * that functions as login + proceed to checkout.
   */
  private async loginViaCartPage(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;

    console.log('[MonotaRO] loginViaCartPage: filling login form on cart page');
    const filled = await this.fillLoginForm(credentials);
    if (!filled) return false;

    // The cart page form submission should log in AND proceed to checkout
    // Try Enter key first, then form.requestSubmit(), then form.submit()
    const strategies = [
      {
        name: 'Enter key',
        fn: async () => {
          const pwField = this.page!.locator('input[name="password"], input[type="password"]').first();
          if (await pwField.count() > 0) {
            await pwField.focus();
            await this.page!.keyboard.press('Enter');
          }
        },
      },
      {
        name: 'requestSubmit',
        fn: async () => {
          await this.page!.evaluate(() => {
            const pw = document.querySelector('input[name="password"]');
            const form = pw?.closest('form');
            if (form) form.requestSubmit();
          });
        },
      },
      {
        name: 'form.submit',
        fn: async () => {
          await this.page!.evaluate(() => {
            const pw = document.querySelector('input[name="password"]');
            const form = pw?.closest('form');
            if (form) form.submit();
          });
        },
      },
    ];

    for (const strategy of strategies) {
      console.log(`[MonotaRO] loginViaCartPage: trying ${strategy.name}`);
      try {
        await strategy.fn();
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(3000);
        console.log(`[MonotaRO] loginViaCartPage: after ${strategy.name}, URL:`, this.page.url());

        if (!this.isCartPageUrl(this.page.url())) {
          console.log(`[MonotaRO] loginViaCartPage: ${strategy.name} succeeded, left cart page`);
          await this.takeScreenshot('cart_login_success');
          return true;
        }
      } catch (e) {
        console.log(`[MonotaRO] loginViaCartPage: ${strategy.name} failed:`, (e as Error).message);
      }
    }

    console.log('[MonotaRO] loginViaCartPage: all strategies failed');
    await this.takeScreenshot('cart_login_all_failed');
    return false;
  }

  /** Check if URL is the cart page. */
  private isCartPageUrl(url: string): boolean {
    return url.includes('basket') || url.includes('showListServlet') || url.includes('/cart');
  }

  /** Check if the current page indicates order completion. */
  private isCompletionPage(url: string, bodyText: string): boolean {
    if (this.isCartPageUrl(url)) {
      console.log('[MonotaRO] isCompletionPage: still on cart page, NOT complete');
      return false;
    }

    const urlLower = url.toLowerCase();
    if (['complete', 'finish', 'thankyou', 'done', 'order_finish'].some(kw => urlLower.includes(kw))) {
      console.log('[MonotaRO] isCompletionPage: URL indicates completion');
      return true;
    }

    if (['ご注文完了', 'ご注文ありがとう', 'ご注文を承りました'].some(kw => bodyText.includes(kw))) {
      console.log('[MonotaRO] isCompletionPage: strong text indicates completion');
      return true;
    }

    // "注文番号" alone is too generic (appears on cart pages)
    if (bodyText.includes('注文番号') && (url.includes('checkout') || url.includes('order'))) {
      console.log('[MonotaRO] isCompletionPage: order number + checkout URL');
      return true;
    }

    console.log('[MonotaRO] isCompletionPage: no completion indicators');
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
   * Click an element using multiple strategies to maximize reliability.
   * Tries: locator.click → DOM .click() → mouse.click at coordinates
   */
  private async clickWithMultipleStrategies(locator: import('playwright').Locator, label: string): Promise<boolean> {
    if (!this.page) return false;

    // Strategy 1: Playwright's locator.click() - proper event dispatch
    try {
      await locator.click({ timeout: 5000 });
      console.log(`[MonotaRO] clickMulti(${label}): locator.click succeeded`);
      return true;
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): locator.click failed: ${(e as Error).message}`);
    }

    // Strategy 2: DOM element.click() via evaluate
    try {
      await locator.evaluate((el: HTMLElement) => el.click());
      console.log(`[MonotaRO] clickMulti(${label}): element.click() succeeded`);
      return true;
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): element.click() failed: ${(e as Error).message}`);
    }

    // Strategy 3: Coordinate-based mouse.click (scrollIntoView → boundingBox)
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

    // Strategy 4: Force click
    try {
      await locator.click({ force: true, timeout: 5000 });
      console.log(`[MonotaRO] clickMulti(${label}): force-click succeeded`);
      return true;
    } catch (e) {
      console.log(`[MonotaRO] clickMulti(${label}): force-click failed: ${(e as Error).message}`);
    }

    return false;
  }

  /** Dump form structure for debugging. */
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

  /** Dump all clickable elements for debugging. */
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
