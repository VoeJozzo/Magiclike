# DRAFT — director-led iteration loop (proposed magiclike-card-art skill section)

> Status: **draft for review, NOT merged into `.claude/skills/magiclike-card-art/SKILL.md`.**
> Grounded in the deepseam / righteous_cavalry / C5 sessions. Cut anything that reads as
> filler; every line below should be earned by something we observed.

## The loop is the spine — you are the instrument, not the artist

Card art here is made by a **human director iterating through you.** Your job is to
generate and to *present*, not to decide. Concretely:

1. The director names **one concrete change** ("give him a lance", "fossil *in* the rock",
   "wider, across-the-quarry shot").
2. **Fan out** a small budgeted batch chasing *only* that change — mix fresh-seed variance
   with seed-locked single-element tweaks.
3. **Surface the full spread**: a contact sheet of the 8× frames + **one factual line each**
   (what is literally on the canvas — not which is "best"). Never nominate a winner, never
   silently bench a roll. Taste is the director's.
4. The director picks or redirects. **Branch from the chosen frame.** Repeat.

Why framed this way (not as autonomous self-improvement): the agent-solo version of this
loop — generate, self-diagnose, self-pick — was A/B-tested twice (C4, C5) and came back
**null**. The human-in-the-loop version is what actually produces keepers. Do not try to be
autonomous in selection or direction here. (Workflow changes like this are validated by
use, not by blind A/B — the human is the variable.)

## Technique triage — what actually moved the needle

- **An element won't render →** lead with a **precise, iconic noun**, not more adjectives and
  not higher guidance. (A lance as *"a single straight horizontal line"*; *"Lichtenberg
  figure"* for forked lightning; a treefolk as *"a creature with a bark face and reaching
  wooden arms"*.) This beat adjective-piling and guidance-cranking every time we tried it.
- **Framing decides pose and scale →** the same subject reframed renders differently: a flat
  **side-profile charging left** produced a couched, level lance that the three-quarter view
  kept refusing; a **far-wall wide shot** trades fossil legibility for scale at 64×32.
- **A global change (palette, mood) →** seed-lock + a one-element prompt tweak. Caveat:
  **seed-lock is unstable at 64×32** — roughly half of single-element tweaks re-roll the very
  thing they targeted, so verify by eye, don't assume the composition held.
- **A local fix (stray shape, off-palette blob) →** inpaint — but see the inpaint rule below.
- **Adding a whole subject →** fresh regeneration; inpaint can only blend/extend, not add.
- **Cheap variance rerolls do real work.** Don't over-trust "smart" directed iteration over
  just resampling a good prompt on new seeds.

## Inpaint is not an autonomous step — always ask the director first

`/v2/inpaint` only does useful work when a **human with eyes** is involved in choosing and
masking the region. Fired blind by the agent it mostly returns noise. So: **never inpaint on
your own initiative.** Propose it to the director and do it together, or hand the frame back
for human masking. This is a technical-capacity limit, not a ceremony.

## Tooling

- Generate via `art-eval/gen_image.py` — in-memory call, byte-identical-dup defense, saves
  raw 64×32 + 8× upscale + a `manifest.jsonl` line carrying **seed + prompt** per frame. The
  manifest is what makes branching possible: every frame is re-seedable for the next branch.
- Inpaint via `art-eval/inpaint_image.py` — human-in-the-loop per the rule above.
- Useful PixelLab params from the OpenAPI spec (`https://api.pixellab.ai/v2/openapi.json`),
  not currently wired into the helper but worth reaching for:
  - `text_guidance_scale` (the real guidance field; plain `guidance_scale` 422s),
  - `init_image` + `init_image_strength` — a real **image-conditioned / img2img** path
    (feed a finished frame + low strength to nudge it; unexplored so far),
  - `outline` / `shading` / `detail` / `view` / `direction` style controls.
  - `negative_description` is **deprecated on pixflux** (don't rely on it) and real on
    inpaint — but we have **no clean evidence it produced better art**, so it is not a
    recommended technique.

## Saving — on a web / ephemeral container, PUSH or lose it

If you are running in a **web environment, the container resets unpredictably and discards
anything not pushed to the GitHub branch.** Committing is not enough — run `git push` after
every keeper or batch you need to survive. (On local hardware the normal commit flow is
fine; this rule is specifically for ephemeral remotes.)
