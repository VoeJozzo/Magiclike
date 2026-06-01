# Data Contracts

Schemas and contracts that the engine, AI, UI, and persistence layers depend on. The "what does X look like in memory" reference. Pairs with [`ARCHITECTURE.md`](ARCHITECTURE.md) (module map) and [`REFACTOR-NOTES.md`](REFACTOR-NOTES.md) (structural debt). State as of Godot Phase 5c / html-proto v1.0.189.

> **SPEC = within-engine runtime contracts** (action descriptors, the effect-handler `ctx` shape, engine signals, awaiting states, CardInstance/EngineState runtime fields, save schema). The **cross-engine wire format** — the `card.json` schema and the effect-kind / event-kind / predicate-id / target catalogs both engines must agree on — lives in [`PROTOCOL.md`](PROTOCOL.md). Where the two touch, SPEC defers to PROTOCOL for the wire vocabulary.

---

## 1. Godot port

### 1.1 Action descriptors

Actions are untyped `Dictionary` shapes keyed by `"kind"`. The constants and factories live in `engine/action.gd`. Every state mutation routes through `RulesEngine.execute_action(action)`.

| Kind | Constructor | Required fields | Notes |
|---|---|---|---|
| `"pass_priority"` | `make_pass_priority()` | — | The default tick. |
| `"play_land"` | `make_play_land(source_iid)` | `source_iid: int` | Player must have land-play remaining. |
| `"cast_spell"` | `make_cast_spell(source_iid, targets)` | `source_iid: int`, `targets: Array` | `targets` empty for spells with `requires_target = false`. |
| `"activate_ability"` | `make_activate_ability(source_iid, ability_index)` | `source_iid: int`, `ability_index: int` (default 0) | Lands' tap-for-mana goes through here. |
| `"declare_attacker"` | `make_declare_attacker(source_iid)` | `source_iid: int` | Sent per attacker during COMBAT_ATTACK. |
| `"declare_blocker"` | `make_declare_blocker(blocker_iid, attacker_iid)` | `source_iid: int` (the blocker), `attacker_iid: int` | One per block assignment. |
| `"undeclare_attacker"` | `make_undeclare_attacker(source_iid)` | `source_iid: int` | Untaps and removes from `state.attackers`. |
| `"undeclare_blocker"` | `make_undeclare_blocker(source_iid)` | `source_iid: int` | Clears link in `state.blockers`. |
| `"confirm_blocks"` | `make_confirm_blocks()` | — | Defender commits; opens APNAP priority window. |
| `"pick_trigger_target"` | `make_pick_trigger_target(target)` | `target: Dictionary` (target descriptor) | Required when `state.awaiting_target_for_trigger` is set. |
| `"discard_card"` | `make_discard_card(source_iid)` | `source_iid: int` | Required while `state.awaiting_discard` is set (cleanup-step discard, MTG 514.3). |

### 1.2 Target descriptors

Targets passed inside an action's `"targets"` array follow this shape:

```gdscript
{"kind": "player",   "who": "you" | "opp"}                    # via Action.target_player(who)
{"kind": "creature", "iid": int}                              # via Action.target_creature(iid)
{"kind": "stack",    "iid": int}                              # counter target
```

Some effect handlers accept an alternate non-descriptor form (a bare string like `"controller"` or `"opponent"`) when the effect dictionary itself specifies the target — see §1.4.

### 1.3 CardResource schema

Base class at `data/card_resource.gd`. Subclasses extend with type-specific fields. One `.tres` per template under `cards/templates/<card_id>.tres`.

**`CardResource` (base, `data/card_resource.gd`)**

