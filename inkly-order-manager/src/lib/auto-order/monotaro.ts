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

      // ---- Strategy 1: Find the form containing password field, click its submit button ----
      let loginClicked = false;
      try {
        const loginForm = this.page.locator('form').filter({ has: this.page.locator('input[name="password"]') }).first();
        if (await loginForm.count() > 0) {
          console.log('[MonotaRO] login: found form containing password field');

          const formButtonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button',
          ];

          for (const selector of formButtonSelectors) {
            const btn = loginForm.locator(selector).first();
            if (await btn.count() > 0) {
              const btnText = await btn.textContent().catch(() => '') || await btn.getAttribute('value') || '';
              console.log(`[MonotaRO] login: found form button: ${selector}, text: "${btnText.trim()}"`);

              await btn.scrollIntoViewIfNeeded().catch(() => {});
              await this.page.waitForTimeout(300);
              const box = await btn.boundingBox();
              if (box) {
                console.log(`[MonotaRO] login: button position: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
                await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                loginClicked = true;
                console.log(`[MonotaRO] login: mouse.click at (${box.x + box.width / 2}, ${box.y + box.height / 2})`);
              } else {
                await btn.click({ force: true, timeout: 5000 });
                loginClicked = true;
                console.log(`[MonotaRO] login: force-clicked ${selector}`);
              }
              break;
            }
          }
        } else {
          console.log('[MonotaRO] login: no form containing password field found');
        }
      } catch (e) {
        console.log('[MonotaRO] login: strategy 1 failed:', (e as Error).message);
      }

      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(3000);
      console.log('[MonotaRO] login: URL after strategy 1:', this.page.url());

      // ---- Strategy 2: form.submit() on password field's parent form ----
      if (this.page.url().includes('/login')) {
        loginClicked = false;
        try {
          const result = await this.page.evaluate(() => {
            const pwField = document.querySelector('input[name="password"]');
            if (pwField) {
              const form = pwField.closest('form');
              if (form) {
                form.submit();
                return { submitted: true, action: form.action, method: form.method };
              }
            }
            return { submitted: false };
          });
          console.log('[MonotaRO] login: form.submit() result:', JSON.stringify(result));
          if (result.submitted) {
            loginClicked = true;
            await this.page.waitForLoadState('domcontentloaded').catch(() => {});
            await this.page.waitForTimeout(3000);
            console.log('[MonotaRO] login: URL after strategy 2:', this.page.url());
          }
        } catch (e) {
          console.log('[MonotaRO] login: strategy 2 failed:', (e as Error).message);
        }
      }

      // ---- All strategies failed: dump form structure for debugging ----
      if (this.page.url().includes('/login')) {
        console.log('[MonotaRO] login: still on login page after all strategies');
        const formsInfo = await this.page.evaluate(() => {
          return Array.from(document.querySelectorAll('form')).map((f, i) => ({
            index: i,
            action: f.action,
            method: f.method,
            id: f.id,
            className: f.className.substring(0, 80),
            inputs: Array.from(f.querySelectorAll('input, button')).map(el => ({
              tag: el.tagName,
              name: el.getAttribute('name'),
              type: el.getAttribute('type'),
              id: el.id,
              value: (el.getAttribute('value') || '').substring(0, 30),
              text: (el.textContent || '').trim().substring(0, 30),
            })),
          }));
        });
        console.log('[MonotaRO] login: ALL FORMS:', JSON.stringify(formsInfo, null, 2));
        await this.takeScreenshot('login_all_strategies_failed');
        return false;
      }

      console.log('[MonotaRO] login: navigated to:', this.page.url());
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

      // Check if login form appeared instead of checkout page (use input[name] not text)
      const pageState = await this.page.evaluate(() => {
        return {
          hasUserIdField: !!document.querySelector('input[name="userId"]'),
          hasPasswordField: !!document.querySelector('input[name="password"]'),
          hasOrderConfirm: document.body.innerText.includes('ご注文内容の確定'),
        };
      });
      console.log('[MonotaRO] checkout: page state after レジへ進む:', JSON.stringify(pageState));

      const hasLoginForm = pageState.hasUserIdField && pageState.hasPasswordField && !pageState.hasOrderConfirm;

      if (hasLoginForm && this.credentials) {
        console.log('[MonotaRO] checkout: login form detected, attempting inline login');
        await this.takeScreenshot('checkout_login_form');

        let inlineLoginSuccess = false;

        try {
          // Find the form containing the password field (not the search form)
          const loginForm = this.page.locator('form').filter({ has: this.page.locator('input[name="password"]') }).first();

          if (await loginForm.count() > 0) {
            const userIdField = loginForm.locator('input[name="userId"]').first();
            const pwField = loginForm.locator('input[name="password"]').first();

            if (await userIdField.count() > 0 && await pwField.count() > 0) {
              await userIdField.fill(this.credentials.username);
              await pwField.fill(this.credentials.password);
              console.log('[MonotaRO] checkout: filled inline login fields');

              // Click the submit button within the login form
              const submitBtn = loginForm.locator('button[type="submit"], input[type="submit"], button').first();
              if (await submitBtn.count() > 0) {
                await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
                await this.page.waitForTimeout(300);
                const box = await submitBtn.boundingBox();
                if (box) {
                  await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                  console.log('[MonotaRO] checkout: inline login button mouse.click');
                } else {
                  await submitBtn.click({ force: true, timeout: 5000 });
                  console.log('[MonotaRO] checkout: inline login button force-click');
                }
              } else {
                // No button found — form.submit()
                await this.page.evaluate(() => {
                  const pw = document.querySelector('input[name="password"]');
                  const form = pw?.closest('form');
                  if (form) form.submit();
                });
                console.log('[MonotaRO] checkout: inline login via form.submit()');
              }

              await this.page.waitForLoadState('domcontentloaded').catch(() => {});
              await this.page.waitForTimeout(3000);
              console.log('[MonotaRO] checkout: after inline login, URL:', this.page.url());
              await this.takeScreenshot('checkout_after_inline_login');
              inlineLoginSuccess = true;
            }
          } else {
            console.log('[MonotaRO] checkout: no form with password field found');
          }
        } catch (e) {
          console.log('[MonotaRO] checkout: inline login error:', (e as Error).message);
        }

        if (!inlineLoginSuccess) {
          console.log('[MonotaRO] checkout: inline login failed, trying full login flow');
          const loginSuccess = await this.login(this.credentials);
          if (loginSuccess) {
            await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.page.waitForTimeout(2000);
            const recheckoutBtn = this.page.locator('a:has-text("レジへ進む"), button:has-text("レジへ進む")').first();
            if (await recheckoutBtn.count() > 0) {
              const box = await recheckoutBtn.boundingBox();
              if (box) {
                await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                console.log('[MonotaRO] checkout: re-clicked レジへ進む after login');
                await this.page.waitForLoadState('domcontentloaded').catch(() => {});
                await this.page.waitForTimeout(3000);
              }
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
