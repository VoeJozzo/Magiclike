# Refactor Notes

Prioritized structural debt across both halves of the repo. Items here are **advisory** — recorded so they can be picked up opportunistically when the surrounding area is already being touched, or scheduled deliberately when the listed triggering event arrives. Pairs with [`ARCHITECTURE.md`](ARCHITECTURE.md) (module map) and [`SPEC.md`](SPEC.md) (data contracts).

Refactor items live here. Feature deferrals continue to live in [`BACKLOG.md`](BACKLOG.md).

---

## Priority rubric

- **P0** — Blocks near-term planned work (Phase 6 card pool expansion, Phase 7 stickers, Phase 8 draft). Touch before adding features in the affected area.
- **P1** — Friction multiplier. Each new feature in this area pays a tax until fixed. Schedule deliberately.
- **P2** — Quality-of-life. Worth doing while already in the file for another reason.

**Effort** — S (an hour or two), M (half a day to a day), L (multi-day).

---

## 1. Godot engine (`engine/`)

### 1.1 [P0/M] Consolidate action dispatch
**Where.** `engine/engine.gd` — `is_legal_action` (~line 378), `_do_action` (~line 470), `get_legal_actions` (~line 275). Plus a small set of `_legal_*` / `_do_*` pairs per kind.

**Smell.** Adding a new action kind requires updating three call sites, with no compiler help to catch divergence. Comment at `engine.gd:466` already acknowledges a prior bug from this pattern.

**Recommended.** Move per-kind logic into a `KIND_REGISTRY: Dictionary` keyed by `Action.KIND_*`, with each entry exposing `{is_legal(action, state), execute(action, state), enumerate(state, player_key)}`. `is_legal_action` / `_do_action` / `get_legal_actions` become thin dispatchers. Wire all 11 current kinds.

**Triggering event.** Phase 7 stickers will introduce sticker-activation actions; Phase 9 run-meta will introduce reward-pick actions. Do before either.

---

### 1.2 [P1/M] Combat-keyword extensibility hook
**Where.** `engine/engine.gd` — `_deal_combat_damage` (~line 1100–1135), `_combat_damage_pass` (~line 1046–1097).

**Smell.** Trample, lifelink, deathtouch, first-strike, menace, indestructible all hardcoded in damage-resolution branches. Adding a new keyword (double-strike, banding, lure, regeneration) requires editing the inner loop.

**Recommended.** Extract a `KEYWORD_DAMAGE_HOOKS` table where each keyword declares lifecycle callbacks (`on_assign_damage`, `on_resolve_damage`, `affects_lethal`, etc.). Combat pass walks the table per attacker/blocker. Mirrors the `EFFECTS.HANDLERS` pattern that already exists in `engine/effects/effects.gd:14`.

**Triggered by.** Any keyword expansion. Phase 5a shipped 11 evergreens; adding double-strike, protection, or shroud would be the natural prompt.

---

### 1.3 [P1/S–M] Action and event Dictionary type safety
**Where.** All of `engine/`. Actions are `Dictionary` with key `"kind"`; events emitted by `_fire_event` are also untyped dictionaries.

**Smell.** A typo in `"source_iid"` returns `-1` from `Dictionary.get` and silently fails downstream. Same for action kind misspellings. No compile-time check.

**Recommended.** Either (a) define typed `Action` / `Event` classes in `engine/action.gd` and `engine/event.gd` and route construction through them, or (b) add a validator that runs in debug builds asserting required keys are present per kind. Option (b) is the cheaper first step.

**Triggered by.** First time a silent typo costs more than 15 minutes to diagnose. Cheap insurance against Phase 7+ complexity.

---

### 1.4 [P1/M] State mutation outside `execute_action`
**Where.** `engine/engine.gd` — `_deal_combat_damage` (~line 1111–1121) mutates `player.life`, `player.life_lost_this_turn`, and `creature.damage_marked` directly. Similar in tap-state changes.

**Smell.** State changes that don't pass through `execute_action` bypass the settle/log invariant. They work today because `_deal_combat_damage` is called from inside a settle iteration, but the invariant is fragile — a future trigger handler calling this path would double-emit events or skip logs.

