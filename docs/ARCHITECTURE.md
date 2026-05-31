# Architecture Map

A runtime structure map for both halves of the Magiclike repo: the Godot 4.6 port at the root and the html-proto reference implementation under `reference/html-proto/`. Pairs with [`SPEC.md`](SPEC.md) (data contracts) and [`REFACTOR-NOTES.md`](REFACTOR-NOTES.md) (structural debt). State as of Godot Phase 5c / html-proto v1.0.188.

---

## 1. Repo layout

```
/                              Godot project root, working tree on `dev`
├── CLAUDE.md                  onboarding doc (architecture decisions, gotchas)
├── LICENSES.md                canonical record of outside resources
├── project.godot              autoload: RulesEngine = res://engine/engine.gd
├── index.html                 redirect → reference/html-proto/ (Pages entry)
├── .nojekyll                  disables Jekyll on Pages
├── addons/card-framework/     vendored chun92 framework (MIT, v1.3.2; do not modify)
├── assets/                    shared between Godot port and html-proto
│   ├── fonts/Almendra/        SIL OFL 1.1
│   └── mana/                  WUBRG SVGs + design source
├── cards/
│   ├── templates/             *.tres CardResources (31 files = 26 cards + 5 lands)
│   ├── images/                placeholder PNGs; 4 wired-in inserts (see BACKLOG)
│   └── data/                  empty — JsonCardFactory wiring is vestigial
├── data/                      CardResource base + subclasses
├── engine/                    pure-data rules engine
│   ├── engine.gd              autoload (1551 LOC)
│   ├── engine_state.gd        EngineState container (121 LOC)
│   ├── player.gd, mana_pool.gd, stack.gd, phase_machine.gd, card_instance.gd
│   ├── action.gd              action constants + factories
│   ├── ai/                    ai.gd, combat.gd, burn.gd, scoring.gd
│   ├── effects/               effects.gd + 5 per-kind handlers
│   └── predicates/predicates.gd
├── scenes/
│   ├── card.{gd,tscn}         Card subclass (475 LOC) — overlays, focus, glows
│   ├── tres_card_factory.tscn                TresCardFactory wiring
│   ├── game/                  game_board, player_panel, combat_lines
│   └── zones/battlefield_zone.gd
├── tests/                     test_phase{1,2,3,4,4_5a,4_5b,4_5c,5a,5b,5c}.{gd,tscn}
├── docs/                      this file + SPEC.md + REFACTOR-NOTES.md
│                              + godot-port-plan.md + BACKLOG.md
├── tools/                      Godot utility scripts
└── reference/html-proto/      JS prototype (active on dev; serves GitHub Pages)
    ├── magiclike_engine.html  single-page entry (918 LOC, ~700 LOC inline CSS)
    ├── js/                    14 IIFE modules, ~16k LOC
    ├── cards/<tplId>/         258 per-card folders + art + _manifest.json
    ├── assets/                proto-specific assets
    ├── tests/                 Node regression harness (482 assertions)
    └── CLAUDE.md              proto-specific onboarding (current VERSION)
```

GitHub Pages serves from `dev`, pointing at `reference/html-proto/magiclike_engine.html`. Pushing to `dev` makes html-proto changes live; Godot changes don't affect Pages but share the branch.

---

## 2. Godot port

### 2.1 Module map

