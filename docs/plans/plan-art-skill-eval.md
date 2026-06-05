# Plan: Evaluate & improve the `magiclike-card-art` skill

**Status (2026-06-05):** Plan drafted on branch `Art-Skill-Eval`. Not yet executed. Design decisions below are locked with the user; build order in §6 is the proposed path.

## 1. The question we're answering

Is the `magiclike-card-art` skill actually making our card art better, and can we *measure* an edit to the skill so improvements are evidence-based instead of vibes? The skill is a 355-line creative-discipline doc plus a prompt corpus and a pixflux/inpaint workflow. Today we have no way to tell whether a change to it helps, hurts, or does nothing.

### What we are NOT measuring

We can't improve pixflux itself, and absolute "is this art good" scoring is noisy and taste-dependent. So we deliberately **do not** build a rubric that scores shipped art on a 1–10 scale. The skill's only lever on output quality is *the prompt it writes*. We measure that lever directly.

## 2. Decisions locked with the user

| Fork | Decision |
|---|---|
| Eval target | **Output art quality** — measured *through* the prompt-writing step, the skill's actual locus of control. |
| Method | **Prompt-level pairwise A/B.** Same card, two prompt-writing approaches, generate both, judge which art is better. Pairwise > absolute scoring (more reliable for humans and LLM judges). |
| Prompt-writer | **Automated API call**, skill text as system prompt. Reproducible, scales, isolates the variable, and becomes a re-runnable harness for every future skill edit (the flywheel). |
| First experiment | **Skill-on vs skill-off baseline.** Does the skill beat a naive prompt at all? Anchors every later comparison. |
| Judge | **LLM vision judge, calibrated against the user's own pairwise calls** before being trusted at scale. |
| Spend | **Whatever it takes** — pixflux generations are in budget. |

## 3. The core insight (why prompt-level A/B is the right primitive)

1. **The prompt is the whole creative claim.** card→prompt is what the skill does; A/B-ing it measures the skill where the skill lives.
2. **Pairwise beats absolute.** "Which of these two is better?" is far more reliable than "rate 1–10," position-randomized to kill order bias.
3. **It becomes an improvement flywheel, not a one-shot report.** Because the prompt-writer is an API call seeded with the skill as its system prompt, *A/B-ing two prompt-writing instructions = A/B-ing two versions of the skill.* Edit `SKILL.md` → regenerate on held-out cards → pairwise-judge old-skill vs new-skill → keep the edit only if it wins.

## 4. The three traps and how we clear each

1. **The judge is the crux.** An LLM judging 64×32 pixel art has to (a) read tiny art — vision models are weak at this, so we 8×-upscale (nearest-neighbor) exactly as the skill already does, and (b) understand the card's mechanic to score mechanic-enactment. *Mitigation:* a **calibration set** — the user makes ~30–40 pairwise calls, we measure the LLM judge's agreement, and only run automated at scale where agreement clears a bar (target ≥80%). This is standard LLM-as-judge validation and directly answers "can we trust the robot's taste."
2. **Seed variance contaminates a single A-vs-B.** Same prompt + different seed = different image, so one generation per arm conflates prompt quality with dice. *Mitigation:* generate **k images per arm** (k=3–4) using the **same fixed seed set across both arms** (paired by seed) so the only difference is the prompt. Respect pixflux's 5-concurrent cap.
3. **Leakage.** The skill's few-shot examples must not be in the test set. *Mitigation:* the held-out set is the **138 cards that have `card.json` but no `art.png`** (verified 2026-06-05; 148 of 286 cards are arted). Genuinely unseen, and every experiment generates real candidate art for unarted cards as a side benefit.

## 5. Architecture

```
card.json
   │
   ├─► [prompt-writer: Claude API call]      Arm A: system prompt = skill text
   │        system prompt = arm's instructions  Arm B: system prompt = naive baseline
   │        user message  = card.json
   │        output        = pixflux description (only)
   │
   ├─► [pixflux ×k seeds]  64×32, no_background:false, fixed seed set, ≤5 concurrent
   │
   ├─► [8× nearest-neighbor upscale]  for judge + human eyes
   │
   └─► [judge: pairwise vision call]  A-set vs B-set, position-randomized,
            forced choice + reason against the rubric criteria
   │
   └─► [aggregate]  win-rate skill-on vs skill-off, sliced by criterion / color / type
```

