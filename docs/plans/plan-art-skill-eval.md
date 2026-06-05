# Plan: Evaluate & improve the `magiclike-card-art` skill

**Status (2026-06-05):** Plan drafted on branch `Art-Skill-Eval`. Not yet executed. Design decisions below are locked with the user; build order in §6 is the proposed path.

## 1. The question we're answering

Is the `magiclike-card-art` skill actually making our card art better, and can we *measure* an edit to the skill so improvements are evidence-based instead of vibes? The skill is a ~700-line creative-discipline doc plus a pixflux/inpaint workflow. Today we have no way to tell whether a change to it helps, hurts, or does nothing.

### What we are NOT measuring

We can't improve pixflux itself, and absolute "is this art good" scoring is noisy and taste-dependent. So we deliberately **do not** score shipped art on a 1–10 scale. We measure the skill's effect by **pairwise comparison of art produced with the skill vs without it.**

## 2. Decisions locked with the user

| Fork | Decision |
|---|---|
| Eval target | **Output art quality**, measured pairwise (skill-on art vs skill-off art for the same card). Pairwise > absolute scoring — more reliable for both human and LLM judges. |
| Execution unit | **Agents, not metered API calls.** The user is on a Claude **subscription**, so the Anthropic API (`messages.create`) is off the table — it bills what they don't use. Each arm is a **Claude Code (sub)agent** (Agent tool, or headless `claude -p`), which runs on the subscription. **PixelLab/pixflux is the only external paid call**, and it's in budget. |
| Agent scope | **Full end-to-end.** Each arm runs the skill's full loop — brainstorm → prompt → generate → look → reroll/tweak/inpaint — within an equal budget of **~10 image-gen calls, drawing seeds from a shared per-card seed array**, then nominates its single best image. The skill's iteration discipline (reroll-on-bad-dice, seed-locked tweaking, inpaint fixes) is in scope — it's a big part of the skill's value. |
| The A/B control | **Same agent harness on both arms; the only difference is whether `SKILL.md` is loaded.** The agent's own taste/judgment is therefore a held-constant variable, not a confound. |
| Fairness control | **Shared seed *pool* + equal budget.** Each card gets a fixed **array of ~10 seeds, identical for both arms** — both face the same "deck" of dice, so neither can draw luckier seeds. Each arm gets the same ~10-call budget drawing from it. Only *how well each arm spends its swings* differs. |
| First experiment | **Skill-on vs skill-off baseline.** Does the skill beat a naive agent at all? Anchors every later comparison. |
| Judging | **User is the gold judge** — every image surfaced every run. **Claude blind-pre-labels** each pair (with reasons) *before* the user looks; the pre-label vs user-call divergence is itself a finding and accumulates calibration data. |
| Scale | **~10 cards** for the first run, not the full 138-card pool. |
| Spend | **Whatever it takes** — pixflux generations are in budget. |

## 3. Why agents (and why this resolves the earlier tension)

1. **Subscription dictates it.** No metered API → the only way to drive Claude programmatically is the subscription-backed agent surface (Agent tool / `claude -p`). A bare SDK call isn't available to us even if we wanted it.
2. **It's also the *fairer* test.** Reducing the skill to a single card→prompt call under-represents it — the live skill brainstorms, generates, *looks at the result*, rerolls, and inpaints. A full end-to-end agent exercises that whole discipline. The skill's reroll/inpaint guidance is part of what we're measuring, which is correct.
3. **Clean A/B despite the autonomy.** Both arms are the *same* agent harness; only `SKILL.md` presence differs. So "the agent has good taste" helps both arms equally and cancels out — what's left is the skill's contribution.
4. **Still a flywheel.** Re-running on `skill-v1 vs skill-v2` is the same orchestration with a different skill file in arm A. Wrap it as a `claude -p` loop or a slash-command later.

### On seeds, determinism, and iteration

pixflux is **not** byte-for-byte deterministic at a fixed seed — same prompt + seed gives *near-identical* output (residual noise; judge sameness by eye, not pixel-diff). The skill is also genuinely **iterative** — its workflow is explore-at-random-seeds → lock the best → tweak one element (seed-locked refinement) → inpaint surgical fixes, with documented multi-reroll wins (Branching Bolt, Royal Assassin). Testing only an opening prompt would test maybe half the skill. To honor the iteration *and* keep the dice fair across arms, we pair seeds **at the pool level**:
- Each card gets a fixed **array of ~10 seeds**, identical for both arms. Both face the same deck — neither can draw luckier seeds.
- Each arm gets an **equal budget of ~10 image-gen calls**, every generation drawing a seed from that shared array (reuse allowed, so seed-locked tweaking works: same seed, changed prompt). Inpaint calls count against the budget.
- Within that, each arm runs the skill's full loop — explore across seeds, lock onto its best, refine, inpaint — then **nominates its single best** image (candidates retained as artifacts).
- *Open detail to settle at run time:* whether the budget is exactly 10 or "up to 10," and whether the same seed array is reused across all cards or drawn fresh per card (both arms always share it either way).

## 4. The traps and how we clear each

