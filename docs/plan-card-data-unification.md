# Plan: Unify Godot's card source on JSON (retire `.tres`)

**Status:** Plan complete, ready for review. Not yet executed. Lives on `claude/tier3-reconcile`. Backlogged for its own PR -- see `docs/BACKLOG.md` -> "Card data / wire format".

> **Update (PR #37 / v2.0.70 -- sequencing has drifted ahead of this plan).** The plan below assumes Part 1 leaves `JsonCardLoader`'s remap tables in place and Part 2 (folded into the effects refactor) later takes the wire fully snake_case. That ordering no longer holds: the wire **already went snake_case** during standardization, so the four remap tables (`_EFFECT_KIND_REMAP` / `_EVENT_KIND_REMAP` / `_KEYWORD_REMAP` / `_TARGET_FILTER_REMAP`) are **already deleted** (PR #37), and the v2.0.70 type cutover removed the bare `type`/`sub` fields so `JsonCardLoader._build_resource` **already classifies cards off the `types[]` array**. Two specific notes below are now STALE: the "Part 2" paragraph's claim that the remap tables "survive through Part 1", and **step 6** ("leave the remap tables in place"). Net: Part 2's field-rename + snake_case sweep is largely done; what remains of this plan is the **data-source switch + visual-factory rebuild** (steps 1-5). Re-scope when picking this up.

**Relationship to other docs:** this is the *data-source* half of the standardization branch's deferred "Pass 5" (see [`STANDARDIZATION-PLAN.md`](STANDARDIZATION-PLAN.md) §6 and [`STANDARDIZATION-CONTEXT.md`](STANDARDIZATION-CONTEXT.md) §7 for the original mechanical sketch). It supersedes that sketch's *sequencing* by splitting Pass 5 into two pieces and coordinating the second with the effects/E1-E2 refactor.

## Context

Today a Godot card lives in **two** places: a hand-curated `cards/templates/<card_id>.tres` (the 23 playable cards, loaded by `CardDatabase.get_card`) **and** — for the 258 proto cards — `reference/html-proto/cards/<id>/card.json` (read by `engine/json_card_loader.gd`). Every card change risks an "edit two places" tax, and more importantly: **the effects/E1-E2 refactor will migrate all card data to the new effect/trigger shapes.** If Godot still has two sources at that point, the migration touches both — the 258 cards twice (once for any field work, once for the effect-shape work). Unifying on a single JSON source first means the big migration touches each card **once**.

The 258 proto cards are already JSON (standardization Pass 2). What remains is to make Godot's *playable pool* come from JSON too, and delete the 23 `.tres`.

## The coordination decision (the crux)

Split Pass 5 into two parts and sequence them around the refactor:

- **Part 1 — retire `.tres`, single JSON source (THIS plan; do before the refactor's card migration).** Bounded data-loading work: give the 31 Godot card templates (26 cards + 5 lands) JSON forms, point `CardDatabase` at `JsonCardLoader`, rebuild the visual factory, delete the `.tres`. Does **not** require migrating any card's field/effect shape — the templates are written in the *current* wire shape (what `JsonCardLoader` already reads via its remap tables).
- **Part 2 — full Godot-native field + effect/trigger migration (FOLD INTO the refactor, NOT a separate pass).** The 258-card field renames (`name`→`display_name`, `effects`→`on_cast_effects`, type/sub array forms, …) AND the dispatch-key snake_case sweep AND the new effect/trigger shapes (`target()`/`chooses()`, `scope`, `condition`, `card_zone_change`) all touch every card. Do them as **one** card-data migration during the effects/E1-E2 refactor so cards are touched once. `JsonCardLoader`'s remap tables (`_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`, `_TARGET_FILTER_REMAP`) survive through Part 1 and are deleted as part of Part 2 (the wire goes fully snake_case).

This plan covers **Part 1 only**. Part 2's mechanics are tracked with the refactor plans.

## Part 1 — steps

1. **Apply the Q1 naming (decided below):** rename the 16 colliding proto folders to Godot's snake_case ids (+ their `_manifest.json` entries + any proto deck/test references), so each shared card resolves under one clean id.
2. **Give the Godot-only cards JSON representations** in the current wire shape, under `reference/html-proto/cards/<id>/` (+ append to `cards/_manifest.json`). The 5 basics and the 16 just-renamed cards already exist in the proto pool — reuse them rather than duplicating; only the 10 Godot-only cards (see Q1) are authored fresh.
3. **Repoint `CardDatabase.get_card(card_id)`** (`cards/templates/card_database.gd`) to read from `JsonCardLoader.load_all()`'s map instead of `load("<card_id>.tres")`. Keep the same `get_card(card_id) -> CardResource` / `all_card_ids()` signatures so the engine, scenes, and tests are untouched. (They only call `CardDatabase.get_card(card_id)` today — `engine/engine.gd`, `tests/test_phase*.gd`.)
4. **Rebuild the visual factory** to load card faces from the JSON-backed `CardResource` instead of `.tres` (STANDARDIZATION-CONTEXT §7.5): a frame + art-insert rebuild of `scenes/card.tscn` and replacing `scenes/tres_card_factory.gd` with a JSON-backed factory. This also unlocks loading html-proto card-art PNGs (already on `docs/BACKLOG.md`).
5. **Delete the 23 `cards/templates/*.tres`** (and the now-unused `TresCardFactory`).
6. **Leave `JsonCardLoader`'s remap tables in place** — they're removed in Part 2 with the dispatch-key snake_case sweep. *(Stale per the v2.0.70 update note above — the tables are already gone.)*

## Part 1 blockers — loader / timing correctness bugs (PR #37 review)

A second review pass (PR #37, post-card-structure changes) found six correctness
bugs in `engine/json_card_loader.gd` and the `has_type("instant")` timing gates.
They are **latent today**: `JsonCardLoader`'s output is never put into play (the
loader runs only for the boot supportability diagnostic; the live game still
materializes cards from `.tres` via `CardDatabase.get_card()`). Each becomes
**correctness-critical the moment step 3 flips the data source to JSON**, so they
are part of Part 1's definition of done. All confirmed against the code during
the review.

1. **Flash keyword dropped at ingest for every spell.**
   `_build_resource` copies `json.keywords` ONLY in the `governing == "creature"`
   branch. The `sorcery`/`instant` branch builds a bare `SpellResource`, which has
   no `keywords` field at all — so `flash` is lost for every spell (e.g.
   `lightning_bolt.json` = `types:["Sorcery"]`, `keywords:["flash"]`). Compounding
   it, `card_instance.gd.effective_keywords()` only reads `template.keywords` when
   `template is CreatureResource`. *Fix:* give `SpellResource` (or base
   `CardResource`) a `keywords` field, copy it for all governing types, and have
   `effective_keywords()` read it regardless of subclass. Without this, no JSON
   spell can be cast at instant speed once the source flips.

2. **Spell target tokens make cards uncastable.**
   The loader writes raw tokens (`opp`, `opp_creature`, `your_creature`,
   `permanent`, `permanent_or_spell`, `graveyard_creature`) into
   `SpellResource.target_filter` and sets `requires_target = true`, but
   `engine.gd`'s `_enumerate_filter_targets` / `_target_matches_filter` only
   understand `creature_or_player`, `creature`, `player`, `spell`. Every other
   token hits the `_:` default → empty target list / `false`, so
   `_legal_cast_spell` rejects the cast and the card is uncastable. The loader
   also stores only the bare token and **drops the structured `target_filter`
   object** (e.g. living_lands' `{type:"Land"}`), so even handled tokens lose
   their restriction. *Fix:* teach the engine's target enumerator/matcher the full
   token set and thread the structured filter object through. (The Proto matcher
   `matchFilter` is the reference — note its `filter.type` branch was just added
   on the Proto side in this same PR.)

3. **`has_type("instant")` timing gates never got the `is_spell()` bridge.**
   `is_spell()` in `data/card_resource.gd` was bridged to accept BOTH `"instant"`
   (`.tres`) and `"sorcery"` (JSON), but the instant-speed *timing* checks remain
   raw `has_type("instant")` literals at 5 sites: `engine.gd:636`, `engine.gd:1310`,
   `ai/ai.gd:261`, `game_board.gd:971`, `game_board.gd:1086`. These pass for
   `.tres` cards but fail for JSON cards (`Sorcery`+`flash`), forcing every JSON
   spell to sorcery speed. The Proto reference gates on the `flash` keyword, not a
   type. *Fix (deeper altitude):* add one accessor —
   `CardResource.is_instant_speed()` returning
   `has_keyword("flash") or has_type("instant")` — and route all 5 sites through
   it. Collapses the policy to one place and matches the flash model.

4. **`supportability_report` keys are stale → false boot readiness signal.**
   It reads `trig.get("cond_id")` (migrated triggers use a composable `condition`
   array — `cond_id` never exists, so the predicate check silently passes
   everything) and `_FIRED_EVENT_KINDS` lists only `card_enters_battlefield` /
   `card_dies` / `card_discarded` while migrated cards use `card_zone_change`,
   `attacks`, `life_changed`, `spell_cast` (so real events are miscounted as
   "missing" and inflate the unsupported total). Verified against
   `ravenous_chupacabra`, `sengir_vampire`, `warchanter`. *Fix:* read the
   `condition` array, parse predicate ids out of it, and update
   `_FIRED_EVENT_KINDS` to the real event names the engine fires.

5. **Dead camelCase `extraManaColors` read; multi-color lands lose colors.**
   The land branch reads `json.get("extraManaColors", [])` — a camelCase key no
   card emits (the loader header itself declares camelCase remaps removed). Today
   it's a dead no-op loop; the moment a dual land is authored in snake_case
   (`extra_mana_colors`) its extra colors are silently dropped. Separately,
   City-of-Brass-style "{T}: add any" lands carry mana in abilities, not a
   top-level `mana` string, so they'd load producing only `["C"]`. *Fix:* derive
   `mana_produced` from the card's tap-for-mana ability(ies) (mirroring Proto's
   `landProducibleColors`), not a frozen field. (This is the same convergence Q3
   already commits to — see Q3 below.)

6. **Loader duplicates the type system; latent Enchantment drift.**
   `_GOVERNING_PRECEDENCE` is byte-identical to `_CARD_TYPE_TAGS`, and both
   hand-port the precedence logic that conceptually belongs to the type system
   (Proto `types.js`). The loader's list also disagrees with
   `data/card_resource.gd` (which already treats `enchantment` as a permanent) —
   an Enchantment JSON card would classify its tag as a *subtype* and load as a
   non-permanent base resource. *Fix:* collapse the two consts; longer-term, one
   shared type registry that both the loader and `CardResource` consult, mirroring
   `types.js`. (We are NOT implementing enchantments now — this is purely about not
   re-encoding type precedence in three places that can drift.)

## Decisions

- **Q1 — folder/card-id collision. DECIDED: keep Godot's snake_case names; rename the colliding proto folders to match.** Unifying ids for cards shared by both pools was always part of standardization's "author once, consume in both" goal (STANDARDIZATION-PLAN §3.1; the collision was flagged at STANDARDIZATION-CONTEXT §7.4), and PROTOCOL.md §2.1 locks `card_id` as the stable, save-bearing id that matches the folder name. What was left open was only *which* name wins — the old rec was proto names; reversed here to Godot's because Godot's are correct and unabbreviated and adopting them fixes two mislabeled proto folders (`hastyOgre` is Raging Goblin, `cloudGiant` is Cloud Pegasus). The 5 basic lands already match verbatim. The 16 folders to rename (proto → Godot id): `bolt`→`lightning_bolt`, `bears`→`grizzly_bears`, `counter`→`counterspell`, `growth`→`giant_growth`, `serra`→`serra_angel`, `salve`→`healing_salve`, `airel`→`air_elemental`, `spider`→`giant_spider`, `bloodKnight`→`blood_knight`, `whiteKnight`→`white_knight`, `goblinRaider`→`goblin_raider`, `emberDrake`→`ember_drake`, `mistDjinn`→`mist_djinn`, `angelOfDawn`→`dawn_angel`, `hastyOgre`→`raging_goblin`, `cloudGiant`→`cloud_pegasus`. The 10 Godot-only cards (`bear_cub`, `bloodlust_berserker`, `goblin_duelist`, `gray_ogre`, `hill_giant`, `pyromaniac`, `trained_armodon`, `vampire_nighthawk`, `walking_wall`, `wind_drake`) get authored as new snake_case proto folders. Update each renamed folder + its `card_id` field + `_manifest.json` entry + any proto deck/test references to the old tplId, in one commit. **Scope (decided):** the remaining ~237 proto-only camelCase ids are *not* a cross-engine blocker (Godot lacks those cards) — full snake_case normalization is **backlogged** as a separate sweep, gated to run **before the Godot port consumes the full pool (Phase 6 expansion)**. See `docs/BACKLOG.md` → "Card data / wire format".
- **Q2 — modal-card JSON shape. DECIDED: defer.** This is a Godot-side gap only — the proto engine already plays modal cards (`tideCharm`/`verdantCharm`/`oblation`); Godot's `JsonCardLoader` just doesn't translate the `effects: {modeNames, modes}` shape, so those cards show unsupported in Godot. Not needed for Part 1 and blocks nothing currently playable. Pick the shape (`ModalSpellResource` vs a modal dict in `on_cast_effects`) when the active card pool actually needs modal spells (Phase 6+), designing from real examples.
- **Q3 — `extraManaColors`. Resolved by effects-plan §3.9, with the Godot consumer explicitly owned (review GAP 1; full convergence — option 3 — decided).** The wire still carries `mana` + `extraManaColors`; §3.9's mana deep-clean reworks lands to the `add_mana` ability model and retires `extraManaColors`. Slice 1 keeps `JsonCardLoader`'s current handling (it reuses the still-`extraManaColors` basics). The risk was an unowned seam: once §3.9 drops `extraManaColors` from the shared land JSON, Godot's loader (`json_card_loader.gd:209–217`) would read nothing and basics would tap for zero. **Decided fix — full convergence:** §3.9 has Godot *adopt the land-as-ability model internally* in the same slice that retires `extraManaColors` — `JsonCardLoader` produces the tap-ability onto `CardResource` and Godot's mana resolution runs it (not a translation back to `mana_produced`). Both engines end structurally identical (wire and internals), and the turn-one break is dissolved by construction. See `plan-effects-refactor.md` §3.9 "Godot coordination — FULL CONVERGENCE."

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
- `cards/templates/*.tres` (deleted), `reference/html-proto/cards/<id>/card.json` + `cards/_manifest.json` (the 31 Godot card templates added)
- Reference: `STANDARDIZATION-CONTEXT.md` §7, `STANDARDIZATION-PLAN.md` §6
