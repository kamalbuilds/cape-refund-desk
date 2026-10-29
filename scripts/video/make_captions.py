#!/usr/bin/env python3
"""Render burned-in caption PNGs (ffmpeg here has no drawtext/subtitles filter).
Usage: make_captions.py captions.json outdir   (captions.json: [{"text": "..."}...]) -> outdir/cap_000.png ..."""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
W, H = 1920, 1080
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
caps = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
font = ImageFont.truetype(FONT, 44)
def wrap(draw, text, maxw):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= maxw: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur); return lines
for i, c in enumerate(caps):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    lines = wrap(d, c["text"], 1560); lh = 58
    bw = int(max(d.textlength(l, font=font) for l in lines)) + 70; bh = lh * len(lines) + 34
    x0 = (W - bw) // 2; y1 = H - 46; y0 = y1 - bh
    box = Image.new("RGBA", (W, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(box)
    bd.rounded_rectangle([x0, y0, x0 + bw, y1], radius=16, fill=(8, 12, 22, 215)); im = Image.alpha_composite(im, box); d = ImageDraw.Draw(im)
    for j, l in enumerate(lines):
        tw = d.textlength(l, font=font); d.text(((W - tw) / 2, y0 + 17 + j * lh), l, font=font, fill=(255, 255, 255, 255))
    im.save(os.path.join(out, f"cap_{i:03d}.png"))
print(len(caps), "captions")
