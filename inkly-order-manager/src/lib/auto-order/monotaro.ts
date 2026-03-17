import { BaseAutoOrder } from './base';

const MONOTARO_BASE_URL = 'https://www.monotaro.com';

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
    // Not-logged-in users see a "ログイン" button/link in the header.
    // If "ログイン" link exists, user is NOT logged in.
    const loginButton = await this.page.$('a[href*="/login/"]:has-text("ログイン")');
    if (loginButton) {
      console.log('[MonotaRO] isLoggedIn: found login button → not logged in');
      return false;
    }
    // Double-check: logged-in users see their name or "ログアウト" link
    const logoutLink = await this.page.$('a:has-text("ログアウト")');
    const userName = await this.page.$('.LoginUserName, .user-name, [class*="userName"]');
    const isLoggedIn = logoutLink !== null || userName !== null;
    console.log('[MonotaRO] isLoggedIn: logoutLink=', !!logoutLink, 'userName=', !!userName, '→', isLoggedIn);
    return isLoggedIn;
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    // Click the "ログイン" link/button in the header
    const loginLink = await this.page.$('a[href*="/login/"]');
    if (loginLink) {
      await loginLink.click();
      await this.page.waitForLoadState('domcontentloaded');
    } else {
      await this.page.goto(`${MONOTARO_BASE_URL}/login/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.fill('input[name="userId"]', credentials.username);
      await this.page.fill('input[name="password"]', credentials.password);
      await this.page.click('button:has-text("ログイン")');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);

      return await this.isLoggedIn();
    } catch {
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async addSingleItemToCart(quantity: number): Promise<boolean> {
    if (!this.page) return false;

    // MonotaRO product pages:
    //  - Variation table: each row has input[name="p"] + "バスケットに入れる" button
    //  - Single product: one quantity input + one button
    // Strategy: find the first "バスケットに入れる" button, find the quantity input
    // in the same row, fill it, then click the button.

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
      // Step 1: Navigate to actual cart page
      const cartUrl = this.getCartUrl();
      console.log('[MonotaRO] checkout: Step 1 - navigating to cart page:', cartUrl);
      await this.page.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] checkout: current URL:', this.page.url());
      await this.takeScreenshot('checkout_cart');

      // Step 2: Click "レジへ進む"
      console.log('[MonotaRO] checkout: Step 2 - looking for "レジへ進む" button');
      let checkoutButton = await this.page.$('a:has-text("レジへ進む")')
        ?? await this.page.$('button:has-text("レジへ進む")');
      if (!checkoutButton) {
        // Fallback: use locator text match
        console.log('[MonotaRO] checkout: trying locator fallback for "レジへ進む"');
        const locator = this.page.locator('text=レジへ進む').first();
        if (await locator.count() > 0) {
          const text = await locator.textContent();
          console.log('[MonotaRO] checkout: found via locator, text:', text?.trim());
          await this.page.waitForTimeout(3000);
          await locator.click();
          console.log('[MonotaRO] checkout: clicked "レジへ進む" via locator');
        } else {
          console.log('[MonotaRO] checkout: "レジへ進む" not found at all, dumping clickable elements');
          await this.dumpClickableElements();
          await this.takeScreenshot('checkout_no_button');
          return false;
        }
      } else {
        const btnText = await checkoutButton.textContent();
        console.log('[MonotaRO] checkout: found button, text:', btnText?.trim());
        await this.page.waitForTimeout(3000);
        await checkoutButton.click();
        console.log('[MonotaRO] checkout: clicked "レジへ進む"');
      }

      // Wait for order confirmation page (URL contains checkout.confirm)
      try {
        await this.page.waitForURL('**/checkout.confirm**', { timeout: 30000 });
      } catch {
        await this.page.waitForLoadState('domcontentloaded');
      }
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] checkout: Step 3 - on order confirmation page, URL:', this.page.url());

      // Verify we're on the confirmation page
      const bodyText = await this.page.textContent('body') ?? '';
      if (bodyText.includes('まだご注文は確定していません')) {
        console.log('[MonotaRO] checkout: confirmed on pre-confirmation page ("まだご注文は確定していません" found)');
      }
      await this.takeScreenshot('checkout_confirm');

      // Step 4: Click "ご注文内容の確定"
      console.log('[MonotaRO] checkout: Step 4 - looking for "ご注文内容の確定" button');
      let orderButton = await this.page.$('button:has-text("ご注文内容の確定")')
        ?? await this.page.$('a:has-text("ご注文内容の確定")')
        ?? await this.page.$('input[type="submit"][value*="注文内容の確定"]')
        ?? await this.page.$('.order-confirm-button');
      if (!orderButton) {
        // Fallback: use locator text match
        console.log('[MonotaRO] checkout: trying locator fallback for "注文内容の確定"');
        const locator = this.page.locator('text=注文内容の確定').first();
        if (await locator.count() > 0) {
          const text = await locator.textContent();
          console.log('[MonotaRO] checkout: found via locator, text:', text?.trim());
          await this.page.waitForTimeout(3000);
          await locator.click();
          console.log('[MonotaRO] checkout: clicked "ご注文内容の確定" via locator');
        } else {
          console.log('[MonotaRO] checkout: "ご注文内容の確定" not found at all, dumping clickable elements');
          await this.dumpClickableElements();
          await this.takeScreenshot('checkout_no_order_button');
          return false;
        }
      } else {
        const btnText = await orderButton.textContent();
        console.log('[MonotaRO] checkout: found button, text:', btnText?.trim());
        await this.page.waitForTimeout(3000);
        await orderButton.click();
        console.log('[MonotaRO] checkout: clicked "ご注文内容の確定"');
      }
      await this.page.waitForLoadState('domcontentloaded');

      // Step 5: Wait for post-confirmation navigation (may redirect to payment provider)
      console.log('[MonotaRO] checkout: Step 5 - waiting for post-confirmation (10s)');
      await this.page.waitForTimeout(10000);

      const finalUrl = this.page.url();
      console.log('[MonotaRO] checkout: final URL:', finalUrl);
      await this.takeScreenshot('checkout_complete');

      const completionText = await this.page.textContent('body') ?? '';

      // Check 1: URL contains completion-related keywords
      const urlLower = finalUrl.toLowerCase();
      const urlIndicatesComplete = ['complete', 'finish', 'thankyou', 'done'].some(
        (kw) => urlLower.includes(kw),
      );
      if (urlIndicatesComplete) {
        console.log('[MonotaRO] checkout: URL indicates completion');
      }

      // Check 2: Page text contains completion keywords
      const textIndicatesComplete = ['ご注文完了', 'ご注文ありがとう', '注文番号', 'ご注文を承りました'].some(
        (kw) => completionText.includes(kw),
      );
      if (textIndicatesComplete) {
        console.log('[MonotaRO] checkout: page text indicates completion');
      }

      // Check 3: URL changed from confirmation page (confirm button was accepted)
      const urlChangedFromConfirm = !finalUrl.includes('checkout.confirm');
      if (urlChangedFromConfirm) {
        console.log('[MonotaRO] checkout: URL changed from confirmation page → order likely submitted');
      }

      const isComplete = urlIndicatesComplete || textIndicatesComplete || urlChangedFromConfirm;
      console.log('[MonotaRO] checkout: order complete:', isComplete,
        '(url:', urlIndicatesComplete, 'text:', textIndicatesComplete, 'urlChanged:', urlChangedFromConfirm, ')');

      // Step 6: Try to extract order number
      const orderNumberMatch = completionText.match(/注文番号[：:\s]*([A-Z0-9-]+)/);
      if (orderNumberMatch) {
        console.log('[MonotaRO] checkout: order number:', orderNumberMatch[1]);
      }

      return isComplete;
    } catch (e) {
      console.error('[MonotaRO] checkout: error:', e);
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }

  /** Dump all clickable elements' text for debugging when a selector fails. */
  private async dumpClickableElements(): Promise<void> {
    if (!this.page) return;
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
    console.log('[MonotaRO] clickable elements on page:');
    for (const el of elements) {
      if (el.text || el.value) {
        console.log(`  <${el.tag}> text="${el.text}" value="${el.value}" href="${el.href}"`);
      }
    }
  }
}
