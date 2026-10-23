"""Deterministic iOS icon using seed 333 of the shipping tartan engine."""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

root = Path(__file__).resolve().parents[1]
source = """import {wildLitter} from './app/src/engine/game.js';
import {PALETTE} from './app/src/engine/tartanism.js';
const genome=wildLitter({seed:333,size:1})[0];
console.log(JSON.stringify(genome.stripes.map(s=>({count:s.count,rgb:PALETTE[s.color]}))));"""
stripes = json.loads(subprocess.check_output(['node','--input-type=module','-e',source], cwd=root))
thread = []
for stripe in stripes:
    thread += [(stripe['rgb']['r'],stripe['rgb']['g'],stripe['rgb']['b'])] * stripe['count']
thread += list(reversed(thread))

size=1024
base=Image.new('RGB',(size,size))
pix=base.load()
for y in range(size):
    for x in range(size):
        # two intersecting thread sequences, alternating over/under in a 2/2 twill
        warp=thread[(x//8)%len(thread)]
        weft=thread[(y//8)%len(thread)]
        on_top=((x//8+y//8)%4)<2
        a,b=(warp,weft) if on_top else (weft,warp)
        pix[x,y]=tuple(round(.77*v+.23*w) for v,w in zip(a,b))

# Calm square provides the wordmark's legibility in home-screen sizes.
overlay=Image.new('RGBA',(size,size),(0,0,0,0))
d=ImageDraw.Draw(overlay)
d.rounded_rectangle((218,218,806,806),radius=142,fill=(13,15,23,220),outline=(245,244,235,100),width=6)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',510)
d.text((512,494),'T',anchor='mm',font=font,fill=(249,245,227,255),stroke_width=2,stroke_fill=(249,245,227,255))
base=Image.alpha_composite(base.convert('RGBA'),overlay).convert('RGB')
out=root/'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
base.save(out,optimize=True)
print(out)
