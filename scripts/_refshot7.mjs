import { chromium } from "playwright-core";
const out = process.env.HOME + "/Desktop/redesign7/ref";
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, url] of [["mercury-home","https://mercury.com/"],["mercury-pricing","https://mercury.com/pricing"],["mercury-checking","https://mercury.com/checking"]]) {
  const ctx = await b.newContext({ viewport:{width:1440,height:900} });
  const p = await ctx.newPage();
  try { await p.goto(url,{waitUntil:"domcontentloaded",timeout:45000}); await p.waitForTimeout(4000);
    await p.screenshot({path:`${out}/${name}.png`}); 
    await p.evaluate(()=>window.scrollTo(0,1100)); await p.waitForTimeout(1500); await p.screenshot({path:`${out}/${name}-2.png`});
    console.log("ok",name);} catch(e){console.log("fail",name,String(e).slice(0,100));}
  await ctx.close();
}
await b.close();
