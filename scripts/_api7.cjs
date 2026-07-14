const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0];

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });
  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";

  var result = await page.evaluate(async function(args){
    return new Promise(function(resolve){
      var msgs = [];
      var ws = new WebSocket("wss://ws.luogu.com.cn/ws");
      var timeout = setTimeout(function(){ ws.close(); resolve({error:"timeout",msgs:msgs}); }, 30000);

      ws.onopen = function(){
        msgs.push("WS-OPEN at "+Date.now());
        // WAIT 3 seconds before submitting (let server register WS)
        setTimeout(async function(){
          msgs.push("SUBMITTING at "+Date.now());
          try {
            var r = await fetch("https://www.luogu.com.cn/api/ide_submit", {
              method:"POST",
              headers:{"Content-Type":"application/json","X-CSRF-TOKEN":args.csrf,"X-Requested-With":"XMLHttpRequest"},
              credentials:"same-origin",
              body: JSON.stringify({lang:28, code:args.code, input:"1 2", o2:"true"})
            });
            var j = await r.json();
            var rid = j?.data?.rid || "";
            msgs.push("RID:"+rid);
            if (rid) {
              ws.send(JSON.stringify({type:"join_channel", channel:"ide.track", channel_param: rid}));
              msgs.push("JOINED:"+rid);
            }
          } catch(e){ msgs.push("FETCH-ERR:"+e.message); }
        }, 3000);
      };

      ws.onmessage = function(e){
        try {
          var m = JSON.parse(e.data);
          msgs.push("MSG:"+(m._ws_type||"?")+"-"+JSON.stringify(m).slice(0,200));
          if (m._ws_type === "server_broadcast") { clearTimeout(timeout); ws.close(); resolve({ok:true, output:m.output, msgs:msgs}); }
        } catch(ex){}
      };
      ws.onclose = function(e){ msgs.push("CLOSE:"+e.code); };
      ws.onerror = function(){ msgs.push("ERR"); };
    });
  }, {csrf:csrf, code:code});

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
