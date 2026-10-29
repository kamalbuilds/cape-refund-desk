import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
const MEASURE = () => {
  const sizes = {}, weights = {}, bad = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.closest(".wordmark")) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    sizes[cs.fontSize] = (sizes[cs.fontSize] || 0) + 1; weights[cs.fontWeight] = (weights[cs.fontWeight] || 0) + 1;
    if (cs.textTransform === "uppercase" || parseFloat(cs.letterSpacing) > 0.5) bad.push(el.className + ":" + n.textContent.trim().slice(0, 24));
    if (+cs.opacity < 1) bad.push("opacity:" + el.className + ":" + n.textContent.trim().slice(0, 24));
  }
  return { sizes, weights, bad };
};
for (const [label, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
  await p.goto("http://localhost:3100", { waitUntil: "networkidle" }); await p.waitForTimeout(1200);
  console.log(label, "landing", JSON.stringify(await p.evaluate(MEASURE)));
  await p.getByRole("button", { name: /Run the sample/ }).click();
  await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({ timeout: 60000 }); await p.waitForTimeout(2000);
  console.log(label, "board", JSON.stringify(await p.evaluate(MEASURE)));
  await p.getByRole("tab", { name: /Your broker decides/ }).click(); await p.waitForTimeout(700);
  await p.locator(".row .en").first().click(); await p.waitForTimeout(1500);
  console.log(label, "drawer", JSON.stringify(await p.evaluate(MEASURE)));
  await ctx.close();
}
await b.close();
