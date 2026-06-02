# Engine Reference — Architecture & Data Contracts

How the **Godot port** is built: where each piece of behavior lives (modules) **and** what its data looks like at runtime (contracts), organized by subsystem so both sit together. This is one engine's *internals*.

**Boundary with the other reference docs:**
- [`RULES.md`](RULES.md) — what the game does, in plain English (canon, implementation-independent).
- [`PROTOCOL.md`](PROTOCOL.md) — the **cross-engine wire contract** both engines obey: the `card.json` schema and the effect-kind / event-kind / predicate-id / target catalogs. When this doc and PROTOCOL touch (card/effect/trigger shapes), **PROTOCOL owns the wire vocabulary**; this doc owns the Godot in-memory shapes that consume it.
- [`DIVERGENCE.md`](DIVERGENCE.md) — where the Godot port and html-proto behave differently.
- The html-proto's own internals live in its onboarding doc, [`reference/html-proto/CLAUDE.md`](../reference/html-proto/CLAUDE.md) (module map) + [`CHANGELOG.md`](../reference/html-proto/CHANGELOG.md) — not restated here (§3).

*(For durable architecture rationale — the "why" — see [`docs/wiki/`](wiki/README.md). Live counts (LOC, card totals) are deliberately omitted here; read the code.)*

---

## 1. Repo layout

```
/                              Godot project root, working tree on `dev`
├── CLAUDE.md                  onboarding (architecture decisions, gotchas, doc map)
├── LICENSES.md                canonical record of outside resources
├── project.godot              autoload: RulesEngine = res://engine/engine.gd
├── index.html                 redirect → reference/html-proto/ (Pages entry)
├── .nojekyll                  disables Jekyll on Pages
├── addons/card-framework/     vendored chun92 framework (MIT; do not modify)
├── assets/                    shared between Godot port and html-proto
│   ├── fonts/Almendra/        SIL OFL 1.1
│   └── mana/                  WUBRG SVGs + design source
├── cards/
│   ├── templates/             *.tres CardResources (hand-curated playable set)
│   ├── images/                placeholder PNGs; a few wired-in inserts
│   └── data/                  empty — JsonCardFactory wiring is vestigial
├── data/                      CardResource base + subclasses
├── engine/                    pure-data rules engine
│   ├── engine.gd              autoload (state holder + dispatcher)
│   ├── engine_state.gd        EngineState container
│   ├── player.gd, mana_pool.gd, stack.gd, phase_machine.gd, card_instance.gd
│   ├── action.gd              action constants + factories
│   ├── ai/                    ai.gd, combat.gd, burn.gd, scoring.gd
│   ├── effects/               effects.gd + per-kind handlers
│   └── predicates/predicates.gd
├── scenes/
│   ├── card.{gd,tscn}         Card subclass — overlays, focus, glows
│   ├── json_card_factory.tscn TresCardFactory wiring
│   ├── game/                  game_board, player_panel, combat_lines
│   └── zones/battlefield_zone.gd
├── tests/                     test_phase{...}.{gd,tscn}, one per shipped slice
├── docs/                      this file + RULES/PROTOCOL/DIVERGENCE + REFACTOR-NOTES
│                              + plans/ + wiki/ + archive/
└── reference/html-proto/      JS prototype (active on dev; serves GitHub Pages)
    ├── magiclike_engine.html  single-page entry (DOM + inline CSS + script tags)
    ├── js/                    IIFE modules (load-ordered)
    ├── cards/<tplId>/         per-card folders + art + _manifest.json
    ├── tests/                 Node regression harness
    ├── CLAUDE.md              proto onboarding (module map, current VERSION)
    └── CHANGELOG.md           proto version history
```

GitHub Pages serves from `dev`, pointing at `reference/html-proto/magiclike_engine.html`. Pushing to `dev` makes html-proto changes live; Godot changes don't affect Pages but share the branch.

---

## 2. Godot engine (by subsystem)

### 2.1 Module map

