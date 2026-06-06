# Vile Edict — arm_a generation log

Card: **Vile Edict** — 2 black, Sorcery (black). `target: opp`; effects = `chooses(permanent)` → `annihilate` → `rip`.
The mechanic: a forced-sacrifice **edict**. The opponent is *compelled to give up one of their own permanents*, which is then destroyed and ripped to the graveyard by black magic. Flavor = dark compulsion / cruel decree — NOT a duel, NOT a fireball.

## How I applied the skill

- **Card lookup (phase 1):** read the full `card.json`. The effects array literally encodes the flavor (`chooses` = victim forced to pick, `annihilate` = destroyed, `rip` = dragged to grave). Ignored the `🩸` placeholder emoji per skill.
- **Anchors studied (phase 2):** `doom_blade` (viewed art.png — victim-camera, obsidian-void-energy *as* the effect) and exemplar prompts for `diabolic_edict` (none existed), `plague_sower`, `phylactery`, `smite_the_wicked` for black/decay color vocabulary.
- **Mechanic-enactment lens:** the art must read as *a creature being claimed/dragged down by a vile decree while its owner is forced to surrender it* — the `chooses`+`rip` pair. Not the caster picking; the opponent gives one up.
- **Color-identity discipline:** single black identity → sickly green-black decay light, bone, dead roots, graveyard swamp.
- **Lever ladder (vocabulary → recompose → swap subject):** prompt A kept being read by the model as a sorcerer *casting at* a beast (the standing-two-figures prior = a duel), with the "dragged downward into a grave" never rendering. Per the skill I escalated from words to **recompose the camera onto the victim** (prompt B) — making the downward-drag and grasping claws the dominant shape, owner demoted to a recoiling background silhouette.

## Prompts

`text_guidance_scale: 8` for all gens (default; these are cooperative scenes, not a shape the model fights — per skill, don't bump guidance to force a resisted composition). `no_background: false`, `image_size: 64x32`.

**Prompt A** (gens 01–06, 10):
> A robed sorcerer in tattered black-and-sickly-green robes recoils backward in horror, forced to give up one of his own creatures: a horned beast beside him is seized by skeletal claws and grasping black tendrils of necrotic magic erupting from the cracked earth, dragging the shrieking beast downward into an open grave. Sickly green-black decay light, bone fragments and dead roots. The background is a fog-shrouded graveyard swamp under a dark sky.

**Prompt B** (gens 07–09) — recomposed, camera on the victim:
> A horned beast in the center is hauled downward into an open grave by a dozen grasping black skeletal hands and bony claws erupting from the cracked earth, its head thrown back and mouth agape, legs splayed as it is dragged under, wreathed in sickly green necrotic light. Behind it a small hooded figure in tattered black robes throws up an arm and recoils, forced to surrender it. Bone fragments, dead roots, scattered grave dirt. The background is a fog-shrouded graveyard swamp under a dark sky.

## Per-seed notes

| gen | seed | prompt | read |
|----|------|--------|------|
| 01 | 1188665106 | A | Hooded figure + small dark beast at right by green flame. Reads as duel, drag absent. |
| 02 | 1688004711 | A | Sorcerer recoiling, arm/hand raised; horned beast separate in dark with grasping silhouettes. Decent "recoil + creature" beat. |
| 03 | 404647802  | A | Lone caster in a cave gesturing at a green-lit grave/altar at right. No owner-surrender read. |
| 04 | 2065043045 | A | Hooded figure walking toward a dark beast; green ground glow. Duel framing. |
| 05 | 1028306224 | A | Tall sorcerer + dark beast at left over a green geyser. Atmospheric, drag absent. |
| 06 | 1779909123 | A | Hooded figure + a pale bony grave-tree erupting in white/green light. Eerie but no clear victim. |
| 07 | 206873136  | B | Centered horned demon, symmetric, emerging from green light. "Horned beast" prior took over; no drag/owner. |
| 08 | 1870015909 | B | **Hooded owner-figure at left + large horned beast at right being grasped by green claws from below.** Two distinct figures, clear owner+creature relationship, the creature being seized. Best forced-surrender read. |
| 09 | 1249784105 | B | Centered horned demon rising from green fire; atmospheric, no victim/drag. |
| 10 | 1584918067 | A | Lone hooded sorcerer over green grave-light, no second figure. |

**Pattern observed:** the model's strong prior for "robed figure + creature standing apart" repeatedly resolved to a *duel/summon*, and the "horned beast" token under prompt B drifted toward a centered *demon-emerging* composition. The single frame that held both an **owner** and a **creature being claimed** is gen_08.

Total gens produced: 10 (full seed coverage).
