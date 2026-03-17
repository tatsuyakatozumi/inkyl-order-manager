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

  // ---- Checkout State Machine ----

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    const page = this.page;
    const MAX_ITERATIONS = 10;
    let lastState: CheckoutState = 'UNKNOWN';
    let sameStateCount = 0;

    try {
      // Navigate to cart page
      console.log('[Amazon checkout] Starting checkout, navigating to cart');
      await page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        // ---- Detect current state ----
        const state = await this.detectCheckoutState();
        console.log(`[Amazon checkout] Iteration ${iteration}: State = ${state}`);
        await this.takeScreenshot(`checkout_iter${iteration}_${state.toLowerCase()}`);

        // Stuck detection: same state 3 times = click not working
        if (state === lastState) {
          sameStateCount++;
          if (sameStateCount >= 3) {
            console.log(`[Amazon checkout] State ${state} repeated 3 times, click is not working`);
            await this.dumpPageButtons(iteration);
            return false;
          }
        } else {
          sameStateCount = 1;
          lastState = state;
        }

        // ---- Terminal state: order complete ----
        if (state === 'ORDER_COMPLETE') {
          console.log('[Amazon checkout] Order completed successfully!');
          const pageText = await page.evaluate(() => document.body.innerText);
          const orderMatch = pageText.match(/注文番号[：:\s]*([A-Z0-9-]+)/);
          if (orderMatch) {
            console.log(`[Amazon checkout] Order number: ${orderMatch[1]}`);
          }
          return true;
        }

        // ---- Unknown state ----
        if (state === 'UNKNOWN') {
          console.log('[Amazon checkout] Unknown page state');
          await this.dumpPageButtons(iteration);
          if (sameStateCount >= 2) return false;
          await page.waitForTimeout(3000);
          continue;
        }

        // ---- Execute action for current state ----
        const actionSuccess = await this.executeCheckoutAction(state);
        console.log(`[Amazon checkout] Action for ${state}: ${actionSuccess ? 'success' : 'failed'}`);

        if (!actionSuccess) {
          console.log(`[Amazon checkout] Failed to execute action for state: ${state}`);
          await this.dumpPageButtons(iteration);
          return false;
        }

        // Wait for state transition (SPA: content change, not URL change)
        await this.waitForStateChange(state);
      }

      console.log('[Amazon checkout] Max iterations reached');
      return false;
    } catch (e) {
      console.error('[Amazon checkout] Error:', e);
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }

  private async detectCheckoutState(): Promise<CheckoutState> {
    if (!this.page) return 'UNKNOWN';
    try {
      const indicators = await this.page.evaluate(() => {
        const bodyText = document.body.innerText;
        const url = window.location.href;

        return {
          hasCartCheckoutBtn:
            !!document.querySelector('input[name="proceedToRetailCheckout"]') ||
            !!document.querySelector('#sc-buy-box-ptc-button'),
          hasPaymentBtn:
            !!document.getElementById('checkout-primary-continue-button-id') ||
            !!document.getElementById('checkout-secondary-continue-button-id'),
          hasPrimeSkip:
            bodyText.includes('プライム無料体験を試さないで注文を続ける') ||
            bodyText.includes('試さないで注文を続ける'),
          hasPlaceOrder:
            !!document.getElementById('submitOrderButtonId') ||
            !!document.querySelector('input[name="placeYourOrder1"]'),
          hasOrderComplete:
            bodyText.includes('注文が確定しました') ||
            bodyText.includes('ご注文ありがとうございます') ||
            !!document.querySelector('#orderDetails') ||
            !!document.querySelector('.a-box.a-alert-success'),
          isCartPage:
            url.includes('/gp/cart') || url.includes('/cart/view'),
          url,
        };
      });

      console.log('[Amazon checkout] Page indicators:', JSON.stringify(indicators));

      // Priority order: most definitive states first
      if (indicators.hasOrderComplete) return 'ORDER_COMPLETE';
      if (indicators.hasPlaceOrder) return 'PLACE_ORDER';
      if (indicators.hasPrimeSkip) return 'PRIME_UPSELL';
      if (indicators.hasPaymentBtn && !indicators.isCartPage) return 'PAYMENT';
      if (indicators.hasCartCheckoutBtn || indicators.isCartPage) return 'CART';

      return 'UNKNOWN';
    } catch (e) {
      console.log('[Amazon checkout] detectState error:', (e as Error).message);
      return 'UNKNOWN';
    }
  }

  private async executeCheckoutAction(state: CheckoutState): Promise<boolean> {
    switch (state) {
      case 'CART':
        return this.clickCartCheckout();
      case 'PAYMENT':
        return this.clickPaymentContinue();
      case 'PRIME_UPSELL':
        return this.clickPrimeSkip();
      case 'PLACE_ORDER':
        return this.clickPlaceOrder();
      default:
        return false;
    }
  }

  private async clickCartCheckout(): Promise<boolean> {
    return this.tryClickSelectors([
      'input[name="proceedToRetailCheckout"]',
      '#sc-buy-box-ptc-button input[type="submit"]',
      '#sc-buy-box-ptc-button',
      'input[value="レジに進む"]',
    ], 'CART');
  }

  private async clickPaymentContinue(): Promise<boolean> {
    return this.tryClickSelectors([
      '#checkout-primary-continue-button-id input[type="submit"]',
      '#checkout-primary-continue-button-id',
      '#checkout-secondary-continue-button-id input[type="submit"]',
      '#checkout-secondary-continue-button-id',
    ], 'PAYMENT');
  }

  private async clickPrimeSkip(): Promise<boolean> {
    if (!this.page) return false;

    // Scroll the skip link into view first
    try {
      await this.page.evaluate(() => {
        const allElements = document.querySelectorAll('a, button, span');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text.includes('試さないで注文を続ける') || text.includes('試さないで')) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            return;
          }
        }
      });
      await this.page.waitForTimeout(500);
    } catch {
      // scroll attempt failed, continue anyway
    }

    // Full text match — mouse.click
    try {
      const fullMatch = this.page.locator('a, button, span').filter({ hasText: '試さないで注文を続ける' }).first();
      if (await fullMatch.count() > 0) {
        const box = await fullMatch.boundingBox();
        if (box) {
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log(`[Amazon checkout] PRIME_UPSELL: mouse.click at (${box.x + box.width / 2}, ${box.y + box.height / 2})`);
          return true;
        }
        // boundingBox null — fallback to force click
        await fullMatch.click({ force: true, timeout: 5000 });
        console.log('[Amazon checkout] PRIME_UPSELL: Fallback force-click on full match');
        return true;
      }
    } catch (e) {
      console.log('[Amazon checkout] PRIME_UPSELL: Full text click failed:', (e as Error).message);
    }

    // Partial text match — mouse.click
    try {
      const partialMatch = this.page.locator('a, button, span').filter({ hasText: '試さないで' }).first();
      if (await partialMatch.count() > 0) {
        const box = await partialMatch.boundingBox();
        if (box) {
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log(`[Amazon checkout] PRIME_UPSELL: mouse.click partial at (${box.x + box.width / 2}, ${box.y + box.height / 2})`);
          return true;
        }
        await partialMatch.click({ force: true, timeout: 5000 });
        console.log('[Amazon checkout] PRIME_UPSELL: Fallback force-click on partial match');
        return true;
      }
    } catch (e) {
      console.log('[Amazon checkout] PRIME_UPSELL: Partial text click failed:', (e as Error).message);
    }

    console.log('[Amazon checkout] PRIME_UPSELL: All methods failed');
    return false;
  }

  private async clickPlaceOrder(): Promise<boolean> {
    return this.tryClickSelectors([
      '#submitOrderButtonId input[type="submit"]',
      '#submitOrderButtonId',
      'input[name="placeYourOrder1"]',
      '#submitOrderButtonId .a-button-input',
      'input[aria-labelledby="submitOrderButtonId-announce"]',
    ], 'PLACE_ORDER');
  }

  /** Try clicking selectors: scrollIntoView → getBoundingBox → mouse.click, with force-click fallback. */
  private async tryClickSelectors(selectors: string[], stateName: string): Promise<boolean> {
    if (!this.page) return false;

    for (const selector of selectors) {
      try {
        const el = this.page.locator(selector).first();
        if (await el.count() > 0) {
          // Primary: coordinate-based mouse.click
          const clicked = await this.clickByCoordinates(selector, stateName);
          if (clicked) return true;

          // Fallback: Playwright force-click
          try {
            await el.click({ force: true, timeout: 5000 });
            console.log(`[Amazon checkout] ${stateName}: Fallback force-click on ${selector}`);
            return true;
          } catch (e) {
            console.log(`[Amazon checkout] ${stateName}: Fallback force-click failed: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        console.log(`[Amazon checkout] ${stateName}: ${selector} failed: ${(e as Error).message}`);
      }
    }

    console.log(`[Amazon checkout] ${stateName}: All selectors failed`);
    return false;
  }

  /** scrollIntoView → getBoundingBox → mouse.click at element center. */
  private async clickByCoordinates(selector: string, stateName: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      // Step 1: Scroll element into viewport
      await this.page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      }, selector);
      await this.page.waitForTimeout(500);

      // Step 2: Get bounding box
      const box = await this.page.locator(selector).first().boundingBox();
      if (!box) {
        console.log(`[Amazon checkout] ${stateName}: ${selector} — boundingBox is null`);
        return false;
      }

      console.log(`[Amazon checkout] ${stateName}: ${selector} — box: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);

      // Step 3: Click at element center
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await this.page.mouse.click(x, y);
      console.log(`[Amazon checkout] ${stateName}: mouse.click at (${x}, ${y}) on ${selector}`);
      return true;
    } catch (e) {
      console.log(`[Amazon checkout] ${stateName}: clickByCoordinates failed for ${selector}: ${(e as Error).message}`);
      return false;
    }
  }

  /** Poll until the checkout state changes from previousState (SPA-aware). */
  private async waitForStateChange(previousState: CheckoutState): Promise<void> {
    if (!this.page) return;
    console.log(`[Amazon checkout] Waiting for state to change from ${previousState}...`);

    for (let i = 0; i < 10; i++) {
      await this.page.waitForTimeout(1000);
      const currentState = await this.detectCheckoutState();
      if (currentState !== previousState) {
        console.log(`[Amazon checkout] State changed: ${previousState} -> ${currentState} (after ${i + 1}s)`);
        return;
      }
    }

    console.log(`[Amazon checkout] State did not change from ${previousState} after 10s`);
  }

  /** Dump all interactive elements on the page for debugging. */
  private async dumpPageButtons(iteration: number): Promise<void> {
    if (!this.page) return;
    try {
      const buttons = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll(
          'input[type="submit"], button, .a-button, [role="button"], a.a-link-normal',
        )).map(el => ({
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 60),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          visible: (el as HTMLElement).offsetParent !== null,
        }));
      });
      console.log(`[Amazon checkout] Iteration ${iteration} buttons:`, JSON.stringify(buttons));
    } catch (e) {
      console.log(`[Amazon checkout] Iteration ${iteration} button dump failed:`, (e as Error).message);
    }
  }
}

type CheckoutState = 'CART' | 'PAYMENT' | 'PRIME_UPSELL' | 'PLACE_ORDER' | 'ORDER_COMPLETE' | 'UNKNOWN';
