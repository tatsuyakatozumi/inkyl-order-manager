import { chromium, Browser, Page } from 'playwright';

export interface AutoOrderItem {
  itemId: string;
  name: string;
  productUrl: string;
  supplierProductCode: string | null;
  quantity: number;
  unitPrice: number;
}

export interface AutoOrderResult {
  itemId: string;
  success: boolean;
  status: 'cart_added' | 'ordered' | 'failed';
  errorMessage?: string;
  screenshotPath?: string;
}

export interface ExecuteOrderResult {
  results: AutoOrderResult[];
  checkoutSuccess: boolean;
  cartUrl: string | null;
}

const AUTO_CLOSE_MS = 10 * 60 * 1000; // 10 minutes

export abstract class BaseAutoOrder {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected supplierName: string;
  protected loggedIn: boolean = false;

  constructor(supplierName: string) {
    this.supplierName = supplierName;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-http2',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    this.page = await this.browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    this.loggedIn = false;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  private scheduleAutoClose(ms: number): void {
    const browser = this.browser;
    if (!browser) return;
    setTimeout(async () => {
      try {
        if (browser.isConnected()) await browser.close();
      } catch {
        // Already closed
      }
    }, ms);
  }

  // ---- Supplier-specific hooks (implement in subclasses) ----

  /** The supplier's top/home page URL. */
  abstract getTopPageUrl(): string;

  /** The URL of the cart/basket page. */
  abstract getCartUrl(): string;

  /** Check if the user is currently logged in on the current page. */
  abstract isLoggedIn(): Promise<boolean>;

  /** Navigate from the current page (typically top page) to the login page. */
  abstract navigateToLoginPage(): Promise<void>;

  /** Fill and submit the login form visible on the current page. */
  abstract login(credentials: { username: string; password: string }): Promise<boolean>;

  /**
   * On a product page, set the quantity and click "add to cart".
   * Return true if the item was successfully added.
   */
  abstract addSingleItemToCart(quantity: number): Promise<boolean>;

  /** Proceed to checkout and place the order (future use). */
  abstract checkout(): Promise<boolean>;

  // ---- Shared logic ----