| File | Role | Public surface |
|---|---|---|
| `engine/engine.gd` | Autoload `RulesEngine`. State holder, action dispatch, settle loop, trigger drain, stack resolution, two-pass combat damage, SBAs, legal-action enumeration. | `execute_action`, `is_legal_action`, `get_legal_actions`, `state()`, `counter_stack_entry`, signals `state_changed`/`log_appended`/`game_over` |
| `engine/engine_state.gd` | RefCounted state container. Players, stack, attackers, blockers, pending_triggers, awaiting states, log, winner. | direct field access; `player_by_key`, `find_instance`, `make_instance`, `opponent_of`, `duplicate_deep` |
| `engine/player.gd` | Per-player zones (hand, library, battlefield, graveyard, exile), life, mana, land-play flag, `life_lost_this_turn`. | `find_battlefield`, `find_hand`, `move_card`, `untap_step`, `duplicate_deep` |
| `engine/mana_pool.gd` | Color + generic mana accounting (greedy saturation), pretty-printer. | `add_dict`, `pay`, `to_string_short` |
| `engine/stack.gd` | LIFO of `StackEntry` (spells AND triggered abilities). | `push`, `pop`, `top`, `clear` |
| `engine/phase_machine.gd` | Turn structure (UNTAP / UPKEEP / DRAW / MAIN1 / COMBAT_ATTACK / COMBAT_BLOCK / COMBAT_DAMAGE / MAIN2 / END / CLEANUP). | `current`, `advance`, `phase_name`, `is_main_phase`, `is_combat_phase` |
| `engine/card_instance.gd` | Per-card runtime state (see §2.7). | `current_power`, `current_toughness`, `effective_keywords`, `has_keyword`, `clear_eot_modifiers` |
| `engine/action.gd` | Action constants (`KIND_*`) + factory functions. | `make_*` helpers, `target_player`, `target_creature` |
| `engine/effects/effects.gd` | Effect dispatcher. `HANDLERS` table maps `kind` → handler. | `resolve_one(effect, ctx)`, `resolve_list(effects, ctx)` |
| `engine/effects/{damage,add_mana,pump,gain_life,counter}.gd` | Per-kind handlers. Signature `execute(effect, ctx)`. | `execute` |
| `engine/predicates/predicates.gd` | String-keyed condition registry. Boot-time `validate_all_card_predicates`. | `evaluate(name, state, source, event)`, `validate_all_card_predicates(cards)` |
| `engine/json_card_loader.gd` | Loads the html-proto `card.json` files into `CardResource` instances (the cross-engine wire format; see [`PROTOCOL.md`](PROTOCOL.md)). Translation tables map JS-isms to Godot's snake_case shape. Boot supportability scan reports unsupported cards by missing kind. | `load_card`, `load_all`, `supportability_report` |
| `engine/ai/ai.gd` | `AI.decide(state, player_key) -> Dictionary`. Hierarchical decision (§2.8). | `decide` |
| `engine/ai/combat.gd` | `decide_attackers`, `decide_blockers`, `simulate_combat` (deep-copy + reuse engine damage). | same |
| `engine/ai/burn.gd` | `face_damage_in_hand`, `has_lethal`. | same |
| `engine/ai/scoring.gd` | `AIScoring.card_value(template, purpose)`. | `card_value` |
| `cards/templates/card_database.gd` | Auto-discovering `.tres` registry; lazy-cached directory walk. | `get_card(card_id)`, `all_card_ids()` |
| `data/card_resource.gd` + subclasses | `CardResource` base; `CreatureResource`/`SpellResource`/`LandResource` (§2.7). | `@export` fields; `has_type`, `is_land`, `is_spell`, `is_permanent` |
| `scenes/game/game_board.gd` | UI orchestrator. Builds the scene tree programmatically; binds engine signals; routes clicks to actions across interaction modes. | `_ready`, signal handlers, click routers |
| `scenes/game/player_panel.gd` | Life, mana, zone counts, low-library warning. | `update_from_player`, signal `clicked` |
| `scenes/game/combat_lines.gd` | Overlay drawing attacker→blocker + spell→target lines. | `_process`, `_draw` |
| `scenes/card.gd` | Card subclass — oracle overlay, legality glow, combat highlight, right-click focus. Passive. | `apply_card_text`, `apply_creature_state`, `set_combat_highlight`, `set_legality_glow`, `enter_focus`/`exit_focus` |
| `scenes/zones/battlefield_zone.gd` | Two-row layout (creatures + lands), adaptive spacing, combat-aware reordering. | overrides `_card_can_be_added`, `_update_target_positions` |

