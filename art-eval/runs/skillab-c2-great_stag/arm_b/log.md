# Great Stag — arm_b generation log

Skill file read in full at the exact path: `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (the `magiclike-card-art` skill).

## Card
- Name: Great Stag
- Cost: 2 generic + 1 green ({2}{G})
- Type: Creature — Beast
- P/T: 3/4 — a sturdy, powerful body
- Mechanic: vanilla creature (no abilities)

## How the skill was applied

**Story-card vs literal-card read.** Per the skill ("Goblin Horde is a horde of goblins — match the card's depth"), a vanilla 3/4 Beast is a *literal* card. There is no mechanic to enact, so the art's entire job is to depict a strong, majestic stag-beast whose *body mass and pose* read as a 3/4 bruiser. For a vanilla, the body IS the mechanic-in-art: a 3/4 must look sturdy and commanding, not like a delicate deer.

**Subject-prior dominance (the key lever this card needed).** The skill warns that some subjects have one overwhelmingly common caption that fights your intent — a "deer" is captioned "deer standing in a forest" and renders placid and delicate, which is wrong for a 3/4 bruiser. Fix: reach for precise vocabulary whose canonical associations already contain mass and power. I used **"massive, muscular bull elk," "thick shaggy mane," "broad heavy palmate antlers"** to pull the model toward a heavy elk/moose physique. This worked on the fine end of the lever (vocabulary) — no need to escalate to recompose or swap subject.

**Color-identity discipline.** Single green → deep emerald old-growth forest, earthy deep-brown fur, mossy ground, soft green canopy light. The eye sees green everywhere.

**no_background:false is necessary-but-not-sufficient.** The prompt names a full scene (forest of pines and ferns, canopy light, ground) so the model delivers a scene, not a sprite on void. All 10 frames came back with a real environment.

**Anchors studied (set coherence):** `forest_titan/art.png` (broad green bruiser against layered forest skyline, edge-to-edge) and `feral_stalker/art.png` (beast in profile against dense foliage). The chosen direction harmonizes with these: large beast in profile, warm fur against deep green forest, full-frame.

**Silhouette test (64x32):** large stag in side profile, head raised, broad antlers crowning the top of the frame — a single instantly-readable shape.

## Prompt (identical across all 10 seeds — single locked prompt)

> A massive, muscular bull elk with a thick shaggy brown mane and broad heavy palmate antlers, standing in a powerful side profile facing west, head raised proudly, coarse deep-brown and earthy fur, planted on mossy ground. The great beast looms large and sturdy, commanding and wild. The background is a deep emerald old-growth forest of dense pines and ferns with shafts of soft green canopy light behind him.

## Parameters
- image_size: 64x32
- no_background: false
- text_guidance_scale: 8 (default, held constant across the whole batch — the model cooperated with the subject once the elk/antler vocabulary was in place, so no bump was warranted per the skill's "raise it only when on-track / suspect it when fighting" rule)
- One generation per seed, run SEQUENTIALLY (one at a time).

## Seeds (shared with arm_a, used in order)
1738546136, 256159730, 1726012745, 383761520, 1141421384, 38147961, 1503856985, 1742647739, 1135182162, 2073324191

## Per-seed notes (judged on 8x nearest-neighbor upscales)
- gen_01 (1738546136): full-bodied moose-elk in profile, head lowered slightly; antlers a touch tangled/asymmetric. Strong scene. Solid.
- gen_02 (256159730): broad elk, head down grazing, clear branching antlers, bright sunlit forest. Clean and legible — strong runner-up, but pose is placid not commanding.
- gen_03 (1726012745): pale-flanked elk, head turned, good antlers, lush green. Slightly leaner read; grazing posture.
- gen_04 (383761520): elk in profile against birch-like trunks; antlers read but body slightly flat.
- gen_05 (1141421384): atmospheric, antlers raised, but body sits a bit small in a tall forest frame.
- gen_06 (38147961): warm-lit pale elk, antlers present; body reads slightly slim.
- gen_07 (1503856985): compact elk against teal forest; fine but less imposing mass.
- gen_08 (1742647739): BEST. Full broad-bodied elk, clean side profile, head raised proudly, well-articulated branching antlers crowning the frame, all four legs grounded, pale moon centering it between two flanking trunks, fern floor. Most majestic and commanding; best body-mass-as-3/4 read.
- gen_09 (1135182162): muscular tan elk, head turned toward viewer, good mass; antlers slightly busy against the canopy.
- gen_10 (2073324191): heavy moose-like body, head down, strong silhouette; antlers a bit small relative to body.

## Outcome
10 of 10 generations landed the concept (large powerful forest stag-beast, green identity, real scene). No failures, no sprite-on-void. BEST = gen_08.
