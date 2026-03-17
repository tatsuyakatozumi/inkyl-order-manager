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

      // ---- Step 2: "このお支払方法を使用" ----
      console.log('[Amazon checkout] Step 2: Looking for payment method button');
      console.log('[Amazon checkout] Step 2: Current URL:', this.page.url());
      await this.page.waitForTimeout(2000);

      // Screenshot first (capture page state before any click attempts)
      try {
        await this.takeScreenshot('checkout_step2_page');
        console.log('[Amazon checkout] Step 2: Screenshot taken');
      } catch (e) {
        console.log('[Amazon checkout] Step 2: Screenshot failed:', (e as Error).message);
      }

      // Diagnostic: log all interactive elements on the page
      try {
        const pageInfo = await this.page.evaluate(() => {
          const elements: Array<{tag: string, text: string, name: string | null, type: string | null, visible: boolean}> = [];
          document.querySelectorAll('input[type="submit"], button, .a-button, [role="button"]').forEach(el => {
            elements.push({
              tag: el.tagName,
              text: (el.textContent || '').trim().substring(0, 60),
              name: el.getAttribute('name'),
              type: el.getAttribute('type'),
              visible: (el as HTMLElement).offsetParent !== null,
            });
          });
          return elements;
        });
        console.log('[Amazon checkout] Step 2: Page elements:', JSON.stringify(pageInfo));
      } catch (e) {
        console.log('[Amazon checkout] Step 2: Page scan failed:', (e as Error).message);
      }

      // Click via page.evaluate (bypasses Playwright visibility checks entirely)
      let paymentClicked = false;
      try {
        paymentClicked = await this.page.evaluate(() => {
          // Method 1: by name attribute
          const byName = document.querySelector('input[name*="SetPaymentPlanSelectContinueEvent"]') as HTMLElement;
          if (byName) { byName.click(); return true; }

          // Method 2: by text content
          const allElements = document.querySelectorAll('span, input, button, a');
          for (const el of allElements) {
            const text = (el.textContent || '').trim();
            if (text.includes('このお支払方法を使用') || text.includes('続行')) {
              const clickable = el.closest('.a-button')?.querySelector('input, span') || el;
              (clickable as HTMLElement).click();
              return true;
            }
          }

          // Method 3: first large .a-button-primary
          const primaryButtons = document.querySelectorAll('.a-button-primary');
          for (const btn of primaryButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 100) {
              const input = btn.querySelector('input') || btn.querySelector('span');
              if (input) { (input as HTMLElement).click(); return true; }
            }
          }

          // Method 4: form submit with payment-related value
          const forms = document.querySelectorAll('form');
          for (const form of forms) {
            const submit = form.querySelector('input[type="submit"]') as HTMLElement;
            if (submit) {
              const val = submit.getAttribute('value') || '';
              if (val.includes('支払') || val.includes('続行') || val.includes('使用')) {
                submit.click();
                return true;
              }
            }
          }

          return false;
        });
        console.log('[Amazon checkout] Step 2: Click result:', paymentClicked);
      } catch (e) {
        console.log('[Amazon checkout] Step 2: Click failed:', (e as Error).message);
      }

      if (!paymentClicked) {
        console.log('[Amazon checkout] Step 2: FAILED - no clickable element found');
        await this.takeScreenshot('checkout_step2_failed');
        return false;
      }

      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(2000);
      console.log('[Amazon checkout] Step 2: Done, URL:', this.page.url());
      await this.takeScreenshot('checkout_step2_after');

      // ---- Step 3: Prime upsell skip (conditional) ----
      console.log('[Amazon checkout] Step 3: Checking for Prime upsell, URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_step3_page');

      // Check if "注文を確定する" is already present (no Prime upsell)
      const hasPlaceOrder = await this.page.evaluate(() => {
        return document.body.innerText.includes('注文を確定する');
      });

      if (hasPlaceOrder) {
        console.log('[Amazon checkout] Step 3: No Prime upsell, order button already visible');
      } else {
        // Prime upsell skip
        const skipped = await this.page.evaluate(() => {
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
        console.log('[Amazon checkout] Step 3: Prime skip result:', skipped);
        if (skipped) {
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          await this.page.waitForTimeout(2000);
        }
      }
      await this.takeScreenshot('checkout_step3_after');

      // ---- Step 4: "注文を確定する" ----
      // Note: checkout() is only called when autoConfirm=true (see base.ts executeOrder).
      console.log('[Amazon checkout] Step 4: Placing order, URL:', this.page.url());
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot('checkout_step4_page');

      const orderPlaced = await this.page.evaluate(() => {
        // By ID
        const submitBtn = document.querySelector('#submitOrderButtonId input') as HTMLElement;
        if (submitBtn) { submitBtn.click(); return true; }

        // By name
        const byName = document.querySelector('input[name="placeYourOrder1"]') as HTMLElement;
        if (byName) { byName.click(); return true; }

        // By text
        const allElements = document.querySelectorAll('span, input, button');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text === '注文を確定する') {
            const clickable = el.closest('.a-button')?.querySelector('input') || el;
            (clickable as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      console.log('[Amazon checkout] Step 4: Click result:', orderPlaced);

      if (!orderPlaced) {
        console.log('[Amazon checkout] Step 4: FAILED - order button not found');
        const buttons = await this.page.evaluate(() => {
          return Array.from(document.querySelectorAll('input[type="submit"], button, .a-button')).map(el => ({
            text: (el.textContent || '').trim().substring(0, 60),
            name: el.getAttribute('name'),
            id: el.id,
          }));
        });
        console.log('[Amazon checkout] Step 4: Available buttons:', JSON.stringify(buttons));
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
