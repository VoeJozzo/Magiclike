# Mana symbol art

This folder is the home for the five colored-mana symbol PNGs:

- `W.png` — White
- `U.png` — Blue
- `B.png` — Black
- `R.png` — Red
- `G.png` — Green
- `C.png` — Colorless (optional; currently rendered as a gray pip with "C")

Until those files exist, the renderer falls back to a Unicode emoji
for each color (⚪🔵⚫🔴🟢). See `renderManaSymbols()` in
`reference/html-proto/js/render.js` for the fallback mapping and the
`.mana-W` / `.mana-U` / ... CSS rules in
`reference/html-proto/magiclike_engine.html` for the swap point.

## Drop-in instructions

When the PNGs land:

1. Save each file in this folder with the matching capital-letter name.
2. In `magiclike_engine.html`, uncomment / add the matching CSS lines
   (one per color) — the pattern is already documented inline next to
   the `.mana-W { ... }` block. Each override sets
   `background-image: url('assets/mana/X.png')` and
   `color: transparent` (which hides the emoji fallback so only the
   PNG shows).
3. No JS changes needed — the markup `<span class="mana mana-R">`
   stays the same; the CSS layer is what visually changes.

Recommended size: source art at 32x32 or 64x64 with transparent
background. Pip containers are sized in `em` so the art will scale
with the surrounding text — render at integer multiples (1x, 2x) of
a square source for crispness, and set `image-rendering: pixelated`
on the override if the art is intentionally low-res.

## Why emoji as fallback

The five circle emoji are coincidentally the right shape and color
for placeholder mana symbols, so we can ship a recognizable look
without any actual image files. Users without emoji-font support
will fall through to the colored-circle CSS underneath (still
readable, just less polished).
