# Veil of Mists — arm_a generation log

Controlled A/B art run (control skill arm). Single locked prompt across all 10 shared seeds; seed is the only within-arm variable.

## Card
- **Name:** Veil of Mists
- **Cost:** 1 blue (U) + 1 generic (C); **Flash**
- **Type:** Sorcery (blue)
- **Mechanic:** bounce — return target creature to its owner's hand (`affect_creature` / severity `bounce`).
- **Flavor target:** the targeted creature is swallowed by a concealing veil of mist and *vanishes* — swept away / dematerializing / fading out — removed from the field. NOT a creature merely standing in fog; NOT a kill/damage effect.

## Skill applied
Read `/home/user/Magiclike/art-eval/variants/SKILL-control.md` in full (control skill: the full magiclike-card-art discipline).
Discipline applied to the locked prompt:
- **Mechanic-in-art:** the art enacts bounce by showing the creature itself *dissolving and being swept sideways out of frame into the mist*, half-vanished — the disappearance is the subject, not decoration.
- **Vocabulary precision:** precise vanishing verbs ("dissolving", "dematerializing", "dispersed into mist", "wispy tendrils", "swept sideways out of frame") over a vague "in fog"; precise color nouns (cerulean, white-grey, pale teal) over bare "blue".
- **Color identity:** single blue — cool blues, white-grey mist, pale teal highlights mapped to the U/C cost.
- **Scene not sprite:** background named as a discrete clause (dim stone battlefield at dusk swallowed by rolling mist), `no_background:false`, to avoid pixflux's sprite-on-void bias.
- **Anchor:** blue spell set (unsummon = the existing bounce card; studious_research for blue-spell palette calibration).

## Parameters (constant across batch)
- `image_size`: 64x32
- `no_background`: false
- `text_guidance_scale`: 8
- endpoint: POST https://api.pixellab.ai/v2/create-image-pixflux

## Locked prompt (identical for all 10 seeds)
> A lone armored warrior dissolving and fading away into a rolling veil of pale blue-white fog, his body half-vanished -- the lower half already dispersed into cerulean mist and wispy tendrils that sweep him sideways out of frame, the upper half translucent and dematerializing, mouth agape as he is swept away. Cool blues, white-grey mist, pale teal highlights. The background is a dim stone battlefield at dusk swallowed by rolling mist and fog.

## Per-seed notes (judged at 8x upscale, whole-image gestalt)
| Gen | Seed | Read |
|-----|------|------|
| 01 | 112899676 | Warrior striding through mist; body fully solid. Atmosphere good, no vanishing — reads "standing in fog". |
| 02 | 38914719 | Solid cloaked figure on a misty ridge; no dissolution. Mechanic absent. |
| 03 | 37229370 | Caped warrior standing, sky/fog backdrop; fully solid. Mechanic absent. |
| 04 | 1820118767 | Cloaked figure heavily shrouded, half-lost in fog; reads "shrouded/standing" more than "dispersing". Partial. |
| 05 | 972161303 | Solid armored warrior with sword, drawn; no vanishing. Mechanic absent. |
| 06 | 1358362476 | Form breaking apart into mist (strong dissolution) but barely reads as a creature — too abstract. |
| 07 | 298837792 | Solid armored figure standing; no dissolution. Mechanic absent. |
| 08 | 1995474687 | **BEST.** Figure's lower body + trailing edge clearly dissolve into a horizontal sweep of pale mist trailing leftward; body translucent and breaking up, carried sideways. Reads as "swept away / dematerializing", not "standing in fog". |
| 09 | 1989167410 | Misty sweep at the base, teal highlights, but body mostly solid/standing. Partial. |
| 10 | 1178955015 | Solid caped warrior standing in blue haze; no vanishing. Mechanic absent. |

## Outcome
BEST = gen_08 (seed 1995474687). See RESULT.md.
