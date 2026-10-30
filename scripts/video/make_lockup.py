#!/usr/bin/env python3
"""Opening lockup PNG (1920x1080 RGBA): dark scrim, "BUILT WITH", the real NVIDIA logo + Nemotron, "on" the real Nebius logo + Token Factory.
Logos are rendered from the unmodified SVGs in assets/ with rsvg-convert. Usage: make_lockup.py out.png"""
import subprocess, sys, os, io
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); W, H = 1920, 1080
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
def logo(name, h):
    png = subprocess.run(["rsvg-convert", "-h", str(h * 2), os.path.join(HERE, "assets", name)], check=True, capture_output=True).stdout
    im = Image.open(io.BytesIO(png)).convert("RGBA"); return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
nv, nb = logo("nvidia-logo-white.svg", 104), logo("nebius-logo-lime.svg", 62)
f_big, f_mid, f_small = ImageFont.truetype(FONT, 84), ImageFont.truetype(FONT, 56), ImageFont.truetype(FONT, 30)
im = Image.new("RGBA", (W, H), (4, 7, 14, 150)); d = ImageDraw.Draw(im)
gap = 36
w1 = nv.width + gap + int(d.textlength("Nemotron", font=f_big)); w2 = int(d.textlength("on", font=f_mid)) + gap + nb.width + gap + int(d.textlength("Token Factory", font=f_mid))
pw, ph = max(w1, w2) + 220, 420; x0, y0 = (W - pw) // 2, 330
panel = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(panel).rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=28, fill=(8, 12, 22, 238), outline=(60, 78, 110, 255), width=2)
im = Image.alpha_composite(im, panel); d = ImageDraw.Draw(im)
lab = "BUILT WITH"; sp = 8; lw = sum(d.textlength(c, font=f_small) + sp for c in lab) - sp; x = (W - lw) / 2
for c in lab: d.text((x, y0 + 46), c, font=f_small, fill=(159, 176, 204, 255)); x += d.textlength(c, font=f_small) + sp
x = (W - w1) // 2; ytop = y0 + 110
im.alpha_composite(nv, (x, ytop))
d.text((x + nv.width + gap, ytop + nv.height // 2), "Nemotron", font=f_big, fill=(255, 255, 255, 255), anchor="lm")
x = (W - w2) // 2; y2 = ytop + nv.height + 62
d.text((x, y2 + nb.height // 2), "on", font=f_mid, fill=(159, 176, 204, 255), anchor="lm"); x += int(d.textlength("on", font=f_mid)) + gap
im.alpha_composite(nb, (x, y2)); x += nb.width + gap
d.text((x, y2 + nb.height // 2), "Token Factory", font=f_mid, fill=(255, 255, 255, 255), anchor="lm")
im.save(sys.argv[1])
