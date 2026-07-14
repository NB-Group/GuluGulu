const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0];

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });
  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";

  // Do EVERYTHING in ONE evaluate call: WS open + XHR + join + wait
  var result = await page.evaluate(async function(args){
    return new Promise(function(resolve){
      var ws = new WebSocket("wss://ws.luogu.com.cn/ws");
      var timeout = setTimeout(function(){ ws.close(); resolve({error:"TIMEOUT"}); }, 25000);
      var msgs = [];

      ws.onopen = async function(){
        msgs.push("WS-OPEN");
        // Submit IDE code
        try {
          var r = await fetch("https://www.luogu.com.cn/api/ide_submit", {
            method:"POST",
            headers:{"Content-Type":"application/json","X-CSRF-TOKEN":args.csrf,"X-Requested-With":"XMLHttpRequest"},
            credentials:"same-origin",
            body: JSON.stringify({lang:28, code:args.code, input:"1 2", o2:"true"})
          });
          var j = await r.json();
          var rid = j?.data?.rid || "";
          msgs.push("RID:" + rid);
          if (rid) {
            ws.send(JSON.stringify({type:"join_channel", channel:"ide.track", channel_param: rid}));
            msgs.push("JOINED:"+rid);
          } else {
            clearTimeout(timeout); ws.close(); resolve({error:"no rid", msgs:msgs});
          }
        } catch(e) {
          clearTimeout(timeout); ws.close(); resolve({error:"fetch_err:"+e.message, msgs:msgs});
        }
      };

      ws.onmessage = function(e){
        try {
          var m = JSON.parse(e.data);
          msgs.push("MSG:"+(m._ws_type||m.type||"?"));
          if (m._ws_type === "server_broadcast") {
            clearTimeout(timeout); ws.close();
            resolve({ok:true, output: m.output, execute: m.execute, msgs:msgs});
          }
        } catch(ex){ msgs.push("RAW:"+e.data.slice(0,100)); }
      };

      ws.onerror = function(){ clearTimeout(timeout); resolve({error:"WS-ERROR", msgs:msgs}); };
    });
  }, {csrf:csrf, code:code});

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
