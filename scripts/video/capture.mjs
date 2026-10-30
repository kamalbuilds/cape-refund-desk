// Scripted capture of the LIVE site, one clip per beat, each exactly as long as its narration.
// It attaches to the running Brave (deepsurge profile) over CDP, opens its own window, records it with a CDP screencast and closes only that window.
// Usage: node scripts/video/capture.mjs [B01 B02 ...]   (no args = all beats)
// env: V=<video dir>  CAPE_SRC=<checkout whose data/ docs/ tests/ hold the receipts the cards quote (default: this repo)>  CDP_URL=<http://127.0.0.1:PORT>  KEEP=1 keeps frames
// Run each beat under the shared recorder lock:  lockf -t 0 /tmp/deepsurge-rec.lock node scripts/video/capture.mjs B05
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, release, Rig, openDesk, sleep, BASE, V } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.CAPE_SRC || path.join(HERE, "../..");
const readSrc = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const TL = JSON.parse(fs.readFileSync(path.join(V, "timeline.json"), "utf8"));
fs.mkdirSync(path.join(V, "clips"), { recursive: true });

// Intercept the app's own file save so the recording never writes into the operator's Downloads folder. The export code still runs; its Blob is read here.
const HOOK_DOWNLOADS = () => {
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) { const rec = { name: this.download, text: null }; (window.__dl = window.__dl || []).push(rec); fetch(this.href).then((r) => r.text()).then((t) => { rec.text = t; }); return; }
    return orig.call(this);
  };
};
const until = async (fn, ms, what) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error("timeout waiting for " + what); await sleep(120); } };
const settle = async (p) => { let last = -1, same = 0; for (let i = 0; i < 40 && same < 4; i++) { const y = await p.evaluate(() => window.scrollY); same = y === last ? same + 1 : 0; last = y; await sleep(100); } };
const tagChip = (p, html, st = { right: "26px", top: "78px" }, keep = true) => p.evaluate(([h, s, k]) => window.__ov.card(h, s, k), [html, st, keep]);

