const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const page = browser.contexts()[0].pages()[0];

  await page.goto('https://www.luogu.com.cn/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);
  const csrf = await page.evaluate(() => {
    const m = document.querySelector('meta[name=csrf-token]');
    return m?.getAttribute('content') || '';
  });
  console.log('CSRF:', csrf.slice(0, 40) + '...');

  const code = '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}';
  const input = '1 2';
  const params = new URLSearchParams({ code, lang: '28', input, o2: '1', 'csrf-token': csrf });

  const res = await page.evaluate(async (b) => {
    const r = await fetch('https://www.luogu.com.cn/api/ide_submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'same-origin',
      body: b,
    });
    return { status: r.status, body: await r.text() };
  }, params.toString());
  console.log('IDE submit:', res.body.slice(0, 200));

  const rid = JSON.parse(res.body)?.data?.rid;
  if (!rid) { console.log('No rid'); await browser.close(); return; }
  console.log('RID:', rid);

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const recordRes = await page.evaluate(async (r) => {
      const resp = await fetch('https://www.luogu.com.cn/record/' + r + '?_contentOnly=1', { credentials: 'same-origin' });
      try { return { ok: true, json: JSON.parse(await resp.text()) }; }
      catch { return { ok: false }; }
    }, rid);

    if (recordRes.ok && recordRes.json.currentData?.record) {
      const rec = recordRes.json.currentData.record;
      console.log('Poll #' + (i+1) + ': status=' + rec.status + ' score=' + rec.score + ' time=' + rec.time + 'ms mem=' + rec.memory + 'KB');
      const subtasks = rec.detail?.judgeResult?.subtasks;
      if (subtasks) {
        for (const st of subtasks) {
          for (const tc of (st.testCases || [])) {
            console.log('  test', tc.id, 'status=' + tc.status, 'score=' + tc.score, 'time=' + tc.time + 'ms mem=' + tc.memory + 'KB desc=' + tc.description);
          }
        }
      }
      const compile = rec.compileResult;
      if (compile) console.log('  compile:', compile.success ? 'OK' : compile.message?.slice(0, 200));

      if (rec.status === 12 || rec.status === 2 || (rec.status >= 6)) {
        console.log('Final! Recording full record structure...');
        console.log('Record keys:', Object.keys(rec));
        break;
      }
    }
  }
  await browser.close();
})();
