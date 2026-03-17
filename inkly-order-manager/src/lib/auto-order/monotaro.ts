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
    try {
      const hasLoginLink = await this.page.locator('a:has-text("ログイン")').first().count() > 0;
      const hasLogoutLink = await this.page.locator('a:has-text("ログアウト")').first().count() > 0;
      const hasUserInfo = await this.page.locator('.LoginUserName, .user-name, [class*="userName"]').first().count() > 0;

      const isLoggedIn = !hasLoginLink || hasLogoutLink || hasUserInfo;
      console.log(`[MonotaRO] isLoggedIn: loginLink=${hasLoginLink}, logoutLink=${hasLogoutLink}, userInfo=${hasUserInfo} → ${isLoggedIn}`);
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

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log('[MonotaRO] login: starting');
      console.log('[MonotaRO] login: current URL:', this.page.url());
      console.log('[MonotaRO] login: username length:', credentials.username?.length || 0);
      console.log('[MonotaRO] login: password length:', credentials.password?.length || 0);

      // Navigate to login page directly
      await this.page.goto(`${MONOTARO_BASE_URL}/login/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      console.log('[MonotaRO] login: navigated to login page, URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('login_page');

      // Find userId field
      const userIdSelectors = [
        'input[name="userId"]',
        'input[name="loginId"]',
        'input[id="userId"]',
        'input[id="loginId"]',
        'input[type="email"]',
        'input[type="text"][autocomplete="username"]',
      ];

      let userIdField = null;
      for (const selector of userIdSelectors) {
        const el = this.page.locator(selector).first();
        if (await el.count() > 0) {
          userIdField = el;
          console.log(`[MonotaRO] login: found userId field: ${selector}`);
          break;
        }
      }

      if (!userIdField) {
        console.log('[MonotaRO] login: userId field NOT FOUND');
        const inputs = await this.page.evaluate(() => {
          return Array.from(document.querySelectorAll('input')).map(el => ({
            name: el.getAttribute('name'),
            id: el.id,
            type: el.type,
            placeholder: el.placeholder,
            visible: (el as HTMLElement).offsetParent !== null,
          }));
        });
        console.log('[MonotaRO] login: page inputs:', JSON.stringify(inputs));
        await this.takeScreenshot('login_no_userid_field');
        return false;
      }

      await userIdField.fill(credentials.username);
      console.log('[MonotaRO] login: filled userId');

      // Find password field
      const passwordSelectors = [
        'input[name="password"]',
        'input[id="password"]',
        'input[type="password"]',
      ];

      let passwordField = null;
      for (const selector of passwordSelectors) {
        const el = this.page.locator(selector).first();
        if (await el.count() > 0) {
          passwordField = el;
          console.log(`[MonotaRO] login: found password field: ${selector}`);
          break;
        }
      }

      if (!passwordField) {
        console.log('[MonotaRO] login: password field NOT FOUND');
        await this.takeScreenshot('login_no_password_field');
        return false;
      }

      await passwordField.fill(credentials.password);
      console.log('[MonotaRO] login: filled password');

      // Find and click login button
      const loginButtonSelectors = [
        'button:has-text("ログイン")',
        'input[type="submit"][value="ログイン"]',
        'button[type="submit"]',
        '#loginButton',
        '.login-button',
      ];

      let loginClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          const el = this.page.locator(selector).first();
          if (await el.count() > 0) {
            await el.click({ force: true, timeout: 5000 });
            loginClicked = true;
            console.log(`[MonotaRO] login: clicked login button: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`[MonotaRO] login: ${selector} click failed: ${(e as Error).message}`);
        }
      }

      if (!loginClicked) {
        // Form submit fallback
        try {
          await this.page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) form.submit();
          });
          loginClicked = true;
          console.log('[MonotaRO] login: submitted form via JS');
        } catch (e) {
          console.log('[MonotaRO] login: form submit failed:', (e as Error).message);
        }
      }

      if (!loginClicked) {
        console.log('[MonotaRO] login: could not click login button');
        await this.takeScreenshot('login_no_button');
        return false;
      }

      // Wait for page transition
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] login: after submit, URL:', this.page.url());
      await this.takeScreenshot('login_after_submit');

      // Check login result
      const loggedIn = await this.isLoggedIn();
      console.log('[MonotaRO] login: isLoggedIn result:', loggedIn);

      if (!loggedIn) {
        const errorText = await this.page.evaluate(() => {
          const errorEls = document.querySelectorAll('.error, .alert, .login-error, [class*="error"], [class*="alert"]');
          return Array.from(errorEls).map(el => (el.textContent || '').trim()).filter(t => t.length > 0);
        });
        if (errorText.length > 0) {
          console.log('[MonotaRO] login: error messages:', JSON.stringify(errorText));
        }
      }

      return loggedIn;
    } catch (e) {
      console.log('[MonotaRO] login: EXCEPTION:', (e as Error).message);
      console.log('[MonotaRO] login: stack:', (e as Error).stack);
      await this.takeScreenshot('login_exception');
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

      // Wait for page transition
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] checkout: after レジへ進む, URL:', this.page.url());
      await this.takeScreenshot('checkout_after_proceed');

      // Check if login form appeared instead of checkout page
      const hasLoginForm = await this.page.evaluate(() => {
        const bodyText = document.body.innerText;
        return (bodyText.includes('ユーザーID') || bodyText.includes('ログイン'))
          && bodyText.includes('パスワード')
          && !bodyText.includes('ご注文内容の確定');
      });

      if (hasLoginForm && this.credentials) {
        console.log('[MonotaRO] checkout: login form detected, attempting inline login');
        await this.takeScreenshot('checkout_inline_login');

        const userIdField = this.page.locator('input[name="userId"], input[name="loginId"], input[type="text"]').first();
        if (await userIdField.count() > 0) {
          await userIdField.fill(this.credentials.username);
          const pwField = this.page.locator('input[type="password"]').first();
          if (await pwField.count() > 0) {
            await pwField.fill(this.credentials.password);
            // Click the submit button on the login form (could say "レジへ進む" or "ログイン")
            const submitBtn = this.page.locator('button[type="submit"], input[type="submit"], button:has-text("レジへ進む"), button:has-text("ログイン")').first();
            if (await submitBtn.count() > 0) {
              await submitBtn.click({ force: true });
              await this.page.waitForLoadState('domcontentloaded').catch(() => {});
              await this.page.waitForTimeout(3000);
              console.log('[MonotaRO] checkout: inline login submitted, URL:', this.page.url());
              await this.takeScreenshot('checkout_after_inline_login');
            }
          }
        }
      }

      // Wait for order confirmation page (URL contains checkout.confirm)
      try {
        if (!this.page.url().includes('checkout.confirm')) {
          await this.page.waitForURL('**/checkout.confirm**', { timeout: 15000 });
        }
      } catch {
        // May already be on confirmation page
      }
      await this.page.waitForTimeout(2000);
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
