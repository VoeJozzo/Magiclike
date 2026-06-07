# Nature Caller — arm_b generation log

## Skill
Read `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` in full (357 lines) and applied
its discipline. This is the magiclike-card-art skill variant.

## Card
- Name: Nature Caller
- Cost: 2 green + 1 generic
- Type: Creature — Elf Druid
- P/T: 1/3
- Mechanic: ETB — search your library for a creature card and add it to your hand. In-world:
  an elf druid CALLS a creature ally out of the wild; the beast answers and emerges from the
  forest toward the druid.

## Mechanic-in-art mapping (the hero of the image)
The "calling a wild ally" act is the subject, not a druid merely standing. Enactment beats:
- Druid in the act of summoning: raising/blowing a curved antler horn AND beckoning toward the trees.
- A beast (antlered forest stag) ANSWERING the call — bounding/stepping out of the undergrowth
  toward the druid. Call-and-response is the composition.
- Both figures fully visible at equal scale, facing each other (explicit headcount per skill's
  multi-subject rule, to stop the model dropping/merging the second figure).
- Single GREEN identity: moss-green robes, deep-emerald old-growth forest, antlers, earthy browns,
  dappled green canopy light. A real forest setting (no_background:false + described background),
  not a sprite on void.

## Anchor
Verdant Charm (`reference/html-proto/cards/verdant_charm/art.png`) — green-robed figure, deep
emerald forest, antler/leaf motifs, warm dappled light. Calibrated set vocabulary to it.

## Settings (locked, identical across all 10 seeds)
- endpoint: POST https://api.pixellab.ai/v2/create-image-pixflux
- image_size: 64x32
- no_background: false
- text_guidance_scale: 8
- seeds (in order): 87067352, 491373570, 1555344610, 35756567, 1550454658, 1721577159,
  241996515, 1139412312, 256098439, 1032912504

## Locked prompt (single, used for all 10 seeds)
A slight elf druid in moss-green hooded robes, antler-twig circlet, stands in left side profile
facing south-east, one arm raised high blowing a curved antler horn to his lips, the other hand
outstretched and beckoning toward the trees. Answering the call, a large antlered forest stag with
deep-brown lichen-flecked fur bounds out of the undergrowth from the right, head lowered, charging
toward the druid, fully visible from head to legs. Both figures fully visible, foreground, the same
scale, facing each other. The background is a dense deep-emerald old-growth forest of tall mossy
trunks, ferns and fallen brown leaves underfoot, dappled green sunlight filtered through the canopy.

## Per-seed notes (judged on 8x upscales)
- gen_01 seed87067352: Druid blowing a glowing horn; stag mid-stride entering from undergrowth.
  Both fully visible, equal scale. Clearest horn read. Strong call-and-response. Runner-up.
- gen_02 seed491373570: Vignette framing; large antlered stag standing, druid beckoning at left.
  Beautiful but stag static (standing, not answering/advancing).
- gen_03 seed1555344610: Druid hand raised, big stag standing with glowing antler aura. Static stag.
- gen_04 seed35756567: Red-haired figure reads more human than elf druid; stag static. Off-brief subject.
- gen_05 seed1550454658: Very dynamic charging stag; druid small and edge-crammed at left.
- gen_06 seed1721577159: BEST. Druid striding with arm raised/beckoning; stag stepping toward him,
  both facing each other, clear forward motion on both. Strongest "calling + answering" gesture.
- gen_07 seed241996515: Druid hands at horn; large stag walking. Good, slightly less dynamic.
- gen_08 seed1139412312: Druid pointing; stag turning away at right edge — call less legible.
- gen_09 seed256098439: Vignette; druid + standing stag. Atmospheric but static stag.
- gen_10 seed1032912504: Druid blowing horn, stag standing/turning. Solid, less motion.

All 10 are coherent forest scenes with a green-robed druid and an antlered stag — the locked
prompt held composition consistently across seeds (seeds the only within-arm variable).
