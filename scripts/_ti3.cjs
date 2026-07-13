const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9226");
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Inject interceptor before page load
  await context.addInitScript(() => {
    const OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new OrigXHR();
      const oOpen = xhr.open;
      xhr.open = function(m, u) {
        this.__method = m; this.__url = u;
        return oOpen.apply(xhr, arguments);
      };
      const oSend = xhr.send;
      xhr.send = function(body) {
        if (this.__url && this.__url.includes("ide_submit")) {
          console.log("IDE_SUBMIT_CAPTURED:", { method: this.__method, url: this.__url, body: body, headers: this.__reqHeaders });
        }
        return oSend.call(xhr, body);
      };
      const oSetHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function(k, v) {
        if (!this.__reqHeaders) this.__reqHeaders = {};
        this.__reqHeaders[k] = v;
        return oSetHeader.call(xhr, k, v);
      };
      return xhr;
    };
  });

  await page.goto("https://www.luogu.com.cn/ide", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Capture console
  page.on("console", msg => { if (msg.text().includes("IDE_SUBMIT")) console.log("PAGE:", msg.text()); });

  // Click Run
  await page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) {
      if (b.textContent?.trim() === "运行") { b.click(); break; }
    }
  });
  console.log("Run clicked");
  await page.waitForTimeout(10000);

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
