# C6 art-skill A/B — results ledger

Candidate **c6** = SKILL-control + the *"Explore wide — breadth over depth; don't converge early"* block
(spend the generation budget on genuinely distinct takes — fresh seeds, different compositions/framing/beat —
instead of finding one decent roll early and refining it; only tighten one direction at the very end).
Reviewer: the user, blind to arm identity. Reviewed via the applet (same structure as C4/C5). Verdicts: `verdicts_c6.json`.
arm_a = CONTROL, arm_b = TREATMENT (breadth) throughout; mapping recomputable via `harness.py decode`.

## Headline (n=20)

**Pool-quality vote** (which arm's overall spread the director judged better):
- TREATMENT (c6 breadth) better: **14**
- CONTROL better: **3**
- tie: **1**
- no pool call (keeper only): **2** (plains, razor_beacon)

Decisive **14 T / 3 C** (n=17), two-sided sign-test p = **0.013** vs 50/50 — **a real, significant edge to breadth.**
This is the **first agent-solo skill block to beat control** on the pool-quality metric (C4 and C5 were both null; C2 won earlier and was adopted).

**Keeper-frame provenance** (which arm the director's single chosen keeper came from):
- TREATMENT: **13**
- CONTROL: **7**

n=20, two-sided sign-test p = **0.263** — **not significant.** Same direction as the pool vote, but the effect does not carry through to the single best shippable frame.

## Manipulation check (did the instruction actually change behavior?)

Yes, clearly:
- distinct seeds/card: CONTROL **5.10** vs TREATMENT **7.40**
- fresh-seed ratio (distinct seeds ÷ frames): CONTROL **0.68** vs TREATMENT **0.93** — control seed-locks-and-tweaks ~1/3 of its frames (depth); treatment almost always pulls a fresh seed (breadth).

Frame counts were near-balanced (CONTROL 7.45/card, TREATMENT 7.95/card — a mild ~7% edge to treatment), so the 14–3 pool result is **not** explained by treatment simply showing more frames.

## Verdict

C6 (breadth-over-depth) **wins on spread quality** (p=0.013) but **not on the keeper** (13/7, n.s.). The honest reading: breadth reliably produces a **richer, more varied menu** for the director — which reads as "the better pool" — but it does **not** significantly raise the ceiling on the single best frame we actually ship (a deep-refinement run still lands the best frame about as often). It is a *gestalt/mean* effect, not a *max* effect.

**Caveats (kept honest):**
- Mild frame-count imbalance (7.95 vs 7.45/card) — small, not enough to drive 14–3, but present.
- Multiple comparisons across the C2–C6 program (~5 candidates × ~2 metrics): an uncorrected p=0.013 would **not** survive a strict Bonferroni threshold (~0.005 at 10 tests). Treat as suggestive-strong, not bulletproof.

**Recommendation (user's call):** breadth is cheap and low-risk and gives the director a better menu, so it's reasonable to adopt as a **default exploration posture** — but framed as "explore wide by default," not as a quality lever on par with C2. It complements the human-in-the-loop; it does not substitute for direction.

## Per-card results (pool vote → keeper provenance)

| card | pool winner | keeper | keeper from |
|---|---|---|---|
| arcane_denial | TREATMENT | 2.07 | TREATMENT |
| blood_priest | TREATMENT | 1.07 | TREATMENT |
| city_guardian | TREATMENT | 2.05 | TREATMENT |
| copper_golem | TREATMENT | 1.06 | TREATMENT |
| counterspell | TREATMENT | 2.06 | CONTROL |
| day_of_reckoning | CONTROL | 2.07 | CONTROL |
| flame_summoner | TREATMENT | 2.02 | TREATMENT |
| frostbite_mage | TREATMENT | 1.04 | TREATMENT |
| gray_ogre | TREATMENT | 1.04 | TREATMENT |
| healing_light | TREATMENT | 1.05 | CONTROL |
| patient_saint | TREATMENT | 1.03 | CONTROL |
| phantom_warrior | CONTROL | 1.01 | TREATMENT |
| plains | (none) | 2.02 | CONTROL |
| prey_upon | CONTROL | 2.04 | CONTROL |
| razor_beacon | (none) | 1.04 | CONTROL |
| roots_and_branches | tie | 2.05 | TREATMENT |
| shadow_assassin | TREATMENT | 2.04 | TREATMENT |
| steel_initiate | TREATMENT | 1.06 | TREATMENT |
| war_horde | TREATMENT | 1.03 | TREATMENT |
| wash_away | TREATMENT | 2.08 | TREATMENT |

## Keepers placed

All 20 primary keepers copied to `reference/html-proto/cards/<tpl>/art.png`.
Plains (basic land, Mountain precedent): primary art = label 2.02; four liked alternates (1.03, 1.04, 1.06, 1.08)
parked in `reference/html-proto/cards/plains/alts/` with a seed+prompt README (not wired in; swap-in candidates).
