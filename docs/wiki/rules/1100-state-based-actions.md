---
type: rules
tags: [magiclike, rules]
section: "1100"
created: 2026-06-04
updated: 2026-06-04
source: docs/RULES.md §1100
---

# 1100. State-Based Actions

*[[rulebook|Rulebook]] › §1100*

State-based actions (SBAs) are checks the engine performs **automatically** whenever a player would gain priority. They are the engine's housekeeping for "things that just happen."

## 1101. SBA contents
On every sweep, the engine checks:
- **Creature death**: any creature with damage marked equal to or greater than its current toughness, or toughness ≤ 0, or `lethal_marked = true` (from deathtouch) is moved to its owner's graveyard. **Indestructible creatures are exempt from the lethal/lethal-marked checks** but still die at 0 toughness.
- **Life loss**: a player at 0 or less life loses the game (see [[100-game-concepts|§100.6]]).
- **Decking out**: handled in the draw step (not strictly an SBA in our implementation — see [[500-turn-structure|§512]]).

## 1102. SBA sweep order
A sweep is a single pass: identify all SBA-affected objects, then apply them simultaneously. After applying, the sweep **repeats** until no further changes occur (in case a death triggers another death via chain effects).

A safety counter caps the sweep at 20 iterations to prevent runaway loops. This cap is a safety net for correctness bugs; under correct rules it should never be hit.

## 1103. When SBAs run
SBAs sweep:
- Whenever a player would gain priority.
- After each pass of combat damage resolution.
- Implicitly after spell/ability resolution.

## 1104. Compared to MTG
MTG specifies SBA contents in rule 704.5 with strict ordering. Our SBA sweep is **simpler**:
- We don't strictly order the checks within a sweep — we collect all affected objects and apply them in one pass.
- We don't check token-not-on-battlefield (no tokens in Godot port yet; html-proto handles tokens vanishing on leave-play).
- We don't check aura/equipment attachment validity (no auras/equipment yet).
- We don't check legendary uniqueness (no legendaries yet).

## Implementation status — SBAs
- 1104 deviations from MTG 704.5: documented.
- 1101 zero-toughness check: implemented.