### 2.2 Runtime data flow

```
                ┌───────────────────────────────────────────┐
                │  RulesEngine (autoload, engine/engine.gd) │
   click ───→   │    execute_action(action) ──┐             │
                │                             ▼             │
                │     _do_action  ──→  state mutations      │
                │     _fire_event ──→  pending_triggers     │
                │     _settle_state loop:                   │
                │       _drain_pending_triggers (APNAP)     │
                │       _resolve_*_entry (stack)            │
                │       _run_sbas                           │
                │       _advance_phase                      │
                │    signals: state_changed, log_appended,  │
                │             game_over                     │
                └────────────┬──────────────────────────────┘
                             ▼
                ┌───────────────────────────────────────────┐
                │  game_board (scenes/game/game_board.gd)   │
                │    on state_changed → _refresh_ui →       │
                │      sync visuals / stack / glows /       │
                │      combat highlights / panels / log     │
                └───────────────────────────────────────────┘
```

`state_changed` fires only after the settle loop fully drains — the UI sees one consistent post-settlement state per `execute_action`. Mid-state pauses (awaiting trigger target / block declaration / discard) are expressed as fields on `EngineState` (§2.3) and read on the next refresh.

### 2.3 Action dispatch & state

**Every state mutation routes through `RulesEngine.execute_action(action: Dictionary)`.** Action kind drives a switch into a `_do_*` function; legality is pre-checked by a parallel `_legal_*`; the same kinds are enumerated in `get_legal_actions` for the AI. (The three-way split is flagged in [`REFACTOR-NOTES.md`](REFACTOR-NOTES.md).)

**Action descriptors** — untyped `Dictionary` keyed by `"kind"`; constants + factories in `engine/action.gd`:

| Kind | Constructor | Required fields | Notes |
|---|---|---|---|
| `"pass_priority"` | `make_pass_priority()` | — | The default tick. |
| `"play_land"` | `make_play_land(source_iid)` | `source_iid` | Player must have a land-play remaining. |
| `"cast_spell"` | `make_cast_spell(source_iid, targets)` | `source_iid`, `targets: Array` | `targets` empty when `requires_target = false`. |
| `"activate_ability"` | `make_activate_ability(source_iid, ability_index)` | `source_iid`, `ability_index` | Lands' tap-for-mana goes through here. |
| `"declare_attacker"` | `make_declare_attacker(source_iid)` | `source_iid` | Per attacker during COMBAT_ATTACK. |
| `"declare_blocker"` | `make_declare_blocker(blocker_iid, attacker_iid)` | `source_iid` (blocker), `attacker_iid` | One per block assignment. |
| `"undeclare_attacker"` / `"undeclare_blocker"` | `make_undeclare_*` | `source_iid` | Untaps / clears the link. |
| `"confirm_blocks"` | `make_confirm_blocks()` | — | Defender commits; opens APNAP priority window. |
| `"pick_trigger_target"` | `make_pick_trigger_target(target)` | `target: Dictionary` | Required when `awaiting_target_for_trigger` is set. |
| `"discard_card"` | `make_discard_card(source_iid)` | `source_iid` | Cleanup-step discard (MTG 514.3). |

**Target descriptors** — passed inside an action's `"targets"` array:
```gdscript
{"kind": "player",   "who": "you" | "opp"}      # Action.target_player(who)
{"kind": "creature", "iid": int}                # Action.target_creature(iid)
{"kind": "stack",    "iid": int}                # counter target
```
Some effect handlers accept an alternate bare-string form (e.g. `"controller"`, `"opponent"`) when the effect dict itself names the target — see §2.5.

**EngineState** (`engine/engine_state.gd`) — passive container, direct field access, `duplicate_deep()` for AI snapshots:

