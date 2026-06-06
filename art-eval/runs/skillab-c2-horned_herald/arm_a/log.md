# Horned Herald — arm_a generation log

Card: Horned Herald — GREEN 3/3 Beast (G + 3C). ETB: pump all_yours +1/+1.
Mechanic-in-art lens: a herald beast whose ARRIVAL rallies/empowers the whole herd.
The art should show the herald + an answering, strengthened herd — not a lone beast.

Anchors studied: wolfbriar_elemental, forest_titan, surging_beast, feral_stalker,
beast_whisperer. Set vocabulary = warm earthy creature centered against deep-emerald
dense canopy, dappled light, foliage framing.

Constraints: image_size 64x32, no_background:false, seeds from the fixed array,
batches <=5, save only in arm_a/, names gen_<NN>_seed<seed>.png.

---

## gen_01 — seed 367865309 (pre-existing leftover from interrupted prior run)
Prompt: (unknown — predates this session; left in folder by an interrupted run)
Result: Large brown horned bull-beast foreground, smaller beasts massed behind/around.
Already on-concept (herald + herd). Horns clear, strong silhouette, green identity.
Herald a touch static (standing, not calling). Kept as baseline gen_01.

---

## Prompt used for gens 02–05 (variance batch across 4 array seeds)
"A massive horned beast with shaggy chestnut-brown fur and a broad muscular body,
standing in low side profile, head raised and bellowing a rallying call, its long
curved horns held high. Behind and around it a herd of smaller beasts answers,
surging forward through the grass, ears up and heads lifted. The background is a
sunlit deep-emerald forest clearing with dappled light and tall green ferns."
Settings: image_size 64x32, no_background:false, text_guidance_scale default (8).

Note: pixflux concurrency cap (5) repeatedly tripped firing the batch fast; retried
the three concurrency-rejected seeds individually with spacing — all succeeded.

## gen_02 — seed 1757799417
Big bison-like herald center-left, head turned, smaller beasts flanking BOTH sides
— clearest "leader + answering herd" reading of the batch. Clean curved horns,
balanced composition, lush forest. Strong gestalt. NOMINATED BEST.

## gen_03 — seed 1830488118
Good but horns/head slightly ambiguous; herd small and clustered low. Brighter sky
(less of the set's dense canopy). Solid but weakest of the four.

## gen_04 — seed 1397987884
Dynamic mid-stride herald, herd surging lower-right — reads as "surging forward."
Energetic rally-in-motion; face a touch muddy. Strong alternative.

## gen_05 — seed 1758858283
Most atmospheric: deep-forest depth, sunbeams, big-horned herald on the right, herd
massed mid-left. Best horns, best set coherence (closest to wolfbriar/surging_beast).
Herd slightly more huddled than gen_02. Close runner-up.

---

Calls used this session: 1 batch curl (4 seeds, with retries) = effectively 4
successful generations. Plus the pre-existing gen_01. Total distinct images: 5.
BEST = gen_02.
