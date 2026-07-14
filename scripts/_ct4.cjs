const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  
  // Inject interceptors BEFORE navigating
  await page.evaluateOnNewDocument(function(){
    window.__t=[];
    var OX=XMLHttpRequest;
    window.XMLHttpRequest=function(){var x=new OX();var oO=x.open;x.open=function(m,u){x.__u=u;oO.apply(x,arguments)};var oS=x.send;x.send=function(b){x.__b=String(b||"");window.__t.push("XHR:"+x.__u+"|"+x.__b.slice(0,200));oS.call(x,b)};x.addEventListener("readystatechange",function(){if(x.readyState===4)window.__t.push("XHR-RESP:"+x.status+"|"+(x.responseText||"").slice(0,300))});return x};
    var OWS=WebSocket;
    window.WebSocket=function(u){var w=new OWS(u);window.__t.push("WS:"+u.slice(0,40));w.addEventListener("open",function(){window.__t.push("WS-OPEN")});w.addEventListener("message",function(e){try{var m=JSON.parse(e.data);window.__t.push("WS-MSG:"+(m._ws_type||m.type||"")+"|"+JSON.stringify(m).slice(0,300))}catch(ex){}});return w};
  });
  
  await page.goto("https://www.luogu.com.cn/problem/P1001#ide",{waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(5000);
  
  // Click the "运行" button next to the sample input
  // These are labeled "运行" and appear next to sample input/output
  var clicked = await page.evaluate(function(){
    var btns = document.querySelectorAll("button");
    var runBtns = [];
    for (var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==="运行")runBtns.push(i)}
    // Click the 2nd "运行" button (next to sample input)
    if (runBtns.length>=2){btns[runBtns[1]].click();return "clicked btn#"+runBtns[1]}
    return "no run btns";
  });
  console.log("Click:", clicked);
  
  // Wait and capture
  await page.waitForTimeout(20000);
  
  var trace = await page.evaluate(function(){return window.__t||[]});
  console.log("Trace ("+trace.length+"):");
  for (var i=0;i<trace.length;i++) console.log(trace[i].slice(0,400));
  
  // Check output in DOM
  var output = await page.evaluate(function(){
    var lines=document.querySelectorAll(".view-line,.view-lines div,.monaco-editor .view-line");
    var texts=Array.from(lines).map(function(l){return l.textContent}).join("\\n").slice(-500);
    // Check textareas
    var tas=Array.from(document.querySelectorAll("textarea")).map(function(t){return t.value.slice(0,200)});
    return {monacoLines:texts,textareas:tas};
  });
  console.log("Output textareas:",JSON.stringify(output.textareas));
  console.log("Monaco end:",output.monacoLines.slice(-500));
  
  await browser.close();
})();
