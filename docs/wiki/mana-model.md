---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-04
updated: 2026-06-04
sources: ["docs/PROTOCOL.md", "docs/ARCHITECTURE.md", "docs/plans/plan-effects-refactor.md"]
---

# Mana model

Mana production is **unified, not special-cased**: a land's tap-for-mana is an ordinary **activated ability**, and a land is just a permanent that happens to have one. The same path serves mana dorks and any future source. Two rules give the model its shape, and one deliberate exception keeps it from deadlocking.

## The principle

- **Pools empty at phase boundaries.** Mana never floats across a phase or step ([[600-priority-and-the-stack|§604]]). This keeps the turn structure honest — you can't bank mana between windows.
- **Lands as abilities.** A land's `{T}: Add C` is auto-constructed from its produced colors and lives as an activated ability, not engine-special-cased land logic ([[300-card-types|§301]]). Multi-color sources use a **choice form** (`add_mana {choose: …}`) instead of bespoke dual-land code.
- **The mana-ability fast-path.** Mana abilities resolve **immediately, bypassing the stack** ([[700-casting-and-activating|§705]]). This isn't a shortcut — it's *necessary*: if paying a spell's cost itself went on the stack and required priority, casting would deadlock (you'd need priority to produce the mana for the thing you already have priority to do). It's the one principled exception to "everything flows through the stack."

## Realized vs. planned

The land-as-ability model is **realized in the [[html-proto]]** (the old per-land `extraManaColors` special case was retired). The [[godot]] port is converging on the same *internal* model — not just the wire shape — so both engines tap lands through one ability path rather than a translation bridge. Mana-timing status and the convergence plan: `docs/DIVERGENCE.md` and `docs/plans/plan-effects-refactor.md` §3.9.

## Boundaries (link, don't restate)

Canonical mana-cost and color rules are canon ([[200-parts-of-a-card|§200.2]], [[600-priority-and-the-stack|§604]], [[700-casting-and-activating|§705]]); the `add_mana` wire shape and its choice form are `docs/PROTOCOL.md` §3.9; the mana-pool and payment internals are `docs/ARCHITECTURE.md` §2.5.

## See also

[[atomic-effects]] · [[staple-synthesis]] · [[magiclike-architecture]] · [[html-proto]]