  async takeScreenshot(name: string): Promise<string> {
    const screenshotPath = `/tmp/screenshots/${this.supplierName}_${name}_${Date.now()}.png`;
    if (this.page) await this.page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  /**
   * Ensure the user is logged in.
   *  1. Navigate to the supplier's top page
   *  2. Check if already logged in
   *  3. If not, navigate to login page, fill credentials, submit
   *  4. Verify login succeeded
   */
  async ensureLoggedIn(credentials: { username: string; password: string }): Promise<boolean> {
    console.log('[AutoOrder] ensureLoggedIn: starting');
    if (!this.page) return false;
    if (this.loggedIn) {
      console.log('[AutoOrder] ensureLoggedIn: already logged in (cached)');
      return true;
    }

    // Go to top page to check login state
    const topUrl = this.getTopPageUrl();
    console.log('[AutoOrder] ensureLoggedIn: navigating to top page:', topUrl);
    await this.page.goto(topUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const alreadyLoggedIn = await this.isLoggedIn();
    console.log('[AutoOrder] ensureLoggedIn: isLoggedIn result:', alreadyLoggedIn);
    if (alreadyLoggedIn) {
      this.loggedIn = true;
      console.log('[AutoOrder] ensureLoggedIn: completed (was already logged in)');
      return true;
    }

    // Navigate to login page and log in
    console.log('[AutoOrder] ensureLoggedIn: navigating to login page');
    await this.navigateToLoginPage();
    console.log('[AutoOrder] ensureLoggedIn: submitting login form');
    const ok = await this.login(credentials);
    console.log('[AutoOrder] ensureLoggedIn: login success:', ok);
    if (!ok) return false;

    this.loggedIn = true;
    console.log('[AutoOrder] ensureLoggedIn: completed');
    return true;
  }

  /**
   * Unified addToCart flow:
   *  1. Go to top page → login if needed
   *  2. For each item: navigate to product URL → set quantity → add to cart
   *  3. Navigate to cart page → screenshot
   */
  async addToCart(
    items: AutoOrderItem[],
    credentials?: { username: string; password: string },
  ): Promise<{ results: AutoOrderResult[]; cartUrl: string | null }> {
    if (!this.page) {
      return {
        results: items.map(item => ({
          itemId: item.itemId, success: false, status: 'failed' as const,
          errorMessage: 'Page not initialized',
        })),
        cartUrl: null,
      };
    }

    // Step 1: ensure logged in before visiting any product pages
    if (credentials) {
      console.log('[AutoOrder] addToCart: ensuring login with provided credentials');
      const ok = await this.ensureLoggedIn(credentials);
      if (!ok) {
        console.log('[AutoOrder] addToCart: login failed, aborting');
        return {
          results: items.map(item => ({
            itemId: item.itemId, success: false, status: 'failed' as const,
            errorMessage: 'Login failed',
          })),
          cartUrl: null,
        };
      }
    }

    // Step 2: add each item to cart
    const results: AutoOrderResult[] = [];

    for (const item of items) {
      console.log('[AutoOrder] addToCart: processing item', item.name, item.productUrl);
      if (!item.productUrl) {
        results.push({
          itemId: item.itemId, success: false, status: 'failed',
          errorMessage: '商品URLが未設定です',
        });
        continue;
      }

      try {
        console.log('[AutoOrder] addToCart: navigating to product URL');
        await this.page.goto(item.productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('[AutoOrder] addToCart: adding to cart');
        const added = await this.addSingleItemToCart(item.quantity);
        const screenshotPath = await this.takeScreenshot(`item_${item.itemId}`);

        results.push({
          itemId: item.itemId,
          success: added,
          status: added ? 'cart_added' : 'failed',
          errorMessage: added ? undefined : 'Failed to add item to cart',
          screenshotPath,
        });
      } catch (error) {
        const screenshotPath = await this.takeScreenshot(`item_${item.itemId}_error`);
        results.push({
          itemId: item.itemId, success: false, status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          screenshotPath,
        });
      }
    }

    // Step 3: navigate to cart page, screenshot, capture URL
    let cartUrl: string | null = null;
    try {
      await this.page.goto(this.getCartUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(2000);
      cartUrl = this.page.url();
      await this.takeScreenshot('cart_final');
    } catch {
      // Non-critical
    }

    return { results, cartUrl };
  }

  async executeOrder(
    credentials: { username: string; password: string },
    items: AutoOrderItem[],
    autoConfirm: boolean = false,
  ): Promise<ExecuteOrderResult> {
    await this.initialize();

    try {
      const { results, cartUrl } = await this.addToCart(items, credentials);

      if (autoConfirm) {
        console.log('[AutoOrder] executeOrder: autoConfirm=true, proceeding to checkout');
        try {
          const checkoutSuccess = await this.checkout();
          console.log('[AutoOrder] executeOrder: checkout result:', checkoutSuccess);
          if (checkoutSuccess) {
            // Mark all cart_added items as ordered
            for (const r of results) {
              if (r.status === 'cart_added') r.status = 'ordered';
            }
            await this.cleanup();
            return { results, checkoutSuccess: true, cartUrl };
          }
          // Checkout failed: items are still in cart, leave browser open for manual recovery
          console.log('[AutoOrder] executeOrder: checkout failed, leaving browser open for manual recovery');
          this.scheduleAutoClose(AUTO_CLOSE_MS);
          return { results, checkoutSuccess: false, cartUrl };
        } catch (checkoutError) {
          console.error('[AutoOrder] executeOrder: checkout error:', checkoutError);
          this.scheduleAutoClose(AUTO_CLOSE_MS);
          return { results, checkoutSuccess: false, cartUrl };
        }
      }

      // Cart-only mode: leave browser open, auto-close after 10 min
      this.scheduleAutoClose(AUTO_CLOSE_MS);
      return { results, checkoutSuccess: false, cartUrl };
    } catch (e) {
      await this.cleanup();
      throw e;
    }
  }
}
