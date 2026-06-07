# Arm A — Nature Caller (skillab-c2-nature_caller)

Controlled A/B art experiment. Single locked prompt across all 10 shared seeds; seed is the only within-arm variable.

## Skill applied

Read `/home/user/Magiclike/art-eval/variants/SKILL-control.md` in full and applied its discipline:

- **Mechanic-in-art (the hero element).** Card mechanic: on ETB, search library for a creature card and add it to hand — the druid *calls a wild ally out of the forest*. The prompt makes the **calling/beckoning** act and the **beast answering** the subject of the scene, not a druid merely standing. Two distinct subjects with an explicit relationship (caller → answering beast).
- **Multi-subject headcount.** Skill warns the model drops/merges subjects. Prompt names both figures, states both are "fully visible," and sizes them ("druid smaller, the stag larger") so neither is swallowed.
- **Sprite-bias countermeasure.** `no_background:false` plus a discrete background clause ("The background is a dense old-growth forest of dark emerald canopy, mossy bark and dappled green light...") so it renders a forest scene, not a sprite on void.
- **Color-identity discipline.** Single GREEN identity: moss-green robes, antlers, dark emerald canopy, mossy bark, dappled green light — earthy greens/browns throughout.
- **Vocabulary precision.** Specific nouns/materials over adjective-stacking: "moss-green hooded robes," "curved hunting horn," "antlered forest stag," "dark emerald canopy," "mossy bark," "dappled green light." Used "left side profile" deliberately for a clean readable orientation of the caller; left the stag's framing looser.
- **Silhouette test (64×32).** Two-shape read: hooded caller on the left, antlered beast on the right, gap between them carrying the "call across the clearing" tension.
- No banned weak-signal phrases carrying weight (no "dramatic/epic/atmospheric/masterpiece").

## Locked prompt (identical for all 10 seeds)

> A slight elf druid in moss-green hooded robes, antlers woven into his hair, stands in left side profile and raises a curved hunting horn to his lips, his free hand outstretched and beckoning into the trees. Answering his call, a large antlered forest stag steps out of the deep woods on the right, head lowered toward the druid, ferns and brush parting around its legs. Both figures fully visible, the druid smaller, the stag larger. The background is a dense old-growth forest of dark emerald canopy, mossy bark and dappled green light filtering through the leaves.

## Parameters (constant across batch)

- `image_size`: 64×32
- `no_background`: false
- `text_guidance_scale`: 8 (skill default; not adjusted — the model cooperated with the composition, so no need to bump)
- Endpoint: POST `https://api.pixellab.ai/v2/create-image-pixflux`

## Seeds (in order) & per-seed notes

| NN | seed | calling read | both subjects legible | notes |
|----|------|--------------|------------------------|-------|
| 01 | 87067352   | none | stag only | Druid did not render; stag in forest. Fails the calling enactment. |
| 02 | 491373570  | faint | yes (stag dominant) | Druid small left, very large elk swallows center-right; reads as wildlife scene more than a call. |
| 03 | 1555344610 | weak | yes (druid faint) | Small druid left, big antlered stag center; gesture ambiguous. |
| 04 | 35756567   | strong (horn) | yes, well separated | Hooded druid clearly raising horn to face; white-bellied stag stepping toward him on lit path. Bold, clean. Close 2nd. |
| 05 | 1550454658 | none/ambiguous | stag, druid unclear | Foliage figure left is ambiguous as a druid; stag center. Weak. |
| 06 | 1721577159 | **strong (beckoning hand)** | **yes** | **BEST.** Hooded druid, raised open hand beckoning; stag turned head/body toward him, answering. Lush dappled green forest. Clearest call-and-answer of the batch. |
| 07 | 241996515  | weak | stag, druid camouflaged | Mossy figure left reads as foliage, not clearly a druid. |
| 08 | 1139412312 | moderate | yes (stag too far) | Druid reaching left, but stag small/distant — weaker "answering." |
| 09 | 256098439  | weak | druid tiny | Figure barely readable; stag center. |
| 10 | 1032912504 | strong (horn) | yes | Druid with horn raised; pale stag answering against bright clearing/waterfall. Strong, but background reads less "forest." 3rd. |

## Outcome

BEST = gen_06 (seed 1721577159). See RESULT.md for rationale.
