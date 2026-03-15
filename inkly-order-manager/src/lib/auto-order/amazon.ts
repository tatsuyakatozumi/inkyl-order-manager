import { BaseAutoOrder } from './base';

const AMAZON_BASE_URL = 'https://www.amazon.co.jp';

export class AmazonAutoOrder extends BaseAutoOrder {
  constructor() {
    super('Amazon');
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
    console.log('[Amazon] navigateToLoginPage: looking for account link');
    const signInLink = await this.page.$('#nav-link-accountList')
      ?? await this.page.$('a:has-text("ログイン")')
      ?? await this.page.$('a:has-text("サインイン")');
    if (signInLink) {
      await signInLink.click();
      await this.safeWaitForNetworkIdle();
    } else {
      console.log('[Amazon] navigateToLoginPage: no link found, navigating directly');
      await this.page.goto(`${AMAZON_BASE_URL}/ap/signin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.safeWaitForNetworkIdle();
    }
    console.log('[Amazon] navigateToLoginPage: URL after nav:', this.page.url());
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log('[Amazon] login: starting, URL:', this.page.url());
      await this.takeScreenshot('login_page');

      // Step 1: Email
      const emailField = await this.page.$('#ap_email');
      if (emailField) {
        console.log('[Amazon] login: filling email');
        await this.page.fill('#ap_email', credentials.username);
        await this.page.click('#continue');
        await this.page.waitForTimeout(2000);
        await this.safeWaitForNetworkIdle();
      }

      // Step 2: Password
      console.log('[Amazon] login: filling password');
      await this.page.waitForSelector('#ap_password', { timeout: 10000 });
      await this.page.fill('#ap_password', credentials.password);
      await this.page.click('#signInSubmit');
      await this.page.waitForTimeout(3000);
      await this.safeWaitForNetworkIdle();

      console.log('[Amazon] login: post-login URL:', this.page.url());
      await this.takeScreenshot('login_after');

      // Step 3: Check for 2FA / OTP
      const otpField = await this.page.$('#auth-mfa-otpcode, input[name="otpCode"]');
      if (otpField) {
        console.log('[Amazon] login: 2FA/OTP required');
        await this.takeScreenshot('login_2fa');
        throw new Error('2段階認証が必要です。管理画面から認証コードを入力してください。');
      }

      // Step 4: Verify login
      // Navigate to top page to check login state
      await this.page.goto(this.getTopPageUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.safeWaitForNetworkIdle();

      return await this.isLoggedIn();
    } catch (e) {
      console.error('[Amazon] login error:', e);
      await this.takeScreenshot('login_error');
      if (e instanceof Error && e.message.includes('2段階認証')) throw e;
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
    const hasConfirmText = pageText.includes('カートに追加されました') || pageText.includes('Cart');

    const success = confirmation !== null || hasConfirmText;
    console.log('[Amazon] addSingleItemToCart: success:', success);
    await this.takeScreenshot('after_add_to_cart');
    return success;
  }

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log('[Amazon] checkout: navigating to cart');
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_cart');

      console.log('[Amazon] checkout: proceeding to checkout');
      const checkoutButton = await this.page.$('input[name="proceedToRetailCheckout"]')
        ?? await this.page.$('#sc-buy-box-ptc-button input');
      if (!checkoutButton) {
        console.log('[Amazon] checkout: checkout button not found');
        await this.takeScreenshot('checkout_no_button');
        return false;
      }
      await checkoutButton.click();
      await this.page.waitForTimeout(3000);
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_confirm');

      console.log('[Amazon] checkout: placing order');
      const orderButton = await this.page.$('#submitOrderButtonId input')
        ?? await this.page.$('input[name="placeYourOrder1"]');
      if (!orderButton) {
        console.log('[Amazon] checkout: order button not found');
        await this.takeScreenshot('checkout_no_order_button');
        return false;
      }
      await orderButton.click();
      await this.page.waitForTimeout(5000);
      await this.safeWaitForNetworkIdle();
      await this.takeScreenshot('checkout_complete');

      const pageText = await this.page.textContent('body') ?? '';
      const isComplete = pageText.includes('注文が確定しました')
        || pageText.includes('ご注文ありがとうございます')
        || (await this.page.$('.a-box.a-alert-success, #orderDetails')) !== null;

      console.log('[Amazon] checkout: complete:', isComplete);
      return isComplete;
    } catch (e) {
      console.error('[Amazon] checkout error:', e);
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }
}
