const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const page = await browser.contexts()[0].pages()[0];
  
  await page.goto("https://www.luogu.com.cn/problem/P1001",{waitUntil:"domcontentloaded",timeout:15000});
  await page.waitForTimeout(3000);
  
  var csrf = await page.evaluate(function(){return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||""});
  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";
  
  // Test ALL variants
  var tests = [
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", name:"JSON o2=true"},
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"1"}), ct:"application/json", name:"JSON o2=1"},
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:1}), ct:"application/json", name:"JSON o2=1num"},
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:true}), ct:"application/json", name:"JSON o2=true"},
    {url:"/api/ide_submit?wait=1", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", name:"JSON +wait=1"},
    {url:"/api/ide/submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", name:"/api/ide/submit"},
    {url:"/fe/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", name:"/fe/api/ide_submit"},
  ];
  
  for (var i=0;i<tests.length;i++){
    var t = tests[i];
    var r = await page.evaluate(async function(args){
      try{
        var r=await fetch("https://www.luogu.com.cn"+args.url,{method:"POST",headers:{"Content-Type":args.ct,"X-CSRF-TOKEN":args.csrf,"X-Requested-With":"XMLHttpRequest"},credentials:"same-origin",body:args.body});
        var t=await r.text();
        return t.slice(0,500);
      }catch(e){return "ERR:"+e.message}
    },{url:t.url,ct:t.ct,body:t.body,csrf:csrf});
    console.log(t.name+":",r.slice(0,200));
  }
  
  await browser.close();
})();
