import { BaseAutoOrder, AutoOrderItem, AutoOrderResult } from './base';

const FLAG_TATTOO_BASE_URL = 'https://flag-ts.com';

export class FlagTattooAutoOrder extends BaseAutoOrder {
  // パーマリンク方式ではログイン不要
  protected loginRequired = false;

  constructor() {
    super('FLAG Tattoo Supply');
  }

  /**
   * Override: use headed Chromium to bypass Shopify/Cloudflare bot detection.
   * Requires Xvfb in Docker (see docker-entrypoint.sh).
   */
  async initialize(): Promise<void> {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      headless: false,
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
      ignoreHTTPSErrors: true,
    });

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US', 'en'] });
    });

    this.loggedIn = false;
  }

  getTopPageUrl(): string {
    return `${FLAG_TATTOO_BASE_URL}/`;
  }

  getCartUrl(): string {
    return `${FLAG_TATTOO_BASE_URL}/cart`;
  }

  async isLoggedIn(): Promise<boolean> {
    return false; // パーマリンク方式ではログイン不要
  }

  async navigateToLoginPage(): Promise<void> {
    // パーマリンク方式ではログイン不要
  }

  async login(): Promise<boolean> {
    // パーマリンク方式ではログイン不要
    return true;
  }

  /**
   * カートパーマリンク方式: 商品ページから variant ID を抽出し、
   * /cart/VID1:QTY1,VID2:QTY2 のパーマリンクを生成する。
   *
   * Shopify はカートをブラウザセッションに保存するため、
   * Playwright でカートに入れてもユーザーのブラウザには反映されない。
   * パーマリンクならユーザーがリンクを開くだけでカートに入る。
   */
  async addToCart(items: AutoOrderItem[]): Promise<{ results: AutoOrderResult[]; cartUrl: string | null }> {
    if (!this.page) {
      return {
        results: items.map(item => ({
          itemId: item.itemId,
          success: false,
          status: 'failed' as const,
          errorMessage: 'Browser not initialized',
        })),
        cartUrl: null,
      };
    }

    const results: AutoOrderResult[] = [];
    const cartParts: string[] = []; // "VARIANT_ID:QUANTITY" の配列

    for (const item of items) {
      try {
        console.log(`[FlagTattoo] Processing: ${item.name} (${item.productUrl})`);
        await this.page.goto(item.productUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await this.page.waitForTimeout(2000);

        // バリアント選択
        await this.selectVariant(item.spec);

        // variant ID 抽出
        const variantId = await this.extractVariantId(item);
        if (variantId) {
          cartParts.push(`${variantId}:${item.quantity}`);
          console.log(`[FlagTattoo] variant ID found: ${variantId} (qty: ${item.quantity})`);
          results.push({
            itemId: item.itemId,
            success: true,
            status: 'cart_added',
          });
        } else {
          console.warn(`[FlagTattoo] variant ID not found for: ${item.name}`);
          results.push({
            itemId: item.itemId,
            success: false,
            status: 'failed',
            errorMessage: 'variant ID を取得できませんでした',
          });
        }

        await this.takeScreenshot(`item_${item.itemId}`);
      } catch (e: any) {
        console.error(`[FlagTattoo] Error processing ${item.name}:`, e);
        results.push({
          itemId: item.itemId,
          success: false,
          status: 'failed',
          errorMessage: e.message,
        });
        await this.takeScreenshot(`item_${item.itemId}_error`);
      }
    }

    // カートパーマリンクを生成
    const cartUrl = cartParts.length > 0
      ? `${FLAG_TATTOO_BASE_URL}/cart/${cartParts.join(',')}`
      : null;

    console.log(`[FlagTattoo] Cart permalink: ${cartUrl}`);

    return { results, cartUrl };
  }

  /**
   * バリアント選択（既存ロジック）
   */
  private async selectVariant(spec: string | null): Promise<void> {
    if (!this.page || !spec) return;

    try {
      const variantBtn = await this.page.$(
        `button:has-text("${spec}"), label:has-text("${spec}"), a:has-text("${spec}"), [data-value="${spec}"], .swatch-element:has-text("${spec}")`,
      );
      if (variantBtn) {
        await variantBtn.click();
        await this.page.waitForTimeout(1000);
        console.log(`[FlagTattoo] Variant selected: "${spec}"`);
        return;
      }

      // select ドロップダウンから選択
      const selects = await this.page.$$('select');
      for (const sel of selects) {
        const options = await sel.$$eval(
          'option',
          (opts, s) => opts.filter(o => o.textContent?.includes(s as string)).map(o => o.value),
          spec,
        );
        if (options.length > 0) {
          await sel.selectOption(options[0]);
          await this.page.waitForTimeout(1000);
          console.log(`[FlagTattoo] Variant selected via dropdown: "${spec}"`);
          return;
        }
      }

      console.log(`[FlagTattoo] Variant selector not found for spec "${spec}", continuing`);
    } catch (e) {
      console.log(`[FlagTattoo] Variant selection failed for "${spec}", continuing:`, e);
    }
  }

  /**
   * 商品ページから Shopify variant ID を抽出する。
   *
   * 優先順:
   * 1. hidden input[name="id"] (Shopify テーマ標準の add-to-cart フォーム)
   * 2. URL の ?variant= パラメータ
   * 3. product.json からスペックをマッチして取得
   */
  private async extractVariantId(item: AutoOrderItem): Promise<string | null> {
    if (!this.page) return null;

    // 1. hidden input[name="id"] — 最も信頼できる方法
    const fromInput = await this.page.$eval(
      'input[name="id"], select[name="id"]',
      (el) => (el as HTMLInputElement | HTMLSelectElement).value,
    ).catch(() => null);
    if (fromInput) {
      console.log(`[FlagTattoo] variant ID from input[name="id"]: ${fromInput}`);
      return fromInput;
    }

    // 2. URL の ?variant= パラメータ
    try {
      const currentUrl = new URL(this.page.url());
      const fromUrl = currentUrl.searchParams.get('variant');
      if (fromUrl) {
        console.log(`[FlagTattoo] variant ID from URL parameter: ${fromUrl}`);
        return fromUrl;
      }
    } catch { /* URL parse error — continue */ }

    // 3. product.json からフォールバック
    try {
      const productUrl = item.productUrl.replace(/\/$/, '');
      const jsonUrl = `${productUrl}.json`;
      console.log(`[FlagTattoo] Fetching ${jsonUrl} for variant ID`);

      const productData = await this.page.evaluate(async (url) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        return res.json();
      }, jsonUrl);

      if (productData?.product?.variants) {
        const variants = productData.product.variants;

        // spec がある場合、タイトルでマッチ
        if (item.spec) {
          const matched = variants.find((v: any) =>
            v.title?.includes(item.spec) || item.spec?.includes(v.title),
          );
          if (matched) {
            console.log(`[FlagTattoo] variant ID from JSON (spec match "${item.spec}"): ${matched.id}`);
            return String(matched.id);
          }
        }

        // マッチしない場合、最初のバリアント
        if (variants.length > 0) {
          console.log(`[FlagTattoo] variant ID from JSON (first variant): ${variants[0].id}`);
          return String(variants[0].id);
        }
      }
    } catch (e) {
      console.warn(`[FlagTattoo] Failed to fetch product JSON:`, e);
    }

    return null;
  }

  // addSingleItemToCart は使わない（addToCart をオーバーライドしているため）
  async addSingleItemToCart(): Promise<boolean> {
    return true;
  }
}