**Recommended.** Route combat damage through a `damage_assignment` internal action kind that the settle loop dispatches. Or, formalize a `MutationContext` object that every mutation site receives and uses to log + signal. Lower-effort alternative: add assertions that mutations happen inside `_settling == true`.

**Triggered by.** Any cross-cutting feature that needs a stable event hook (replay, undo, telemetry).

---

### 1.5 [P2/S] Unified `Mode` enum for awaiting states
**Where.** `engine/engine_state.gd` — three fields: `awaiting_target_for_trigger`, `awaiting_block_declaration`, `awaiting_discard`. Checked separately in `_current_actor`, `get_legal_actions`, and `game_board._refresh_ui`.

**Smell.** Ordering between them is implicit; adding a fourth pause (e.g., search-card-from-library for Phase 9) means touching every check site.

**Recommended.** Single `Mode` enum on `EngineState` with payload union: `IDLE / AWAITING_TARGET / AWAITING_BLOCKS / AWAITING_DISCARD / AWAITING_SEARCH`. One `current_mode()` accessor; precedence centralized.

**Triggered by.** Phase 8 (draft adds prompt modes) or Phase 9 (search/scry effects).

---

### 1.6 [P2/S] Target enumeration duplication
**Where.** `engine/engine.gd:_enumerate_filter_targets` (~line 350–368).

**Smell.** `"creature_or_player"` and `"any"` paths are identical; `"creature"` filtering is repeated. Hexproof check appears twice.

**Recommended.** Single canonicalization step that maps both `"any"` and `"creature_or_player"` to a single internal enum, then one branch per resulting filter.

**Triggered by.** Adding a new target filter (`"opp_creature_or_player"`, `"land"`, etc.).

---

### 1.7 [P2/M] `_stack_held_cards` is a band-aid
**Where.** `engine/engine.gd` — `_stack_held_cards` buffer + `_find_card_anywhere` (~line 738) bridging hand → stack-held → graveyard transitions during spell resolution.

**Smell.** Spells live in three zones during their lifetime: hand → stack-held (off-zone) → graveyard/battlefield. The buffer exists because the stack model is `Array[StackEntry]` not `CardContainer`. `_find_card_anywhere` has to consult it explicitly. `counter.gd` reaches into the autoload to manipulate it.

**Recommended.** Make stack entries first-class zone members so `find_instance` finds them naturally. Or, formalize a `Card.location` enum that includes `STACK` and route lookups through it.

**Triggered by.** Phase 7+ when new card mechanics need stack-zone awareness (Mercurial-style stack mutation).

---

### 1.8 [P2/L] Engine god-object split
**Where.** `engine/engine.gd` — 1551 LOC.

**Smell.** Phase advancement, trigger queue management, combat damage, SBAs, legal-action enumeration, mana-cost validation, and signal emission all in one file. CLAUDE.md acknowledges this as "closest fit to the JS prototype's IIFE singleton" — pragmatic at Phase 5c, expensive at Phase 9.

**Recommended.** Extract:
- `engine/phases.gd` — phase advancement, untap/draw/cleanup steps
- `engine/triggers_runtime.gd` — `_fire_event`, `_drain_pending_triggers`, APNAP ordering
- `engine/combat.gd` — `_combat_damage_pass`, `_resolve_combat_damage`, two-pass logic
- `engine/sbas.gd` — `_run_sbas`
- `engine.gd` — autoload + `execute_action` thin dispatcher

Each extracted module remains `RefCounted` and takes `EngineState` explicitly.

**Triggered by.** When `engine.gd` exceeds 2000 LOC OR when a refactor in any one of the above areas would benefit from independent testability.

---

## 2. Godot UI (`scenes/game/`)

### 2.1 [P0/M] Extract `TargetingMode` controller
**Where.** `scenes/game/game_board.gd` — fields `_pending_cast_iid`, `_pending_target_filter`, `_pending_cast_tap_plan`, `_pending_block_blocker_iid`, `_picking_trigger_target`, `_picking_discard`. Cascading branches in `_on_hand_card_gui_input` (game_board.gd:862–889).

