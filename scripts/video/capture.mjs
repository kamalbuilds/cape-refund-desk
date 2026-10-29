// Scripted Playwright capture of the LIVE site, one clip per beat, each exactly as long as its narration.
// Usage: node scripts/video/capture.mjs [B01 B02 ...]   (no args = all beats)   env: V=<video dir>, KEEP=1 keeps frames
import fs from "node:fs";
import path from "node:path";
import { launch, Rig, openDesk, sleep, V } from "./lib.mjs";

const TL = JSON.parse(fs.readFileSync(path.join(V, "timeline.json"), "utf8"));
const RUN = JSON.parse(fs.readFileSync(new URL("../../data/sample-run.json", import.meta.url), "utf8"));
fs.mkdirSync(path.join(V, "clips"), { recursive: true });
const usd = (n, d = 4) => "$" + n.toFixed(d);

const beats = {
  async B01(p, r, S) {
    await r.at(S(0, 0.1)); await r.move(560, 430, 900);
    await r.at(S(0, 0.45)); await r.ring(p.locator(".intro-copy .fine"), "Small importers file by CSV", "blue");
    await r.at(S(1, 0.05)); await r.clear(); await r.move(1000, 70, 1000);
    await r.at(S(1, 0.45)); await r.ring(p.locator(".irrev"), "CAPE upload: irreversible", "red", 6);
    await r.at(S(2, 0.0)); await r.move(520, 205, 900);
    await r.at(S(3, 0.0)); await r.clear(); await r.ring(p.locator(".irrev"), "One wrong row stays", "red", 10);
  },
  async B02(p, r, S) {
    await r.at(S(0, 0.05)); await r.moveTo(p.locator(".brand h1"), 800);
    await r.at(S(0, 0.3)); await r.ring(p.locator(".brand"), "Pre-flight check for the CAPE file", "blue");
    await r.at(S(1, 0.0)); await r.clear(); await r.moveTo(p.locator(".powered"), 700, 0.3, 0.5);
    await r.at(S(1, 0.12)); await r.ring(p.locator(".powered"), "Nemotron explains, on Token Factory", "blue", 6);
    await r.at(S(1, 0.55)); await r.clear(); await r.moveTo(p.locator(".intro-copy b").first(), 800, 0.4, 0.5);
    await r.at(S(1, 0.7)); await r.ring(p.locator(".intro-copy b").first(), "No model touches a dollar figure", "green", 6);
  },
  async B03(p, r, S) {
    await r.at(S(0, 0.08)); await r.click(p.getByRole("button", { name: /Run the sample/ }), 900);
    await p.locator(".datalabel").waitFor({ timeout: 20000 });
    await r.at(S(0, 0.62)); await r.ring(p.locator(".datalabel"), "Synthetic sample: 69 entries", "blue", 6);
    await r.at(S(1, 0.0)); await r.clear(); await r.scrollToEl(p.locator(".prog"), 800, 70);
    await r.at(S(1, 0.12)); await r.ring(p.locator(".prog .bar").nth(0), "Nemotron Lightning: cleans the rows", "blue", 6);
    await r.at(S(1, 0.52)); await r.clear(); await r.ring(p.locator(".prog .bar").nth(1), "Nemotron Ultra: reads the hard ones", "blue", 6);
    await r.at(S(2, 0.0)); await r.clear(); await r.scrollToEl(p.locator(".totals"), 800, 110);
    const tots = p.locator(".totals .tot"); const at = [0.22, 0.42, 0.6, 0.8]; const col = ["green", "", "blue", "red"];
    for (let i = 0; i < 4; i++) { await r.at(S(2, at[i] - 0.06)); await r.clear(); await r.moveTo(tots.nth(i), 450, 0.5, 0.35); await r.ring(tots.nth(i), "", col[i], 6); }
  },
  async B04(p, r, S) {
    const card = p.locator(".card", { hasText: /A7K-?5047642-?2/ }).first();
    await r.at(S(0, 0.0)); await r.click(card, 1000);
    await p.locator(".drawer .cbp.big").waitFor({ timeout: 8000 });
    await r.at(S(0, 0.6)); await r.ring(p.locator(".drawer .cbp.big").first(), "The exact CBP error", "red", 6);
    await r.at(S(1, 0.0)); await r.clear(); await r.ring(p.locator(".drawer .finding p", { hasText: /iquidat/ }).first(), "Why it would fail", "blue", 6);
  },
  async B05(p, r, S) {
    const card = p.locator(".card", { hasText: /A7K-?5130944-?4/ }).first();
    await r.at(S(0, 0.0)); await r.click(card, 900);
    await p.locator(".drawer").waitFor({ timeout: 8000 });
    await r.at(S(0, 0.3)); await p.evaluate(() => { const d = document.querySelector(".drawer"); const sc = [d, d.parentElement].find((e) => e.scrollHeight > e.clientHeight + 5) || d; sc.setAttribute("data-sc", "1"); });
    await r.scrollInto("[data-sc]", 700, 700);
    await r.at(S(0, 0.62)); await r.ring(p.locator(".drawer tr", { hasText: "IEEPA refundable" }).first(), "Looks like $8,000", "blue", 5);
    await r.at(S(1, 0.0)); await r.clear(); await r.ring(p.locator(".drawer tr", { hasText: /Underpaid/ }).first(), "$5,600 underpaid duty nets against it", "red", 5);
    await r.at(S(1, 0.6)); await r.clear(); await r.ring(p.locator(".drawer tr", { hasText: /^Net/ }).first(), "Real refund: $2,400", "green", 5);
    await r.at(S(2, 0.0)); await r.clear(); await r.scrollInto("[data-sc]", 0, 700);
    await r.at(S(2, 0.22)); await r.ring(p.locator(".drawer .ultra").first(), "Nemotron Ultra explains", "blue", 6);
    await r.at(S(2, 0.5)); await r.clear(); await r.click(p.locator(".drawer .ultra summary"), 600);
    await r.at(S(2, 0.68)); await r.scrollInto("[data-sc]", 260, 600);
    await r.at(S(2, 0.82)); await r.ring(p.locator(".drawer .ultra pre"), "Its reasoning, shown", "green", 6);
  },
  async B06(p, r, S) {
    const head = (await p.locator(".note .headline").innerText()).trim();
    if (!/File 1 /.test(head)) throw new Error("headline unexpected: " + head);
    const raw = RUN.portfolioNote.headline;
    await r.at(S(0, 0.0)); await r.scrollToEl(p.locator(".note"), 800, 90);
    await r.at(S(0, 0.2)); await r.card(`<small>Raw model text, from the recorded run</small><code>${raw.replace("File 7 entries", 'File <span class="bad">7</span> entries').replace(/; /g, ";\n")}</code>`, { left: "40px", bottom: "110px" });
    await r.at(S(1, 0.0)); await r.clear();
    await r.card(`<small>Number guard</small>Engine counted <b>1</b> entry expiring today.<br><span class="bad">${raw.split(";")[0]}</span><br><span class="good">${head.split(";")[0]}</span>`, { left: "40px", bottom: "110px" });
    await r.at(S(1, 0.3)); await r.ring(p.locator(".note .headline"), "What Maya sees", "green", 6);
  },
  async B07(p, r, S) {
    const files = p.locator(".export .btns .btn.primary").first();
    await r.at(S(0, 0.0)); await r.click(p.locator(".export .ack input"), 800);
    await r.at(S(0, 0.2)); await r.ring(p.locator(".export .ack"), "She confirms: cannot be undone", "blue", 6);
    await r.at(S(0, 0.5)); await r.clear();
    const dl = p.waitForEvent("download"); await r.click(files, 800); const d = await dl;
    const txt = fs.readFileSync(await d.path(), "utf8").split(/\r?\n/).filter(Boolean);
    await r.ring(files, "CAPE CSV: only the safe entries", "green", 6);
    await r.card(`<small>${d.suggestedFilename()}: first rows</small><code>${txt.slice(0, 4).join("\n")}\n...</code>`, { left: "40px", bottom: "110px" });
    await r.at(S(1, 0.0)); await r.clear(); const hb = p.locator(".export .btn", { hasText: /Broker handoff/ });
    await r.moveTo(hb, 700); await r.ring(hb, "A note for her broker", "blue", 6);
  },
  async B08(p, r, S) {
    await r.at(S(0, 0.0)); await r.click(p.getByRole("button", { name: /Check CBP now/ }), 900);
    await p.locator(".watch .wr").waitFor({ timeout: 30000 });
    await r.at(S(0, 0.45)); await r.scrollToEl(p.locator(".watch .wr"), 700, 150);
    await r.at(S(0, 0.72)); await r.ring(p.locator(".watch .wr"), "Live cbp.gov page vs the July copy", "blue", 6);
    await r.at(S(1, 0.0)); await r.clear(); await r.scrollToEl(p.locator(".watch .chg.lvl0").first(), 700, 120);
    await r.at(S(1, 0.2)); await r.ring(p.locator(".watch .chg.lvl0 .vs").first(), "Changed on CBP's page", "red", 6);
    await r.at(S(1, 0.62)); await r.clear(); await r.ring(p.locator(".watch .chg.lvl0 .fine.ok").first(), "", "green", 6);
    await r.card(`<small>Independent confirmers</small>Tavily Extract and treg both agree`, { right: "40px", bottom: "110px" });
  },
  async B09(p, r, S) {
    await r.at(S(0, 0.15)); await r.ring(p.locator(".receipt .eyebrow"), "Token Factory receipt", "blue", 6);
    const rc = p.locator(".receipt .rc > div");
    const L = RUN.receipt.lightning.costUsd, U = RUN.receipt.ultra.costUsd;
    const chip = async (i, html) => { const b = await rc.nth(i).boundingBox(); await r.card(html, { left: Math.max(20, b.x) + "px", top: Math.min(560, b.y + b.height + 16) + "px", fontSize: "20px" }); };
    await r.at(S(1, 0.04)); await r.clear(); await r.ring(rc.nth(0), "", "blue", 6); await chip(0, `<small>Lightning, all 69 entries</small><b>${usd(L)}</b>`);
    await r.at(S(1, 0.5)); await r.clear(); await r.ring(rc.nth(1), "", "green", 6); await chip(1, `<small>Ultra, the reasoning</small><b>${usd(U)}</b>`);
  },
  async B10(p, r, S) {
    await r.at(S(0, 0.0)); await r.scrollTo(0, 900);
    await r.at(S(0, 0.18)); await p.evaluate(() => window.__ov.end(`<h1>CAPE Refund Desk</h1><p>Check the file before the upload nobody can undo.</p><div class="u">cape-refund-desk.vercel.app</div><div class="f">Open source: github.com/kamalbuilds/cape-refund-desk<br>Prepared for licensed customs broker review. Not legal or customs advice.</div>`));
  },
};

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(beats);
const replayBeats = new Set(["B04", "B05", "B06", "B07", "B08", "B09", "B10"]);
for (const id of want) {
  const tl = TL[id]; const t0 = Date.now();
  const { browser, page } = await launch();
  try {
    await openDesk(page, replayBeats.has(id));
    const r = new Rig(page);
    await r.startScreencast(path.join(V, "raw", id));
    // pre-position (not recorded): beats that open on the lanes
    if (id === "B04" || id === "B05") {
      const card = page.locator(".card", { hasText: id === "B04" ? /A7K-?5047642-?2/ : /A7K-?5130944-?4/ }).first();
      await card.evaluate((e) => e.scrollIntoView({ block: "center" })); await sleep(300);
      await page.evaluate(() => window.scrollBy(0, 0));
    }
    const PRE = { B07: [".export", 90], B08: ["section.watch", 80], B09: [".receipt", 70] };
    if (PRE[id]) { await page.evaluate(([sel, off]) => window.scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + window.scrollY - off), PRE[id]); await sleep(400); }
    await page.mouse.move(r.mx, r.my); await sleep(500);
    r.mark();
    const S = (i, f = 0) => tl.sentences[i].start + f * tl.sentences[i].dur;
    await beats[id](page, r, S);
    const n = await r.stop(tl.D, path.join(V, "clips", `${id}.mp4`));
    console.log(`${id} ok D=${tl.D.toFixed(2)} frames=${n} late<=${((r.late || 0) / 1000).toFixed(2)}s wall=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    console.error(`${id} FAILED: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(V, "raw", `${id}-fail.png`) }).catch(() => {});
  } finally { await browser.close(); }
}