const beats = {
  // Landing: the trap first, then why the upload is final.
  async B01(p, r, S) {
    const num = p.locator(".twist-num");
    await r.at(S(0, 0.05)); await r.move(900, 330, 1000);
    await r.at(S(0, 0.3)); await r.ring(p.locator(".twist-top"), "One shipment from her file", "blue", 8, "below");
    await r.at(S(0, 0.62)); await r.clear(); await r.moveTo(num, 600, 0.5, 0.5);
    await r.at(S(0, 0.7)); await r.ring(num, "Claiming it: she would owe $2,625", "red", 10);
    await r.at(S(1, 0.0)); await r.clear(); await r.moveTo(p.locator(".head-word"), 700);
    await r.at(S(1, 0.15)); await r.ring(p.locator(".head-brand"), "A check before the upload", "blue", 8, "below");
    await r.at(S(2, 0.0)); await r.clear(); await r.move(560, 150, 800);
    await r.at(S(2, 0.2)); await r.ring(p.locator(".r6-alert"), "One upload to CAPE. Can't be undone.", "red", 6, "below");
  },
  async B02(p, r, S) {
    const rows = p.locator(".how-it-works .how-row");
    await r.at(S(0, 0.1)); await r.ring(rows.nth(0), "Plain code: every dollar", "green", 6, "right");
    await r.at(S(0, 0.38)); await r.clear(); await r.ring(rows.nth(1), "Nemotron Lightning", "blue", 6, "right"); await r.ring(rows.nth(2), "Nemotron Ultra", "blue", 6, "right");
    await r.at(S(0, 0.6)); await r.clear(); await r.scrollTo(0, 1);
    await r.at(S(0, 0.74)); await r.ring(p.locator(".powered"), "Hosted on Nebius Token Factory", "blue", 8, "below");
  },
  // LIVE run on the hosted site, real calls to Nebius Token Factory, time-mapped onto the narration. Returns the time anchors.
  async B03(p, r, S, tl) {
    const btn = p.getByRole("button", { name: /Run it live/ });
    if (await btn.isDisabled()) throw new Error("live runs are disabled on this host");
    await r.at(S(0, 0.05)); await r.move(520, 470, 900);
    await r.at(S(0, 0.45)); await r.ring(btn, "Real calls, not a replay", "blue", 6);
    await r.at(S(0, 0.7));
    await tagChip(p, `<small>LIVE on Nebius Token Factory</small>Elapsed <b id="__rt">0.0 s</b>`);
    await r.click(btn, 700); await r.clear();
    const tClick = r.now();
    await p.evaluate(() => { const t0 = performance.now(); window.__rtI = setInterval(() => { const e = document.getElementById("__rt"); if (e) e.textContent = ((performance.now() - t0) / 1000).toFixed(1) + " s"; }, 100); });
    const bad = () => p.locator("section.notice").count();
    const prog = p.locator(".prog");
    await until(async () => (await bad()) ? (() => { throw new Error("host returned a notice, not a live run"); })() : (await prog.count()) > 0, 20000, "progress panel");
    await r.ring(prog.locator(":scope > div").nth(0), "Lightning: tidies every row", "blue", 6);
    let ultraRung = false;
    const tL = await until(async () => {
      if (!ultraRung && r.now() > tClick + 6.5) { ultraRung = true; await r.clear(); await r.ring(prog.locator(":scope > div").nth(1), "Ultra: reads the hard ones", "blue", 6).catch(() => {}); }
      return /69 \/ 69/.test(await prog.first().innerText().catch(() => "")) ? r.now() : 0;
    }, 90000, "Lightning 69 / 69");
    const tBoard = await until(async () => (await bad()) ? (() => { throw new Error("notice during run"); })() : (await p.locator(".claimcard").count()) ? r.now() : 0, 90000, "board");
    await r.clear();
    // the four group totals, narrated in S(2)
    const tabs = p.locator(".tabs button.tab"); const order = ["go", "hold", "decide", "stop"], col = ["green", "", "blue", "red"];
    await until(async () => (await tabs.count()) === 4, 8000, "four tabs");
    const v2 = (f) => S(2, f), vReal = (v) => tBoard + (v - S(2, 0)) + 0.1; // 1x after the board lands; the post-board anchor absorbs the drift
    await r.scrollTo(170, 600); // lift the four groups clear of the burned-in captions
    for (let i = 0; i < 4; i++) { await r.at(Math.max(r.now(), vReal(v2([0.28, 0.5, 0.7, 0.86][i]) - 0.45))); await r.clear(); await r.moveTo(p.locator("button.tab." + order[i]), 420, 0.5, 0.3); await r.ring(p.locator("button.tab." + order[i]), "", col[i], 6); }
    // wait for the receipt: the run is over when the total row exists
    const done = await until(async () => {
      if (await bad()) throw new Error("notice during run");
      const t = await p.evaluate(() => document.body.innerText); const m = t.match(/(\d+) AI call ids/); return m && /wall [\d.]+ s/.test(t) && !/Reasoning AI[^\n]*\n[^\n]*waits/.test(t) ? t : "";
    }, 120000, "receipt");
    const tDone = r.now(); await p.evaluate(() => clearInterval(window.__rtI));
    const calls = +done.match(/(\d+) AI call ids/)[1], wall = +done.match(/wall ([\d.]+) s/)[1], cost = done.match(/~\$([\d.]+) at list price/)?.[1];
    const failedMatches = [...done.matchAll(/(\d+) failed/g)].map((m) => +m[1]);
    const stageRows = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="stage-row-"]')].map((e) => e.innerText.replace(/\s+/g, " ")).join(" | "));
    console.log(`  live receipt: calls=${calls} wall=${wall}s cost=$${cost} stage=${stageRows.slice(0, 220)}`);
    if (calls !== 92) throw new Error("live run made " + calls + " calls, narration says 92");
    if (!(wall >= 15 && wall < 55)) throw new Error("live run took " + wall + " s, narration says under a minute");
    if (/Reasoning AI[^\n]*[1-9]\d* failed/.test(done) || failedMatches.some((n) => n > 0)) throw new Error("a call failed in the live run");
    await r.clear();
    await tagChip(p, `<small>This live run's receipt</small><b>${calls} calls</b> &middot; none failed &middot; <b>${wall.toFixed(1)} s</b> &middot; <b>~$${cost}</b>`, { left: "40px", bottom: "140px" });
    const realEnd = tDone + (tl.D - S(3, 0.1));
    const anchors = [[tClick, tClick], [tL, S(1, 0.97)], [tBoard, S(2, 0.02)], [tDone, S(3, 0.1)], [realEnd, tl.D]];
    return { anchors, note: `live: click ${tClick.toFixed(1)}s, lightning done ${tL.toFixed(1)}s, board ${tBoard.toFixed(1)}s, done ${tDone.toFixed(1)}s, run receipt wall ${wall}s` };
  },
  async B04(p, r, S) {
    const row = p.locator(".rows > li", { hasText: "A7K-5047642-2" }).first();
    await r.at(S(0, 0.0)); await r.ring(p.locator(".lanepanel-h > div").first(), "The 15 Customs would reject", "red", 6, "below");
    await r.at(S(0, 0.06)); await r.clear(); await r.click(row.locator("button.en"), 800);
    await p.locator(".drawer .d-quote").first().waitFor({ timeout: 8000 });
    await p.evaluate(() => { const d = document.querySelector(".drawer"); const sc = [d, d.parentElement].find((e) => e.scrollHeight > e.clientHeight + 5) || d; sc.setAttribute("data-sc", "1"); });
    await r.at(S(0, 0.45)); await r.scrollInto("[data-sc]", await p.evaluate(() => { const q = document.querySelector(".drawer .d-quote"), sc = document.querySelector("[data-sc]"); return sc.scrollTop + q.getBoundingClientRect().top - sc.getBoundingClientRect().top - 330; }), 700);
    await r.at(S(0, 0.78)); await r.ring(p.locator(".drawer .d-quote").first(), "Customs' exact error", "red", 6);
    await r.at(S(1, 0.0)); await r.clear(); await r.ring(p.locator(".drawer .d-finding p", { hasText: /iquidated 130 days ago/ }).first(), "Finalized 130 days ago, past the 80-day window", "blue", 6);
  },
  async B05(p, r, S) {
    const row = p.locator(".rows > li", { hasText: "A7K-7344990-0" }).first();
    await r.at(S(0, 0.04)); await r.click(row.locator("button.en"), 800);
    await p.locator(".drawer .d-brk").first().waitFor({ timeout: 8000 });
    await p.evaluate(() => { const d = document.querySelector(".drawer"); const sc = [d, d.parentElement].find((e) => e.scrollHeight > e.clientHeight + 5) || d; sc.setAttribute("data-sc", "1"); });
    const brk = p.locator(".drawer .d-brk");
    await r.at(S(0, 0.55)); await r.ring(brk.nth(0), "Tariff she paid: $10,500", "green", 5);
    await r.at(S(1, 0.0)); await r.clear(); await r.ring(brk.nth(1), "Other duties she underpaid: -$13,125", "red", 5);
    await r.at(S(1, 0.55)); await r.clear(); await r.ring(p.locator(".drawer .d-figure"), "Claiming it: she owes $2,625", "red", 8);
    await r.at(S(2, 0.0)); await r.clear();
    const sect = p.locator(".drawer .d-sect", { hasText: "What the reasoning AI says" }).first();
    await r.scrollInto("[data-sc]", await p.evaluate(() => { const h = [...document.querySelectorAll(".drawer .d-sect")].find((e) => /reasoning AI says/.test(e.innerText)), sc = document.querySelector("[data-sc]"); return sc.scrollTop + h.getBoundingClientRect().top - sc.getBoundingClientRect().top - 40; }), 700);
    await r.at(S(2, 0.22)); await r.ring(sect.locator(".d-body").first(), "Nemotron Ultra explains", "blue", 6);
    await r.at(S(2, 0.42)); await r.clear(); await r.click(sect.locator("details.d-reason > summary"), 500);
    await r.at(S(2, 0.58)); await r.click(sect.locator("details.d-trace > summary"), 500);
    await p.evaluate(() => { const pre = document.querySelector(".drawer details.d-trace pre"); const sc = document.querySelector("[data-sc]"); sc.scrollTop += pre.getBoundingClientRect().top - sc.getBoundingClientRect().top - 120; });
    await r.at(S(2, 0.76)); await r.ring(sect.locator("details.d-trace pre"), "Its reasoning, shown", "green", 6);
  },
  // Number guard (real earlier-recording sentence from the fixture) then a LIVE ten-shipment run with three planted note conflicts.
  async B06(p, r, S, tl) {
    const fixture = JSON.parse(readSrc("tests/fixtures/sample-run.2026-10-29.json"));
    const raw = fixture.portfolioNote.headline; const m = raw.match(/^File (\d+) entries expiring today/);
    if (!m) throw new Error("fixture headline no longer says 'File N entries expiring today': " + raw);
    const guardTest = readSrc("tests/numberguard.test.ts");
    if (!guardTest.includes('toContain("File 1 entry expiring today")')) throw new Error("tests/numberguard.test.ts no longer pins the corrected sentence");
    const mini = JSON.parse(readSrc("docs/receipts/tokenfactory-mini.json")); const au = mini.auditor;
    if (au.seededCaught !== 3 || au.seededTotal !== 3) throw new Error("mini receipt does not say 3 of 3: " + au.seededCaught + "/" + au.seededTotal);
    const removed = au.fabricatedTagsRemovedByCodeVeto; if (removed !== 4) throw new Error("mini receipt removed-tags is " + removed + ", narration says 4");
    await r.at(S(0, 0.04));
    await r.card(`<small>Number guard, earlier recording</small>Ultra's text: <span class="bad">File ${m[1]} entries expiring today</span><br>The code counted: <b>1</b><br><span class="good">Shown to Maya: File 1 entry expiring today</span>`, { left: "40px", top: "120px" });
    await r.at(S(1, 0.0)); await r.clear();
    // open the run controls from the board and start the live mini run
    const open = p.locator("button.boardbar-btn"); await r.click(open, 700);
    const mini_btn = p.getByRole("button", { name: /Live mini-run/ }); await mini_btn.waitFor({ timeout: 8000 });
    await r.at(S(1, 0.06)); await tagChip(p, `<small>LIVE on Nebius Token Factory &middot; 10 shipments</small>sped up`);
    await r.click(mini_btn, 600); const tClick = r.now();
    const bad = () => p.locator("section.notice").count();
    await until(async () => (await bad()) ? (() => { throw new Error("notice during mini run"); })() : (await p.locator('[data-testid="veto-receipt"]').count()) ? 1 : 0, 90000, "mini run board");
    await p.waitForFunction(() => !/waits for the clean-up|Cleaning up/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    const tDone = r.now(); await r.clear();
    await p.locator("button.tab.go").click(); await sleep(700);
    const caughtRows = p.locator(".rows > li", { hasText: "AI caught a note that disagrees" });
    const nCaught = await caughtRows.count(); console.log("  mini run: AI-caught rows", nCaught);
    if (nCaught !== 3) throw new Error("live mini run caught " + nCaught + " planted conflicts, narration says 3");
    await p.evaluate(() => document.querySelector(".lanepanel")?.scrollIntoView({ block: "start" })); await sleep(500);
    const tShow = r.now();
    for (let i = 0; i < 3; i++) await r.ring(caughtRows.nth(i), i === 0 ? "AI caught a note that disagrees" : "", "red", 3);
    await tagChip(p, `<small>Recorded receipt, 2026-10-30 (docs/receipts/tokenfactory-mini.json)</small>Deliberately wrong notes caught: <b>${au.seededCaught} of ${au.seededTotal}</b><br>Invented tags removed by code: <b>${removed}</b><br>${mini.totals.calls} calls &middot; ${mini.totals.failedCalls} failed &middot; ${mini.wallSeconds} s`, { right: "26px", bottom: "140px" });
    const anchors = [[tClick, tClick], [tDone, S(1, 0.4)], [tShow + 0.2, S(1, 0.6)], [tShow + 0.2 + (tl.D - S(1, 0.6)), tl.D]];
    return { anchors, note: `mini: click ${tClick.toFixed(1)}s, done ${tDone.toFixed(1)}s` };
  },
  async B07(p, r, S) {
    const add = p.getByRole("button", { name: /Add safe shipments to the refund file/ });
    await r.at(S(0, 0.0)); await r.click(add, 800);
    await p.locator(".dock .r6-body b", { hasText: "39" }).waitFor({ timeout: 8000 });
    await r.at(S(0, 0.22)); await r.ring(p.locator(".dock .r6-body"), "39 shipments selected", "green", 6);
    await r.at(S(0, 0.38)); await r.clear(); await r.click(p.locator(".dock .ack input"), 700);
    await r.at(S(0, 0.46)); await r.ring(p.locator(".dock .ack"), "She confirms: cannot be undone", "blue", 6);
    const file = p.locator(".dock .r6-primary").first();
    await r.at(S(0, 0.58)); await r.clear(); await r.click(file, 800);
    const dl = await until(async () => p.evaluate(() => (window.__dl || []).find((d) => d.text !== null) || null), 6000, "CSV blob");
    const lines = dl.text.split(/\r?\n/).filter(Boolean);
    if (lines[0] !== "Entry Number") throw new Error("CSV header is " + lines[0]);
    if (lines.length !== 40) throw new Error("CSV has " + (lines.length - 1) + " rows, narration says 39");
    for (const k of ["A7K73449900", "A7K21865533"]) if (dl.text.includes(k)) throw new Error("a broker-decision shipment (" + k + ") is in the CSV");
    await r.ring(file, "Customs' own upload format", "green", 6);
    await r.card(`<small>${dl.name}: first rows of ${lines.length - 1}</small><code>${lines.slice(0, 4).join("\n")}\n...</code>`, { left: "40px", bottom: "140px" });
    await r.at(S(0, 0.7)); await r.clear(); await r.ring(file, "", "green", 6);
    await r.card(`<small>Not in the file</small>The 2 broker-decision shipments:<br><b>A7K-7344990-0, the -$2,625 one</b><br>and A7K-2186553-3`, { right: "40px", bottom: "140px", fontSize: "20px" }, true);
    await r.at(S(1, 0.05)); await r.clear(); await r.moveTo(p.locator(".dock .r6-secondary-row button").first(), 700);
    await r.at(S(1, 0.3)); await r.ring(p.locator(".dock .r6-secondary-row button").first(), "A note for her broker", "blue", 6);
  },
  async B08(p, r, S) {
    const btn = p.getByRole("button", { name: /Check Customs' page now/ });
    await r.at(S(0, 0.08)); await r.click(btn, 800);
    await p.locator(".watch .wr .chg").first().waitFor({ timeout: 60000 });
    await r.at(S(0, 0.4)); await r.scrollToEl(p.locator(".watch .wr"), 700, 130);
    await r.at(S(0, 0.7)); await r.ring(p.locator(".watch .wr > p").first(), "Live cbp.gov page vs the July copy", "blue", 6);
    await r.at(S(1, 0.0)); await r.clear(); await r.ring(p.locator(".watch .wr > p").nth(1), "4 changes touch these checks", "red", 6);
    await r.at(S(1, 0.45)); await r.clear();
    await r.scrollToEl(p.locator(".watch .chg").first(), 600, 120);
    await r.at(S(1, 0.62)); await r.ring(p.locator(".watch .chg").first(), "Tavily agrees", "green", 6);
  },
  async B09(p, r, S) {
    const rc = p.locator(".receipt");
    await r.at(S(0, 0.0)); await r.scrollToEl(rc, 700, 70);
    await r.at(S(0, 0.04)); await r.ring(rc.locator("h2, .eyebrow").first(), "The receipt", "blue", 6);
    const total = rc.getByText(/at list price/).first();
    await r.at(S(0, 0.2)); await r.clear(); await r.scrollToEl(total, 600, 360); await r.ring(total, "Every call logged, about 12 cents", "green", 8);
    await r.at(S(0, 0.55)); await r.clear();
    const sec = p.locator("section", { has: p.getByText("Scored test", { exact: true }) }).first();
    await r.scrollToEl(sec, 800, 70);
    const row = sec.locator("tr", { hasText: "Rules engine" }).first();
    await r.at(S(0, 0.78)); await r.ring(row, "69 of 69, labelled by hand", "green", 6);
  },
  async B10(p, r, S) {
    await r.at(S(0, 0.0)); await r.scrollTo(0, 900);
    await r.at(S(0, 0.15)); await p.evaluate(() => window.__ov.end(`<h1>CAPE Refund Desk</h1><p>Check the file before the upload nobody can undo.</p><div class="u">cape-refund-desk.vercel.app</div><div class="f">Open source: github.com/kamalbuilds/cape-refund-desk<br>Prepared for licensed customs broker review. Not legal or customs advice.</div>`));
  },
};

const replayBeats = new Set(["B04", "B05", "B06", "B07", "B08", "B09", "B10"]); // start from the recorded 2026-10-30 run, the rest from the landing page
const TRIES = {}; // retries live in rec.sh so the shared recorder lock is held only while a take is actually recording
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(beats);
let failed = 0;
for (const id of want) {
  const tl = TL[id]; let ok = false;
  for (let attempt = 1; attempt <= (TRIES[id] || 1) && !ok; attempt++) {
    const t0 = Date.now(); let r = null;
    const L = await launch(); const { page } = L;
    try {
      if (id === "B07") await page.addInitScript(HOOK_DOWNLOADS);
      await openDesk(page, replayBeats.has(id));
      r = new Rig(page);
      await r.startScreencast(path.join(V, "raw", id));
      const PRE = { B02: [".how-it-works", 120], B08: ["section.watch", 150], B09: [".receipt", 70] };
      if (PRE[id]) { await page.evaluate(([sel, off]) => window.scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + window.scrollY - off), PRE[id]); await sleep(500); }
      if (id === "B04" || id === "B05") { // open the lane before recording so the beat starts on the list; the lanes were already shown in B03
        await page.locator(id === "B04" ? "button.tab.stop" : "button.tab.decide").click(); await sleep(400); await settle(page);
        await page.evaluate(() => document.querySelector(".lanepanel")?.scrollIntoView({ block: "start" })); await sleep(300); await settle(page);
      }
      await page.mouse.move(r.mx, r.my); await sleep(400);
      r.mark();
      const S = (i, f = 0) => tl.sentences[i].start + f * tl.sentences[i].dur;
      const out = await beats[id](page, r, S, tl);
      const n = await r.stop(tl.D, path.join(V, "clips", `${id}.mp4`), out?.anchors ?? null);
      console.log(`${id} ok (attempt ${attempt}) D=${tl.D.toFixed(2)} frames=${n} late<=${((r.late || 0) / 1000).toFixed(2)}s wall=${((Date.now() - t0) / 1000).toFixed(0)}s${out?.note ? "  " + out.note : ""}`);
      ok = true;
    } catch (e) {
      console.error(`${id} attempt ${attempt} FAILED: ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: path.join(V, "raw", `${id}-fail.png`) }).catch(() => {});
      await r?.abort(); fs.rmSync(path.join(V, "raw", id), { recursive: true, force: true });
    } finally { await release(L); }
    if (!ok && attempt < (TRIES[id] || 1)) await sleep(20000);
  }
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
