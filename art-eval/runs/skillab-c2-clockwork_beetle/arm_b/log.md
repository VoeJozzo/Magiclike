# Clockwork Beetle — arm_b generation log

## Skill
Read in full at `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (the magiclike-card-art discipline). Applied: mechanic-in-art lens, specific-noun vocabulary, subject/pose/context/background prompt structure, scene (not sprite-on-void) discipline, color-identity discipline (colorless/artifact = metallic neutrals, no WUBRG wash).

## Card
- **Clockwork Beetle** — Artifact Creature — Insect, cost {1}, 1/1, no keywords.
- A vanilla artifact creature. Mechanic-in-art job: make it read as a MECHANICAL/clockwork automaton built of metal (brass, copper, exposed gears, rivets, jointed legs, wind-up key) — an artifact, not an organic bug. Colorless identity: metallic neutrals only.

## Anchor study
No artifact-card `art.png` exists in the set (alloy_myr / copper_golem / golem_forge are data-only). Calibrated to set style on `goblin_piercer/art.png` (small-creature, warm-lit, full-scene framing) plus the first roll's upscale.

## Settings (locked across all 10 seeds)
- endpoint: `POST /v2/create-image-pixflux`
- image_size: 64x32
- no_background: false
- text_guidance_scale: 8
- seeds (in order): 1211370075, 448769573, 608752310, 802200393, 1668146355, 1969871289, 25264125, 2091708154, 1082614233, 1013567519

## Locked prompt (single, identical for all 10 seeds)
A small clockwork wind-up beetle automaton built of riveted brass and copper plates, with exposed brass cogs and gears turning inside its open thorax, jointed metal legs, and a spiral wind-up key protruding from its back. The mechanical beetle stands in three-quarter view on a wooden workshop bench, its bronze carapace catching warm light, oxidized verdigris patina on the edges. The background is a cluttered tinkerer's workbench with tiny scattered gears, a brass screwdriver, and a stone wall behind, lit by a warm workshop lantern.

### Why this prompt (skill application)
- **Subject = material + color**: "riveted brass and copper plates," "bronze carapace," "oxidized verdigris patina" — enacts the colorless/artifact identity in metallic neutrals, no WUBRG wash.
- **Mechanic-in-art**: "exposed brass cogs and gears turning inside its open thorax" + "spiral wind-up key" + "jointed metal legs" — the automaton mechanism is visible, so it reads as an artifact, not an organic insect.
- **Pose/direction**: "three-quarter view" for a readable six-legged silhouette at 64x32.
- **Context + background as a discrete clause** ("The background is a cluttered tinkerer's workbench..."): forces a real setting (workshop bench, scattered gears, stone wall, warm lantern) so pixflux's sprite-bias doesn't drop the beetle onto void.

## Per-seed notes (judged on 8x upscales)
- **01 / 1211370075** — BEST. Clean three-quarter beetle; brass body, verdigris/teal carapace, six jointed metal legs clearly separated; lantern + scattered gears bench behind. Best whole-image gestalt.
- **02 / 448769573** — Strong brass beetle, prominent lantern at left; legs read but body a touch flatter/less domed.
- **03 / 608752310** — Verdigris-domed shell, brass legs, lit window behind; slightly darker/busier, beetle sits lower.
- **04 / 802200393** — Excellent runner-up: riveted domed carapace with seam, glowing red eye, lantern left, gears on bench. Reads very mechanical; carapace a touch smooth-dome vs exposed-gear.
- **05 / 1668146355** — Beetle on anvil-like bench; good metal but smaller in frame, legs a little mushy.
- **06 / 1969871289** — Bulky brass beetle, warm lantern; body slightly amorphous, legs less crisp.
- **07 / 25264125** — Glossy brass beetle, strong lantern glow at right; legs slightly soft.
- **08 / 2091708154** — Clean side profile, good legs; body a plain brass dome — least exposed-gear character.
- **09 / 1082614233** — Dynamic verdigris-shell beetle; an orange UI-ish "5" glyph artifact in the corner docks it slightly.
- **10 / 1013567519** — Verdigris dome + brass legs, lantern; solid but darker and a bit busier.

## Outcome
All 10 read as mechanical brass/copper clockwork beetles on a workshop bench — artifact identity landed across the whole batch, no organic-bug or color-wash failures. BEST = gen_01.
