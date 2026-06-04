---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-04
updated: 2026-06-04
sources: ["docs/PROTOCOL.md", "docs/plans/plan-effects-refactor.md"]
---

# Targeting & hexproof

Targeting is its **own layer**, separate from effects: a spell or ability declares a `target()` step whose legality is checked once, up front — so restrictions like **hexproof** are enforced *structurally* at that step and never re-implemented inside each effect.

## The principle

- **A `target()` step precedes effects.** Legal targets are chosen and locked at cast/activation time, then re-checked at resolution ([[700-casting-and-activating|§703]], [[700-casting-and-activating|§704]]).
- **Hexproof is a targeting-time gate.** It's checked once, at `target()` — not per effect, and not as damage prevention ([[900-keywords|§904]]). An effect handler never asks "is this hexproof?"; by the time it runs, the target is already legal.
- **`target()` vs `chooses()`.** A *targeted* pick (hexproof applies) is distinct from a *chosen* one made by the affected player (hexproof doesn't). Edicts prove the split: `target(player) → chooses(creature) → sacrifice` — only the player is targeted, so a hexproof creature can still be sacrificed. A flat "targets a creature" model would get this wrong.
- **Mass effects skip the layer.** A `scope`-based effect (e.g. `damage(all_creatures)`) carries no `target()` step, so it never checks hexproof — automatically correct, no special case.
- **Illegal at resolution → fizzle.** If a locked target is gone (left play, flickered), the spell fizzles ([[700-casting-and-activating|§704]]) — the re-check is structural, not per-effect.
- **Mid-resolution departure → last-known information, not fizzle.** Fizzle covers a target that's *already* gone when the spell starts resolving. But when a multi-effect spell's target leaves *between* its effects (e.g. *exile target creature, then its controller gains life equal to its power*), the later effects don't fizzle — they read a **last-known-information snapshot** taken at the instant the target left its zone; while it's still in its zone they read live state. (The "D1" hybrid — `docs/DIVERGENCE.md` §3.6; realized in the [[html-proto]], [[godot]]-pending.)

## Realized vs. planned

The decomposition is **realized in the [[html-proto]]** (hexproof enforced at `target()`, the edict `chooses()` prompt). The [[godot]] port adopts it with its effects refactor; multi-target shapes (a handful of cards) are the last piece pending the full migration. Plan and status: `docs/plans/plan-effects-refactor.md` §3.5.

## Boundaries (link, don't restate)

The `target()` / `chooses()` primitives and the `target_filter` catalog are the wire spec (`docs/PROTOCOL.md` §3.5); target-legality and fizzle rules are canon ([[700-casting-and-activating|§703]]–[[700-casting-and-activating|§704]]); hexproof's full text is [[900-keywords|§904]].

## See also

[[atomic-effects]] · [[composable-predicates]] · [[magiclike-architecture]] · [[html-proto]]
