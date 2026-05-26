# Coordinated Refactor — Master Sequencing

**Status:** Conductor for the one coordinated refactor pass. The detailed specs live in the four sub-plans; this doc says **what lands when, in what order, on which engine, and how each slice is verified.** Lives on `claude/tier3-reconcile`.

## Context

The user's intent throughout has been **one large coordinated pass, not a series of small branching ones**, so the engines integrate cleanly and new cards (Phase 6 expansion) are authored in the final shapes instead of accumulating in the old style. Every design fork is resolved (rip, sticker decomposition, targeting `target()`/`chooses()`, mana deep-clean, the 12 composable predicates, etc.). This doc orders the four sub-plans into a single program with checkpoints, so it can be sliced and each slice ships test-green.

This pass is sequenced **before** `godot-port-plan.md` Phase 6 (card-pool expansion) — that's the whole point: don't grow the pool in the pre-refactor style.

## The four workstreams

| # | Sub-plan (detailed spec) | Scope | Engines | Effort |
|---|---|---|---|---|
| A | [`plan-priority-window-refactor.md`](plan-priority-window-refactor.md) | B6/B7 — `_open_priority_window` helper, auto-pass, end-turn fast-forward, `KIND_TAP_LAND_FOR_MANA` | Godot only | M (~8h) |
| B | [`plan-card-data-unification.md`](plan-card-data-unification.md) **Part 1** | Retire `.tres`; JSON single source (`CardDatabase`→`JsonCardLoader`, visual-factory rebuild) | Godot only | M (~1 day) |
| C | [`plan-zone-change-and-composable-predicates.md`](plan-zone-change-and-composable-predicates.md) | E1/E2 — unified `card_zone_change` event + 12 atomic composable predicates | Both | L (~35h) |
| D | [`plan-effects-refactor.md`](plan-effects-refactor.md) | 38→19 atomic effects + `target()`/`chooses()` (§3.5) + sticker (§3.8) + mana deep-clean w/ full-convergence Godot land-as-ability (§3.9) + staple cleanup (§3.10) + rip incl. built `annihilate` (§13); **carries card-data Part 2** (full field/effect/trigger migration of all cards) | Both | L (~80–85h) |

Rough total **~131–146h (~4 weeks)** — sliceable; each slice below leaves both engines runnable and test-green.

## Dependency graph

```
A  priority-window ─────────────┐  (independent; Godot-only; touches no card data)
                                 │
B  card-data Part 1 ────────────┤  (single JSON source — do before any card migration
   (retire .tres)               │   so each later slice migrates ONE source, not two)
                                 ▼
C  E1/E2 (card_zone_change) ─────►  prerequisite for D's move_card (emits card_zone_change)
                                 │
                                 ▼
D  effects refactor ────────────►  includes card-data Part 2 (the full card migration)
   ├─ flicker decomposition .......... no extra dep
   └─ exile_until_eot decomposition ... needs B4 (delayed-trigger machinery) ──┐
                                                                               │
   B4 (Godot delayed-trigger queue) ───────────────────────────────────────────┘
   (proto already has delayedTriggers; Godot adds it as a sub-step of D)
```

## Slice order

**Slice 0 — Priority-window (A).** Smallest, independent, Godot-only, touches no card data — a clean warm-up that de-risks the harness before the card-touching work. Mechanical migration of the 8 priority-assignment sites + `KIND_TAP_LAND_FOR_MANA` + `KIND_END_TURN`. *(Forward note already in the plan: when Godot later adopts the §3.9 land-as-ability model, generalize `KIND_TAP_LAND_FOR_MANA` to an `is_mana_ability` classification.)*
**Gate:** all Godot phase smoke tests pass; new `test_priority_window` cases pass.

**Slice 1 — Card-data single source (B / Part 1).** Retire `.tres`; point `CardDatabase.get_card` at `JsonCardLoader`; rebuild the visual factory; JSON-ify the 23 Godot cards. Lands **before** C and D so their card migrations run against one JSON source. Carries decision **Q1** (folder-name collision).
**Gate:** boot supportability scan loads all cards, counts unchanged; the 23 formerly-`.tres` cards still resolve + render; phase tests pass.

