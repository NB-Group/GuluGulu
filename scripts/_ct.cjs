const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  await ctx.addCookies([
    {name:"__client_id",value:"ykwak7wkwpf7pilqfpchwsnqutyxh74tzhz62qogbozqkdhf",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"_uid",value:"1601422",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"cf_clearance",value:"ymxe.4wJ4Ao8dvXQMD3xI1MW2pObiVfDAw4_yU06M2I-1783948476-1.2.1.1-hpwZKnOqA8ZQuudqcohzVmXn2mADLX35doOfq7HemnplnOnobiC9qoCuQVRxi_0GC3yKnz0il4cXmGhga9h71pXT7N2Zu0b.crSZ3_E_J7uvNWNb_Lp9iyqq.d7I2tK67XBQrRiNdafGTW9797VGVhsHheUtiKghzhhLeDszbnz0UwMwDTKEniC2u1AclomPSBCFKDvZGEeCc9L9xz653DzDKVndKQyckDI7D8aJ11JLSFyYHQkv0nE5oguC36C4cfOh6HQjTjEP0FsT_DPUmrXw1Wg8Nu4kg_mqdfRhry4CWml_VyXxE2tuyuI8LfADUXC.3P0ahgDxKa6EYh.qVA",domain:".luogu.com.cn",path:"/",secure:true,sameSite:"None"},
  ]);
  await page.goto("https://www.luogu.com.cn/problem/P1001#ide",{waitUntil:"domcontentloaded",timeout:15000});
  await page.waitForTimeout(5000);
  
  const info = await page.evaluate(function(){
    var btns = Array.from(document.querySelectorAll("button")).map(function(b){return b.textContent.trim()}).filter(Boolean);
    return {title:document.title, btns:btns.slice(0,15)};
  });
  console.log(JSON.stringify(info,null,2));
  
  if (info.btns.some(function(b){return b==="自测"}) || info.btns.some(function(b){return b==="运行"})) {
    await page.evaluate(function(){
      window.__t=[];
      var OX=XMLHttpRequest;
      XMLHttpRequest=function(){var x=new OX();x.addEventListener("readystatechange",function(){if(x.readyState===4)window.__t.push("XHR:"+x.status+":"+x.responseText.slice(0,300))});return x};
      var OWS=WebSocket;
      WebSocket=function(u){var w=new OWS(u);window.__t.push("WS:"+u.slice(0,40));w.addEventListener("message",function(e){try{var m=JSON.parse(e.data);if(m._ws_type!=="heartbeat")window.__t.push("WS-MSG:"+JSON.stringify(m).slice(0,400))}catch(ex){}});return w};
    });
    
    // Click 自测
    await page.evaluate(function(){var btns=document.querySelectorAll("button");for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==="自测"){btns[i].click();break;}}});
    console.log("Clicked 自测, waiting...");
    await page.waitForTimeout(20000);
    
    var result = await page.evaluate(function(){
      var body = document.body.textContent||"";
      var trace = window.__t||[];
      return {bodySlice: body.slice(0, 800), trace: trace};
    });
    console.log("Body:", result.bodySlice);
    console.log("Trace:", JSON.stringify(result.trace));
  }
  await browser.close();
})();