| File | LOC | Role | Public surface |
|---|---:|---|---|
| `engine/engine.gd` | 1692 | Autoload `RulesEngine`. State holder, action dispatch, settle loop, trigger drain, stack resolution, two-pass combat damage, SBAs, legal-action enumeration. | `execute_action`, `is_legal_action`, `get_legal_actions`, `state()`, `counter_stack_entry`, signals `state_changed`/`log_appended`/`game_over` |
| `engine/engine_state.gd` | 128 | RefCounted state container. Players, stack, attackers, blockers, pending_triggers, awaiting states, log, winner. | Fields are mutated directly; `player_by_key`, `find_instance`, `make_instance`, `opponent_of`, `duplicate_deep` |
| `engine/player.gd` | 80 | Per-player zones (hand, library, battlefield, graveyard, exile), life, mana, land-play flag, `life_lost_this_turn`. | `find_battlefield`, `find_hand`, `move_card`, `untap_step`, `duplicate_deep` |
| `engine/mana_pool.gd` | 91 | Color + generic mana accounting (greedy saturation), pretty-printer. | `add_dict`, `pay`, `to_string_short` |
| `engine/stack.gd` | 51 | LIFO of `StackEntry` (spells AND triggered abilities). | `push`, `pop`, `top`, `clear` |
| `engine/phase_machine.gd` | 57 | Turn structure (UNTAP / UPKEEP / DRAW / MAIN1 / COMBAT_ATTACK / COMBAT_BLOCK / COMBAT_DAMAGE / MAIN2 / END / CLEANUP). | `current`, `advance`, `phase_name`, `is_main_phase`, `is_combat_phase` |
| `engine/card_instance.gd` | 131 | Per-card runtime state — tapped, damage_marked, temp_power/toughness, counters, summoning_sick, granted_keywords. | `current_power`, `current_toughness`, `effective_keywords`, `has_keyword`, `clear_eot_modifiers` |
| `engine/action.gd` | 100 | Action constants (`KIND_*`) + factory functions. | All `make_*` helpers, `target_player`, `target_creature` |
| `engine/effects/effects.gd` | 38 | Effect dispatcher. `HANDLERS` table maps `kind` → handler script. | `resolve_one(effect, ctx)`, `resolve_list(effects, ctx)` |
| `engine/effects/{damage,add_mana,pump,gain_life,counter}.gd` | 30–65 ea. | Per-kind handlers. Signature `execute(effect: Dictionary, ctx: Dictionary)`. | `execute` |
| `engine/predicates/predicates.gd` | 62 | String-keyed condition registry. Boot-time `validate_all_card_predicates`. | `evaluate(name, state, source, event)`, `validate_all_card_predicates(cards)` |
| `engine/json_card_loader.gd` | 278 | Loads `reference/html-proto/cards/<id>/card.json` into `CardResource` instances; translation tables map JS-isms (camelCase kinds, `"any"` target, string `sub`) to Godot's snake_case shape. Boot supportability scan reports unsupported cards by missing effect/event/predicate kind. See [`PROTOCOL.md`](PROTOCOL.md). | `load_card`, `load_all`, `supportability_report` |
| `engine/ai/ai.gd` | 283 | `AI.decide(state, player_key) -> Dictionary`. Hierarchical decision. | `decide` |
| `engine/ai/combat.gd` | 200 | `decide_attackers`, `decide_blockers`, `simulate_combat` (deep-copy + reuse engine damage). | `decide_attackers`, `decide_blockers`, `simulate_combat` |
| `engine/ai/burn.gd` | 57 | `face_damage_in_hand`, `has_lethal`. | Same |
| `engine/ai/scoring.gd` | 64 | `AIScoring.card_value(template, purpose)`. | `card_value` |
| `cards/templates/card_database.gd` | 58 | Auto-discovering `.tres` registry; lazy-cached directory walk. | `get_card(card_id)`, `all_card_ids()` |
| `data/card_resource.gd` + subclasses | 48 + 5–10 ea. | `CardResource` base; `CreatureResource`, `SpellResource`, `LandResource` subclasses. | Fields are `@export`-ed; helpers `has_type`, `is_land`, `is_spell`, `is_permanent` |
| `scenes/game/game_board.gd` | 1295 | UI orchestrator. Builds the entire scene tree programmatically; binds engine signals; routes clicks to actions across 4+ interaction modes. | `_ready`, signal handlers, click routers |
| `scenes/game/player_panel.gd` | 90 | Life, mana, zone counts, low-library warning. | `update_from_player`, signal `clicked` |
| `scenes/game/combat_lines.gd` | 116 | Overlay drawing attacker→blocker + spell→target lines. | `_process`, `_draw` |
| `scenes/card.gd` | 474 | Card subclass — oracle overlay, legality glow, combat highlight, right-click focus. Passive (state pushed by game_board). | `apply_card_text`, `apply_creature_state`, `set_combat_highlight`, `set_legality_glow`, `enter_focus`/`exit_focus` |
| `scenes/zones/battlefield_zone.gd` | 258 | Two-row layout (creatures + lands), adaptive spacing, color-grouped lands, combat-aware reordering. | Overrides `_card_can_be_added`, `_update_target_positions` |

