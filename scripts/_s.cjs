const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const page = await browser.contexts()[0].newPage();
  await page.goto("https://www.luogu.com.cn/problem/P1001#ide",{waitUntil:"networkidle",timeout:30000});
  await page.waitForTimeout(5000);
  
  // Get baseline DOM
  var before = await page.evaluate(function(){return document.body.textContent});
  
  // Click the input sample's "运行" button - use page.click with coordinates
  // Find the "运行" button closest to "20 30" text
  var btns = await page.evaluate(function(){
    var b=document.querySelectorAll("button");var r=[];
    for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==="运行")r.push({idx:i,rect:b[i].getBoundingClientRect()})}
    return r;
  });
  console.log("Run buttons:",JSON.stringify(btns));
  
  if (btns.length>0){
    // Click the button via its position
    var b = btns[0];
    await page.mouse.click(b.rect.x+b.rect.width/2, b.rect.y+b.rect.height/2);
    console.log("Clicked at",b.rect.x+b.rect.width/2,b.rect.y+b.rect.height/2);
  }
  
  await page.waitForTimeout(15000);
  
  var after = await page.evaluate(function(){return document.body.textContent});
  // Find what changed
  if (after.length !== before.length){
    // Find the different part
    for (var i=0;i<Math.min(before.length,after.length);i++){
      if (before[i]!==after[i]){
        console.log("DIFF at",i,":",after.slice(Math.max(0,i-50),i+300));
        break;
      }
    }
  } else {
    console.log("No DOM change detected");
  }
  
  await browser.close();
})();
