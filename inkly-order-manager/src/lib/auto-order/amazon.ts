import { BaseAutoOrder } from './base';

const AMAZON_BASE_URL = 'https://www.amazon.co.jp';

export class AmazonAutoOrder extends BaseAutoOrder {
  constructor() {
    super('Amazon');
  }

  /** Override: use Firefox instead of Chromium to avoid Amazon bot detection. */
  async initialize(): Promise<void> {
    const { firefox } = await import('playwright');
    console.log('[Amazon] initialize: launching Firefox (stealth)');
    this.browser = await firefox.launch({
      headless: true,
      args: [],
    });
    this.page = await this.browser.newPage({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      viewport: { width: 1280, height: 800 },
      locale: 'ja-JP',
    });
    this.loggedIn = false;
  }

  getTopPageUrl(): string {
    return `${AMAZON_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${AMAZON_BASE_URL}/gp/cart/view.html`;
  }

  /** Wait for networkidle with fallback (don't fail on timeout). */
  private async safeWaitForNetworkIdle(): Promise<void> {
    try {
      await this.page?.waitForLoadState('networkidle', { timeout: 30000 });
    } catch {
      // networkidle timeout is non-fatal
    }
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    const accountText = await this.page.$eval(
      '#nav-link-accountList',
      (el: Element) => el.textContent ?? '',
    ).catch(() => '');
    const loggedIn = accountText.includes('アカウント') && !accountText.includes('ログイン');
    console.log('[Amazon] isLoggedIn:', loggedIn, 'accountText:', accountText.trim().substring(0, 50));
    return loggedIn;
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    // Navigate directly to login URL instead of clicking links (avoids ERR_ABORTED)
    const loginUrl = 'https://www.amazon.co.jp/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.co.jp%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=jpflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0';
    console.log('[Amazon] navigateToLoginPage: going to login URL directly');
    await this.page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    console.log('[Amazon] navigateToLoginPage: URL after nav:', this.page.url());
    await this.takeScreenshot('navigate_login');

    // Check if we actually landed on a login page
    const hasEmailField = await this.page.$('input#ap_email, input[name="email"]');
    if (!hasEmailField) {
      // Fallback URL
      console.log('[Amazon] navigateToLoginPage: no email field, trying fallback URL');
      await this.page.goto('https://www.amazon.co.jp/gp/sign-in.html', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      console.log('[Amazon] navigateToLoginPage: fallback URL:', this.page.url());
      await this.takeScreenshot('navigate_login_fallback');
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log('[Amazon] login: starting, URL:', this.page.url());
      await this.takeScreenshot('login_start');

      // Verify we're on a login page
      const currentUrl = this.page.url();
      const isLoginPage = currentUrl.includes('ap/signin') || currentUrl.includes('sign-in');
      const hasEmailField = await this.page.$('input#ap_email, input[name="email"]');
      console.log('[Amazon] login: isLoginPage:', isLoginPage, 'hasEmailField:', !!hasEmailField);

      if (!hasEmailField) {
        console.log('[Amazon] login: no email field found, cannot proceed');
        await this.takeScreenshot('login_no_email_field');
        return false;
      }

      // Step 1: Email
      console.log('[Amazon] login: filling email');
      await this.page.fill('input#ap_email, input[name="email"]', credentials.username);
      await this.takeScreenshot('login_email_filled');
      await this.page.click('input#continue, #continue');
      await this.page.waitForTimeout(3000);
      await this.safeWaitForNetworkIdle();
      console.log('[Amazon] login: after email submit, URL:', this.page.url());
      await this.takeScreenshot('login_after_email');

      // Step 2: Password
      console.log('[Amazon] login: waiting for password field');
      await this.page.waitForSelector('input#ap_password, input[name="password"]', { timeout: 15000 });
      console.log('[Amazon] login: filling password');
      await this.page.fill('input#ap_password, input[name="password"]', credentials.password);
      await this.takeScreenshot('login_password_filled');
      await this.page.click('input#signInSubmit, #signInSubmit');
      await this.page.waitForTimeout(5000);
      await this.safeWaitForNetworkIdle();
      console.log('[Amazon] login: after password submit, URL:', this.page.url());
      await this.takeScreenshot('login_after_password');

      // Step 3: Check for 2FA
      if (await this.page.locator('input#auth-mfa-otpcode, input[name="otpCode"]').count() > 0) {
        console.log('[Amazon] login: 2FA/OTP required');
        await this.takeScreenshot('login_2fa');
        throw new Error('2段階認証が必要です。管理画面から認証コードを入力してください。');
      }

      // Step 4: Check for CAPTCHA
      if (await this.page.locator('img#auth-captcha-image').count() > 0) {
        console.log('[Amazon] login: CAPTCHA detected');
        await this.takeScreenshot('login_captcha');
        throw new Error('CAPTCHAが表示されました。手動でログインしてください。');
      }

      // Step 5: Verify login succeeded
      const postLoginUrl = this.page.url();
      if (postLoginUrl.includes('ap/signin')) {
        console.log('[Amazon] login: still on signin page, login likely failed');
        await this.takeScreenshot('login_still_signin');
        return false;
      }

      // Navigate to top to confirm
      await this.page.goto(this.getTopPageUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('login_final');

      return await this.isLoggedIn();
    } catch (e) {
      console.error('[Amazon] login error:', e);
      await this.takeScreenshot('login_error');
      if (e instanceof Error && (e.message.includes('2段階認証') || e.message.includes('CAPTCHA'))) throw e;
      return false;
    }
  }

  async addSingleItemToCart(quantity: number): Promise<boolean> {
    if (!this.page) return false;

    console.log('[Amazon] addSingleItemToCart: waiting for page load');
    await this.page.waitForTimeout(3000);
    await this.safeWaitForNetworkIdle();

    // Set quantity if > 1
    if (quantity > 1) {
      const qtySelect = await this.page.$('#quantity, select[name="quantity"]');
      if (qtySelect) {
        await qtySelect.selectOption(quantity.toString());
      } else {
        const qtyInput = await this.page.$('input[name="quantity"]');
        if (qtyInput) {
          await qtyInput.fill(quantity.toString());
        }
      }
      await this.page.waitForTimeout(1000);
    }

    // Find and click add-to-cart button
    console.log('[Amazon] addSingleItemToCart: looking for cart button');
    const cartButton = await this.page.$('#add-to-cart-button')
      ?? await this.page.$('input[name="submit.add-to-cart"]')
      ?? await this.page.$('button:has-text("カートに入れる")');

    if (!cartButton) {
      console.log('[Amazon] addSingleItemToCart: cart button not found');
      await this.takeScreenshot('no_cart_button');
      return false;
    }

    await cartButton.click();
    console.log('[Amazon] addSingleItemToCart: clicked cart button');
    await this.page.waitForTimeout(3000);
    await this.safeWaitForNetworkIdle();

    // Verify cart addition
    const confirmation = await this.page.$(
      '#sw-atc-confirmation, #huc-v2-order-row-confirm-text, #NATC_SMART_WAGON_CONF_MSG_SUCCESS, #sw-atc-details-single-container',
    );
    const pageText = await this.page.textContent('body') ?? '';
    const hasConfirmText = pageText.includes('カートに追加されました') || pageText.includes('Cart') || pageText.includes('カート');

    const success = confirmation !== null || hasConfirmText;
    console.log('[Amazon] addSingleItemToCart: success:', success);
    await this.takeScreenshot('after_add_to_cart');
    return success;
  }

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    try {
      // ---- Step 1: Cart page → "レジに進む" ----
      console.log('[Amazon checkout] Step 1: Navigating to cart page');
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_step1_cart');

      const proceedButton = await this.page.$('input[name="proceedToRetailCheckout"]')
        ?? await this.page.$('#sc-buy-box-ptc-button input')
        ?? await this.page.$('input[value="レジに進む"]');
      if (!proceedButton) {
        console.log('[Amazon checkout] Step 1: Proceed button not found');
        await this.takeScreenshot('checkout_step1_no_button');
        return false;
      }
      await proceedButton.click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(2000);
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_step1_proceed');
      console.log('[Amazon checkout] Step 1: Clicked proceed to checkout, URL:', this.page.url());

      // ---- Step 2: "このお支払方法を使用" (SPA - URL does not change) ----
      console.log('[Amazon checkout] Step 2: Looking for payment method button');
      console.log('[Amazon checkout] Step 2: Current URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_step2_before');

      let paymentClicked = false;

      // Method 1: Click input[type="submit"] inside #checkout-primary-continue-button-id
      try {
        paymentClicked = await this.page.evaluate(() => {
          const primaryBtn = document.getElementById('checkout-primary-continue-button-id');
          if (primaryBtn) {
            const submitInput = primaryBtn.querySelector('input[type="submit"]');
            if (submitInput) { (submitInput as HTMLElement).click(); return true; }
            const innerSpan = primaryBtn.querySelector('.a-button-inner');
            if (innerSpan) { (innerSpan as HTMLElement).click(); return true; }
            (primaryBtn as HTMLElement).click();
            return true;
          }

          const secondaryBtn = document.getElementById('checkout-secondary-continue-button-id');
          if (secondaryBtn) {
            const submitInput = secondaryBtn.querySelector('input[type="submit"]');
            if (submitInput) { (submitInput as HTMLElement).click(); return true; }
            (secondaryBtn as HTMLElement).click();
            return true;
          }

          return false;
        });
        console.log('[Amazon checkout] Step 2: ID-based click result:', paymentClicked);
      } catch (e) {
        console.log('[Amazon checkout] Step 2: ID-based click failed:', (e as Error).message);
      }

      // Method 2: Playwright force click on the button ID
      if (!paymentClicked) {
        try {
          const btn = this.page.locator('#checkout-primary-continue-button-id').first();
          if (await btn.count() > 0) {
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await btn.click({ force: true, timeout: 5000 });
            paymentClicked = true;
            console.log('[Amazon checkout] Step 2: Playwright force click on primary button');
          }
        } catch (e) {
          console.log('[Amazon checkout] Step 2: Playwright force click failed:', (e as Error).message);
        }
      }

      // Method 3: Form submit fallback (if button IDs not found)
      if (!paymentClicked) {
        try {
          paymentClicked = await this.page.evaluate(() => {
            const forms = document.querySelectorAll('form');
            for (const form of forms) {
              const submitBtn = form.querySelector('input[type="submit"]') as HTMLInputElement;
              if (submitBtn && submitBtn.offsetParent !== null) {
                const formAction = form.getAttribute('action') || '';
                if (formAction.includes('checkout') || formAction === '') {
                  submitBtn.click();
                  return true;
                }
              }
            }
            return false;
          });
          console.log('[Amazon checkout] Step 2: Form submit fallback result:', paymentClicked);
        } catch (e) {
          console.log('[Amazon checkout] Step 2: Form submit fallback failed:', (e as Error).message);
        }
      }

      if (!paymentClicked) {
        console.log('[Amazon checkout] Step 2: ALL METHODS FAILED');
        await this.takeScreenshot('checkout_step2_failed');
        return false;
      }

      // SPA transition: poll for page content change (URL stays the same)
      console.log('[Amazon checkout] Step 2: Waiting for page content to change...');
      let contentChanged = false;
      for (let i = 0; i < 15; i++) {
        await this.page.waitForTimeout(1000);
        const state = await this.page.evaluate(() => {
          const el = document.getElementById('checkout-primary-continue-button-id');
          const bodyText = document.body.innerText;
          return {
            hasPrimaryBtn: !!el,
            primaryBtnText: el?.textContent?.trim().substring(0, 30) || '',
            hasPlaceOrder: bodyText.includes('注文を確定する'),
            hasPrimeUpsell: bodyText.includes('プライム無料体験'),
            hasSpinner: !!document.querySelector('.a-spinner-wrapper, .checkout-page-spinner, [data-testid="loading"]'),
          };
        });
        console.log(`[Amazon checkout] Step 2: Poll ${i + 1}:`, JSON.stringify(state));

        if (state.hasPlaceOrder && !state.hasPrimaryBtn) {
          contentChanged = true;
          console.log('[Amazon checkout] Step 2: Content changed - place order button appeared');
          break;
        }
        if (state.hasPrimeUpsell) {
          contentChanged = true;
          console.log('[Amazon checkout] Step 2: Content changed - Prime upsell appeared');
          break;
        }
        if (state.primaryBtnText && !state.primaryBtnText.includes('このお支払方法を使用')) {
          contentChanged = true;
          console.log('[Amazon checkout] Step 2: Content changed - button text changed');
          break;
        }
        if (!state.hasPrimaryBtn && !state.hasSpinner) {
          contentChanged = true;
          console.log('[Amazon checkout] Step 2: Content changed - primary button disappeared');
          break;
        }
      }

      if (!contentChanged) {
        console.log('[Amazon checkout] Step 2: Page content did NOT change after 15 seconds (continuing anyway)');
      }

      await this.takeScreenshot('checkout_step2_after');
      console.log('[Amazon checkout] Step 2: Completed');

      // ---- Step 3: Prime upsell skip (conditional) ----
      console.log('[Amazon checkout] Step 3: Checking for Prime upsell, URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_step3_page');

      // Diagnostic: log all buttons on current page
      const step3Buttons = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="submit"], button, .a-button, [role="button"], a.a-link-normal')).map(el => ({
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 60),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          visible: (el as HTMLElement).offsetParent !== null,
        }));
      });
      console.log('[Amazon checkout] Step 3: Page buttons:', JSON.stringify(step3Buttons));

      // Check for order button (visibility-aware)
      const hasOrderButton = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('input[type="submit"], button, .a-button, span');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === '注文を確定する') {
            return (btn as HTMLElement).offsetParent !== null;
          }
        }
        return !!document.getElementById('submitOrderButtonId');
      });

      if (hasOrderButton) {
        console.log('[Amazon checkout] Step 3: Order button found, skipping Prime check');
      } else {
        const primeSkipped = await this.page.evaluate(() => {
          const allElements = document.querySelectorAll('a, button, span, input');
          for (const el of allElements) {
            const text = (el.textContent || '').trim();
            if (text.includes('試さないで注文を続ける') || text.includes('試さないで')) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        console.log('[Amazon checkout] Step 3: Prime skip result:', primeSkipped);
        if (primeSkipped) {
          // SPA transition: poll for order button
          for (let i = 0; i < 10; i++) {
            await this.page.waitForTimeout(1000);
            const hasOrder = await this.page.evaluate(() => {
              return document.body.innerText.includes('注文を確定する') || !!document.getElementById('submitOrderButtonId');
            });
            if (hasOrder) {
              console.log('[Amazon checkout] Step 3: Prime skipped, order page loaded');
              break;
            }
          }
        } else {
          console.log('[Amazon checkout] Step 3: No Prime upsell detected, continuing');
        }
      }
      await this.takeScreenshot('checkout_step3_after');

      // ---- Step 4: "注文を確定する" ----
      // Note: checkout() is only called when autoConfirm=true (see base.ts executeOrder).
      console.log('[Amazon checkout] Step 4: Placing order, URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_step4_before');

      // Diagnostic: log all buttons
      const step4Buttons = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="submit"], button, .a-button, [role="button"]')).map(el => ({
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 60),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          visible: (el as HTMLElement).offsetParent !== null,
        }));
      });
      console.log('[Amazon checkout] Step 4: Page buttons:', JSON.stringify(step4Buttons));

      const orderPlaced = await this.page.evaluate(() => {
        // Method 1: submitOrderButtonId
        const submitBtn = document.getElementById('submitOrderButtonId');
        if (submitBtn) {
          const input = submitBtn.querySelector('input[type="submit"], input') as HTMLElement;
          if (input) { input.click(); return true; }
          (submitBtn as HTMLElement).click();
          return true;
        }

        // Method 2: placeYourOrder1
        const byName = document.querySelector('input[name="placeYourOrder1"]') as HTMLElement;
        if (byName) { byName.click(); return true; }

        // Method 3: text match "注文を確定する"
        const allElements = document.querySelectorAll('span, input[type="submit"], button');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text === '注文を確定する') {
            const parent = el.closest('.a-button') || el.parentElement;
            if (parent) {
              const parentInput = parent.querySelector('input[type="submit"]') as HTMLElement;
              if (parentInput) { parentInput.click(); return true; }
            }
            (el as HTMLElement).click();
            return true;
          }
        }

        // Method 4: ID pattern match
        const placeOrderBtn = document.querySelector('[id*="placeOrder"], [id*="place-order"], [id*="submitOrder"]') as HTMLElement;
        if (placeOrderBtn) {
          const input = placeOrderBtn.querySelector('input[type="submit"]') as HTMLElement;
          if (input) { input.click(); return true; }
          placeOrderBtn.click();
          return true;
        }

        return false;
      });
      console.log('[Amazon checkout] Step 4: Click result:', orderPlaced);

      if (!orderPlaced) {
        console.log('[Amazon checkout] Step 4: FAILED - order button not found');
        await this.takeScreenshot('checkout_step4_failed');
        return false;
      }

      await this.page.waitForTimeout(2000);
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_step4_place_order');

      // ---- Step 5: Verify order completion ----
      return this.verifyOrderCompletion();
    } catch (e) {
      console.error('[Amazon checkout] Error:', e);
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }

  /** Verify that the order was placed successfully after clicking the place-order button. */
  private async verifyOrderCompletion(): Promise<boolean> {
    if (!this.page) return false;

    const pageText = await this.page.textContent('body') ?? '';
    const currentUrl = this.page.url().toLowerCase();

    const textComplete = pageText.includes('注文が確定しました')
      || pageText.includes('ご注文ありがとうございます');
    const elementComplete = (await this.page.$('.a-box.a-alert-success, #orderDetails')) !== null;
    const urlComplete = currentUrl.includes('thankyou') || currentUrl.includes('confirmation');

    const isComplete = textComplete || elementComplete || urlComplete;

    // Try to extract order number (non-fatal if not found)
    const orderNumberMatch = pageText.match(/注文番号[：:\s]*([A-Z0-9-]+)/);
    if (orderNumberMatch) {
      console.log('[Amazon checkout] Order number:', orderNumberMatch[1]);
    }

    await this.takeScreenshot('checkout_complete');

    if (isComplete) {
      console.log('[Amazon checkout] Order completed successfully.',
        orderNumberMatch ? `Order number: ${orderNumberMatch[1]}` : '(order number not found)');
    } else {
      console.log('[Amazon checkout] Order completion could not be verified. URL:', this.page.url());
    }

    return isComplete;
  }
}
