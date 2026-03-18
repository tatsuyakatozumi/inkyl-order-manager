import { chromium, Browser, Page } from 'playwright';

export interface AutoOrderItem {
  itemId: string;
  name: string;
  productUrl: string;
  supplierProductCode: string | null;
  spec: string | null;
  quantity: number;
  unitPrice: number;
}

export interface AutoOrderResult {
  itemId: string;
  success: boolean;
  status: 'cart_added' | 'failed';
  errorMessage?: string;
  screenshotPath?: string;
}

export interface ExecuteOrderResult {
  results: AutoOrderResult[];
  cartUrl: string | null;
  screenshotPath?: string;
}

export abstract class BaseAutoOrder {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected supplierName: string;
  protected loggedIn: boolean = false;
  protected credentials: { username: string; password: string } | null = null;

  constructor(supplierName: string) {
    this.supplierName = supplierName;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-http2',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    this.page = await this.browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    // Stealth: hide webdriver flag
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    // Stealth: fake plugins
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    // Stealth: set languages
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ja-JP', 'ja', 'en-US', 'en'],
      });
    });

    this.loggedIn = false;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Already closed
      }
      this.browser = null;
      this.page = null;
    }
  }

  // ---- Supplier-specific hooks (implement in subclasses) ----

  abstract getTopPageUrl(): string;
  abstract getCartUrl(): string;
  abstract isLoggedIn(): Promise<boolean>;
  abstract navigateToLoginPage(): Promise<void>;
  abstract login(credentials: { username: string; password: string }): Promise<boolean>;
  abstract addSingleItemToCart(quantity: number, spec: string | null): Promise<boolean>;

  // ---- Shared logic ----

  async takeScreenshot(name: string): Promise<string> {
    const dir = '/tmp/screenshots';
    const fs = await import('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const path = `${dir}/${this.supplierName}_${name}_${Date.now()}.png`;
    if (this.page) await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  async ensureLoggedIn(credentials: { username: string; password: string }): Promise<boolean> {
    console.log('[AutoOrder] ensureLoggedIn: starting');
    if (!this.page) return false;
    if (this.loggedIn) {
      console.log('[AutoOrder] ensureLoggedIn: already logged in (cached)');
      return true;
    }

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

  async addToCart(
    items: AutoOrderItem[],
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
        const added = await this.addSingleItemToCart(item.quantity, item.spec);
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
  ): Promise<ExecuteOrderResult> {
    try {
      await this.initialize();
      this.credentials = credentials;

      // ログイン試行 — 失敗しても続行
      try {
        const loginOk = await this.ensureLoggedIn(credentials);
        if (!loginOk) {
          console.warn(`[AutoOrder] ${this.supplierName}: login failed, continuing without login`);
        }
      } catch (e) {
        console.warn(`[AutoOrder] ${this.supplierName}: login error, continuing without login:`, e);
      }

      const { results, cartUrl } = await this.addToCart(items);
      const screenshotPath = await this.takeScreenshot('final_cart');

      return { results, cartUrl, screenshotPath };
    } finally {
      await this.cleanup();
    }
  }
}
