# Lightning Bolt (no-figure) — arm_a generation log

Card: Lightning Bolt — RED Sorcery, {R}, deals 3 damage. Target: creature_or_player.
Art direction: force of nature. A crimson forked bolt tearing from a storm and striking
the landscape (ridge / dead tree / rock spire). NO human figure. The strike/impact is
the mechanic-enactment hero.

Settings constant across all calls: image_size 64x32, no_background false.

## Batch 1 — prompt v1 (atmosphere-led)
Prompt:
"A massive forked bolt of crimson lightning, shaped like a jagged caret or circumflex
with branching Lichtenberg figures, tears down out of a churning charcoal-black storm
sky and strikes a lone dead tree on a barren rocky ridge, splitting it in an explosive
white-hot scarlet impact flash that scorches the cracked earth. The only source of light
in the scene is the searing crimson bolt itself, casting red glow across the rocks and
underlit storm clouds. The background is a violent dark thunderhead with sheets of rain."
text_guidance_scale: default (8)

- gen_01 seed 352259460 — dark ridge, diffuse red glow, faint scattered sparks top-right. No clear bolt. Weak.
- gen_02 seed 1070411472 — dead tree silhouette, pink sky, faint mid zigzag. Tree reads, bolt faint.
- gen_03 seed 644720742 — best atmosphere of batch 1, dramatic dark storm + small top fork. Bolt too small.
- gen_04 seed 356440950 — dead tree, pink sky, vertical white streak. Mild strike read.

Diagnosis: model defaulted to "red glowing sky + dead tree" (subject-prior dominance);
the forked-bolt hero was getting lost. Fix per skill: front-load the BOLT as the bright
hero, demand a single thick vertical column splitting into a fork, force an explosive
ground-impact flash. (Subject-prior → recompose lever.)

## Batch 2 — prompt v2 (bolt-led) — WINNING PROMPT
Prompt:
"A single enormous bolt of brilliant crimson lightning is the bright hero of the scene,
a thick searing scarlet column descending vertically from the top of the frame down to
the ground, splitting near the bottom into a jagged caret or circumflex fork of branching
Lichtenberg figures, striking a barren rocky ridge and erupting in a blinding white-hot
explosive impact flash. The bolt is the brightest thing in the frame, blazing red-white
against a near-black churning storm sky. The only light is the lightning itself, throwing
harsh red glow on the dark cracked rocks below. The background is a violent black thunderhead."
text_guidance_scale: 9

- gen_05 seed 644720742 — thick crimson bolt descending dead-center, forks at bottom, strikes dark ridge. Strong.
- gen_06 seed 789308556 — diffuse, scattered electric branches, impact lower-right. Bolt not a clean column. Weaker.
- gen_07 seed 1577333873 — bright bolt to white-hot ground impact flash + crepuscular red rays, blue-grey clouds flanking. Strong impact read. Runner-up.
- gen_08 seed 904169504 — thick red-white bolt strikes the peak of a central rock spire, white impact point on the rock, scattered embers, dark storm frame. BEST: clearest strike-hits-the-land, best target object, strongest centered silhouette.

## Nominee: gen_08 (seed 904169504), prompt v2, text_guidance_scale 9
Total image-gen calls: 8 (within budget of 10).
