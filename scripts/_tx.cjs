const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9226");
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Inject cookies
  await context.addCookies([
    { name: "__client_id", value: "ykwak7wkwpf7pilqfpchwsnqutyxh74tzhz62qogbozqkdhf", domain: ".luogu.com.cn", path: "/" },
    { name: "_uid", value: "1601422", domain: ".luogu.com.cn", path: "/" },
    { name: "cf_clearance", value: "ymxe.4wJ4Ao8dvXQMD3xI1MW2pObiVfDAw4_yU06M2I-1783948476-1.2.1.1-hpwZKnOqA8ZQuudqcohzVmXn2mADLX35doOfq7HemnplnOnobiC9qoCuQVRxi_0GC3yKnz0il4cXmGhga9h71pXT7N2Zu0b.crSZ3_E_J7uvNWNb_Lp9iyqq.d7I2tK67XBQrRiNdafGTW9797VGVhsHheUtiKghzhhLeDszbnz0UwMwDTKEniC2u1AclomPSBCFKDvZGEeCc9L9xz653DzDKVndKQyckDI7D8aJ11JLSFyYHQkv0nE5oguC36C4cfOh6HQjTjEP0FsT_DPUmrXw1Wg8Nu4kg_mqdfRhry4CWml_VyXxE2tuyuI8LfADUXC.3P0ahgDxKa6EYh.qVA", domain: ".luogu.com.cn", path: "/" },
  ]);

  // Navigate to IDE page - it should show us as logged in
  await page.goto("https://www.luogu.com.cn/problem/P1001#submit", { waitUntil: "domcontentloaded", timeout: 30000 }); await page.waitForTimeout(5000);
  await page.waitForTimeout(3000);

  // List all buttons on the page
  const btns = await page.evaluate(() => {
    return [...document.querySelectorAll("button")].map(b => b.textContent?.trim()?.slice(0, 40)).filter(Boolean);
  });
  console.log("Buttons:", JSON.stringify(btns));
  console.log("URL:", await page.evaluate(() => location.href));
  // Check login state
  const loggedIn = await page.evaluate(() => {
    return !document.body.textContent?.includes("登录账号");
  });
  console.log("Logged in:", loggedIn);

  if (!loggedIn) {
    console.log("Cookies not working, checking...");
    const cookies = await context.cookies(".luogu.com.cn");
    console.log("Cookies:", cookies.map(c => c.name + "=" + c.value.slice(0, 20)));
    await browser.close();
    return;
  }

  // Get CSRF
  const csrf = await page.evaluate(() => {
    const m = document.querySelector("meta[name=csrf-token]");
    return m?.getAttribute("content") || "";
  });
  console.log("CSRF:", csrf.slice(0, 30) + "...");

  // Test IDE submit
  const code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";
  const params = new URLSearchParams({ code, lang: "28", input: "1 2", o2: "1", "csrf-token": csrf });

  const submitResult = await page.evaluate(async (body) => {
    const r = await fetch("https://www.luogu.com.cn/api/ide_submit", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
      body,
    });
    return { status: r.status, body: await r.text() };
  }, params.toString());

  console.log("IDE submit:", submitResult.status);
  const rid = JSON.parse(submitResult.body)?.data?.rid;
  console.log("RID:", rid);

  if (!rid) { await browser.close(); return; }

  // Test WS
  const wsResult = await page.evaluate((rid) => {
    return new Promise(resolve => {
      const ws = new WebSocket("wss://ws.luogu.com.cn/ws");
      const timeout = setTimeout(() => resolve({ error: "timeout", msgs: msgs }), 20000);
      const msgs = [];
      ws.onopen = () => {
        msgs.push("open");
        ws.send(JSON.stringify({ type: "join_channel", channel: "ide.track", channel_param: rid }));
        msgs.push("sent-join:" + rid);
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          msgs.push(m._ws_type || m.type || "?");
          if (m._ws_type === "server_broadcast") {
            clearTimeout(timeout);
            ws.close();
            resolve({ ok: true, output: m.output, execute: m.execute, msgs });
          }
        } catch { msgs.push("raw:" + e.data.slice(0, 50)); }
      };
      ws.onerror = () => { clearTimeout(timeout); resolve({ error: "ws-error", msgs }); };
      ws.onclose = (e) => { msgs.push("close:" + e.code); };
    });
  }, rid);

  console.log("WS result:", JSON.stringify(wsResult, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
