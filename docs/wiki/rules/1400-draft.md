---
type: rules
tags: [magiclike, rules, meta-game]
section: "1400"
created: 2026-06-04
updated: 2026-06-11
---

# 1400. Draft

*[[rulebook|Rulebook]] › §1400 · meta-game layer — operates between games, persisting across a run (html-proto-realized; Godot Phase 8).*

> Durable design rationale for the draft + run sits in the concept wiki: [[roguelike-meta]].

## 1401. Pack structure
- The deck is built by drafting **23 cards over 23 picks** (one card per pack).
- Each pack contains **3 cards**.
- Pack cards are sampled from a pool consisting of all non-special card templates.

## 1402. Pack rolling
- Each pack slot rolls a color, then a card of that color from the pool.
- **In-deck colors are weighted higher** (rescue against color screw).
- **Off-deck colors drop from the pool** after the first appearance of a different color choice.
- Cards have an optional `draftWeight` field; default 1.0; 0 excludes from packs.

## 1403. Player pick
- The player sees 3 cards per pack and picks one.
- The two unpicked cards are discarded (no pack-passing in single-player draft).

## 1404. Opponent deck
- Built at the end of the player's draft.
- Two modes:
  - **Heuristic draft sim**: the AI drafts 23 cards using the same pack-rolling and scoring system.
  - **Constructed archetype**: a hand-curated deck list (Goblin Aggro, Spirit Tribal, Aristocrats, Archdemon Boss, Balancer Boss, Equatorial Artificer Boss). Used for special map nodes.

## 1405. Lands
- In classic mode, after the draft, lands are auto-allocated to fill the deck to 40 cards.
- Land color distribution matches the deck's color distribution (~17 lands typical).
- **Constructed decks may declare an explicit `lands` list**, which replaces auto-allocation; deck size then follows the list. The Equatorial Artificer boss ships 23 spells + 10 Equatorial Engines — a 33-card deck by design (test-pinned).
- In Desert Cube mode no land allocation occurs — lands are drafted directly (§1406).

## 1406. Desert Cube mode
- An alternate draft mode, selectable on the start screen.
- The player makes **40 picks** — the full deck, lands included. There is **no post-draft land allocation**.
- After each pack is rolled normally, each slot independently has a **~1/3 chance** of being substituted with a basic land. Substitution happens after the color-aware roll, so spell sampling keeps its color bias (§1402).
- Identical basics are deduplicated within a pack — a pack never offers two copies of the same basic land.

## Implementation status — Draft
- Fully implemented in html-proto.
- Not yet implemented in Godot port. Planned for Phase 8.
