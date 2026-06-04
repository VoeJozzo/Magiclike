---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-02
updated: 2026-06-02
sources: ["docs/plans/plan-zone-change-and-composable-predicates.md", "docs/PROTOCOL.md", "docs/RULES.md"]
---

# Composable trigger predicates

A triggered ability's **condition** is built from small **atomic predicates composed into expressions**, not one monolithic predicate per card. A new card is usually a *composition* of existing primitives rather than new engine code — the predicate analogue of the engine's atomic, composable effects (see [[magiclike-architecture]]).

## Composition forms

A condition is one of (design spec: `docs/plans/plan-zone-change-and-composable-predicates.md`):

- a **bare name** — a single atomic predicate (`this_card`);
- a **call with args** — `card_moves(battlefield, graveyard)`;
- a **list** — implicit **AND** (every term must hold);
- a **tree** — `{op: and|or|not, terms: [...]}` for OR and negation.

A recursive evaluator walks the form, invoking each atomic through one uniform signature, `(state, source, event, args) -> bool`.

## Atomic primitives over a closed event set

Representative atomics: card identity (`this_card`, `another_card`), traits (`card_is_creature`, `card_has_subtype(x)`), zone transitions (`card_moves(from, to)`), control (`controlled_by(you|opp)`), life history (`is_life_gain` / `is_life_loss`). They hang off a **small, unified event vocabulary** — notably `card_zone_change` (one event for enters / dies / bounces, narrowed by a `card_moves(...)` constraint) plus `spell_cast`, `attacks`, and `life_changed` (a signed delta). One event + a zone constraint replaces a whole family of per-zone event kinds. (Canon: [[1000-triggered-abilities]]; catalogs: `docs/PROTOCOL.md` §3.3–§3.4.)

## Drain, ordering, self-vs-global

Matching triggers **queue**, then **drain to the stack in APNAP order** before priority opens; a trigger-chain depth cap guards against accidental infinite loops (see [[magiclike-architecture]]). `self_only` (the default) fires only when the source card is the event's subject; the rarer global form fires on any matching event.

## Why composable

Reuse (no new registry entry per card — "another creature you control enters" is just `another_card` + `controlled_by(you)` + `card_moves(anywhere, battlefield)`), unit-testability (each atomic is tiny and pure — see [[predicate-registry]]), and scalability (the primitive set stays small while expressivity grows). Realized in the [[html-proto]] (the primary development surface); the [[godot]] port currently has the simpler string-keyed [[predicate-registry]] (one `cond_id` → one function, no composition yet) and will adopt the composable model — see [[cross-engine-port]].

## See also

[[predicate-registry]] · [[magiclike-architecture]] · [[html-proto]] · [[cross-engine-port]] · [[magiclike]]
