# Arm A — Clockwork Beetle (control skill)

Skill read from exact path: `/home/user/Magiclike/art-eval/variants/SKILL-control.md` (the magiclike-card-art control variant). Applied its discipline below.

## Card
- Name: Clockwork Beetle
- Cost: 1 generic
- Type: Artifact Creature — Insect
- P/T: 1/1
- Mechanic to enact: a vanilla artifact creature — a small wind-up mechanical beetle. Art must read as a clockwork automaton built of metal (brass/copper plates, exposed gears/cogs, rivets, jointed metal legs, wind-up key), NOT an organic bug. Colorless/artifact identity = metallic neutrals (brass, copper, bronze, steel, patina), no WUBRG color wash. Set on a real workshop surface.

## Settings (locked across all 10 seeds)
- endpoint: POST https://api.pixellab.ai/v2/create-image-pixflux
- image_size: 64x32
- no_background: false (background described in prompt)
- text_guidance_scale: 8 (skill default; no element fought the model, so no bump warranted)
- seeds (in order): 1211370075, 448769573, 608752310, 802200393, 1668146355, 1969871289, 25264125, 2091708154, 1082614233, 1013567519
- one image per seed; seed is the only within-arm variable

## Locked prompt (single, used for all 10)
> A small clockwork beetle automaton built from polished brass and copper plates, its carapace a riveted dome of bronze with exposed brass gears and turning cogs visible at the seams, six jointed steel legs, and a wind-up key protruding from its back. It stands in side profile on a wooden workbench, antennae of thin copper wire raised. The background is a dim tinkerer's workshop with tools, a vise, and patina-green metal scraps scattered on the bench.

## Skill application notes
- **Mechanic-in-art lens:** This is a literal-card (vanilla artifact creature), not a story-card — the skill says match the card's depth, so the art's only job is reading unmistakably as a wind-up mechanical beetle. Mechanic-enactment = the clockwork construction itself: rivets, exposed gears/cogs at the carapace seams, jointed steel legs, and the wind-up key (the defining "wind-up automaton" tell).
- **Vocabulary precision (specific nouns over compositional description):** used "riveted dome," "exposed brass gears and turning cogs," "jointed steel legs," "wind-up key" — narrow concrete nouns the model has strong associations for, rather than "looks robotic" / "made of metal parts."
- **Color-identity discipline:** colorless/artifact → metallic neutrals (polished brass, copper, bronze, steel, patina-green scraps). No WUBRG wash introduced.
- **Sprite-bias defense:** PixelLab pulls toward sprite-on-void. Countered with an explicit background clause naming the workshop, vise, tools, and scattered metal scraps so the model renders a scene.
- **Structural template:** subject (material+color) → pose/direction (side profile on workbench) → immediate context (antennae raised, key on back) → discrete background clause ("The background is...").
- **Camera word:** "side profile" used on purpose for a clean, readable beetle silhouette at 64x32.

## Per-seed notes (judged on 8x upscales)
- gen_01 (1211370075): Strong brass domed carapace, clear rivets/plates, jointed legs, vise + patina scraps behind. Very legible mechanical beetle. Top-tier.
- gen_02 (448769573): Mechanical but legs spindly; reads slightly spider-ish; carapace less domed.
- gen_03 (608752310): Busy; head/front reads a touch blobby; strong teal-patina workshop context.
- gen_04 (802200393): Clean side profile, visible gear seams on carapace, jointed legs; slightly flat gold, less rivet texture.
- gen_05 (1668146355): Subject small and dark; carapace detail muddy; reads more like a generic bug.
- gen_06 (1969871289): Dark, carapace detail muddy; acceptable but unremarkable.
- gen_07 (25264125): Excellent clean side profile, segmented carapace with clear seams, distinct dark-steel jointed legs, strong workshop bench + teal machine. Top contender.
- gen_08 (2091708154): Brass-plated domed carapace, jointed legs, workshop context, AND a visible wind-up key protruding from the back — the only roll that clearly renders the key. Strongest mechanic-enactment.
- gen_09 (1082614233): Busy/dark, legs cluttered, less readable.
- gen_10 (1013567519): Good domed brass carapace, workshop bench; slightly soft, less distinct legs.

## BEST
gen_08 (seed 2091708154). See RESULT.md.
