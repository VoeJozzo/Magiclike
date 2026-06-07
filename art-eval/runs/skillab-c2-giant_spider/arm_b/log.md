# Giant Spider — arm_b log

Skill applied: `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (read in full, first thing this session).

## Card
Giant Spider — Creature — Spider, cost {2}{G}, 2/4, keyword **Reach**. Single green color identity. Defensive ambush body. Source: `reference/html-proto/cards/giant_spider/card.json` (the `art` field 🕷 placeholder ignored per skill).

## Anchor studied
`reference/html-proto/cards/wolfbriar_elemental/art.png` — deep-green forest creature on a full dark-canopy scene, earthy green/brown palette, busy organic foreground. Calibrated my palette and "real forest, not sprite on void" framing to it.

## Mechanic-in-art reasoning (Reach)
Reach = a ground creature that can catch flying things. The art must *enact* that: not a spider posed in a web, but a giant spider actively seizing/snaring a FLYING insect being pulled down out of the air. "Spider in web" is a very strong canonical caption (subject-prior dominance), so the prompt pushes hard on the upward-lunge action and on a specific, recognizable airborne prey to fight the placid prior.

Vocabulary-precision moves: "luna moth" (specific, large, unmistakably-flying insect with a strong training prior) over a vague "bug"; "silk thread from its spinneret" for the snaring line; "side profile" used deliberately for a clean readable silhouette of the seize. Color-identity discipline: chitin specified deep-emerald + umber-brown; background dark green canopy + earthy bark.

## Settings
- image_size: 64x32, no_background: false (background described explicitly in-prompt)
- text_guidance_scale: 8 (skill default; held constant across the whole batch — model cooperated, no need to bump)
- One prompt across all 10 shared seeds (same-prompt variance sample, not seed-locked iteration — the concept landed on the first batch so no per-seed wording changes were warranted)

## Final prompt (identical for all 10 seeds)
> A giant spider with a glossy deep-emerald and umber-brown chitinous carapace and bristled legs, crouched low and lunging upward in side profile, its front legs reaching up to seize a large pale luna moth out of mid-air, a taut silk thread from its spinneret snaring the flying moth and yanking it down, the moth wings beating in panic, partly wrapped in white silk. A heavy web is strung between mossy tree trunks. The background is a deep old-growth forest of dark green canopy and earthy brown bark, dappled green light filtering through the leaves.

## Per-seed notes (judged at 8x upscale)
- gen_01 seed1073995089 — **BEST.** Side-profile lunging spider, correct green/brown chitin, pale winged moth clearly airborne upper-left, web/branch arc frames the two. Reach reads cleanly: ground predator striking at flying prey.
- gen_02 seed1857739480 — clean spider, white bird/moth flying upper-left, but prey small and spider not engaging it; static.
- gen_03 seed2118477731 — good forest depth, small flying insect upper-left, faint; spider front-on, no reach gesture.
- gen_04 seed1591487002 — best moth render (large luna moth upper-right) and a front leg reaching toward it; runner-up. Down-ranked for a blue facial artifact on the spider and a side-by-side (not caught) composition.
- gen_05 seed611966281 — moody, small white moth on a dangling thread left side; spider hunched over a branch, not reaching.
- gen_06 seed1835730842 — gorgeous moth top-right BUT spider is reddish-pink (off the green/brown identity) and not engaging.
- gen_07 seed1041145113 — strong spider, faint flying thing mid-right; reach not legible.
- gen_08 seed1979954025 — dramatic spider, prey weak; teal face cast.
- gen_09 seed588259105 — a visible silk thread runs from the spider up to a flying moth (mechanism literally shown); down-ranked because the spider reads as a static ball, less predatory.
- gen_10 seed1009693740 — reddish spider, no clear airborne prey; off-identity.

## Outcome
BEST = gen_01 (byte-identical copy verified). 10 generations total.