**Smell.** Four interaction modes smuggled into one input handler with `if`/`return` cascades. Adding the draft-pick mode (Phase 8) or sticker-application mode (Phase 7) compounds the mess.

**Recommended.** Single `TargetingMode` class with an enum `IDLE / CASTING / BLOCKING / TRIGGER_TARGETING / DISCARDING / ...`. `game_board` consults `mode.current()` instead of inspecting flag fields. `mode.click(iid)` dispatches per state. Input router becomes one switch.

**Triggered by.** Phase 7 (sticker application UI) or Phase 8 (draft picks).

---

### 2.2 [P1/M] Pull mana planning out of UI
**Where.** `scenes/game/game_board.gd:_plan_lands_to_tap` (~line 1009–1049).

**Smell.** Greedy mana-solver for auto-tap lives in the UI. Pure rules logic — given a cost and a pool of untapped lands, return which lands to tap. Tests can't reach it without spinning up the scene tree.

**Recommended.** Move to `engine/mana_planner.gd` (RefCounted), expose `MnaPlanner.plan(cost: Dictionary, lands: Array[CardInstance]) -> Array[int]`. UI calls it; AI can also use it for cast-feasibility checks.

**Triggered by.** Any cost-payment complication (X spells, alternative costs, snow mana). Or whenever Phase 5b's `is_legal_action` needs to consult mana planning for trickier costs.

---

### 2.3 [P1/M] Split `_on_hand_card_gui_input`
**Where.** `scenes/game/game_board.gd:_on_hand_card_gui_input` — 121 LOC (lines 840–960).

**Smell.** Phase checks, state dumps, auto-tap deferral, targeting-mode branching, diagnostic logging — all inline in one handler.

**Recommended.** Split into:
- `_route_hand_click(iid)` — dispatch by current mode
- `_handle_casting_click(iid, card)` — casting path
- `_handle_target_pick_click(iid)` — target-picking path
- `_handle_discard_click(iid)` — discard path
Plus the `TargetingMode` extraction in 2.1.

**Triggered by.** Co-schedule with 2.1.

---

### 2.4 [P2/S] Replace `combat_lines.set("game_board", self)` string injection
**Where.** `scenes/game/game_board.gd:161`. `combat_lines.gd` accesses `game_board._iid_to_visual` and panel references via that string-key injection.

**Smell.** Backdoor coupling — typo in `"game_board"` silently fails; private fields are accessed across boundaries.

**Recommended.** Add `func bind_board(board: GameBoard, panels: Dictionary)` on `CombatLines`; call from `_build_ui`. Pass `_iid_to_visual` as a getter.

**Triggered by.** Touching `combat_lines.gd` for any reason.

---

### 2.5 [P2/L] `GameBoardPresenter` pattern for testability
**Where.** `scenes/game/game_board.gd` — 1295 LOC, constructs entire scene in `_ready`, tightly coupled to `RulesEngine` autoload.

**Smell.** Can't unit-test input routing or refresh logic without running the full Godot frame loop.

**Recommended.** Introduce a `GameBoardPresenter` (RefCounted) that holds the engine reference and exposes the input-routing + state-derivation logic without scene-tree dependencies. `game_board.gd` becomes a thin view wrapping it. Lets us test "click X in phase Y → action Z" without instantiating zones.

**Triggered by.** First UI regression bug that's expensive to reproduce manually.

---

### 2.6 [P2/S] Card subclass focus mode fragility
**Where.** `scenes/card.gd` — `_enter_state` / `_exit_state` overrides (~line 441–463) guard right-click focus mode against card-framework's HOVERING/IDLE transitions.

**Smell.** Mitigated but fragile — depends on intimate knowledge of card-framework's internal `hovering_card_count` counter. Bumping the addon (planned for v1.4.0 per `BACKLOG.md`) might silently break this.

**Recommended.** Pin behavior with a smoke test that triggers focus + hover and asserts no state-machine assertions fire. Worth doing alongside the planned card-framework version bump.

**Triggered by.** Card-framework bump (already on `BACKLOG.md`).

---

## 3. html-proto (`reference/html-proto/`)

