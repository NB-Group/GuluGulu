const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await ctx.addInitScript(function(){
    window.__log = [];
    var OWS = WebSocket;
    window.WebSocket = function(url) {
      var ws = new OWS(url);
      window.__log.push("WS-NEW:"+url.slice(0,40));
      ws.addEventListener("open", function(){ window.__log.push("WS-OPEN"); });
      ws.addEventListener("message", function(e){
        try { var m = JSON.parse(e.data); window.__log.push("WS-MSG:"+JSON.stringify(m).slice(0,500)); } catch(ex){}
      });
      return ws;
    };
    var OF = window.fetch;
    window.fetch = function(url, opts) {
      var res = OF.apply(window, arguments);
      res.then(async function(r){
        var c = r.clone();
        var t = await c.text();
        if (String(url).includes("ide")) window.__log.push("FETCH:"+r.status+":"+t.slice(0,300));
      });
      return res;
    };
  });

  await page.goto("https://www.luogu.com.cn/problem/P1001#ide", {waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(5000);

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });
  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";
  var body = JSON.stringify({lang:28, code:code, input:"1 2", o2:"true"});

  // First submit the code to get RID
  var rid = await page.evaluate(async function(args){
    var r = await fetch("https://www.luogu.com.cn/api/ide_submit",{
      method:"POST", headers:{"Content-Type":"application/json","X-CSRF-TOKEN":args.csrf,"X-Requested-With":"XMLHttpRequest"}, credentials:"same-origin", body:args.body
    });
    var j = await r.json();
    return j?.data?.rid || "";
  }, {csrf:csrf, body:body});
  console.log("RID:", rid);

  if (rid) {
    // Open WS AFTER submit, join channel for the RID
    var wsResult = await page.evaluate(function(rid){
      return new Promise(function(resolve){
        var ws = new WebSocket("wss://ws.luogu.com.cn/ws");
        var timeout = setTimeout(function(){ ws.close(); resolve("TIMEOUT"); }, 20000);
        ws.onopen = function(){
          ws.send(JSON.stringify({type:"join_channel",channel:"ide.track",channel_param:rid}));
        };
        ws.onmessage = function(e){
          try {
            var m = JSON.parse(e.data);
            if (m._ws_type === "server_broadcast") {
              clearTimeout(timeout); ws.close();
              resolve("OUTPUT:" + JSON.stringify(m));
            }
          } catch(ex){}
        };
        ws.onerror = function(){ clearTimeout(timeout); resolve("WS-ERROR"); };
      });
    }, rid);
    console.log("WS:", wsResult.slice(0, 500));
  }

  var log = await page.evaluate(function(){ return window.__log || []; });
  console.log("__log ("+log.length+")");
  for (var i=0;i<log.length;i++) console.log(log[i].slice(0,300));

  await browser.close();
})();
