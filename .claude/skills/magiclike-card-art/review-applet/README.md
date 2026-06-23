# Blind contact-sheet review applet

A zero-dependency, server-free reviewer for a spread of generated art. One card
per page; each frame is cropped live out of an already-rendered contact sheet via
CSS `background-position`, so **no per-source file paths exist** — the blind is
preserved for reviewer and assistant alike when reviewing an A/B test. Verdicts
auto-save to `localStorage` and export as JSON.

This was distilled from the C2–C6 art-skill A/B program (see `art-eval/`), where
the measured lesson was that **human-in-the-loop selection is the lever** — agent-
solo self-picking tested null. This tool is how you put the spread in front of the
director cleanly.

## Files

| file | role |
|---|---|
| `index.html` | the reviewer UI (general — consumes `window.REVIEW` + optional `window.SHEETDATA`). Keys: `←`/`→` navigate, `1`/`2`/`t` set verdict, click a tile = keeper. |
| `build_review.py` | emits `manifest.js` (`window.REVIEW`) for the **art-eval A/B harness layout**. |
| `bundle.py` | inlines manifest + every sheet (base64) into a single `review-bundle.html` you can open by tapping it on a phone. The portable form. |

`manifest.js` and `review-bundle.html` are generated per batch and gitignored.

## Use (A/B harness layout)

```
python3 build_review.py c6              # scoped to the c6 batch
python3 build_review.py c6 --all        # include all c6 runs
python3 build_review.py c6 --remaining  # only cards not yet judged
python3 bundle.py c6                    # -> review-bundle.html (self-contained, blind)
```

Open `review-bundle.html`. For each card: pick **① / Tie / ②**, click a tile to
mark the **keeper**, add a note. **Export verdicts** → paste the JSON back to the
assistant. (For A/B work, decode + keeper placement happen only after that, via
`art-eval/harness.py decode`.)

## Reusing for a non-A/B spread

`index.html` is fully general. If your batch isn't in the A/B harness shape, skip
`build_review.py` and emit `window.REVIEW` yourself in the documented shape (see
the contract in `build_review.py`'s header), then run `bundle.py`. The UI needs
only: a contact-sheet PNG per card and per-frame crop boxes (`label`, `x`, `y`).