**Slice 2 — E1/E2 (C).** Unified `card_zone_change` event + the 12 composable predicates; migrate trigger cards (both engines, on the single source). Prerequisite for D's `move_card`.
**Gate:** proto `node tests/run_all.js` + golden-event trigger tests + selfplay; Godot phase-4 trigger tests; `card_zone_change` emitted alongside legacy events during cutover, then legacy removed.

**Slice 3 — Effects (D).** The big one: register the 19 atomics (incl. `annihilate`, built this pass — no rip kludge, review OBS 1), the `target()`/`chooses()` targeting model (§3.5, incl. the human `chooses()` prompt — review GAP 2), the sticker pipeline (§3.8), the mana deep-clean (§3.9 — `extraManaColors` retired here, which resolves card-data **Q3**; full convergence chosen — Godot adopts the land-as-ability model *internally* this slice, dissolving review GAP 1 by construction, and `KIND_TAP_LAND_FOR_MANA` generalizes to `is_mana_ability`), the staple cleanup (§3.10), rip (§13), and **card-data Part 2** — the full field + effect/trigger migration of all cards, which also deletes `JsonCardLoader`'s remap tables (dispatch keys go fully snake_case). `flicker` decomposes immediately; `exile_until_eot` waits on **B4** (delayed-trigger machinery), added as a sub-step. The §3.7 iid regression test targets `exileUntilEOT`, not flicker (review CORRECTION 1).
**Gate:** per-atomic unit tests; hexproof regression (CRITICAL — §12.2); last-known-info + iid-mint regressions; signed-pump; selfplay harness; supportability scan climbs as handlers land.

## Per-engine sequencing (within the both-engines slices C and D)

Per the sub-plans: run the additive groundwork (new events/predicates/effects registered alongside the old) on **both engines in parallel**; then migrate **Godot's tiny pool first** as the low-stakes proving ground for the evaluator/dispatcher; then run the proto card-migration scripts (`migrate-triggers.js`, `migrate-effects.js`) over the 258; then delete legacy code last. Wire-format names are snake_case (PROTOCOL.md); each engine rebinds to its idiom at ingest.

## Open decisions carried into execution

- **Q1 (Slice 1) — DECIDED:** keep Godot's snake_case names; rename the 16 colliding proto folders to match (also fixes the `hastyOgre`→Raging Goblin / `cloudGiant`→Cloud Pegasus mislabels); 10 Godot-only cards authored as new snake_case folders. Full snake_case normalization of the other ~237 proto ids is **backlogged**, gated to run before the Godot port consumes the full pool (Phase 6). See plan-card-data-unification.md Q1 for the full rename list + `docs/BACKLOG.md`.
- **Q2 (Slice 1/3) — DECIDED: defer.** Godot-loader gap only (proto already plays modal cards); pick the shape when the active pool needs modal spells (Phase 6+).
- **Q3 (Slice 3)** — `extraManaColors` representation — resolved *by* §3.9's mana deep-clean; don't lock it earlier.
- **B4 timing (Slice 3)** — Godot's delayed-trigger queue; needed only for the `exile_until_eot` sub-step. `flicker` and everything else proceed without it.
- **rip trigger semantics** — already decided (kludge `sacrifice` now → `annihilate` later, §13); no input needed.

## Verification gates (cross-cutting)

- **Runs here (this container):** proto JS suite `node tests/run_all.js` (482 assertions) + `selfplay_harness.js`.
- **Needs Godot (run in a Godot-equipped session):** the phase smoke tests (`res://tests/test_phaseN.tscn`) and the boot supportability scan. After each slice, the scan's loaded-count must hold and the supported-count must be ≥ baseline (drops mean a card got mangled).
- **Each slice ends test-green on both engines** before the next begins — that's what makes the multi-week program safely sliceable.

## Critical files

Per slice, see each sub-plan's "Critical files" section. The conductor-level anchors: `engine/engine.gd` (A, C, D), `cards/templates/card_database.gd` + `engine/json_card_loader.gd` + `scenes/card.tscn` (B), `engine/predicates/predicates.gd` + `reference/html-proto/js/triggers.js` (C), `engine/effects/*.gd` + `reference/html-proto/js/engine.js` + `reference/html-proto/tools/migrate-*.js` (C, D).
