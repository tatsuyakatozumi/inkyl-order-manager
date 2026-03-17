import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // ---- Test 1: fetch MonotaRO ----
  const test1Results: Record<string, unknown> = {};
  try {
    const start = Date.now();
    const res = await fetch('https://www.monotaro.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(15000),
    });
    test1Results.status = res.status;
    test1Results.statusText = res.statusText;
    test1Results.headers = Object.fromEntries(res.headers.entries());
    test1Results.bodyLength = (await res.text()).length;
    test1Results.elapsed = Date.now() - start;
    test1Results.success = true;
  } catch (e: unknown) {
    const err = e as Error;
    test1Results.success = false;
    test1Results.error = err.message;
    test1Results.errorName = err.name;
  }
  results.test1_fetch_monotaro = test1Results;

  // ---- Test 2: fetch comparison across multiple sites ----
  const sites = [
    { name: 'Amazon', url: 'https://www.amazon.co.jp/' },
    { name: 'ASKUL', url: 'https://www.askul.co.jp/' },
    { name: 'MonotaRO_top', url: 'https://www.monotaro.com/' },
    { name: 'MonotaRO_login', url: 'https://www.monotaro.com/login/' },
    { name: 'Google', url: 'https://www.google.co.jp/' },
  ];

  const test2Results: Record<string, unknown>[] = [];
  for (const site of sites) {
    try {
      const start = Date.now();
      const res = await fetch(site.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      // Consume body to avoid leaks
      await res.text();
      test2Results.push({
        name: site.name,
        url: site.url,
        status: res.status,
        elapsed: Date.now() - start,
        success: true,
        finalUrl: res.url,
      });
    } catch (e: unknown) {
      const err = e as Error;
      test2Results.push({
        name: site.name,
        url: site.url,
        success: false,
        error: err.message,
        errorName: err.name,
      });
    }
  }
  results.test2_fetch_comparison = test2Results;

  // ---- Test 3: Playwright Chromium (same as MonotaRO base.ts config) ----
  const test3Results: Record<string, unknown> = {};
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();

      const start = Date.now();
      try {
        const response = await page.goto('https://www.monotaro.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        test3Results.status = response?.status();
        test3Results.url = page.url();
        test3Results.title = await page.title();
        test3Results.elapsed = Date.now() - start;
        test3Results.success = true;
      } catch (e: unknown) {
        const err = e as Error;
        test3Results.success = false;
        test3Results.error = err.message;
        test3Results.elapsed = Date.now() - start;
        try {
          test3Results.currentUrl = page.url();
          test3Results.currentTitle = await page.title();
          test3Results.bodyText = (await page.evaluate(() => document.body?.innerText?.substring(0, 500))) || '';
        } catch {
          // ignore
        }
      }
    } finally {
      await browser.close();
    }
  } catch (e: unknown) {
    const err = e as Error;
    test3Results.success = false;
    test3Results.error = err.message;
    test3Results.phase = 'browser_launch';
  }
  results.test3_playwright_chromium = test3Results;

  // ---- Test 4: Playwright Firefox (same as Amazon config) ----
  const test4Results: Record<string, unknown> = {};
  try {
    const { firefox } = await import('playwright');
    const browser = await firefox.launch({
      headless: true,
    });
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
        locale: 'ja-JP',
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();

      const start = Date.now();
      try {
        const response = await page.goto('https://www.monotaro.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        test4Results.status = response?.status();
        test4Results.url = page.url();
        test4Results.title = await page.title();
        test4Results.elapsed = Date.now() - start;
        test4Results.success = true;
      } catch (e: unknown) {
        const err = e as Error;
        test4Results.success = false;
        test4Results.error = err.message;
        test4Results.elapsed = Date.now() - start;
        try {
          test4Results.currentUrl = page.url();
          test4Results.currentTitle = await page.title();
          test4Results.bodyText = (await page.evaluate(() => document.body?.innerText?.substring(0, 500))) || '';
        } catch {
          // ignore
        }
      }
    } finally {
      await browser.close();
    }
  } catch (e: unknown) {
    const err = e as Error;
    test4Results.success = false;
    test4Results.error = err.message;
    test4Results.phase = 'browser_launch';
  }
  results.test4_playwright_firefox = test4Results;

  // ---- Test 5: Playwright Chromium with waitUntil: 'commit' ----
  const test5Results: Record<string, unknown> = {};
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      const start = Date.now();
      try {
        const response = await page.goto('https://www.monotaro.com/', {
          waitUntil: 'commit',
          timeout: 20000,
        });
        test5Results.status = response?.status();
        test5Results.url = page.url();
        test5Results.elapsed = Date.now() - start;
        test5Results.success = true;
        // Wait a bit after commit and check page state
        await page.waitForTimeout(3000);
        test5Results.titleAfterWait = await page.title();
        test5Results.bodyLength = await page.evaluate(() => document.body?.innerHTML?.length || 0);
      } catch (e: unknown) {
        const err = e as Error;
        test5Results.success = false;
        test5Results.error = err.message;
        test5Results.elapsed = Date.now() - start;
      }
    } finally {
      await browser.close();
    }
  } catch (e: unknown) {
    const err = e as Error;
    test5Results.success = false;
    test5Results.error = err.message;
  }
  results.test5_playwright_chromium_commit = test5Results;

  return NextResponse.json(results, { status: 200 });
}
