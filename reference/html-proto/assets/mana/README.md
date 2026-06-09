# Mana symbol art

The five colored-mana symbols ship as **SVGs** at the repo root in
`assets/mana/{W,U,B,R,G}.svg` (shared between the html-proto and the Godot
port — see the top-level `CLAUDE.md`). This folder is **not** their home;
the prototype references the shared files directly via relative paths
(`../../assets/mana/X.svg`).

## How the prototype consumes them

Two CSS hooks in `magiclike_engine.html`, both pointing at the shared SVGs:

1. **In-text pips** — `renderManaSymbols()` (`js/render.js`) emits
   `<span class="mana mana-R">…</span>`; the `.mana-W … .mana-G` rules set
   `background-image: url('../../assets/mana/X.svg')` and
   `color: transparent` so only the art shows.
2. **Card-frame cost pips** — the `.card-frame .frame-pip.col-X` rules use
   the same SVGs for the cost discs drawn on each card frame.

No JS change is involved in the swap — the markup is stable and the CSS
layer supplies the visual.

## What's still not SVG

- **Colorless `{C}`, tap `{T}`, variable `{X}`, and generic numbers** render
  as a letter/number inside a colored disc (`.mana-C` / `.mana-T` /
  `.mana-X` / `.mana-num`). There's no `C.svg` etc. yet. If/when those get
  symbol art, add `X.svg` to `assets/mana/` and give the matching class a
  `background-image` override following the WUBRG pattern.

## Design source

The WUBRG SVGs were derived from a React preview component,
`assets/mana/source/manaiconsv13.jsx` (reference only — not loaded at
runtime). Each symbol is a 40×40 viewBox: a colored disc with a radial
shine and double rim, plus a per-color glyph clipped to the disc. The
shipped `.svg` files were hand-tuned from that source (stroke weights and
foreground color differ), so the `.jsx` is the design intent, not a
byte-for-byte recipe. Authored by Claude; see the top-level `LICENSES.md`.