### 2.2 Runtime data flow

```
                ┌───────────────────────────────────────────┐
                │  RulesEngine (autoload, engine/engine.gd) │
                │                                           │
   click ───→   │    execute_action(action) ──┐             │
                │                             ▼             │
                │     _do_action  ──→  state mutations      │
                │     _fire_event ──→  pending_triggers     │
                │     _settle_state loop:                   │
                │       _drain_pending_triggers (APNAP)     │
                │       _resolve_*_entry (stack)            │
                │       _run_sbas                           │
                │       _advance_phase                      │
                │                                           │
                │    signals: state_changed, log_appended,  │
                │             game_over                     │
                └────────────┬──────────────────────────────┘
                             │
                             ▼
                ┌───────────────────────────────────────────┐
                │  game_board (scenes/game/game_board.gd)   │
                │    on state_changed →                     │
                │      _refresh_ui →                        │
                │        _sync_card_visuals                 │
                │        _refresh_stack_display             │
                │        _apply_legality_glows              │
                │        _apply_combat_highlights           │
                │        player panels, phase label, log    │
                └───────────────────────────────────────────┘
```

`state_changed` fires only after the settle loop fully drains (engine.gd:262). The UI sees one consistent post-settlement state per `execute_action` call. Mid-state pauses (awaiting trigger target, awaiting block declaration, awaiting discard) are expressed as fields on `EngineState`; UI reads them on the next refresh.

### 2.3 Engine core internals

**Action dispatch.** Every state mutation routes through `execute_action(action: Dictionary)`. Action kind drives a switch into a `_do_*` function; legality is pre-checked by a parallel `_legal_*`. The same kinds are enumerated in `get_legal_actions` for AI consumption. (Three-way split is flagged in REFACTOR-NOTES.md.)

**Stack and priority.** The stack is `Array[StackEntry]`, holding both spell entries and triggered-ability entries. Both resolve via `_resolve_*_entry`. Priority follows MTG semantics where it matters (caster retains after casting; pools empty at phase boundaries; defender declares blocks before priority opens at COMBAT_BLOCK; triggers drain in APNAP order). Auto-passes (AI driver, unattended priority windows) are agent UX layered on top — the priority pass IS happening, it's just `execute_action(pass_priority)` called automatically.

**Trigger drain.** Events emitted by `_fire_event` scan all battlefield creatures, match `event` + `cond_id`, and enqueue `TriggerEntry` objects to `pending_triggers`. `_drain_pending_triggers` orders by APNAP, resolves listeners with no target prompt, and pauses on `awaiting_target_for_trigger` for cards that need player input (Pyromaniac). Resumes on `KIND_PICK_TRIGGER_TARGET` action.

**Combat damage.** Two-pass (`_combat_damage_pass` called twice — first-strike layer, then normal layer). Inner loop iterates attacker → assigned blockers, applies trample / menace collapse / first-strike skip / lifelink / deathtouch. SBAs sweep after each pass.

**State-based actions.** `_run_sbas` checks lethal damage (damage_marked ≥ toughness OR deathtouch hit), 0-life loss, decking out (empty library on draw). Single sweep — not strict 704.5 ordering. Cleared in the same settle iteration.

### 2.4 Effects and predicates

**Effects** (`engine/effects/`):
- `effects.gd:14–20` declares `HANDLERS = { "damage", "add_mana", "pump", "gain_life", "counter" }`.
- Every handler has the same signature: `static func execute(effect: Dictionary, ctx: Dictionary)`.
- `ctx` is built by the engine: `{controller, source, source_name, source_iid, state, targets, log}`. Handlers read `ctx.state` for cross-player lookups; they do NOT reach into the `RulesEngine` autoload (one documented exception: `counter.gd:20` calls `RulesEngine.counter_stack_entry()` because the buffer for off-zone stack-held cards lives on the autoload).
- Fizzle behavior is per-handler: targets gone → log + return.

