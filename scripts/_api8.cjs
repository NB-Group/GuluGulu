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
        msgs.push("WS-OPEN");
        // Use XHR (not fetch) like the real IDE page does
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "https://www.luogu.com.cn/api/ide_submit");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("X-CSRF-TOKEN", args.csrf);
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        xhr.withCredentials = true;
        xhr.onload = function(){
          msgs.push("XHR:"+xhr.status);
          try {
            var j = JSON.parse(xhr.responseText);
            var rid = j?.data?.rid || "";
            msgs.push("RID:"+rid);
            if (rid) {
              ws.send(JSON.stringify({type:"join_channel", channel:"ide.track", channel_param: rid}));
              msgs.push("JOINED:"+rid);
            }
          } catch(e){ msgs.push("PARSE-ERR:"+e.message); }
        };
        xhr.onerror = function(){ msgs.push("XHR-ERR"); };
        xhr.send(JSON.stringify({lang:28, code:args.code, input:"1 2", o2:"true"}));
      };

      ws.onmessage = function(e){
        try {
          var m = JSON.parse(e.data);
          msgs.push("MSG:"+(m._ws_type||"?"));
          if (m._ws_type === "server_broadcast") { clearTimeout(timeout); ws.close(); resolve({ok:true, output:m.output, execute:m.execute, msgs:msgs}); }
        } catch(ex){}
      };
      ws.onclose = function(e){ msgs.push("CLOSE:"+e.code); };
    });
  }, {csrf:csrf, code:code});

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
