// Edit-list driven render: concat clips (optional slow push-in per segment), burn captions (PIL PNGs), mix per-sentence voiceover over a continuous room-tone bed, two-pass loudnorm, H.264 1080p MP4.
// Usage: node scripts/video/render.mjs [edit-list.json]     env: V=<video dir>
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { V, dur } from "./timeline.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EL = JSON.parse(fs.readFileSync(process.argv[2] || path.join(HERE, "edit-list.json"), "utf8"));
const TL = JSON.parse(fs.readFileSync(path.join(V, "timeline.json"), "utf8"));
const AU = { voiceLufs: -14, truePeak: -1.5, bedLufs: -30, ...(EL.audio || {}) };
const work = path.join(V, "render"); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const ff = (a, o = {}) => execFileSync("ffmpeg", ["-y", "-v", "error", ...a], o);

// Slow push-in: keyframes [t, zoom, cx, cy] (clip pixels, smoothstep between), applied to the clip before captions so captions stay sharp and fixed.
function pushIn(src, keys, out) {
  const ex = (f) => { let e = String(keys[keys.length - 1][f]); for (let i = keys.length - 2; i >= 0; i--) { const t0 = keys[i][0], t1 = keys[i + 1][0], a = keys[i][f], b = keys[i + 1][f], u = `((t-${t0})/${t1 - t0})`; e = `if(lt(t,${t1}),${a}+(${b}-${a})*${u}*${u}*(3-2*${u}),${e})`; } return `if(lt(t,${keys[0][0]}),${keys[0][f]},${e})`; };
  const vf = `scale=w='trunc(1920*(${ex(1)})/2)*2':h='trunc(1080*(${ex(1)})/2)*2':eval=frame:flags=bicubic,crop=1920:1080:x='min(max((${ex(2)})*in_w/1920-960,0),in_w-out_w)':y='min(max((${ex(3)})*in_h/1080-540,0),in_h-out_h)',setsar=1,fps=30,format=yuv420p`;
  ff(["-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "15", "-preset", "medium", "-r", "30", out]);
  return out;
}
// loudnorm measurement pass: the JSON ffmpeg prints on stderr
function loudnormJson(file, t) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=I=${t.I}:TP=${t.TP}:LRA=${t.LRA}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  return r.stderr;
}

const segs = []; let off = 0;
for (const s of EL.segments.filter((x) => x.enabled)) {
  const tl = s.timelineFile ? JSON.parse(fs.readFileSync(path.join(V, s.timelineFile), "utf8")) : TL[s.id];
  let clip = path.join(V, s.clip || `clips/${s.id}.mp4`);
  if (!fs.existsSync(clip)) throw new Error(`missing clip ${clip}`);
  const cd0 = dur(clip); if (Math.abs(cd0 - tl.D) > 0.15) throw new Error(`${s.id}: clip ${cd0}s vs timeline ${tl.D}s (re-capture it)`);
  if (s.motion) clip = pushIn(clip, s.motion, path.join(work, `${s.id}.motion.mp4`));
  segs.push({ id: s.id, clip, tl, off, D: dur(clip) }); off += dur(clip);
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

// ---- audio: voiceover alone -> two-pass loudnorm to the voice target; continuous room-tone bed at its own LUFS; sum; true-peak limit ----
{
  const f = [];
  const args = []; auds.forEach((x) => args.push("-i", x.wav));
  auds.forEach((x, i) => f.push(`[${i}:a]aresample=48000,adelay=${Math.round(x.at * 1000)}:all=1[a${i}]`));
  f.push(`${auds.map((_, i) => `[a${i}]`).join("")}amix=inputs=${auds.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},pan=stereo|c0=c0|c1=c0[o]`);
  ff([...args, "-filter_complex", f.join(";"), "-map", "[o]", "-c:a", "pcm_f32le", path.join(work, "vo_raw.wav")]);
  const tgt = { I: AU.voiceLufs, TP: AU.truePeak - 0.5, LRA: 9 };
  const j = JSON.parse(loudnormJson(path.join(work, "vo_raw.wav"), tgt).match(/\{[\s\S]*\}/)[0]);
  ff(["-i", path.join(work, "vo_raw.wav"), "-af", `loudnorm=I=${tgt.I}:TP=${tgt.TP}:LRA=${tgt.LRA}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, "-c:a", "pcm_f32le", path.join(work, "vo.wav")]);
  // bed: pink noise, band-limited like a quiet room, brought to AU.bedLufs
  ff(["-f", "lavfi", "-i", `anoisesrc=color=pink:sample_rate=48000:amplitude=0.5:seed=7:duration=${total.toFixed(3)}`, "-af", "highpass=f=70,lowpass=f=4200,pan=stereo|c0=c0|c1=c0", "-c:a", "pcm_f32le", path.join(work, "bed_raw.wav")]);
  const jb = JSON.parse(loudnormJson(path.join(work, "bed_raw.wav"), { I: AU.bedLufs, TP: -9, LRA: 11 }).match(/\{[\s\S]*\}/)[0]);
  ff(["-i", path.join(work, "bed_raw.wav"), "-af", `volume=${(AU.bedLufs - parseFloat(jb.input_i)).toFixed(2)}dB`, "-c:a", "pcm_f32le", path.join(work, "bed.wav")]);
  ff(["-i", path.join(work, "vo.wav"), "-i", path.join(work, "bed.wav"), "-filter_complex",
    `[0:a][1:a]amix=inputs=2:normalize=0:duration=first,alimiter=limit=${Math.pow(10, (AU.truePeak - 0.6) / 20).toFixed(4)}:level=disabled:attack=2:release=50,afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7,atrim=0:${total.toFixed(3)}[o]`, "-map", "[o]", "-c:a", "pcm_s24le", path.join(work, "audio.wav")]);
}

// ---- video: concat, burn captions, mux ----
fs.writeFileSync(path.join(work, "v.txt"), segs.map((g) => `file '${g.clip}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", path.join(work, "v.txt"), "-c", "copy", path.join(work, "v.mp4")]);
const args = ["-i", path.join(work, "v.mp4")];
caps.forEach((_, i) => args.push("-i", path.join(work, "caps", `cap_${String(i).padStart(3, "0")}.png`)));
args.push("-i", path.join(work, "audio.wav"));
// opening lockup: the real NVIDIA and Nebius logos over a dimmed first frame (fades in at 0, out by LK.until); narration timing untouched
const LK = EL.lockup || null; const f = []; let last = "0:v";
if (LK) {
  execFileSync("/usr/bin/python3", [path.join(HERE, "make_lockup.py"), path.join(work, "lockup.png")]);
  args.push("-loop", "1", "-t", String(LK.until + 1), "-i", path.join(work, "lockup.png"));
  f.push(`[${caps.length + 2}:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=${(LK.until - 0.5).toFixed(2)}:d=0.5:alpha=1[lk]`, `[0:v][lk]overlay=enable='lt(t,${LK.until})':format=auto[vl]`); last = "vl";
}
caps.forEach((c, i) => { f.push(`[${last}][${i + 1}:v]overlay=enable='between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})':format=auto[v${i}]`); last = `v${i}`; });
f.push(`[${last}]fade=t=in:st=0:d=0.5,fade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7,format=yuv420p[vout]`);
args.push("-filter_complex", f.join(";"), "-map", "[vout]", "-map", `${caps.length + 1}:a`, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", total.toFixed(3), outPath);
ff(args, { stdio: "inherit" });
fs.writeFileSync(path.join(V, "render-manifest.json"), JSON.stringify({ out: outPath, total, audio: AU, segments: segs.map((g) => ({ id: g.id, off: +g.off.toFixed(2), D: +g.D.toFixed(2) })) }, null, 1));
console.log(`rendered ${outPath}  ${total.toFixed(2)}s  segments: ${segs.map((g) => g.id).join(" ")}`);
