import { chromium } from "playwright-core";
import fs from "node:fs";
const OUT = process.argv[2] ?? "/tmp/capeui/r4"; fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [label, vp] of [["1440",{width:1440,height:900}],["768",{width:768,height:1024}],["390",{width:390,height:844}]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label==="390"?2:1, isMobile: label==="390" });
  const p = await ctx.newPage();
  const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text())}); p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:3100", {waitUntil:"networkidle"});
  await p.waitForTimeout(1500); await p.screenshot({path:`${OUT}/landing-a-${label}.png`});
  await p.waitForTimeout(3500); await p.screenshot({path:`${OUT}/landing-b-${label}.png`});
  await p.evaluate(()=>window.scrollTo(0,700)); await p.waitForTimeout(900);
  await p.screenshot({path:`${OUT}/landing-c-${label}.png`});
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.getByRole("button",{name:/Run the sample/}).click();
  for (const t of [700,900,900,700]) { await p.waitForTimeout(t); await p.screenshot({path:`${OUT}/anim-${label}-${Date.now()%100000}.png`}); }
  await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({timeout:60000});
  await p.waitForTimeout(1800);
  await p.screenshot({path:`${OUT}/board-${label}.png`});
  await p.getByRole("tab",{name:/Your broker decides/}).click(); await p.waitForTimeout(700);
  await p.screenshot({path:`${OUT}/lane-${label}.png`, fullPage:true});
  await p.locator(".row .en").first().click(); await p.waitForTimeout(1500);
  await p.screenshot({path:`${OUT}/drawer-${label}.png`});
  await p.locator(".drawer").evaluate(e=>e.scrollTo(0,650)); await p.waitForTimeout(300);
  await p.screenshot({path:`${OUT}/drawer2-${label}.png`});
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  await p.locator(".watch").first().scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  await p.screenshot({path:`${OUT}/compliance-status-${label}.png`});
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await p.waitForTimeout(500);
  await p.screenshot({path:`${OUT}/footer-${label}.png`});
  console.log(label,"errors:",errs);
  await ctx.close();
}
await b.close();
