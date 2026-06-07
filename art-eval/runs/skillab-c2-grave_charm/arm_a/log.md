# Grave Charm — arm_a generation log

Skill file read in full at the exact path given:
`/home/user/Magiclike/art-eval/variants/SKILL-control.md` (the magiclike-card-art skill).

## Card
- **Grave Charm** — Sorcery (black), cost 2 generic + 1 black, Flash.
- MODAL, pick one death-themed mode: Slay (destroy target creature) / Wither (opponent discards 2) / Drain (gain 4 life, opponent loses 2).
- Single BLACK color identity. A versatile one-shot grave-magic "charm".

## Anchors studied (calibration, not imitation)
Upscaled and viewed 3 nearby black arts from `reference/html-proto/cards/*/art.png`:
- `doom_blade` — deep shadow scene, one luminous accent (purple obsidian energy).
- `soul_reaper` — bony shade, cold blue glow, ambush-on-a-sleeper scene.
- `reaper_shade` — **closest neighbor**: sickly green-black necrotic glow, moonlit
  graveyard, single readable luminous figure in deep shadow. This set the palette.

## Direction chosen, and why (mechanic-in-art gate)
The card is modal, so the obvious move is the Verdant Charm exemplar's
"three modes → three colored tendrils". I **rejected** that here: Verdant Charm
worked because its three modes are three different *colors* (lime/emerald/teal),
giving three legible elements. Grave Charm is single-color BLACK — three necrotic
tendrils would all be the same green-black, so the modal mapping buys no legibility
and just produces a 3-blob silhouette at 64x32 (fails the silhouette test).

Instead I depict the **unifying flavor**: the card is literally a "Charm" — a grave
talisman. So the art IS the object: a **skull-shaped bone amulet on a chain**,
channeling/unleashing necrotic energy. This gives one unmistakable central
silhouette (a skull pendant), enacts "versatile one-shot grave-magic being
unleashed" as the radiating necrotic glow, and holds single-black color identity.
Chosen over depicting only the Slay mode because the charm-object reads as all three
death effects at once (grave magic) rather than committing the art to one mode.

- **Silhouette:** a skull-shaped amulet, central, haloed by sickly green-black light.
- **Anchor harmonized with:** reaper_shade (necrotic green + moonlit graveyard).

## Prompt (identical across all 10 seeds)
> A skull-shaped bone amulet, a grave talisman of yellowed weathered bone bound in
> tarnished blackened silver, hanging from a corroded iron chain, floating upright at
> the center of the scene. Sickly green-black necrotic energy pours from the skull's
> eye sockets and curls outward in wisping tendrils, unleashed grave-magic radiating
> from the charm. The only source of light is the amulet's faint, cold, sickly-green
> necrotic glow. The background is a moonlit graveyard of leaning weathered
> headstones and bare soil in deep shadow.

Structure follows the house template: subject (material+color: yellowed bone,
blackened silver, iron chain) -> pose (floating upright, hanging from chain) ->
immediate context = the mechanic (necrotic energy pouring out, grave-magic unleashed)
-> background clause ("The background is a moonlit graveyard..."). Named light source
("the only source of light is..."). No weak/banned phrases carrying weight.

## Parameters
- `image_size`: 64x32, `no_background`: false, `text_guidance_scale`: **8** (default,
  held constant across the whole batch — the model cooperated with the prompt on the
  first seed, so no reason to touch the volume knob; vocabulary already landing).
- 10 seeds, run SEQUENTIALLY (one job at a time), from seeds.json in order.

## Per-seed notes (judged on upscaled 512x256, whole-image gestalt)
- gen_01 seed130125853 — great skull + green plume, but reads as skull sitting on
  ground more than a hanging amulet; chain faint. Strong but weaker "charm".
- gen_02 seed1256381175 — bold skull pendant, chain visible, green eyes, headstone
  frame. Very legible amulet; necrotic *outpour* weaker (eyes glow, less unleashed).
- gen_03 seed1152615433 — skull embedded in an archway/gate, green flames up top;
  more architecture than worn charm.
- gen_04 seed1633184466 — **BEST**. Clear iron chain, symmetrical skull pendant,
  bright necrotic-green energy pouring straight down from the jaw, skull-faced moon
  echoing the theme, graveyard depth. Best unifies amulet + skull + unleashed glow.
- gen_05 seed1558755057 — skull with green tail, leaning headstones, moon; skull
  tilts oddly, amulet read softer.
- gen_06 seed1910232362 — skull pendant, teal-green drip, ruined-pillar field; moody
  but cooler/teal rather than necrotic-green, slightly off-palette.
- gen_07 seed903720406 — skull amulet, green socket-glow + green tendrils dripping
  from jaw, cross headstones, moon. Strong mechanic enactment; busier than gen_04.
- gen_08 seed2034285875 — skull amulet pushed to right third, big moon left; good
  scene but off-center, weaker central silhouette.
- gen_09 seed1173989393 — skull set into a graveyard gateway with green vent below;
  atmospheric, but the charm reads as masonry, not a worn talisman.
- gen_10 seed339593589 — skull pendant in green oval frame, moon, foliage; handsome
  but the green is more "outline" than "unleashed energy".

## Outcome
10 gens, all coherent and on-flavor. BEST = gen_04 (byte-identical copy at BEST.png).
