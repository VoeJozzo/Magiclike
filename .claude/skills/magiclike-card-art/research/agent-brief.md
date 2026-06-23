# Art-eval arm agent brief (shared, identical for both arms)

This is the base instruction handed to **both** arms of an art-skill A/B round. It is
committed so it survives container resets and so the two arms are provably identical
except for one thing: which skill file they load. That single difference is the entire
treatment. Do not paraphrase this per-arm at launch — hand it verbatim, filling only the
`{...}` slots.

## Your task

You are generating pixel art for one Magiclike card via PixelLab's pixflux endpoint. Work
autonomously through the full art process and end by nominating your single best image.

You do not know whether you are the control or the treatment arm. Do not try to find out,
and do not look at the other arm's output. Do not state which arm you think you are.

## What you're given

- **Card:** `{card_id}`. Read the card's data from `{out_dir}/card_context.json` — a
  sanitized copy carrying name, types, cost, power/toughness, keywords, triggers, and
  effects. Work **only** from this file; do not open `reference/html-proto/cards/{card_id}/`
  or hunt for the card's data anywhere else. The card's placeholder `art` field (a single
  emoji) has been **deliberately stripped** — no art hint is provided on purpose, because
  deriving the depiction from the mechanic is the whole point. Depict what the card *does*,
  reasoned from its types / effects / triggers — never from a pre-supplied symbol.
- **Skill file to read and follow:** `{skill_file}` — read the whole thing and work by it.
- **Shared seed pool** (identical for both arms — your fair "deck of dice"): `{seeds}`.
- **Output directory:** `{out_dir}` — save everything here.
- **pixflux token:** `.claude/skills/magiclike-card-art/pixellab-token` (a `Bearer <token>` line).

## Budget & generation

- Up to **10 pixflux generations**, each drawing a seed from the shared pool. Reuse of a
  seed is allowed (that is how seed-locked iteration works) — but every generation must use
  a seed that is in the pool.
- Always generate at `image_size: {"width": 64, "height": 32}`, `no_background: false`.
- **Keep at most 2 pixflux calls in flight at once.** The API caps concurrent jobs at 5 and
  the other arm is generating in parallel; fire in small batches, never all 10 at once.
- Run the full loop your skill file describes (brainstorm → prompt → generate → look →
  reroll / seed-lock tweak / inpaint). Iterate freely within the budget.

## Saving (naming is load-bearing — follow exactly)

For every generation, save two files in `{out_dir}`:

- `{card_id}_gen_NN_seed<seed>.png` — the raw 64×32 image (`NN` = 01, 02, … in the order
  you generated; `<seed>` = the integer seed you sent).
- `{card_id}_gen_NN_seed<seed>_8x.png` — an 8× nearest-neighbor upscale (512×256), for
  reading the frame.

The 8× upscale uses Pillow: `from PIL import Image; Image.open(p).resize((512,256), Image.NEAREST).save(out)`.
If `import PIL` fails, run `pip install Pillow` first (the container may be fresh).

The card-id prefix makes each roll self-identifying after it leaves this directory. The
harness parses the seed and gen number out of the filename, so the format is not optional.

## Per-generation manifest (required)

Write `{out_dir}/manifest.jsonl` — **one JSON object per line, one line per generation**,
in generation order. Each line:

```json
{"gen": 1, "seed": 123456, "mode": "explore", "parent_gen": null, "prompt": "the full pixflux prompt text"}
```

- `mode`: one of `"explore"` (fresh attempt), `"tweak"` (seed-locked edit of an earlier
  gen's prompt), `"inpaint"` (surgical edit of an earlier image).
- `parent_gen`: for `tweak`/`inpaint`, the `gen` number it derives from; `null` for `explore`.
- `prompt`: the exact text sent to pixflux (for inpaint, the local mask prompt).

This manifest is the record of *what you did with the seeds* — never skip it, never
back-fill from memory. It is also how we recover the prompts (a past round lost them).

## Integrity (read this — a real failure happened here)

- **Every saved image must come from a pixflux call you just made for that
  generation.** Never copy, reuse, rename, or hand-edit another file into your
  output dir. Never read or pull from any other run's directory.
- **Sanity-check every result against the prompt you sent.** PixelLab has been
  observed to occasionally return a STALE image from an earlier request (a
  completely unrelated subject — e.g. a blue dragon when you asked for a fire
  shaman). If a result has nothing to do with your prompt, treat it as a bad
  return: discard that file and re-roll the generation (a fresh seed from the
  pool is fine). Do not keep an image whose content contradicts the prompt.
- The manifest must reflect what you actually sent to the API, every line.

## Nominate

When done, pick your single best image. Record it by writing `{out_dir}/BEST.txt`
containing exactly the chosen filename (e.g. `{card_id}_gen_07_seed123456.png`) on the first
line, then a short paragraph on why it's your pick. Do not delete the non-nominated rolls;
they stay for the blind contact sheet.

## Final report (required — pipeline accounting)

End your run by reporting these numbers explicitly so we can verify no art is lost
between the API and the contact sheet:

- **Total pixflux API generations you invoked** — count EVERY image-generation API call you
  made, including any you discarded as stale/off-prompt or that errored. This is the number
  of times you were billed for a generation.
- **Frames saved** — how many final PNGs are in `{out_dir}` (these become the contact sheet).
- **Discarded/failed** — the difference, with a one-line note on why (e.g. "1 stale return
  re-rolled"). If you discarded nothing, say "0 discarded; API calls == frames saved."
- Then your nominated filename and a one-line rationale.

The saved-frame count must equal your manifest line count. If your API-call count exceeds your
saved frames, the gap is exactly the art that did NOT travel up the pipeline — name it.
