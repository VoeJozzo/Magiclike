---
type: concept
tags: [magiclike, architecture, gamedev]
created: 2026-06-06
updated: 2026-06-06
sources: ["reference/html-proto/js/types.js", "docs/PROTOCOL.md", "docs/ARCHITECTURE.md", "reference/html-proto/CHANGELOG.md (v2.0.70 cutover, v2.0.85 addType)"]
---

# Type identity

A card's entire type line — supertypes, types, and subtypes — is **one `types[]` tag array, read through one accessor layer**. There is no parallel representation: the legacy `card.type` (single string) and `card.sub` (space-separated subtypes) fields were removed in the v2.0.70 cutover. This is the type-side twin of the one-entry-point discipline behind [[action-descriptor-pattern]] (mutation) and [[predicate-registry]] (conditions) — identity lives in exactly one place, so "what type is this card" has a single, testable answer.

## The principle

- **One array, no parallel store.** A card (data *and* runtime instance) carries a single `types[]`. Every engine/render read goes through `types.js`; nothing touches the raw array. `card.type` / `card.sub` are gone.
- **An open registry classifies tags.** `TYPE_REGISTRY` maps each *known* tag → `{ category, behaviorClass? }`: category ∈ `type` (left of the em-dash) / `subtype` (right) / `supertype`; `behaviorClass` ∈ `spell` / `permanent` / `land`. **Unknown tags default to a behavior-less subtype** — so adding a new creature/land subtype (Goblin, Cleric, Forest…) needs *no* registry entry. Supertypes today are `Basic` and `Legendary`; the legend rule is a cast-time `hasType('Legendary')` check, **not** a registry hook.
- **A live modifier layer sits on the stored base.** `card.typeGrants` (`add_type` / `set_types`) is applied **per-read** inside `typesOf`: a `set` grant replaces the working set, an `add` grant unions tags in (in order; EOT grants clear at end of turn, leave-play grants clear in `resetInPlayState`). So animate ("becomes a creature") and neutralize effects reflect everywhere without mutating the base array. The `Legendary` supertype is always unioned in so the legend rule keeps firing.
- **One write helper, dedup against the *stored* base.** `addType(card, tag)` (added v2.0.85) is the single write counterpart to `hasType` — sticker subtype-rolls and staple-merge unions route through it instead of a raw `types.push` idiom. The subtle invariant: dedup is against `card.types` (the permanent store), **not** the effective set (`typesOf`). A permanently-rolled subtype must be stored even while a *temporary* `typeGrants` grant happens to provide it — an effective-set dedup would drop the store and the tag would vanish when the grant clears.

## The governing-type "two forks"

A card can carry several type tags; `governingType` picks the single behavioral type that drives zone / cast / combat:

1. **Permanent beats spell.** If any permanent type is present, a permanent governs.
2. **Among permanents:** `Creature > Land > Artifact` (Artifact is a co-type).
3. Otherwise a spell type governs.

`isPermanent` is simply "governing type isn't a spell." `typeLine` renders the display string in canonical order — `<supertypes> <types> — <subtypes>` (e.g. basics carry both `Basic` and `Land`, rendered "Basic Land"). `subtypesOf` is the one definition of "this card's subtypes," read by subtype predicates ([[composable-predicates]]), lord-buff matching, and the rolls above.

## Realized vs. planned

**Realized in the [[html-proto]]** (the v2.0.70 type-system cutover; `addType` closed the last raw-access hole in v2.0.85). The [[godot]] port's data side is simpler today — `CardResource.card_types` + `has_type`, with no live-modifier layer or governing-fork accessor yet (animate / set-type effects are later-phase work). The single-source-of-truth + accessor discipline is the shared design the port will mirror. One latent data divergence exists between the two Godot card stores — the `.tres` registry says `card_types: ["instant"]` while the JSON says `types: ["Sorcery"]` (the Instant→flash-Sorcery retirement never reached the `.tres`); it's harmless today and is dissolved by the card-data-unification plan.

## Boundaries (link, don't restate)

The canonical card-type **rules** (lands/creatures/instants/sorceries, the legend rule, summoning sickness) are [[300-card-types]] — this page is the engine *model*, not the rules. The `types` wire field and supertype handling are `docs/PROTOCOL.md`; the Godot data shape is `docs/ARCHITECTURE.md` + `data/card_resource.gd`; the `.tres`/JSON divergence and retirement plan are `docs/BACKLOG.md` + `docs/plans/plan-card-data-unification.md`.

## See also

[[300-card-types]] · [[atomic-effects]] · [[composable-predicates]] · [[sticker-system]] · [[staple-synthesis]] · [[magiclike-architecture]] · [[cross-engine-port]] · [[html-proto]]