### 3.1 [P0/S — DOCUMENTATION-ONLY] Don't replicate `G[them]` closures when porting
**Where.** `reference/html-proto/js/triggers.js:39–41` (`thisAttacksAfterOppLifeLoss`), and ~5 other predicates that close over the `G` state singleton.

**Smell.** Predicates reach into globals instead of taking state as a parameter. CLAUDE.md flags this as "the worst inheritance pattern" from the JS prototype.

**Recommended.** **Do not refactor the proto.** When porting these predicates to Godot, pass `state` explicitly per the contract in `engine/predicates/predicates.gd`. This entry exists to make the rule canonical for future sessions.

**Triggered by.** Every new predicate port. Already followed for `opp_lost_life_this_turn`.

---

### 3.2 [P1/L] Decompose `engine.js` monolith
**Where.** `reference/html-proto/js/engine.js` — 5559 LOC. Notable hotspots:
- `step()` (line 5186, 243 LOC) — infinite phase loop
- `isLegalAction` (line 4676, 246 LOC) — monolithic switch over 17 action types
- `getLegalActions` (line 4927, 240 LOC)
- `dealCombatDamage` (line 4028, 128 LOC)
- `getCardValue` (line 902, 126 LOC)
- `mergeStapleInto` (line 337, 119 LOC)
- `resolveTopOfStack` (line 3872, 114 LOC)

**Smell.** Hard to navigate; bug fixes require global understanding.

**Recommended.** Pull `step()` per-phase handlers, EFFECTS table, combat resolution, and synthesize/staple logic into separate files. Each file remains an IIFE; load order in `magiclike_engine.html` extends.

**Triggered by.** Sustained html-proto development. Lower priority because the Godot port is the long-term target — invest in cleanup only if the proto remains the canonical play-test target through 2026.

---

### 3.3 [P1/M] Centralize AI tuning constants
**Where.** `reference/html-proto/js/ai.js` — 45+ magic numbers scattered across `scoreCombatOutcome` (line 716), `scoreSpellTarget` (line 1144), `laneOpeningBonus` (line 1083), `decideMain` (line 276), threshold gates (lines 175, 215, 308).

**Smell.** Tuning the AI requires hunting through 1564 LOC. Adjacent constants (e.g., overkill penalty) live across multiple functions.

**Recommended.** Hoist a `TUNING` object at the top of `ai.js`:
```js
const TUNING = {
  damageScalingAtLowLife: [2, 10, 30],
  creatureKillBonusBase: 6,
  lethalBonus: 10000,
  suicideAttackPenalty: -50,
  instantRemovalThreshold: 15,
  flashAmbushThreshold: 5,
  // ...
};
```
Reference via `TUNING.X` in scorers.

**Triggered by.** First time someone wants to tune the AI without diving into the codebase. Also a precondition for any data-driven AI tuning (CSV/JSON config).

---

### 3.4 [P1/M] Declarative save-migration framework
**Where.** `reference/html-proto/js/run.js:16–42` — `MIGRATIONS = {1: blob => ...}`.

**Smell.** Per-version migration is hand-written code that walks the blob ad-hoc. With one migration today it's manageable; the next non-trivial schema change will compound complexity.

**Recommended.** Declarative migration spec — e.g., `{rename: {oldField: newField}, addDefault: {field: value}, transformSlot: fn}`. Migration runner walks the spec instead of free-form code. Reduces risk of partial migrations leaving the save in a half-state.

**Triggered by.** Next non-trivial schema change. Existing v1→v2 is fine; v2→v3 should be the prompt.

---

### 3.5 [P2/S] Unify WUBRG color constants
**Where.** `reference/html-proto/js/engine.js` — `['W','U','B','R','G']` hardcoded at lines 182, 220, 319, 898, 1255, 1265, 1576+. Also `run.js:131`.

**Smell.** Magic literals. Renaming a color (e.g., supporting colorless `C`) requires grepping.

**Recommended.** Single `const COLORS = ['W','U','B','R','G']` exported by `cards.js` (since it already holds the registry). Import via the global. Most uses fall through.

**Triggered by.** Any new color-axis feature.

---

