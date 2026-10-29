# Transcribe each voiceover wav with local whisper (small.en) and print the text next to the script line.
import json, glob, os, sys, whisper
V = os.environ.get("V", "/Volumes/PortableSSD/nvdia/apps/cape-video")
tl = json.load(open(os.path.join(V, "timeline.json")))
m = whisper.load_model("medium.en", download_root=os.path.join(V, "models"))
for b in tl.values():
    for s in b["sentences"]:
        t = m.transcribe(s["wav"], fp16=False)["text"].strip()
        print(f'{b["id"]}_{s["n"]:02d}\n  say : {s["say"]}\n  heard: {t}', flush=True)
