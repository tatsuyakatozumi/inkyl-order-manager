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
      await this.page.goto(`${FLAG_TATTOO_BASE_URL}/account/login`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      // 1. 「Shopで続行する」ボタンをクリック（ポップアップを待機しながら）
      console.log('[FlagTattoo] Clicking "shopで続行する" button');
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup', { timeout: 10000 }),
        this.page.click(
          'button:has-text("shopで続行する"), button:has-text("Shop Pay"), button:has-text("Shop"), a:has-text("shopで続行")',
        ),
      ]);

      await popup.waitForLoadState('domcontentloaded');
      console.log('[FlagTattoo] Popup opened:', popup.url());

      // 2. メールアドレスが表示されているか確認
      await popup.waitForTimeout(2000);
      const emailVisible = await popup.$(`text=${credentials.username}`);

      if (emailVisible) {
        console.log('[FlagTattoo] Email found in popup, clicking "続行する"');
        // 3. 「続行する」ボタンをクリック
        await popup.click('button:has-text("続行する"), button:has-text("Continue")');
        await popup.waitForTimeout(3000);

        // 4. 認証コード入力画面が出たらログイン断念
        const codeInput = await popup.$(
          'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
        );
        if (codeInput) {
          console.log('[FlagTattoo] Auth code requested, skipping login');
          await this.takeScreenshot('login_auth_code_required');
          await popup.close().catch(() => {});
          return false;
        }
      } else {
        // メールアドレスが見つからない → ログイン断念
        console.log('[FlagTattoo] Email not found in popup, skipping login');
        await this.takeScreenshot('login_email_not_found');
        await popup.close().catch(() => {});
        return false;
      }

      // 5. ポップアップが閉じるのを待つ
      await popup.waitForEvent('close', { timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(2000);

      const loggedIn = await this.isLoggedIn();
      console.log('[FlagTattoo] Login result:', loggedIn);
      return loggedIn;
    } catch (e) {
      console.warn('[FlagTattoo] Shopify login error:', e);
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async addSingleItemToCart(quantity: number): Promise<boolean> {
    if (!this.page) return false;

    if (quantity > 1) {
      const qtyInput = await this.page.$(
        'input[name="quantity"], input.quantity-input, #quantity',
      );
      if (qtyInput) {
        await qtyInput.fill('');
        await qtyInput.fill(quantity.toString());
      }
    }

    await this.page.click(
      'button:has-text("カートに入れる"), button:has-text("Add to Cart"), .add-to-cart-button, input[type="submit"][value*="カート"]',
    );

    await this.page
      .waitForSelector('.cart-notification, .success-message, .cart-count-update', {
        timeout: 10000,
      })
      .catch(() => null);

    return true;
  }
}