### 3.6 [P2/M] Render diffing
**Where.** `reference/html-proto/js/render.js:render()`.

**Smell.** Full DOM rebuild on every state change. Acceptable for 23-card hands; bottleneck at larger pools or during AI-vs-AI replay loops.

**Recommended.** Per-zone keyed-diff using `card.iid` as the key. Reuse existing DOM nodes; only update changed view-model fields. Modest gain today, large gain at Phase 9 where end-of-run states might involve 60+ cards across zones.

**Triggered by.** First perceptible UI lag during normal gameplay.

---

### 3.7 [P2/S] Fix mana SVG path inconsistency
**Where.** `magiclike_engine.html:251–255` uses `../../assets/mana/W.svg`; `render.js:144` uses `assets/mana/W.svg`. Same files, different resolution rules.

**Smell.** Either path could break if the HTML scope changes (e.g., serving from a different subdirectory).

**Recommended.** Single `const MANA_SVG_BASE` resolved relative to the HTML file location, used by both layers. Or use a `<link>` rel hint.

**Triggered by.** Any path-related Pages-serving issue.

---

### 3.8 [P2/M] Modal builder consistency
**Where.** `reference/html-proto/js/render.js` — modal content built inconsistently across modals: `searchModal` (line 204–216) uses `innerHTML = ''` + `appendChild`; `triggerBuildModal` (line 233, 264–273) uses template strings; `modalChoiceModal` (line 339–364) uses document fragments.

**Smell.** Each new modal picks a style; readers have to context-switch.

**Recommended.** Pick one pattern (fragments are safest with dynamic content) and a `buildModalSection(rows, opts)` helper. Refactor existing modals.

**Triggered by.** Adding a new modal.

---

## 4. Card data

### 4.1 [P2/S] Remove vestigial JSON wiring (Godot)
**Where.** `addons/card-framework` ships `JsonCardFactory`; `cards/data/` directory exists but is empty; the project uses `TresCardFactory` exclusively. (The CLAUDE.md text that previously called JSON templates "active" is now corrected to "vestigial.")

**Smell.** False trail for new contributors. Suggests two data sources when there's one.

**Remaining.** The doc wording is fixed; the optional code cleanup is to delete the empty `cards/data/` directory (and the unused `JsonCardFactory` wiring) so there's no dead path at all. Downgraded to P2 since the misleading-doc part is resolved.

**Triggered by.** Whenever this confuses a new session. Cheap to do at any time.

---

### 4.2 [P2/M] `.tres` schema versioning
**Where.** All `cards/templates/*.tres`.

**Smell.** Renaming a field in `CardResource` (e.g., `mana_cost` → `cost`) silently breaks every saved `.tres`. Godot reports a parse warning, not an error.