| Field | Type | Notes |
|---|---|---|
| `you`, `opp` | `Player` | Per-player zones + life + mana. |
| `active_player_key` / `priority_player_key` | `String` | Whose turn / whose priority. |
| `phase_machine` | `PhaseMachine` | Current phase + turn structure. |
| `stack` | `Stack` | LIFO of `StackEntry`. |
| `attackers` | `Array[int]` | Attacker iids this combat. |
| `blockers` | `Dictionary` | `{blocker_iid: attacker_iid}`. |
| `pending_triggers` | `Array` | Queued triggers, draining APNAP. |
| `awaiting_target_for_trigger` / `awaiting_block_declaration` / `awaiting_discard` | see below | Mid-state pauses. |
| `log` | `Array[String]` | Game log. |
| `winner` | `String` | `""` until game ends (the `game_over` signal arg is named `winner_key`). |
| `turn_number` | `int` | 1-indexed. |

**Awaiting states** — fields that pause the settle loop until a specific action arrives; only one active at a time, enforced in `_current_actor`:

| Field | Shape when active | Cleared by | Precedence |
|---|---|---|---|
| `awaiting_target_for_trigger` | `{controller_key, source_iid, trigger_index, target_filter, valid_targets}` | `pick_trigger_target` with a matching target | Highest — before priority assignment. |
| `awaiting_block_declaration` | `String` (defender key) | `confirm_blocks` (+ any declare/undeclare first) | Holds priority closed at COMBAT_BLOCK (MTG 509.1a). |
| `awaiting_discard` | `{controller_key, remaining}` | `discard_card` (`remaining` decrements) | Cleanup-step only. |

**Engine signals** (on the autoload; UI binds in `game_board._ready`):

| Signal | Args | Emitted | UI response |
|---|---|---|---|
| `state_changed` | — | After the settle loop fully drains (+ on init). | `_refresh_ui` — visuals, stack/log, glows, combat highlights, phase label. |
| `log_appended` | `message: String` | On `append_log` (UI currently reads `state.log` on `state_changed`). | Log re-renders on `state_changed`. |
| `game_over` | `winner_key: String` | Once a win condition fires and SBAs settle. | Game-over dialog. |

### 2.4 Stack, priority, combat, SBAs

**Stack and priority.** The stack is `Array[StackEntry]`, holding both spell entries and triggered-ability entries; both resolve via `_resolve_*_entry`. Priority follows MTG semantics where it matters (caster retains after casting; pools empty at phase boundaries; defender declares blocks before priority opens at COMBAT_BLOCK; triggers drain APNAP). Auto-passes (AI driver, unattended windows) are agent UX on top — the priority pass IS happening, it's just `execute_action(pass_priority)` called automatically. (Rule numbers + the design rationale: [`RULES.md`](RULES.md) §600 and [`docs/wiki/magiclike-architecture.md`](wiki/magiclike-architecture.md).)

**Combat damage.** Two-pass (`_combat_damage_pass` called twice — first-strike layer, then normal). Inner loop iterates attacker → assigned blockers, applies trample / menace collapse / first-strike skip / lifelink / deathtouch. SBAs sweep after each pass.

**State-based actions.** `_run_sbas` checks lethal damage (`damage_marked ≥ toughness` or deathtouch hit), 0-life, and decking out (empty library on draw). Single sweep — not strict 704.5 ordering — cleared in the same settle iteration.

### 2.5 Effects

`engine/effects/` — `effects.gd` declares `HANDLERS` (`damage`, `add_mana`, `pump`, `gain_life`, `counter`). Every handler is `static func execute(effect: Dictionary, ctx: Dictionary)`. Fizzle is per-handler (targets gone → log + return).

The **canonical effect-kind catalog** (cross-engine) is [`PROTOCOL.md`](PROTOCOL.md) §3.2; the shapes below are the **Godot** per-kind descriptors + the `ctx` the engine assembles.

**`ctx`** (built by the engine, passed to every handler):
```gdscript
{
    "controller": Player, "source": CardInstance,   # source null for off-zone spell effects
    "source_name": String, "source_iid": int,        # -1 if no source
    "state": EngineState,                             # explicit state — no autoload reach
    "targets": Array[Dictionary],                     # locked-in target descriptors
    "log": Array[String]
}
```
Handlers read `ctx.state` for cross-player lookups; they do **not** reach into the `RulesEngine` autoload — one documented exception: `counter.gd` calls `RulesEngine.counter_stack_entry()` because the off-zone stack-held-cards buffer lives on the autoload.

