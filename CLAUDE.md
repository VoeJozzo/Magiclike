# Magiclike — Godot port

Magic: The Gathering-style roguelike. The repo holds two things: the in-progress **Godot 4.6 port** (at the repo root) and the **html-proto** reference implementation it's being ported from (at `reference/html-proto/`). Both branches are under some degree of active development.

The html-proto is a vanilla-JS rules engine — ~20k+ LOC across 13 modules under `js/` plus per-card JSONs under `cards/<tplId>/`. 250+ card templates, full priority/stack model, triggered abilities, draft, roguelike meta. Active on the `dev` branch; see `reference/html-proto/CLAUDE.md` for the current version and module map.

The Godot port reimplements the engine natively. **Structurally similar, not 1:1** — the JS rendering layer doesn't translate, and several JS-specific patterns need rethinking (see "Patterns to NOT replicate" below). Current state: Phases 0–5c shipped (Lightning Bolt through real AI vs AI). 31 card templates in `cards/templates/` (26 cards + 5 basic lands), 10 phase smoke tests, AI plays complete games. Next: card pool expansion → stickers → draft → roguelike meta (see `docs/godot-port-plan.md` for the forward roadmap).

Deferred work lives in `docs/BACKLOG.md` — read it when relevant, but don't open a session by attacking it. The user picks what to work on; if you finish a task and have idle attention, surface 1–2 backlog items as suggestions rather than just starting the next one.

## Working branches & GitHub Pages

- **`dev`** — primary working branch for Godot-side work and the html-proto. PR to here.
- **`main`** — periodic forward-merge from `dev`.
- **GitHub Pages serves from `dev`**, pointing at `reference/html-proto/magiclike_engine.html`. Pushing to `dev` makes html-proto changes live for play-testing. Godot work doesn't affect Pages but shares the branch.

## File structure

```
/                              repo root, Godot project (VoeJozzo/Magiclike)
├── CLAUDE.md                   this file
├── index.html                  redirect to reference/html-proto/ for GitHub Pages
├── project.godot               autoload: RulesEngine = res://engine/engine.gd
├── .nojekyll                   disables Jekyll on Pages (needed for cards/_manifest.json)
├── addons/card-framework/      vendored — do not modify
├── cards/
│   ├── data/                   empty — JsonCardFactory wiring is vestigial (cards load from templates/*.tres)
│   ├── images/                 card art
│   └── templates/         31 *.tres CardResources (26 cards + 5 lands); card_database.gd is a directory-scanning loader over them
├── data/                       engine-side resource base classes
│   ├── card_resource.gd, creature_resource.gd, land_resource.gd, spell_resource.gd
├── engine/                     pure-data rules engine (no UI imports)
│   ├── engine.gd               autoload — state holder, execute_action, signal emitter
│   ├── engine_state.gd, player.gd, mana_pool.gd, stack.gd, phase_machine.gd
│   ├── card_instance.gd, action.gd
│   ├── ai/                     ai.gd, combat.gd, burn.gd, scoring.gd
│   ├── effects/                effects.gd + per-kind handlers (damage, add_mana, pump, gain_life, counter)
│   ├── predicates/predicates.gd  string-keyed condition registry + boot validation
│   └── json_card_loader.gd     reads html-proto card.json files into CardResource instances
├── scenes/
│   ├── card.gd / card.tscn     Card subclass (oracle text, legality glow, combat highlights)
│   ├── json_card_factory.tscn
│   ├── game/                   game_board.gd/.tscn, player_panel.gd, combat_lines.gd
│   └── zones/battlefield_zone.gd  two-row creature/land layout
├── tests/                      one runnable .gd + .tscn per phase: 1, 2, 3, 4, 4.5a/b/c, 5a/b/c
├── docs/
│   ├── godot-port-plan.md      forward-looking phase roadmap
│   ├── BACKLOG.md              deferred work, parking lot
│   ├── PROTOCOL.md             cross-engine canonical wire format spec
│   └── STANDARDIZATION-PLAN.md html-proto ↔ Godot harmonization history
└── reference/html-proto/       prototype mirror (its own CLAUDE.md + BACKLOG.md)
```

