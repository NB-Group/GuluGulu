const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9229");
  const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

  await browser.contexts()[0].addCookies([
    {name:"__client_id",value:"ykwak7wkwpf7pilqfpchwsnqutyxh74tzhz62qogbozqkdhf",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"_uid",value:"1601422",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"cf_clearance",value:"ymxe.4wJ4Ao8dvXQMD3xI1MW2pObiVfDAw4_yU06M2I-1783948476-1.2.1.1-hpwZKnOqA8ZQuudqcohzVmXn2mADLX35doOfq7HemnplnOnobiC9qoCuQVRxi_0GC3yKnz0il4cXmGhga9h71pXT7N2Zu0b.crSZ3_E_J7uvNWNb_Lp9iyqq.d7I2tK67XBQrRiNdafGTW9797VGVhsHheUtiKghzhhLeDszbnz0UwMwDTKEniC2u1AclomPSBCFKDvZGEeCc9L9xz653DzDKVndKQyckDI7D8aJ11JLSFyYHQkv0nE5oguC36C4cfOh6HQjTjEP0FsT_DPUmrXw1Wg8Nu4kg_mqdfRhry4CWml_VyXxE2tuyuI8LfADUXC.3P0ahgDxKa6EYh.qVA",domain:".luogu.com.cn",path:"/",secure:true,sameSite:"None"},
  ]);

  await page.goto("https://www.luogu.com.cn/problem/P1001", {waitUntil:"domcontentloaded",timeout:15000});
  await page.waitForTimeout(5000);

  var csrf = await page.evaluate(function(){ return document.querySelector("meta[name=csrf-token]")?.getAttribute("content")||"" });
  console.log("CSRF:", csrf.slice(0,30));

  var code = "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;return 0;}";
  var tests = [
    {url:"/api/ide_submit", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", label:"JSON /api/ide_submit"},
    {url:"/fe/api/problem/selfTest/P1001", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:true}), ct:"application/json", label:"/fe/api/problem/selfTest"},
    {url:"/fe/api/problem/ide/P1001", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:true}), ct:"application/json", label:"/fe/api/problem/ide"},
    {url:"/fe/api/ide/run/P1001", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", label:"/fe/api/ide/run"},
    {url:"/api/ide/run", body:JSON.stringify({lang:28,code:code,input:"1 2",o2:"true"}), ct:"application/json", label:"/api/ide/run"},
  ];

  for (var i=0;i<tests.length;i++){
    var t = tests[i];
    var r = await page.evaluate(async function(args){
      try {
        var r = await fetch("https://www.luogu.com.cn"+args.url, {
          method:"POST", headers:{"Content-Type":args.ct,"X-CSRF-TOKEN":args.csrf,"X-Requested-With":"XMLHttpRequest"}, credentials:"same-origin", body:args.body
        });
        return {s:r.status, b:(await r.text()).slice(0,500)};
      } catch(e) { return {s:0, b:e.message}; }
    }, {url:t.url, ct:t.ct, body:t.body, csrf:csrf});
    console.log(t.label+":", r.s, r.b.slice(0,200));
  }

  await browser.close();
})();
