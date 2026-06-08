---
type: rules
tags: [magiclike, rules]
section: "500"
created: 2026-06-04
updated: 2026-06-04
---

# 500. Turn Structure

*[[rulebook|Rulebook]] › §500*

A turn consists of ten phases, in this order:

| # | Phase | Active player gets priority? | Turn-based actions |
|---|---|---|---|
| 501 | Untap | No | Untap all permanents the active player controls; clear summoning sickness on their creatures; reset `life_lost_this_turn` to 0 for both players. |
| 502 | Upkeep | Yes | None currently. *(Reserved for "at beginning of upkeep" triggers.)* |
| 503 | Draw | No | Active player draws a card. (First player skips this on turn 1, see [[100-game-concepts|§100.5]].) |
| 504 | Main 1 | Yes | None. The active player may cast spells and activate abilities. |
| 505 | Combat: Declare Attackers | Yes | Active player declares attackers. |
| 506 | Combat: Declare Blockers | Yes (after blocks are declared) | Defending player declares blockers. Priority opens **after** block declarations are confirmed. |
| 507 | Combat: Damage | No | Combat damage is resolved (see [[800-combat]]). |
| 508 | Main 2 | Yes | None. Same as 504. |
| 509 | End | Yes | None currently. *(Reserved for "at end of turn" triggers.)* |
| 510 | Cleanup | No | Active player discards down to 7 cards (see §514). EOT modifiers clear from creatures. |

After 510, phase wraps to 501 and the active player swaps.

## 511. Untap step (501)
- Tap state cleared on all of the active player's permanents.
- All of the active player's creatures lose summoning sickness.
- Both players' `life_lost_this_turn` counters reset to 0.
- The active player does **not** get priority during untap.

## 512. Draw step (503)
- Active player draws one card from the top of their library.
- If their library is empty, they lose the game (see [[100-game-concepts|§100.6]]).
- The first player skips this step on the first turn of the game.

## 513. Combat damage step (507)
Combat damage is resolved in **up to two passes** — see [[800-combat|§801]] for the sequence. Priority does not open during this step; damage is a single turn-based action.

## 514. Cleanup step (510)
1. **EOT modifier clearance.** Each creature on the battlefield clears its end-of-turn modifiers: `temp_power`, `temp_toughness`, and any `eot_grants` (granted keywords with EOT duration) drop to zero / empty.
2. **Discard to max hand size.** If the active player has more than 7 cards in hand, they choose cards to discard until they have 7.
3. **Attacker/blocker state clear.** Combat-state arrays (`attackers`, `blockers`) are cleared so they don't leak into the next turn.

Priority does not open during cleanup. Discard is a turn-based action; no spells or abilities can be cast in response to it.

## Implementation status — Turn Structure
- 502 (upkeep) is a real phase but currently no triggers fire there. The phase exists for future "at beginning of upkeep" triggers.
- 509 (end step) similarly placeholder.
- **No Beginning-of-Combat step**: MTG has a separate step where "at beginning of combat" triggers fire. Our game does not — combat starts directly with declare attackers. If such triggers become useful, a phase needs to be inserted between Main 1 and Declare Attackers.
- 513 first-strike sequencing: see [[800-combat|§801]] for the current Godot implementation's two-pass scheme.
