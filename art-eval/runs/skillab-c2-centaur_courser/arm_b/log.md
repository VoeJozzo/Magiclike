# Centaur Courser — arm_b generation log

Skill applied: `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (read in full before any generation).

## Card

- **Centaur Courser** — Creature — Centaur, 3/3, cost {2}{G}.
- **Vanilla** (no abilities). Per the skill's "is this a story-card or a literal-card?" gate: this is a literal-card. With no mechanic to enact, the art's job is a strong, characterful CENTAUR — a half-human/half-horse warrior conveying speed and martial readiness (a "courser" is a swift warhorse). Single GREEN color identity → wild nature, forest/plains edge, earthy greens and browns. A real outdoor scene, not a sprite on void (`no_background:false` + an explicit background clause).

## Anchor study

Studied `reference/html-proto/cards/wolfbriar_elemental/art.png` (green creature) for set vocabulary: creature embedded in a lush, real forest scene; earthy greens/browns; opaque scene rather than a sprite on negative space. Calibrated the background clause and color palette to that.

## Prompt (used for ALL 10 seeds — fixed across the batch for the A/B)

> A muscular centaur warrior, half-human and half-horse, with sun-bronzed human torso and a chestnut-brown horse body, galloping at full charge in side profile facing east across an open grassy plain. He grips a long wooden spear leveled forward, dark hair and tail streaming back in the wind, hooves kicking up dust and torn grass. The background is a sunlit green meadow at the edge of a dense forest, distant trees and rolling hills under a pale sky.

Structure follows the skill's four-beat template:
1. **Subject** with specific material + color — "sun-bronzed human torso," "chestnut-brown horse body."
2. **Pose / action** with explicit direction — "galloping at full charge in side profile facing east." ("side profile" chosen deliberately for a clean, readable charge silhouette at 64×32.)
3. **Immediate context** — spear leveled forward (martial readiness), hair/tail streaming, hooves kicking up dust and torn grass (speed beat).
4. **Background** as a discrete clause — "The background is a sunlit green meadow at the edge of a dense forest..." (carries the single-green identity and defeats the sprite-on-void pull).

No banned weak-signal phrases carry weight; color-identity discipline = single green (meadow, forest, earthy browns).

## Parameters

- `image_size`: 64×32 (non-negotiable per skill / card-frame requirement)
- `no_background`: false
- `text_guidance_scale`: **8** (default; held constant across the whole batch — the prompt is one the model cooperates with, so no reason to bump)
- `seed`: the 10 shared seeds from `seeds.json`, in order.

## Per-seed notes (judged by eye on 8× upscales)

| gen | seed | read |
|---|---|---|
| 01 | 388748323 | Spear raised high overhead, dynamic; clearly a mounted rider. |
| 02 | 1439044430 | Clean rider, spear leveled; visible straddle — reads as horseman, not fused centaur. |
| 03 | 1546055264 | Three-quarter-ish, spear leveled; decent charge, rider read. |
| 04 | 1069230523 | Rider, spear forward, good green field; horseman read. |
| 05 | 250858960 | Rider over rocky meadow; horse+rider separation prominent. |
| 06 | 1203968257 | **Riderless horse** — torso/spear dropped entirely. Weakest on flavor. |
| 07 | 422016864 | Spear leveled forward, lush green hedge backdrop; strong charge, rider read. |
| 08 | 403215733 | Bare-torso rider, dust kick, good speed; straddle visible. |
| 09 | 820296959 | Spear leveled, dust plume, forest-edge meadow; strong, slight rider read. |
| 10 | 1187260955 | **Best.** Torso sits low/fused to the horse's shoulders, minimal saddle-straddle gap; spear leveled forward (martial-ready); rearing charge with dust kick; full green-meadow-and-forest setting; earthy chestnut body. Reads closest to a single fused centaur. |

## How the skill shaped the run

- **Story-vs-literal gate** → treated as a literal-card; art job = a strong characterful centaur, not forced narrative.
- **Mechanic-in-art** → no mechanic, so "courser = swift warhorse" became the hero: charge pose + leveled spear + speed cues (streaming hair/tail, dust, torn grass).
- **Silhouette test (64×32)** → single readable shape = "a charging quadruped with a spear-arm reaching forward," reinforced by "side profile."
- **Color-identity discipline** → single green via the background meadow/forest clause and earthy-brown body; no off-color elements.
- **Sprite-bias defense** → explicit background clause so the model paints a scene, not a sprite on void.
- **Subject-prior dominance (observed)** → the model's "rider on horse" prior repeatedly beat "centaur" (a fused half-human/half-horse body). Per the skill, the next escalation would be the blunt lever (recompose / change camera, or restructure the subject phrasing so the torso fuses to the withers). For this controlled A/B the prompt is held fixed across all seeds, so I selected the seed where the prior leaked least (gen_10) rather than changing wording mid-batch.
