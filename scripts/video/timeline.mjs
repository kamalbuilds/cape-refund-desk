// Builds timeline.json: per-beat durations driven by the measured voiceover wavs.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const V = process.env.V || "/Volumes/PortableSSD/nvdia/apps/cape-video";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEAD = 0.45, GAP = 0.35, TAIL = 0.7;
export const dur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
export function buildTimeline(script = JSON.parse(fs.readFileSync(path.join(HERE, "script.json"), "utf8")), voDir = path.join(V, "vo")) {
  const beats = Array.isArray(script) ? script : script.beats;
  const out = {};
  for (const b of beats) {
    let t = LEAD; const sentences = [];
    b.sentences.forEach((s, i) => {
      const wav = path.join(voDir, `${b.id}_${String(i + 1).padStart(2, "0")}.wav`);
      const d = dur(wav);
      sentences.push({ n: i + 1, wav, say: s.say, cap: s.cap, start: +t.toFixed(3), dur: +d.toFixed(3) });
      t += d + GAP;
    });
    out[b.id] = { id: b.id, title: b.title, D: +(t - GAP + TAIL).toFixed(3), sentences };
  }
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tl = buildTimeline();
  fs.writeFileSync(path.join(V, "timeline.json"), JSON.stringify(tl, null, 1));
  let tot = 0; for (const b of Object.values(tl)) { tot += b.D; console.log(b.id, b.D.toFixed(2)); }
  console.log("base total", tot.toFixed(2));
}
