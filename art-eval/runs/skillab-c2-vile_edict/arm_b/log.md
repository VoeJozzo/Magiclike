# Vile Edict — arm_b generation log

Skill applied: read `art-eval/variants/SKILL-c2-variant.md` in full (it is the
`magiclike-card-art` skill, C2 variant). Operated autonomously (no interactive
art director in this experiment), but applied the skill's discipline throughout:
mechanic-in-art gate, vocabulary precision / subject-prior diagnosis, the
subject→pose→context→background prompt template, color-identity discipline, and
seed coverage.

## Card
Vile Edict — Sorcery, cost {B}{B}. Effects: opponent `chooses` a permanent →
`annihilate` → `rip`. Mechanic = a forced-sacrifice "edict": the opponent is
compelled to give up one of their own permanents, which is then destroyed and
ripped down to the graveyard by black magic. Single black identity (decay, bone,
shadow, sickly green-black, crimson blood).

## Anchors studied
- `diabolic_edict/art.png` (sibling card, same mechanic family): hooded
  decree-giver holding scales of judgment — desaturated, gothic, red accents.
- `consume_spirit/art.png`: near-monochrome decay with crimson blood flecks.
Set vocabulary for black: muted/desaturated palette, deep shadow, stone/gothic
or graveyard backdrops, sparing crimson blood, one readable figure.

## Mechanic-in-art decision
Enact "forced sacrifice / claimed and dragged to death," not a caster casting and
not a duel. Direction: a creature (the permanent the opponent must give up) being
**seized by skeletal hands erupting from the ground and dragged down into a
grave** — a clear vertical/downward pull silhouette at 64x32. Subject chosen as a
war-hound rather than a soldier (a creature better reads as "a permanent the
opponent gives up"; per skill, soldier's upright-human prior is also valid but I
went creature-as-victim).

## Settings
- `text_guidance_scale`: 8 (default), held constant across all 10 (no documented
  reason to deviate; per skill, fix the words not the volume knob).
- `image_size`: 64x32, `no_background`: false, all 10 shared seeds in order.

## Prompts
Prompt A (gen_01 only, first validation roll):
> A doomed war-hound with mangy grey-brown fur is wrenched downward in a panicked
> struggle, facing south-west, its body arched and head thrown back, jaws open
> mid-howl. Skeletal hands of bone-grey and rotted sinew erupt from cracked black
> earth and clamp around its legs and throat, dragging it down into an open grave.
> Sickly green-black necrotic mist and flecks of crimson blood swirl around the
> seizing claws as the magic claims it. The background is a desolate graveyard at
> dusk, leaning gravestones and skeletal dead trees in deep shadow, the only light
> a faint sickly green glow rising from the grave below.

Diagnosis after A: the "war-hound" subject prior dominated — it rendered a
menacing standing hound; the grasping-hands / dragged-down mechanic did not fire.
Per the skill's subject-prior lever, I front-loaded the grasping hands as the
SUBJECT of the sentence so the seizure leads the composition.

Prompt B (FINAL — used for gens 01 [re-rolled], 02–10):
> A dozen skeletal bone-grey hands and arms erupt from cracked black earth,
> gripping a struggling mangy grey-brown war-hound and dragging it downward into an
> open grave. The hound is toppled onto its side, legs splayed and head thrown back
> howling, half-swallowed by the soil as the clutching hands haul it under. Sickly
> green-black necrotic mist and flecks of crimson blood churn around the grasping
> claws. The background is a desolate graveyard at dusk, leaning gravestones and
> skeletal dead trees in deep shadow, the only light a faint sickly green glow
> rising from the open grave below.

## Per-seed notes (all prompt B, tgs 8)
- gen_01 seed 1188665106 — black hound standing over green-glow ground, blood
  spots. Hands didn't erupt; menacing-hound prior won. Weak enactment.
- gen_02 seed 1688004711 — hound beside a stone tomb-arch/portal w/ green glow.
  Reads "hound near a crypt," not dragged down. Weak.
- gen_03 seed 404647802 — snarling hound, gravestones in bg. Good setting, no
  seizure. Weak enactment, nice atmosphere.
- gen_04 seed 2065043045 — **BEST.** Ring of pale skeletal arms erupting from the
  ground, clutching inward at a central victim over a pool of sickly green light,
  crimson-red blood. Clear "seized and dragged down" gestalt.
- gen_05 seed 1028306224 — open grave pit w/ green glow at dusk, no victim, no
  hands. Grave prior swallowed the subject. Weak (empty grave).
- gen_06 seed 1779909123 — skeletal hound in moonlit graveyard. Reads undead
  creature, not a sacrifice. Weak enactment.
- gen_07 seed 206873136 — bony multi-limbed mass over green glow, magenta blood.
  Reaches for the same idea as 04 but reads as a chaotic bone-pile. Moderate/messy.
- gen_08 seed 1870015909 — churned mound of grave-dirt/debris under green moon.
  Disturbed grave, no clear victim/hands. Weak.
- gen_09 seed 1249784105 — dark hound prowling in foliage, blood flecks. Menacing
  creature again. Weak enactment.
- gen_10 seed 1584918067 — hunched creature rising over green glow, gravestones.
  Ambiguous — could read as clawing UP from the grave (wrong direction). Moderate.

## Outcome
Subject-prior for "hound" pulled most rolls to "menacing/undead beast standing in
a graveyard" (01,02,03,06,09) — the named visible failure the skill predicts. The
dragging-down mechanic fired cleanly only where the grasping hands took over the
frame: gen_04 (clean) and gen_07 (messy). gen_04 nominated BEST.
