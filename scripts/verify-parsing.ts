/**
 * 离线验证脚本 — 用 Playwright 抓取真实洛谷数据，模拟各组件的数据解析逻辑
 * 用法: npx esno scripts/verify-parsing.ts
 */
import { chromium } from 'playwright';

const BASE = 'https://www.luogu.com.cn';

interface TestCase {
  name: string
  url: string
  parse: (json: any) => { ok: boolean; detail: string }
}

const tests: TestCase[] = [
  {
    name: 'ProblemDetail',
    url: `${BASE}/problem/P1001`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const p = d?.problem;
      if (!p) return { ok: false, detail: 'no data.problem' };
      const r: string[] = [];
      r.push(`pid=${p.pid}`);
      const title = p.contenu?.name || p.content?.name || p.name || '';
      if (!title) return { ok: false, detail: 'no title (contenu.name / content.name / name)' };
      r.push(`title="${title.slice(0, 40)}"`);
      const desc = p.contenu?.description || p.content?.description || '';
      r.push(`desc=${desc.length}chars`);
      const limits = d.limits || p.limits || {};
      const mem = limits.memory?.[0] || 0;
      if (!mem) return { ok: false, detail: 'no limits.memory[0] at data.limits' };
      r.push(`memory=${mem}KB`);
      const samples = d.samples || p.samples || [];
      r.push(`samples=${samples.length}`);
      return { ok: true, detail: r.join(' | ') };
    },
  },
  {
    name: 'ContestList',
    url: `${BASE}/contest/list`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const c = d?.contests?.result;
      if (!Array.isArray(c) || c.length === 0)
        return { ok: false, detail: 'no contests.result' };
      return { ok: true, detail: `${c.length} contests, first="${c[0].name?.slice(0, 30)}"` };
    },
  },
  {
    name: 'ContestDetail',
    url: `${BASE}/contest/332884`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const contest = d?.contest; const
        cp = d?.contestProblems;
      if (!contest) return { ok: false, detail: 'no contest' };
      if (!Array.isArray(cp)) return { ok: false, detail: 'no contestProblems' };
      const cpi = cp[0];
      return { ok: true, detail: `${cp.length} probs, first=${cpi?.no}:${cpi?.problem?.pid}` };
    },
  },
  {
    name: 'Ranking',
    url: `${BASE}/ranking`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const r = d?.ranking?.result;
      if (!Array.isArray(r) || r.length === 0)
        return { ok: false, detail: 'no ranking.result' };
      return { ok: true, detail: `${r.length} users` };
    },
  },
  {
    name: 'DiscussList',
    url: `${BASE}/discuss`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const p = d?.posts?.result;
      if (!Array.isArray(p) || p.length === 0)
        return { ok: false, detail: 'no posts.result' };
      return { ok: true, detail: `${p.length} posts` };
    },
  },
  {
    name: 'TrainingList',
    url: `${BASE}/training/list`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const t = d?.trainings?.result;
      if (!Array.isArray(t) || t.length === 0)
        return { ok: false, detail: 'no trainings.result' };
      return { ok: true, detail: `${t.length} trainings` };
    },
  },
  {
    name: 'RecordList',
    url: `${BASE}/record/list?_contentOnly=1`,
    parse(json: any) {
      const recs = json?.data?.records || json?.currentData?.records;
      if (!recs?.result || recs.result.length === 0)
        return { ok: false, detail: 'no records.result' };
      const r = recs.result[0];
      return { ok: true, detail: `${recs.result.length} recs, rid=${r.id}` };
    },
  },
  {
    name: 'Chat',
    url: `${BASE}/chat?_contentOnly=1`,
    parse(json: any) {
      const msgs = json?.data?.latestMessages || json?.currentData?.latestMessages;
      if (!msgs?.result || msgs.result.length === 0)
        return { ok: false, detail: 'no latestMessages' };
      return { ok: true, detail: `${msgs.result.length} msgs, from=${msgs.result[0].sender?.name}` };
    },
  },
  {
    name: 'UserProfile',
    url: `${BASE}/user/1`,
    parse(json: any) {
      const d = json?.data || json?.currentData || {};
      const u = d?.user;
      if (!u?.uid) return { ok: false, detail: 'no user.uid' };
      return { ok: true, detail: `user=${u.name}, uid=${u.uid}` };
    },
  },
];

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  let passed = 0; let
    failed = 0;

  for (const test of tests) {
    process.stdout.write(`${test.name.padEnd(18)} `);
    try {
      await page.goto(test.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const json = await page.evaluate(() => {
        const el = document.getElementById('lentille-context');
        if (el?.textContent) {
          try { return JSON.parse(el.textContent); } catch { return { _err: 'JSON parse' }; }
        }
        try { return JSON.parse(document.body.textContent || '{}'); } catch { return { _err: 'body parse' }; }
      });
      if ((json as any)._err) { console.log(`❌ ${(json as any)._err}`); failed++; continue; }
      const result = test.parse(json);
      if (result.ok) { console.log(`✅ ${result.detail}`); passed++; }
      else { console.log(`❌ ${result.detail}`); failed++; }
    } catch (e: any) { console.log(`❌ ${e.message.slice(0, 80)}`); failed++; }
  }
  console.log(`\n${passed}/${tests.length} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}
main();
