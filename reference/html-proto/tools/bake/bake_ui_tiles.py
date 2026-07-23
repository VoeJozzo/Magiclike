#!/usr/bin/env python3
"""
bake_ui_tiles.py — the single source of truth for Magiclike's baked UI chrome.

The tile specs (transcribed from the design doctrine's campaign-ui.css /
screens.css) live INLINE below as constants; each tile is computed PIXEL-EXACT
(no browser anti-aliasing, no fractional scaling). The PNGs under assets/ui/
are OUTPUTS of this script; edit the spec here and re-run rather than
hand-editing the images.

Layer rule: this bakes CHROME only. Text (Pixelify), creature/icon ART, and state
GLOWS are separate runtime layers and are NOT produced here.

Run:  python bake_ui_tiles.py         (emits into ../../assets/ui/)
"""
import json
import os
from PIL import Image, ImageDraw

# ---- palette (campaign-ui.css tokens) ----
IRON = "#13170e"; WOOD_HI = "#6d7c4c"; BRASS = "#b4923e"; BRASS_HI = "#e6c878"
GOLD = "#ffd86a"; HERAL = "#a02619"; CDAD = "#cdad5b"


def rgb(h):
    h = h.lstrip("#"); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def fill(img, box, hexc, a=1.0):
    """Alpha-composite a solid rect over [x0,x1) x [y0,y1)."""
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle([x0, y0, x1 - 1, y1 - 1], fill=rgb(hexc) + (int(round(a * 255)),))
    return Image.alpha_composite(img, layer)


# =====================================================================
# 1) .pxbtn — button chrome (rest / hover / press + primary recolor)
# =====================================================================
BTN_W, BTN_H = 72, 22
BTN_BANDS = [(0, 6), (6, 12), (12, 18), (18, BTN_H)]
BTN_GREEN = ["#6a7d3f", "#5f7139", "#536532", "#48592c"]
BTN_RED = ["#c74b31", "#b4422a", "#a23823", "#8f2f1c"]
EDGE_GREEN, EDGE_RED = "#28331b", "#5a1c10"
BTN_STATES = {
    "rest":  dict(edge_h=3, black_off=5, top_hi_a=0.14, bot_sh_a=0.26, bot_sh_px=2),
    "hover": dict(edge_h=4, black_off=7, top_hi_a=0.18, bot_sh_a=0.26, bot_sh_px=2),
    "press": dict(edge_h=0, black_off=1, top_hi_a=0.10, bot_sh_a=0.30, bot_sh_px=1),
}
# Intended 9-slice for consumers (CSS border-image / Godot StyleBoxTexture),
# recorded here for the same reason WOODBAR_SLICE is. The button BODY is BTN_H
# tall; each state's image is BTN_H + black_off, and those extra rows are drop
# shadow that belongs BELOW the button. So the bottom inset is the 2px iron edge
# plus black_off — it is NOT symmetric with the other three sides. Slicing all
# four at 2 (an easy mistake) pulls the shadow up into the middle fill and the
# label ends up sitting on it.
BTN_SLICE = {name: dict(L=2, R=2, T=2, B=2 + p["black_off"])
             for name, p in BTN_STATES.items()}


def make_button(ramp, edge_hex, edge_h, black_off, top_hi_a, bot_sh_a, bot_sh_px):
    img = Image.new("RGBA", (BTN_W, BTN_H + black_off), (0, 0, 0, 0))
    for (y0, y1), col in zip(BTN_BANDS, ramp):
        img = fill(img, (0, y0, BTN_W, y1), col)
    img = fill(img, (0, 0, BTN_W, 2), IRON); img = fill(img, (0, BTN_H - 2, BTN_W, BTN_H), IRON)
    img = fill(img, (0, 0, 2, BTN_H), IRON); img = fill(img, (BTN_W - 2, 0, BTN_W, BTN_H), IRON)
    img = fill(img, (2, 2, BTN_W - 2, 4), "#ffffff", top_hi_a)
    img = fill(img, (2, BTN_H - 2 - bot_sh_px, BTN_W - 2, BTN_H - 2), "#000000", bot_sh_a)
    if black_off > 0:
        img = fill(img, (0, BTN_H, BTN_W, BTN_H + black_off), "#000000", 0.40)
    if edge_h > 0:
        img = fill(img, (0, BTN_H, BTN_W, BTN_H + edge_h), edge_hex)
    return img