| Field | Type | Default | Notes |
|---|---|---|---|
| `card_id` | `String` | `""` | Unique identifier; must match filename stem. |
| `display_name` | `String` | `""` | Shown in UI. |
| `front_image_path` | `String` | `"card_front.png"` | Relative to `cards/images/`. |
| `card_types` | `Array[String]` | `[]` | E.g., `["creature"]`, `["instant"]`, `["land"]`. Multi-type allowed. |
| `subtypes` | `Array[String]` | `[]` | E.g., `["human", "warrior"]`, `["plains"]`. |
| `mana_cost` | `Dictionary` | `{}` | Keys: `W` `U` `B` `R` `G` `C` (generic). Values: positive integers. Empty for lands and free spells. |
| `text` | `String` | `""` | Display text. Not parsed by the engine. |
| `on_cast_effects` | `Array[Dictionary]` | `[]` | Effects that resolve when the spell resolves. See §1.4. |
| `activated_abilities` | `Array[Dictionary]` | `[]` | Each `{"cost": {"tap": bool, "mana": {...}}, "effects": [...]}`. |
| `triggers` | `Array[Dictionary]` | `[]` | See §1.5. |

**`CreatureResource` (extends, `data/creature_resource.gd`)**

| Field | Type | Default | Notes |
|---|---|---|---|
| `power` | `int` | `0` | Base power. Runtime modifications live on `CardInstance.temp_power` and `counters["+1/+1"]`. |
| `toughness` | `int` | `0` | Base toughness. |
| `keywords` | `Array[String]` | `[]` | Template keywords. Runtime grants/removes live on `CardInstance.granted_keywords`. |

**`SpellResource` (extends, `data/spell_resource.gd`)**

| Field | Type | Default | Notes |
|---|---|---|---|
| `requires_target` | `bool` | `false` | UI enters target-picking mode when `true`. |
| `target_filter` | `String` | `"any"` | One of: `"any"`, `"creature"`, `"player"`, `"opp_creature"`, `"your_creature"`, `"spell"`. |

**`LandResource` (extends, `data/land_resource.gd`)**

| Field | Type | Default | Notes |
|---|---|---|---|
| `mana_produced` | `Array[String]` | `[]` | One color per producible mana. Tap-for-mana ability auto-constructed; do NOT populate `activated_abilities`. |

**Worked example: `bloodlust_berserker.tres`**

```gdscript
[gd_resource type="Resource" script_class="CreatureResource" format=3]
[ext_resource type="Script" path="res://data/creature_resource.gd" id="1_ub7q2"]

[resource]
script = ExtResource("1_ub7q2")
power = 3
toughness = 2
card_id = "bloodlust_berserker"
display_name = "Bloodlust Berserker"
card_types = Array[String](["creature"])
subtypes = Array[String](["human", "warrior"])
mana_cost = {"C": 1, "R": 2}
text = "When Bloodlust Berserker dies, if the opponent lost life this turn, it deals 2 damage to the opponent."
triggers = Array[Dictionary]([{
    "cond_id": "opp_lost_life_this_turn",
    "effects": [{"amount": 2, "kind": "damage", "target": "opponent"}],
    "event": "card_dies",
    "self_only": true
}])
```

### 1.4 Effect descriptors

Effects appear in `on_cast_effects`, in `activated_abilities[i].effects`, and in `triggers[i].effects`. Each effect is a `Dictionary` with `"kind"` plus per-kind fields. Resolved by `engine/effects/effects.gd:resolve_one(effect, ctx)`.

**Common `ctx`** (assembled by engine, passed to handler):

```gdscript
{
    "controller": Player,        # who controls the source
    "source": CardInstance,      # null for spell-effects from off-zone
    "source_name": String,       # used in log messages
    "source_iid": int,           # -1 if no source instance
    "state": EngineState,        # explicit state, no autoload reach
    "targets": Array[Dictionary],# the locked-in targets (target descriptors)
    "log": Array[String]         # append to record events
}
```

**`damage`** (`engine/effects/damage.gd`)
```gdscript
{"kind": "damage", "amount": int, "target": "chosen" | "controller" | "opponent"}
```
- `"chosen"` reads `ctx.targets[0]` — must be a player or creature target descriptor.
- `"controller"` / `"opponent"` apply directly without consulting `targets`.
- Damage to creatures sets `damage_marked`; SBAs clear lethal-marked creatures in the next sweep.

