import { BaseAutoOrder } from './base';

const FLAG_TATTOO_BASE_URL = 'https://www.flag-tattoosupply.com';

export class FlagTattooAutoOrder extends BaseAutoOrder {
  constructor() {
    super('FLAG Tattoo Supply');
  }

  getTopPageUrl(): string {
    return `${FLAG_TATTOO_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${FLAG_TATTOO_BASE_URL}/cart`;
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    const el = await this.page.$('.account-menu, .logout-link, .user-name, a[href*="logout"], a[href*="account"]');
    return el !== null;
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    const loginLink = await this.page.$('a[href*="login"], a:has-text("ログイン"), a:has-text("Login")');
    if (loginLink) {
      await loginLink.click();
      await this.page.waitForLoadState('domcontentloaded');
    } else {
      await this.page.goto(`${FLAG_TATTOO_BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.fill(
        'input[name="email"], input[name="loginId"], input[type="email"]',
        credentials.username,
      );
      await this.page.fill(
        'input[name="password"], input[type="password"]',
        credentials.password,
      );
      await this.page.click('button[type="submit"], input[type="submit"]');
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
      const qtyInput = await this.page.$('input[name="quantity"], input.quantity-input, #quantity');
      if (qtyInput) {
        await qtyInput.fill('');
        await qtyInput.fill(quantity.toString());
      }
    }

    await this.page.click(
      'button:has-text("カートに入れる"), button:has-text("Add to Cart"), .add-to-cart-button, input[type="submit"][value*="カート"]',
    );

    await this.page.waitForSelector(
      '.cart-notification, .success-message, .cart-count-update',
      { timeout: 10000 },
    ).catch(() => null);

    return true;
  }

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.takeScreenshot('checkout_cart');

      await this.page.click(
        'button:has-text("レジに進む"), button:has-text("Checkout"), a:has-text("購入手続き"), .checkout-button',
      );
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('checkout_confirm');

      await this.page.click(
        'button:has-text("注文を確定する"), button:has-text("Place Order"), button:has-text("注文する"), .btn-order-confirm',
      );
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('checkout_complete');

      const orderComplete = await this.page.$(
        '.order-complete, .order-confirmation, :has-text("ご注文ありがとうございます"), :has-text("Thank you for your order")',
      );
      return orderComplete !== null;
    } catch {
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }
}
