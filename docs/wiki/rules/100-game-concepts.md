---
type: rules
tags: [magiclike, rules]
section: "100"
created: 2026-06-04
updated: 2026-06-04
---

# 100. Game Concepts

*[[rulebook|Rulebook]] › §100*

## 100.1 Players
A game of Magiclike is played between exactly two players: **you** and **opp**. There are no multiplayer formats.

## 100.2 Starting life total
Each player begins the game with **20 life**.

## 100.3 The deck
- Each player has a **deck**, used to populate their library at game start.
- Within a single game, a deck is fixed. Both players' libraries are shuffled at the start of the game.
- Deck composition is determined by the run-meta layer (see [[1400-draft]] and [[1500-the-run]]); the rules in this section assume a deck already exists.

## 100.4 Starting hand
At the start of the game, each player **draws seven cards** from their library into their hand.

**Forced mulligan.** If a player's opening hand contains 0, 1, 6, or 7 lands (statistically extreme — screwed or flooded), the drawn portion is reshuffled into the library and a fresh 7 is drawn. This forced mulligan is **automatic and one-shot** — no player choice, no recursion. The reshuffle preserves any "innate" starting cards (run-meta features that begin in hand); only the drawn 7 portion is reshuffled.

There is no traditional player-choice mulligan (Vancouver, London, etc.).

## 100.5 First player
- One player is the **active player** for turn 1.
- For the html-proto, this is randomized at game start.
- The first player **skips their draw step on turn 1**.

## 100.6 Win and loss conditions
A player **loses the game** if any of the following becomes true:
- Their life total is 0 or less.
- They attempt to draw a card with an empty library.
- They concede. *(Not yet implemented — there is no concede action.)*

A player **wins the game** when their opponent loses.

Both players losing simultaneously is treated as the active player losing (the inactive player wins). *(Not yet tested.)*

## 100.7 Game state and information
- **All zones are public except the hand and the library.** The opponent's hand is hidden; both players' libraries are hidden (face-down).
- The game log is public to both players.

## Implementation status — Game Concepts
- 100.4 forced mulligan: implemented in html-proto only. Godot port has no mulligan logic — opening hands stand as drawn regardless of land count. See `docs/DIVERGENCE.md` A4.
- 100.5 random first player: html-proto randomizes; Godot port currently uses a fixed first player. See `docs/DIVERGENCE.md` A1.
- 100.6 concede: implemented in html-proto only. Godot port has no concede action. See `docs/DIVERGENCE.md` A5.
