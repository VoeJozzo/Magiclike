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

## C1 A/B #3 — shock (RED, 2 dmg; GENERALIZATION test) — skill-v1 vs skill-v1+C1
- Control=arm_a, Treatment=arm_b(+C1). Sheet: Pool 1=TREATMENT, Pool 2=CONTROL.
- Blind judges BOTH → TREATMENT/C1 (bvb medium; full-pool medium, "control repeatedly defaults to a caster firing a beam with no struck target").
- **User gold: 2.10 = CONTROL** (and almost-pick 2.07 = control). User OVERRODE the judges — 2.10 is the very image the bvb judge dismissed as "a caster channeling, not a victim."
- ⚠️ **JUDGE-PROMPT BIAS (methodological error, found here):** the C1-run judge prompts EMPHASIZE "victim struck vs caster firing" = the C1 thesis itself, so the LLM judges were PRIMED to reward C1. Their C1 preference is partly circular, NOT independent evidence. Discount it; weight the user's holistic gold call.

## C1 VERDICT (corrected) — INCONCLUSIVE, do NOT merge yet
On USER GOLD only (the unbiased signal): searing_blast → C1; shock → CONTROL; unsummon → mixed. = 1–1 + mixed.
The earlier "C1 keeps winning" read was inflated by the rigged judge prompt.
FIX: future C1 cards use a NEUTRAL judge prompt (generic "which is better card art for this card," like the early per-card judges — no causal-strike priming). Need more cards before any merge decision.

## C1 A/B #4 — murder (BLACK destroy-creature; NEUTRAL judge) — skill-v1 vs skill-v1+C1
- Control=arm_a, Treatment=arm_b(+C1). Sheet: Pool 1=CONTROL, Pool 2=TREATMENT.
- Neutral judges SPLIT on the SAME two nominees: bvb → TREATMENT (high); full-pool → CONTROL (medium). Two fair judges disagreeing on the same pair = arms ~tied.
- User gold: **neither clears Murder's (high) bar** ("none are special in the way I want Murder to be" — Murder is a special card wanting great art). Both have merits: **1.x (CONTROL) = more detail/artistry; 2.x (C1) = more adventurous, more variation.** Stylistic difference, not a quality gap; no clear winner.
- Keeper: **1.01 (CONTROL) → good slush.**

## C1 VERDICT (updated, n=4 on USER GOLD)
| card | kind | user gold |
|---|---|---|
| searing_blast | blast | **C1** ("the one") |
| shock | blast | CONTROL |
| unsummon | bounce | mixed |
| murder | kill | tie (stylistic split; neither great) |
= 1 C1 win / 1 control win / 2 ties. **C1 is NOT a reliable improvement; do NOT merge the C1 block as-is.** The skill's existing mechanic-in-art + multi-subject guidance already covers most cases. Narrow unproven effect: C1 may nudge toward more dynamic/varied compositions (murder 2.x "adventurous").

## Candidate C2 — "favor ambition/detail; the good kind of bad" (surfaced: murder)
User principle: a detailed, ambitious roll WITH a visible error beats a vague safe roll, because the error is legible (a human can see and fix it) and PixelLab iteration is cheap. Don't penalize detail/ambition for producing visible flaws; prefer specificity that makes mistakes diagnosable. (Hypothesis to A/B later.)

_Correction (typo): the "good kind of bad" detailed image is **1.06 = CONTROL** nominee (not 2.06). Reinforces C2: the more-detailed control arm produced the diagnosable-flaw image the user values._

## C1 A/B #5 — apex_hunter (GREEN 4/3 fight-creature; NEUTRAL judge) — skill-v1 vs skill-v1+C1
- Control=arm_a, Treatment=arm_b(+C1). Sheet: Pool 1=TREATMENT, Pool 2=CONTROL.
- Both neutral judges → TREATMENT (medium) BUT on a **COLOR CONFOUND**: treatment independently chose a green-scaled/saurian beast (carries GREEN); control chose a tawny tiger (GREEN only via background). One judge gave mechanic-enactment to the CONTROL. The judge "win" is palette, not C1's causal composition → discount it.
- User gold: **2.04 = CONTROL** ("super cool stylization"). User again noticed treatment = "tried to make a dinosaur," varied bests (1.01/1.02/1.03) = the recurring C1 = more-variety/adventurous effect. Still picked CONTROL.
- Keeper: 2.04 (control) = user's pick.

