---
type: rules
tags: [magiclike, rules]
section: "1200"
created: 2026-06-04
updated: 2026-06-04
---

# 1200. Ending the Game

*[[rulebook|Rulebook]] › §1200*

## 1201. Game-over triggers
The game ends immediately when a player loses. The losing condition is detected via SBAs ([[1100-state-based-actions|§1101]]) or via the draw-from-empty-library check ([[500-turn-structure|§512]]).

## 1202. Effects after game end
Once `state.winner` is non-empty, the engine **does not process further actions or triggers**. Stacked spells and queued triggers are abandoned. The `game_over` signal fires once.

## 1203. Restart and rematch
A finished game does not transition automatically. The roguelike meta layer ([[1500-the-run]]) handles game-to-game progression in the html-proto. The Godot port does not yet implement game-to-game transitions.
