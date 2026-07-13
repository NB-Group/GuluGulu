const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const page = browser.contexts()[0].pages()[0];
  await page.goto('https://www.luogu.com.cn/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);
  const csrf = await page.evaluate(() => document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || '');
  const code = '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}';
  const input = '1 2';
  const params = new URLSearchParams({ code, lang: '28', input, o2: '1', 'csrf-token': csrf });
  const submitRes = await page.evaluate(async (b) => {
    const r = await fetch('https://www.luogu.com.cn/api/ide_submit', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, credentials: 'same-origin', body: b,
    });
    return { status: r.status, body: await r.text() };
  }, params.toString());
  const rid = JSON.parse(submitRes.body)?.data?.rid;
  console.log('RID:', rid);
  for (const url of [
    'https://www.luogu.com.cn/record/' + rid + '?_contentOnly=1',
  ]) {
    const r = await page.evaluate(async (u) => {
      const resp = await fetch(u, { credentials: 'same-origin' });
      return { status: resp.status, body: (await resp.text()).slice(0, 1000) };
    }, url);
    console.log('Record response:', r.status, r.body.slice(0, 600));
  }
  await browser.close();
})();