## Module layout

| File | Role |
|---|---|
| `engine/engine.gd` | Autoload `RulesEngine`. State holder, `execute_action`, settle loop, `_fire_event`, `_drain_pending_triggers`, `_resolve_*_entry`, `_run_sbas`, two-pass combat damage, `get_legal_actions`. ~1551 lines. |
| `engine/engine_state.gd` | RefCounted state container: players, stack, attackers, blockers, `pending_triggers`, `awaiting_target_for_trigger`, `awaiting_block_declaration`, `duplicate_deep()`. |
| `engine/player.gd`, `mana_pool.gd`, `stack.gd`, `phase_machine.gd` | RefCounted state subclasses. Each has a `duplicate_deep()` for AI snapshots. |
| `engine/card_instance.gd` | Per-card runtime state — tapped, damage, summoning_sick, granted_keywords, lethal_marked. `effective_keywords()` unions template + grants + (future) stickers. |
| `engine/action.gd` | Action-descriptor factories: `make_cast_spell`, `make_play_land`, `make_pass_priority`, `make_pick_trigger_target`, `make_confirm_blocks`, etc. |
| `engine/ai/ai.gd` | `AI.decide(state, player_key) -> Dictionary`. Decision order: trigger target → block → attack → instant response → main → pass. |
| `engine/ai/combat.gd` | `decide_attackers`, `decide_blockers`, `simulate_combat` (uses `duplicate_deep`). |
| `engine/ai/burn.gd` | `face_damage_in_hand`, `has_lethal` — direct-damage lethal recognition. |
| `engine/ai/scoring.gd` | `AIScoring.card_value(template, purpose)` — heuristic card scoring (stats minus cost + keyword bonuses). |
| `engine/effects/effects.gd` | `HANDLERS` dispatch table. Per-kind handlers in sibling files. |
| `engine/predicates/predicates.gd` | String-keyed `cond_*` predicates with `evaluate(name, state, source, event)`. Boot-time `validate_all_card_predicates()` checks all `cond_id` strings against the registry. |
| `engine/json_card_loader.gd` | Loads `reference/html-proto/cards/<folder>/card.json` files into `CardResource` instances. Translation tables map JS-isms (camelCase effect/event kinds, `"any"` target, single-string `sub`) to the snake_case shape Godot uses. Boot supportability scan reports how many of the 258 html-proto cards are fully playable today. See `docs/PROTOCOL.md` for the canonical wire format. |
| `cards/templates/card_database.gd` | Programmatic `CardResource` definitions. Hand-authored; grow as new cards are added. |
| `scenes/game/game_board.gd` | UI orchestrator. Reads `RulesEngine.state()`, paints zones, manages target-pick / trigger-target / block-decl modes, keybinds. ~1295 lines. |
| `scenes/game/player_panel.gd` | Life total, mana pips, hand / library / graveyard counts, low-library warning glyph. |
| `scenes/game/combat_lines.gd` | Overlay drawing the attacker → blocker lines during COMBAT_BLOCK / COMBAT_DAMAGE. |
| `scenes/card.gd` | Card visual subclass — oracle text overlay, legality glow, combat highlight states. |
| `scenes/zones/battlefield_zone.gd` | Two-row layout (creatures full-width, lands cascaded). |

## Architecture decisions

