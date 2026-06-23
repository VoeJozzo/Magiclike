# Art-eval blind review applet

> **This is the frozen experiment instance** (carries the per-card `DESC`/`ORDER`
> from the C4–C6 rounds). The **canonical, generalized copy** lives at
> `.claude/skills/magiclike-card-art/review-applet/` — make geometry/contract
> changes there. The cell geometry here (`SCALE 6 / COLS 5 / CW 384 / CH 192`)
> must stay in lockstep with `harness.build_sheet` and the skill copy.

A zero-dependency, server-free reviewer for the A/B art contact sheets. Open
`index.html` by double-clicking it (works over `file://` — no build server, no
fetch, no canvas). One card per page; each frame is cropped live out of the
already-rendered blind contact sheet via CSS `background-position`, so **no
per-arm file paths exist** — the blind is preserved for reviewer and assistant
alike. `manifest.js` carries only `label → crop-box`, never which arm a label is.

## Use
1. Pull the branch (the applet references the sheet PNGs at
   `../../docs/art-eval-sheets/*.png`, which live in the repo).
2. Open `research/review/index.html`.
3. For each card: pick **① better / Tie / ② better**, click a tile to mark the
   **keeper**, optionally add a note. Keys: `←`/`→` navigate, `1`/`2`/`t` set the
   verdict, click a tile = keeper. Progress + per-card jump dots are at the
   bottom; verdicts auto-save to `localStorage`.
4. Hit **Export verdicts** → copy the text block (or download the JSON) and paste
   it back to the assistant. Decode + keeper placement happen only after that.

## Regenerate
After a new batch (or to include older runs):

```
python3 research/review/build_review.py c4          # scoped to the current 20-card batch
python3 research/review/build_review.py c4 --all     # include all c4 runs
```

`manifest.js` is generated but committed so the app opens without running Python.
