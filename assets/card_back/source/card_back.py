#!/usr/bin/env python3
"""Generate the Magiclike card back: assets/card_back/card_back.png (80x112).

"Warp and weft": five warp threads in the house thread colors (ivory,
cerulean, wine-purple, crimson, emerald) run the length of a deep-wine
twill card, and a gold weft passes over and under them inside a gold
lozenge. The size matches the card frames (80x112), so it scales with
them at integer multiples (nearest-neighbor).

Pixel-identical port of backPix() in
docs/design/board-tapestry/mockup.template.html, where the design was
first drawn. Requires Pillow.

Usage:  python3 assets/card_back/source/card_back.py [--preview N]
        --preview N also writes a nearest-neighbor N-times preview to the
        scratch path given by --preview-out (not committed).
"""
import argparse
import math
import pathlib

from PIL import Image

W, H = 80, 112
OUT = pathlib.Path(__file__).resolve().parents[1] / "card_back.png"

# House thread colors (docs/wiki/world/art-language.md hue quintet).
TH = {"W": (233, 223, 196), "U": (61, 143, 214), "B": (160, 86, 160),
      "R": (214, 60, 52), "G": (58, 172, 98)}
GROUND = (40, 28, 50)
GOLD = (150, 112, 52)
GOLD_DARK = (96, 70, 34)


def js_round(v: float) -> int:
    """JavaScript Math.round: halves round up."""
    return math.floor(v + 0.5)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def add(c, v):
    return tuple(ch + v for ch in c)


def build() -> Image.Image:
    px = [[(0, 0, 0)] * W for _ in range(H)]

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            # Uint8ClampedArray semantics: clamp, round half to even.
            px[y][x] = tuple(max(0, min(255, round(ch))) for ch in c)

    cx, cy = 39.5, 55.5

    # Border, inner rule and twill ground.
    for y in range(H):
        for x in range(W):
            b = min(x, y, W - 1 - x, H - 1 - y)
            if b < 2:
                col = (0, 0, 0)
            elif b == 2:
                col = GOLD_DARK
            elif b == 6:
                col = (64, 46, 30)
            else:
                col = (40, 28, 50) if ((x - y) & 3) < 2 else (33, 23, 42)
                if ((x + y) & 7) == 0 and b > 6:
                    col = add(col, 4)
            put(x, y, col)

    # Five warp threads, bright inside the lozenge and faint outside it.
    warp_x = [32, 36, 40, 44, 48]

    def in_loz(x, y):
        return abs(x - cx) / 22 + abs(y - cy) / 34 <= 1

    for y in range(8, 104):
        for i, k in enumerate("WUBRG"):
            x = warp_x[i]
            col = mix(TH[k], GROUND, 0.15) if in_loz(x, y) else mix(TH[k], GROUND, 0.72)
            put(x, y, col)
            put(x + 1, y, (20, 14, 26))

    # Gold weft, over and under the warp, every fourth row.
    wy = cy - 12
    while wy <= cy + 12:
        row = js_round(wy)
        for x in range(26, 55):
            if not in_loz(x, row):
                continue
            wi = next((i for i, v in enumerate(warp_x) if v == x or v + 1 == x), -1)
            over = wi < 0 or ((wi + (row >> 2)) & 1)
            if over:
                put(x, row, add(GOLD, 40))
                put(x, row + 1, (26, 18, 30))
        wy += 4

    # Lozenge outline with a one-pixel drop shadow.
    loz = []
    for t in range(35):
        dx = js_round(22 * (1 - t / 34))
        ox, oy = js_round(cx), js_round(cy)
        loz += [(ox + dx, oy - t), (ox - dx, oy - t), (ox + dx, oy + t), (ox - dx, oy + t)]
    for x, y in loz:
        put(x + 1, y + 1, (18, 12, 22))
    for x, y in loz:
        put(x, y, GOLD)

    img = Image.new("RGB", (W, H))
    img.putdata([c for row in px for c in row])
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", type=int, default=0)
    ap.add_argument("--preview-out", type=pathlib.Path)
    args = ap.parse_args()
    img = build()
    img.save(OUT)
    print(f"wrote {OUT} ({W}x{H})")
    if args.preview and args.preview_out:
        img.resize((W * args.preview, H * args.preview), Image.NEAREST).save(args.preview_out)
        print(f"wrote {args.preview_out} ({W * args.preview}x{H * args.preview})")


if __name__ == "__main__":
    main()