```gdscript
{"kind": "damage", "amount": int, "target": "chosen" | "controller" | "opponent"}
  # "chosen" reads ctx.targets[0] (player or creature); damage to creatures sets damage_marked.
{"kind": "add_mana", "amounts": {"W":1,"R":2,...}}   # OR flat shorthand {"kind":"add_mana","R":1}
{"kind": "pump", "power": int, "toughness": int, "target": "chosen", "duration": "eot" | "permanent"}
  # "eot" → temp_power/temp_toughness; "permanent" → +1/+1 counters.
{"kind": "gain_life", "amount": int}                 # always ctx.controller; non-positive logs+skips.
{"kind": "counter", "target": "chosen"}              # ctx.targets[0] = {"kind":"stack","iid":int}
```

### 2.6 Triggers & predicates

**Trigger drain.** `_fire_event` scans battlefield creatures, matches `event` + `cond_id`, enqueues `TriggerEntry` to `pending_triggers`. `_drain_pending_triggers` orders APNAP, resolves listeners with no target prompt, and pauses on `awaiting_target_for_trigger` for cards needing input (Pyromaniac). Resumes on `pick_trigger_target`.

**Predicate contract** (`engine/predicates/predicates.gd`). Card conditions are referenced by string `cond_id`; the registry resolves name → function. (Design rationale: [`docs/wiki/predicate-registry.md`](wiki/predicate-registry.md).)
```gdscript
static func cond_<name>(state: EngineState, source: CardInstance, event: Dictionary) -> bool
```
- `state` passed explicitly — **no `RulesEngine.state()` reads inside a predicate** (testability rule). Empty `cond_id` = always-true.
- **Adding one:** add `cond_<name>`, append to `_PRED_NAMES`, add a branch to `evaluate`'s `match`.
- **Boot validation:** `validate_all_card_predicates` walks every loaded `CardResource`, collects `cond_id`s from `triggers`, `push_error`s on any unknown name (runs from `engine.gd._ready()`). A card-local hook (`_is_card_local_predicate`) is reserved, no callers yet.

### 2.7 Card data

Two coexisting paths today: the **`.tres` templates** (`cards/templates/*.tres`, the hand-curated playable set; `card_database.gd` lazily directory-walks them) and the **JSON wire path** (`engine/json_card_loader.gd` reads the html-proto `card.json` directly — the cross-engine wire format, [`PROTOCOL.md`](PROTOCOL.md) — and materializes `CardResource` instances). A boot **supportability scan** reports how many proto cards are fully playable (the rest await effect-kind handlers), making pool growth a *prioritization* problem, not a *translation* one. Consolidating the visual layer onto JSON (retiring `.tres`) is [`plans/plan-card-data-unification.md`](plans/plan-card-data-unification.md).

**`CardResource` schema** (`data/card_resource.gd`; the Godot in-memory class — mirrors the [`PROTOCOL.md`](PROTOCOL.md) §2 wire schema plus Godot-only fields). One `.tres` per template under `cards/templates/<card_id>.tres`.

| Field (base) | Type | Notes |
|---|---|---|
| `card_id` | `String` | Unique; matches filename stem. |
| `display_name` | `String` | UI. |
| `front_image_path` | `String` | Relative to `cards/images/`. |
| `card_types` | `Array[String]` | e.g. `["creature"]`, `["land"]`. Multi-type allowed. |
| `subtypes` | `Array[String]` | e.g. `["human","warrior"]`. |
| `mana_cost` | `Dictionary` | Keys `W U B R G C(generic)` → positive ints. Empty for lands/free spells. |
| `text` | `String` | Display only; not parsed by the engine. |
| `on_cast_effects` | `Array[Dictionary]` | Effects on resolution (§2.5). |
| `activated_abilities` | `Array[Dictionary]` | `{"cost":{"tap":bool,"mana":{...}}, "effects":[...]}`. |
| `triggers` | `Array[Dictionary]` | see below. |

