# Plan: Evaluate & improve the `magiclike-card-art` skill

**Status (2026-06-05):** Plan locked; **harness validated by 3 smoke-test cards** (Mahamoti Djinn, Mirror Sage, Scarification) — the agent→pixflux→iterate→nominate→blind-judge→contact-sheet loop works end-to-end, seed discipline holds, and early calibration is accumulating (see §5b). Real ~10-card run not yet kicked off. Build order in §6 is the path.

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
| Judging | **User is the gold judge** — every image surfaced every run (as a per-card contact sheet, `pool.gen` shorthand). **Claude blind-pre-labels** each pair *before* the user looks; pre-label vs user-call divergence is itself a finding + calibration data. **Measure two metrics per card** (decided after smoke tests, see §5b): *best-vs-best* (each arm's single nominee — the end-to-end "as used" score) AND *full-pool* (best image available in each arm's whole candidate pool — isolates generation quality from the agent's self-selection). |
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

## 5b. Smoke-test findings (3 cards, 2026-06-05)

Ran the full loop on 3 random unarted cards before scaling. Full record in `art-eval/CALIBRATION.md` (gitignored local).

- **Harness works end-to-end.** Both arms iterate (reroll, seed-lock tweak, subject-swap), stay on the shared seed array, respect budget; blind judge + contact-sheet pipeline solid.
- **Early calibration (n=3, noisy):** user's eye favored the **skill** arm on all 3 cards; the blind judge favored skill on 2 of 3 (it chose naive on the vanilla-flying Djinn, where there's no mechanic to enact). So the LLM judge ≠ the user yet — keep the human as gold.
- **Key finding → drove the dual-metric decision.** On both cards with real candidate spread, the image the *user* liked was a skill-arm roll the skill *agent did not nominate* (it discarded the user's favorite and crowned a different one). So the skill's **generation** looks strong while its **self-selection** lags — and a pure best-vs-best comparison would *undersell* the skill. Hence §2's two-metric judging.
- **Agents confabulate process history.** All 3 cards' agents narrated phantom "prior runs" of their own early rolls; on-disk timestamps + seeds always proved a single clean run. Harmless misreporting, not a breach — but don't trust an agent's self-report of its own run; verify on disk (as the harness does).
- **Throttle for the real run.** Parallel arms can collectively exceed pixflux's 5-concurrent cap (naive arm hit empty-body responses under load). Add an orchestrator-side concurrency limit when running multiple cards × 2 arms.

## 6. Build order

1. **Agent harness + smoke test.** Define the per-arm agent prompt (arm A: "read `SKILL.md`, produce art for this card autonomously, **≤~10 image-gen calls drawing seeds from this shared array**, iterate per the skill, nominate your best, save to the run dir"; arm B: naive equivalent with the bare pixflux mechanics only). Run it on **1 card** end-to-end and eyeball that both arms iterate, nominate a best, and emit upscaled images + a manifest (card, arm, seed array, per-call seed+prompt, nominated best). Confirm pixflux + inpaint + save + upscale all work before scaling.
2. **First experiment — ~10 cards.** Run both arms across ~10 cards sampled from the held-out pool (spanning the five colors + creatures/instants/sorceries); one shared ~10-seed array per card, equal ~10-call budget per arm.
3. **Blind pre-label + user judging.** Claude pre-labels every pair (recorded); user then judges all of it. Report: skill-on win-rate overall and per axis, plus Claude-vs-user agreement. **This is the deliverable** — does the skill beat naive, where, and how well does Claude's taste track yours.
4. **Package as flywheel.** Make the two arms config-driven (swap the skill file in arm A) so `skill-v1 vs skill-v2` is one repeatable run; document it in `art-eval/` or the skill folder.
5. **(Optional, later) Automated LLM judge for scale.** Only if we want to run past hand-judging: validate a vision judge against the accumulated gold labels, scope to passing axes, scale to larger card sets.

## 7. What success looks like

- **First experiment:** a defensible statement on **both** metrics — e.g. "skill-on wins X of 10 *best-vs-best* and Y of 10 *full-pool*, strongest on mechanic-enactment," plus where Claude's blind picks agreed/disagreed with the user. A gap between the two metrics is itself a result (generation strong, self-selection weak, per the smoke tests). If the skill *doesn't* beat naive on either, that's the most valuable finding.
- **The flywheel:** any future `SKILL.md` edit can be run through the harness and kept/reverted on evidence.
- **Side artifacts:** real candidate art for some of the 138 unarted cards; a list of concrete skill-doc fixes surfaced along the way (e.g. broken reproducibility logging — seeds recorded in ~1 of ~60 corpus entries despite the skill mandating it; stale camelCase paths).

## 8. Risks / open questions

- **Headless auth.** Whether `claude -p` runs on the subscription in *this* environment needs confirming before the flywheel is scriptable; the first run is fine driven from this session via the Agent tool.
- **Agent variance.** Two end-to-end agents on the same card/arm won't behave identically (different brainstorms, rerolls). That's inherent to testing the skill as used; absorbed by n and equal budgets, but worth noting when reading a single card's result.
- **Naive baseline contamination.** A truly skill-naive agent prompt is hard to author without leaking skill ideas. Keep it minimal and document its exact text.
- **Claude-vs-user divergence may be large on mechanic-enactment** (the most subjective axis). That's fine — it's a finding, and it tells us which axes a future automated judge can and can't own.

## 9. Cost

Anthropic side: **$0 metered** — everything runs on the subscription via agents. PixelLab side: each arm draws up to ~10 image-gen calls from its shared seed array (~3–5s each, 5 concurrent), so the ceiling is 10 cards × 2 arms × ~10 ≈ **~200 generations** — often fewer, since an agent needn't spend its full budget. The only spend, and it's in budget. We'll log actual pixflux usage from the API responses.

## 10. Results ledger — C4 ("ground the depiction in reality")

Blind best-vs-best, user-judged. Arm identity sealed during judging; decoded via `harness.py decode` after the pick. 10 gens/arm.

| Card | Outcome | Winning frame | Arm |
|---|---|---|---|
| serra_angel | keeper | 1.08 / gen_08 (seed 1484945952) | **treatment** |
| illusion_drake | keeper | 1.06 / gen_06 | **control** |
| inferno_caller | keeper | 2.03 / gen_03 (seed 2078541351) | **treatment** |
| iron_statue | no keeper | quality-noted: 1.03 / gen_03 (seed 1596325315) | control |
| island | keeper | 2.03 / gen_03 (seed 1650588914) | **control** |
| living_lands | no keeper | — (user impressed by the control arm's frames; hard "animate the land" mechanic, neither frame promotable) | — |
| llanowar_elves | keeper | 2.02 / gen_02 (seed 246265534); quality runner-up 2.10 / gen_10 (seed 784951755) | **control** (both) |
| martyr_saint | no keeper | user preferred control (1.x) at first glance, but no frame quite right even after off-test no-light/wispy-soul/halo exploration on the 1.04 composition | — (control leaned) |
| mercurial_adept | keeper | 2.06 / gen_06 (seed 1680434513); quality slush 2.01 (seed 1538822992) + 2.03 (seed 1265988307) | **control** (all three) |
| might_of_faith | keeper | 2.05 / gen_05 (seed 2027617594); quality slush 1.05 (seed 241573823) + 1.07 (seed 990759011) | **control** (keeper); **treatment** (both quality slush) |
| mind_control | keeper ("good enough", not great) | 1.02 / gen_02 (seed 306991308) | **treatment** |
| mountain | keeper (arbitrary; all near-equivalent) | 2.07 / gen_07 (seed 1557831263); 3 treatment alts saved to cards/mountain/alts/ (1.02/1.04/1.05) per user request | **control** (keeper); treatment alts archived |
| oxen_herd | keeper ("not super strong"; user: "both arts got the same place") | 2.01 / gen_01 (seed 519956986) | **treatment** |
| vine_twister | round 14; FIRST emoji-stripped round; pool-quality primary. User: "1.x is better art" → DECISIVE treatment pool win | 1.02 / gen_02 (seed 1611006294) — also treatment's OWN nominee (rare agent-self-select ↔ user concordance) | **treatment** (decisive pool; keeper 1.02) |
| squire_of_oaths | round 15; vanilla 2/3 (no mechanic), both arms converged on oath-vigil. User: "roughly similar quality overall" → TIE (no pool difference) | keeper 2.06 / gen_06 (seed 236692525) = control, a NON-nominated roll (control nominated gen_03) → generation>self-selection again | **tie** (no pool diff); keeper control |
| vengeful_spirit | round 16; Spirit 2/2 flying, death-trigger destroy. User: "2.x is better" → DECISIVE treatment pool win | keeper 2.04 / gen_04 (seed 1930841241) = treatment; control's 1.04 / gen_04 (seed 1815193130) flagged high-quality | **treatment** (decisive pool; keeper 2.04) |
| drain_life | round 17; B1C2 drain sorcery (deal 2 + 2, gain 4). User: "no winners here tbh" → TIE (no pool difference) | high-quality: 2.01 / gen_01 (seed 716703906) = control; 1.02 / gen_02 (seed 1114520804) = treatment | **tie** (no pool diff) |

**Tally (keepers):** treatment 4, control 6, no-keeper 3. Quality-noted frames: control 4, treatment 2. n=13 rounds; **10 keepers banked — milestone reached** (control-vs-treatment discussion due now). Keeper sequence: serra(T), illusion(C), inferno(T), island(C), llanowar(C), mercurial(C), might(C), mind_control(T), mountain(C), oxen_herd(T). Composition finding (martyr_saint): the C4 treatment kept rendering the gain-life mechanic literally as a two-figure "she gives / he receives" transfer, which doesn't survive the 64×32 downscale; control's single-figure framing read cleaner. (Observation: control keeps winning blind best-vs-best; treatment's edge from serra/inferno isn't recurring.)

### Addendum — metric reframe + pool-quality re-analysis (after n=13, 2026-06-17)

The keeper tally above (control 6, treatment 4) was re-examined and is now considered
**noise-dominated, not decision-grade.** Two changes came out of a design pass:

- **Pool-quality re-read (user, blind→decoded):** judging each card on *whole-pool* quality
  (not the single keeper) gives **treatment 4 / control 2 / no-difference 7**:
  treatment-better = serra_angel, inferno_caller, iron_statue, might_of_faith; control-better
  = llanowar_elves, martyr_saint; the rest (incl. both basic lands + illusion_drake) tie.
  This *inverts* the keeper headline. Why: the keeper metric picks the max of ~10 draws (an
  extreme order statistic); on the 7 tied pools the single best frame lands in an arm ~by
  coin-flip, and that broke ~4–2 control by chance. might_of_faith is the tell — treatment-better
  *pool*, but the single keeper came from control (the metric miscredited control).
- **Primary endpoint = pool-quality; keeper = secondary.** Rationale (an unbiased stats pass
  agreed on the test, and we extended it): production runs only ONE skill version, so the real
  question is "does the live skill hand me better pools to pick from?" — a distributional
  question pool-quality matches, and which is lower-variance than the max-vs-max keeper contest.
  Correct test for both = paired **sign test (exact binomial on non-tie pairs)**. Current numbers:
  keeper 4/10 → p≈0.75; pool-quality 4/6 → p≈0.69. **Neither significant; underpowered, not null.**
  Ties (incl. degenerate land/vanilla cards) are *dropped from the math* but NOT from the draw —
  card selection stays production-representative (we still need land art), and every round yields
  shippable art regardless, so no budget is wasted. To detect a moderate effect needs ~40+
  eligible cards. Outstanding hardening: a single-judge reliability check (re-judge a blind subset).
- **Emoji strip (from round 14 / vine_twister on):** the `art` placeholder emoji (🔥/🧠/🌿) was
  being handed to agents via the raw card.json — a depiction anchor antithetical to C4. The
  harness now writes a sanitized `card_context.json` (art field dropped, all else verbatim) at
  run-root and the brief forbids opening the raw card dir. All n=13 above predate the strip.

**Process findings surfaced along the way:**
- **Byte-identical contamination** (caught by a hardened `preflight`): duplicate saved frames across runs/arms, honest manifests. Root cause traced to the skill brief's shared `curl -o /tmp/pixflux_resp.json` path (a failed/empty curl re-saves a prior call's bytes), **not** server-side stale returns — billing showed dups were real billed calls, and the in-memory `gen_image.py` helper produced 0 dups under the same seed-reuse that triggered it. `preflight` now fails on any byte-identical pair (within- or cross-run) as a cause-agnostic backstop.
