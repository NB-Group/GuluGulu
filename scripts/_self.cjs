const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9228");
  const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();
  
  // Set cookies
  await browser.contexts()[0].addCookies([
    {name:"__client_id",value:"ykwak7wkwpf7pilqfpchwsnqutyxh74tzhz62qogbozqkdhf",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"_uid",value:"1601422",domain:".luogu.com.cn",path:"/",secure:true,httpOnly:true,sameSite:"None"},
    {name:"cf_clearance",value:"ymxe.4wJ4Ao8dvXQMD3xI1MW2pObiVfDAw4_yU06M2I-1783948476-1.2.1.1-hpwZKnOqA8ZQuudqcohzVmXn2mADLX35doOfq7HemnplnOnobiC9qoCuQVRxi_0GC3yKnz0il4cXmGhga9h71pXT7N2Zu0b.crSZ3_E_J7uvNWNb_Lp9iyqq.d7I2tK67XBQrRiNdafGTW9797VGVhsHheUtiKghzhhLeDszbnz0UwMwDTKEniC2u1AclomPSBCFKDvZGEeCc9L9xz653DzDKVndKQyckDI7D8aJ11JLSFyYHQkv0nE5oguC36C4cfOh6HQjTjEP0FsT_DPUmrXw1Wg8Nu4kg_mqdfRhry4CWml_VyXxE2tuyuI8LfADUXC.3P0ahgDxKa6EYh.qVA",domain:".luogu.com.cn",path:"/",secure:true,sameSite:"None"},
  ]);
  
  await page.goto("https://www.luogu.com.cn/problem/P1001#ide", {waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(3000);
  
  // Check logged in
  var loggedIn = await page.evaluate(function(){ return !document.body.textContent.includes("登录后才可提交"); });
  console.log("Logged in:", loggedIn);
  
  if (!loggedIn) {
    // Go to login page - user needs to log in manually
    await page.goto("https://www.luogu.com.cn/auth/login", {waitUntil:"domcontentloaded",timeout:10000});
    console.log("Please log in, then run again");
    await browser.close();
    return;
  }
  
  // Monitor WS and fetch
  await page.evaluate(function(){
    window.__t = [];
    var OWS = WebSocket;
    window.WebSocket = function(u){
      var w = new OWS(u);
      window.__t.push("WS:"+u.slice(0,40));
      w.addEventListener("open", function(){window.__t.push("WS-OPEN");});
      w.addEventListener("message", function(e){
        try { var m=JSON.parse(e.data); window.__t.push("MSG:"+ (m._ws_type||m.type||"") +":"+JSON.stringify(m).slice(0,400)); } catch(ex){window.__t.push("RAW:"+e.data.slice(0,200));}
      });
      return w;
    };
  });
  
  // Click "自测" button
  var btns = await page.evaluate(function(){
    var b = document.querySelectorAll("button");
    var r = [];
    for (var i=0;i<b.length;i++){ if (b[i].textContent.trim()==="自测") r.push(i); }
    return r;
  });
  console.log("自测 btns idx:", JSON.stringify(btns));
  
  if (btns.length > 0) {
    // Click via JS
    await page.evaluate(function(idx){ 
      var b = document.querySelectorAll("button")[idx]; 
      b.click(); 
    }, btns[0]);
    console.log("Clicked 自测");
    await page.waitForTimeout(20000);
    
    var t = await page.evaluate(function(){ return window.__t; });
    console.log("Trace ("+t.length+"):");
    for (var i=0;i<t.length;i++) console.log(t[i].slice(0,500));
    
    // Check for output DOM
    var out = await page.evaluate(function(){
      // Look for new text in the output area
      var all = document.querySelectorAll("[class*=output],[class*=result],[class*=status]");
      return Array.from(all).map(function(e){ return e.textContent.trim().slice(0,200); });
    });
    console.log("Output elements:", JSON.stringify(out));
  }
  
  await browser.close();
})();