Subclasses: **`CreatureResource`** (`power`, `toughness`, `keywords`) · **`SpellResource`** (`requires_target`, `target_filter`) · **`LandResource`** (`mana_produced` — tap-for-mana ability auto-constructed; do not populate `activated_abilities`).

**Triggered-ability schema** — each `triggers` entry:
```gdscript
{"event": String, "cond_id": String, "effects": Array[Dictionary],
 "self_only": bool, "target_filter": String}   # target_filter required if any effect uses target:"chosen"
```
Observed events (`.tres` set): `"card_enters_battlefield"`, `"card_dies"`. Target-filter values: `"creature_or_player"` (any target), `"creature"`, `"player"`, `"opp_creature"`, `"your_creature"`, `"spell"`, `"any"`. *(These are the current Godot Phase-5c values; the converged wire vocabulary is PROTOCOL §3.3–§3.5 — Godot adopts it with the effects/zone-change refactors.)*

**`CardInstance` runtime state** (`engine/card_instance.gd`; per-card mutable, separate from the immutable template):

| Field | Purpose | Cleared by |
|---|---|---|
| `instance_id` | Globally unique id. | never |
| `template` | Pointer to the `CardResource`. | never |
| `owner_key` / `controller_key` | Started-with / current controller (steal). | controller resets on leave-play |
| `tapped` | Tap state. | untap step |
| `damage_marked` | Damage this turn. | cleanup |
| `temp_power` / `temp_toughness` | EOT buffs. | cleanup (`clear_eot_modifiers`) |
| `counters` | `{"+1/+1": int}`. | leave-play |
| `granted_keywords` | Runtime keyword grants. | leave-play (eot subset at EOT) |
| `summoning_sick` | Until controller's next untap. | untap step |
| `lethal_marked` | SBA destroy-pending flag. | SBA sweep |

`effective_keywords()` unions template keywords + `granted_keywords` (+ a reserved sticker seam, Phase 7).

### 2.8 AI

```
AI.decide(state, player_key):
    awaiting_target_for_trigger ──→ pick_trigger_target
    awaiting_discard            ──→ discard_card
    awaiting_block_declaration  ──→ decide_blockers → confirm_blocks
    combat_attack && active     ──→ decide_attackers
    stack non-empty             ──→ instant response (counter / burn / pass)
    main && active && priority  ──→ main play (land → biggest spell → ability)
    else                        ──→ pass_priority
```
`combat.gd:simulate_combat` calls `state.duplicate_deep()` then **reuses `RulesEngine._resolve_combat_damage()` on the snapshot** — first-strike/lifelink/trample/deathtouch logic stays in one place, AI gets honest simulation. `scoring.gd:card_value(template, purpose)` is a playtested heuristic (power+toughness minus a cost factor + a keyword table); purpose toggles draft vs in-hand-keep.

### 2.9 UI

**`game_board.gd`** is the orchestrator: programmatic scene-tree construction (zones + panels + combat overlay + stack/log + action button); the `_iid_to_visual` map binding engine instance ids to card-framework `Card` nodes; interaction modes via flag fields (casting / blocking / trigger-target / discard); auto-tap mana planning (`_plan_lands_to_tap` — pure rules logic temporarily in UI); legality glows (per refresh, calls `get_legal_actions` and decorates visuals).

**`scenes/card.gd`** is passive — game_board pushes state in. Adds a right-click focus mode that briefly bypasses card-framework's hover state machine (guarded reentry). **Click-to-cast** is enforced by routing hand-card clicks via `gui_input` directly, bypassing the addon's drag system (drag is reserved for move-between-containers). **`combat_lines.gd`** overlays attacker→blocker + stack-spell→target lines. **`battlefield_zone.gd`** subclasses `CardContainer` with a two-row split and persists creature order across refreshes so post-combat layout doesn't snap back.

### 2.10 Test suite

Runnable scenes under `tests/`, one per shipped slice (Phases 1 … 5c), each headless-executable via the Godot CLI (invocation in `CLAUDE.md`), printing assertion results and exiting 0/1.

