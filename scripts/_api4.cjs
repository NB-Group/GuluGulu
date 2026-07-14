const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0];

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });
  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";

  // Submit
  var r1 = await page.evaluate(async function(args){
    var r = await fetch("https://www.luogu.com.cn/api/ide_submit", {
      method:"POST", headers:{"Content-Type":"application/json","X-CSRF-TOKEN":args.csrf}, credentials:"same-origin", body:args.body
    });
    return {s:r.status, b:await r.text()};
  }, {csrf:csrf, body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"})});
  
  var rid = JSON.parse(r1.b)?.data?.rid;
  console.log("RID:", rid);

  if (rid) {
    // Try GET endpoints for the result
    var getTests = [
      "/api/ide_submit?rid=" + rid,
      "/api/ide/result/" + rid,
      "/api/ide/status/" + rid,
      "/fe/api/ide/result/" + rid,
      "/record/" + rid + "?_contentOnly=1",
    ];
    
    for (var i=0;i<getTests.length;i++){
      var u = getTests[i];
      var r = await page.evaluate(async function(url){
        try {
          var r = await fetch("https://www.luogu.com.cn"+url, {credentials:"same-origin"});
          return {s:r.status, b:(await r.text()).slice(0,400)};
        } catch(e) { return {s:0, b:e.message}; }
      }, u);
      console.log("GET "+u+":", r.s, r.b.slice(0,200));
    }
  }

  await browser.close();
})();
