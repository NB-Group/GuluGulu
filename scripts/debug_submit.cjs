const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  await ctx.addCookies([{ name: '_uid', value: '1239371', domain: '.luogu.com.cn', path: '/' }, { name: '__client_id', value: 'yirebuvrzvezm6jxivm67n3lkiviudhbvdx7yblsnrmvoxxx', domain: '.luogu.com.cn', path: '/' }, { name: 'C3VK', value: 'a5e882', domain: '.luogu.com.cn', path: '/' }]);
  const p = await ctx.newPage();

  // Navigate to a problem page first to get CSRF
  await p.goto('https://www.luogu.com.cn/problem/P1001', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await p.waitForTimeout(2000);
  
  // Get CSRF token
  const csrf = await p.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '');

  // Try submitting code (will trigger CF if needed, or return normally)
  console.log('CSRF:', csrf.slice(0,10) + '...');
  
  // Monitor network for the submit request
  p.on('response', async (resp) => {
    if (resp.url().includes('/fe/api/problem/submit/')) {
      console.log('Submit response status:', resp.status());
      console.log('Content-Type:', resp.headers()['content-type']);
      const body = await resp.text().catch(() => '');
      console.log('Response body (first 500):', body.slice(0, 500));
    }
  });

  // Do the actual submit
  const result = await p.evaluate(async ({ csrf }) => {
    try {
      const res = await fetch('https://www.luogu.com.cn/fe/api/problem/submit/P1001', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf,
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ code: '#include<iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}', lang: 28, enableO2: 0 }),
      });
      const ct = res.headers.get('content-type') || '';
      const text = await res.text();
      return { status: res.status, contentType: ct, body: text.slice(0, 500) };
    } catch(e) {
      return { error: e.message };
    }
  }, { csrf });
  
  console.log('\n=== Submit result ===');
  console.log(JSON.stringify(result, null, 2));

  // Also check if there's a CF challenge on the problem page itself
  const pageText = await p.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('\nPage text:', pageText);

  await b.close();
})();