**Predicates** (`engine/predicates/predicates.gd`):
- Single registry: `_PRED_NAMES = ["opp_lost_life_this_turn"]`. One predicate implemented.
- Calling convention: `cond_<name>(state: EngineState, source: CardInstance, event: Dictionary) -> bool`. State passed explicitly; no autoload reach.
- Boot-time validation: `validate_all_card_predicates(card_resources)` walks every loaded `CardResource`, collects `cond_id` strings from `triggers`, `push_error`s on any unknown name. Runs from `engine.gd._ready()`.
- Card-local predicate hook reserved (`_is_card_local_predicate`) but no callers yet.

### 2.5 AI module

```
AI.decide(state, player_key):
    if awaiting_target_for_trigger ──→ pick_trigger_target
    if awaiting_discard            ──→ discard_card
    if awaiting_block_declaration  ──→ decide_blockers → confirm_blocks
    if combat_attack && active     ──→ decide_attackers
    if stack non-empty             ──→ instant response (counter / burn / pass)
    if main && active && priority  ──→ main play (land → biggest spell → ability)
    else                            ──→ pass_priority
```

`combat.gd:simulate_combat` calls `state.duplicate_deep()` and then **reuses `RulesEngine._resolve_combat_damage()` on the snapshot** — first-strike/lifelink/trample/deathtouch logic stays in one place, AI gets honest simulation.

`scoring.gd:card_value(template, purpose)` is a heuristic — power+toughness minus a cost factor, plus a `KEYWORD_VALUES` table. Purpose toggles draft (`p + t − 2*cost`) vs in-hand keep (`p + t − 0.5*cost`). Comment warns "DO NOT round" — values were playtested.

### 2.6 UI layer

**`game_board.gd`** is a 1295-line orchestrator. It owns:
- Scene tree construction (8 zones + 2 player panels + combat overlay + stack/log + action button), all built programmatically in `_build_ui`.
- The `_iid_to_visual` map binding engine instance ids to card-framework `Card` nodes.
- 4+ interaction modes via flag fields (`_pending_cast_iid` + `_pending_target_filter` + `_pending_cast_tap_plan` for casting; `_pending_block_blocker_iid` for blocking; `_picking_trigger_target` derived from `state.awaiting_target_for_trigger`; `_picking_discard` derived from `state.awaiting_discard`).
- Auto-tap mana planning (`_plan_lands_to_tap`) — pure rules logic temporarily living in UI.
- Legality glows: per refresh, calls `RulesEngine.get_legal_actions()` and decorates visuals.

**`scenes/card.gd`** is passive. game_board pushes state into it (`apply_card_text`, `apply_creature_state`, `set_combat_highlight`, `set_legality_glow`). Adds a right-click focus mode that briefly bypasses card-framework's HOVERING/IDLE state machine; guarded reentry through `_enter_state`/`_exit_state` overrides.

**Click-to-cast enforcement.** card-framework reserves drag for "move card between containers." Hand-card clicks are routed via `gui_input` directly to `_on_hand_card_gui_input` (game_board.gd:840–960), bypassing the addon's drag system entirely.

**`combat_lines.gd`** overlays attacker→blocker and stack-spell→target lines. Reads `RulesEngine.state()` plus `game_board._iid_to_visual` via a `set("game_board", self)` string-key injection (game_board.gd:161).

**`battlefield_zone.gd`** subclasses card-framework's `CardContainer`. Two-row split (creatures + lands). Persists `_creature_iid_order` across refreshes so post-combat layout doesn't snap back. Reads engine state to combat-sort during attack/block phases.

### 2.7 Card data

