---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-04
updated: 2026-06-04
sources: ["docs/PROTOCOL.md", "docs/ARCHITECTURE.md", "docs/plans/plan-effects-refactor.md"]
---

# Atomic effects

Card behavior is expressed as a **closed registry of small, composable effect primitives** — not one bespoke handler per card. A new card is usually a *composition* of existing atoms, not new engine code. This is the effect-side twin of [[composable-predicates]] (conditions), and the reason [[procedural-card-text]] and AI card-valuation can operate over **one uniform vocabulary**.

## The principle

- **Atomic, not monolithic.** A monolith like `fight_target` decomposes into a `fight` primitive over operands; `embargo` / `bleach` collapse into `move_card` + `apply_sticker` (see [[sticker-system]]). The prototype's effects refactor brings ~38 effect kinds down to ~22 atoms.
- **Targeting is a separate layer.** A `target()` step (and its `chooses()` cousin) precedes the effect rather than being re-implemented inside each handler — so legality and hexproof are enforced once, structurally (see [[targeting-and-hexproof]]).
- **Breadth via parameters, not variants.** A `scope` parameter (`damage(all_creatures)`) replaces parallel `damage` + `damage_all` kinds — one configurable atom instead of a family.
- **Composition over special-casing.** The same primitives feed three consumers at once — card-text generation, AI valuation, new-card authoring. A monolith forces each to special-case it; an atom is understood by all three for free.

## Realized vs. planned

The atomic model is **realized in the [[html-proto]]** (single/mass unification, the `move_card` family, the `apply_sticker` pipeline, the `target()`/`chooses()` split). The [[godot]] port has the first handful of atoms native (damage, add_mana, pump, gain_life, counter); adopting the full registry + targeting layer is the port's own effects refactor, sequenced after the current phase. A few effects (e.g. `exile_until_eot`) stay monolithic on *both* engines by design until the delayed-trigger queue lands — a deliberate cross-engine symmetry, tracked in `docs/DIVERGENCE.md`.

## Boundaries (link, don't restate)

The canonical **effect-kind catalog** and dispatch contract are the cross-engine wire spec (`docs/PROTOCOL.md` §3.2 / §4); the Godot handler shapes live in `docs/ARCHITECTURE.md` §2.5; the refactor's rationale and disposition table are `docs/plans/plan-effects-refactor.md`; resolution and fizzle are canon ([[700-casting-and-activating|§704]]).

## See also

[[composable-predicates]] · [[targeting-and-hexproof]] · [[mana-model]] · [[sticker-system]] · [[procedural-card-text]] · [[magiclike-architecture]] · [[html-proto]]
