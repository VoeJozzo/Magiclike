---
type: concept
tags: [magiclike, gamedev, meta]
created: 2026-06-02
updated: 2026-06-11
sources: ["docs/wiki/rules/", "docs/plans/plan-effects-refactor.md"]
---

# Staple / synthesis

Stapling (splicing) **merges two deck slots into one synthesized card** (`synthesizeStapledTemplate`), which then persists in the slot for the rest of a run. It's a reward option ([[1500-the-run|§1500]] — "Splice") and a vivid case of *composition over special-casing*.

## Type-canonical merge

The pair is canonicalized by a **type hierarchy** (Creature > Artifact > Land > Spell): the higher-priority type becomes the **base** (its identity dominates), the lower-priority the **staple** (it contributes a property). Dispatch is by *staple type*, not branch order (`docs/plans/plan-effects-refactor.md` §3.10):

- staple = **Creature** → body merge (stats / keywords / abilities union);
- staple = **Land** → the base gains the land's tap-for-mana ability (the unified land-as-ability model, §3.9);
- staple = **Spell** → if the base is a permanent, the spell's effects become an **ETB trigger**; if the base is a spell, the effects concatenate (a multi-target card).

## Notes

The merged card's text and behavior derive from the combined effects — no hand-concatenation (see [[procedural-card-text]]) — and a generic deep-clone carries fields forward so new schema fields staple automatically. On a Land base, the stapled spell's ETB is **optional and paid** ("you may pay {cost}") — a land is free to play, so a free stapled spell was pure value; the optional cost restores the bargain. Creature/artifact bases keep the ETB free, since the base's full cost was already paid.

Realized in the [[html-proto]]; [[godot]]-deferred (see [[cross-engine-port]]).

## See also

[[sticker-system]] · [[roguelike-meta]] · [[procedural-card-text]] · [[html-proto]] · [[magiclike]]
