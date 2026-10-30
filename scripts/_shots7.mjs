import { chromium } from "playwright-core";
import fs from "node:fs";
const OUT = process.argv[2] ?? `${process.env.HOME}/Desktop/redesign7/shots`; fs.mkdirSync(OUT,{recursive:true});
const only = process.env.ONLY ? process.env.ONLY.split(",") : ["1440","768","390"];
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [label, vp] of [["1440",{width:1440,height:900}],["768",{width:768,height:1024}],["390",{width:390,height:844}]].filter(([l])=>only.includes(l))) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label==="390"?2:1, isMobile: label==="390" });
  const p = await ctx.newPage();
  const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text())}); p.on("pageerror",e=>errs.push(String(e)));
  await p.goto((process.env.BASE||"http://localhost:3100"), {waitUntil:"networkidle"});
  await p.waitForTimeout(1500); await p.screenshot({path:`${OUT}/landing-${label}.png`});
  await p.screenshot({path:`${OUT}/landing-full-${label}.png`, fullPage:true});
  await p.getByRole("button",{name:/Run the sample/}).click();
  for (const t of [600,500,900]) { await p.waitForTimeout(t); await p.screenshot({path:`${OUT}/anim-${label}-${t}.png`}); }
  await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({timeout:60000});
  await p.waitForTimeout(1800);
  await p.screenshot({path:`${OUT}/board-${label}.png`});
  await p.screenshot({path:`${OUT}/board-full-${label}.png`, fullPage:true});
  await p.getByRole("tab",{name:/Your broker decides/}).click(); await p.waitForTimeout(700);
  await p.locator(".lanepanel").first().scrollIntoViewIfNeeded(); await p.evaluate(()=>{const e=document.querySelector(".lanepanel"); if(e) window.scrollTo(0,e.getBoundingClientRect().top+scrollY-120)}); await p.waitForTimeout(400); await p.screenshot({path:`${OUT}/lane-${label}.png`});
  await p.screenshot({path:`${OUT}/lane-full-${label}.png`, fullPage:true});
  await p.locator(".row .en").first().click(); await p.waitForTimeout(1500);
  await p.screenshot({path:`${OUT}/drawer-${label}.png`});
  await p.locator(".drawer").evaluate(e=>e.scrollTo(0,650)); await p.waitForTimeout(300);
  await p.screenshot({path:`${OUT}/drawer2-${label}.png`});
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  console.log(label,"errors:",errs);
  await ctx.close();
}
await b.close();
