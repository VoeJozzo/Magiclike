---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-02
updated: 2026-06-02
sources: ["magiclike repo: CLAUDE.md (Architecture decisions; Patterns to NOT replicate)", "engine/predicates/predicates.gd"]
---

# Predicate registry

[[magiclike]]'s triggered-ability **conditions are referenced by string name**, not inline code. A card resource carries a `cond_id` (e.g. `"opp_lost_life_this_turn"`); the registry at `engine/predicates/predicates.gd` resolves that name to a function with the signature `cond_x(state, source, event) -> bool`.

## Why string-keyed indirection

- Implementations can be swapped, or shared across many cards, without touching resource files — the card references a *name*, not a function body.
- A **boot-time validation pass** walks every loaded card, collects each `cond_id`, and errors on any name missing from the registry, so typos surface at startup rather than mid-game.

## The purity rule

Predicates — and effect handlers — **must not reach into autoloads.** A predicate takes `(state, source, event)` and returns a bool; an effect handler takes `(ctx, params, target)` and resolves. Neither reads `RulesEngine.state()` from inside itself.

This is the single most important thing **not** to replicate from the [[html-proto]] (see [[cross-engine-port]]): the prototype's predicates close over global state (the `G[them].lifeLostThisTurn` pattern), which is its worst habit for testability. Passing full state explicitly as the first argument keeps every predicate and handler unit-testable in isolation.

## See also

[[magiclike-architecture]] · [[action-descriptor-pattern]] · [[composable-predicates]] · [[trigger-resolution]] · [[cross-engine-port]] · [[magiclike]]
