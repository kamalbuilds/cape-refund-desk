// Shared capture helpers: attach to the already-running Brave (deepsurge profile) over CDP, open ONE own window,
// CDP screencast, injected cursor / ring / tag overlays.
// Never launches a browser and never creates a profile. Only the window this module creates is ever closed.
import fs from "node:fs";
import path from "node:path";
import * as pw from "playwright-core";
import { execFileSync } from "node:child_process";
export const BASE = process.env.CAPE_URL || "https://cape-refund-desk.vercel.app";
export const V = process.env.V || "/Volumes/PortableSSD/nvdia/apps/cape-video";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = () => {
  const install = () => {
    if (window.__ov || !document.documentElement) return;
    const css = document.createElement("style");
    css.textContent = `
#__ovroot{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
#__cur{position:fixed;left:0;top:0;width:28px;height:28px;margin:-3px 0 0 -3px;opacity:0;transition:opacity .2s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
.__ring{position:fixed;border:3px solid #ffb020;border-radius:10px;box-shadow:0 0 0 4px rgba(255,176,32,.22),0 0 24px rgba(255,176,32,.35);opacity:0;animation:__in .35s ease forwards}
.__ring.blue{border-color:#4aa3ff;box-shadow:0 0 0 4px rgba(74,163,255,.22),0 0 24px rgba(74,163,255,.35)}
.__ring.green{border-color:#35d07f;box-shadow:0 0 0 4px rgba(53,208,127,.22),0 0 24px rgba(53,208,127,.35)}
.__ring.red{border-color:#ff5d5d;box-shadow:0 0 0 4px rgba(255,93,93,.22),0 0 24px rgba(255,93,93,.35)}
.__lab{position:fixed;background:#111827;color:#fff;font-size:15px;font-weight:700;letter-spacing:.2px;padding:5px 11px;border-radius:7px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:0;animation:__in .35s ease forwards}
.__card{position:fixed;background:#0b1220;color:#f4f6fb;border:1px solid #2b3a55;border-left:5px solid #ffb020;border-radius:10px;padding:14px 18px;font-size:17px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.45);opacity:0;animation:__in .4s ease forwards;max-width:560px}
.__card small{display:block;color:#ffb020;font-size:12px;letter-spacing:.9px;text-transform:uppercase;font-weight:800;margin-bottom:6px}
.__card code{font-family:ui-monospace,Menlo,monospace;font-size:15px;color:#9ee7ff;white-space:pre-wrap}
.__card .bad{color:#ff8a8a;text-decoration:line-through}
.__card .good{color:#6ee7a8;font-weight:700}
.__rip{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #4aa3ff;animation:__rip .55s ease-out forwards}
.__end{position:fixed;inset:0;background:radial-gradient(1200px 700px at 50% 40%,#12203a,#070b14);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;opacity:0;animation:__in .7s ease forwards;text-align:center}
.__end h1{font-size:64px;margin:0 0 14px;letter-spacing:-1px}
.__end p{font-size:26px;margin:6px 0;color:#c6d3ea}
.__end .u{font-family:ui-monospace,Menlo,monospace;color:#9ee7ff;font-size:28px;margin-top:22px}
.__end .f{font-size:17px;color:#8ea0c0;margin-top:26px}
@keyframes __in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes __rip{from{opacity:1;transform:scale(.6)}to{opacity:0;transform:scale(3.2)}}`;
    document.documentElement.appendChild(css);
    const root = document.createElement("div"); root.id = "__ovroot";
    root.innerHTML = `<svg id="__cur" viewBox="0 0 24 24"><path d="M3 2l7.2 18 2.6-7.4L20.4 10z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(root);
    const cur = root.querySelector("#__cur");
    document.addEventListener("mousemove", (e) => { cur.style.opacity = 1; cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    const add = (cls, html, st) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html || ""; Object.assign(d.style, st); root.appendChild(d); return d; };
    window.__ov = {
      ring(r, label, color = "", pad = 8, pos = "auto") {
        add("__ring " + color, "", { left: r.x - pad + "px", top: r.y - pad + "px", width: r.w + pad * 2 + "px", height: r.h + pad * 2 + "px" });
        if (!label) return;
        if (pos === "right") { add("__lab", label, { left: r.x + r.w + pad + 12 + "px", top: r.y + r.h / 2 - 15 + "px" }); return; }
        const above = r.y - pad - 36 > 4;
        const top = pos === "below" || !above ? r.y + r.h + pad + 8 : r.y - pad - 36;
        add("__lab", label, { left: Math.max(8, r.x - pad) + "px", top: top + "px" });
      },
      card(html, st, keep) { const d = add("__card", html, st); if (keep) d.setAttribute("data-keep", "1"); },
      ripple(x, y) { add("__rip", "", { left: x + "px", top: y + "px" }); setTimeout(() => root.querySelectorAll(".__rip").forEach((e) => e.remove()), 700); },
      end(html) { add("__end", html, {}); },
      clear() { root.querySelectorAll(".__ring,.__lab,.__card:not([data-keep])").forEach((e) => e.remove()); },
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  install();
};

async function cdpUrl() {
  const cands = process.env.CDP_URL ? [process.env.CDP_URL] : ["http://127.0.0.1:9222", "http://127.0.0.1:9396"];
  for (const u of cands) {
    try { const r = await fetch(u + "/json/version", { signal: AbortSignal.timeout(1500) }); if (r.ok) return u; } catch { /* try next */ }
  }
  throw new Error("no running Brave on CDP (tried " + cands.join(", ") + "). Start the deepsurge profile: bhn deepsurge");
}

// Attach to the running Brave and open this script's OWN window, so other recorders' tabs keep painting.
export async function launch() {
  const browser = await pw.chromium.connectOverCDP(await cdpUrl());
  const ctx = browser.contexts()[0];
  const fresh = ctx.waitForEvent("page", { timeout: 15000 });
  const bs = await browser.newBrowserCDPSession();
  const { targetId } = await bs.send("Target.createTarget", { url: "about:blank", newWindow: true, width: 1440, height: 900 });
  const page = await fresh;
  await page.addInitScript(INIT);
  await page.setViewportSize({ width: 1372, height: 772 });
  const cs = await ctx.newCDPSession(page);
  await cs.send("Emulation.setDeviceMetricsOverride", { width: 1372, height: 772, deviceScaleFactor: 1.4, mobile: false });
  await cs.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await page.bringToFront();
  return { browser, ctx, page, targetId, bs };
}

// Close only the window this script opened, then drop the connection (the browser keeps running).
export async function release({ browser, page, targetId, bs }) {
  if (bs && targetId) await bs.send("Target.closeTarget", { targetId }).catch(() => {});
  else await page.close().catch(() => {});
  await sleep(300);
  browser.close().catch(() => {});
}

export class Rig {
  constructor(page) { this.p = page; this.mx = 700; this.my = 380; this.frames = []; this.t0 = null; }
  async startScreencast(dir) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    this.dir = dir; this.cdp = await this.p.context().newCDPSession(this.p); this.n = 0; this.lat = Infinity;
    this.cdp.on("Page.screencastFrame", (ev) => {
      const recv = Date.now(); const ts = ev.metadata.timestamp * 1000;
      this.lat = Math.min(this.lat, recv - ts);
      if (this.stopped) return;
      const f = path.join(dir, `f${String(this.n++).padStart(6, "0")}.jpg`);
      try { fs.writeFileSync(f, Buffer.from(ev.data, "base64")); } catch { return; }
      this.frames.push({ ts, f }); this.cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  async abort() { this.stopped = true; await this.cdp?.send("Page.stopScreencast").catch(() => {}); }
  mark() { this.t0 = Date.now(); }
  at(sec) { const d = this.t0 + sec * 1000 - Date.now(); if (-d > (this.late || 0)) this.late = -d; return sleep(Math.max(0, d)); }
  now() { return (Date.now() - this.t0) / 1000; }
  // anchors (optional): [[realSec, videoSec], ...] piecewise-linear time map for time-lapsed live runs; the last anchor must be [realEnd, D].
  async stop(D, out, anchors = null) {
    const A = anchors ? (anchors[0][0] === 0 ? anchors : [[0, 0], ...anchors]) : null;
    if (A) for (let i = 1; i < A.length; i++) if (!(A[i][0] > A[i - 1][0] && A[i][1] > A[i - 1][1])) throw new Error("anchors must increase in real and video time: " + JSON.stringify(A));
    await this.at(A ? A[A.length - 1][0] : D); await sleep(250);
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    const fwd = (t) => { if (!A) return t; for (let i = 1; i < A.length; i++) if (t <= A[i][0]) return A[i - 1][1] + (t - A[i - 1][0]) * (A[i][1] - A[i - 1][1]) / (A[i][0] - A[i - 1][0]); return A[A.length - 1][1]; };
    const t0 = this.t0 - this.lat; // frame ts in capture-clock terms
    const fr = this.frames.map((x) => ({ t: fwd((x.ts - t0) / 1000), f: x.f })).sort((a, b) => a.t - b.t);
    let i0 = 0; fr.forEach((x, i) => { if (x.t <= 0) i0 = i; });
    const use = fr.slice(i0).map((x, i) => (i === 0 ? { ...x, t: 0 } : x)).filter((x) => x.t < D);
    const lines = ["ffconcat version 1.0"];
    use.forEach((x, i) => { const nx = i + 1 < use.length ? use[i + 1].t : D; lines.push(`file '${x.f}'`, `duration ${Math.max(0.001, nx - x.t).toFixed(4)}`); });
    lines.push(`file '${use[use.length - 1].f}'`);
    const list = path.join(this.dir, "list.txt"); fs.writeFileSync(list, lines.join("\n"));
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-t", String(D), "-c:v", "libx264", "-crf", "15", "-preset", "medium", "-r", "30", out]);
    const nframes = use.length;
    if (!process.env.KEEP) fs.rmSync(this.dir, { recursive: true, force: true });
    return nframes;
  }
  // ---- motion ----
  async move(x, y, ms = 700) {
    const sx = this.mx, sy = this.my, steps = Math.max(6, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await this.p.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e); await sleep(ms / steps);
    }
    this.mx = x; this.my = y;
  }
  async moveTo(loc, ms = 700, fx = 0.5, fy = 0.5) {
    const b = await loc.boundingBox(); if (!b) throw new Error("no box for " + loc);
    await this.move(b.x + b.width * fx, b.y + b.height * fy, ms); return b;
  }
  async click(loc, ms = 650) {
    const b = await this.moveTo(loc, ms); await sleep(120);
    await this.p.evaluate(([x, y]) => window.__ov.ripple(x, y), [this.mx, this.my]);
    await this.p.mouse.down(); await sleep(70); await this.p.mouse.up(); return b;
  }
  async ring(loc, label, color = "", pad = 8, pos = "auto") {
    const b = await loc.boundingBox(); if (!b) throw new Error("ring: no box " + loc);
    const x0 = Math.max(10, b.x), y0 = Math.max(6, b.y), x1 = Math.min(1372 - 10, b.x + b.width), y1 = Math.min(772 - 80, b.y + b.height);
    await this.p.evaluate(([r, l, c, pd, ps]) => window.__ov.ring(r, l, c, pd, ps), [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, label, color, pad, pos]); return b;
  }
  clear() { return this.p.evaluate(() => window.__ov.clear()); }
  card(html, st, keep = false) { return this.p.evaluate(([h, s, k]) => window.__ov.card(h, s, k), [html, st, keep]); }
  async scrollTo(y, ms = 900) {
    await this.p.evaluate(([y, ms]) => new Promise((res) => { const s = window.scrollY, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, s + (y - s) * e); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), [y, ms]);
  }
  async scrollToEl(loc, ms = 900, offset = 90) {
    const y = await loc.evaluate((e, o) => e.getBoundingClientRect().top + window.scrollY - o, offset); await this.scrollTo(Math.max(0, y), ms);
  }
  async scrollInto(sel, to, ms = 700) {
    await this.p.evaluate(([sel, to, ms]) => new Promise((res) => { const el = document.querySelector(sel); const s = el.scrollTop, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; el.scrollTop = s + (to - s) * e; k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), [sel, to, ms]);
  }
}

export async function openDesk(page, replay) {
  await page.goto(BASE + (replay ? "/?demo=replay" : "/"), { waitUntil: "networkidle" });
  if (replay) {
    await page.waitForSelector(".claimcard", { timeout: 60000 });
    await page.waitForSelector(".receipt", { state: "attached", timeout: 60000 });
    await sleep(3200); // let the count-up and lane animations settle before recording starts
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
}
