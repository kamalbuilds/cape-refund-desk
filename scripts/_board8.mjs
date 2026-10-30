import { chromium } from "playwright-core";
import fs from "node:fs";
const OUT = process.argv[2] ?? `${process.env.HOME}/Desktop/redesign8`; fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [label, vp] of [["1440",{width:1440,height:900}],["768",{width:768,height:1024}],["390",{width:390,height:844}]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label==="390"?2:1, isMobile: label==="390" });
  const p = await ctx.newPage();
  const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text())}); p.on("pageerror",e=>errs.push(String(e)));
  await p.goto(process.env.BASE||"http://localhost:3100", {waitUntil:"networkidle"});
  await p.getByRole("button",{name:/Run the sample/}).click();
  await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({timeout:60000});
  await p.waitForTimeout(2200);
  await p.screenshot({path:`${OUT}/board-${label}.png`});
  await p.screenshot({path:`${OUT}/board-full-${label}.png`, fullPage:true});
  const btn = p.getByRole("button",{name:/Check another file/}); await btn.click(); await p.waitForTimeout(300);
  await p.screenshot({path:`${OUT}/board-open-${label}.png`});
  const ov = await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  console.log(label,"errors:",errs,"hscroll:",ov);
  await ctx.close();
}
await b.close();
