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

## C2 A/B #5 — bindspeaker (BLUE merfolk binder; NEUTRAL judge)
- Both arms: merfolk binding a beast with glowing chains/ring underwater. Judges SPLIT: bvb → CONTROL (clearer chain-snare + silhouette); full-pool → TREATMENT/C2 (more ambitious + better blue — control stuck a red beast in a blue card).
- **User gold: 2.06 = TREATMENT/C2** ("the best, not particularly close"). C2's 3rd STRAIGHT user-gold win.
- C2 tally on user gold (n=5): dark_ritual=inconclusive | lightning_bolt=control | horned_herald=C2 | knight_commander=C2 | bindspeaker=**C2** = 3 C2 / 1 control / 1 inconclusive.
- NOTE (user guidance): NOT a merge case — need n>=7 AND clear data (C1 earned its verdict on 7 + an exceptionally clean signal). C2 trending positive on the user's eye; keep testing.

## ===== CONCORDANCE ANALYSIS — automated judges vs user gold (whole run) =====
Clear-call cards (judges reached a consensus AND user made a clear pick); * = rigged judge prompt (C1 searing/shock).
| Card | Phase | Judge consensus | User gold | Agree |
|---|---|---|---|---|
| mahamoti_djinn | skill-v-naive | naive | skill | ✗ |
| mirror_sage | skill-v-naive | skill | skill | ✓ |
| scarification | skill-v-naive | skill | skill | ✓ |
| searing_blast | skill-v-naive | skill | skill | ✓ |
| searing_blast | C1* | C1* | C1 | ✓* |
| shock | C1* | C1* | control | ✗* |
| apex_hunter | C1 | treatment | control | ✗ |
| swamp | C1 | treatment | control | ✗ |
| invigorate | C1 | treatment | control | ✗ |
| lightning_bolt(no-fig) | C2 | control | control | ✓ |
| horned_herald | C2 | control | C2 | ✗ |
Raw: 5/11 agree (~45%, ≈ coin flip).
Decomposed:
- COARSE calls (skill vs naive, big quality gap): judge agreed 3/4 (only miss = vanilla Djinn, a defensible "no mechanic" call). Judge is a fine GOOD-vs-BAD discriminator.
- FINE/aesthetic calls (skill vs skill+variant, neutral judges): judge agreed ~1/5 (lightning-nofig only) — at/below chance, and SYSTEMATIC: judge rewards legible/clean/literal/color-correct; user rewards dynamic/ambitious/stylish/feel.
- Plus 5 subtle cards where the TWO judges couldn't agree with EACH OTHER (unsummon, murder, lightning-figure, knight_commander, bindspeaker) — internal inconsistency on fine calls.
IMPLICATION: the LLM judge is usable as a COARSE pre-filter (cull obvious losers) but is unreliable-to-anticorrelated as a FINE aesthetic arbiter. It would NOT clear the plan's ≥80% calibration gate. User-gold is permanently load-bearing on the aesthetic call. (Caveats: small n; 2 rigged C1 cards; some user calls were relative/reject-all.)

## ===== PROTOCOL CHANGE (user decision): CUT the LLM judges =====
- Remove the blind LLM judges (best-vs-best + full-pool) from the test protocol. Rationale (per concordance analysis): ~chance on fine aesthetic calls, internally inconsistent, occasionally misleading, save the user no work, and risk biasing the user's blind call. Their one realized value (the calibration finding) is banked.
- NEW per-card protocol: pick card → run both arms (control vs variant) → build BLIND marker-free contact sheet → USER judges (full-pool gold) → log. NO LLM judge step. Agents still nominate internally (recorded), but no judge compares them.

