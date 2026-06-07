# Prey Upon — arm_a generation log

Skill file read in full at the exact path: `/home/user/Magiclike/art-eval/variants/SKILL-control.md` (this is the `magiclike-card-art` skill content). Discipline applied below.

## Card
- **Prey Upon** — Sorcery, cost {G} (single green).
- card.json (`reference/html-proto/cards/prey_upon/card.json`): one `fight` effect, operands slot 0 (your creature, `controller: self`) and slot 1 (enemy creature, `controller: opp`). Two `target_slots`, both `creature`.
- Mechanic-in-art read: **Fight = mutual, simultaneous clash between two creatures.** The art must enact a FIGHT BETWEEN TWO BEASTS (each attacking the other), not a single standing creature, not a bolt, not a hunter with a weapon. Ignored the `art` emoji placeholder (🐅) per skill.

## Anchors studied
- `reference/html-proto/cards/wolfbriar_elemental/art.png` and `feral_stalker/art.png` — the set's green vocabulary is dense ferns, moss-covered trunks, deep-emerald foliage, earthy fang-and-claw subjects. Calibrated the background clause to match (deep-green old-growth forest, ferns, moss).

## Skill discipline applied
- **Mechanic-enactment** is the lens: the whole scene IS the fight, two animals mid-clash.
- **Multi-subject headcount** (the skill's explicit rule for 2+ figures): prompt names exactly two beasts and demands "both animals fully visible and the same size" so the model can't drop/merge a subject or let one dominate.
- **Scene-not-sprite**: explicit background clause ("The background is a dense deep-green old-growth forest of ferns and moss-covered trunks") so `no_background:false` actually yields an opaque scene rather than a sprite on negative space.
- **Color identity**: single green — tawny brown wolf + tusked grey-green boar against deep-green forest; earthy greens/browns only.
- **Subject choice**: two real animals (wolf, boar) whose canonical priors already contain lunging/aggression — avoids the "placid deer won't gore" subject-prior trap; these subjects fight readily in the model's prior.
- **Precise nouns / body-language verbs**: "lunging," "colliding head-on," "jaws snapping," "claws raking," "rearing into each other," "mid-clash" — named poses for silhouette legibility rather than compositional hand-waving. No banned weak-signal phrases carrying weight.
- **Consistency across the A/B batch**: same prompt + same `text_guidance_scale` across all 10 seeds (this is a seed-shared experiment arm; holding the prompt constant is the right move so seeds are the only variable).

## Prompt (used for all 10 seeds, verbatim)
> Two wild beasts locked in a violent fight, a tawny brown wolf and a tusked grey-green boar, lunging at each other and colliding head-on in the center, jaws snapping, claws raking, fur flying, both animals fully visible and the same size, mid-clash and rearing into each other. The background is a dense deep-green old-growth forest of ferns and moss-covered trunks.

## Settings
- `image_size`: 64x32 (non-negotiable per skill)
- `no_background`: false
- `text_guidance_scale`: 8 (default; kept constant across the batch — prompt is cooperating, no reason to bump)
- seeds: from `seeds.json`, in order, one per gen.

## Per-seed notes (judged on 8x upscales)
| gen | seed | read |
|---|---|---|
| 01 | 1397419063 | Two beasts facing off across center, magenta impact spark at midline; clear confrontation, slightly static. |
| 02 | 1589384546 | Wolf vs grey beast facing, lunging; reads as confrontation, a touch more "facing" than "locked". |
| 03 | 429385119 | Two beasts low and snapping at the midline; good clash, impact spark center. |
| 04 | 1406099565 | Wolf vs boar charging into each other; kinetic, strong. |
| 05 | 1097390204 | Wolf lunging, boar charging with open red-eyed maw; very dynamic mutual lunge. Strong runner-up. |
| 06 | 388025702 | Two large beasts head-to-head with bright impact flash between jaws; strong clash. |
| 07 | 356870839 | **BEST.** Two beasts head-to-head at the midline, both snarling, bared teeth, red eyes, symmetrical mutual lunge — clearest "each attacking the other." |
| 08 | 1364876817 | Lion-like vs grey beast facing in a lush arch; clear but more facing-off. |
| 09 | 1738837013 | Russet wolf vs dark wolf snarling head-to-head, kinetic charge; strong. |
| 10 | 1599731972 | Tan vs dark beast clashing at center, teeth bared; good. |

All 10 satisfy the mechanic-enactment criterion (two creatures, a fight). None drifted to a single creature, a spell bolt, or a hunter — the headcount + clash wording held across every seed.

## Nominee
BEST = `gen_07_seed356870839.png` (copied byte-identical to `BEST.png`).