Two coexisting paths today:
- **`.tres` templates** (`cards/templates/*.tres`) — the 23 hand-curated playable cards. `card_database.gd` does a lazy directory walk; adding one is "drop the `.tres` in, restart."
- **JSON wire format** (`engine/json_card_loader.gd`) — reads the html-proto `card.json` files directly (the cross-engine wire format; see [`PROTOCOL.md`](PROTOCOL.md)) and materializes `CardResource` instances. A boot **supportability scan** reports how many of the 258 proto cards are fully playable (today: 258 loaded, 109 supported, 149 awaiting handlers). This makes Godot card-pool growth a *prioritization* problem (which effect kinds to implement next) rather than a *translation* problem.

`CardResource` is the base; `CreatureResource`/`SpellResource`/`LandResource` add type-specific fields. Runtime schema in [`SPEC.md`](SPEC.md); wire format in [`PROTOCOL.md`](PROTOCOL.md).

**Note on `JsonCardFactory` (card-framework).** The vendored addon's `JsonCardFactory` is still unused by the *visual* layer (`TresCardFactory` does that). The *engine-side* JSON path is now live via `json_card_loader.gd` — no longer vestigial. Consolidating the visual layer onto JSON (and retiring `.tres`) is future work — standardization Pass 5 / `REFACTOR-NOTES.md`.

### 2.8 Test suite

10 runnable scenes under `tests/`, one per shipped slice (1, 2, 3, 4, 4.5a, 4.5b, 4.5c, 5a, 5b, 5c). Each test is headless-executable via the Godot CLI (invocation in `CLAUDE.md`), prints assertion results, exits 0/1.

| Phase | Coverage |
|---|---|
| 1 | Click-to-cast Lightning Bolt, mana, stack, priority |
| 2 | Play land, cast creature, summoning sickness, untap, attack, damage |
| 3 | Blockers, instant-speed response, pump, two-spell stack |
| 4 | ETB trigger, death trigger, predicate gating, APNAP drain |
| 4.5a | Library draw, hand size, decking out |
| 4.5b | Interactive trigger target picker (Pyromaniac), you- vs opp-controlled drain |
| 4.5c | Counterspell, gain_life, 5-color basics, vanilla creature curve |
| 5a | 11 combat keywords, two-pass damage |
| 5b | `get_legal_actions`, `duplicate_deep`, `AIScoring.card_value` |
| 5c | `AI.decide` correctness, full AI vs AI game to a winner (200-turn cap) |

No batch runner — each `.tscn` is invoked individually. Flagged in `REFACTOR-NOTES.md`.

---

## 3. html-proto

### 3.1 Module map

Load order in `magiclike_engine.html` is fixed: `types → settings → cards → engine → card-text → stickers → ai → draft → run → picklog → controller → render → settings-panel → triggers → trigger-generator → main`. Each module is an IIFE exposing a single `const` global.

