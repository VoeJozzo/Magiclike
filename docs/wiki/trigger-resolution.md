---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-04
updated: 2026-06-04
sources: ["docs/wiki/rules/1000-triggered-abilities.md", "docs/ARCHITECTURE.md", "docs/DIVERGENCE.md", "magiclike repo: CLAUDE.md"]
---

# Trigger resolution

The *orchestration* of triggered abilities once they fire — the **queue → drain → resolve** choreography. It's the complement to the condition side: [[predicate-registry]] answers "does this trigger match?" and [[composable-predicates]] "how is the condition built?"; this page is "now that it matched, how does it actually resolve, and in what order?"

## The principle

- **Queue, don't stack immediately.** When an event fires, matching triggers are *enqueued* (`pending_triggers`), not pushed onto the stack on the spot ([[1000-triggered-abilities|§1004]]).
- **Drain in APNAP order before priority opens.** The engine drains the queue onto the stack active-player-first; under the stack's LIFO this puts the non-active player's triggers on top to resolve first — the canonical APNAP outcome ([[1000-triggered-abilities|§1004]]).
- **The settle loop is the backbone.** A single settle loop owns the cadence — drain triggers, resolve the top stack entry, run state-based actions, advance the phase — rather than scattering these across call sites (`docs/ARCHITECTURE.md` §2.6).
- **Targets pause the drain.** A trigger that needs a target halts the drain (`awaiting_target_for_trigger`) until its controller submits a pick ([[1000-triggered-abilities|§1005]]).
- **A depth cap guards the loop.** Nested trigger resolutions are capped (proto: 100) and bail with a warning — cheap insurance against the accidental infinite loops that real card design *does* produce. An explicit **replicate-from-proto** directive ([[1000-triggered-abilities|§1008]]).

## Realized vs. planned

Queue-and-drain, APNAP ordering, the settle loop, and the target-pause are **live in both engines**. The one gap is the **trigger-chain depth cap**: the [[html-proto]] has it; the [[godot]] port is to mirror proto's threshold (a "Patterns to REPLICATE" directive, gated in `docs/DIVERGENCE.md` E6).

## Boundaries (link, don't restate)

Canonical trigger semantics (when they fire, intervening-if, fizzle) are canon ([[1000-triggered-abilities]]); condition matching and composition live in [[predicate-registry]] and [[composable-predicates]]; the event vocabulary is catalogued in `docs/PROTOCOL.md` and summarized in [[composable-predicates]].

## See also

[[predicate-registry]] · [[composable-predicates]] · [[atomic-effects]] · [[magiclike-architecture]] · [[html-proto]]