| Phase | Coverage |
|---|---|
| 1 | Click-to-cast Lightning Bolt, mana, stack, priority |
| 2 | Play land, cast creature, summoning sickness, untap, attack, damage |
| 3 | Blockers, instant-speed response, pump, two-spell stack |
| 4 | ETB trigger, death trigger, predicate gating, APNAP drain |
| 4.5a/b/c | Library/draw/decking · interactive trigger target picker · counterspell, gain_life, basics, vanilla curve |
| 5a/b/c | Combat keywords + two-pass damage · `get_legal_actions`/`duplicate_deep`/`card_value` · `AI.decide` + full AI-vs-AI game |

No batch runner — each `.tscn` is invoked individually (flagged in [`REFACTOR-NOTES.md`](REFACTOR-NOTES.md)).

---

## 3. html-proto

The html-proto's own internals — module map, `G` singleton, `step()` loop, effect dispatch, draft/run/persistence — are documented in its onboarding doc, **[`reference/html-proto/CLAUDE.md`](../reference/html-proto/CLAUDE.md)** (with version history in **[`CHANGELOG.md`](../reference/html-proto/CHANGELOG.md)**). They are not restated here — that's the home, and restating them is what made this section rot. For the **relationship** between the two engines, see §4 and [`docs/wiki/cross-engine-port.md`](wiki/cross-engine-port.md); for the wire contract they share, [`PROTOCOL.md`](PROTOCOL.md).

---

## 4. Cross-engine: ported vs deferred

| Concern | Godot port | html-proto | Notes |
|---|---|---|---|
| Stack + priority | ✓ | ✓ | Both real LIFO with APNAP. |
| Triggered abilities | ✓ | ✓ | Godot has fewer predicates (one registered); proto has the full set. |
| Trigger target picking | ✓ | ✓ | Pyromaniac in both. |
| Library + draw + decking | ✓ | ✓ | Both implement 704.5b. |
| Counterspell | ✓ | ✓ | Both via `counter`. |
| Combat keywords + two-pass damage | ✓ | ✓ | trample/lifelink/deathtouch/first-strike/menace/flying/reach/vigilance/hexproof/indestructible/defender/haste/unblockable. |
| AI vs AI | ✓ | ✓ | Godot completes games to a winner. |
| Card pool | the curated `.tres` set; the proto's full pool is JSON-loadable, growing as effect-kinds are implemented | the full pool | `json_card_loader.gd` reads the proto cards directly. |
| Stickers / Draft / Roguelike meta | ✗ | ✓ | Godot Phases 7–9 (seam reserved in `CardInstance.effective_keywords()`). |
| Modal trigger building / modal spells / tokens | ✗ | ✓ | Out of current Godot scope. |
| Static lords (stat buffs) | partial | partial | Buffs work in proto; keyword grants pending on Godot. |

Forward roadmap: [`plans/godot-port-plan.md`](plans/godot-port-plan.md).

---

## 5. Asset conventions

| Asset | Location | Used by |
|---|---|---|
| Almendra font | `assets/fonts/Almendra/` | Both — html-proto via `@font-face`; Godot via project import. |
| Mana SVGs (`{W,U,B,R,G}.svg`) | `assets/mana/` | Both. |
| Mana source (`source/…`) | `assets/mana/source/` | Design source; not loaded at runtime. |
| Godot card images / templates | `cards/images/` · `cards/templates/<card_id>.tres` | `TresCardFactory` · `CardDatabase.get_card`. |
| html-proto card art / frames | `reference/html-proto/cards/<tplId>/art.png` · `reference/html-proto/assets/frames/` | `effectiveArt` · CSS background. |

When a new outside resource is added, log it in [`LICENSES.md`](../LICENSES.md) per the rule in the root `CLAUDE.md`.

---

## See also
Persistence / save schema is an html-proto runtime concern documented in its onboarding doc ([`reference/html-proto/CLAUDE.md`](../reference/html-proto/CLAUDE.md) → Persistence); the Godot port has no save layer yet (Phase 9). Structural debt: [`REFACTOR-NOTES.md`](REFACTOR-NOTES.md).
