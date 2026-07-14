const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  
  // Intercept before navigation
  await ctx.addInitScript(function(){
    window.__t=[];
    var OX=XMLHttpRequest;
    XMLHttpRequest=function(){var x=new OX();var oO=x.open;x.open=function(m,u){x.__u=u;oO.apply(x,arguments)};x.addEventListener("readystatechange",function(){if(x.readyState===4&&x.__u&&x.__u.includes("ide"))window.__t.push("XHR:"+x.status+":"+x.responseText.slice(0,400))});return x};
    var OWS=WebSocket;
    WebSocket=function(u){var w=new OWS(u);window.__t.push("WS:"+u.slice(0,40));w.addEventListener("message",function(e){try{var m=JSON.parse(e.data);window.__t.push("WS-MSG:"+(m._ws_type||m.type)+":"+JSON.stringify(m).slice(0,300))}catch(ex){}});return w};
  });
  
  await page.goto("https://www.luogu.com.cn/problem/P1001#ide",{waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(5000);
  
  var info = await page.evaluate(function(){
    var btns = Array.from(document.querySelectorAll("button")).map(function(b){return b.textContent.trim()}).filter(Boolean);
    return {url:location.href,title:document.title,btns:btns.slice(0,15)};
  });
  console.log(JSON.stringify(info,null,2));
  
  // Try clicking 自测 or 运行
  var hasSelfTest = info.btns.some(function(b){return b==="自测"});
  if (hasSelfTest) {
    await page.evaluate(function(){var btns=document.querySelectorAll("button");for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==="自测"){btns[i].click();break;}}});
    console.log("自测 clicked");
    await page.waitForTimeout(15000);
    var t = await page.evaluate(function(){return window.__t});
    console.log("Trace:",JSON.stringify(t));
    // Check DOM for output
    var body = await page.evaluate(function(){return document.body.textContent.slice(0,1000)});
    console.log("Body:",body);
  }
  await browser.close();
})();
