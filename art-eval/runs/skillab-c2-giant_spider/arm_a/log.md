# Giant Spider — arm_a generation log

Skill applied: `/home/user/Magiclike/art-eval/variants/SKILL-control.md` (read in full at that exact path).
API: pixflux `POST /v2/create-image-pixflux`, `image_size 64x32`, `no_background: false`.

## Card
- Giant Spider — Creature — Spider, cost {2}{G}, 2/4, keyword **Reach**.
- Mechanic-in-art target: Reach = catch/block FLYING prey. Per the skill, Flying is the strong
  literal-depiction exception, so the airborne victim must read as airborne. The art must show the
  spider's web/legs SEIZING a flying creature and dragging it down — not a spider merely sitting.

## Anchors studied (calibration, not imitation)
- `reference/html-proto/cards/wolfbriar_elemental/art.png` and `feral_stalker/art.png`:
  full-frame forest scene, subject occupying most of the frame, dense green canopy background,
  earthy green/brown palette, strong central silhouette. Single-green identity.

## Direction chosen (committed; automated A/B run, no interactive director step)
Spider lunging in its orb web to seize an airborne moth tangled in silk — web + legs dragging
flying prey down. Silhouette: large radial spider mass + smaller broad-winged moth above/beside it.
Moth chosen over bird: broad wings survive 64x32 legibility better than a thin bird (subject-prior /
legibility reasoning from the skill).

## Prompt (identical across all 10 seeds — variance sample)
> A massive forest spider with a bristly dark-green and brown chitinous body and long jointed legs
> splayed wide in an orb web, lunging upward to seize a large pale moth tangled in its silk. The
> moth's broad wings are caught and folding as the spider's front legs and a strand of web drag the
> airborne prey down toward its fangs. The background is a deep old-growth forest of mossy trunks and
> shadowed green canopy, dim light filtering through the leaves.

- `text_guidance_scale`: 8 (default; held constant across the whole batch). Not bumped — the skill
  warns guidance amplifies what the model is already inclined to do and does not force a composition
  it resists; for a fixed-seed variance sweep the right move is to hold tgs and sample, not crank it.
- `no_background`: false (opaque); scene described positively in-prompt (forest background clause).

## Per-seed notes (judged on 8x upscales, by eye)
| gen | seed | reads as | Reach (airborne prey)? |
|---|---|---|---|
| 01 | 1073995089 | strong spider, forest, vine-ring framing | no prey |
| 02 | 1857739480 | brown spider, forest, good silhouette | no prey |
| 03 | 2118477731 | spider front-on, mossy trunk | no prey |
| 04 | 1591487002 | tan spider three-quarter, lush | no prey |
| 05 | 611966281 | dark spider, vine arch | no prey |
| 06 | 1835730842 | spider + clear broad-winged moth airborne upper-right, front legs reaching to it | YES — only frame that enacts Reach |
| 07 | 1041145113 | brown spider, dense forest | no prey |
| 08 | 1979954025 | spider in bright canopy gap | no prey |
| 09 | 588259105 | orange spider, faint white wisp top-center | ambiguous wisp, not legible prey |
| 10 | 1009693740 | classic spider between two trunks | no prey |

## How the skill drove the run
- Mechanic-in-art gate: required the prey to be present and airborne (Flying-exception logic).
- Vocabulary precision: "moth / broad wings" over generic "flying creature"; "chitinous", "orb web",
  "spinneret silk" as narrow nouns.
- Subject-prior dominance observed live: the "spider in a forest" caption prior is overwhelming —
  9/10 seeds dropped the prey entirely despite it being named with action. This is exactly the
  subject-prior failure the skill describes. The fine lever (precise nouns) was already in the prompt;
  escalating would mean recompose/foreground the moth or shrink the spider — but as a fixed-seed A/B
  the prompt is held constant by contract, so the win is the one seed (06) where the model cooperated.
- Color-identity discipline: single green — deep forest, chitin, earthy green/brown — held in all 10.
- Surfaced all 10, benched none.
