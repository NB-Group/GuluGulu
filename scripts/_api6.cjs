const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0];

  // Check cookies present
  var cookies = await browser.contexts()[0].cookies(".luogu.com.cn");
  console.log("Cookies:", cookies.map(function(c){return c.name+"="+c.value.slice(0,15)}));

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });

  // Test WS with ALL events
  var wsResult = await page.evaluate(function(args){
    return new Promise(function(resolve){
      var ws = new WebSocket("wss://ws.luogu.com.cn/ws");
      var all = [];
      var t = setTimeout(function(){ resolve({error:"timeout",events:all}); }, 15000);

      ws.onopen = function(){ all.push("OPEN"); };
      ws.onclose = function(e){ all.push("CLOSE:"+e.code+":"+e.reason); clearTimeout(t); resolve({error:"closed",events:all}); };
      ws.onerror = function(e){ all.push("ERROR"); };
      ws.onmessage = function(e){
        try{
          var m = JSON.parse(e.data);
          all.push("MSG:"+(m._ws_type||m.type||"?"));
          if (m._ws_type === "server_broadcast"){ clearTimeout(t); ws.close(); resolve({ok:true,output:m.output,events:all}); }
        }catch(ex){ all.push("RAW:"+e.data.slice(0,50)); }
      };
    });
  }, {csrf:csrf});

  console.log(JSON.stringify(wsResult, null, 2));
  await browser.close();
})();
