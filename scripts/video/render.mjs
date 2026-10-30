// Edit-list driven render: concat clips, burn captions (PIL PNGs), mix per-sentence voiceover, loudnorm, H.264 1080p MP4.
// Usage: node scripts/video/render.mjs [edit-list.json]     env: V=<video dir>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { V, dur } from "./timeline.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EL = JSON.parse(fs.readFileSync(process.argv[2] || path.join(HERE, "edit-list.json"), "utf8"));
const TL = JSON.parse(fs.readFileSync(path.join(V, "timeline.json"), "utf8"));
const work = path.join(V, "render"); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });

const segs = []; let off = 0;
for (const s of EL.segments.filter((x) => x.enabled)) {
  const tl = s.timelineFile ? JSON.parse(fs.readFileSync(path.join(V, s.timelineFile), "utf8")) : TL[s.id];
  const clip = path.join(V, s.clip || `clips/${s.id}.mp4`);
  if (!fs.existsSync(clip)) throw new Error(`missing clip ${clip}`);
  const cd = dur(clip); if (Math.abs(cd - tl.D) > 0.15) throw new Error(`${s.id}: clip ${cd}s vs timeline ${tl.D}s (re-capture it)`);
  segs.push({ id: s.id, clip, tl, off, D: cd }); off += cd;
}
const total = off;
const caps = [], auds = [];
for (const g of segs) for (const x of g.tl.sentences) { caps.push({ text: x.cap, a: g.off + x.start - 0.05, b: g.off + x.start + x.dur + 0.2 }); auds.push({ wav: x.wav, at: g.off + x.start }); }
fs.writeFileSync(path.join(work, "captions.json"), JSON.stringify(caps));
execFileSync(process.env.PYTHON || "/usr/bin/python3", [path.join(HERE, "make_captions.py"), path.join(work, "captions.json"), path.join(work, "caps")], { stdio: "inherit" });
// SRT + teleprompter alongside
const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = (t % 60).toFixed(3).replace(".", ","); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.padStart(6, "0")}`; };
const outName = EL.out || "demo.mp4"; const outPath = path.join(V, outName);
fs.writeFileSync(outPath.replace(/\.mp4$/, ".srt"), caps.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join("\n"));
fs.writeFileSync(path.join(V, "teleprompter.md"), "# Teleprompter (read at a calm pace; each line starts at the time shown)\n\n" + segs.map((g) => `## ${g.id}  ${g.tl.title || ""}\n` + g.tl.sentences.map((x) => `[${Math.floor((g.off + x.start) / 60)}:${(((g.off + x.start) % 60) | 0).toString().padStart(2, "0")}] ${x.say}`).join("\n")).join("\n\n") + "\n");
// concat video (clips share one encode config)
fs.writeFileSync(path.join(work, "v.txt"), segs.map((g) => `file '${g.clip}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(work, "v.txt"), "-c", "copy", path.join(work, "v.mp4")]);
// final pass
const args = ["-y", "-v", "error", "-i", path.join(work, "v.mp4")];
caps.forEach((_, i) => args.push("-i", path.join(work, "caps", `cap_${String(i).padStart(3, "0")}.png`)));
auds.forEach((a) => args.push("-i", a.wav));
const nc = caps.length; const f = []; let last = "0:v";
caps.forEach((c, i) => { f.push(`[${last}][${i + 1}:v]overlay=enable='between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})':format=auto[v${i}]`); last = `v${i}`; });
f.push(`[${last}]fade=t=in:st=0:d=0.5,fade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7,format=yuv420p[vout]`);
auds.forEach((a, i) => f.push(`[${nc + 1 + i}:a]aresample=48000,adelay=${Math.round(a.at * 1000)}:all=1[a${i}]`));
f.push(`${auds.map((_, i) => `[a${i}]`).join("")}amix=inputs=${auds.length}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,pan=stereo|c0=c0|c1=c0,afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7,atrim=0:${total.toFixed(3)}[aout]`);
args.push("-filter_complex", f.join(";"), "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", total.toFixed(3), outPath);
execFileSync("ffmpeg", args, { stdio: "inherit" });
fs.writeFileSync(path.join(V, "render-manifest.json"), JSON.stringify({ out: outPath, total, segments: segs.map((g) => ({ id: g.id, off: +g.off.toFixed(2), D: +g.D.toFixed(2) })) }, null, 1));
console.log(`rendered ${outPath}  ${total.toFixed(2)}s  segments: ${segs.map((g) => g.id).join(" ")}`);
