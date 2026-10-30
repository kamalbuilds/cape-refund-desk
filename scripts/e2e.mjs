// Browser walk-through: upload the sample CSV, run the in-browser check and the live check, open an entry, download every export and
// validate the CAPE CSV against CBP's published file rules. Usage: node scripts/e2e.mjs [baseUrl]  (needs Chrome installed; live step needs NEBIUS_API_KEY on the server)
import { chromium } from "playwright-core";
import fs from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.env.E2E_OUT ?? "/tmp/e2e";
fs.mkdirSync(OUT, { recursive: true });
const problems = [];
const ok = (c, m) => { console.log(c ? "  ok  " : "  FAIL", m); if (!c) problems.push(m); };

function validateCapeCsv(text, name) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  ok(lines[0].trim().toLowerCase() === "entry number", `${name}: header is "Entry Number" (got "${lines[0]}")`);
  const rows = lines.slice(1);
  ok(rows.length >= 1 && rows.length <= 9999, `${name}: ${rows.length} entries, within 1..9,999 per declaration`);
  ok(Buffer.byteLength(text) < 1024 * 1024, `${name}: ${Buffer.byteLength(text)} bytes, under 1 MB`);
  const keys = rows.map((r) => r.replace(/^'/, "").replace(/-/g, "").trim());
  ok(keys.every((k) => /^[A-Z0-9]{11}$/.test(k)), `${name}: every entry number is 11 alphanumeric characters, no dashes`);
  ok(rows.every((r) => !/^\d/.test(r) || r.startsWith("'") || !/^0/.test(r)), `${name}: no bare leading zero (Excel would drop it)`);
  ok(rows.filter((r) => /^[0-9]/.test(r.replace(/^'/, ""))).every((r) => r.startsWith("'")), `${name}: apostrophe before every number that starts with a digit`);
  ok(new Set(keys).size === keys.length, `${name}: no duplicates`);
  ok(rows.every((r) => !r.includes(",")), `${name}: single column`);
  return keys;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [label, vp] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]]) {
  console.log(`\n=== viewport ${label} ===`);
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true, deviceScaleFactor: label === "390" ? 2 : 1, isMobile: label === "390" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && errs.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `landing: no horizontal overflow (${overflow}px)`);
  await page.screenshot({ path: `${OUT}/landing-${label}.png` });
  ok(await page.getByTestId("audience").count() === 1 && /\$467,490\.84/.test(await page.getByTestId("sample-safe-total").innerText()), "landing leads with the audience and the sample's safe-to-file dollars");
  const probe = await (await fetch(`${BASE}/api/run`)).json();
  if (probe.live === false) ok(await page.getByTestId("live-note").count() === 1 && /paused|key|unavailable|credit/i.test(await page.getByTestId("live-note").innerText()), `live AI is down (${probe.reason}), so the page says so and does not offer a dead button`);
  else ok(await page.getByTestId("live-note").count() === 0, "live AI is up, no pause note");
  ok(await page.getByTestId("why-llm").count() === 1, "landing explains why an AI model beats a spreadsheet");
  ok(await page.getByTestId("source-link").count() >= 8, "sources panel lists the CBP links");

  // --- offer check: runs in the browser, examples give different verdicts, flags quote the offer and cite CBP
  const flagIds = async () => page.getByTestId("offer-flag").evaluateAll((els) => els.map((e) => e.getAttribute("data-flag")));
  ok(await page.getByTestId("offercheck").count() === 1 && await page.getByTestId("offer-empty").count() === 1, "offer check: section is on the page and starts empty (no fake result)");
  await page.getByTestId("offer-example-predatory").click();
  ok(/High risk/.test(await page.getByTestId("offer-verdict").innerText()), "offer check: predatory example is High risk");
  const pf = await flagIds();
  for (const f of ["impersonation", "credentials", "payee-firm", "upfront", "fee-pct", "lock-in", "urgency"]) ok(pf.includes(f), `offer check: predatory example flags ${f}`);
  ok(await page.getByTestId("offer-cite").count() >= 5 && (await page.getByTestId("offer-cite").first().locator("a").getAttribute("href")).startsWith("https://"), "offer check: flags carry CBP quotes with https links");
  // compact view: one row per finding, details closed until clicked, counts at the top, comparison visible without scrolling past the flags
  const nFlags = await page.getByTestId("offer-flag").count();
  const counts = await page.getByTestId("offer-counts").innerText();
  ok(nFlags >= 7 && new RegExp(`\\b${nFlags}\\s+findings`).test(counts) && /red flag/.test(counts), `offer check: counts line matches the ${nFlags} flags ("${counts.replace(/\s+/g, " ")}")`);
  const h0 = await page.getByTestId("offer-flag").first().evaluate((e) => e.getBoundingClientRect().height);
  ok(h0 < 60 && await page.locator('[data-testid=offer-flag] details[open]').count() === 0, `offer check: each flag is one compact row (${Math.round(h0)}px) and starts collapsed`);
  ok(await page.getByTestId("offer-frag").first().evaluate((e) => e.innerText.length <= 72), "offer check: row shows a single short quoted fragment");
  const secH = await page.getByTestId("offercheck").evaluate((e) => e.getBoundingClientRect().height);
  ok(secH < (label === "1440" ? 2200 : 6500), `offer check: whole section is ${Math.round(secH)}px tall (compact)`);
  await page.getByTestId("offer-flag-toggle").first().click();
  ok(await page.getByTestId("offer-flag-more").first().isVisible() && await page.getByTestId("offer-flag").first().locator('[data-testid=offer-cite]').first().isVisible(), "offer check: clicking a row opens the full quotes and the CBP source");
  const ocH2 = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=offercheck] h2")).fontSize);
  ok(ocH2 === "16px", `offer check: h2 is the design's 16px section heading, as in the receipt and deadline panels (got ${ocH2})`);
  ok(await page.getByTestId("offer-compare").isVisible(), "offer check: cost comparison is visible with the flags");
  if (process.env.OFFER_SHOT) { await page.getByTestId("offercheck").scrollIntoViewIfNeeded(); await page.getByTestId("offercheck").screenshot({ path: process.env.OFFER_SHOT + "-" + label + ".png" }); }
  ok(/\$467,490\.84/.test(await page.getByTestId("offer-amount").inputValue().then((v) => "$" + v)) && /\$/.test(await page.getByTestId("cost-fee-flat").innerText()), "offer check: comparison defaults to the sample's safe total and shows the published flat fee");
  ok(await page.getByTestId("offer-compare").getByText(/published prices as of 2026-10-30/).count() === 1, "offer check: flat-fee row is dated");
  ok(await page.getByTestId("offer-ai").count() === 0, "offer check: no AI explanation shown without a recorded one");
  await page.getByTestId("offer-amount").fill("100000");
  ok(/\$0\.00|\$0\b/.test(await page.getByTestId("cost-fee-self").innerText()) && /\$100,000\.00/.test(await page.getByTestId("cost-keep-self").innerText()), "offer check: self-filing row is $0 fee, you keep 100%");
  await page.getByTestId("offer-example-clean").click();
  ok(/No red flags/.test(await page.getByTestId("offer-verdict").innerText()) && (await flagIds()).every((f) => f === "poa"), "offer check: clean example has no red flags");
  await page.getByTestId("offer-example-borderline").click();
  ok(/closer look/i.test(await page.getByTestId("offer-verdict").innerText()) && await page.locator('[data-testid=offer-flag][data-severity=high]').count() === 0, "offer check: borderline example needs a closer look with no red flags");
  await page.getByTestId("offer-text").fill("");
  ok(await page.getByTestId("offer-empty").count() === 1, "offer check: clearing the text clears the result");
  ok(/derived schema/.test(await page.getByTestId("schema-note").innerText()), "upload format is labelled as a derived schema");

  // --- a file that is not an ES-003 export gives a clear error, not a silent 0 of 0
  fs.writeFileSync(`${OUT}/not-es003.csv`, "name,age\nbob,3\n");
  await page.locator('input[type=file]').setInputFiles(`${OUT}/not-es003.csv`);
  await page.locator("p.error").waitFor({ timeout: 5000 });
  ok(await page.locator(".tabs .tab").count() === 0 && await page.getByRole("button", { name: /Check in this browser/ }).isDisabled(), "wrong CSV shows no board and the check buttons stay disabled");
  const alertText = await page.locator("p.error").innerText(); console.log("  alert text:", alertText.slice(0, 200));
  ok(/entry_number/.test(alertText), "wrong CSV shows a plain parse error naming entry_number");

  // --- in-browser check (no upload): network must stay quiet
  const posts = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(r.url()));
  await page.locator('input[type=file]').setInputFiles("data/sample-es003.csv");
  await page.getByLabel("Filer code").fill("A7K");
  await page.getByRole("button", { name: /Check in this browser/ }).click();
  await page.locator(".tabs .tab").first().waitFor({ timeout: 15000 });
  const lanes = await page.locator(".tabs .tab").evaluateAll((els) => els.map((e) => [e.querySelector(".lane-t")?.textContent, Number(e.querySelector(".lane-n")?.textContent)]));
  console.log("  lanes:", JSON.stringify(lanes));
  ok(lanes.length === 4 && lanes.reduce((a, [, n]) => a + n, 0) >= 60, "in-browser check fills 4 lanes with the sample");
  ok(posts.length === 0, `in-browser check made no POST requests (${posts.join(",") || "none"})`);
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ov2 <= 1, `board: no horizontal overflow (${ov2}px)`);
  await page.screenshot({ path: `${OUT}/board-${label}.png`, fullPage: false });

  // --- find a row by text in any lane tab (expanding a long lane if needed)
  const findRow = async (re) => {
    const tabs = page.locator(".tabs .tab");
    for (let i = 0; i < await tabs.count(); i++) {
      await tabs.nth(i).click();
      const more = page.getByRole("button", { name: /^Show all \d+ shipments/ });
      if (await more.count()) await more.click();
      const r = page.locator(".row", { hasText: re }).first();
      if (await r.count()) return r;
    }
    return page.locator(".row", { hasText: re }).first();
  };
  // --- drawer on a trap entry
  const trap = await findRow(/isn.t allowed in the refund program/);
  await trap.scrollIntoViewIfNeeded();
  await trap.locator(".en").click();
  const dr = page.locator(".drawer");
  await dr.waitFor({ timeout: 5000 });
  const dtext = await dr.innerText();
  ok(/Entry Type Not Allowed/.test(dtext), "drawer shows the exact CBP error string");
  ok(/FAQ|QRG|CSMS|Pub\./.test(dtext), "drawer cites its source");
  ok(/Not claimable/.test(dtext) && !/You.d get back/.test(dtext) && await dr.getByTestId("not-claimable").count() === 1, "excluded entry drawer says Not claimable, not 'You'd get back'");
  ok(await dr.getByTestId("hero-figure").count() === 0, "blocked drawer has no money hero at all (no $0.00)");
  const bchip = dr.locator(".d-bar [data-testid=phase-chip]");
  if (await bchip.count()) ok(!/^Phase \d/.test((await bchip.innerText()).trim()), "blocked drawer chip is not a bare 'Phase N'");
  await page.screenshot({ path: `${OUT}/drawer-${label}.png` });
  await dr.locator(".x").click();
  await dr.waitFor({ state: "detached", timeout: 3000 });
  ok(true, "drawer closes");

  // --- warehouse entry 21 is blocked with the CSMS cite
  const wh = await findRow(/A7K-?9828170/);
  if (await wh.count()) { await wh.locator(".en").click(); const t = await page.locator(".drawer").innerText(); ok(/69127837/.test(t), "warehouse entry 21 cites CSMS 69127837"); await page.locator(".drawer button.x").click(); }
  else ok(false, "warehouse entry 21 card is on the board");

  // --- every lane's drawer: the headline money agrees with the Net row, and green means claimable now
  {
    const tabs = page.locator(".tabs .tab"); const seen = [];
    for (let i = 0; i < await tabs.count(); i++) {
      await tabs.nth(i).click();
      const first = page.locator(".row").first();
      if (!(await first.count())) continue;
      const rowChips = await page.locator(".row [data-testid=phase-chip]").evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim(), p: e.getAttribute("data-pending") })));
      const laneName = (await tabs.nth(i).locator(".lane-t").innerText()).trim();
      await first.locator(".en").click();
      const d = page.locator(".drawer"); await d.waitFor({ timeout: 5000 });
      const fig = d.getByTestId("hero-figure");
      if (await fig.count()) {
        const tone = await fig.getAttribute("data-tone"); const txt = (await fig.innerText()).trim();
        ok(txt === (await d.locator(".d-brk-net dd").innerText()).trim(), `${laneName}: hero ${txt} equals the Net row`);
        ok((tone === "ok") === (laneName === "Safe to claim"), `${laneName}: green hero only in Safe to claim (tone ${tone})`);
        ok(!(tone !== "ok" && txt === "$0.00" && !(await d.getByTestId("hero-note").count())), `${laneName}: a $0.00 hero always explains why`);
        ok(laneName === "Safe to claim" || /Claimable today: \$0\.00|not claimable|cost you|owe/i.test(await d.getByTestId("hero-note").innerText()), `${laneName}: non-claimable hero carries a plain 'not claimable yet' note`);
      } else ok(await d.getByTestId("not-claimable").count() === 1, `${laneName}: no hero means the drawer says Not claimable`);
      if (laneName !== "Safe to claim") ok(rowChips.every((c) => !/^Phase [123]/.test(c.t)), `${laneName}: row phase chips never read as a bare 'Phase N' (${[...new Set(rowChips.map((c) => c.t))].join(" | ")})`);
      else ok(rowChips.some((c) => /^Phase 1/.test(c.t) && c.p === null), "Safe to claim rows keep the plain 'Phase 1' chip");
      seen.push(laneName);
      await d.locator("button.x").click(); await d.waitFor({ state: "detached", timeout: 3000 });
    }
    ok(seen.length === 4, `checked the drawer of all 4 lanes (${seen.join(", ")})`);
    await tabs.first().click();
  }

  // --- refund phase chip + remedy lock-out warning (customs lane)
  const chips = await page.locator(".row [data-testid=phase-chip]").count();
  ok(chips >= 10, `rows carry a phase chip (${chips} visible)`);
  ok(await page.locator(".row [data-testid=lockout-marker]").count() >= 1, "rows carry a remedy lock-out marker");
  const psc = await findRow(/A7K-?5314569/);
  await psc.locator(".en").click();
  const pd = page.locator(".drawer");
  await pd.waitFor({ timeout: 5000 });
  const pchip = pd.locator(".d-bar [data-testid=phase-chip]");
  ok(await pchip.count() === 1 && /^Would be Phase 1$/.test((await pchip.innerText()).trim()) && await pchip.getAttribute("data-pending") === "1", "fix-first drawer header chip reads 'Would be Phase 1', not a bare claimable-now 'Phase 1'");
  ok(/not claimable now/i.test(await pchip.getAttribute("title") ?? ""), "the 'Would be Phase 1' chip has a tooltip saying it is not claimable now");
  // headline money: a fix-first shipment must not show a green $0.00 (or any green) hero
  const hf = pd.getByTestId("hero-figure");
  const hfText = (await hf.innerText()).trim();
  const netRow = (await pd.locator(".d-brk-net dd").innerText()).trim();
  ok(hfText === netRow && hfText !== "$0.00", `fix-first hero equals the Net row and is not $0.00 (${hfText})`);
  ok(await hf.getAttribute("data-tone") === "hold", "fix-first hero is the warn tone, not green");
  ok(await hf.evaluate((el) => { const c = getComputedStyle(el).color; const m = c.match(/\d+/g).map(Number); return !(m[1] > m[0] + 20 && m[1] > m[2] + 10); }), "fix-first hero colour is not green");
  ok(/Refund once the correction is filed/.test(await pd.getByTestId("hero-label").innerText()) && /Claimable today: \$0\.00/.test(await pd.getByTestId("hero-note").innerText()), "fix-first hero is labelled 'once the correction is filed' and says $0.00 is claimable today");
  ok(await pd.locator(".wf[data-pending='1']").count() === 1, "fix-first bar is marked pending (warn colour), consistent with the hero");
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1300)));
  ok((await hf.innerText()).trim() === hfText, "hero does not count up from $0.00 (static after 1.3s)");
  const lw = pd.locator("[data-testid=lockout-warning]");
  ok(await lw.count() === 1 && /you should file that PSC prior to filing your CAPE Declaration/.test(await lw.innerText()), "drawer shows the PSC lock-out warning with CBP's wording");
  ok(await lw.locator("[data-testid=customs-source]").count() === 1 && /cbp\.gov/.test(await lw.locator("a").first().getAttribute("href")), "lock-out warning links to the CBP page");
  ok(await lw.evaluate((el) => el.classList.contains("d-alert") && getComputedStyle(el).borderTopStyle === "solid"), "lock-out warning uses the bordered .d-alert style");
  ok(/Which refund phase/.test(await pd.innerText()), "drawer explains which phase in plain words");
  await pd.evaluate((el) => { el.scrollTop = 0; });
  const vp0 = page.viewportSize();
  if (label === "1440") await page.setViewportSize({ width: 1440, height: 1500 });
  await page.screenshot({ path: `${OUT}/customs-drawer-${label}.png` });
  await page.setViewportSize(vp0);
  await pd.locator(".x").click();
  await pd.waitFor({ state: "detached", timeout: 3000 });
  const p3 = await findRow(/A7K-?5047642/);
  await p3.locator(".en").click();
  await page.locator(".drawer .cu-more summary").first().click();
  const p3t = await page.locator(".drawer").innerText();
  ok(/Phase 3/.test(p3t) && /Court has ordered reliquidation/.test(p3t) && /not describe Phase 3|does not describe Phase 3/.test(p3t), "final-liquidation entry shows Phase 3 and says CBP's page does not describe it");
  await page.locator(".drawer button.x").click();
  // --- other-duty note: an underpayment that still nets a refund stays claimable, with a visible note (not "Your broker decides")
  const od = await findRow(/A7K-?5393587-?7/);
  ok(await od.count() === 1 && await od.getByTestId("other-duty-row").count() === 1 && /Customs may also bill \$11,332\.36 of other duties, which comes off this refund/.test(await od.getByTestId("other-duty-row").innerText()), "row for a net-positive underpayment carries the other-duty note");
  await od.locator(".en").click();
  const odd = page.locator(".drawer");
  ok(await odd.getByTestId("other-duty-note").count() === 1 && /comes off this refund/.test(await odd.getByTestId("other-duty-note").innerText()) && !/Your broker decides/.test(await odd.innerText()), "drawer shows the other-duty note and does not say 'Your broker decides'");
  if (label === "1440") await page.screenshot({ path: `${OUT}/otherduty-drawer-1440.png` });
  await page.locator(".drawer button.x").click();
  const covLine = page.getByTestId("coverage-line");
  ok(await covLine.count() === 1 && /Catches \d+ of \d+ published CAPE rejection causes/.test(await covLine.innerText()), `coverage line is on the page: ${await covLine.innerText()}`);

  // --- exports (must be gated on the acknowledgement)
  const capeBtn = page.getByRole("button", { name: /^cape-declaration/ }).first();
  await capeBtn.scrollIntoViewIfNeeded();
  ok(await capeBtn.isDisabled(), "refund CSV download is disabled until the can't-be-undone box is ticked");
  ok(await page.getByRole("button", { name: /Note for your broker/ }).isDisabled() && await page.getByRole("button", { name: /Deadlines \(\.csv\)/ }).isDisabled() && await page.getByTestId("dl-ics").isDisabled(), "broker note, deadlines and extra downloads are gated by the acknowledgement too");
  await page.getByLabel(/I understand that once Customs accepts/).check();
  ok(await capeBtn.isEnabled(), "CAPE CSV download enables after the box is ticked");
  await page.screenshot({ path: `${OUT}/export-${label}.png` });
  const grab = async (btn, file) => { const [d] = await Promise.all([page.waitForEvent("download"), btn.click()]); const p = `${OUT}/${label}-${d.suggestedFilename()}`; await d.saveAs(p); return [d.suggestedFilename(), fs.readFileSync(p, "utf8")]; };
  const names = await page.getByRole("button", { name: /^cape-declaration/ }).count();
  for (let i = 0; i < names; i++) { const [n, t] = await grab(page.getByRole("button", { name: /^cape-declaration/ }).nth(i)); console.log("  file", n); validateCapeCsv(t, n); }
  const [hn, ht] = await grab(page.getByRole("button", { name: /Note for your broker/ }));
  ok(hn.endsWith(".md") && /Not legal or customs advice/.test(ht) && ht.length > 500, `handoff note ${hn} (${ht.length} chars) carries the disclaimer`);
  ok(!/claim your refund|ACE login|password/i.test(ht), "handoff note avoids 'claim your refund' / credential asks");
  const [dn, dt] = await grab(page.getByRole("button", { name: /^.*Deadlines \(\.csv\)/ }));
  const dl = dt.trim().split("\n"); ok(dn.endsWith(".csv") && dl.length > 5, `deadline CSV ${dn} has ${dl.length - 1} rows; header: ${dl[0]}`);
  const [icn, ict] = await grab(page.getByTestId("dl-ics"));
  ok(icn.endsWith(".ics") && ict.startsWith("BEGIN:VCALENDAR") && /BEGIN:VEVENT/.test(ict), `calendar file ${icn} is a valid .ics with events`);
  const [pmn, pmt] = await grab(page.getByTestId("dl-packet-md"));
  ok(pmn.endsWith(".md") && pmt.length > 500, `broker packet ${pmn} (${pmt.length} chars)`);
  const [ppn, ppt] = await grab(page.getByTestId("dl-packet-pdf"));
  ok(ppn.endsWith(".pdf") && fs.readFileSync(`${OUT}/${label}-${ppn}`).subarray(0, 5).toString() === "%PDF-", `broker packet ${ppn} is a PDF`);
  // --- deadline tracker: by-week dollars, route toggle, week list, drawer routes, and agreement with the .ics
  const dlt = page.getByTestId("dl-tracker");
  await dlt.scrollIntoViewIfNeeded();
  ok(await dlt.count() === 1 && /closes in the next 4 weeks/.test(await page.getByTestId("dl-summary").innerText()), "deadline tracker renders with a 4-week summary");
  ok(/Days are counted from \d{4}-\d{2}-\d{2}/.test(await page.getByTestId("dl-asof").innerText()), "tracker labels the as-of date its days run from");
  ok(await page.locator('[data-testid^="dl-week-"]:not([data-testid="dl-week-list"])').count() === 12, "tracker shows 12 weekly rows");
  const liveWeeks = page.locator('[data-testid^="dl-week-"]:not([data-testid="dl-week-list"]):not([disabled])');
  ok(await liveWeeks.count() >= 1, "at least one week has shipments closing");
  await liveWeeks.last().click();
  const wl = page.getByTestId("dl-week-list");
  ok(await wl.locator("tbody tr").count() >= 1 && /\$/.test(await wl.innerText()), "clicking a week lists its shipments with dollars");
  const rowsInfo = await wl.locator("tbody tr").evaluateAll((trs) => trs.map((t) => [t.querySelector("button")?.textContent ?? "", t.children[2]?.textContent ?? ""]));
  const icsDate = (key) => { const m = new RegExp(`UID:${key}-cape@[\\s\\S]*?DTSTART;VALUE=DATE:(\\d{8})`).exec(ict.replace(/\r\n /g, "")); return m ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}` : null; };
  const matched = rowsInfo.filter(([n, c]) => icsDate(n.replace(/-/g, "")) === c).length;
  const mismatched = rowsInfo.filter(([n, c]) => { const d = icsDate(n.replace(/-/g, "")); return d && d !== c; }).length;
  ok(mismatched === 0, `tracker closing dates never disagree with the .ics (${matched} matched, ${mismatched} mismatched)`);
  await page.screenshot({ path: `${OUT}/deadlines-${label}.png`, clip: await dlt.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + window.scrollY), width: window.innerWidth, height: Math.min(r.height + 24, 2400) }; }), fullPage: true });
  await page.getByTestId("dl-route-protest").click();
  ok(/Form 19/.test(await page.getByTestId("dl-asof").innerText()) && await page.getByTestId("dl-weeks").locator("li").count() === 12, "protest route view renders with the Form 19 note");
  ok(/19 CFR 174\.12/.test(await dlt.innerText()), "protest view cites 19 CFR 174.12");
  await page.getByTestId("dl-route-cape").click();
  await liveWeeks.first().click();
  await wl.locator("tbody tr button").first().click();
  const drr = page.getByTestId("dl-drawer-routes");
  await drr.waitFor({ timeout: 5000 });
  const drt = await drr.innerText();
  ok(/CAPE declaration window/.test(drt) && /days? left|closes today|closed/.test(drt), "drawer shows days left for the CAPE route");
  ok(/Form 19 protest/.test(drt) && await drr.locator('a[href*="1514"], a[href*="174.12"]').count() >= 1, "drawer shows the protest route with a citation link");
  await page.locator(".drawer button.x").click();

  // --- rule-watch re-score shows a visible diff
  const rs = page.getByTestId("rescore");
  await rs.scrollIntoViewIfNeeded();
  await page.getByTestId("rescore-headline").waitFor({ timeout: 10000 });
  const h1 = await page.getByTestId("rescore-headline").innerText();
  ok(/Safe to file changes|No shipment changes/.test(h1) && await page.getByTestId("rescore-move").count() >= 1, `real CBP change re-scores entries with a visible diff: ${h1}`);
  await page.getByTestId("rescore-scenario-window-60").click();
  ok(/Simulation/.test(await rs.innerText()), "what-if scenario is labelled Simulation");
  // --- scored test section (rules engine vs hand-labelled truth; AI arm pending credit)
  const st = page.getByTestId("scored-test");
  await st.scrollIntoViewIfNeeded();
  await page.getByTestId("arm-rules").waitFor({ timeout: 10000 });
  const rulesRow = await page.getByTestId("arm-rules").innerText();
  ok(/Rules engine/.test(rulesRow) && /\d+(\.\d)?%/.test(rulesRow) && /of 69/.test(rulesRow), `scored test shows the rules engine with real numbers: ${rulesRow.replace(/\s+/g, " ")}`);
  const aiRow = await page.getByTestId("arm-ai").innerText();
  ok(/AI alone/.test(aiRow) && /Pending credit/.test(aiRow) && !/\d/.test(aiRow), "scored test shows AI alone as Pending credit with no numbers");
  ok(await page.getByTestId("confusion-matrix").count() === 0, "confusion matrix is hidden until asked for");
  await page.getByTestId("scored-toggle").click();
  ok(await page.getByTestId("confusion-matrix").locator("tbody tr").count() === 4, "confusion matrix opens with four rows");
  if (label === "1440") await st.screenshot({ path: `${OUT}/scored-1440.png` });
  ok(await page.getByTestId("stage-receipt").count() === 0, "in-browser check shows no AI stage receipt (no AI ran)");
  ok(errs.length === 0, `no console/page errors ${errs.slice(0, 6).join(" | ")}`);
  await ctx.close();
}

// --- live path with an uploaded file (1440 only): Lightning + Ultra via the server
if (process.env.SKIP_LIVE !== "1") {
  console.log("\n=== live upload path ===");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type=file]').setInputFiles("data/sample-es003.csv");
  await page.getByLabel("Filer code").fill("A7K");
  const t0 = Date.now();
  await page.getByRole("button", { name: /Check with the AI/ }).click();
  await page.locator(".receipt").getByText(/live run/).waitFor({ timeout: 120000 });
  console.log(`  live run finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const rc = await page.locator(".receipt").innerText();
  ok(/Lightning/.test(rc) && /Ultra/.test(rc), "receipt shows both models");
  ok(await page.locator(".tabs .tab").count() === 4, "live board has 4 lanes");
  await page.screenshot({ path: `${OUT}/live-board-1440.png` });
  await page.locator(".receipt").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/live-receipt-1440.png` });
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n- ` + problems.join("\n- ") : "\nall checks passed");
process.exit(problems.length ? 1 : 0);
