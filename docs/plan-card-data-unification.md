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

1. **Apply the Q1 naming (decided below):** rename the 16 colliding proto folders to Godot's snake_case ids (+ their `_manifest.json` entries + any proto deck/test references), so each shared card resolves under one clean id.
2. **Give the Godot-only cards JSON representations** in the current wire shape, under `reference/html-proto/cards/<id>/` (+ append to `cards/_manifest.json`). The 5 basics and the 16 just-renamed cards already exist in the proto pool — reuse them rather than duplicating; only the 10 Godot-only cards (see Q1) are authored fresh.
3. **Repoint `CardDatabase.get_card(card_id)`** (`cards/templates/card_database.gd`) to read from `JsonCardLoader.load_all()`'s map instead of `load("<card_id>.tres")`. Keep the same `get_card(card_id) -> CardResource` / `all_card_ids()` signatures so the engine, scenes, and tests are untouched. (They only call `CardDatabase.get_card(card_id)` today — `engine/engine.gd`, `tests/test_phase*.gd`.)
4. **Rebuild the visual factory** to load card faces from the JSON-backed `CardResource` instead of `.tres` (STANDARDIZATION-CONTEXT §7.5): a frame + art-insert rebuild of `scenes/card.tscn` and replacing `scenes/tres_card_factory.gd` with a JSON-backed factory. This also unlocks loading html-proto card-art PNGs (already on `docs/BACKLOG.md`).
5. **Delete the 23 `cards/templates/*.tres`** (and the now-unused `TresCardFactory`).
6. **Leave `JsonCardLoader`'s remap tables in place** — they're removed in Part 2 with the dispatch-key snake_case sweep.

## Decisions

- **Q1 — folder/card-id collision. DECIDED: keep Godot's snake_case names; rename the colliding proto folders to match.** Unifying ids for cards shared by both pools was always part of standardization's "author once, consume in both" goal (STANDARDIZATION-PLAN §3.1; the collision was flagged at STANDARDIZATION-CONTEXT §7.4), and PROTOCOL.md §2.1 locks `card_id` as the stable, save-bearing id that matches the folder name. What was left open was only *which* name wins — the old rec was proto names; reversed here to Godot's because Godot's are correct and unabbreviated and adopting them fixes two mislabeled proto folders (`hastyOgre` is Raging Goblin, `cloudGiant` is Cloud Pegasus). The 5 basic lands already match verbatim. The 16 folders to rename (proto → Godot id): `bolt`→`lightning_bolt`, `bears`→`grizzly_bears`, `counter`→`counterspell`, `growth`→`giant_growth`, `serra`→`serra_angel`, `salve`→`healing_salve`, `airel`→`air_elemental`, `spider`→`giant_spider`, `bloodKnight`→`blood_knight`, `whiteKnight`→`white_knight`, `goblinRaider`→`goblin_raider`, `emberDrake`→`ember_drake`, `mistDjinn`→`mist_djinn`, `angelOfDawn`→`dawn_angel`, `hastyOgre`→`raging_goblin`, `cloudGiant`→`cloud_pegasus`. The 10 Godot-only cards (`bear_cub`, `bloodlust_berserker`, `goblin_duelist`, `gray_ogre`, `hill_giant`, `pyromaniac`, `trained_armodon`, `vampire_nighthawk`, `walking_wall`, `wind_drake`) get authored as new snake_case proto folders. Update each renamed folder + its `card_id` field + `_manifest.json` entry + any proto deck/test references to the old tplId, in one commit. **Scope (decided):** the remaining ~237 proto-only camelCase ids are *not* a cross-engine blocker (Godot lacks those cards) — full snake_case normalization is **backlogged** as a separate sweep, gated to run **before the Godot port consumes the full pool (Phase 6 expansion)**. See `docs/BACKLOG.md` → "Card data / wire format".
- **Q2 — modal-card JSON shape. DECIDED: defer.** This is a Godot-side gap only — the proto engine already plays modal cards (`tideCharm`/`verdantCharm`/`oblation`); Godot's `JsonCardLoader` just doesn't translate the `effects: {modeNames, modes}` shape, so those cards show unsupported in Godot. Not needed for Part 1 and blocks nothing currently playable. Pick the shape (`ModalSpellResource` vs a modal dict in `on_cast_effects`) when the active card pool actually needs modal spells (Phase 6+), designing from real examples.
- **Q3 — `extraManaColors`. Resolved by effects-plan §3.9, with the Godot consumer now explicitly owned (review GAP 1).** The wire still carries `mana` + `extraManaColors`; §3.9's mana deep-clean (lands → `add_mana` ability model) reworks it and retires `extraManaColors`. Slice 1 keeps `JsonCardLoader`'s current handling (it reuses the still-`extraManaColors` basics). The risk was an unowned seam: once §3.9 drops `extraManaColors` from the shared land JSON, Godot's loader (`json_card_loader.gd:209–217`) would read nothing and basics would tap for zero. §3.9 now closes this — it adds a land-ability→`mana_produced` translation to `JsonCardLoader` **in the same slice** that retires `extraManaColors`. See `plan-effects-refactor.md` §3.9 "Godot coordination note."

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