# =====================================================================
# 2) .woodbar — carved panel, ONE 9-slice source (insets L/R/T/B = 6/6/20/8)
# =====================================================================
WB_W, WB_H, WB_BOX_H = 15, 31, 29
WB_RAMP = [((0, 6), "#44552f"), ((6, 12), "#3c4b2a"), ((12, 18), "#334225"), ((18, 999), "#2b3820")]
WOODBAR_SLICE = dict(L=6, R=6, T=20, B=8)


def _wb_band(y):
    for (a, b), c in WB_RAMP:
        if a <= y < b:
            return c
    return WB_RAMP[-1][1]


def make_woodbar_source():
    img = Image.new("RGBA", (WB_W, WB_H), (0, 0, 0, 0))
    for y in range(WB_BOX_H):
        img = fill(img, (0, y, WB_W, y + 1), _wb_band(y))
    for x in range(0, WB_W, 3):                 # 1px dark grain every 3px
        img = fill(img, (x, 0, x + 1, WB_BOX_H), "#000000", 0.09)
    img = fill(img, (0, 0, WB_W, 2), IRON); img = fill(img, (0, WB_BOX_H - 2, WB_W, WB_BOX_H), IRON)
    img = fill(img, (0, 0, 2, WB_BOX_H), IRON); img = fill(img, (WB_W - 2, 0, WB_W, WB_BOX_H), IRON)
    img = fill(img, (2, 2, WB_W - 2, 4), WOOD_HI); img = fill(img, (2, WB_BOX_H - 4, WB_W - 2, WB_BOX_H - 2), WOOD_HI)
    img = fill(img, (2, 2, 4, WB_BOX_H - 2), WOOD_HI); img = fill(img, (WB_W - 4, 2, WB_W - 2, WB_BOX_H - 2), WOOD_HI)
    img = fill(img, (4, 2, WB_W - 4, 3), "#ffffff", 0.10)
    img = fill(img, (4, WB_BOX_H - 3, WB_W - 4, WB_BOX_H - 2), "#000000", 0.30)
    img = fill(img, (0, WB_BOX_H, WB_W, WB_BOX_H + 2), "#000000", 0.40)
    for (bx, by) in [(2, 2), (WB_W - 5, 2), (2, WB_BOX_H - 5), (WB_W - 5, WB_BOX_H - 5)]:
        img = fill(img, (bx - 1, by - 1, bx + 4, by + 4), IRON)
        img = fill(img, (bx, by, bx + 3, by + 3), BRASS)
        img = fill(img, (bx, by, bx + 1, by + 1), BRASS_HI)
    return img


# =====================================================================
# 3) .gem — WUBRG pixel diamonds + spent socket
# =====================================================================
GEM_COLS = {"W": (231, 214, 156), "U": (63, 134, 196), "B": (88, 74, 96),
            "R": (197, 59, 41), "G": (76, 156, 70)}
GEM_SPENT = (42, 48, 32); GEM_R = 5; GEM_CANVAS = 13


def _put(img, x, y, rgba):
    if 0 <= x < img.width and 0 <= y < img.height:
        base = img.getpixel((x, y)); a = rgba[3] / 255.0
        out = tuple(int(round(rgba[i] * a + base[i] * (1 - a))) for i in range(3))
        img.putpixel((x, y), out + (255,))


def _diamond(img, cx, cy, r, fillc=None, border=None, alpha=255):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = abs(dx) + abs(dy)
            if d > r: continue
            if d == r and border is not None: _put(img, cx + dx, cy + dy, border + (alpha,))
            elif d < r and fillc is not None: _put(img, cx + dx, cy + dy, fillc + (alpha,))


