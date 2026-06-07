# Gilded Seat — arm_b generation log

Skill applied: `/home/user/Magiclike/art-eval/variants/SKILL-c2-variant.md` (read in full, exact path).

## Card
- **Gilded Seat** — Artifact Land — Plains, produces W (`reference/html-proto/cards/gilded_seat/card.json`).
- Read as a **literal-card**, not a story-card: a land depicts a PLACE/OBJECT, not an action. So the mechanic-in-art job is to depict the throne convincingly *as a seat of white-aligned power* — empty (the SEAT is the subject), gilded gold with ivory/white identity, sited in a real sanctified plains setting.

## Skill discipline applied
- **Mechanic-in-art for a land:** the object itself is the subject. Made it EMPTY/unoccupied and explicitly "the sole subject ... no figure seated" so the seat, not an occupant, is what the eye lands on — that is what "land tapping for white mana" wants to read as.
- **Color-identity discipline:** single white identity with gold accents — "gleaming gilded gold," "ivory and white-velvet cushioned seat," "warm white holy radiance," "bright ivory wall." No off-color contamination.
- **Vocabulary precision (specific nouns over compositional description):** "gilded gold," "sunburst filigree," "high arched back," "pale marble steps," "crepuscular rays," "pale sandstone columns" — precise material/phenomenon nouns rather than vague shape descriptions.
- **Sprite-bias defense (no_background:false is necessary-but-not-sufficient):** added an explicit background clause naming the periphery — "the sunlit interior of a sanctified plains temple hall with tall pale sandstone columns and a bright ivory wall" — so the model renders a SCENE, not a throne on void. It worked: every roll has columns + steps + wall, none floated on transparency.
- **Named light source:** "warm white holy radiance and crepuscular rays pour down ... soft sunlit glow haloing the seat" — the white/holy light is a load-bearing element, carrying the white identity.
- **Reach, don't hedge:** committed to specific materials/light/setting rather than a safe generic throne.
- **Anchors studied:** `field_marshal` (white set vocabulary) and the existing arm_b gens. The set's white cards lean warm-gold + bright light, which this matches.

## Settings (constant across all 10)
- `image_size`: 64x32
- `no_background`: false
- `text_guidance_scale`: 8 (default; kept constant — the model cooperated with the prompt, no need to bump)
- One prompt across all 10 seeds (no per-seed iteration needed; concept clicked immediately and held consistently).

## Final prompt (identical for all seeds)
> An ornate empty throne of gleaming gilded gold with an ivory and white-velvet cushioned seat, carved with sunburst filigree and a high arched back, standing unoccupied at the top of pale marble steps. The throne is the sole subject, centered and facing the viewer, no figure seated. Warm white holy radiance and crepuscular rays pour down onto the gold, soft sunlit glow haloing the seat. The background is the sunlit interior of a sanctified plains temple hall with tall pale sandstone columns and a bright ivory wall.

## Seeds (in order) and per-seed notes
| gen | seed | read |
|---|---|---|
| 01 | 351648827 | Clean, well-framed, columns + steps; throne sits a touch small in frame. |
| 02 | 1460998231 | Bold large throne, rich gold; slight blob where seatback meets cushion. |
| 03 | 1144474749 | Weakest — throne back reads as an oval mirror, less throne-like. |
| 04 | 211786753 | **BEST.** Crisp vivid gilded filigree, clear armrests + arched back, bright warm-white glow, columns + marble steps. Reads instantly as a throne; richest gold, cleanest silhouette. |
| 05 | 209330206 | Excellent, symmetric, gold-capped columns, bright white light; seatback panel slightly plain grey. |
| 06 | 549398877 | Great gold crown; seatback reads a bit empty/oval, sky background slightly off-theme. |
| 07 | 865544161 | Strong gold, very bright white halo; seatback a little soft. |
| 08 | 532678229 | Bold throne, deep columns, good gold; slight blob in seatback. |
| 09 | 214238410 | Weak — back reads as a mirror/oval like 03. |
| 10 | 905333058 | Very clean ivory-white seat in gold frame; strong white identity. |

## BEST
`gen_04_seed211786753.png` → copied byte-identical to `BEST.png`.