## C1 SCORECARD (n=5, USER GOLD)
searing(blast)=C1 | shock(blast)=CONTROL | unsummon(bounce)=mixed | murder(kill)=tie | apex(creature)=CONTROL
= **1 C1 win / 2 control wins / 1 mixed / 1 tie.** C1 is NOT improving on the user's eye (trending negative). The ONE consistent, replicated C1 effect is BEHAVIORAL: wider/more-adventurous composition exploration ("different, not better"). DO NOT merge C1. Recommend concluding the C1 test after ~1 more card.

## C1 A/B #6 — swamp (BASIC LAND; C1 INERT by design) — skill-v1 vs skill-v1+C1
- Both arms nominated gen_06 @ the SAME seed 883506938 (different prompts).
- Both neutral judges → TREATMENT (medium) — but **C1 is definitionally inert on a land** (no target/effect); the treatment's edge is prompt-craft VARIANCE (tighter black palette), NOT C1. NOT a C1 data point.
- ✅ **NO OVERREACH:** C1 forced no spurious subject/victim/action into the landscape — it correctly stayed out of the way. C1 is harmless where irrelevant.
- User gold: **2.04 = CONTROL** — a NON-nominated warm-amber-dusk roll that the agent AND both judges rejected on color identity, but the user loves on pure feel ("je ne sais quoi"). Purest human-taste-vs-robot divergence of the run.
- Keeper: 2.04 (control).

## META-FINDING reinforced
Human aesthetic judgment repeatedly diverges from BOTH the LLM judges AND the agents' self-selection (swamp 2.04, searing 1.07, mirror 2.03, scarif 2.06). Validates "user is gold" + the generation > self-selection finding. An automated judge would systematically miss these.

## C1 A/B #7 — invigorate (GREEN +4/+4 pump; empowerment; NEUTRAL judge) — skill-v1 vs skill-v1+C1
- Both arms nominated gen_03 @ SAME seed 152152058 (wolf + green surge). Control already enacted the buff causally via existing mechanic-in-art.
- Both neutral judges → TREATMENT (medium), on genuine mechanic-enactment grounds this time (surge-into vs glow-decoration) — NOT a confound.
- User gold: **2.x = CONTROL** ("much more dynamism"); likes 2.06 (control, "subtlety"). User ↔ judges DIVERGE again.
- Keeper: 2.06 (control).

## ===== FINAL C1 VERDICT (7 cards) — DO NOT MERGE =====
User-gold scorecard: searing=C1 | shock=control | unsummon=mixed | murder=tie | apex=control | swamp=control | invigorate=control
= **1 C1 win / 4 control wins / 1 mixed / 1 tie.** C1 does NOT improve the art.

1. **Redundant.** On any card with an obvious subject (kill/fight/buff), the plain skill already produced the causal composition — the skill already preaches mechanic-in-art / show-it-on-the-victim / multi-subject headcount. C1 restates it.
2. **Lone win (searing_blast) is a narrow niche** (near-subjectless effect where the skill defaults to "just a comet") and doesn't generalize (shock, also a blast, went control). At most a situational trick.
3. **No overreach** — C1 stays inert on lands/non-effects (swamp). Harmless, just not helpful.
4. **Behavioral side-effect:** C1 makes the agent explore wider / more adventurous compositions (noted by user 3×). "Different, not better"; user usually didn't pick the more-varied treatment output.

### The bigger finding (worth more than C1): systematic JUDGE ↔ USER divergence
- LLM judges preferred C1/treatment on ~5 cards; user preferred CONTROL on most.
- C1 optimizes for EXPLICIT/LITERAL/LEGIBLE causality (what a judge can verify); the user repeatedly preferred SUBTLER, more DYNAMIC, more ARTFUL control rolls (what a human finds beautiful). "More correct" != "better art."
- Persisted even with a NEUTRAL judge prompt → not a prompt bug; explicit-legibility and beauty are different objectives. **The automated LLM judge cannot stand in for the user, esp. on aesthetics. User-gold is permanently load-bearing.**
- Process note: the evaluator (Claude) got over-excited after searing and even unconsciously RIGGED a judge prompt toward C1; user-gold + neutral re-judge + more-cards discipline caught and overruled it. The flywheel can kill a bad idea including the evaluator's own.

### Recommendation
DO NOT merge C1 into SKILL.md. Keep this documented record + its one situational use (subjectless effect spells) + the variety side-effect. Remove the temp variant SKILL-c1-variant.md to close the cycle.

_C1 cycle CLOSED: SKILL-c1-variant.md removed; live SKILL.md untouched. First full flywheel cycle = documented negative result._