**Rubric criteria the judge scores against** (derived from the skill's own principles, used as *comparison axes*, not absolute scores):
- Mechanic-enactment — does the art show the rule happening?
- Silhouette legibility at 64×32 — single readable shape?
- Color-identity match to mana cost.
- Scene-not-sprite — opaque, populated background vs subject floating on negative space.
- Overall preference (the tiebreaker / holistic call).

**Models** (confirm exact IDs + params via the `claude-api` skill at build time): prompt-writer = a capable text model (Sonnet 4.6 as cost/quality default, Opus 4.8 for fidelity); judge = a Claude model with vision. Keep model choice a config parameter so it doesn't get baked in.

**Card-data note:** card folders are snake_case (`storm_sage`), not the camelCase tplIds (`doomBlade`, `verdantCharm`) the skill doc still references — a stale-path finding to fix in the skill separately.

## 6. Build order

1. **Harness skeleton (no judging yet).** A script that: reads a card.json, calls the prompt-writer for both arms, fires pixflux ×k with a fixed seed set, saves + upscales all images into a run directory with a manifest (card, arm, seed, prompt, settings). *Smoke-test on 2–3 cards by eye to confirm the loop produces sane output before scaling.*
2. **Naive baseline arm.** Write the skill-off system prompt (minimal: "write an image-gen prompt for this fantasy card"). The skill-on arm loads `SKILL.md`.
3. **Calibration set.** Run the harness on ~15 cards (covers ~30–40 pairings), present the user pairwise comparisons, record their calls as gold labels.
4. **Judge + validation.** Implement the pairwise vision judge; measure agreement against the gold labels. Iterate the judge prompt until agreement clears the bar, or scope the judge to only the criteria where it agrees with the user.
5. **Run the baseline experiment.** Skill-on vs skill-off across a held-out sample (start ~20–30 cards spanning all five colors + creatures/instants/sorceries). Report win-rate overall and per criterion.
6. **Package as flywheel.** Config-drive the two arms so re-running on `skill-v1 vs skill-v2` is one command. Document how to run it in the skill folder or a `docs/` note.

## 7. What success looks like

- **Baseline experiment:** a defensible number — e.g. "skill-on wins X% of pairwise comparisons vs skill-off, strongest on mechanic-enactment and color-identity." If the skill *doesn't* beat naive, that's the most important finding of all.
- **The flywheel:** any future SKILL.md edit can be run through the harness and kept/reverted on evidence.
- **Side artifacts:** real candidate art for some of the 138 unarted cards, and a list of concrete skill-doc fixes surfaced along the way (e.g. the broken reproducibility logging — only 1 of ~60 corpus entries records a seed despite Phase 7 mandating it; stale camelCase paths).

## 8. Risks / open questions

- **Judge may never clear the agreement bar** on a subjective criterion (mechanic-enactment is the likeliest to fail). Fallback: keep the human in the loop for that axis, let the LLM handle the mechanical axes (silhouette, color, scene-not-sprite) where it's more reliable.
- **Prompt-writer ≠ Claude-in-session.** The automated writer may execute the skill slightly worse than I do live. That biases *against* the skill, so a win is conservative; but worth noting when reading results.
- **Sample size for significance.** Pairwise win-rates need enough cards × seeds to be meaningful. "Whatever it takes" budget helps; we'll report n alongside every rate.
- **Baseline contamination.** A truly skill-naive prompt is hard to author without leaking skill ideas. We'll keep the baseline genuinely minimal and document its exact text.

## 9. Cost

pixflux is ~3–5s synchronous per generation, 5 concurrent. A baseline run of 30 cards × 2 arms × 4 seeds = 240 generations. Plus prompt-writer + judge API calls (cheap relative to image gen). Budget is approved; we'll log actual usage from API responses.
