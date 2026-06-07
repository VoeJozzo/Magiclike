# Great Stag — arm_a generation log

Skill file read in full at the exact path given: `/home/user/Magiclike/art-eval/variants/SKILL-control.md`.

## Card
- Name: Great Stag
- Cost: {2}{G} (2 generic + 1 green)
- Type: Creature — Beast
- P/T: 3/4 (sturdy bruiser body)
- Mechanic: vanilla creature, no abilities. Verified against `reference/html-proto/cards/great_stag/card.json`.

## Anchors studied (skill phase 2)
- `forest_titan/art.png` — hulking green creature filling the frame against a forested mountain vista; earthy greens.
- `feral_stalker/art.png` — crouched tiger in dense jungle foliage; subject + real forest background, brown/green palette.
Calibration takeaway: green creatures here fill the frame with a strong subject over a real, dense forest backdrop — not a sprite on void.

## Mechanic-in-art reasoning
A vanilla 3/4 Beast is a literal-card, not a story-card (per skill: "match the card's depth; literal cards get literal art"). The art's whole job is to make the body read as a *sturdy, powerful, noble beast* — a 3/4 bruiser, not a delicate deer. Single GREEN identity → deep forest, earthy greens and browns.

Subject-prior discipline (skill: subject-prior dominance): a plain "deer" is captioned as a small placid animal ten-thousand times and renders delicate. To force a heavy, commanding body I leaned on precise nouns — "massive bull elk", "great stag beast", "heavy muscular chestnut-brown body", "thick shaggy mane around powerful broad shoulders", "enormous sweep of bone-pale antlers", "sturdy bruiser" — rather than retuning a "deer" prompt. This held the prior firmly across all 10 seeds (no delicate-deer regressions).

Camera: chose "three-quarter view" over "side profile" deliberately. The skill notes pixflux obeys camera words literally and "side profile" forces rigid side-on framing; a three-quarter view gives the antler crown depth and reads more majestic/commanding for a noble beast. (The prior partial attempt in this dir had used "side profile facing west"; I replaced it.)

Background: explicit discrete clause ("The background is a deep old-growth forest...") plus a named light source ("Shafts of green-tinted light filter down through the canopy") to defeat pixflux's sprite-on-void bias even with no_background:false.

## Locked prompt (single, used for all 10 seeds)
> A massive bull elk, a great stag beast with a heavy muscular chestnut-brown body, thick shaggy mane around powerful broad shoulders, and an enormous sweep of bone-pale antlers crowning its head. It stands in a three-quarter view, head raised high, one hoof forward, commanding and noble, a sturdy bruiser of the wild forest. Shafts of green-tinted light filter down through the canopy onto its coat. The background is a deep old-growth forest of mossy emerald trees, ferns, and earthy brown undergrowth.

## Parameters
- image_size: 64x32 (non-negotiable per skill / frame config)
- no_background: false
- text_guidance_scale: 8 (default; held constant across the batch — the model cooperated with this prompt, so no bump needed)
- seeds: from seeds.json, in order: 1738546136, 256159730, 1726012745, 383761520, 1141421384, 38147961, 1503856985, 1742647739, 1135182162, 2073324191

## Per-seed notes (judged on the 8x upscales)
- gen_01 (1738546136): big-bodied stag, head dipped low; antlers slightly washed into the white backlight at top. Solid.
- gen_02 (256159730): clean broad-bodied elk, head raised, classic antler rack; antlers a touch thin/pale. Strong runner-up.
- gen_03 (1726012745): golden-lit stag, good antlers, lean-ish frame; reads a bit more "standing elk" than bruiser.
- gen_04 (383761520): hefty body, antlers slightly tangled into canopy; moodier/darker.
- gen_05 (1141421384): dramatic vignette framing, body partly in shadow; antlers a little busy.
- gen_06 (38147961): pale powerful body, large rack, head down browsing posture; less "commanding".
- gen_07 (1503856985): smaller-in-frame, more delicate antlers; weakest of the set for "bruiser".
- gen_08 (1742647739): BEST — broad muscular body filling the frame, head raised, clean readable antler crown, framed by two trees over a luminous teal old-growth forest. Best gestalt for commanding noble bruiser + best silhouette.
- gen_09 (1135182162): strong stag, good antlers, slightly leaner body; very close runner-up.
- gen_10 (2073324191): heavy-bodied, good rack and backlight; reads marginally more "elk" than "great beast".

## How the skill was applied (summary)
- Read whole card.json incl. type/cost/PT; ignored the 🦌 placeholder emoji.
- Studied two green anchor arts for set vocabulary.
- Treated as a literal-card; art job = make the body read as a powerful noble beast.
- Used precise subject nouns to beat the deer subject-prior; deliberate camera choice; explicit background + named light clause to avoid sprite-on-void.
- Single locked prompt + tgs across all seeds (controlled A/B; seed is the only variable).
- Judged every roll on the 8x upscale for whole-image gestalt, not parts.