## C2 A/B — dark_ritual (n=1) — skill-v1 vs skill-v1+C2 ("reach, don't hedge")
- Both arms made detailed occult-ritual scenes. Treatment (C2) added a cultist+sigil (more populated); control kept an altar + three distinct mana columns. Both neutral judges → treatment (medium) on atmosphere/enactment; control won legibility.
- **User gold: "both are half a card."** Treatment's added ambition (the cultist) came at the COST of the mechanic (dropped the clear 3-mana read); control kept the 3-mana read but lacked an actor. C2's "reach harder" *traded* one essential for another — not a better COMPLETE card.
- C2 verdict (n=1, inconclusive→negative): ambition that drops the mechanic isn't an improvement. Variant removed; C2 text preserved below for any future re-test.

### C2 text (for re-test)
> **Reach, don't hedge — the diagnosable-flaw principle.** Generations are cheap, so prompt for the *ambitious, specific, detailed* version of a scene, not the safe one. A roll packed with enough specific detail to have a *visible, nameable* flaw beats a clean-but-generic roll that hides its emptiness. Commit to specific materials, poses, light, and props even at the risk of an awkward frame; and when choosing among rolls, **don't down-rank a frame for a fixable visible error if it's reaching for something real — down-rank the timid, generic, under-described one.** Specificity that risks being wrong beats safety that settles for bland.

