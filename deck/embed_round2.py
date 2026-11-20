#!/usr/bin/env python3
"""Post-process voyance_round2.pptx: embed the fonts (so it renders anywhere) and
add PowerPoint Morph transitions (the "V" logo + titles glide between slides).

Run after the build:   node build_round2.js && python embed_round2.py
Reads/writes deck/voyance_round2.pptx in place. Pure stdlib.
"""
import zipfile, shutil, os, re, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DECK = os.path.join(HERE, "voyance_round2.pptx")
FONTS = os.path.join(HERE, "assets", "round2", "fonts")
W = tempfile.mkdtemp(prefix="voyance_deck_")

with zipfile.ZipFile(DECK) as z:
    z.extractall(W)

# ---------- 1. FONT EMBEDDING (Space Grotesk + Plus Jakarta Sans, Regular+Bold) ----------
os.makedirs(f"{W}/ppt/fonts", exist_ok=True)
faces = [("font1.fntdata", "SpaceGrotesk-500.ttf"), ("font2.fntdata", "SpaceGrotesk-700.ttf"),
         ("font3.fntdata", "Jakarta-400.ttf"),      ("font4.fntdata", "Jakarta-700.ttf")]
for dst, src in faces:
    shutil.copy(os.path.join(FONTS, src), f"{W}/ppt/fonts/{dst}")

ct = f"{W}/[Content_Types].xml"; s = open(ct, encoding="utf-8").read()
if "fntdata" not in s:
    s = s.replace("</Types>", '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>')
open(ct, "w", encoding="utf-8").write(s)

rp = f"{W}/ppt/_rels/presentation.xml.rels"; s = open(rp, encoding="utf-8").read()
rels = "".join(f'<Relationship Id="rIdFont{i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/{faces[i][0]}"/>' for i in range(4))
s = s.replace("</Relationships>", rels + "</Relationships>")
open(rp, "w", encoding="utf-8").write(s)

pp = f"{W}/ppt/presentation.xml"; s = open(pp, encoding="utf-8").read()
s = re.sub(r"<p:presentation ", '<p:presentation embedTrueTypeFonts="1" ', s, count=1)
efl = ('<p:embeddedFontLst>'
       '<p:embeddedFont><p:font typeface="Space Grotesk"/><p:regular r:id="rIdFont1"/><p:bold r:id="rIdFont2"/></p:embeddedFont>'
       '<p:embeddedFont><p:font typeface="Plus Jakarta Sans"/><p:regular r:id="rIdFont3"/><p:bold r:id="rIdFont4"/></p:embeddedFont>'
       '</p:embeddedFontLst>')
s = re.sub(r"(<p:notesSz[^/]*/>)", r"\1" + efl, s, count=1)
open(pp, "w", encoding="utf-8").write(s)

# ---------- 2. MORPH TRANSITIONS (morph on 2-4, fade on 1) ----------
def morph(dur=900):
    return ('<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">'
            f'<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="slow" p14:dur="{dur}">'
            '<p159:morph option="byObject"/></p:transition></mc:Choice>'
            '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>')
fade = '<p:transition spd="med"><p:fade/></p:transition>'
for n in (1, 2, 3, 4):
    f = f"{W}/ppt/slides/slide{n}.xml"; s = open(f, encoding="utf-8").read()
    trans = fade if n == 1 else morph()
    anchor = "</p:clrMapOvr>" if "</p:clrMapOvr>" in s else "</p:cSld>"
    s = s.replace(anchor, anchor + trans, 1)
    open(f, "w", encoding="utf-8").write(s)

# ---------- re-zip in place (skip directory entries) ----------
tmp_out = DECK + ".tmp"
with zipfile.ZipFile(tmp_out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(W):
        for fn in files:
            full = os.path.join(root, fn)
            z.write(full, os.path.relpath(full, W))
os.replace(tmp_out, DECK)
shutil.rmtree(W, ignore_errors=True)
print("embedded fonts + morph transitions ->", DECK)