def make_gem(color):
    img = Image.new("RGBA", (GEM_CANVAS, GEM_CANVAS), (0, 0, 0, 0)); gx = gy = 5
    _diamond(img, gx + 1, gy + 1, GEM_R, fillc=(0, 0, 0), border=(0, 0, 0), alpha=90)
    _diamond(img, gx, gy, GEM_R, fillc=color, border=rgb(IRON))
    for (sx, sy) in [(gx - 1, gy - 2), (gx - 2, gy - 1)]:
        _put(img, sx, sy, (255, 255, 255, 190))
    return img


# =====================================================================
# 4) .mnode — carved square node base + boss recolor
# =====================================================================
NODE_BANDS = [(0, 6, "#3c4c2e"), (6, 12, "#364529"), (12, 18, "#2f3d25"), (18, 26, "#293620")]
BOSS_BANDS = [(0, 8, "#3a1030"), (8, 16, "#320e2b"), (16, 24, "#2b0c27"), (24, 34, "#230a22")]


def make_node(size, bands, border_hex):
    img = Image.new("RGBA", (size, size + 2), (0, 0, 0, 0))
    for y0, y1, c in bands: img = fill(img, (0, y0, size, y1), c)
    img = fill(img, (0, 0, size, 2), border_hex); img = fill(img, (0, size - 2, size, size), border_hex)
    img = fill(img, (0, 0, 2, size), border_hex); img = fill(img, (size - 2, 0, size, size), border_hex)
    img = fill(img, (2, 2, size - 2, 3), WOOD_HI); img = fill(img, (2, size - 3, size - 2, size - 2), WOOD_HI)
    img = fill(img, (2, 2, 3, size - 2), WOOD_HI); img = fill(img, (size - 3, 2, size - 2, size - 2), WOOD_HI)
    img = fill(img, (0, size, size, size + 2), "#000000", 0.45)
    return img


# =====================================================================
# 5) settings/draft controls
# =====================================================================
def _brass_ramp(img, x0, x1, y0, y1):
    for y in range(y0, y1):
        k = y - y0; c = BRASS_HI if k < 2 else (CDAD if k < 4 else BRASS)
        img = fill(img, (x0, y, x1, y + 1), c)
    return img


def make_progress(w=90, h=8, pct=0.62):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img = fill(img, (0, 0, w, h), "#0e1209"); img = fill(img, (1, 1, w - 1, h - 1), "#2a3320")
    img = fill(img, (2, 2, w - 2, h - 2), "#0e1209")
    fw = int((w - 2) * pct); img = _brass_ramp(img, 1, 1 + fw, 1, h - 1)
    img = fill(img, (1 + fw, 1, 2 + fw, h - 1), IRON)
    img = fill(img, (0, 0, w, 1), IRON); img = fill(img, (0, h - 1, w, h), IRON)
    img = fill(img, (0, 0, 1, h), IRON); img = fill(img, (w - 1, 0, w, h), IRON)
    return img


def make_slider(w=74, h=11, pct=0.46):
    top = 2; img = Image.new("RGBA", (w, h + 4), (0, 0, 0, 0))
    img = fill(img, (0, top, w, top + h), "#161b0f")
    img = fill(img, (0, top, w, top + 2), IRON); img = fill(img, (0, top + h - 2, w, top + h), IRON)
    img = fill(img, (0, top, 2, top + h), IRON); img = fill(img, (w - 2, top, w, top + h), IRON)
    img = fill(img, (2, top + 2, w - 2, top + 3), "#2a3320")
    fx = int((w - 4) * pct); img = _brass_ramp(img, 2, 2 + fx, top + 2, top + h - 2)
    hx = max(0, min(w - 6, 2 + fx - 3))
    img = fill(img, (hx, 0, hx + 6, 13), "#e8dec3")
    img = fill(img, (hx, 0, hx + 6, 1), IRON); img = fill(img, (hx, 12, hx + 6, 13), IRON)
    img = fill(img, (hx, 0, hx + 1, 13), IRON); img = fill(img, (hx + 5, 0, hx + 6, 13), IRON)
    return img


