# Plan: Unify Godot's card source on JSON (retire `.tres`)

**Status:** Plan complete, ready for review. Not yet executed. Lives on `claude/tier3-reconcile`.
**Relationship to other docs:** this is the *data-source* half of the standardization branch's deferred "Pass 5" (see [`STANDARDIZATION-PLAN.md`](STANDARDIZATION-PLAN.md) §6 and [`STANDARDIZATION-CONTEXT.md`](STANDARDIZATION-CONTEXT.md) §7 for the original mechanical sketch). It supersedes that sketch's *sequencing* by splitting Pass 5 into two pieces and coordinating the second with the effects/E1-E2 refactor.

## Context

Today a Godot card lives in **two** places: a hand-curated `cards/templates/<card_id>.tres` (the 23 playable cards, loaded by `CardDatabase.get_card`) **and** — for the 258 proto cards — `reference/html-proto/cards/<id>/card.json` (read by `engine/json_card_loader.gd`). Every card change risks an "edit two places" tax, and more importantly: **the effects/E1-E2 refactor will migrate all card data to the new effect/trigger shapes.** If Godot still has two sources at that point, the migration touches both — the 258 cards twice (once for any field work, once for the effect-shape work). Unifying on a single JSON source first means the big migration touches each card **once**.

The 258 proto cards are already JSON (standardization Pass 2). What remains is to make Godot's *playable pool* come from JSON too, and delete the 23 `.tres`.

## The coordination decision (the crux)

Split Pass 5 into two parts and sequence them around the refactor:

- **Part 1 — retire `.tres`, single JSON source (THIS plan; do before the refactor's card migration).** Bounded data-loading work: give the 23 Godot cards JSON forms, point `CardDatabase` at `JsonCardLoader`, rebuild the visual factory, delete the `.tres`. Does **not** require migrating any card's field/effect shape — the 23 cards are written in the *current* wire shape (what `JsonCardLoader` already reads via its remap tables).
- **Part 2 — full Godot-native field + effect/trigger migration (FOLD INTO the refactor, NOT a separate pass).** The 258-card field renames (`name`→`display_name`, `effects`→`on_cast_effects`, type/sub array forms, …) AND the dispatch-key snake_case sweep AND the new effect/trigger shapes (`target()`/`chooses()`, `scope`, `condition`, `card_zone_change`) all touch every card. Do them as **one** card-data migration during the effects/E1-E2 refactor so cards are touched once. `JsonCardLoader`'s remap tables (`_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`) survive through Part 1 and are deleted as part of Part 2 (the wire goes fully snake_case).

This plan covers **Part 1 only**. Part 2's mechanics are tracked with the refactor plans.

## Part 1 — steps

1. **Resolve the folder-name collision (Decision Q1, below) first** — it determines how the 23 cards are addressed.
2. **Give the 23 Godot cards JSON representations** in the current wire shape, under `reference/html-proto/cards/<id>/` (+ append to `cards/_manifest.json`). For cards that already exist in the proto pool (e.g. Godot `lightning_bolt` == proto `bolt`), reuse the proto card rather than duplicating — see Q1.
3. **Repoint `CardDatabase.get_card(card_id)`** (`cards/templates/card_database.gd`) to read from `JsonCardLoader.load_all()`'s map instead of `load("<card_id>.tres")`. Keep the same `get_card(card_id) -> CardResource` / `all_card_ids()` signatures so the engine, scenes, and tests are untouched. (They only call `CardDatabase.get_card(card_id)` today — `engine/engine.gd`, `tests/test_phase*.gd`.)
4. **Rebuild the visual factory** to load card faces from the JSON-backed `CardResource` instead of `.tres` (STANDARDIZATION-CONTEXT §7.5): a frame + art-insert rebuild of `scenes/card.tscn` and replacing `scenes/tres_card_factory.gd` with a JSON-backed factory. This also unlocks loading html-proto card-art PNGs (already on `docs/BACKLOG.md`).
5. **Delete the 23 `cards/templates/*.tres`** (and the now-unused `TresCardFactory`).
6. **Leave `JsonCardLoader`'s remap tables in place** — they're removed in Part 2 with the dispatch-key snake_case sweep.

## Decisions to make before executing

- **Q1 — folder/card-id collision.** Proto uses `bolt`; Godot uses `lightning_bolt` (and similar for the other overlapping basics/cards). Pick one naming and update references. STANDARDIZATION-CONTEXT §10 Q1 recommends renaming Godot's references to the proto folder names (fewer references — 23 vs 258), but that touches `engine.gd` init, the showcase deck, and `tests/test_phase*.gd` card-id strings. **Decision needed.**
- **Q2 — modal-card JSON shape.** Cards like `tideCharm`/`verdantCharm`/`oblation` use `effects: {modeNames, modes}`. `JsonCardLoader` currently produces empty `on_cast_effects` for them (they show unsupported). Needs a shape decision (a `ModalSpellResource`, or `on_cast_effects` accepting a modal dict). Only blocks *those* cards' playability, not Part 1 itself.
- **Q3 — `extraManaColors`.** The wire still carries `mana` + `extraManaColors`. **This interacts with the effects-plan §3.9 mana deep-clean** (lands → `add_mana` ability model, retiring `extraManaColors`). Coordinate: don't lock a representation here that §3.9 will rework. Simplest for Part 1: keep `JsonCardLoader`'s current `extraManaColors` handling; let §3.9 change it during the refactor.

## Sequencing

```
Part 1 (this plan) ──► effects + E1/E2 refactor (incl. Part 2 card migration) ──► remap tables deleted
```

Part 1 is independent of the refactor's design and can land first (it's pure data-loading). The refactor's card-data migration (Part 2) then runs against a single source.

## Risks / verification

- **Requires Godot** (not installed in the current container) — Part 1 is mostly Godot-side (`CardDatabase`, the visual factory, `.tres` deletion), so it must be executed and verified where Godot runs.
- **Verification:** boot supportability scan still loads all cards and the supported/awaiting counts are unchanged or better; the 23 formerly-`.tres` cards still resolve via `CardDatabase.get_card`; all phase smoke tests pass (`tests/test_phase*.tscn`); a card visually renders via the new JSON-backed factory.
- **Risk — silent UID/scene breakage** when deleting `.tres` and swapping the factory; the phase tests are the gate.
- **Risk — test card-id churn** if Q1 renames Godot ids; update `tests/test_phase*.gd` in the same change.

## Critical files

- `cards/templates/card_database.gd` (repoint `get_card` to JsonCardLoader)
- `engine/json_card_loader.gd` (the loader; remap tables stay until Part 2)
- `scenes/card.tscn`, `scenes/tres_card_factory.gd` (visual factory rebuild → JSON-backed)
- `cards/templates/*.tres` (deleted), `reference/html-proto/cards/<id>/card.json` + `cards/_manifest.json` (the 23 Godot cards added)
- Reference: `STANDARDIZATION-CONTEXT.md` §7, `STANDARDIZATION-PLAN.md` §6
