# Godot port plan — Magiclike

## Context

The browser prototype at the root of this repo's history (now under [`reference/html-proto/`](../reference/html-proto/)) is ~10,887 lines of vanilla JS in a single HTML file, version 0.99.49, with a real MTG-style rules engine: 217 card templates, triggered abilities, full priority/stack model, combat with first-strike and trample, a heuristic AI, draft mode, and a roguelike meta-layer (sticker-based card modification, weighted reward rolls, versioned saves).

A Godot 4.6 project lives at the root of the repo with the `card-framework` addon vendored at [`addons/card-framework/`](../addons/card-framework/). At the time this plan was written, the Godot project did one thing: built a 10-card pile and drew an opening hand of 7. Everything else from the prototype is ahead.

The goal of this plan is to port the prototype to Godot — not as a faithful 1:1 reproduction (the JS rendering layer doesn't translate, and a few JS-specific patterns need rethinking), but as a structurally-similar engine that runs in Godot and can be extended natively from there.

This is a solo hobby project with no deadlines, exploratory mindset. Plans favor incremental verifiable progress over big-bang ports.

## Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| First slice scope | **A1 — Lightning Bolt only** | Smallest viable port. Validates entire pipeline (card resource → hand → cast → effect → state → repaint) without committing to combat. After it works, adding creatures/combat is filling in handlers, not architectural change. |
| Trigger architecture | **B1 with future-proof seams** | Each card with non-trivial trigger conditions gets a small GDScript with `cond_*` methods. **But** card resources reference conditions by string name (`condition_predicate: "creature_self_damaged_died"`), not direct method binding. Today: string names a method on the card's own script. Later (if procedural triggers happen): a shared predicate library is added without changing the resource shape. |
| Stack/priority fidelity | **C1 — Full from day one** | Port the prototype's stack and priority-passing model from v1. The stack is *the* defining MTG mechanic; ~40% of cards depend on it. Cleaner to bake in than retrofit. The minimum viable priority system is ~30 lines (`priority_player`, `pass_priority`, both-passed → resolve top of stack); it gets implemented for real in Phase 1 even though only auto-passes exercise it. |

## Repo structure

```
/                              (repo root, Godot project, on GitHub as VoeJozzo/Magiclike)
├── index.html                  redirect to reference/html-proto/magiclike_engine.html (keeps GitHub Pages working)
├── project.godot, icon.svg, .gitignore, .gitattributes, .editorconfig
├── addons/
│   └── card-framework/         vendored, do not modify
├── cards/
│   ├── data/                   JSON templates (card-framework's JsonCardFactory reads these)
│   ├── images/                 card art
│   └── templates/              .tres CardResource files (engine identity) — added in Phase 1
├── scenes/
│   ├── card.gd / card.tscn     existing — Card subclass for card-framework
│   ├── json_card_factory.tscn  existing
│   ├── game/                   top-level game scenes — added in Phase 1
│   └── zones/                  CardContainer subclasses — added in Phase 1
├── engine/                     pure-data rules engine, no UI imports — added in Phase 1
│   ├── engine.gd               autoload (registered in project.godot)
│   ├── player.gd, mana_pool.gd, card_instance.gd, stack.gd, phase_machine.gd, action.gd
│   ├── effects/                one handler file per effect kind
│   └── predicates/             B1 string-keyed condition registry
├── data/                       engine-side resource base classes — added in Phase 1
│   ├── card_resource.gd, land_resource.gd, spell_resource.gd, creature_resource.gd
├── ai/                         Phase 5
├── run/                        Phase 6 (roguelike meta)
├── tests/                      smoke-test scenes per phase
├── docs/
│   └── godot-port-plan.md      this file
└── reference/
    └── html-proto/             prototype mirror — preserved git history via git mv
        ├── CLAUDE.md
        └── magiclike_engine.html
```

GitHub Pages stays working at `voejozzo.github.io/Magiclike/` because `index.html` is preserved at root with a redirect target pointing into `reference/html-proto/`.

**Naming note:** `cards/data/` (JSON, visual) and `cards/templates/` (`.tres`, engine) live in the same parent for discoverability, with distinct names to avoid confusion. They're linked by a `card_id` string field — `card.card_info["card_id"] == "lightning_bolt"` looks up `res://cards/templates/lightning_bolt.tres`.

## Findings from exploration

### card-framework addon (vendored at `addons/card-framework/`)

- Good fit, not opinionated about game state. `Card` carries `card_info: Dictionary` for arbitrary data.
- `CardContainer` is extensible — subclass for Battlefield, Stack, Library, Graveyard, Exile.
- `_card_can_be_added(cards) -> bool` is the validation hook; returning false auto-reverts.
- `CardManager` is a `Control` node, not autoload. Holds card_container_dict and history.
- Drag-only UX. Tap, click, right-click need custom `_on_gui_input` overrides on Card subclasses.
- `JsonCardFactory.create_card(card_id, target_container)` instantiates from JSON templates.

### Prototype engine (`reference/html-proto/magiclike_engine.html`)

- `G` state: two-player flat structure, each player has `{life, mana, library, hand, battlefield, graveyard, exile, landPlayedThisTurn, lifeLostThisTurn}`. Top-level: `activePlayer, phase, turn, stack, priority, attackers, blockers, pendingTriggers, log, winner`.
- Phases: UNTAP → UPKEEP → DRAW → MAIN1 → COMBAT_ATTACK → COMBAT_BLOCK → COMBAT_DAMAGE → MAIN2 → END → CLEANUP.
- Real priority/stack model with instant-speed responses.
- ~40 EFFECTS handlers, signature `EFFECTS[kind](ctx, params, target)`. Targets chosen at cast time, validated at resolution (fizzle if gone).
- Triggers stored on cards as `{event, condition, effects}`; condition is a JS closure that may reach into global `G`.
- AI: heuristic, single-entry-point `AI.decide(state, who) → action`. No game-tree search, no state mutation.
- Public API: `ENGINE.{init, state, expectedActor, getLegalActions, executeAction, ...}`, `AI.decide`, `RUN.{start, startNextGame, recordResult, applyStickerToSlot, ...}`, `DRAFT.{startDraft, pickPlayer, getPlayerDeck, ...}`.

## Phase 0 — Repo setup

Take the Godot project and the GitHub `VoeJozzo/Magiclike` repo (which originally held the html prototype at root) and unify them into one repo with the structure above. Preserve git history of the prototype files via `git mv`.

Procedure:

1. Clone the existing GitHub repo to a sibling temp directory (preserves the prototype's commit history).
2. In the cloned repo: `git mv CLAUDE.md magiclike_engine.html reference/html-proto/`. This preserves history of those files even though they moved.
3. Edit `index.html` in place: change the redirect target from `magiclike_engine.html` to `reference/html-proto/magiclike_engine.html`.
4. Copy the Godot project files into the cloned repo.
5. Verify `.gitignore` includes at minimum: `.godot/`, `*.tmp`, `*.import.bak`, `.DS_Store`, `/export/`. The `*.uid` files SHOULD be committed (Godot 4.4+ uses them for stable references).
6. Write this plan into `docs/godot-port-plan.md` (this file).
7. `git add .`, commit, push to `origin main`.
8. Replace the local Godot folder with the merged repo (rename original to backup first; delete after verifying the merged version opens cleanly).
9. Verify GitHub Pages still works at `voejozzo.github.io/Magiclike/` (may take a few minutes to re-deploy).

Verification: `git log --follow reference/html-proto/magiclike_engine.html` shows the original commits; the Godot project opens without errors; the GitHub Pages URL still loads the prototype.

## Phase 1 — Lightning Bolt slice

**Goal:** Player taps Mountain → mana pool gains R → casts Lightning Bolt at opponent → opponent's life drops 20 → 17 → log shows the cast and resolution → Bolt moves to graveyard.

### Engine architecture decisions

- **`engine/engine.gd` as autoload, registered as `RulesEngine`.** Closest to the JS prototype's IIFE singleton. Globally accessible to UI panels via `RulesEngine.state()`. Emits `state_changed` for UI to subscribe. (Autoload identifier is `RulesEngine` rather than `Engine` because Godot already has a built-in global named `Engine` — found this the hard way during smoke-test bring-up.)
- **Logic in `RefCounted` classes**, not in the autoload itself. `Player`, `ManaPool`, `Stack`, `PhaseMachine`, `CardInstance`, `EngineState` are all RefCounted — instantiable in tests without autoload boilerplate.
- **Action descriptor pattern.** All state mutations go through `RulesEngine.execute_action(action: Dictionary)` where action is `{kind: "cast_spell" | "activate_ability" | "play_land" | "pass_priority", source, targets, ...}`. Mirrors the JS prototype's `executeAction`.
- **Stack pathway exercised even with no responses.** Casting Lightning Bolt: pay mana → push StackEntry → grant priority to opponent → opponent passes (auto-stub) → both passed → resolve top → effects run → instance to graveyard. If we short-circuit and run effects directly, decision C1 is broken on day one.
- **Click-to-cast UI**, not drag-to-cast. Drag conflicts with card-framework's drag-to-move semantics. Click Bolt in hand → enter target-picking mode (overlay dims invalid, highlights valid) → click opponent's life total → resolve.

### Files to create

```
engine/
  engine.gd                    autoload, state holder, execute_action, signal emitter
  player.gd                    RefCounted: name, life, mana, hand, library, battlefield, graveyard, exile, land_played_this_turn, life_lost_this_turn
  mana_pool.gd                 RefCounted: {W,U,B,R,G,C} + extra colors
  card_instance.gd             RefCounted: instance_id, template (CardResource), owner, controller, tapped, counters, summoning_sick
  stack.gd                     RefCounted: Array[StackEntry]; push, top, resolve_top
  phase_machine.gd             RefCounted: enum Phase, advance() — full skeleton, only MAIN1 active in Phase 1
  action.gd                    RefCounted: action descriptor helpers
  effects/
    effects.gd                 const HANDLERS = {"damage": ..., "add_mana": ...}; static resolve(effect, ctx)
    damage.gd                  reads amount, target; mutates target.life
    add_mana.gd                reads colors; adds to ctx.controller.mana
  predicates/
    predicates.gd              registry skeleton (no entries Phase 1) + boot-time validation pass
data/
  card_resource.gd             base Resource: card_id, display_name, card_types, subtypes, mana_cost, oracle_text, on_cast_effects, activated_abilities, triggered_abilities
  land_resource.gd             extends + mana_produced
  spell_resource.gd            extends + requires_target, target_filter
cards/templates/
  mountain.tres                LandResource: card_id="mountain", types=["land"], subtypes=["mountain"], mana_produced=["R"]
  lightning_bolt.tres          SpellResource: card_id="lightning_bolt", types=["instant"], cost=["R"], on_cast_effects=[{kind:"damage", amount:3, target:"chosen"}]
cards/data/
  mountain.json                card-framework visual: name, front_image, card_id="mountain"
  lightning_bolt.json          card-framework visual: name, front_image, card_id="lightning_bolt"
cards/images/
  mountain.png, lightning_bolt.png  placeholders
scenes/zones/
  battlefield.gd / .tscn       CardContainer subclass; _card_can_be_added rejects non-lands in Phase 1
  stack.gd / .tscn             NOT a CardContainer — VBoxContainer of StackEntry visuals (triggers later phases will add non-card entries)
  library.gd / .tscn, graveyard.gd / .tscn  CardContainer subclasses, simple piles
scenes/game/
  game_board.gd / .tscn        main scene — CardManager + zones + PlayerPanels, wires RulesEngine signals to UI
  player_panel.gd / .tscn      life total label (clickable for opp), mana pool labels, name
tests/
  test_phase1.gd / .tscn       scripted smoke test
```

Update `project.godot`:
- `[autoload] RulesEngine="*res://engine/engine.gd"` (named `RulesEngine` to avoid clashing with Godot's built-in `Engine` global)
- `run/main_scene` → `res://scenes/game/game_board.tscn`

### Verification

**Scripted smoke test** (`tests/test_phase1.tscn`):
1. Boot engine: you = `{life: 20, hand: [LightningBolt], battlefield: [Mountain, Mountain]}`, opp = `{life: 20, no permanents}`.
2. `RulesEngine.execute_action(activate_mountain_0)` → assert `you.mana.R == 1`.
3. `RulesEngine.execute_action(activate_mountain_1)` → assert `you.mana.R == 2`.
4. `RulesEngine.execute_action(cast_bolt_at_opp)` → assert stack has 1 entry, `you.mana.R == 1`.
5. Both auto-pass priority → assert stack empties, `opp.life == 17`, Bolt is in your graveyard, both Mountains are tapped.

**Manual play-through:** open `game_board.tscn`, see hand with Mountains and a Bolt, tap a Mountain (rotates 90°), see R appear in mana display, click Bolt (target picker overlay), click opponent's life total, see 20 → 17, see Bolt move to graveyard.

## Phases 2 through 6 — outline

**Phase 2 — Creatures and summoning sickness.** Add `creature_resource.gd` (power, toughness, keywords). Battlefield zone accepts creatures. Cards enter tapped/untapped, summoning-sick on entry, cleared at controller's untap. New effects: `pump`, `weaken`, `add_counter`, `remove_creature`. State-based actions (creatures with toughness ≤ 0 die) run after every effect resolution. Verification: cast a 1/1, attack next turn (opponent takes it — no blockers yet).

**Phase 3 — Combat and the stack actually doing work.** Implement `COMBAT_ATTACK`, `COMBAT_BLOCK`, `COMBAT_DAMAGE` phases. Declare-attackers UI (click your untapped creatures), declare-blockers UI. Damage assignment with first-strike step. **Now C1 pays off:** add the first instant — Giant Growth. Cast it during combat in response to a damage step, see the stack hold while priority passes, see resolution unwind LIFO. New effects: `pump_until_eot`, EOT cleanup. Verification: a creature dies in combat; a creature survives because Giant Growth resolved on the stack.

**Phase 4 — Triggered abilities.** ✓ DONE.
- `pending_triggers` queue on `EngineState`; events fire via `RulesEngine._fire_event`; queue drains via `_drain_pending_triggers` in APNAP order onto the stack. Triggers resolve through `_resolve_trigger_entry` alongside spell entries — the C1 stack pathway covers both.
- Predicate registry at `engine/predicates/predicates.gd` with `evaluate(name, state, source, event)`. Boot-time `validate_all_card_predicates()` walks all `CardResource.triggered_abilities[].condition_predicate` strings and `push_error`s on any missing entry.
- Event firing points (Phase 4): `card_etb` (lands via `_do_play_land`, permanents via `_resolve_spell_entry`), `card_dies` (deaths inside `_run_sbas`).
- Cards added: **Pyromaniac** (1R 1/1) with `{event: card_etb, self_only: true}` → deals 1 to opp; **Bloodlust Berserker** (1RR 3/2) with `{event: card_dies, self_only: true, condition_predicate: "opp_lost_life_this_turn"}` → deals 2 to opp if predicate true.
- UI: stack panel renders triggers as `⚡ <source>'s ability` to distinguish them from cast spells.
- `tests/test_phase4.gd` covers ETB fire+resolve, death-trigger-with-predicate-true, and the negative case (predicate-false → trigger suppressed).

**Phase 4 deferred to Phase 4.5 (or whenever it becomes blocking):**
- **Interactive trigger target picking.** ✓ DONE in 4.5b.
- **Non-self triggers in tests.** Still deferred. The `self_only=false` listener path is implemented but not exercised. Add when a card legitimately needs it.
- **"Intervening if" predicate re-check at resolve time.** Still deferred. Currently the predicate is checked only at queue time; MTG rules check again on resolution. Will matter when a between-events action invalidates the condition (e.g., a creature with a "while you control X" condition where X leaves play between trigger queueing and resolution).

**Phase 4.5 — Real-game interlude.** ✓ DONE.
- **Slice 4.5a (library + draw + decking).** `RulesEngine.init_game(you_decklist, opp_decklist)` builds libraries from `card_id:count` dicts, shuffles, draws opening hand. DRAW phase entry fires `_do_draw_card`; empty-library draw ends the game with the opponent winning (MTG 704.5b). Legacy `init_phase*` demo helpers seed each player's library with 20 buffer Mountains so existing tests don't deck out. UI: `PlayerPanel` shows hand/library/graveyard counts with a low-library warning glyph.
- **Slice 4.5b (interactive trigger target picker).** Triggers can specify `target_filter` on the ability dict. `_drain_pending_triggers` pauses for you-controlled triggers (surfacing `state.awaiting_target_for_trigger`) and auto-picks for opp-controlled triggers. New action `KIND_PICK_TRIGGER_TARGET` completes the pick. UI mirrors the spell-target flow.
- **Slice 4.5c (card pool + new effects).** Card pool grew 8 → 16: Plains/Island/Swamp basic lands, Bear Cub / Gray Ogre / Hill Giant vanilla curve, Healing Salve (exercises new `gain_life` effect), Counterspell (exercises new `counter_spell` effect — first card whose target is a stack entry, with new `RulesEngine.counter_stack_entry` engine helper).

**Phase 5a — Combat keywords.** ✓ DONE.
- `CardInstance.effective_keywords()` / `has_keyword(name)` — single seam unioning template baseline + runtime grants (sticker hook).
- All eleven evergreens wired: defender / haste / vigilance / flying / reach / unblockable / first_strike / lifelink / deathtouch / trample / indestructible / menace / hexproof. Block legality, attack legality, and combat damage all consult `has_keyword`.
- Combat damage rewritten as a two-pass system (`_combat_damage_pass(first_strike_only)`); `_deal_combat_damage` centralises target dispatch and handles lifelink + deathtouch (sets `lethal_marked` on creature target).
- SBA in `_run_sbas` checks indestructible before lethal-damage death.
- Hexproof in `_legal_cast_spell` blocks cross-controller targeting.
- New cards: Wind Drake, Giant Spider, Serra Angel, Trained Armodon, Vampire Nighthawk, Raging Goblin, Walking Wall (one per keyword profile).
- `tests/test_phase5a` covers one scenario per keyword.

**Phase 5b — Engine introspection API for AI.** ✓ DONE (except `simulate_combat`).
- `RulesEngine.get_legal_actions(player_key) → Array[Dictionary]` enumerates every legal action descriptor (pass/play_land/activate_ability/cast×targets/declare_attacker/declare_blocker/pick_trigger_target). Casts fan out one entry per legal target. Helper `_enumerate_filter_targets` supports `any`/`creature_or_player`/`creature`/`player`/`spell` filters and respects hexproof.
- `EngineState.duplicate_deep()` + `duplicate_deep()` on Player / ManaPool / Stack / CardInstance. Mutations on a copy don't leak. CardResource templates are shared by reference.
- `engine/ai/scoring.gd` — `AIScoring.card_value(template, purpose)` heuristic scoring (stats minus cost + keyword bonuses + triggered-ability bump). Exposed via `RulesEngine.card_value`. Per-effect triggered-ability scoring deferred to 5c.
- **Deferred to 5c**: `simulate_combat(state, attacker_key, attackers, blockers) → outcome`. The deep-copy plumbing is in place — the simulator itself is the largest single piece in the AI port (~200 lines) and is best done alongside the rest of the AI.

**Phase 5c — AI.decide port.** ✓ DONE.
- `engine/ai/ai.gd::AI.decide(state, player_key) -> Dictionary` — top-level dispatcher matching JS prototype's `AI.decide(state, who)` shape. Decision order: trigger target pick → block declaration (if defender) → attack declaration (if active) → instant-speed response → main phase actions → pass.
- `engine/ai/combat.gd` — `simulate_combat` (uses `EngineState.duplicate_deep` from 5b), `decide_attackers` (lethal check + per-attacker positive-trade heuristic), `decide_blockers` (greedy "minimise damage" with flying/menace/deathtouch awareness via `_score_block_pair`).
- `engine/ai/burn.gd` — `face_damage_in_hand` and `has_lethal` for direct-damage lethal recognition.
- `engine/ai/scoring.gd` (extends 5b) — used by AI for spell-target scoring and trigger-target priority.
- `_settle_state` in `engine.gd` rewritten: drives opp via `AI.decide` instead of the Phase-3 hardcoded stubs. Breaks when `_current_actor()` returns "you" — i.e., hands control to the UI when the human needs to decide. Phase-3 `_opp_*` helpers deleted (112 lines).
- Caster-priority bug fix: `_do_cast_spell` now sets `priority_player_key = controller.key` (caster retains, per MTG 117.1c) instead of always-active-player. Previously broke opp's instant-speed responses.
- New showcase deck `_PHASE5_SHOWCASE_DECK` + `init_phase5_demo()` — multi-color 40-card list with one of each Phase 4.5c/5a card so manual playtest sees everything. `game_board` boots into this by default.
- Tests pass post-rewire: Phase 2/3 tests updated to expect the new AI-driven flow (Phase 2's turn-cycle now needs more priority passes; Phase 3's opp no longer "holds" priority after casting in response).
- `tests/test_phase5c` covers: AI passes when idle; AI picks trigger target; `simulate_combat` reports correct 2/2-vs-2/2 mutual death; **AI vs AI plays a complete game** (recent runs hit a winner in ~400 actions).

**Phase 6 — Card pool expansion.** Port `AI.decide(state, who) → action`. Single entry point, reads engine state, returns one action descriptor. Combat-sim subroutine for declaring attackers/blockers. Lethal detection. Snapshots state via `Resource.duplicate(true)` and explicit `duplicate()` overrides on `Player` / `CardInstance`. Threading deferred until profiling shows it's needed. Verification: AI plays a complete game against itself without crashing; spot-check decision quality via log lines.

**Phase 6 — Draft and roguelike meta.** Port `DRAFT` (23-pick draft, opponent deck simulation) and `RUN` (sticker system, weighted reward rolls, save/load). Use Godot's `FileAccess` + JSON in lieu of localStorage. Schema migrations from JS port directly. New scenes: `draft_screen.tscn`, `run_map.tscn`. Verification: draft a deck, complete a 3-game run, save mid-run and reload.

## Risks and discipline notes

- **Predicates need explicit state access.** JS prototype's Bloodlust trigger reads `G[them].lifeLostThisTurn`. In GDScript: pass full state as the first argument to every predicate (`func creature_self_damaged_died(state, source, event) -> bool`). Documented as the calling convention in `predicates.gd` header. **Don't** reach into the `RulesEngine` autoload from inside predicates — keeps them testable and matches JS prototype's pure-function style.

- **Stack as VBoxContainer, not CardContainer.** Triggered abilities go on the stack but aren't cards. Forcing them through `Card` introduces type-checks everywhere. The `Stack` engine model is `Array[StackEntry]`; the UI is a plain `VBoxContainer` observing `RulesEngine.stack_changed`.

- **Deep-copy bugs.** The JS prototype has known scars (e.g., City of Brass `extraManaColors` lost on instantiation, comment at engine line ~2107). Mitigation: model all per-turn mutable state on `Player` and `CardInstance` as plain typed fields, not dynamically-attached dictionaries. Write `duplicate()` overrides on `CardInstance` and `Player` once and use them everywhere. Don't reinvent deep-copy logic per use site.

- **`@tool` annotation gotcha.** Existing `test.gd` is `@tool`-annotated, which triggers `_ready()` in the Godot editor. New game scenes must NOT be `@tool` — the editor will spam errors when the RulesEngine autoload isn't initialized. Drop `@tool` on `game_board.gd` and any new gameplay scripts.

- **Card-framework drag conflict.** Drag is reserved for "move card between containers." Casting a spell with targets is conceptually different. Phase 1: click-to-cast with overlay target picker. If drag-to-cast is desired later, override `Card._on_gui_input` to disambiguate intent — but this is fragile, likely not worth it.

- **Predicate registry validation at boot.** ~10 lines in `engine.gd._ready()` that walks all loaded `CardResource` instances, collects every `condition_predicate` string, and asserts each is a key in `predicates.gd`'s registry. Catches typos at startup instead of at runtime.

- **Don't half-implement priority.** Tempting to "stack exists but priority always belongs to active player" in Phase 1. Resist. The minimum viable system is `RulesEngine.state().priority_player_key`, `RulesEngine.execute_action(Action.make_pass_priority())`, both-passed → resolve top. ~30 lines, baked in correctly day one.

## Verification per phase

| Phase | Smoke test | Playable demo |
|---|---|---|
| 0 | `git status` clean; project opens in Godot 4.6 without errors; GitHub Pages still serves prototype | n/a |
| 1 | Scripted: 2 Mountains + 1 Bolt → opp at 17 | Click Mountain, click Bolt, click opp life → 20 drops to 17 |
| 2 | Cast 1/1, end turn, untap, attack → opp at 19 | Goblin enters tapped (sick), next turn taps to attack |
| 3 | Combat with Giant Growth on stack saves a 1/1 from a 2-power attacker | Full combat phase + instant cast in response |
| 4 | Pyromaniac ETB fires + resolves; Bloodlust death trigger fires with predicate-true; trigger suppressed on predicate-false | Cast Pyromaniac → opp takes 1; cast Berserker + bolt your own → opp takes +2 |
| 4.5a | init_game builds libraries from decklists; DRAW fires; empty-library → opp wins | Open the game_board, see hand+library+gy counts on each panel |
| 4.5b | Trigger needing target pauses drain; KIND_PICK_TRIGGER_TARGET completes the cast; opp-controlled triggers auto-pick | Cast Pyromaniac → "Pick a target…" prompt → click opp or click any creature |
| 4.5c | Healing Salve gains 3 life; Counterspell removes target Bolt from stack into opp's graveyard | Cast Counterspell on opp's Lightning Bolt during their cast |
| 5a | One assertion per keyword: defender, haste, vigilance, flying/reach, unblockable, first_strike, lifelink, deathtouch, trample, indestructible, hexproof | Attack with Serra Angel (flying + vigilance, doesn't tap); Bolt opponent's hexproof creature fails |
| 5b | get_legal_actions enumerates the right action set; card_value orders Serra > Bears > Walking Wall; duplicate_deep separates copy from original | Engine-only — no manual demo |
| 5c | AI passes when idle; picks trigger target; simulate_combat reports correct trade; AI vs AI plays a full game to a winner | Boot `init_phase5_demo` and watch opp play itself — taps lands, casts creatures, attacks, counters your spells |
| 5 | AI plays itself a full game without crash | Sit and watch AI vs AI; spot-check no obviously bad attacks |
| 6 | Draft 23 picks, complete 3-game run, save/load mid-run | Full roguelike loop end-to-end |

Each phase's smoke test lives in `tests/` as a runnable scene (`test_phase1.tscn` etc.) so regressions are catchable in <30s.

## What this plan deliberately doesn't decide

- **UI polish.** Card art is placeholders, animations are card-framework defaults. Iterate on look-and-feel in a later pass.
- **Save format details for Phase 6.** Will be designed when we get there; the JS prototype's schema migrations port directly.
- **Multiplayer.** Out of scope. Engine is single-machine, two-player (you vs AI).
- **Mobile / touch input.** Card-framework supports drag on mobile; click-to-cast generalizes. Not a focus of this plan.
- **Localization.** All strings hardcoded English for now.

These are intentionally deferred — surfaced here so they don't get rediscovered as "blockers" mid-implementation.
