# Pixel-chrome UI reskin — status

Branch: `claude/pixel-chrome-tiles` (off `dev`). Turns the design-review "pixel
tactical-wargame" look into real, grid-pure assets and reskins the html-proto UI
to consume them. Everything below is committed on this branch.

## The pipeline (proven end to end)

1. **Bake** — `reference/html-proto/tools/bake/bake_ui_tiles.py` computes each UI
   chrome tile pixel-exact from the design's CSS spec (no AA, no fractional
   scaling). Source of truth: edit + re-run, don't hand-edit the PNGs.
2. **Emit** — 18 tiles in `reference/html-proto/assets/ui/` (button, woodbar
   9-slice source, WUBRG gems + spent, node base/boss, progress/slider/toggle/
   segmented).
3. **Lint** — `tools/pixel-lint.js` (palette-closure + run-divisibility). Verified
   clean; a deliberate fractional stretch is caught. It's the enforcement backstop.
4. **Consume** — the browser eats the tiles via `border-image` (9-slice chrome)
   and `background-image` (fixed tiles); Godot will use the same PNGs as
   `StyleBoxTexture`. Same source, both engines.

## Screens

| Screen | State | Notes |
|---|---|---|
| **Map** | ✅ reskinned + polished, verified in-engine | woodbar dossier + frame, parchment canvas, square node tiles, gem chips, heraldic edges (red travelled / green open / brown-dashed future), pxbtn Continue. Kept the flex-row layout (edges compute from geometry). 2x integer sizing. |
| **Draft** | ✅ reskinned, verified in-engine | Chrome only (dossier header, colour-pip HUD, carved box, footer tray). The pack renders real card frames (`makeCardEl`) — correctly left as content. |
| **Settings** | ⛔ blocked | Needs a **pixel dropdown** control from the design agent — see [settings-ui-gap.md](settings-ui-gap.md). |
| **Rewards** | ⬜ not started | Most complex meta-screen: 7 reward kinds (`sticker/twoStickers/transform/clone/ripUp/threeStickersBlind/splice`) each a different `.rwd` row; `.klabel` tabs; `.rwd-pair` splice tiles; `showCardPickModal` for boons/land offer. Reuses the kit but needs per-kind layout work. |
| **Board** | ⬜ not started | The in-game play screen (dossiers, battlefield, front line, hand). Biggest surface; the card frame stays as-is. Deferred deliberately — wanted human review before touching the core play screen. |

## Key decisions / gotchas (don't relearn these)

1. **No CSS `zoom` on screens with JS-drawn geometry.** The map edges are computed
   from `getBoundingClientRect`; `zoom` desyncs that from the SVG coordinate space
   and flings edges off-canvas. Upscale via explicit integer sizes instead.
2. **Node icons are placeholder text** (C/E/B); real pixel-art icons come from the
   **pixellab** pipeline, not this workflow. The design's SVG icons were rejected.
   Also needs a pixel **boss** icon (currently emoji).
3. **Card frames are content, not chrome** — never restyle `makeCardEl`.
4. **Layer model:** chrome = baked tiles; text = fonts (Pixelify pending);
   state-glows = runtime CSS light. Only chrome is baked.

## How to verify locally

    cd reference/html-proto && python -m http.server 8877 --bind 127.0.0.1
    # open http://127.0.0.1:8877/magiclike_engine.html
    # Map:   inject RUN.getMapState + CONTROLLER.selectMapNode(id)
    # Draft: New Run -> pick a boon -> draft screen
