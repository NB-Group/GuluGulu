/**
 * 洛谷 API 逆向抓取脚本
 * 使用 Playwright 访问各页面，抓取网络请求和 lentille-context 数据
 * 用法: npx esno scripts/reverse-api.ts
 */
import { chromium } from 'playwright';
import * as fs from 'fs-extra';
import * as path from 'path';

const OUT_DIR = path.resolve('scripts/api-data');
const BASE = 'https://www.luogu.com.cn';

interface PageTarget {
  name: string;
  url: string;
  extractLentille: boolean;
}

const PAGES: PageTarget[] = [
  { name: 'home', url: `${BASE}/`, extractLentille: true },
  { name: 'problem-list', url: `${BASE}/problem/list`, extractLentille: true },
  { name: 'problem-detail', url: `${BASE}/problem/P1001`, extractLentille: true },
  { name: 'problem-detail-contentonly', url: `${BASE}/problem/P1001?_contentOnly=1`, extractLentille: false },
  { name: 'contest-list', url: `${BASE}/contest/list`, extractLentille: true },
  { name: 'contest-detail', url: `${BASE}/contest/337891`, extractLentille: true },
  { name: 'ranking', url: `${BASE}/ranking`, extractLentille: true },
  { name: 'discuss-list', url: `${BASE}/discuss`, extractLentille: true },
  { name: 'discuss-detail', url: `${BASE}/discuss/1`, extractLentille: true },
  { name: 'discuss-detail-contentonly', url: `${BASE}/discuss/1?_contentOnly=1`, extractLentille: false },
  { name: 'user-profile', url: `${BASE}/user/1`, extractLentille: true },
  { name: 'training-list', url: `${BASE}/training/list`, extractLentille: true },
  { name: 'training-detail', url: `${BASE}/training/1`, extractLentille: true },
  { name: 'record-list', url: `${BASE}/record/list`, extractLentille: true },
  { name: 'record-list-contentonly', url: `${BASE}/record/list?_contentOnly=1`, extractLentille: false },
  { name: 'article', url: `${BASE}/article`, extractLentille: true },
  { name: 'search', url: `${BASE}/search?keyword=test`, extractLentille: false },
  { name: 'solution', url: `${BASE}/problem/solution/P1001`, extractLentille: true },
];

async function main() {
  await fs.ensureDir(OUT_DIR);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // 收集 XHR/Fetch 请求
  const apiRequests: Record<string, any[]> = {};

  page.on('request', (req) => {
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      const name = page.url().replace(BASE, '').split('?')[0] || '/';
      if (!apiRequests[name]) apiRequests[name] = [];
      apiRequests[name].push({
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
        resourceType: req.resourceType(),
      });
    }
  });

  page.on('response', async (resp) => {
    const req = resp.request();
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      const name = page.url().replace(BASE, '').split('?')[0] || '/';
      const entry = apiRequests[name]?.find((r: any) => r.url === req.url() && !r.response);
      if (entry) {
        try {
          const ct = resp.headers()['content-type'] || '';
          if (ct.includes('json')) {
            entry.responseBody = await resp.json().catch(() => null);
          } else {
            entry.responseBody = (await resp.text().catch(() => null))?.slice(0, 2000);
          }
          entry.responseStatus = resp.status();
          entry.responseHeaders = resp.headers();
        } catch { /* ignore */ }
      }
    }
  });

  const results: Record<string, any> = {};

  for (const target of PAGES) {
    console.log(`\n▶ ${target.name}: ${target.url}`);
    try {
      // Wait for any in-flight navigation to settle before starting new one
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      const entry: any = { url: page.url(), title: await page.title() };

      if (target.extractLentille) {
        const lentilleJson = await page.evaluate(() => {
          const el = document.querySelector('#lentille-context');
          if (!el?.textContent) return null;
          try { return JSON.parse(el.textContent); } catch {
            return { _error: 'JSON parse failed', _preview: el.textContent.slice(0, 500) };
          }
        });
        entry.lentilleContext = lentilleJson;
      }

      entry.bodyPreview = await page.evaluate(() => document.body.textContent?.slice(0, 3000) || '');
      entry.apiCalls = apiRequests[page.url().replace(BASE, '').split('?')[0]] || [];
      results[target.name] = entry;
    } catch (e: any) {
      results[target.name] = { error: e.message };
      console.error(`  ✗ ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'all-pages.json'), JSON.stringify(results, null, 2));
  console.log(`\n✅ Done → ${path.join(OUT_DIR, 'all-pages.json')}`);

  for (const [name, data] of Object.entries(results)) {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  }

  const allApis = new Set<string>();
  for (const [, data] of Object.entries(results)) {
    for (const call of (data as any).apiCalls || []) {
      const u = new URL(call.url);
      allApis.add(`${call.method} ${u.pathname}${u.search ? '?' + u.search : ''}`);
    }
  }
  await fs.writeFile(path.join(OUT_DIR, 'api-endpoints.txt'), [...allApis].sort().join('\n'));
  console.log(`Unique API endpoints: ${allApis.size}`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
