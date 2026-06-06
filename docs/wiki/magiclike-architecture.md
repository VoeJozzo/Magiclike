---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-02
updated: 2026-06-04
sources: ["magiclike repo: CLAUDE.md (Architecture decisions; Patterns to NOT/REPLICATE)", "docs/ARCHITECTURE.md", "docs/wiki/rules/"]
---

# Magiclike — engine architecture

The durable shape and rationale of [[magiclike]]'s rules engine — the *why* behind the design, which changes only by deliberate redesign. (Current module inventory and runtime contracts — modules, action/effect/`ctx` shapes — live in the repo at `ARCHITECTURE.md` and the root `CLAUDE.md`. Live status lives in the repo, not here.)

## The core stance

The engine is a **pure-data rules engine with no UI imports**, reimplemented natively from the [[html-proto]] (see [[cross-engine-port]]). A few decisions define its shape:

- **One autoload, `RulesEngine`** (`engine/engine.gd`) is the state holder + action dispatcher — the closest Godot fit to the prototype's single IIFE singleton. (Named `RulesEngine`, not `Engine`, because Godot reserves that global.)
- **State lives in `RefCounted` classes** — `Player`, `ManaPool`, `Stack`, `PhaseMachine`, `CardInstance`, `EngineState` — each instantiable in tests without autoload boilerplate, and each carrying a `duplicate_deep()` for AI snapshots.
- **Data on `EngineState`, behavior on `RulesEngine`.** `EngineState` is a passive container; all game-logic behavior (settling, dispatch, priority, trigger drain, combat) lives on the autoload. The dependency is strictly **one-way** — `RulesEngine` reads/writes `EngineState`, never the reverse — so helpers that need dispatch or legality never get pushed onto the state class (which would force a circular reference).
- **All mutation flows through one entry point**, the [[action-descriptor-pattern]] (`execute_action`).
- **Triggered-ability conditions resolve through a [[predicate-registry]]** (string-keyed, boot-validated).

## Real stack and priority from day one

The stack is a real LIFO that holds **spells *and* triggered abilities**; both resolve through the same machinery. Priority follows MTG rules where it matters — the caster retains priority after casting (MTG 117.1c), mana empties at phase boundaries (106.4), the defender declares blocks before priority opens at the block step (509.1a), and triggers drain in APNAP order (603.3b). (Canon, in the project's own numbering: [[600-priority-and-the-stack|§600 Priority and the Stack]] and [[1000-triggered-abilities|§1000 Triggered Abilities]].)

This was a deliberate "no shortcuts" choice — a full priority/stack model up front rather than a resolve-immediately loop that would have to be ripped out later. The pragmatic auto-passes that exist (the AI driver auto-passing, the player's pass-priority keybind, SBAs swept in a single pass rather than strict 704.5 order) are **agent/UX conveniences, not rules cheats**: the priority pass genuinely happens — the `_settle_state` loop is just calling `execute_action(pass_priority)` for the AI or an unattended window ([[600-priority-and-the-stack|§606]]). Config for explicit stop-on-X priority holds is parked in `BACKLOG.md`.

## Atomic, composable effects

Effects are small, **composable primitives**, not monolithic handlers — a new card is usually a *composition* of existing atoms, not new engine code. Targeting is a separate layer, breadth comes from parameters rather than variants, and one vocabulary serves card-text, AI valuation, and authoring alike. This has its own home: [[atomic-effects]] (with [[targeting-and-hexproof]] and [[mana-model]] for the targeting and mana facets).

## Design discipline (ported from the prototype's scars)

The prototype is the behavioral reference, but its engine carries known scars from organic growth. The standing rule is **port the behavior, not the implementation shape** (see [[cross-engine-port]]). Concretely:

- **No autoload reach from predicates or effect handlers** — they take explicit arguments and resolve without reading global state. The rationale and the prototype's cautionary closure pattern live in [[predicate-registry]].
- **No per-instance state as dynamically-attached dictionary fields.** Use typed properties on `CardInstance` / `Player`. The prototype's City of Brass `extraManaColors` — silently lost on instantiation — is the cautionary tale; the `duplicate_deep()` overrides exist precisely to prevent that class of bug.
- **The engine stays UI-free.** It emits a structured "trigger fired" signal and lets the presentation layer render the log/text; it never calls the text generator itself. (The prototype's lone `triggerLogText()` call from engine into card-text is the deliberate exception, isolated so the Godot port is a clean "swap the call for a signal emit" — see [[procedural-card-text]] and [[cross-engine-port]].)
- **Trigger-chain depth cap.** Mirror the prototype's hardcoded cap on nested trigger resolutions — real card design produces accidental infinite loops, and the cap costs essentially nothing. (Status and gate: `DIVERGENCE.md` E6.)

## See also

[[action-descriptor-pattern]] · [[predicate-registry]] · [[cross-engine-port]] · [[html-proto]] · [[magiclike]] · [[godot]]