## Candidate C5 — "self-critique with the judge's stance" (surfaced by user)
- Observation: the JUDGE's per-axis reasoning is often a sharp DESCRIBER ("ambient fire coexisting with a bystander" ≈ user's "guy and a fireball") even when its overall verdict is a bad DECIDER. The artist agent, by contrast, repeatedly fails to catch its own flaws.
- WHY the judge out-EVALUATES the artist (the hypothesis's engine):
  1. The judge is told "you do NOT know how it was made; judge ONLY what you see" → it assesses the OUTPUT. The artist can't un-know its INTENT — it "sees" the fireball-striking-the-guy it MEANT, not the "guy and a fireball" it rendered.
  2. Explicit per-axis rubric forces systematic critique; the artist generates holistically with no checklist.
  3. Critical forced-choice stance surfaces relative flaws; the artist is in affirmative create-mode.
  4. Fresh eyes, no sunk-cost attachment.
- C5 (different LAYER — a self-EVALUATION phase, not prompt content): after generating, have the artist switch into evaluator-mode — re-examine its own rolls "as if it didn't make them, judging only what's on the canvas, against [explicit axes]" — BEFORE selecting/iterating. Bottle the judge's fresh-eyes / output-not-intent / rubric stance into the artist's own loop.
- Targets TWO measured gaps at once: generation > self-selection (pick the better roll) AND artist-misses-own-flaws (iterate on the real flaw). Test via harness (skill vs skill+C5). Queued.

## C2 A/B #6 — old_guardian (GREEN treefolk, death->buff; JUDGE-FREE protocol)
- Control = treefolk PORTRAIT (legacy implicit); C2 = enacted the DEATH-LEGACY (dying elder streaming green life-force into a sapling-successor). C2 reached for the harder mechanic.
- **User gold: 2.07 = TREATMENT/C2.** C2's 4th STRAIGHT user-gold win.
- C2 tally on user gold (n=6): dark_ritual=inconclusive | lightning_bolt=control | horned_herald=C2 | knight_commander=C2 | bindspeaker=C2 | old_guardian=**C2** = 4 C2 / 1 control / 1 inconclusive. C2 strongly leaning positive on the user's eye. n=6; need >=7 for a verdict floor (one more clean card).

## Candidate C6 — "lead with the base form for hybrid 'X-folk' creatures" (surfaced: old_guardian)
- User observation: PixelLab renders treefolk as "humanoids made of wood" (biped + arms + defensive stance + bearded face, wood-textured) rather than "trees that are folk." The cells that read RIGHT (1.01/2.01/2.03 — pre-existing UNLOGGED rolls) showed a TREE/TRUNK with a face/character emerging; the agents' deliberate logged batches prompted a HUMANOID ("body made of bark, two thick root-like arms, stands in a sturdy defensive stance, craggy face with a long mossy beard") -> wood-men.
- Hypothesis: for hybrid X-folk (treefolk, elementals, etc.), prompt the BASE FORM FIRST — e.g. "an ancient gnarled tree whose trunk forms a weathered face, roots for feet" — NOT "a humanoid figure made of X." The humanoid framing + the model's strong humanoid prior yields "X-textured people."
- Caveat: the flagged good cells' exact prompts weren't logged (inferred from visuals + contrast with the logged humanoid-framed batches). Queued (behind C2 run, C4, C5).

## C2 A/B #7 (INVALID — excluded) — prodigal_sorcerer
- **Card-selection error:** I shuffled the html-proto card list without filtering on art presence; prodigal_sorcerer **already has `art.png`**. The harness pool is supposed to be *unarted* cards only. The done-set cards (horned_herald, old_guardian, bindspeaker, knight_commander, mirror_sage, apex_hunter, …) all have NO `art.png` — that IS the selection criterion. **FIX (binding): only draw cards from `reference/html-proto/cards/<c>/` that lack an `art.png` file** (121 such cards remain, minus the done set). Built the corrected pool.
- Round still ran (control SKILL.md vs C2-variant, shared 10-seed pool, blind sheet `prodigal_sorcerer_c2ab_sheet.png`). **User read: disliked ALL; slight lean to 2.x.** Decoding the blind map: label 2 = arm_a = **control**. So a faint anti-treatment lean — but on a disqualified card, so **NOT counted** toward the C2 n>=7 tally.
- Art kept committed (downloadable) under `art-eval/runs/skillab-c2-prodigal_sorcerer/`. C2 tally stands at n=6 (4 C2 / 1 control / 1 inconclusive). Re-rolling a genuinely-unarted card (vile_edict) as the real #7.

## ===== TECH-STACK AUDIT (user-requested "take a beat") =====
Trigger: recurring file loss (C2 variant wiped; seed pool churn) + a card picked that already had art.
**Root cause (single):** the execution container restores from a snapshot pinned near commit `9923e7a`. Each restore rewinds the working tree and DELETES anything not committed-and-pushed, and resets `.git/info/exclude`. Harness inputs parked in gitignored spots vanished mid-session:
- `SKILL-c2-variant.md` (gitignored in skill dir) -> wiped -> a treatment agent silently fell back to control (control-vs-control). FIXED: committed under `art-eval/variants/{SKILL-control.md,SKILL-c2-variant.md}`.
- shared `seeds.json` placed under gitignored `_meta/` for prodigal+vile_edict (older runs correctly used run-ROOT). FIXED: migrated to run-root (committed); harness writes seeds at run-root.
- card selection didn't filter on `art.png`. FIXED: harness `pool`/`init` REFUSE arted or done cards.
**Verification this session (all green):**
- Live pixflux smoke test: 200, base64 -> 64x32 RGBA PNG. API+token+decode path healthy.
- `harness.py selftest`: PASS (variant = control + C2 paragraph; token format OK; 120 eligible cards).
- `harness.py preflight skillab-c2-vile_edict`: PASS (both arms 10 gens, seeds match pool, **0 byte-identical cross-arm pairs** => genuinely treatment-vs-control).
- No active processes (jobs empty; no python/curl procs). The "3 processes" the user saw = completed background-agent task cards in the UI; nothing computing.
**New durable harness** `art-eval/harness.py` (committed): unarted-pool/pick/init/preflight/sheet/decode/selftest. Seeds + blind labels are DETERMINISTIC from card name (recomputable after any reset). Labeling standardized (deterministic) — replaces the old inline random labeler that could desync sheet vs decode.

## C2 A/B #7 (real) — vile_edict (2B Sorcery; forced sacrifice -> grave)
- Valid round (preflight PASS). Control = robed-sorcerer-claims-victim framing; C2 = skeletal-hands-drag-victim-into-grave framing.
- **User gold: reject-all; "none in line with what I want," both branches "roughly similar quality."** => INCONCLUSIVE (no C2 advantage detected on this card). NOTE: subject-prior dominance fought the mechanic in BOTH arms (the "dragged down" beat rarely resolved; rolls collapsed to a creature merely standing in a graveyard).
- C2 tally on user gold (n=7 clean): horned_herald, knight_commander, bindspeaker, old_guardian = **4 C2**; lightning_bolt = **1 control**; dark_ritual, vile_edict = **2 inconclusive**. Hit the n>=7 floor; trend = C2-positive (4 wins, 0 losses to control among decisive cards) but with 2 nulls.

## C2 A/B #8 — prey_upon (1G Sorcery; Fight) [harness-driven, preflight PASS]
- Both arms enacted the fight well (two beasts clashing in forest); the subject-prior trap was largely avoided here by choosing inherently-aggressive subjects (wolf/boar, big cats).
- **User gold: "1.x is better. No keeper, though."** Decode: label 1 = arm_b = **TREATMENT (C2)**. => C2 win (5th decisive), but nothing cleared the keeper bar.
- C2 tally on user gold (decisive-eligible n=8): horned_herald, knight_commander, bindspeaker, old_guardian, prey_upon = **5 C2**; lightning_bolt = **1 control**; dark_ritual, vile_edict = **2 inconclusive**. C2 leads 5-1 among decisive cards, 2 nulls. Past the n>=7 floor; trend clearly C2-positive on the user's eye.

## C2 A/B #9 — gilded_seat (Artifact Land—Plains, taps W) [harness-driven, preflight PASS]
- Low-variance round: both arms converged on "empty gilded throne in a sunlit marble temple, white+gold" (a land's flavor is narrow; both even nominated the same seed). More a feel/quality compare than a mechanic-legibility one.
- **User gold: likes 2.04 "but it's all pretty marginal."** Decode: label 2 = arm_b = **TREATMENT (C2)**. => weak/marginal C2 lean (not decisive).
- C2 tally on user gold: decisive = 5 C2 (horned_herald, knight_commander, bindspeaker, old_guardian, prey_upon) / 1 control (lightning_bolt); marginal C2 lean = gilded_seat; inconclusive = dark_ritual, vile_edict. Trend holds C2-positive. NOTE: still no NEW keeper since old_guardian — the last several cards produced branch-reads but nothing the user would actually ship.

## C2 A/B #10 — centaur_courser (vanilla 3/3) [harness-driven, preflight PASS]
- Interesting shared failure: BOTH arms lost to the "rider-on-a-horse" subject-prior (most cells = human riding a horse, not a fused centaur; a couple = riderless horse). Not a C2-vs-control axis — a skill-content/pixellab gap (cf. C6 base-form-first for hybrids).
- **User gold: "1.05 best, 1.x better overall; no keeper, but that's pixellab's model, not the skill."** Decode: label 1 = arm_a = **CONTROL**. => control win (2nd decisive control win).

## ===== C2 STATS ANALYSIS (n=10, user-gold, judge-free) =====
Tally: C2 decisive=5 (horned_herald, knight_commander, bindspeaker, old_guardian, prey_upon) | C2 marginal=1 (gilded_seat) | control=2 (lightning_bolt-nofig, centaur_courser) | inconclusive=2 (dark_ritual, vile_edict).
SIGN TEST (binomial, null p=0.5): strict decisive 5/7 -> two-tailed p~=0.45; lenient (marginal as C2) 6/8 -> p~=0.29. **Not significant.** Direction favors C2; count alone doesn't prove it. For sign-test p<0.05 need ~8/8, 9/10, 11/13 (~20-25 decisive cards at observed ~70% rate).
QUALITATIVE (stronger than the count):
1. C2 owns ALL the emphatic verdicts ("the one", "clearly better", "not close", "2.07 is the call") + all keeper-grade results. Control's 2 wins are DEFENSIVE wins on DEGENERATE cards: the deliberately-stripped no-figure Lightning Bolt, and the vanilla Centaur where BOTH arms failed the same prior (control merely less-bad). Control has never won a card where C2 had room to reach.
2. Effect appears CONDITIONAL on card richness: C2 ("reach, don't hedge") wins cluster on scene-rich/mechanic-heavy cards; control wins + nulls + marginal cluster on NARROW cards (single icon, vanilla body, land) where there's nothing to reach for and ambition adds clutter. Coherent mechanism.
VERDICT: do NOT bake C2 in yet (clears n>=7 floor but not significance; user rule = "clear data"). Qualitative case good + pointed. Recommended next: test the conditional hypothesis directly by weighting future rolls toward MECHANIC-RICH cards; if C2 keeps winning those, justifies a SCOPED merge (adopt reach-principle, possibly gated to rich cards) over a blanket one. Keeper drought is orthogonal (pixellab ceiling, per user).

## C2 A/B #11 — grave_charm (modal black sorcery: Slay/Wither/Drain) [harness-driven, preflight PASS]
- Both arms chose the UNIFYING read (a skull death-charm channeling necrotic energy) over single-mode; control=amulet-on-chain, C2=skull-in-gaunt-hand.
- User asked to verify proportions (the 2.x branch looked "very impressive — IF the agent wasn't cheating"). **Verified: ALL 20 raw gens are exactly 64x32 native (zero violations), 8x previews exactly 512x256. No resolution cheat** — the detail is genuine native pixflux at 64x32.
- **User gold: "2.10 is the pick."** Decode: label 2 = arm_b = **TREATMENT (C2)**. => C2 win (6th decisive). Saved keeper `grave_charm_2.10_USERPICK-C2_*` (seed 339593589). **First keeper since old_guardian — and it's a C2 roll** (breaks the keeper drought on the treatment side).
- C2 tally (user gold): decisive = **6 C2** (horned_herald, knight_commander, bindspeaker, old_guardian, prey_upon, grave_charm) / **2 control** (lightning_bolt-nofig, centaur_courser); marginal C2 = gilded_seat; inconclusive = dark_ritual, vile_edict. Sign test: decisive 6/8 -> two-tailed p~=0.29; +marginal 7/9 -> p~=0.18. Still not significant, direction still C2.

## C2 A/B #12 — giant_spider (2/4 Reach) [harness-driven, preflight PASS]
- Clear C2 differentiator on mechanic-enactment: Reach = catching a flyer. Control reported 9/10 rolls DROPPED the airborne prey (subject-prior: "spider in forest" beat "spider catching prey"); the C2 same-prompt batch landed the moth/bird far more often (visible on the sheet: branch 2 has prey in most cells, branch 1 only ~1). Same subject-prior trap, C2 prompt resisted it better.
- **User gold: "2.04 is the pick."** Decode: label 2 = arm_b = **TREATMENT (C2)**. => C2 win (7th decisive). Keeper saved `giant_spider_2.04_USERPICK-C2_*` (seed 1591487002). 2nd keeper in a row, both C2.
- C2 tally (user gold): decisive = **7 C2** (horned_herald, knight_commander, bindspeaker, old_guardian, prey_upon, grave_charm, giant_spider) / **2 control** (lightning_bolt-nofig, centaur_courser); marginal C2 = gilded_seat; inconclusive = dark_ritual, vile_edict. Sign test decisive 7/9 -> two-tailed p~=0.18 (one-tailed ~0.09); +marginal 8/10 -> two-tailed p~=0.11. Approaching but not at significance; direction firmly C2.

## C2 A/B #13 — great_stag (vanilla 3/4 Beast) [harness-driven, preflight PASS]
- NOTE: arm_a (control) bailed early on first run (8/10, no BEST/log, malformed report); cleared and re-ran the control arm clean (10/10) before judging. Both arms full.
- Consistent quality both arms (majestic elk/stag in green old-growth). Both even nominated the same seed internally.
- **User gold: "2.10."** Decode: label 2 = arm_b = **TREATMENT (C2)**. => C2 win (8th decisive). Keeper saved `great_stag_2.10_USERPICK-C2_*` (seed 2073324191). 3rd keeper in a row, all C2.
- C2 tally (user gold): decisive = **8 C2** (horned_herald, knight_commander, bindspeaker, old_guardian, prey_upon, grave_charm, giant_spider, great_stag) / **2 control** (lightning_bolt-nofig, centaur_courser); marginal C2 = gilded_seat; inconclusive = dark_ritual, vile_edict. Sign test decisive 8/10 -> two-tailed p~=0.109 (one-tailed ~0.055); +marginal 9/11 -> two-tailed p~=0.065. Closing on significance; direction firmly C2.

## C2 A/B #14 — nature_caller (Elf Druid, ETB tutor = call a wild ally) [harness-driven, preflight PASS]
- Mechanic read well in BOTH arms (druid beckoning + stag answering). Both nominated the same seed internally (gen_06).
- **User gold: "2.10."** Decode: label 2 = arm_a = **CONTROL**. => control win (3rd decisive control win; breaks C2's 4-win streak). Keeper saved `nature_caller_2.10_USERPICK-CONTROL_*` (seed 1032912504).
- C2 tally (user gold): decisive = **8 C2** / **3 control** (lightning_bolt-nofig, centaur_courser, nature_caller); marginal C2 = gilded_seat; inconclusive = dark_ritual, vile_edict. Sign test decisive 8/11 -> two-tailed p~=0.23 (one-tailed ~0.11); +marginal 9/12 -> two-tailed p~=0.15. The added control win pulled significance back. Direction still C2 (8 vs 3) but the gap is not widening monotonically.

## C2 A/B #15 — clockwork_beetle (1/1 Artifact Creature, colorless) [harness-driven, preflight PASS]
- First artifact/colorless card; both arms held metallic-neutral identity (no WUBRG wash), brass beetle w/ gears + wind-up key.
- **User gold: "2.01, easily!"** Decode: label 2 = arm_b = **TREATMENT (C2)**. => C2 win (9th decisive, emphatic). Agent's own BEST nominee = same gen (gen_01). Keeper saved `clockwork_beetle_2.01_USERPICK-C2_*` (seed 1211370075).
- C2 tally (user gold): decisive = **9 C2** / **3 control** (lightning_bolt-nofig, centaur_courser, nature_caller); marginal C2 = gilded_seat; inconclusive = dark_ritual, vile_edict. Sign test decisive 9/12 -> two-tailed p~=0.146 (one-tailed ~0.073); +marginal 10/13 -> two-tailed p~=0.092. Direction firmly C2; significance hovering ~0.07-0.15.
