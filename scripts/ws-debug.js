import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://localhost:9224");
const page = browser.contexts()[0].pages()[0];
await page.waitForTimeout(2000);

// Get CSRF from IDE page
const csrf = await page.evaluate(() => document.querySelector("meta[name=csrf-token]")?.getAttribute("content") || "");

// Submit IDE
const code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";
const p = "code=" + encodeURIComponent(code) + "&lang=28&input=" + encodeURIComponent("1 2") + "&o2=1&csrf-token=" + encodeURIComponent(csrf);
const rid = await page.evaluate(async (body) => {
  const r = await fetch("https://www.luogu.com.cn/api/ide_submit", {
    method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, credentials:"same-origin", body
  });
  return (await r.json())?.data?.rid || "";
}, p);
console.log("RID:", rid);

if (!rid) { console.log("No RID — IDE submit failed"); await browser.close(); process.exit(1); }

// Monitor WS — capture EVERY message until we get non-heartbeat content
const allMsgs = await page.evaluate((rid) => {
  return new Promise((resolve) => {
    let msgs = [];
    const ws = new WebSocket("wss://ws.luogu.com.cn/ws");
    const timeout = setTimeout(() => { ws.close(); resolve({error:"TIMEOUT after 25s", msgs}); }, 25000);
    ws.onopen = () => {
      msgs.push({t:"open"});
      ws.send(JSON.stringify({type:"join_channel",channel:"ide.track",channel_param:rid}));
      msgs.push({t:"sent", payload: JSON.stringify({type:"join_channel",channel:"ide.track",channel_param:rid})});
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        msgs.push({t:"msg", type: m._ws_type || m.type || "?", keys: Object.keys(m), data: m});
        if (m._ws_type && m._ws_type !== "heartbeat" && m._ws_type !== "join_result") {
          clearTimeout(timeout); ws.close(); resolve({ok:"non-standard msg", msgs});
        }
      } catch(ex) {
        msgs.push({t:"raw", data: e.data.slice(0, 300)});
        clearTimeout(timeout); ws.close(); resolve({ok:"raw non-JSON", msgs});
      }
    };
    ws.onerror = (e) => { msgs.push({t:"error"}); clearTimeout(timeout); resolve({error:"ws-error", msgs}); };
    ws.onclose = (e) => { msgs.push({t:"close", code: e.code}); };
  });
}, rid);

console.log("WS messages (" + allMsgs.msgs.length + "):");
for (const m of allMsgs.msgs) {
  console.log("  " + JSON.stringify(m).slice(0, 400));
}
if (allMsgs.error) console.log("ERROR:", allMsgs.error);
if (allMsgs.ok) console.log("OK:", allMsgs.ok);

await browser.close();
