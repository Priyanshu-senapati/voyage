"""Builds docs/demo-goa-christmas.gif (shown at the top of the repo README) from the frames that
teaser/capture.mjs wrote.

Run from anywhere:  python deck/teaser/make_gif.py   (needs Pillow)
Shrinks the file to 3 MB or less by cutting colours, then blend frames.
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES_DIR = os.path.join(HERE, "..", "renders", "teaser")
OUT = os.path.join(HERE, "..", "..", "docs", "demo-goa-christmas.gif")
MAX_BYTES = 3 * 1024 * 1024

W, H = 960, 540
VIEW_W = 1280  # CSS pixels of the capture viewport: frames.json cursors are in these
INK = (0x12, 0x14, 0x1C)
BLUE = (0x2A, 0x78, 0xD6)
BAR_H = 54
FONT_PATH = r"C:\Windows\Fonts\calibrib.ttf"
BLEND_MS = 80
SS = 4  # supersampling for the cursor, so its edge is smooth


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()  # shortcut: no Calibri (not Windows), so the caption is smaller and plainer


def cursor_layer(cx, cy, d=22):
    """Soft cursor: a semi-transparent white disc with a blue ring, as a small RGBA tile."""
    n = (d + 8) * SS
    tile = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    g = ImageDraw.Draw(tile)
    c, r = n // 2, d * SS // 2
    g.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, 110), outline=BLUE + (255,), width=3 * SS)
    tile = tile.resize((n // SS, n // SS), Image.LANCZOS)
    return tile, (int(cx - n // SS // 2), int(cy - n // SS // 2))


def compose(frame, font):
    im = Image.open(os.path.join(FRAMES_DIR, frame["file"])).convert("RGB").resize((W, H), Image.LANCZOS).convert("RGBA")
    if frame["cursor"]:
        k = W / VIEW_W
        tile, pos = cursor_layer(frame["cursor"][0] * k, frame["cursor"][1] * k)
        im.alpha_composite(tile, pos)
    bar = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(bar)
    g.rectangle([0, H - BAR_H, W, H], fill=INK + (220,))
    mid = H - BAR_H // 2
    g.ellipse([22, mid - 6, 34, mid + 6], fill=BLUE + (255,))
    g.text((46, mid), frame["caption"], font=font, fill=(255, 255, 255, 255), anchor="lm")
    im.alpha_composite(bar)
    return im.convert("RGB")


def build(keys, colors, blends):
    """Returns (frames, durations_ms) for the loop: each key frame held, then a crossfade into the next one."""
    frames, durations = [], []
    for i, (im, hold) in enumerate(keys):
        frames.append(im)
        durations.append(hold)
        nxt = keys[(i + 1) % len(keys)][0]  # the last one fades back into the first, so the loop doesn't jump
        for b in range(1, blends + 1):
            frames.append(Image.blend(im, nxt, b / (blends + 1)))
            durations.append(BLEND_MS)
    # one adaptive palette from a montage of the key frames, so colours don't flicker between frames
    montage = Image.new("RGB", (W * len(keys), H))
    for i, (im, _) in enumerate(keys):
        montage.paste(im, (i * W, 0))
    pal = montage.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    return [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames], durations


def main():
    with open(os.path.join(FRAMES_DIR, "frames.json"), encoding="utf8") as fh:
        spec = json.load(fh)
    font = load_font(26)
    keys = [(compose(f, font), f["hold_ms"]) for f in spec]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    for colors, blends in [(128, 3), (96, 3), (64, 3), (64, 2)]:
        frames, durations = build(keys, colors, blends)
        frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
        size = os.path.getsize(OUT)
        print(f"{colors} colours, {blends} blend frames: {size / 1e6:.2f} MB")
        if size <= MAX_BYTES:
            break
    else:
        print("WARNING: still over 3 MB")
    print(f"wrote {OUT}: {size / 1e6:.2f} MB, {len(frames)} frames, {sum(durations) / 1000:.1f} s")


main()
