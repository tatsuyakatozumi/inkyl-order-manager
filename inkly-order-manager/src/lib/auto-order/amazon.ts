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

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    // Logged-in: header shows "こんにちは、XXXさん" or account list without "ログイン"
    const accountText = await this.page.$eval(
      '#nav-link-accountList',
      (el: Element) => el.textContent ?? '',
    ).catch(() => '');
    return accountText.includes('アカウント') && !accountText.includes('ログイン');
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    const signInLink = await this.page.$('#nav-link-accountList, a[href*="ap/signin"]');
    if (signInLink) {
      await signInLink.click();
      await this.page.waitForLoadState('domcontentloaded');
    } else {
      await this.page.goto(`${AMAZON_BASE_URL}/ap/signin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      // Amazon two-step login: email → password
      const emailField = await this.page.$('#ap_email');
      if (emailField) {
        await this.page.fill('#ap_email', credentials.username);
        await this.page.click('#continue');
        await this.page.waitForSelector('#ap_password', { timeout: 10000 });
      }

      await this.page.fill('#ap_password', credentials.password);
      await this.page.click('#signInSubmit');
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
    }

    await this.page.click('#add-to-cart-button, input[name="submit.add-to-cart"]');

    await this.page.waitForSelector(
      '#huc-v2-order-row-confirm-text, #NATC_SMART_WAGON_CONF_MSG_SUCCESS, #sw-atc-details-single-container',
      { timeout: 10000 },
    ).catch(() => null);

    return true;
  }

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.takeScreenshot('checkout_cart');

      await this.page.click('input[name="proceedToRetailCheckout"], #sc-buy-box-ptc-button input');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('checkout_confirm');

      await this.page.click('#submitOrderButtonId input, input[name="placeYourOrder1"]');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('checkout_complete');

      const orderComplete = await this.page.$('.a-box.a-alert-success, #orderDetails, :has-text("注文が確定しました")');
      return orderComplete !== null;
    } catch {
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }
}
