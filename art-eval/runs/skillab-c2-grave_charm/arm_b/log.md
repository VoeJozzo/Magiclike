# Grave Charm — arm_b generation log

Skill file read in full at the exact path: `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (confirmed).

## Card
Grave Charm — Sorcery (black), cost {2}{B}, Flash. MODAL, pick one:
1. Slay — destroy target creature
2. Wither — opponent discards 2
3. Drain — gain 4 life, opponent loses 2

Source: `reference/html-proto/cards/grave_charm/card.json` (effects = affect_creature/destroy, move_card hand→graveyard amount 2, gain_life +4/-2). The `art` field is the placeholder skull emoji — ignored per skill.

## How the skill was applied

- **Mechanic-in-art / brainstorm gate.** "What does this card do, and how do we show it?" It is a *modal* spell with three death-themed modes sharing ONE color (black) and ONE theme (grave magic). Verdant Charm's mode→tendril→color trick does NOT transfer here, because all three modes are black — there are no distinct colors to map. So per the brief I depict the **unifying flavor** rather than any single mode: a black grave-charm object channeling necrotic energy being unleashed. I deliberately did *not* depict only the Slay mode — modal art that shows one mode misrepresents a card that can be cast as any of the three; the charm/talisman object is the honest hero common to all modes.
- **Silhouette test (64×32, 2048 px).** Single readable shape = a skull (the charm) haloed in necrotic light, raised by a gaunt hand. A skull is one of the strongest small silhouettes available.
- **Sprite-bias defense.** `no_background:false` alone is necessary-but-not-sufficient; the prompt explicitly describes the scene behind/around the subject (foggy graveyard, leaning moss-slicked headstones, bare black trees) and names the light source so the model renders a scene, not a sprite on void.
- **Color-identity discipline.** Single BLACK identity: yellowed bone, tarnished black iron, grey decayed flesh, shadow, and a *sickly necrotic green-black* glow (the canonical black-magic accent), not a neutral wash.
- **Vocabulary precision / four-beat template.** Subject (material+color: yellowed bone, tarnished black iron, gaunt grey hand) → pose (clutched, held aloft) → context = the mechanic-enactment (necrotic energy *pouring from the eye sockets*, "grave-magic being unleashed") → background as a discrete clause + a named single light source. No banned phrase carries weight (no "epic/dramatic/atmospheric/masterpiece").
- **Anchors studied.** `verdant_charm/art.png` (the modal exemplar — central figure + colored magic, busy organic bg) and `consume_spirit/art.png` (a BLACK card rendered as a dim, desaturated, real-space scene — my calibration target for black mood, not a sprite on void).

## Prompt (identical across all 10 seeds)

> A weathered grey-bone skull amulet, a death talisman of yellowed bone and tarnished black iron, clutched in a gaunt grey hand and held aloft. Sickly necrotic green-black energy pours from the skull's empty eye sockets and curls around the bony fingers, decay and grave-magic being unleashed. The background is a foggy nighttime graveyard of leaning moss-slicked headstones and bare black trees. The only source of light is the amulet's eerie green-black necrotic glow.

## Parameters
- `image_size`: {width:64, height:32}
- `no_background`: false
- `text_guidance_scale`: 8 (default; kept constant across the whole batch — the model cooperated with the prompt, so no bump was warranted per the skill's "guidance is a volume knob, not a scalpel")
- `seed`: one per gen, from `seeds.json`, in order

## Strategy
Same prompt across all 10 seeds (pure variance sampling). The concept clicked on the first batch — every frame returned a held skull + necrotic green glow + graveyard, so no seed-locked iteration or wording change was needed.

## Per-seed notes (judged on 8× upscales)
- gen_01 seed130125853 — skull on a green-dripping bony arm, headstones; arm dominates, jaw reads slightly zombie-ish.
- gen_02 seed1256381175 — clean skull, green flame plume from the crown, crosses, hand below; skull sits low-right.
- gen_03 seed1152615433 — small skull on a spine-stalk; too much empty graveyard, weak silhouette.
- gen_04 seed1633184466 — skull in clawed hand, green orb glow behind; skull a bit melty/asymmetric.
- gen_05 seed1558755057 — front-facing skull with a glowing green gem in one socket, raised hand, misty trees; strong, centered.
- gen_06 seed1910232362 — **BEST.** Skull-faced talisman ringed by a radiant green-black necrotic halo, hung on a chain/spine; glowing yellow-green eyes. The only frame where the magic is visibly *being unleashed* AND the skull reads as a worn charm object, not a loose skull.
- gen_07 seed903720406 — gorgeous luminous skull, green sockets + necrotic drool, gauntleted hand, deep misty graveyard; cleanest gestalt but reads as "a held skull" more than "a charm."
- gen_08 seed2034285875 — skull on a forearm, green flame, cross headstone; arm/jaw slightly muddy.
- gen_09 seed1173989393 — skull held aloft from below, green glow, twin bare trees framing; skull a touch dark/low-contrast.
- gen_10 seed339593589 — skull cradled in an open bracered hand, bright green eyes, headstones + moon; very clean "talisman held aloft" read.