**Recommended.** Add a `@export var schema_version: int = 1` on `CardResource`; bump on schema changes; add a startup loader that pushes through migrations (mirrors html-proto's `RUN.MIGRATIONS` pattern). Low priority while the pool is 23 cards; rises with Phase 6 expansion.

**Triggered by.** First schema change after Phase 6 ships.

---

## 5. Tests and tooling

### 5.1 [P1/S] Phase test batch runner
**Where.** `tests/` — 10 separate `.tscn` files, each invoked individually per `CLAUDE.md:104–106`.

**Smell.** No way to run "all phase tests" with one command. Regression confirmation requires 10 manual invocations.

**Recommended.** `tests/run_all.{gd,tscn}` that loads each phase scene in sequence, captures the assertion results, and prints a summary. Or a small shell script that invokes them in a loop. Aim for ~5 minutes total wall-clock for the whole suite.

**Triggered by.** First time a regression is caught by phase N but not noticed because only phase N+1 was run. Cheap insurance.

---

### 5.2 [P1/S] Cover non-self triggered abilities
**Where.** `engine/engine.gd:_fire_event` supports `self_only: false` listeners, but no current card uses it. `tests/test_phase4.gd` only exercises `self_only: true`.

**Smell.** Untested code path. Already on `docs/BACKLOG.md` — duplicate-listed here for visibility.

**Recommended.** Author a test fixture card with a non-self trigger (e.g., "When another creature you control enters, draw a card") and add it to `test_phase4.gd`. Or create `test_phase4_5d` if better isolated.

**Triggered by.** Phase 6 — likely some new card needs this anyway.

---

### 5.3 [P2/S] Illegal-action rejection paths
**Where.** `tests/` — no test exercises `is_legal_action` returning false for an out-of-phase / unaffordable / illegal-target action.

**Smell.** The engine's defensive guards aren't pinned down by tests. Could regress silently.

**Recommended.** Add a `test_legality.gd` that asserts a curated set of illegal actions are rejected, with the correct log message. Pairs well with section 1.3 (Dictionary type safety).

**Triggered by.** Any regression in legality checks. Or when 1.3 ships.

---

## 6. Cross-cutting

### 6.1 [P2/S — DONE] Inconsistent line counts in `CLAUDE.md` module table
**Where.** Root `CLAUDE.md` module table.

**Status.** Corrected — `engine.gd` / `game_board.gd` now read ~1551 / ~1295 (actual) instead of the stale ~1840 / ~1275.

**Standing advice.** Hardcoded LOC ages fast; consider dropping the line-count column from CLAUDE.md entirely (ARCHITECTURE.md is the better home for per-file LOC, easier to refresh). Left as a P2 nicety.

---

### 6.2 [P2/S] LICENSES.md license entry for stickers/empower
**Where.** N/A — would only apply if external assets are added for Phase 7+ work.

**Smell.** None yet. Listed as a reminder that the rule from `CLAUDE.md:110–114` applies to every new outside resource.

**Recommended.** Continue the existing discipline.

---

## Summary table

| ID | Area | Priority | Effort | Triggering event |
|---|---|---|---|---|
| 1.1 | Engine — action dispatch | P0 | M | Phase 7 or 9 |
| 1.2 | Engine — keyword extensibility | P1 | M | Keyword expansion |
| 1.3 | Engine — Dictionary types | P1 | S–M | First silent-typo incident |
| 1.4 | Engine — mutation invariants | P1 | M | Telemetry / replay |
| 1.5 | Engine — Mode enum | P2 | S | Phase 8 / 9 prompts |
| 1.6 | Engine — target enumeration dedup | P2 | S | New target filter |
| 1.7 | Engine — `_stack_held_cards` cleanup | P2 | M | Stack-zone mechanic |
| 1.8 | Engine — file split | P2 | L | engine.gd > 2000 LOC |
| 2.1 | UI — TargetingMode controller | P0 | M | Phase 7 / 8 |
| 2.2 | UI — ManaPlanner extraction | P1 | M | Cost complications |
| 2.3 | UI — split hand-input handler | P1 | M | Co-schedule w/ 2.1 |
| 2.4 | UI — combat_lines injection | P2 | S | Any touch |
| 2.5 | UI — Presenter pattern | P2 | L | UI regression bug |
| 2.6 | UI — focus mode fragility | P2 | S | Card-framework bump |
| 3.1 | Proto — predicate G-closures | P0 | S (doc) | Predicate port |
| 3.2 | Proto — engine.js split | P1 | L | Sustained proto dev |
| 3.3 | Proto — AI tuning constants | P1 | M | AI tuning session |
| 3.4 | Proto — declarative migrations | P1 | M | Next schema change |
| 3.5 | Proto — WUBRG constants | P2 | S | Color-axis feature |
| 3.6 | Proto — render diffing | P2 | M | Perceptible UI lag |
| 3.7 | Proto — mana SVG path | P2 | S | Pages-serving issue |
| 3.8 | Proto — modal builder | P2 | M | New modal |
| 4.1 | Cards — vestigial JSON | P2 | S | Anytime (doc part done; dir-delete remains) |
| 4.2 | Cards — .tres versioning | P2 | M | Post-Phase-6 schema change |
| 5.1 | Tests — batch runner | P1 | S | First missed regression |
| 5.2 | Tests — non-self triggers | P1 | S | Phase 6 |
| 5.3 | Tests — illegality paths | P2 | S | Co-schedule w/ 1.3 |
| 6.1 | CLAUDE.md drift | — | — | DONE (LOC corrected) |