- **`engine/engine.gd` as autoload `RulesEngine`.** Closest fit to the JS prototype's IIFE singleton. Globally accessible via `RulesEngine.state()`. Named `RulesEngine` and not `Engine` because Godot already has a built-in `Engine` global.
- **Logic in `RefCounted` classes**, not in the autoload itself. `Player`, `ManaPool`, `Stack`, `PhaseMachine`, `CardInstance`, `EngineState` are all RefCounted — instantiable in tests without autoload boilerplate.
- **Action descriptor pattern.** All state mutations go through `RulesEngine.execute_action(action: Dictionary)` where action is `{kind: "cast_spell" | "activate_ability" | "play_land" | "pass_priority" | ..., source, targets, ...}`. Mirrors the JS `executeAction`.
- **String-keyed trigger predicates with future-proof seams.** Card resources reference conditions by string name (`cond_id: "opp_lost_life_this_turn"`); the registry at `engine/predicates/predicates.gd` resolves the name to a function. Lets us swap predicate implementations or share them across cards without touching resource files.
- **Real stack and priority from day one.** The stack is a real LIFO that holds spells AND triggers. Both resolve through `_resolve_*_entry`. Priority follows MTG rules where it matters: caster retains priority after casting (117.1c), mana pools empty at phase boundaries (106.4), defender declares blocks before priority opens at COMBAT_BLOCK (509.1a), triggers drain in APNAP order (603.3b). Pragmatic shortcuts exist (AI auto-passes opp's priority; player has Space/Enter pass-priority keybind; SBAs are checked in a single sweep, not strict 704.5 order) — these are agent/UX concerns, not rules cheats. Config for explicit stop-on-X priority holds is parked in `docs/BACKLOG.md`.
- **Click-to-cast UI, not drag-to-cast.** Drag conflicts with card-framework's drag-to-move semantics. Click a spell in hand → enter target-picking mode → click a target → resolve.
- **Data on `EngineState`, behavior on `RulesEngine`.** `EngineState` is a passive container (fields plus a few accessors like `player_by_key`, `find_instance`, `duplicate_deep`). All game-logic behavior — settling, action dispatch, priority opening, trigger drain, combat resolution — lives on `RulesEngine`. The dependency direction is one-way: `RulesEngine` reads/writes `EngineState`, never the reverse. Don't put helper functions that need `get_legal_actions` or `_dispatch_action` on `EngineState`; that would force a circular reference. New behavior goes on the autoload.

## Patterns to NOT replicate from the prototype

The html-proto is the reference, but its rules engine has known scars from organic growth. When porting a feature, port the **behavior**, not the implementation shape. Specifically:

- **Don't reach into autoloads from inside predicates or effect handlers.** Predicates take `(state, source, event)` and return bool. Effects take `(ctx, params, target)` and resolve. No reading `RulesEngine.state()` from inside these — it breaks testability and matches the JS prototype's worst pattern (`G[them].lifeLostThisTurn` closures into global state).
- **Don't model per-instance mutable state as dynamically-attached dictionary fields.** Use typed properties on `CardInstance` / `Player`. The prototype's City of Brass `extraManaColors` lost on instantiation (see engine.js ~L2107 comment) is the cautionary tale; our `duplicate_deep()` overrides prevent that class of bug.
- **Auto-passes are agent UX, not rules.** The `_settle_state` loop auto-passes for the AI driver and for unattended priority windows. Don't conflate this with "priority is skipped" — the priority pass IS happening, the AI driver is just calling `execute_action(pass_priority)` automatically.
- **Don't let the engine call the text generator.** In the proto, `engine.js` writes its game log by calling `triggerLogText()` (a `card-text.js` function that generates a trigger's English from its effects) — a deliberate shortcut for the loose single-bundle prototype. Keep the Godot engine UI-free: the engine should emit a **structured "trigger fired" signal/event** and let the presentation layer render the log label (calling the Godot equivalent of `describeTrigger`). The text-generation logic itself ports normally (Godot needs it for card text + log regardless); only the *call site* differs — engine-side in the proto, presentation-side in Godot. The proto isolates this behind the one named `triggerLogText` call precisely so the migration is "swap the call for a signal emit." (Background: the proto removed all hand-authored trigger `text` labels in favor of generation, so the log/pill now generate; only `custom_text` cards keep authored labels.)

## Patterns to REPLICATE from the prototype