| File | LOC | Role |
|---|---:|---|
| `magiclike_engine.html` | 938 | Single-page entry. DOM scaffolding (14 modal containers), ~700 LOC inline CSS, 14 `<script>` tags. |
| `js/types.js` | 107 | Type system: `types[]` is the sole identity field; accessors `hasType`, `governingType`, `subtypesOf`, `typeLine` (v2.0.70 cutover). |
| `js/settings.js` | 283 | `SETTINGS` — display config (frame style, per-element fonts/sizes, popup scale, mana pip sizes, devtools flag). `localStorage` key `magiclike_settings_v1`. `applyFontsToRoot()` syncs `:root` CSS vars at boot. |
| `js/cards.js` | 467 | `CARDS = {}` + `async loadCards()` (manifest-driven). Holds `TOKENS`, `KEYWORDS`, `STICKERS`, `EMPOWER_FIELDS`, `KEYWORD_DISPLAY`, `KEYWORD_STICKER_WEIGHTS`, `RUN_MODIFIERS`. |
| `js/engine.js` | 5996 | The big one. `G` singleton (state), `step()` phase loop, EFFECTS dispatch (~40 kinds), pendingTriggers queue with `TRIGGER_DEPTH_CAP = 100`, modal pause states, combat damage, synthesize-stapled-template, mana abilities, `executeAction`, `isLegalAction`, `getLegalActions`. |
| `js/card-text.js` | 956 | Pure data → English. `describeCardSegments`, `describeEffect`, `describeTrigger`, `describeAbility`, `describeStaticBuff`, plus modal-segment helpers. Reads `ENGINE.synthesizeStapledTemplate`. |
| `js/stickers.js` | 373 | Sticker pipeline. `weightedPick`, `applyStickersToCard`, `applyOneStickerToRuntimeCard`, `applyRandomStickersToSide`, `empowerRollLabel`, `applyEmpowerRoll`, `rollSubtypeFromDeck`, `pushStickerWithRoll`, `stickersForSlot`. Late-binds ENGINE helpers. |
| `js/ai.js` | 1880 | `AI` IIFE. Hierarchical decision (force resolution → combat → priority → pass). `simulateCombat`, `scoreCombatOutcome`, `scoreSpellTarget`, `findBurnLethal`, flash AI (vanilla flash deferred to opp end-step). 45+ heuristic constants. |
| `js/draft.js` | 803 | `DRAFT` IIFE. Pack generation, color-aware sampling, 23-pick player draft, opp deck construction (incl. constructed-deck registry: Goblin Aggro, Spirit Tribal, Aristocrats, Archdemon Boss, Balancer Boss). |
| `js/run.js` | 1304 | `RUN` IIFE. Roguelike meta — map (STS-style branching, DEPTH=5 WIDTH=3), rewards, slot mutations (sticker/splice/clone/ripUp/transform). `localStorage` key `magiclike_run_v1`, version 2, declarative `MIGRATIONS` per version. |
| `js/picklog.js` | 178 | `PICKLOG` IIFE. Draft pick analytics, `localStorage` key `magiclike_picklog_v1`. Console hooks: `summarize`, `getCardStats`, `getPairsMatrix`. |
| `js/controller.js` | 3240 | `CONTROLLER` IIFE. Input routing, modal lifecycle, AI scheduling (100ms debounce), state-machine management (draft → map → reward → game), long-press for inspect, meta-game render helpers (`renderMap`, `renderReward`, `renderDraft`, `renderStatsContent`). |
| `js/render.js` | 1459 | `render()` main repaint, plus `renderHand`, `renderBf`, `renderManaPool`, `passLabel`, `makeCardEl`, `cardToViewModel`. In-game UI only. Render-on-every-state-change; no diffing. |
| `js/settings-panel.js` | 337 | `SETTINGS_PANEL` IIFE. Settings modal render + show. Pulled out of controller.js in v1.0.185. |
| `js/triggers.js` | 370 | `TRIGGER_CONDITIONS` registry (14 condIds). `evalTriggerCondition` resolver. |
| `js/trigger-generator.js` | 199 | Mercurial Adept / Architect's Codex random-trigger rolling. `GENERATOR_EFFECTS`, `GENERATOR_CONDITIONS`, `generateRandomTrigger`, `generateConditionOptions`, `generateEffectOptions`, `assembleTrigger`. |
| `js/main.js` | 41 | `VERSION` constant (must bump on every code-touching push to `dev`), `opp(who)` helper, bootstrap (awaits `loadCards()` → `CONTROLLER.init()`). |

### 3.2 Engine core internals

**G singleton.** All engine state lives on a closure-captured `G` object: phase, stack, priority, turn, activePlayer, attackers, blockers, pendingTriggers, triggerChainDepth, delayedTriggers, plus modal pause states (`pendingSearch`, `pendingTriggerTarget`, `pendingTriggerBuild`, `pendingSymmetricizeChoice`, `pendingNumberChoice`, `forcedDiscard`), plus per-player zones.

**`step()` loop** (engine.js:5186, 243 LOC). Infinite `while(true)` — checks for pauses (modals, declarations, legal priorities), auto-resolves skippable phases (UNTAP, DRAW, COMBAT_DAMAGE), opens priority windows in others. Phase dispatch via switch on `G.phase`.

**Action dispatch.** `executeAction(who, action)` (engine.js:5457). Validates with `isLegalAction` (engine.js:4676, 246 LOC — monolithic switch over 17 action types). Mutates state. Calls `notify()` (subscription emission).

