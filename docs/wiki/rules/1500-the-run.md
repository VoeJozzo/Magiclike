---
type: rules
tags: [magiclike, rules, meta-game]
section: "1500"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §1500
---

# 1500. The Run (Roguelike Meta)

*[[rulebook|Rulebook]] › §1500 · meta-game layer — operates between games, persisting across a run (html-proto-realized; Godot Phase 9).*

> Durable design rationale lives in the concept wiki: [[roguelike-meta]] (and [[staple-synthesis]] for the Splice reward).

## 1501. Structure
A **run** is a sequence of games against successively more difficult opponents. The player drafts a deck once at the start; the deck (and its stickers) persists across all games in the run.

## 1502. The map
- A branching DAG of nodes, Slay-the-Spire style.
- Depth 5, width 3. One root, one exit; mid-nodes branch.
- Mid-nodes are either **colored** (the opponent's deck is drafted with that color affinity) or **colorless** (random colors).
- The exit node is a **boss**: a constructed archetype.

## 1503. Per-game opponent scaling
- Each game N adds `N - 1` stickers to the opponent's deck.
- Opponent decks may also gain spliced cards (`stapledTpls`), cloned slots, or both, scaling with depth.

## 1504. Rewards
After winning a game, the player picks one of up to three reward offers. Reward types (weighted):
- **Sticker** (weight 12) — apply a sticker to a slot in the deck.
- **TwoStickers** (3) — apply two stickers (often to one slot for a polarized threat).
- **Transform** (2) — replace a slot with a draft pack of 3 cards, pick one.
- **Clone** (2) — duplicate the highest-value non-land slot.
- **Splice** (2) — combine two slots into a single multi-effect card.
- **RipUp** (1) — remove a slot from the deck.
- **ThreeStickersBlind** (1) — apply three random stickers to a random creature slot (mystery offer).

## 1505. Run-start modifiers (Neow-style)
At the start of a run, the player may choose a **modifier** (e.g., City of Brass adds a free mana source, Watcher's Gift attaches a bonus trigger to a chosen creature). Modifiers can append extra slots or mutate existing slots.

## 1506. Persistence and crash recovery
- Run state persists in browser `localStorage` (`magiclike_run_v1` key) in the html-proto.
- The Godot port will use `user://magiclike_run_v1.json` via Godot's `FileAccess` (planned for Phase 9).
- At the start of each new game in the run, a **midGameSlotsSnapshot** is taken. If the player quits mid-game and reloads, slots are restored from the snapshot — this prevents reward-farming by quit-on-loss.

## Implementation status — Run
- Fully implemented in html-proto (save schema version 2, migrations for v1→v2 tplId renames).
- Not yet implemented in Godot port. Planned for Phase 9.
