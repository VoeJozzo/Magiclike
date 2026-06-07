# Centaur Courser — arm_a generation log

Skill applied: read `/home/user/Magiclike/art-eval/variants/SKILL-control.md` in full (the
magiclike-card-art discipline). Card json read: `reference/html-proto/cards/centaur_courser/card.json`
— vanilla 3/3 Creature — Centaur, single green (cost G1 + C2), no abilities, no flavor text.

## Card analysis (phase 1)
This is a **literal card, not a story card** — a vanilla 3/3 with no mechanic to enact. Per the
skill, vanilla creatures get literal art whose job is a strong, characterful subject. The art's
job is therefore: an unambiguous **centaur** (half-human / half-horse), athletic and mid-tier
martial. "Courser" = a swift warhorse, so the character note is **speed + martial readiness** →
a full-gallop charge with a leveled spear. Single green identity → wild nature, earthy
greens/browns, a real outdoor forest-into-plains setting (not a sprite on void).

## Anchor calibration (phase 2)
Studied the existing green-creature set vocabulary (wolfbriar_elemental and the forest/plains
palette) — earthy browns, sun-dappled canopy greens, opaque scene backgrounds. Reused that
register in the background clause.

## Prompt construction & the subject-prior problem
First-pass prompt ("A muscular centaur warrior with a chestnut-brown horse body and a
bare-chested human torso...") produced clean scenes and a great palette but **failed the
centaur-fusion test**: the model's overwhelming "rider on a horse" prior rendered a separate
human seated atop a complete saddled horse, not a fused centaur (and one roll dropped the human
entirely). This is exactly the skill's *subject-prior dominance* failure mode.

Per the skill ladder (precise vocabulary → recompose → swap subject), I applied the **fine
lever first**: rewrote the subject beat with precise anatomical-fusion vocabulary — the human
torso "rises directly out of the shoulders of a chestnut-brown horse body, fused at the
withers with no saddle and no rider, the human waist seamlessly becoming the horse's chest."
Kept the strong background/palette wording verbatim (pre-validated). Did NOT bump
text_guidance_scale (the model is following the prompt; the issue is prior strength, which
guidance amplifies rather than fixes — per the skill's guidance-vs-vocabulary note). Left at 8.

The precise-vocab fix moved the needle partway (gens 04, 07 integrate the torso much lower and
seam more cleanly) but did not fully defeat the rider prior on every seed — consistent with the
skill's note that for a strong-prior subject, words alone may not be enough. A future blunter
lever would be a tighter side-on profile crop on the join, or compositing/inpainting the seam.

## Final prompt (used for all 10 seeds)
> A centaur: a single creature whose bare-chested, muscular human torso rises directly out of
> the shoulders of a chestnut-brown horse body, fused at the withers with no saddle and no
> rider, the human waist seamlessly becoming the horse's chest. He gallops at full charge in a
> dynamic side profile facing south-west, all four hooves kicking up clods of earth, human hair
> and the horse's mane and tail streaming back with the speed. He grips a long wooden hunting
> spear leveled forward for the charge, a quiver of arrows slung across his back. Earthy greens
> and browns; sunlight filtered through the canopy. The background is a sun-dappled forest
> clearing of tall green grass, ferns, and old-growth trees, opening onto rolling plains.

- text_guidance_scale: 8 (consistent across the whole batch)
- image_size: 64x32, no_background: false
- One prompt across all 10 shared seeds (single-prompt coverage, not seed-locked iteration —
  the concept wording was settled, so the seeds sample variance against it).

## Per-seed notes (refined-prompt rolls)
- 01 (388748323): clear rider-on-horse, separate seated human. Prior won.
- 02 (1439044430): rider-on-horse, side trot; clean scene, not a centaur.
- 03 (1546055264): closer — torso connects lower, no obvious saddle, but still reads rider-ish.
- 04 (1069230523): good fusion, charging pose, integrated torso; spear not visible. Runner-up.
- 05 (250858960): figure indistinct; reads mostly as a galloping horse.
- 06 (1203968257): rider-on-horse with visible reins/saddle.
- 07 (422016864): **BEST** — lowest, most seamless torso integration, leaning into a full
  charge, spear leveled forward, strong motion, on-palette. Reads as one charging centaur.
- 08 (403215733): rider-on-horse, visible saddle; spear forward but a stray sword artifact below.
- 09 (820296959): human dropped — just a horse. Subject failure.
- 10 (1187260955): rider-on-horse, visible saddle, spear raised; clean but not a centaur.

10 generations produced (all 10 seeds).
