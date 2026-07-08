// Auto-extract cookies from Firefox and start Playwright with them.
// Usage: node scripts/playwright-helper.js
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function getFirefoxCookies(domain = 'luogu.com.cn') {
  // Find Firefox profile
  const ffDir = path.join(process.env.HOME, '.config/mozilla/firefox');
  const profiles = fs.readdirSync(ffDir).filter(f => f.includes('default-release'));
  if (!profiles.length) throw new Error('No Firefox profile found');
  const profileDir = path.join(ffDir, profiles[0]);
  const cookieFile = path.join(profileDir, 'cookies.sqlite');

  // Copy because Firefox locks it
  const tmpFile = '/tmp/ff_cookies_copy.sqlite';
  execSync(`cp "${cookieFile}" "${tmpFile}"`);

  // Use python to read sqlite
  const result = execSync(
    `python3 -c "
import sqlite3, json
db = sqlite3.connect('${tmpFile}')
rows = db.execute(\\"SELECT host, name, value FROM moz_cookies WHERE host LIKE '%${domain}%'\\").fetchall()
db.close()
print(json.dumps([{'host': r[0], 'name': r[1], 'value': r[2]} for r in rows]))
"`,
    { encoding: 'utf8' }
  );
  return JSON.parse(result.trim());
}

async function main() {
  const cookies = await getFirefoxCookies('luogu');
  console.log(`Got ${cookies.length} Luogu cookies from Firefox`);

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.addCookies(cookies.map(c => ({
    ...c,
    domain: c.host.startsWith('.') ? c.host : `.${c.host}`,
    path: '/',
  })));
  const page = await context.newPage();

  // Verify login
  await page.goto('https://www.luogu.com.cn/chat?_contentOnly=1');
  const text = await page.evaluate(() => document.body.textContent);
  try {
    const j = JSON.parse(text || '{}');
    console.log('Logged in!', j?.currentData?.latestMessages?.result?.length, 'conversations');
  } catch {
    console.log('Login failed — try logging in manually and re-run');
  }

  // Keep alive for interactive use
  console.log('Browser ready. Press Ctrl+C when done.');
  await new Promise(() => {}); // Keep running
}

main().catch(e => { console.error(e); process.exit(1); });
