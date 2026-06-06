# Prodigal Sorcerer — arm_a generation log

## Card
- **Prodigal Sorcerer** — Creature — Human Wizard, 1/1, cost {2}{U} (2 generic + 1 blue)
- Ability: **Tap: deal 1 damage to any target.** The classic "pinger."
- Card json: `reference/html-proto/cards/prodigal_sorcerer/card.json` (read in full).

## How I applied the skill

**Mechanic-in-art gate.** "What does this card literally do, and how do we show it happening?" It pings — deals exactly *1* damage to *any* target. The discipline here is that the art must read as a **thin, precise zap**, not a fireball/area blast. So the hero element is a single hairline filament of energy leaping from the wizard's fingertip to *one tiny target* — making "1 damage to any target" legible as a precise single hit rather than destruction.

**Color-identity discipline.** Blue card -> cerulean robe + blue-white arc-electricity spark. Deliberately avoided any red/fire vocabulary so the zap reads as arcane crackle, not burn.

**Vocabulary precision.** For the "thin precise zap" I avoided compositional description and reached for narrow nouns: "thin hairline filament of crackling blue-white arc-electricity," "precise hairline spark." For the tiny target I used a concrete object — "a tiny fluttering moth in mid-air" — so the model has a small, specific thing to aim at (a single small victim = 1 damage), rather than vague "a target."

**Subject prior.** "Wizard" is freely posable in the model's prior (unlike a placid-animal subject), so no subject swap needed — direct pose direction works: side profile, finger extended and pointing.

**Scene, not sprite.** PixelLab is sprite-biased even with `no_background:false`, so I described the surroundings explicitly: "dim stone wizard's study with shelves of books and a small arched window at dusk," plus a named light source ("the faint blue spark is the only bright light").

**Anchors studied (phase 2).** `archmage_of_veils/art.png` (blue-robed wizard, dark arcane chamber, painterly pixel style) and the existing `prodigal_sorcerer/art.png` (robed figure, scene with real background). Calibrated to the set's blue-wizard vocabulary; did NOT touch either reference file.

## Prompt (single locked prompt, used across all 10 seeds)

> A slight, frail elderly human wizard in a worn cerulean-blue robe and pointed hood, standing in a quiet side profile facing east, one bony index finger extended and pointing. A single thin hairline filament of crackling blue-white arc-electricity, a precise hairline spark, leaps from his fingertip and zaps a tiny fluttering moth in mid-air, scorching it. The faint blue spark is the only bright light in the scene. The background is a dim stone wizard's study with shelves of books and a small arched window at dusk.

Structure: subject (material+color) -> pose/direction -> immediate context (the mechanic: thin spark zapping one tiny target) -> background clause.

## Settings
- `text_guidance_scale`: **8** (default; kept constant across the whole batch — the prompt cooperated with the model, no fighting that would call for a bump or for vocabulary surgery mid-batch).
- `image_size`: 64x32, `no_background`: false, one generation per shared seed.

## Per-seed notes (judged at 8x upscale)
| gen | seed | read |
|---|---|---|
| 01 | 2081743954 | **BEST.** Hooded blue wizard, dynamic pose; thin blue spark from fingertip arcing up to a tiny moth top-of-frame. Full study + window bg. Clear pinger reading, best composition. |
| 02 | 1404318669 | Good. Wizard firing a thin blue spark stream toward a small moth by the window. Slightly busier; spark a touch thick. |
| 03 | 275511238 | Great character face, but spark is a thick lightning bolt (reads fireball-ish) and not clearly fingertip->target. Off-mechanic. |
| 04 | 885017359 | Frail bearded wizard, finger pointing; spark faint and target unclear. |
| 05 | 27540181 | Clean side profile; blue spark from wand/fingertip to a small scorched target. Solid, legible. |
| 06 | 1949281671 | Wizard zapping a framed picture/window; broad spark spray, less "precise single zap." |
| 07 | 1490358702 | Wizard + thin spark from wand, but spark dissipates into smoke; target ambiguous. |
| 08 | 1650021461 | Spark beam to window, small red target top; decent but beam-like not hairline. |
| 09 | 1223446650 | Wizard mostly idle; the zap is on a framed moth across the room, weak connection to his hand. Lowest mechanic legibility. |
| 10 | 1440338115 | Frail blue wizard, finger extended, thin blue arc-spark rising. Clean classic pinger pose; strong runner-up. |

## Output
10 raw 64x32 PNGs + 10 8x upscales. BEST.png = exact bytes of gen_01_seed2081743954.png.