- **Trigger chain depth cap.** Proto has a hardcoded cap of 100 nested trigger resolutions; if a chain exceeds it, the engine bails with a warning. Initially excluded from Godot ("if our drain code is correct, no cap needed"), but real card design produces accidental infinite-loop combinations (proto has hit this), and the cap costs essentially nothing. Mirror proto's threshold in `_drain_pending_triggers`. See `docs/DIVERGENCE.md` E6.

## Risks and gotchas

- **Predicates need explicit state access.** Pass full state as the first argument to every predicate (`func cond_x(state, source, event) -> bool`). Documented in `predicates.gd`'s header.
- **Stack as `Array[StackEntry]`, not as a `CardContainer`.** Triggered abilities go on the stack but aren't cards. The engine model is `Array[StackEntry]`; the UI is a plain VBoxContainer observing `RulesEngine.stack_changed`.
- **`@tool` annotation gotcha.** Existing `test.gd` is `@tool`-annotated, which triggers `_ready()` in the Godot editor. Game scenes must NOT be `@tool` — the editor will spam errors when the `RulesEngine` autoload isn't initialized.
- **Card-framework drag conflict.** Drag is reserved for "move card between containers." Casting a spell with targets is conceptually different. Stick with click-to-cast.
- **Predicate registry boot validation.** `engine.gd._ready()` walks all loaded `CardResource` instances, collects every `cond_id` string, and `push_error`s on any missing entry. Catches typos at startup, not at runtime. The same `_ready()` also calls `JsonCardLoader.supportability_report()` which scans the full 258-card html-proto pool and prints a one-line summary of how many cards are fully playable on the Godot side vs awaiting handlers.

## Testing

Each phase has a runnable scene at `tests/test_phaseN.{gd,tscn}` (e.g., `test_phase4_5a`, `test_phase5c`). Headless invocation:

```
"/c/Program Files (x86)/Steam/steamapps/common/Godot Engine/godot.windows.opt.tools.64.exe" \
  --headless --path "C:/Users/Joe/Documents/magiclike" res://tests/test_phaseN.tscn
```

Each test prints assertion results and exits with code 0 (pass) / 1 (fail). Roughly 30 seconds per phase. A slice is "done" when its new test passes AND all prior phase tests still pass.

## Licenses & attributions

**Any time a new outside resource is added to the project — code library, asset pack, AI-art batch, font, sound, tool, anything — log it in `LICENSES.md` at the repo root.** That file is the canonical record of what we depend on, what license each dependency is under, and what we owe attribution-wise. Add the entry in the same commit that pulls the resource in.

Current entries (as of v1.0.180): chun92's Godot Card Framework (MIT), Godot Engine 4.6, pixellab AI art, Claude (this assistant), Almendra fantasy serif font (Google Fonts, SIL OFL 1.1), Claude-authored mana symbol SVGs. See `LICENSES.md` for the full list.

Shared assets (used by both the Godot port and the html-proto) live at `assets/` at repo root. Currently: `assets/fonts/Almendra/` and `assets/mana/` (WUBRG SVGs + design source). Html-proto-specific assets live at `reference/html-proto/assets/`.

## Git workflow

- Commit changes, but only push when explicitly asked.
- Don't open PRs unless asked.
- New work happens in a git worktree (see `~/.claude/worktrees/`). Parallel Claude sessions each need their own worktree — sharing one causes branch-switch clobbering.
- No version-bump rule for the Godot side (the binary isn't browser-served; Pages serves html-proto only).

## Verification discipline

Two checkable rules. They exist because they are a recurring, costly failure mode (false-green commits; fabricated counts re-fixed two and three times) — not abstract caution.

- **Confirm green before committing or claiming a pass.** Read the test runner's actual summary/total line — never a truncated `tail` that can hide the count. A commit that says "N green" must cite a number you saw this session, not an assumption.
- **Copy facts; don't recall them.** Any number or identifier written into a commit message, PR body, or doc (diff counts, commit totals, SHAs, file paths) must be copied from verified tool output in this session, not typed from memory. When in doubt, re-query (`gh pr view`, `git rev-list --count`) and paste.