**Effect dispatch.** ~25 handler kinds keyed off `effect.kind` (snake_case). Handler signature `(ctx, params, target) => void`. Notable handlers:
- `damage` — `applyDamageFrom` tracks `damagedBySources`, checks indestructible
- `affect_creature` — severity-tiered (string `tap|bounce|destroy|exile`); bounce preserves `permaBuffs`
- `endomorph_absorb` — reads victim keywords, applies sticker to controller's slot via `RUN.applyStickerToSlot()`
- `embargo`/`bleach`/`steal` — **decomposed** (post-§3.8): embargo/bleach are `move_card` + `apply_sticker(cost_mod/set_color)`; steal is `change_control(transfer_ownership)` which delegates to the internal `steal` verb

**Triggers.** `emit({type, ...})` queues to `G.pendingTriggers`. `drainPendingTriggers()` processes active-player triggers first, then opponent. `G.triggerChainDepth` increments per drain call, **bailout at `TRIGGER_DEPTH_CAP = 100`** (engine.js:2731) — historical safety net for past infinite-loop bugs. Resets to 0 when stack empties.

`triggers.js` holds the predicate registry. Each entry: `{events: [...], paramSchema?, check: (self, evt, who, params) => bool}`. Some predicates close over `G` directly (e.g., `thisAttacksAfterOppLifeLoss` reaches `G[them].lifeLostThisTurn` at triggers.js:39–41) — flagged in `REFACTOR-NOTES.md`.

**Combat damage.** `dealCombatDamage(blocked, defender, dealsDamage)` (engine.js:4028, 128 LOC). Sorts blockers (indestructibles last), assigns lethal damage in priority order, handles trample/menace/deathtouch/first-strike, emits `lifeGained` for lifelink-chained triggers.

### 3.3 AI

`AI.decide` decision hierarchy (mirrors Godot port):

```
1. Force resolutions (pendingTriggerTarget, pendingSearch, pendingTriggerBuild,
                      pendingSymmetricizeChoice, pendingNumberChoice, forcedDiscard)
2. Combat declarations
   - attack phase: decideAttackers (enumerate subsets ≤2^N, sim opp blocks)
   - block phase: decideBlockers (greedy: biggest attacker first)
3. Priority resolution
   - stack non-empty → decideReaction (counter / pump / removal / pass)
   - main + active → decideMain (burn-lethal → land → biggest spell → ability)
   - off-turn combat → decideOffTurnCombat (defensive instants ≥ 15 / flash ≥ 5)
   - end step → decideEndStepFlash (ambush flash creatures)
4. Pass
```

Scoring constants live as 45+ inline magic numbers in `ai.js`. `getCardValue` is latched to `ENGINE` (every lookup is an `ENGINE.getCardValue(card, purpose, ctx)` call); no local override. Flash AI gated by a console-mutable `FLASH_AI_ENABLED` global.

### 3.4 Render + controller

**Render loop.** `ENGINE.subscribe(onStateChange)` registers `controller.js:onStateChange`. Every state mutation triggers `render()`, which clears containers and rebuilds child elements from scratch. No diffing. Acceptable for 23-card hands; will bottleneck at larger pools.

**State-as-CSS-class.** UI affordances are CSS classes applied dynamically: `.castable`, `.activatable`, `.targetable`, `.atk`/`.blk`/`.pblk`, `.sick`, `.discardable`, `.land-tappable`, `.could-atk`/`.could-blk`. The class names couple JS and CSS — renaming requires grepping both.

**Modal stack.** Static HTML shells (`searchModal`, `triggerTargetModal`, `triggerBuildModal`, `modalChoiceModal`, etc.). `Modal.show(id)` pushes to a LIFO `_stack`, adds `.vis` class, sets `aria-modal`. Each modal's content is rebuilt on every `render()`.

**Input routing.** `clickHand(iid)` and `clickBattlefield(iid)` are large switches over phase + card type + UI selection state. `clickBattlefield` is ~225 LOC (controller.js:1477–1701) — flagged in `REFACTOR-NOTES.md`. Inline event handlers attached per card (no event delegation).