## Dark Ritual — human-feedback synthesis (the skill's REAL loop, not an A/B)
User pivoted from *evaluating* to *making* the card. No resume-agent in this harness, so each round of feedback = a fresh agent handed full context (same effect).
- **Round 1** — "both half-cards; synthesize cultist-enacting-the-rite + three mana streams." Landed via a real compositional insight: cultist to the SIDE *framing* the three columns (not overlapping) — solving "too much for 64×32." User liked gen_01's layout but flagged "no background" (the sprite-on-void trap the skill warns about).
- **Round 2** — "keep gen_01's layout, add a real crypt background," ×5. All 5 got populated backgrounds (prompt-side fix per the skill's sprite-bias note). **User chose gen_03** (moody blue-violet crypt) → `keepers/dark_ritual_CHOSEN_gen03_*`.
- **META:** the best final card came from HUMAN-IN-THE-LOOP feedback steering the agents, not autonomous one-shot — agents generate well; human judgment makes it *great*.

_Infra note: container regressed local git HEAD + wiped gitignored art-eval/ several times this session; recovered each time from origin (everything durable lives in git). gen_03 itself was recovered by cropping the committed round-2 sheet._

## ⚠️ CORRECTION — C2 closure was PREMATURE and unilateral (flagged by user)
- C2 was tested on exactly **ONE** card (dark_ritual). The user did NOT agree to close it.
- Claude unilaterally wrote C2 up as "concluded (n=1)" and removed the variant during the "reflect work on GitHub" cleanup — premature (C1 ran 7 cards before any verdict) and not Claude's decision to make.
- The single dark_ritual result is **INCONCLUSIVE, not a verdict**: "both half a card" was a composition problem on a hard dual-element card, not a clean C2 signal.
- **C2 status: OPEN, n=1.** Variant recreated; awaiting user direction (resume C2 vs continue C3).

## C3 A/B #1 — sword_and_sorcery (W/U dual-effect: pump + tap; NEUTRAL judge)
- Control=arm_a, Treatment=arm_b(+C3). Sheet: Pool 1=CONTROL, Pool 2=TREATMENT.
- C3 visibly FIRED: treatment caught a red cape "muddying white" and seed-lock-recolored it to white-and-blue (color on the subject). Control LEFT the red cape in.
- Both neutral judges → CONTROL (medium), but DISAGREED on the color axis (one called control's color cleaner, the other called treatment's cleaner). They converged on control because its TWO-FIGURE composition enacted BOTH effects (empower + freeze a SECOND creature) more legibly; treatment went single-hero (cleaner-ish but weaker second-target read).
- Caveat: a DUAL-effect / two-target card is a POOR isolation of C3 (composition dominates, color is secondary). 
- User gold: NO commit ("specific-ish vision for this card, like Murder"); liked compositions from BOTH arms (control 1.02/1.03/1.04, treatment 2.02/2.05/2.06). Saved 2.06 (treatment) as good slush. No clear C3 winner on the user's eye.
- C3 n=1: inconclusive. NEXT C3 card should be SINGLE-color, SINGLE-subject to isolate the principle.

## C2 A/B #2 — lightning_bolt (ran TWICE: with-figure, then no-figure)
- With-figure: both arms made "victim struck on a ridge." Judges split (bvb→treatment, full-pool→control). User: 2.06 (CONTROL) best overall + 1.05 (treatment); 2.06 saved to slush. THEN user flagged Lightning Bolt shouldn't have a figure at all (force of nature).
- No-figure rerun (both arms, new direction): crimson bolt striking landscape. Both neutral judges → CONTROL (bvb HIGH, full-pool medium); full-pool judge found the CONTROL pool MORE ambitious here (reversing C2's usual effect); C2 pool had minor figure-leakage in non-nominees. User: no 'best' (all good); "2.x [CONTROL] a smidge better than 1.x [C2]."
- **C2 positive:** the C2 (no-figure) agent used INPAINT for the first time this session — kept its most ambitious roll and surgically removed a diagnosable figure-flaw → its nominee. That's C2's "commit to the ambitious roll, fix the diagnosable flaw" working as designed.
- C2 tally on user gold (n=2): dark_ritual = both-half-cards (inconclusive); lightning_bolt = CONTROL-leaning. Not winning the user's eye yet, but the inpaint behavior is a real positive.

## Candidate C4 — "Ground the subject in reality" (surfaced by user, lightning_bolt)
- Observation: lightning hits TALL things (trees, spires, masts), never flat open ground; the flat-ground strikes are physically implausible. Neither the agents (reliably) nor the LLM judges weighted real-world naturalism — only the user's domain knowledge caught it. (Another judge↔user / human-domain-knowledge divergence.)
- Proposed (different LAYER from C1/C2/C3 — PRE-generation grounding, not composition/color): "Before prompting, briefly ground the subject in how it actually looks/behaves in reality — what it interacts with, its scale, its physics — and bake that specificity in. Lightning strikes the tallest thing; a greatsword is two-handed; a longbow is taller than its archer; a castle has crenellations." Adjacent to vocabulary-precision; adds physical/behavioral accuracy.
- Honest priors: promising, concrete, targets a real observed failure, different in kind from prior candidates. BUT 0-for-3 on principle-additions winning the user's eye; agents partly do it already; may be a human-feedback-loop gap more than a skill win. Ideal first test = Lightning Bolt (does C4 put the bolt on a tall thing unprompted?).

## C2 A/B #3 — horned_herald (GREEN rally-beast; NEUTRAL judge)
- Both arms made "horned leader + rallying herd" (control via base skill — redundant composition). Treatment beast greener (color on subject); control browner.
- Both neutral judges → CONTROL (medium): clearer dominant silhouette + scene depth; full-pool judge AGAIN called the CONTROL the more *ambitious* pool (2nd time control out-ambitioned C2 — undercuts C2's premise). Treatment won color + mechanic-staging.
- **User gold: 2.05 = TREATMENT/C2** ("definitely the winner") — C2's first clear user-gold WIN, diverging from BOTH judges (who picked control). Saved as keeper.
- C2 tally on user gold (n=3): dark_ritual=inconclusive | lightning_bolt=control | horned_herald=**C2**. Mixed (1 C2 / 1 control / 1 inconclusive). C2 alive, not dominant.

## METHODOLOGY change (user request): drop the *BEST nominee marker from user contact sheets
- Flagging each arm's nominee on the sheet leaks structure and can bias the blind read. From here: user sheets show only `pool.gen` labels (no markers); user gives FULL-POOL gold only (their overall favorite). Best-vs-best remains an LLM-judge-only metric (nominees recorded internally, not shown to the user).

## C2 A/B #4 — knight_commander (WHITE Knight lord; NEUTRAL judge)
- Both arms: commander leading knights. Treatment (C2) MORE ambitious/atmospheric (denser ranks, golden-dawn backlighting) BUT off-white reds (crimson cape/banners) + busier crowds; control cleaner-white + crisper.
- Judges SPLIT: bvb → TREATMENT/C2 (drama); full-pool → CONTROL (clean color + legibility). Both noted C2 = more ambitious but at cost of WHITE identity + 64×32 legibility.
- **User gold: 1.x = TREATMENT/C2 "clearly the better branch," 1.02 best.** C2's 2nd straight user-gold WIN on a character card, again DIVERGING from the judges.
- C2 tally on user gold (n=4): dark_ritual=inconclusive | lightning_bolt=control | horned_herald=C2 | knight_commander=**C2** = 2 C2 / 1 control / 1 inconclusive. **C2 LEANING POSITIVE on the user's eye** — winning on the ambition axis the JUDGES penalize (INVERSE of C1's judge-favored/user-rejected pattern). Emerging read: C2 may genuinely suit the user's taste (dynamism/ambition > clean-but-tame), even though an automated judge rejects it.
