import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const M = () => { const out = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; const cs = getComputedStyle(el);
    if (cs.display === "none" || el.closest(".wordmark") || !el.getBoundingClientRect().width) continue;
    const bad = !["12px","14px","30px"].includes(cs.fontSize) || !["400","500"].includes(cs.fontWeight);
    if (bad) { const k = cs.fontSize + "/" + cs.fontWeight + " ." + (el.className||el.tagName).toString().slice(0,50) + " p:." + (el.parentElement.className||"").toString().slice(0,30); (out[k] ||= []).push(n.textContent.trim().slice(0,20)); } }
  return out; };
await p.goto("http://localhost:3100", { waitUntil: "networkidle" }); await p.waitForTimeout(1200);
console.log("LANDING", JSON.stringify(await p.evaluate(M), null, 0));
await p.getByRole("button", { name: /Run the sample/ }).click();
await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({ timeout: 60000 }); await p.waitForTimeout(2000);
console.log("BOARD", JSON.stringify(await p.evaluate(M)));
await p.getByRole("tab", { name: /Your broker decides/ }).click(); await p.waitForTimeout(700);
await p.locator(".row .en").first().click(); await p.waitForTimeout(1500);
console.log("DRAWER", JSON.stringify(await p.evaluate(M)));
await b.close();
