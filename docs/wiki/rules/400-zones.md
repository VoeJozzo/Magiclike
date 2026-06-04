---
type: rules
tags: [magiclike, rules]
section: "400"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §400
---

# 400. Zones

*[[rulebook|Rulebook]] › §400*

There are five zones per player plus one shared zone. All five per-player zones are private only for hand and library (see [[100-game-concepts|§100.7]]).

## 401. Library
- The player's deck, face-down.
- Ordered (top to bottom).
- Drawing takes from the top.
- Emptying the library is itself harmless; only **attempting to draw from an empty library** loses the game (see [[100-game-concepts|§100.6]]).

## 402. Hand
- The cards a player has drawn but not yet played or discarded.
- **Maximum hand size: 7.** Enforced in cleanup step ([[500-turn-structure|§514]]).
- Hidden from the opponent.

## 403. Battlefield
- The shared field where permanents (lands, creatures, artifacts, enchantments) reside.
- Public.
- Each permanent on the battlefield is controlled by some player; control can differ from ownership (a permanent's "owner" is who started with it in their deck; "controller" is who currently makes decisions for it).

## 404. Graveyard
- A player's discard/dead-card pile.
- Public, ordered.
- Cards in the graveyard are not playable from the graveyard. *(Future cards may grant graveyard interactions.)*

## 405. Stack
- A shared zone holding spells and triggered abilities that have been cast/triggered but not yet resolved.
- LIFO (last in, first out).
- See [[600-priority-and-the-stack]].

## 406. Exile
- A "removed from game" zone. Public, unordered.
- Currently no card moves cards to exile. *(Reserved for future cards.)*

## 407. Zone changes
A card on the battlefield that leaves the battlefield is a **new object** when it returns. Its instance id is preserved for ongoing tracking, but persistent runtime state (counters, granted keywords, marked damage) is cleared on leave-play.

## Implementation status — Zones
- 406 exile: zone exists in `Player` but no effects use it.
- 407: counters and granted keywords currently clear on leave-play; some `permaBuffs` in html-proto persist across leave-play for specific run-meta scenarios (Elystra-style). Godot port does not have permaBuffs yet.
