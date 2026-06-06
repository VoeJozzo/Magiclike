# arm_b — Lightning Bolt (force-of-nature, NO figure)

Card: Lightning Bolt — RED Sorcery, {R}, deals 3 damage. Target creature_or_player.
Art direction: the lightning phenomenon ITSELF is the hero — a massive forked crimson
bolt tearing out of a storm sky and striking the landscape (dead tree / ridge / spire),
explosive impact flash. NO human figure / humanoid victim. Red color identity.

Anchors studied:
- branching_bolt/art.png — red Lichtenberg forks on dark indigo storm sky (vocabulary anchor)
- lava_spike/art.png — silhouetted landscape, molten river, twilight (no-figure composition anchor)
- char/art.png — warm scene w/ figure (less relevant; avoiding figures)

Chosen vision: "the strike is the hero" — a forked crimson Lichtenberg bolt out of a churning
storm sky striking a lone dead tree on a barren ridge; white-hot impact flash; dark
silhouetted ridge along the bottom; sky lit only by the red lightning.

## Call 1–5 — variance batch (one prompt, 5 seeds)
Endpoint: create-image-pixflux, 64x32, no_background:false, text_guidance_scale: default(8)
Prompt:
"A single massive forked bolt of crimson lightning, a caret or circumflex shape of branching
Lichtenberg figures, tears down out of a churning dark storm sky and strikes a lone dead
blackened tree on a barren rocky ridge. A brilliant white-hot crimson impact flash explodes
at the point of the strike where the bolt hits the ground, cracking the earth. The dead tree
and jagged ridge are dark silhouettes along the bottom. The background is a violent stormy
night sky in deep indigo and charcoal, lit only by the red lightning. Raw elemental power,
no people."

- Call 1 seed 352259460 -> gen_01: dark spire on ridge, crimson glow sky. Bolt absent — reads as aftermath glow, not active strike. WEAK.
- Call 2 seed 1070411472 -> gen_02: bare dead tree silhouette, crimson sky, faint diagonal streak. Tree good, bolt weak.
- Call 3 seed 644720742 -> gen_03: VISIBLE jagged crimson/white bolt descending upper-right into red impact glow, dark silhouette below. No figure. Composition lopsided (bright left / dark void right). STRONG.
- Call 4 seed 356440950 -> gen_04: near-twin of gen_02. dead tree, crimson sky, faint streaks. bolt weak. (note: seed hit concurrent-job cap on first try, retried sequentially.)
- Call 5 seed 789308556 -> gen_05: BEST hero bolt — bright white-crimson forked bolt w/ clear branch striking a ridge, dramatic crimson storm sky. FLAW: small dark vertical shape at strike base reads as a possible human figure — constraint risk.

Leaders: gen_05 (best bolt/drama, figure-risk) vs gen_03 (clean bolt, no figure, lopsided).
Plan: inpaint gen_05 to replace the figure-like silhouette at the strike point with a
shattered dead tree / split rock, removing the only-no-figure ambiguity.

## Call 6 — inpaint gen_05 (fix figure)
Endpoint: /v2/inpaint, 64x32, seed 789308556.
Mask: white rect x33-40, y9-24 (128 white px) over the figure-silhouette column at the
strike base; bright forked bolt and ridge left untouched. Mask viewed before firing.
Local prompt: "a shattered burnt dead tree stump and cracked rock on the dark ridge,
glowing red embers, no person"
Result -> gen_06: figure removed. Clean white-crimson forked bolt striking the ridge,
impact glow at base, dark ridge silhouette right. No figure (verified by brightness map:
dark mass is bottom-anchored ridge, no isolated vertical column). Best legible bolt of the
run + clean composition. KEEPER.

## Decision
BEST = gen_06_seed789308556.png (inpaint-refined gen_05). Copied to BEST.png.
Runner-up: gen_03 (clean no-figure bolt, but lopsided composition).
Total image-gen calls: 6 (5 pixflux generate + 1 inpaint). Budget was 10.