**`add_mana`** (`engine/effects/add_mana.gd`)
```gdscript
{"kind": "add_mana", "amounts": {"W": 1, "R": 2, ...}}
# OR flat shorthand:
{"kind": "add_mana", "R": 1}
```
Adds to `ctx.controller.mana`.

**`pump`** (`engine/effects/pump.gd`)
```gdscript
{
    "kind": "pump",
    "power": int,
    "toughness": int,
    "target": "chosen",          # must be a creature target descriptor in ctx.targets[0]
    "duration": "eot" | "permanent"
}
```
- `"eot"` adds to `temp_power`/`temp_toughness` (cleared at end of turn).
- `"permanent"` adds `+1/+1` counters (`counters["+1/+1"] += max(power, toughness)`).

**`gain_life`** (`engine/effects/gain_life.gd`)
```gdscript
{"kind": "gain_life", "amount": int}
```
Always applies to `ctx.controller`. Non-positive amounts log a warning and skip.

**`counter`** (`engine/effects/counter.gd`)
```gdscript
{"kind": "counter", "target": "chosen"}
# ctx.targets[0] must be {"kind": "stack", "iid": int}
```
Routes through `RulesEngine.counter_stack_entry(iid)` (only effect that reaches into the autoload — needed for the off-zone `_stack_held_cards` buffer). Fizzles cleanly if target spell left the stack.

### 1.5 Triggered ability schema

Each entry in `triggers` is a `Dictionary`:

```gdscript
{
    "event": String,                  # see event vocabulary below
    "cond_id": String,    # registry name, or "" for unconditional
    "effects": Array[Dictionary],     # effect descriptors (§1.4)
    "self_only": bool,                # true → only fires from the source card's events
    "target_filter": String,          # required if any effect uses target: "chosen"
}
```

**Observed event values** (across all `.tres` templates):
- `"card_enters_battlefield"` — card enters the battlefield
- `"card_dies"` — card moves from battlefield to graveyard (damage or removal)

**Target filter values** (used when `effects` contains `target: "chosen"`):
- `"creature_or_player"` — Pyromaniac-style "any target"
- `"creature"` — creature-only
- `"player"` — player-only
- `"opp_creature"`, `"your_creature"` — directional
- `"spell"` — stack entry (for counterspell-style triggers)
- `"any"` — anything legal

### 1.6 Predicate contract

Registry at `engine/predicates/predicates.gd`. Predicates resolve string names to gating functions.

**Signature.** Every predicate is a static function with shape:

```gdscript
static func cond_<name>(state: EngineState, source: CardInstance, event: Dictionary) -> bool
```

- `state` passed explicitly. **No reads of `RulesEngine.state()` from inside a predicate** — testability rule, mirrors the JS prototype's worst pattern (cf. `triggers.js:39–41`).
- `source` is the card whose ability triggered.
- `event` is the dictionary published by `_fire_event` (shape depends on event kind).
- Returns `bool`. Empty `cond_id` string is treated as always-true.

**Currently registered.**

| Name | Returns true when |
|---|---|
| `"opp_lost_life_this_turn"` | `state.player_by_key(state.opponent_of(source.controller_key)).life_lost_this_turn > 0` |

**Adding a new predicate.** Three steps in `predicates.gd`:
1. Add `cond_<name>(state, source, event)` static function.
2. Append `"<name>"` to `_PRED_NAMES`.
3. Add a `"<name>": cond_<name>(...)` branch to `evaluate`'s `match` statement.

**Boot validation.** `engine.gd._ready()` calls `Predicates.validate_all_card_predicates(card_resources)`. Every `cond_id` string referenced in any `triggers` entry must resolve to a `_PRED_NAMES` entry; otherwise `push_error` at startup with a "Unknown cond_id(s): <card>.<predicate>" message.

