# Gilded Seat — arm_a (control skill) generation log

Skill file read in full at the exact path: `/home/user/Magiclike/art-eval/variants/SKILL-control.md`
(This is the magiclike-card-art skill content.)

## Card
- Name: **Gilded Seat**
- Type line: Artifact Land — Plains
- Produces: white mana (W)
- card.json (`reference/html-proto/cards/gilded_seat/card.json`): types `[Artifact, Land, Plains]`, mana `W`, art emoji `🪙` (ignored per skill — placeholder, not direction).

## How I applied the skill

This is an autonomous A/B run, so I performed the skill's brainstorm/anchor/prompt-construction
reasoning myself rather than pitching to a live art director.

1. **Card lookup.** Read the whole card.json. It is a **literal-card, not a story-card**: a land
   depicts a PLACE/OBJECT, not an action. The "mechanic" to enact is *type-line + color identity*:
   an artifact LAND that taps for WHITE mana = an ornate gilded throne as a **seat of sanctified,
   white-aligned authority**, EMPTY/unoccupied (the seat itself is the subject), set in a real
   plains-temple place — not a sprite on void.
2. **Anchor study.** Viewed `rally_the_troops` and `field_marshal` (white set arts) upscaled 8x to
   calibrate to the set's warm-light painterly pixel vocabulary. There is no `plains/art.png` to anchor on.
3. **Mechanic-in-art.** Color identity = single white with gold accents → gleaming sunlit gold throne,
   ivory/white velvet cushion, warm white holy radiance, pale marble columns (plains-temple). White
   contrast carried by the cushion + radiance so it doesn't read as a pure-gold artifact.
4. **Silhouette test (64x32):** single readable shape = a tall symmetric throne centered in the frame,
   flanked by two vertical columns, on a marble dais. Clean and legible at postage-stamp size.
5. **Vocabulary precision / no weak phrases carrying weight.** Specific nouns: "gilded throne",
   "ivory and white velvet cushion", "gold filigree", "marble dais", "pale marble columns",
   "sanctified plains temple hall". Described the scene positively; no banned adjectives carrying load.
6. **Scene, not sprite.** `no_background:false` PLUS an explicit background clause (temple hall +
   columns + golden light) so pixflux delivers a scene, not a throne floating on transparency.
7. **Judged the whole image at 8x**, the full spread, not just the parts.

## Settings (consistent across the whole batch)
- endpoint: POST https://api.pixellab.ai/v2/create-image-pixflux
- image_size: 64x32
- no_background: false
- text_guidance_scale: **8** (skill default; the model cooperated with this prompt fully — no need to
  fight it, so no bump. Held constant across all seeds for a clean A/B.)
- One prompt across all seeds (variance sampling over the shared seed list).

## Prompt (identical for all 10 seeds)

> An ornate gilded throne of polished sunlit gold with an ivory and white velvet cushion, the high
> carved seat empty and unoccupied, viewed straight on and centered in the frame. Soft warm white holy
> radiance haloes the throne from behind, gold filigree gleaming, a marble dais step before it. The
> background is a sanctified plains temple hall flanked by pale marble columns, warm golden light
> filling the air.

Note: gens 01 and 02 were produced by a prior partial run in this arm dir before this session's log
existed (no recorded prompt for them); they depict the same concept and were kept as part of the
10-seed spread. Gens 03–10 used the prompt above.

## Per-seed notes (judged at 8x)
| gen | seed | read |
|-----|------|------|
| 01 | 351648827 | Glowing gold throne in arched hall, smaller throne, very warm/abstract. Good, soft. |
| 02 | 1460998231 | Gold throne, white cushion, marble columns, bright white backlight. Crisp, strong. |
| 03 | 1144474749 | Gold throne, ivory cushion, columns, dim warm hall. Clean, slightly dark. |
| 04 | 211786753 | **BEST** — tall symmetric gold throne, bright ivory cushion, crisp gilding, marble columns, tiered dais. Best legibility + white contrast. |
| 05 | 209330206 | Very clean, ornate gold throne, white cushion, bright columns + radiance. Close runner-up. |
| 06 | 549398877 | Heavily gilded throne; cushion reads beige/gold — less white contrast. |
| 07 | 865544161 | Pale stone throne with gold trim, columns. Good but more stone than gold. |
| 08 | 532678229 | All-gold ornate throne; cushion absorbed into gold — weaker white read. |
| 09 | 214238410 | Throne deeper in a colonnaded hall, more depth, slightly busier. |
| 10 | 905333058 | Symmetric throne with white column-pedestals flanking, white cushion. Strong runner-up. |

## Output
- 10 raw 64x32 PNGs `gen_01..gen_10_seed<seed>.png` + matching `_8x.png` upscales (PIL NEAREST 512x256).
- BEST.png = exact byte copy of gen_04_seed211786753.png (verified `cmp` identical).
