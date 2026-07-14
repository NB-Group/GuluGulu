const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

  // Set cookies
  await browser.contexts()[0].addCookies([
    {name:"__client_id",value:"ykwak7wkwpf7pilqfpchwsnqutyxh74tzhz62qogbozqkdhf",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"_uid",value:"1601422",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
  ]);

  await page.goto("https://www.luogu.com.cn/problem/P1001", {waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(5000);

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });
  console.log("CSRF:", csrf.slice(0,30));

  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";
  var input = "1 2";

  // Test MANY possible self-test endpoints
  var tests = [
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:input,o2:"true"}), ct:"application/json", csrf:true},
    {url:"/api/ide_submit", body:"code="+encodeURIComponent(code)+"&lang=28&input="+encodeURIComponent(input)+"&o2=1", ct:"application/x-www-form-urlencoded", csrf:true},
    {url:"/fe/api/problem/selfTest/P1001", body:JSON.stringify({lang:28,code:code,input:input,o2:true}), ct:"application/json", csrf:true},
    {url:"/fe/api/problem/ide/P1001", body:JSON.stringify({lang:28,code:code,input:input,o2:true}), ct:"application/json", csrf:true},
    {url:"/fe/api/ide/run", body:JSON.stringify({lang:28,code:code,input:input,o2:"true"}), ct:"application/json", csrf:true},
    {url:"/api/ide/run", body:JSON.stringify({lang:28,code:code,input:input,o2:"true"}), ct:"application/json", csrf:true},
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:input,o2:"true",pid:"P1001"}), ct:"application/json", csrf:true},
    // Try GET-style results (maybe the RID is queryable differently)
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:input,o2:"true",_returnOutput:true}), ct:"application/json", csrf:true},
  ];

  for (var i=0;i<tests.length;i++){
    var t = tests[i];
    var headers = {"Content-Type":t.ct};
    if (t.csrf) headers["X-CSRF-TOKEN"] = csrf;
    headers["X-Requested-With"] = "XMLHttpRequest";
    
    var r = await page.evaluate(async function(args){
      try {
        var r = await fetch("https://www.luogu.com.cn"+args.url, {
          method:"POST", headers:args.headers, credentials:"same-origin", body:args.body
        });
        return {s:r.status, b:(await r.text()).slice(0,500)};
      } catch(e) { return {s:0, b:e.message}; }
    }, {url:t.url, headers:headers, body:t.body});
    
    var label = t.url + " [" + t.ct.split("/")[1] + "]";
    console.log(label + ":", r.s, r.b.slice(0,200));
  }

  await browser.close();
})();
