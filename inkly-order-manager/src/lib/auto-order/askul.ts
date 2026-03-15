import { BaseAutoOrder } from './base';

const ASKUL_BASE_URL = 'https://www.askul.co.jp';

export class AskulAutoOrder extends BaseAutoOrder {
  constructor() {
    super('ASKUL');
  }

  getTopPageUrl(): string {
    return `${ASKUL_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${ASKUL_BASE_URL}/cart/`;
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    const el = await this.page.$('.user-info, .mypage-link, [data-testid="user-menu"], a[href*="mypage"]');
    return el !== null;
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    const loginLink = await this.page.$('a[href*="Login"], a[href*="login"], a:has-text("ログイン")');
    if (loginLink) {
      await loginLink.click();
      await this.page.waitForLoadState('domcontentloaded');
    } else {
      await this.page.goto(`${ASKUL_BASE_URL}/Account/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.fill('input[name="loginId"], #loginId, input[type="email"]', credentials.username);
      await this.page.fill('input[name="password"], #password, input[type="password"]', credentials.password);
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

    const qtyInput = await this.page.$('input[name="quantity"], input.quantity, #quantity');
    if (qtyInput) {
      await qtyInput.fill('');
      await qtyInput.fill(quantity.toString());
    }

    await this.page.click(
      'button:has-text("カートに入れる"), input[type="submit"][value*="カート"], .btn-add-cart',
    );
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(3000);

    return true;
  }

  async checkout(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.takeScreenshot('checkout_cart');

      await this.page.click('button:has-text("注文手続きへ"), a:has-text("レジに進む"), .btn-checkout');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('checkout_confirm');

      await this.page.click('button:has-text("注文を確定する"), button:has-text("注文する"), .btn-order-confirm');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      await this.takeScreenshot('checkout_complete');

      const orderComplete = await this.page.$('.order-complete, .order-thanks, :has-text("ご注文ありがとうございます")');
      return orderComplete !== null;
    } catch {
      await this.takeScreenshot('checkout_error');
      return false;
    }
  }
}