### 3.5 Draft + run meta

**Draft** (`draft.js`). Player drafts 23 cards from packs of 3 (color-aware sampling biased toward in-deck colors). Pick scorer integrates color commitment, curve, creature density, intrinsic value (`ENGINE.getCardValue(card, 'draft', ctx)`), duplication penalty. Opp deck built via heuristic draft sim OR hand-curated constructed archetype.

**Run** (`run.js`). STS-style map (DEPTH=5, WIDTH=3; mid nodes colored or colorless with 60%/25% odds; exit nodes get a constructed boss deck). Reward types weighted: sticker(12) > twoStickers(3) ≈ transform(2) ≈ clone(2) ≈ splice(2) > ripUp(1) ≈ threeStickersBlind(1). Slots carry `stickers`, `stapledTpls`, `empowerRolls`, `subtypeRolls`, `permaBuffs`, `bonusTrigger`, `charges`. Save schema versioned at 2; `MIGRATIONS` table walks old saves forward declaratively. Mid-game snapshot taken at game start (`midGameSlotsSnapshot`) so a mid-game crash restores prior state on load — prevents reward-farming by quitting.

### 3.6 Persistence

`localStorage` is the only persistence:
- `magiclike_run_v1` — current roguelike run state (deck, stickers, wins/losses, map, pendingReward)
- `magiclike_picklog_v1` — draft history analytics
- `magiclike_settings_v1` — display preferences

Schema migrations live in `RUN` and run at load. Save version constant in `run.js:4`. Schema details in [`SPEC.md`](SPEC.md).

### 3.7 Testing

Node-based regression harness under `reference/html-proto/tests/`:
```
node tests/run_all.js                       # 482 assertions, ~2s
node tests/selfplay_harness.js 500 bughunt  # AI vs AI, ~20s
```
`tests/_setup.js` stubs the DOM and concatenates JS modules in script-tag order. Engine-level coverage only — no DOM/UI tests.

---

## 4. Cross-reference: ported vs deferred

| Concern | Godot port | html-proto | Notes |
|---|---|---|---|
| Stack + priority | ✓ Phase 1 | ✓ | Both use real LIFO with APNAP ordering. |
| Triggered abilities | ✓ Phase 4 | ✓ | Godot has 1 predicate, proto has 14. |
| Triggered ability target picking | ✓ Phase 4.5b | ✓ | Pyromaniac in both. |
| Library + draw + decking | ✓ Phase 4.5a | ✓ | Both implement 704.5b. |
| Counterspell | ✓ Phase 4.5c | ✓ | Both via `counter` effect. |
| Combat keywords | ✓ Phase 5a (11) | ✓ | Both: trample/lifelink/deathtouch/first-strike/menace/flying/reach/vigilance/hexproof/indestructible/defender/haste/unblockable. |
| Two-pass combat damage | ✓ Phase 5a | ✓ | Both. |
| AI vs AI | ✓ Phase 5c | ✓ | Godot completes games at 200-turn cap. |
| Card pool size | 23 (.tres playable) / 258 (JSON-loadable) | 258 | `json_card_loader.gd` reads proto's 258 directly; 109 fully supported today. Pool growth = implement effect kinds, not transcribe cards. |
| Stickers | ✗ | ✓ | Phase 7. Seam in `CardInstance.effective_keywords()`. |
| Draft | ✗ | ✓ | Phase 8. |
| Roguelike meta (run/map/rewards) | ✗ | ✓ | Phase 9. |
| Modal trigger building (Mercurial / Codex) | ✗ | ✓ | Out of current scope. |
| Modal spells | ✗ | ✓ | Out of current scope. |
| Tokens | ✗ | ✓ | Out of current scope. |
| Static lords (stat buffs) | ✗ | partial | Buffs work in proto; keyword grants don't yet. |
| Render diffing | n/a (Godot retained-mode) | ✗ | Proto repaints on every event. |

Phase 6–10 of `docs/godot-port-plan.md` covers most of the deferred items in order.