**Card-local hook.** `_is_card_local_predicate(card, pred)` is reserved for future card-local predicates (B1 pattern from `docs/plans/godot-port-plan.md`). Currently returns `false` — no callers.

### 1.7 Engine signals

Defined on the `RulesEngine` autoload. UI binds in `game_board.gd._ready`.

| Signal | Args | Emitted at | UI response |
|---|---|---|---|
| `state_changed` | — | End of `execute_action` AFTER the settle loop fully drains (engine.gd:262), plus on init (engine.gd:53/77/113/145/219). | `game_board._refresh_ui` — sync visuals, refresh stack/log, apply glows + combat highlights, update phase label. |
| `log_appended` | `message: String` | Engine pushes to `state.log` via `append_log` — signal is currently NOT explicitly emitted (UI reads `state.log` on `state_changed`). | Log panel re-renders on `state_changed`. |
| `game_over` | `winner_key: String` | Once a win condition fires (life ≤ 0, decking out) and SBAs settle. | Game-over dialog. |

Mid-state pauses (awaiting trigger target, awaiting block declaration, awaiting discard) are expressed as fields on `EngineState` and read on the next `state_changed` refresh.

### 1.8 Awaiting states

Fields on `EngineState` that pause the settle loop until a specific action is supplied:

| Field | Shape when active | Cleared by | Precedence |
|---|---|---|---|
| `awaiting_target_for_trigger` | `{controller_key, source_iid, trigger_index, target_filter, valid_targets: Array}` | `KIND_PICK_TRIGGER_TARGET` action with matching target | Highest — checked before priority assignment in `_current_actor`. |
| `awaiting_block_declaration` | `String` (defender's player key) | `KIND_CONFIRM_BLOCKS` action (plus any `declare_blocker`/`undeclare_blocker` before it) | Holds priority closed at COMBAT_BLOCK until cleared (MTG 509.1a). |
| `awaiting_discard` | `{controller_key, remaining: int}` | `KIND_DISCARD_CARD` action; `remaining` decrements | Cleanup-step only. |

Precedence enforced in `_current_actor` (engine.gd around line 433). Only one awaiting state is active at a time — the engine settle loop will not advance phases or open priority until cleared.

### 1.9 CardInstance runtime state

`engine/card_instance.gd` (per-card mutable state, separate from the immutable `CardResource` template).

| Field | Type | Purpose | Cleared by |
|---|---|---|---|
| `instance_id` | `int` | Globally unique instance id. | Never (assigned at creation). |
| `template` | `CardResource` | Pointer to the immutable definition. | Never. |
| `owner_key` | `String` | `"you"` or `"opp"` — who started with the card. | Never. |
| `controller_key` | `String` | Current controller (may differ via steal). | Reset on leave-play. |
| `tapped` | `bool` | Tap state. | Untap step (`Player.untap_step`). |
| `damage_marked` | `int` | Damage assigned this turn. | Cleanup step. |
| `temp_power` | `int` | EOT power buff. | Cleanup step (`clear_eot_modifiers`). |
| `temp_toughness` | `int` | EOT toughness buff. | Cleanup step. |
| `counters` | `Dictionary` | Permanent counters (`{"+1/+1": int}`). | On leave-play. |
| `granted_keywords` | `Array[String]` | Runtime keyword grants. | On leave-play (and EOT for `eot_grants` subset). |
| `summoning_sick` | `bool` | True until the controller's next untap. | Untap step. |
| `lethal_marked` | `bool` | SBA flag — destroy-pending. | Resolution of SBA sweep. |

`effective_keywords()` unions template keywords + `granted_keywords` (+ future sticker contributions — seam reserved per `docs/plans/godot-port-plan.md` Phase 7).

### 1.10 EngineState snapshot

`engine/engine_state.gd`. Direct field access (no encapsulation); `duplicate_deep()` provides AI simulation snapshots.

| Field | Type | Notes |
|---|---|---|
| `you`, `opp` | `Player` | Per-player zones + life + mana. |
| `active_player_key` | `String` | Whose turn it is. |
| `priority_player_key` | `String` | Whose turn it is to act. |
| `phase_machine` | `PhaseMachine` | Current phase + turn structure. |
| `stack` | `Stack` | LIFO of `StackEntry`. |
| `attackers` | `Array[int]` | Attacker iids declared this combat. |
| `blockers` | `Dictionary` | `{blocker_iid: attacker_iid}` map. |
| `pending_triggers` | `Array` | Triggered abilities queued, draining APNAP. |
| `awaiting_target_for_trigger` | `Dictionary` | See §1.8. Empty when not paused. |
| `awaiting_block_declaration` | `String` | Defender key, or `""`. |
| `awaiting_discard` | `Dictionary` | Cleanup-step discard state. |
| `log` | `Array[String]` | Game log. |
| `winner` | `String` | `""` until game ends. (Note: the `game_over` signal's argument is named `winner_key`, but the `EngineState` field is `winner`.) |
| `turn_number` | `int` | 1-indexed. |

Every subclass has its own `duplicate_deep()` so AI snapshots don't share mutable references with the live state. This is the explicit answer to the JS prototype's City of Brass `extraManaColors` lost-on-instantiation bug.

---

## 2. html-proto

### 2.1 Card JSON schema → see [`PROTOCOL.md`](PROTOCOL.md)

The html-proto `card.json` **is the cross-engine wire format** — read by proto's `js/cards.js::ingestCard` and Godot's `engine/json_card_loader.gd`. Its canonical schema lives in **PROTOCOL.md §2–§6** (snake_case fields: `card_id` not `tplId`; `color`/`colors` dropped and recomputed from `cost` at ingest; the effect-kind / event-kind / predicate-id catalogs; the target taxonomy; a worked example). SPEC does not duplicate it — this is the *between-engines* contract, which is PROTOCOL's job.

### 2.2 Triggered ability schema (wire) → see PROTOCOL.md §5

Wire trigger shape (`event`, `cond_id`, `self_only`, `effects`, optional `text`) is PROTOCOL.md §5; the event-kind and predicate-id catalogs are PROTOCOL.md §3.3–§3.4. Some proto predicates close over `G` (the global state singleton) — flagged in `REFACTOR-NOTES.md`.

### 2.3 Runtime slot fields (RUN-tracked, beyond the template)

The `RUN` module attaches per-instance mutation layers to deck slots. These are NOT in the card JSON — they live in the save file.

| Field | Type | Purpose |
|---|---|---|
| `tplId` | string | Anchors the slot to a template. |
| `stickers` | string[] | Sticker ids applied to this slot (deck-persistent). |
| `stapledTpls` | string[] | Spliced-in template ids (creates synthesized templates at runtime). |
| `empowerRolls` | object[] | Per-empower-sticker rolled targets. |
| `subtypeRolls` | string[] | Per-subtype-sticker rolled subtype names. |
| `permaBuffs` | object[] | Permanent stat buffs surviving leave-play (Elystra-style). |
| `bonusTrigger` | object (optional) | Watcher's-Gift-style attached extra trigger. |
| `charges` | number (optional) | Stapler counter. |
| `triggerPool` | object[] (optional) | Mercurial Adept rolled pool. |
| `symmetricized` | object (optional) | Symmetricize roll result. |
| `colorOverride` | string (optional) | Bleach-applied color change. |
| `extraCost` | object (optional) | Embargo-applied cost increase. |

### 2.4 Save schema (`localStorage` key `magiclike_run_v1`)

**Top-level blob**
```js
{
  "version": 2,                   // bump with schema changes
  "runState": {
    "slots": Slot[],              // see runtime slot fields above
    "colors": string[],           // deck colors
    "gameNum": number,            // 1-indexed
    "wins": number,
    "losses": number,
    "active": boolean,
    "lastResult": "won" | "lost" | null,
    "map": MapState,              // see below
    "pendingReward": RewardOffer | null,
    "pendingNeowModifier": string | null,
    "currentPack": string[],      // current draft pack (tplIds)
    "youPicks": string[],         // picks made this draft
    "oppDecks": string[][],       // per-game opp deck history (tplIds)
    "midGameSlotsSnapshot": Slot[] | null  // restored on crash
  }
}
```

**Map state**
```js
{
  "nodes": [
    {
      "id": number,
      "level": number,            // 0 = root, maxLevel = exit
      "column": number,           // 0..WIDTH-1
      "type": "battle" | "boss" | "root" | "exit",
      "color": "W" | "U" | "B" | "R" | "G" | null,
      "constructedId": string | null,  // boss / archetype deck id
      "links": number[]           // child node ids
    },
    ...
  ],
  "currentNodeId": number,
  "completedNodeIds": number[]
}
```

**Reward offer**
```js
{
  "phase": "mixed" | "transformPick" | "twoStickersReveal",
  "choices": RewardChoice[],
  /* type-specific fields */
}
```

Six reward choice kinds: `sticker` (weight 12), `twoStickers` (3), `transform` (2), `clone` (2), `splice` (2), `ripUp` (1), `threeStickersBlind` (1).

**Migrations.** `MIGRATIONS = {1: blob => ...}` walks `version → version+1` on load (`run.js:16`). Currently only v1→v2 (tplId renames). Each migration is a function that mutates `blob` and bumps `blob.version`.

**Mid-game snapshot.** `midGameSlotsSnapshot` is taken at game start (`startNextGame`). On load, if `active` is true and the snapshot exists, slots are restored from it to prevent reward-farming by mid-game crashes.

### 2.5 Other localStorage keys

| Key | Owner | Purpose |
|---|---|---|
| `magiclike_run_v1` | `RUN` | Current roguelike run (see above). |
| `magiclike_picklog_v1` | `PICKLOG` | Draft pick history for analytics. Console-exposed via `window.PICKLOG`. |
| `magiclike_settings_v1` | `SETTINGS` | Display preferences (fonts, sizes, devtools flag). |

---

## 3. Asset path conventions

| Asset | Location | Used by |
|---|---|---|
| Almendra font (`Regular`, `Bold`, `Italic`, `BoldItalic` TTFs) | `assets/fonts/Almendra/` | Both — html-proto via `@font-face` in `magiclike_engine.html:13–29`; Godot via project import. |
| Mana symbol SVGs (`{W,U,B,R,G}.svg`) | `assets/mana/` | Both. html-proto path varies between `../../assets/mana/` (HTML scope) and `assets/mana/` (JS scope) — flagged in `REFACTOR-NOTES.md`. |
| Mana symbol source (`source/manaiconsv13.jsx`) | `assets/mana/source/` | Design source; not loaded at runtime. |
| Godot card images | `cards/images/` | `TresCardFactory.card_asset_dir`. Placeholder PNGs + 4 wired-in inserts. |
| Godot card templates | `cards/templates/<card_id>.tres` | `CardDatabase.get_card(card_id)`. |
| html-proto card art | `reference/html-proto/cards/<tplId>/art.png` | `effectiveArt(card)` (render.js). |
| html-proto card frames | `reference/html-proto/assets/frames/frame_{w,u,b,r,g,c}.png` + `pt_box_{w,u,b,r,g,c}.png` | `.card-frame.col-X` CSS background. |

When a new outside resource is added, log it in `LICENSES.md` per the rule in the root `CLAUDE.md`. Current attributions (as of v1.0.180): chun92 Godot Card Framework (MIT), Godot Engine 4.6, pixellab AI art, Claude (this assistant), Almendra (SIL OFL 1.1), Claude-authored mana SVGs.
