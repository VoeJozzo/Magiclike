# Prey Upon — arm_b generation log

Skill read in full at exact path: `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (confirmed).

## Card
- **Prey Upon** — Sorcery, cost {G}. `target_slots`: one own creature + one opponent creature. Single effect `kind: "fight"` (operands = the two creatures). No flavor text.
- This is a **literal-card**, not a story-card: the art must *enact* the Fight mechanic = two creatures dealing damage to **each other simultaneously**. So the load-bearing criterion is "reads as a FIGHT between two beasts (mutual clash / one attacking the other)," NOT a single creature, a bolt, or a hunter with a weapon. Single green identity → wild nature, forest, fang-and-claw, earthy greens/browns.

## Anchors studied
- `feral_stalker` — tiger crouched in green ferns; saturated full-bleed forest, beast legible at small size. Calibrated palette (deep emerald + brown earth).
- `wolfbriar_elemental` — green creature on a dense forest backdrop; confirms full-scene (not sprite-on-void) framing for green cards.

## API settings
- Endpoint: `POST /v2/create-image-pixflux`, `image_size {64,32}`, `no_background: false`, `text_guidance_scale: 8` (kept constant across the whole batch — no documented reason to deviate; the model cooperated with the prompts so vocabulary, not the volume knob, was the lever).
- Seeds (in given order): 1397419063, 1589384546, 429385119, 1406099565, 1097390204, 388025702, 356870839, 1364876817, 1738837013, 1599731972.

## Prompts

**P1** (validated workhorse — wolf vs. boar face-off/lunge):
> Two wild beasts locked in a violent fight, a grey shaggy wolf and a brown tusked wild boar, both fully visible from head to haunch and the same size, lunging at each other and colliding mid-leap in the center of the frame, jaws open and claws raking, the wolf biting into the boar's shoulder as the boar gores back with its tusks, flecks of crimson blood and torn fur flying between them. The background is a shadowy old-growth forest floor of deep emerald ferns, moss-slicked roots and brown earth.

**P2** (big cats grappling chest-to-chest — forces actual contact):
> Two snarling big cats fighting to the death, a tawny mountain lion and a spotted leopard, both fully visible and the same size, reared up and grappling chest to chest in the center of the frame, fangs bared and claws hooked into each other, biting at each other's throats, tufts of fur and flecks of crimson blood flying between them. The background is a sunlit green forest clearing of ferns, moss-slicked stones and brown earth.

**P3** (collision-forcing wolf/boar variant — target the "standoff" flaw):
> Two wild beasts colliding in mid-air at the dead center of the frame, a grey shaggy wolf and a brown tusked wild boar, both fully visible from head to haunch and the same size, their bodies slamming together so their heads overlap, the wolf's open jaws clamped onto the boar's neck while the boar drives its tusks into the wolf's chest, claws raking, a burst of torn fur and flecks of crimson blood exploding where they meet. The background is a shadowy old-growth forest floor of deep emerald ferns, moss-slicked roots and brown earth.

## How the skill was applied
- **Mechanic-in-art gate.** Every prompt is built to make the *Fight* visible — two equally-sized beasts, both fully visible, attacking each other at frame center, with mutual-damage cues (crimson blood + torn fur "between them"). The named two-figure-headcount + "both fully visible, same size" lift directly applies the skill's multi-subject rule (otherwise pixflux drops/merges one beast).
- **Structural template.** Subject (specific material+color: "grey shaggy wolf," "brown tusked wild boar," "tawny mountain lion," "spotted leopard") → pose/action ("lunging," "reared up and grappling chest to chest") → immediate context (the bite/gore + blood/fur between them = the narrative beat) → discrete background clause ("The background is a shadowy old-growth forest floor...").
- **Vocabulary precision.** "crimson blood" not "blood"; named species (strong subject priors) rather than "fantasy creatures."
- **Subject-prior dominance, observed live.** P3's "colliding in mid-air / bodies slamming together / heads overlap" did NOT land — the model's overwhelming quadruped-standing prior reasserted a low-crouch standoff (gen_05). This is exactly the skill's blunt-lever warning: precise wording can't move a strong subject prior. The fix that worked was a *subject/pose swap* — P2's reared-up big-cat grapple, where the canonical "two cats fighting" pose already contains chest-to-chest contact, cracked the actual-clash composition (gen_10).
- **Reach, don't hedge.** Nominated the contact-grapple frame (gen_10) over the cleaner-but-tamer face-off frames; the face-offs are gorgeous but depict the staredown, not the fight.

## Per-seed notes
- **gen_01 / 1397419063 (P1)** — strong: grey wolf mid-lunge, jaws open, brown beast braced; dynamic, clear two-creature fight. Best of the early three.
- **gen_02 / 1589384546 (P1)** — clean wolf-vs-tan-canine face-off; both fully visible, equal size. Reads as confrontation more than collision.
- **gen_03 / 429385119 (P1)** — wolf vs brown boar, heads close with red at the muzzles; tense, slightly more standoff than clash.
- **gen_04 / 1406099565 (P1)** — excellent symmetric head-to-head, bared teeth, red at both mouths; very legible aggression.
- **gen_05 / 1097390204 (P3)** — P3 failed to produce mid-air collision; low-crouch standoff. Confirms subject-prior dominance.
- **gen_06 / 388025702 (P1)** — golden/orange beast lunging at the wolf; good motion, both visible.
- **gen_07 / 356870839 (P1)** — cleanest face-off: wolf + boar snarling head-to-head, jaws open with red, green-foliage vignette. Best of the P1 set, but a face-off (snouts apart), not contact.
- **gen_08 / 1364876817 (P1)** — wolf + brown beast lunging, good forest depth; standoff-leaning.
- **gen_09 / 1738837013 (P1)** — wolf vs brown beast, heads low and close, red mouths; tense, cooler/bluish forest light.
- **gen_10 / 1599731972 (P2)** — **BEST.** Two big cats reared up, paws interlocked, jaws clashing at dead center with red impact between them — actual mutual grappling contact. Best mechanic-enactment. Minor fixable flaw: left cat's anatomy slightly off / mildly cartoonish — but it is reaching for the real thing (contact), which the skill says to reward over timid-but-clean.

## Total
10 generations produced (gens 01–10), all 10 seeds covered. text_guidance_scale: 8 throughout.
