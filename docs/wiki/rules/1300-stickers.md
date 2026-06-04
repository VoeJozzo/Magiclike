---
type: rules
tags: [magiclike, rules, meta-game]
section: "1300"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §1300
---

# 1300. Stickers

*[[rulebook|Rulebook]] › §1300 · meta-game layer — operates between games, persisting across a run (html-proto-realized; Godot Phase 7).*

> Durable design rationale for this system lives in the concept wiki: [[sticker-system]].

## 1301. Purpose
A sticker is a per-instance modifier attached to a deck slot that persists across games within a run. Stickers are the primary reward currency.

## 1302. Sticker types
- **Keyword sticker** — grants a keyword (e.g., `flying`, `lifelink`) to the creature in the slot.
- **Stat sticker** — grants a stat increase (e.g., +1/+1 permanently).
- **Empower sticker** — increases an effect's magnitude (e.g., Lightning Bolt deals 4 instead of 3). Requires a target effect on the card; rolled at sticker application time.
- **Subtype sticker** — grants an additional subtype (e.g., "+Wizard"). Rolled at application time.

## 1303. Legality
Each sticker type has eligibility rules:
- Keyword stickers require a creature.
- Stat stickers require a creature.
- Empower stickers require the card to have at least one empowerable effect (damage, draw, pump, etc.).
- Lifelink keyword stickers require a damage-dealing source.

## 1304. Stacking and limits
- Multiple stickers can stack on a single slot.
- Some sticker types are non-stackable on the same slot (the same keyword cannot apply twice).
- A creature's effective keywords are the union of its template keywords plus all granted keywords plus all sticker-granted keywords.

## 1305. Persistence
- Stickers are tied to the **deck slot**, not the card instance in play. If the same template appears in multiple slots, only the stickered slot benefits.
- Stickers persist across all games within a run; they are lost when the run ends.

## Implementation status — Stickers
- Fully implemented in html-proto.
- Not yet implemented in Godot port. Planned for Phase 7.
- The seam in `CardInstance.effective_keywords()` is reserved to union template + grants + sticker contributions.
