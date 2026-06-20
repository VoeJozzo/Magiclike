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
  **not currently wired into `gen_image.py`** (it rides every default) but worth reaching for:
  - **`text_guidance_scale`** — *"how closely to follow the text description."* `number`,
    **1.0–20.0, default 8.** (The real field; plain `guidance_scale` 422s.) Higher = tighter
    adherence, but it amplifies what the model already wants to do — when you're fighting it,
    fix the words, not the dial. Helper should expose this.
  - **`init_image` + `init_image_strength`** — a real whole-image **image-conditioned /
    img2img** path. `init_image` is a `Base64Image` (`{type:"base64", base64, format}`) you
    start from; `init_image_strength` is an `integer` **1–999, default 300** = strength of the
    initial image's influence (**high = stay close to the input / light nudge; low = let the
    prompt pull it further**). This is the missing "feed in the good art and nudge it" tool —
    keeps the whole composition (unlike blind text re-roll) with no mask/human step (unlike
    inpaint). **TESTED & works** (G2G4 strength sweep): the strength dial = preserve↔redraw —
    ~900 ≈ exact copy of the input; ~300 (default) reinterprets within the same composition
    and palette; ~150 redraws the subject on the init's compositional/palette scaffold (at
    150 it produced a *cleaner, more legible* fossil than the muddy source). This is the real
    "feed in the good art and nudge it" tool. ~17s/call when the API is healthy; wired into
    `gen_image.py` as spec `"init"` + `"init_strength"` (manifest-logged). **Hard constraint
    (from the API): `init_image` must be EXACTLY the output size (64×32) — pixflux 422s on a
    larger init ("must match image_size"); it will NOT downsample a hi-res reference for you.
    So you can't pixel-art-ify a detailed photo by feeding it in: it has to be crushed to
    64×32 first, and fine detail (e.g. a legible skeleton) dies in that reduction before
    conditioning even happens.**
  - `outline` / `shading` / `detail` / `view` / `direction` — style controls (unexplored).
  - `negative_description` is **deprecated on pixflux** (don't rely on it) and real on
    inpaint — but we have **no clean evidence it produced better art**, so it is not a
    recommended technique.

## Saving — on a web / ephemeral container, PUSH or lose it

If you are running in a **web environment, the container resets unpredictably and discards
anything not pushed to the GitHub branch.** Committing is not enough — run `git push` after
every keeper or batch you need to survive. (On local hardware the normal commit flow is
fine; this rule is specifically for ephemeral remotes.)
