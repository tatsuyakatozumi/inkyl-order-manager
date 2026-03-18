import { BaseAutoOrder } from './base';

const RADIANT_BASE_URL = 'https://www.radiantcolors.com';

export class RadiantAutoOrder extends BaseAutoOrder {
  constructor() {
    super('Radiant');
  }

  getTopPageUrl(): string {
    return `${RADIANT_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${RADIANT_BASE_URL}/cart`;
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    const el = await this.page.$(
      'a[href*="logout"], a[href*="account"]:not([href*="login"]), .customer-links a[href*="account"]',
    );
    return el !== null;
  }

  async navigateToLoginPage(): Promise<void> {
    if (!this.page) return;
    const loginLink = await this.page.$(
      'a[href*="login"], a:has-text("Log in"), a:has-text("Login"), a:has-text("Sign in")',
    );
    if (loginLink) {
      await loginLink.click();
      await this.page.waitForLoadState('domcontentloaded');
    } else {
      await this.page.goto(`${RADIANT_BASE_URL}/account/login`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) return false;
    try {
      // Try Shopify "Shop" login flow (popup-based)
      console.log('[Radiant] Attempting Shopify Shop login');
      const shopButton = await this.page.$(
        'button:has-text("Log in with Shop"), button:has-text("Shop Pay"), button:has-text("Shop"), a:has-text("Log in with Shop")',
      );

      if (shopButton) {
        const [popup] = await Promise.all([
          this.page.waitForEvent('popup', { timeout: 10000 }),
          shopButton.click(),
        ]);

        await popup.waitForLoadState('domcontentloaded');
        console.log('[Radiant] Popup opened:', popup.url());
        await popup.waitForTimeout(2000);

        // Check if email is displayed
        const emailVisible = await popup.$(`text=${credentials.username}`);

        if (emailVisible) {
          console.log('[Radiant] Email found in popup, clicking Continue');
          await popup.click(
            'button:has-text("Continue"), button:has-text("続行する")',
          );
          await popup.waitForTimeout(3000);

          // Check for auth code request
          const codeInput = await popup.$(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
          );
          if (codeInput) {
            console.log('[Radiant] Auth code requested, skipping login');
            await this.takeScreenshot('login_auth_code_required');
            await popup.close().catch(() => {});
            return false;
          }
        } else {
          console.log('[Radiant] Email not found in popup, skipping login');
          await this.takeScreenshot('login_email_not_found');
          await popup.close().catch(() => {});
          return false;
        }

        // Wait for popup to close
        await popup.waitForEvent('close', { timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(2000);

        const loggedIn = await this.isLoggedIn();
        console.log('[Radiant] Login result:', loggedIn);
        return loggedIn;
      }

      // Fallback: standard email/password login
      console.log('[Radiant] Shop button not found, trying standard login');
      await this.page.fill(
        'input[name="customer[email]"], input[type="email"]',
        credentials.username,
      );
      await this.page.fill(
        'input[name="customer[password]"], input[type="password"]',
        credentials.password,
      );
      await this.page.click('button[type="submit"], input[type="submit"]');
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);

      return await this.isLoggedIn();
    } catch (e) {
      console.warn('[Radiant] Login error:', e);
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async addSingleItemToCart(quantity: number, spec: string | null): Promise<boolean> {
    if (!this.page) return false;

    // Spec/variant selection (tolerant — does nothing if selector not found)
    if (spec) {
      try {
        const variantBtn = await this.page.$(
          `button:has-text("${spec}"), label:has-text("${spec}"), a:has-text("${spec}"), [data-value="${spec}"], .swatch-element:has-text("${spec}")`,
        );
        if (variantBtn) {
          await variantBtn.click();
          await this.page.waitForTimeout(1000);
        } else {
          const selects = await this.page.$$('select');
          for (const sel of selects) {
            const options = await sel.$$eval('option', (opts, s) =>
              opts.filter(o => o.textContent?.includes(s as string)).map(o => o.value), spec);
            if (options.length > 0) {
              await sel.selectOption(options[0]);
              await this.page.waitForTimeout(1000);
              break;
            }
          }
          console.log(`[Radiant] Variant selector not found for spec "${spec}", continuing`);
        }
      } catch (e) {
        console.log(`[Radiant] Variant selection failed for "${spec}", continuing:`, e);
      }
    }

    // Set quantity if > 1
    if (quantity > 1) {
      const qtyInput = await this.page.$(
        'input[name="quantity"], input.quantity-input, #quantity',
      );
      if (qtyInput) {
        await qtyInput.fill('');
        await qtyInput.fill(quantity.toString());
      }
    }

    // Click add to cart
    await this.page.click(
      'button:has-text("Add to Cart"), button:has-text("Add to cart"), button[name="add"], .btn-add-to-cart, input[type="submit"][value*="Cart"]',
    );

    // Wait for cart notification or page change
    await this.page
      .waitForSelector(
        '.cart-notification, .cart-popup, [data-cart-notification], .success-message',
        { timeout: 10000 },
      )
      .catch(() => null);

    return true;
  }
}
