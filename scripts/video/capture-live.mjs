// LIVE SEGMENT (swappable). Records a real run of the site against Nebius Token Factory and time-lapses it into live/L1.mp4
// plus live/L1.timeline.json. Requires Token Factory credit. If the host reports 402 / no credit it exits non-zero without writing a clip.
// Usage: node scripts/video/capture-live.mjs        env: TARGET=12 (seconds of final clip), V=<video dir>
// Then enable "L1" in scripts/video/edit-list.json and run: node scripts/video/render.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launch, Rig, sleep, BASE, V } from "./lib.mjs";
import { dur } from "./timeline.mjs";

const TARGET = +(process.env.TARGET || 12), MAXWAIT = +(process.env.MAXWAIT || 330) * 1000;
const live = path.join(V, "live"); fs.mkdirSync(live, { recursive: true });
const line = JSON.parse(fs.readFileSync(new URL("./live-script.json", import.meta.url), "utf8"));
const wav = path.join(live, "L1_01.wav");
if (!fs.existsSync(wav)) { console.log("generating narration with voiceb"); execFileSync("voiceb", ["say", line.sentences[0].say, "-o", wav], { stdio: "inherit" }); }

const { browser, page } = await launch();
try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: /Run live on Token Factory/ });
  if (await btn.isDisabled()) throw new Error("live runs are disabled on this host");
  const r = new Rig(page); await r.startScreencast(path.join(live, "raw"));
  await page.evaluate(() => { const t0 = performance.now(); window.__ov.card(`<small>LIVE run on Nebius Token Factory</small>Real time elapsed: <b id="__rt">0 s</b>`, { right: "30px", top: "30px" }); setInterval(() => { const e = document.getElementById("__rt"); if (e) e.textContent = Math.round((performance.now() - t0) / 1000) + " s"; }, 500); });
  await page.mouse.move(r.mx, r.my); await sleep(400); r.mark();
  await r.click(btn, 900);
  const t = Date.now(); let outcome = "";
  while (Date.now() - t < MAXWAIT) {
    if (await page.locator("section.notice").count()) { outcome = "notice"; break; }
    if (await page.locator(".receipt .rc").count()) { await sleep(800); outcome = (await page.locator("section.notice").count()) ? "notice" : "done"; break; }
    await sleep(1000);
  }
  if (outcome === "notice") throw new Error("host returned a notice instead of a live run (Token Factory credit exhausted?): " + (await page.locator("section.notice").first().innerText()).slice(0, 200));
  if (outcome !== "done") throw new Error("live run did not finish in time");
  await sleep(1500);
  const real = r.now();
  // speed-up: scale all frame times so the real run fits TARGET seconds (cursor click + first seconds stay readable)
  await r.cdp.send("Page.stopScreencast").catch(() => {});
  const k = (TARGET - 1.5) / real; const t0 = r.t0 - r.lat;
  const fr = r.frames.map((x) => ({ t: Math.max(0, (x.ts - t0) / 1000), f: x.f })).filter((x) => x.t <= real + 0.2).sort((a, b) => a.t - b.t);
  const lines = ["ffconcat version 1.0"];
  fr.forEach((x, i) => { const nx = i + 1 < fr.length ? fr[i + 1].t : real; lines.push(`file '${x.f}'`, `duration ${Math.max(0.001, (nx - x.t) * k).toFixed(4)}`); });
  lines.push(`file '${fr[fr.length - 1].f}'`, `duration 1.5`);
  const list = path.join(live, "raw", "list.txt"); fs.writeFileSync(list, lines.join("\n"));
  const out = path.join(live, "L1.mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-t", String(TARGET), "-c:v", "libx264", "-crf", "15", "-preset", "medium", "-r", "30", out]);
  const D = dur(out); const d = dur(wav);
  fs.writeFileSync(path.join(live, "L1.timeline.json"), JSON.stringify({ id: "L1", title: line.title, D: +D.toFixed(3), sentences: [{ n: 1, wav, say: line.sentences[0].say, cap: line.sentences[0].cap, start: 0.45, dur: +d.toFixed(3) }] }, null, 1));
  fs.rmSync(path.join(live, "raw"), { recursive: true, force: true });
  console.log(`live clip ${out} ${D.toFixed(1)}s from ${real.toFixed(0)}s real run (${(1 / k).toFixed(1)}x). Now: enable L1 in edit-list.json and run render.mjs`);
} catch (e) { console.error("LIVE CAPTURE NOT PRODUCED: " + e.message); process.exitCode = 2; } finally { await browser.close(); }
