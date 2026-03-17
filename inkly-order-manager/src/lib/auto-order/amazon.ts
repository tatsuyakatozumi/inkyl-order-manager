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
      await this.page.waitForTimeout(3000);
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_step1_proceed');
      console.log('[Amazon checkout] Step 1: Clicked proceed to checkout, URL:', this.page.url());

      // ---- Step 2: "このお支払方法を使用" ----
      console.log('[Amazon checkout] Step 2: Looking for payment method button');
      let paymentClicked = false;

      const paymentInput = await this.page.$('input[name="ppw-widgetEvent:SetPaymentPlanSelectContinueEvent"]')
        ?? await this.page.$('[name="ppw-widgetEvent:SetPaymentPlanSelectContinueEvent"]');
      if (paymentInput) {
        await paymentInput.click();
        paymentClicked = true;
      }

      if (!paymentClicked) {
        const primaryBtn = await this.page.$('.a-button-primary span:has-text("このお支払方法を使用")');
        if (primaryBtn) {
          await primaryBtn.click();
          paymentClicked = true;
        }
      }

      if (!paymentClicked) {
        try {
          const roleBtn = this.page.getByRole('button', { name: 'このお支払方法を使用' });
          if (await roleBtn.count() > 0) {
            await roleBtn.first().click();
            paymentClicked = true;
          }
        } catch {
          // getByRole fallback failed
        }
      }

      if (!paymentClicked) {
        const spanLocator = this.page.locator('span').filter({ hasText: 'このお支払方法を使用' }).first();
        if (await spanLocator.count() > 0) {
          await spanLocator.click();
          paymentClicked = true;
        }
      }

      if (paymentClicked) {
        console.log('[Amazon checkout] Step 2: Clicked use this payment method');
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(3000);
        await this.safeWaitForNetworkIdle();
      } else {
        // Payment button may not appear if payment is already selected
        console.log('[Amazon checkout] Step 2: Payment method button not found, may already be selected');
      }
      await this.takeScreenshot('checkout_step2_payment');
      console.log('[Amazon checkout] Step 2: Done, URL:', this.page.url());

      // ---- Step 3: Prime upsell skip (conditional) ----
      console.log('[Amazon checkout] Step 3: Checking for Prime upsell page');
      let orderButtonFound = false;
      try {
        await this.page.waitForSelector(
          '#submitOrderButtonId input[type="submit"], input[name="placeYourOrder1"], #submitOrderButtonId .a-button-input',
          { timeout: 5000 },
        );
        orderButtonFound = true;
      } catch {
        // Order button not found within 5s — likely Prime upsell page
      }

      if (orderButtonFound) {
        console.log('[Amazon checkout] Step 3: No Prime upsell, proceeding directly');
      } else {
        console.log('[Amazon checkout] Step 3: Prime upsell detected, clicking skip');
        let primeSkipped = false;

        const skipLink = await this.page.$('a:has-text("プライム無料体験を試さないで注文を続ける")')
          ?? await this.page.$('button:has-text("プライム無料体験を試さないで注文を続ける")');
        if (skipLink) {
          await skipLink.click();
          primeSkipped = true;
        }

        if (!primeSkipped) {
          const skipLocator = this.page.locator('text=プライム無料体験を試さないで注文を続ける').first();
          if (await skipLocator.count() > 0) {
            await skipLocator.click();
            primeSkipped = true;
          }
        }

        if (!primeSkipped) {
          const partialMatch = await this.page.$('a:has-text("試さないで")');
          if (partialMatch) {
            await partialMatch.click();
            primeSkipped = true;
          }
        }

        if (primeSkipped) {
          await this.page.waitForLoadState('domcontentloaded');
          await this.page.waitForTimeout(3000);
          await this.safeWaitForNetworkIdle();
          console.log('[Amazon checkout] Step 3: Prime upsell skipped');
        } else {
          console.log('[Amazon checkout] Step 3: Could not find Prime skip button');
        }
      }
      await this.takeScreenshot('checkout_step3_prime_skip');

      // ---- Step 4: "注文を確定する" ----
      // Note: checkout() is only called when autoConfirm=true (see base.ts executeOrder).
      console.log('[Amazon checkout] Step 4: Looking for place order button');
      let orderButton = await this.page.$('#submitOrderButtonId input[type="submit"]')
        ?? await this.page.$('input[name="placeYourOrder1"]')
        ?? await this.page.$('#submitOrderButtonId .a-button-input')
        ?? await this.page.$('input[aria-labelledby="submitOrderButtonId-announce"]');

      if (!orderButton) {
        try {
          const roleBtn = this.page.getByRole('button', { name: '注文を確定する' });
          if (await roleBtn.count() > 0) {
            await roleBtn.first().click();
            console.log('[Amazon checkout] Step 4: Clicked place order via getByRole');
            await this.page.waitForTimeout(5000);
            await this.safeWaitForNetworkIdle();
            await this.takeScreenshot('checkout_step4_place_order');
            // Skip to step 5
            return this.verifyOrderCompletion();
          }
        } catch {
          // getByRole fallback failed
        }

        // Final fallback: span text match
        const spanLocator = this.page.locator('span').filter({ hasText: '注文を確定する' }).first();
        if (await spanLocator.count() > 0) {
          await spanLocator.click();
          console.log('[Amazon checkout] Step 4: Clicked place order via span locator');
          await this.page.waitForTimeout(5000);
          await this.safeWaitForNetworkIdle();
          await this.takeScreenshot('checkout_step4_place_order');
          return this.verifyOrderCompletion();
        }

        console.log('[Amazon checkout] Step 4: Place order button not found');
        await this.takeScreenshot('checkout_step4_no_button');
        return false;
      }

      await orderButton.click();
      console.log('[Amazon checkout] Step 4: Clicked place order');
      await this.page.waitForTimeout(5000);
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
