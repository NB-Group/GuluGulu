const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();
  
  await page.goto("https://www.luogu.com.cn/problem/P1001#ide",{waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(5000);
  
  // Click 自测
  await page.evaluate(function(){var b=document.querySelectorAll("button");for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==="自测"){b[i].click();break;}}});
  console.log("Clicked 自测");
  
  // Wait and check DOM at intervals
  for (var i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    var snap = await page.evaluate(function(){
      // Look for result/output/compile elements
      var all = document.body.textContent||"";
      // Check for specific text patterns
      var hasResult = all.includes("编译") || all.includes("运行结果") || all.includes("输出") || all.includes("RID") || all.includes("Accepted") || all.includes("Wrong") || all.includes("executed") || all.includes("exit");
      // Also check for new elements
      var newEls = document.querySelectorAll("[class*=result],[class*=output],[class*=compile],[class*=exec],[class*=status],[class*=verdict]");
      var newElTexts = Array.from(newEls).map(function(e){return e.textContent.trim().slice(0,100)});
      return {hasResult:hasResult, newEls:newEls.length, samples:newElTexts.slice(0,5), bodyEnd: all.slice(-500)};
    });
    console.log("Poll#"+i+": hasResult="+snap.hasResult+" newEls="+snap.newEls);
    if (snap.bodyEnd) console.log("  bodyEnd:",snap.bodyEnd.slice(0, 300));
    if (snap.samples.length) console.log("  samples:",snap.samples);
  }
  
  await browser.close();
})();
