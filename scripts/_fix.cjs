const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0];
  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });

  var result = await page.evaluate(async function(args){
    return new Promise(function(resolve){
      var all = [];
      var ws = new WebSocket("wss://ws.luogu.com.cn/ws");
      var t = setTimeout(function(){ ws.close(); resolve({error:"timeout",all:all}); }, 30000);
      ws.onopen = function(){
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "https://www.luogu.com.cn/api/ide_submit");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("X-CSRF-TOKEN", args.csrf);
        xhr.withCredentials = true;
        xhr.onload = function(){
          try {
            var j = JSON.parse(xhr.responseText);
            var rid = String(j?.data?.rid || "");  // CONVERT TO STRING
            all.push({t:"rid",v:rid});
            if (rid) {
              var msg = JSON.stringify({type:"join_channel",channel:"ide.track",channel_param:rid});
              all.push({t:"send",v:msg});
              ws.send(msg);
            }
          } catch(e){ all.push({t:"err",v:e.message}); }
        };
        xhr.send(JSON.stringify({lang:28, code:"#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}", input:"1 2", o2:"true"}));
      };
      ws.onmessage = function(e){
        try {
          var m = JSON.parse(e.data);
          all.push({t:"recv",ws_type:m._ws_type,param:m._channel_param});
          if (m._ws_type === "server_broadcast") { clearTimeout(t); ws.close(); resolve({ok:true,output:m.output,execute:m.execute,all:all}); }
        } catch(ex){ all.push({t:"raw",v:e.data.slice(0,100)}); }
      };
    });
  }, {csrf:csrf});

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
