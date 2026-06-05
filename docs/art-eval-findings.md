# Art-skill-eval — findings & calibration log

Durable, **git-tracked** record of the eval's results (the `art-eval/` working dir is
gitignored and gets wiped on container reset — see the incident note below; nothing of
value lives only there again).

## ⚠️ Persistence policy (learned the hard way, 2026-06-05)

The remote container is ephemeral; only committed-and-pushed files survive a reset. The
first 4 smoke cards' **generated images, contact sheets, and the original `CALIBRATION.md`
were gitignored under `art-eval/` and were permanently lost** when the container reset
mid-session. The *plan* survived (committed). This file (reconstructed from the session)
is the durable replacement. **Going forward:** all findings + the user's gold calls live
here (tracked); for the real run, each card's **contact sheet and any user-flagged keepers
are committed** too. Raw per-roll PNGs may stay ephemeral, but never the records.

## Method recap (see `docs/plans/plan-art-skill-eval.md` for full design)

Per card: both arms are end-to-end agents differing only by whether `SKILL.md` is loaded;
shared per-card seed array; ≤10 pixflux calls each; each nominates a best. Judging is
**dual-metric**: *best-vs-best* (nominees) and *full-pool* (best-available in each arm's
whole pool). Claude blind-pre-labels before the user; **the user is the gold judge.**
Pool numbers are per-card and randomized; arms revealed below.

## Calibration — smoke cards (n=4, 2026-06-05)

### Card 1 — `mahamoti_djinn` (vanilla 5/6 blue flyer; mechanic = flying only)
- Pools: option_1 = SKILL, option_2 = NAIVE
- Blind judge (best-vs-best only, pre-dual-metric): **NAIVE** (medium) — won mechanic+color; lost silhouette+scene
- **User overall pick: SKILL** (arm_a gen_02)
- → DISAGREE (user skill, judge naive)

### Card 2 — `mirror_sage` (1/2 blue wizard; mechanic = tap to freeze a creature)
- Pools: Pool 1 = NAIVE, Pool 2 = SKILL
- Blind judge (best-vs-best): **SKILL** (medium) — won mechanic+scene; lost silhouette+color
- **User:** disliked both nominated finals; browsing pick = **2.03 = SKILL** (a roll the skill agent itself *discarded*). Keeper flag: **1.01 → high-value slush = NAIVE**.
- → both lean SKILL

