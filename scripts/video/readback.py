#!/Users/kamal/.local/share/uv/tools/mlx-whisper/bin/python
"""Independent Whisper readback (mlx large-v3-turbo, no prompt, temperature 0): the same engine and settings an outside listener's transcript would use.
Usage: readback.py [--trap Cape,Nemotron,Tavily] [--min 0.6] a.wav b.wav ...
Prints one line per wav: text, and each trap word with its probability. Exit 1 when a trap word the wav's text asks for (see --ask NAME=text) is missing or below --min.
With --json prints [{wav,text,words}]."""
import argparse, json, re, sys
import mlx_whisper
ap = argparse.ArgumentParser(); ap.add_argument("wavs", nargs="+"); ap.add_argument("--trap", default="Cape,Nemotron,Tavily"); ap.add_argument("--min", type=float, default=0.6)
ap.add_argument("--require", default="", help="comma list of trap words that MUST appear in every wav")
ap.add_argument("--json", action="store_true")
a = ap.parse_args(); traps = [t.lower() for t in a.trap.split(",")]; req = [t.lower() for t in a.require.split(",") if t]
out = []; bad = 0
for w in a.wavs:
    r = mlx_whisper.transcribe(w, path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="en", temperature=0.0, condition_on_previous_text=False, word_timestamps=True, verbose=None)
    words = [x for s in r["segments"] for x in s["words"]]
    hit = {}
    for x in words:
        t = re.sub(r"[^a-z]", "", x["word"].lower())
        if t in traps: hit[t] = max(hit.get(t, 0), x["probability"])
    miss = [t for t in req if hit.get(t, 0) < a.min]
    bad += bool(miss)
    out.append({"wav": w, "text": r["text"].strip(), "traps": hit, "missing": miss})
    if not a.json: print(f'{"FAIL" if miss else "ok  "} {w.split("/")[-1]}: {r["text"].strip()}  traps={ {k: round(v, 2) for k, v in hit.items()} }' + (f"  MISSING/LOW={miss}" if miss else ""), flush=True)
if a.json: print(json.dumps(out))
sys.exit(1 if bad else 0)