def make_toggle(on):
    w, hh = 28, 15; img = Image.new("RGBA", (w, hh), (0, 0, 0, 0))
    img = fill(img, (0, 0, w, hh), "#3a5222" if on else "#161b0f")
    img = fill(img, (2, 2, w - 2, 3), "#2a3320")
    img = fill(img, (0, 0, w, 2), IRON); img = fill(img, (0, hh - 2, w, hh), IRON)
    img = fill(img, (0, 0, 2, hh), IRON); img = fill(img, (w - 2, 0, w, hh), IRON)
    kx = 14 if on else 3; kc = GOLD if on else "#6a7752"
    img = fill(img, (kx, 3, kx + 9, 12), kc); img = fill(img, (kx, 3, kx + 9, 4), IRON, 0.5)
    return img


def make_seg(widths=(30, 34, 30), active=1, h=17):
    W = sum(widths) + 2; img = Image.new("RGBA", (W, h), (0, 0, 0, 0)); x = 1
    for i, sw in enumerate(widths):
        img = fill(img, (x, 1, x + sw, h - 1), HERAL if i == active else "#212812"); x += sw
        if i < len(widths) - 1: img = fill(img, (x, 1, x + 1, h - 1), IRON); x += 1
    img = fill(img, (0, 0, W, 1), IRON); img = fill(img, (0, h - 1, W, h), IRON)
    img = fill(img, (0, 0, 1, h), IRON); img = fill(img, (W - 1, 0, W, h), IRON)
    return img


# =====================================================================
# emit
# =====================================================================
def main():
    out = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "ui"))
    os.makedirs(out, exist_ok=True)
    tiles = {}
    for name, p in BTN_STATES.items():
        tiles[f"pxbtn_{name}"] = make_button(BTN_GREEN, EDGE_GREEN, **p)
    tiles["pxbtn_primary_rest"] = make_button(BTN_RED, EDGE_RED, **BTN_STATES["rest"])
    tiles["woodbar_src"] = make_woodbar_source()
    for k, c in GEM_COLS.items():
        tiles[f"gem_{k}"] = make_gem(c)
    tiles["gem_spent"] = Image.new("RGBA", (GEM_CANVAS, GEM_CANVAS), (0, 0, 0, 0))
    _diamond(tiles["gem_spent"], 5, 5, GEM_R, fillc=GEM_SPENT, border=rgb(IRON))
    tiles["node_base"] = make_node(26, NODE_BANDS, IRON)
    tiles["node_boss"] = make_node(34, BOSS_BANDS, "#6a1550")
    tiles["ctrl_progress"] = make_progress()
    tiles["ctrl_slider"] = make_slider()
    tiles["ctrl_toggle_off"] = make_toggle(False)
    tiles["ctrl_toggle_on"] = make_toggle(True)
    tiles["ctrl_segmented"] = make_seg()
    for name, im in tiles.items():
        im.save(os.path.join(out, name + ".png"))

    # 9-slice manifest, emitted beside the art. CSS/Godot and tools/pixel-lint.js
    # read insets from here rather than hand-copying the constants above, so the
    # two can't drift apart. Only 9-sliced tiles appear here; gems/nodes/ctrl
    # tiles are drawn whole and are deliberately absent.
    slices = {"woodbar_src": WOODBAR_SLICE}
    for name, s in BTN_SLICE.items():
        slices[f"pxbtn_{name}"] = s
    slices["pxbtn_primary_rest"] = BTN_SLICE["rest"]   # recolour of rest, same geometry
    with open(os.path.join(out, "_slices.json"), "w", encoding="utf-8") as f:
        json.dump(slices, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"emitted {len(tiles)} tiles + _slices.json ({len(slices)} sliced) -> {out}")
    for name, im in sorted(tiles.items()):
        print(f"  {name:22} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