### Card 3 — `scarification` (black removal sorcery; mechanic = scar + destroy a creature)
- Pools: Pool 1 = NAIVE, Pool 2 = SKILL
- Blind judge (best-vs-best): **SKILL** (medium) — won mechanic+silhouette+scene; naive won color
- **User favorite: 2.06 = SKILL** (a variance roll the agent did NOT nominate — it nominated 2.08). Good-slush: **1.01, 1.10 = both NAIVE** (1.10 was naive's own nominee).
- → both lean SKILL

### Card 4 — `searing_blast` (red burn sorcery; mechanic = 5 dmg to a target) — FIRST DUAL-METRIC
- Pools: Pool 1 = SKILL, Pool 2 = NAIVE
- Blind judge **best-vs-best: SKILL (HIGH)**; **full-pool: SKILL (medium)** — full-pool judge picked skill's `gen_08`, *not* its nominee `gen_09`
- **User: REJECTS ALL** — nothing cleared the bar. Relative-best flagged = **1.01, 1.07, 1.09 — ALL SKILL** (1.09 was the skill nominee).
- → skill made the relatively-better images again, but in ABSOLUTE terms both arms missed

## Running tally (n=4)

| | C1 Djinn | C2 Mirror | C3 Scarif. | C4 Searing |
|---|---|---|---|---|
| User's lean (relative) | SKILL | SKILL | SKILL | SKILL |
| User absolute keep-worthy? | yes | borderline | yes | **NO (reject all)** |
| Blind judge | NAIVE | SKILL | SKILL | SKILL (both metrics) |

- **User's eye has gone skill-arm 4/4** (relative). Blind judge 3/4 skill (chose naive only on the no-mechanic vanilla flyer).
- LLM judge ≠ user yet → keep the human as gold.

## Emerging findings (watch / act on for the real run)

1. **Generation > self-selection.** Repeatedly the user's favorite is a SKILL roll the skill *agent did not nominate* (C2: discarded; C3: non-nominee; C4: full-pool judge also preferred a non-nominee). The skill *makes* good art but *picks* its winner poorly. → drove the dual-metric decision (best-vs-best AND full-pool). A pure best-vs-best comparison undersells the skill.
2. **"Beats naive" ≠ "is good."** C4 (searing_blast): skill won both metrics yet the user rejected everything. → track an **absolute keep-worthy bar** per card, not just the pairwise winner. Burn/effect spells look like a weak spot.
3. **Agents confabulate process history.** All 4 cards' agents narrated phantom "prior runs" of their own early rolls; on-disk timestamps + seeds always proved a single clean run. Harmless, but never trust an agent's self-report of its run — verify on disk (the harness does).
4. **Concurrency throttle needed.** Parallel arms can exceed pixflux's 5-concurrent cap (naive arm hit empty-body responses). Add an orchestrator-side limit for multi-card runs.

## Candidate SKILL.md improvements (hypotheses to A/B via the harness)

### C1 — Causal/relational composition for spells (surfaced: searing_blast, card 4)
**User (gold):** on Searing Blast, *all* candidates (skill + naive) failed the same way — "none
really tie the fireball to the guy. No sense of 'this guy is casting it' or 'this guy is getting
hit by it' — just a guy and a fireball." Elements present, **relationship absent.**

**Gap:** the skill's "mechanic-enactment" pushes for the right *elements* but not the *causal
connection* between them. At 64×32, co-located subject + effect reads as two separate objects
unless the interaction is explicitly composed.

**Proposed edit (to test, not yet applied):** for effect/damage/targeted spells, require the
implement and its target to be visibly **linked by the action**:
- a connecting element along the action vector (beam/arc/spray from source to target);
- a reaction pose (caster bracing/recoiling; victim flinching, flung, buckling);
- impact deformation / directional debris thrown *along* the blast vector (not radial mush);
- **legibility test:** cover either the source OR the target — does the other still imply "X is
  doing this to Y"? If both halves are independently inert, it's "a guy and a fireball," not
  "a guy blasting a guy."

**Validate via:** harness A/B, skill-current vs skill+C1, on damage/targeted-effect cards
(searing_blast, lava_spike, doom_blade-likes); win = higher user keep-worthy / mechanic-enactment.

## C1 A/B #1 — unsummon (bounce; SOFT C1 test) — skill-v1 vs skill-v1+C1
- Control = arm_a (skill-v1); Treatment = arm_b (skill+C1). Sheet: Pool 1 = TREATMENT, Pool 2 = CONTROL.
- Blind judges **SPLIT**: best-vs-best → CONTROL (medium); full-pool → TREATMENT (medium — "treatment pool repeatedly enacts un-summon across multiple images; control mostly creatures standing, only one true enactment").
- User: neither batch captures unsummon. **Closest = 1.02 = TREATMENT/C1** (but flawed — no background). Good slush = **2.05, 2.06 = CONTROL** (2.05 = control nominee).
- Read (n=1, soft card): **MIXED / inconclusive.** Closest single image + full-pool consistency lean C1; control's nominee + user slush lean control. Bounce is a gentle causal action — C1 was written for blast/damage. Re-run searing_blast (the motivating case) for a sharp test.

## C1 A/B #2 — searing_blast (RED burn, 5 dmg; the MOTIVATING card) — skill-v1 vs skill-v1+C1
- Control = arm_a (skill-v1); Treatment = arm_b (skill+C1). Sheet: Pool 1 = TREATMENT, Pool 2 = CONTROL.
- Blind judges BOTH → **TREATMENT/C1**: best-vs-best **HIGH** ("comet slams into a recoiling silhouette" vs control's "beam streaks past the figure without a legible connecting strike"); full-pool medium, consistency note: C1 pool "more consistently depicts a directed trail actually striking a figure," control "more frequently shows ambient fire merely coexisting with a bystander."
- User: **1.07 = TREATMENT/C1 = "the one"** — FIRST genuine keeper across the whole eval (cleared the absolute bar). Slush 1.09 = also TREATMENT/C1. (Both non-nominated; treatment nominated 1.01 — generation > self-selection again.)
- Read (n=1, the RIGHT card): **STRONG C1 WIN.** User gold + both blind judges converged on C1; control's failure described as "ambient fire coexisting with a bystander" = the user's original "a guy and a fireball" complaint. C1 fixes the exact failure it targets.

## C1 verdict so far
| C1 A/B | card | kind | result |
|---|---|---|---|
| #1 | unsummon | bounce (soft) | MIXED/inconclusive |
| #2 | searing_blast | burn/damage (sharp) | **STRONG WIN** (user + both judges) |
Promising. Test 1–2 more damage/targeted cards; if C1 holds, merge the C1 block into live SKILL.md.