1. **Judge trust — but the human is primary, so it's not on the critical path at first.** A ~10-card run is ~20+ images; the user judges them directly. *Claude pre-labels blind, before the user sees them* — recorded with reasons. Comparing Claude's picks to the user's reveals where the robot's taste diverges (the useful signal) and builds a gold-labelled set. An automated LLM judge only matters when we scale past hand-judging; then we validate it against the accumulated labels (target ≥80% per-axis agreement) and scope it to the axes it passes on. LLM judging of 64×32 needs the 8× nearest-neighbor upscale the skill already uses.
2. **Variance.** pixflux noise + agent self-direction. *Mitigation:* shared seed *pool* per card (both arms draw the same deck) + equal ~10-call budget per arm + multiple cards; report n with every result.
3. **Leakage.** The skill's few-shot examples must not be in the test set. *Mitigation:* the held-out pool is the **138 cards that have `card.json` but no `art.png`** (verified 2026-06-05; 148 of 286 cards are arted). Genuinely unseen, and every run produces real candidate art for unarted cards as a side benefit. First run samples ~10 from this pool.

**Comparison axes** (from the skill's own principles; used as pairwise axes, not absolute scores): mechanic-enactment, silhouette legibility at 64×32, color-identity match to mana cost, scene-not-sprite, overall preference.

## 5. Architecture

```
For each of ~10 held-out cards:

  card.json  +  shared seed array [s1..s10]
     │
     ├─► ARM A: end-to-end agent  [SKILL.md loaded]
     │     full skill loop, ~10-call budget, seeds from the shared array:
     │     explore → lock → tweak/inpaint → nominate best → A_best.png (+candidates)
     │
     ├─► ARM B: end-to-end agent  [no skill, naive instruction]
     │     same harness, same array, same budget → B_best.png (+candidates)
     │
     ├─► [8× nearest-neighbor upscale]  A_best, B_best
     │
     ├─► [Claude blind pre-label]  position-randomized A_best vs B_best,
     │     forced pick + per-axis reasons, recorded BEFORE user sees
     │
     └─► [User judges]  best-vs-best surfaced (candidates available);
            user's pairwise call = gold → diff vs Claude's pre-label = finding

  Aggregate: skill-on win-rate (user), per axis; Claude-vs-user agreement.
```

- **Orchestrator:** this Claude Code session drives the paired agents (Agent tool) for the first run; can be hardened into a `claude -p` loop for the flywheel. *Open implementation question: confirm how headless `claude -p` auth resolves in this remote environment before relying on it for automation.*
- **External calls:** pixflux only (PixelLab token at `.claude/skills/magiclike-card-art/pixellab-token`). No Anthropic API.
- **Card-data note:** card folders are snake_case (`storm_sage`), not the camelCase tplIds (`doomBlade`) the skill doc still references — a stale-path finding to fix in the skill separately.

## 6. Build order

1. **Agent harness + smoke test.** Define the per-arm agent prompt (arm A: "read `SKILL.md`, produce art for this card autonomously, **≤~10 image-gen calls drawing seeds from this shared array**, iterate per the skill, nominate your best, save to the run dir"; arm B: naive equivalent with the bare pixflux mechanics only). Run it on **1 card** end-to-end and eyeball that both arms iterate, nominate a best, and emit upscaled images + a manifest (card, arm, seed array, per-call seed+prompt, nominated best). Confirm pixflux + inpaint + save + upscale all work before scaling.
2. **First experiment — ~10 cards.** Run both arms across ~10 cards sampled from the held-out pool (spanning the five colors + creatures/instants/sorceries); one shared ~10-seed array per card, equal ~10-call budget per arm.
3. **Blind pre-label + user judging.** Claude pre-labels every pair (recorded); user then judges all of it. Report: skill-on win-rate overall and per axis, plus Claude-vs-user agreement. **This is the deliverable** — does the skill beat naive, where, and how well does Claude's taste track yours.
4. **Package as flywheel.** Make the two arms config-driven (swap the skill file in arm A) so `skill-v1 vs skill-v2` is one repeatable run; document it in `art-eval/` or the skill folder.
5. **(Optional, later) Automated LLM judge for scale.** Only if we want to run past hand-judging: validate a vision judge against the accumulated gold labels, scope to passing axes, scale to larger card sets.

## 7. What success looks like

- **First experiment:** a defensible statement — e.g. "skill-on art wins X of 10 pairwise calls, strongest on mechanic-enactment and color-identity," plus where Claude's blind picks agreed/disagreed with the user. If the skill *doesn't* beat naive, that's the most valuable finding.
- **The flywheel:** any future `SKILL.md` edit can be run through the harness and kept/reverted on evidence.
- **Side artifacts:** real candidate art for some of the 138 unarted cards; a list of concrete skill-doc fixes surfaced along the way (e.g. broken reproducibility logging — seeds recorded in ~1 of ~60 corpus entries despite the skill mandating it; stale camelCase paths).

## 8. Risks / open questions

- **Headless auth.** Whether `claude -p` runs on the subscription in *this* environment needs confirming before the flywheel is scriptable; the first run is fine driven from this session via the Agent tool.
- **Agent variance.** Two end-to-end agents on the same card/arm won't behave identically (different brainstorms, rerolls). That's inherent to testing the skill as used; absorbed by n and equal budgets, but worth noting when reading a single card's result.
- **Naive baseline contamination.** A truly skill-naive agent prompt is hard to author without leaking skill ideas. Keep it minimal and document its exact text.
- **Claude-vs-user divergence may be large on mechanic-enactment** (the most subjective axis). That's fine — it's a finding, and it tells us which axes a future automated judge can and can't own.

## 9. Cost

Anthropic side: **$0 metered** — everything runs on the subscription via agents. PixelLab side: each arm draws up to ~10 image-gen calls from its shared seed array (~3–5s each, 5 concurrent), so the ceiling is 10 cards × 2 arms × ~10 ≈ **~200 generations** — often fewer, since an agent needn't spend its full budget. The only spend, and it's in budget. We'll log actual pixflux usage from the API responses.
