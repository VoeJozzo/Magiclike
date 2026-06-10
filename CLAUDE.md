# Magiclike — Godot port

Magic: The Gathering-style roguelike. The repo holds two things: the in-progress **Godot 4.6 port** (at the repo root) and the **html-proto** reference implementation it's being ported from (at `reference/html-proto/`). Both branches are under some degree of active development.

The html-proto is a vanilla-JS rules engine — ~20k+ LOC across 13 modules under `js/` plus per-card JSONs under `cards/<tplId>/`. 250+ card templates, full priority/stack model, triggered abilities, draft, roguelike meta. Active on the `dev` branch; see `reference/html-proto/CLAUDE.md` for the current version and module map.

The Godot port reimplements the engine natively. **Structurally similar, not 1:1** — the JS rendering layer doesn't translate, and several JS-specific patterns need rethinking (see "Patterns to NOT replicate" below). Current state: Phases 0–5c shipped (Lightning Bolt through real AI vs AI) — a curated set of card templates in `cards/templates/`, a per-phase smoke-test suite, AI plays complete games. Next: Phase 6+ (card-pool expansion → stickers → draft → roguelike meta) is gated on a coordinated refactor — see [`docs/plans/plan-coordinated-refactor.md`](docs/plans/plan-coordinated-refactor.md) and the forward roadmap in [`docs/plans/godot-port-plan.md`](docs/plans/godot-port-plan.md). Card-pool growth is now a *prioritization* problem, not a transcription one: `json_card_loader.gd` reads the html-proto `card.json` files directly and a boot scan reports which proto cards are fully playable; implementing the next-most-valuable missing effect/event/predicate kinds lights up more cards automatically.

Deferred work lives in `docs/BACKLOG.md` — read it when relevant, but don't open a session by attacking it. The user picks what to work on; if you finish a task and have idle attention, surface 1–2 backlog items as suggestions rather than just starting the next one.

## Finding things in the docs

Start at [`docs/README.md`](docs/README.md) — the **doc router** (which doc owns which question) plus a **Find by topic** map that routes cross-cutting subjects (priority, combat, effects, stickers, mana, card data…) to their facets across the reference docs. The durable *why* (architecture rationale, design discipline, the cross-engine relationship) lives in [`docs/wiki/`](docs/wiki/README.md) (see below).

## Working branches & GitHub Pages

- **`dev`** — primary working branch for Godot-side work and the html-proto. PR to here.
- **`main`** — periodic forward-merge from `dev`.
- **GitHub Pages serves from `dev`**, pointing at `reference/html-proto/magiclike_engine.html`. Pushing to `dev` makes html-proto changes live for play-testing. Godot work doesn't affect Pages but shares the branch.

## File structure

```
/                              repo root, Godot project (VoeJozzo/Magiclike)
├── CLAUDE.md                   this file
├── AGENTS.md                   points non-Claude agents (e.g. Codex) at this file as canonical guidance
├── index.html                  redirect to reference/html-proto/ for GitHub Pages
├── project.godot               autoload: RulesEngine = res://engine/engine.gd
├── .nojekyll                   disables Jekyll on Pages (needed for cards/_manifest.json)
├── addons/card-framework/      vendored — do not modify
├── cards/
│   ├── data/                   empty — JsonCardFactory wiring is vestigial (cards load from templates/*.tres)
│   ├── images/                 card art
│   └── templates/         *.tres CardResources; card_database.gd is a directory-scanning loader over them
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
│                               + cross-cutting suites: test_json_card_loader, test_priority_window
├── docs/                       reference + planning docs (see docs/README.md index)
│   ├── README.md               doc router — which doc owns which question + Find-by-topic map
│   ├── ARCHITECTURE.md         Godot engine reference: modules + runtime data contracts, by subsystem
│   ├── PROTOCOL.md             cross-engine canonical wire format spec (card.json schema + catalogs)
│   ├── DIVERGENCE.md           where the Godot port and html-proto behave differently (rulebook is tie-breaker)
│   ├── BACKLOG.md              deferred feature work, parking lot
│   ├── REFACTOR-NOTES.md       prioritized structural debt (advisory; pairs with ARCHITECTURE.md)
│   ├── IDENTITIES.md           GitHub accounts/credentials map (non-secret — points at, never contains)
│   ├── STANDARDIZATION-PLAN.md html-proto ↔ Godot harmonization history
│   ├── plans/                  forward-looking plan specs (godot-port-plan, plan-coordinated-refactor, plan-*)
│   ├── wiki/                   durable concept pages + canonical rulebook (the "why" layer; Obsidian-style)
│   └── archive/                superseded handoff narratives (history, not active)
└── reference/html-proto/       prototype mirror (its own CLAUDE.md + BACKLOG.md)
```

## Module layout

| File | Role |
|---|---|
| `engine/engine.gd` | Autoload `RulesEngine`. State holder, `execute_action`, settle loop, `_fire_event`, `_drain_pending_triggers`, `_resolve_*_entry`, `_run_sbas`, two-pass combat damage, `get_legal_actions`. |
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
| `engine/json_card_loader.gd` | Loads `reference/html-proto/cards/<folder>/card.json` files into `CardResource` instances. Translation tables map JS-isms (camelCase effect/event kinds, `"any"` target, single-string `sub`) to the snake_case shape Godot uses. Boot supportability scan reports how many html-proto cards are fully playable today. See `docs/PROTOCOL.md` for the canonical wire format. |
| `cards/templates/card_database.gd` | Programmatic `CardResource` definitions. Hand-authored; grow as new cards are added. |
| `scenes/game/game_board.gd` | UI orchestrator. Reads `RulesEngine.state()`, paints zones, manages target-pick / trigger-target / block-decl modes, keybinds. |
| `scenes/game/player_panel.gd` | Life total, mana pips, hand / library / graveyard counts, low-library warning glyph. |
| `scenes/game/combat_lines.gd` | Overlay drawing the attacker → blocker lines during COMBAT_BLOCK / COMBAT_DAMAGE. |
| `scenes/card.gd` | Card visual subclass — oracle text overlay, legality glow, combat highlight states. |
| `scenes/zones/battlefield_zone.gd` | Two-row layout (creatures full-width, lands cascaded). |

## Durable concepts wiki (`docs/wiki/`)

A wiki-style folder of **durable, interlinked concept pages** — the engine's architecture rationale, its design discipline, and the cross-engine relationship: the conceptual *why* layer. Authored in Obsidian-style `[[wikilinks]]`, co-located here so it versions with the code, mounted into a personal Obsidian vault via a junction (it's portable plaintext — Obsidian is just the renderer). Entry point: [`docs/wiki/README.md`](docs/wiki/README.md).

- **It owns the "why."** Architecture-decision rationale and the "patterns to NOT/REPLICATE" reasoning live there; the sections below keep only the terse directives + a pointer.
- **It is not a content home** for the wire format / module map ([`docs/PROTOCOL.md`](docs/PROTOCOL.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)), cross-engine gaps ([`docs/DIVERGENCE.md`](docs/DIVERGENCE.md)), or live status — it links those. (The canonical rulebook is the exception: it now lives here too, decomposed one-page-per-§ in [`docs/wiki/rules/`](docs/wiki/rules/rulebook.md).)
- **Mirror new durable decisions there** when you make them, and keep this file lean. To reconcile the wiki against recent repo activity on request ("sync the wiki"), follow [`docs/wiki/README.md`](docs/wiki/README.md) → *Keeping it current*.

## Architecture decisions

*The "why" for these lives in the durable concepts wiki ([`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md)); the directives to follow while coding stay here.*

- **`engine/engine.gd` is the autoload `RulesEngine`.** State holder + action dispatcher. (Named `RulesEngine`, not `Engine` — Godot reserves that global.)
- **State logic in `RefCounted` classes** — `Player`, `ManaPool`, `Stack`, `PhaseMachine`, `CardInstance`, `EngineState` — instantiable in tests without autoload boilerplate; each has `duplicate_deep()` for AI snapshots.
- **Action-descriptor pattern.** All state mutations go through `RulesEngine.execute_action(action: Dictionary)` (`{kind, source, targets, ...}`); mirrors the JS `executeAction`. → [`docs/wiki/action-descriptor-pattern.md`](docs/wiki/action-descriptor-pattern.md)
- **String-keyed trigger predicates.** Cards reference conditions by `cond_id`; the registry at `engine/predicates/predicates.gd` resolves name → fn. → [`docs/wiki/predicate-registry.md`](docs/wiki/predicate-registry.md)
- **Real stack and priority from day one.** The stack is a LIFO holding spells AND triggers (both resolve through `_resolve_*_entry`); priority follows MTG rules where it matters (canon: [§600 Priority & the Stack](docs/wiki/rules/600-priority-and-the-stack.md)). Pragmatic auto-passes (AI auto-pass, Space/Enter pass-priority keybind, single-sweep SBAs) are agent/UX, not rules cheats.
- **Click-to-cast UI, not drag-to-cast.** Drag conflicts with card-framework's drag-to-move semantics. Click a spell → target-picking mode → click a target → resolve.
- **Data on `EngineState`, behavior on `RulesEngine`.** One-way dependency: `RulesEngine` reads/writes `EngineState`, never the reverse. Don't put helpers needing `get_legal_actions`/`_dispatch_action` on `EngineState` (circular ref) — new behavior goes on the autoload.

## Patterns to NOT replicate from the prototype

Port the **behavior**, not the implementation shape — the prototype's engine has known scars from organic growth. The reasoning and cautionary tales live in the wiki ([`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md) design discipline, [`docs/wiki/cross-engine-port.md`](docs/wiki/cross-engine-port.md)); the directives:

- **Don't reach into autoloads from predicates or effect handlers.** Predicates take `(state, source, event)`; effects take `(ctx, params, target)`. No reading `RulesEngine.state()` from inside. → [`docs/wiki/predicate-registry.md`](docs/wiki/predicate-registry.md)
- **Don't model per-instance state as dynamically-attached dictionary fields.** Use typed properties on `CardInstance` / `Player`; the `duplicate_deep()` overrides exist to prevent that class of bug. → [`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md)
- **Don't let the engine call the text generator.** Keep the engine UI-free — emit a structured "trigger fired" signal; the presentation layer renders the log/text. → [`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md)

## Patterns to REPLICATE from the prototype

- **Trigger chain depth cap.** Mirror the proto's hardcoded cap on nested trigger resolutions in `_drain_pending_triggers` (it bails with a warning past the threshold). Status/gate: [`docs/DIVERGENCE.md`](docs/DIVERGENCE.md) E6; rationale: [`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md).

## Risks and gotchas

- **Predicates need explicit state access.** Pass full state as the first argument to every predicate (`func cond_x(state, source, event) -> bool`). Documented in `predicates.gd`'s header.
- **Stack as `Array[StackEntry]`, not as a `CardContainer`.** Triggered abilities go on the stack but aren't cards. The engine model is `Array[StackEntry]`; the UI is a plain VBoxContainer observing `RulesEngine.stack_changed`.
- **`@tool` annotation gotcha.** Existing `test.gd` is `@tool`-annotated, which triggers `_ready()` in the Godot editor. Game scenes must NOT be `@tool` — the editor will spam errors when the `RulesEngine` autoload isn't initialized.
- **Card-framework drag conflict.** Drag is reserved for "move card between containers." Casting a spell with targets is conceptually different. Stick with click-to-cast.
- **Predicate registry boot validation + supportability scan.** `engine.gd._ready()` validates every card's `cond_id`s against the registry (`push_error` on a miss — catches typos at startup) and runs `JsonCardLoader.supportability_report()` (a one-line summary of how many html-proto cards are fully playable vs awaiting handlers). Registry design: [`docs/wiki/predicate-registry.md`](docs/wiki/predicate-registry.md).

## Testing

Each phase has a runnable scene at `tests/test_phaseN.{gd,tscn}` (e.g., `test_phase4_5a`, `test_phase5c`). Headless invocation:

```
"/c/Program Files (x86)/Steam/steamapps/common/Godot Engine/godot.windows.opt.tools.64.exe" \
  --headless --path "C:/Users/Joe/Documents/magiclike" res://tests/test_phaseN.tscn
```

Each test prints assertion results and exits with code 0 (pass) / 1 (fail). Roughly 30 seconds per phase. A slice is "done" when its new test passes AND all prior phase tests still pass.

Beyond the per-phase smoke tests there are two cross-cutting suites: `tests/test_json_card_loader.{gd,tscn}` (loader translation invariants — asserts type→subclass, snake_case effect kinds, target inference *by card shape*, not by hardcoded id) and `tests/test_priority_window.{gd,tscn}` (priority-window auto-pass / end-turn refactor).

## Licenses & attributions

**Any time a new outside resource is added to the project — code library, asset pack, AI-art batch, font, sound, tool, anything — log it in `LICENSES.md` at the repo root.** That file is the canonical record of what we depend on, what license each dependency is under, and what we owe attribution-wise. Add the entry in the same commit that pulls the resource in.

Current entries: chun92's Godot Card Framework (MIT), Godot Engine 4.6, ESLint + eslint-plugin-sonarjs (dev-only html-proto linting), pixellab AI art, Claude (this assistant), Almendra fantasy serif font (Google Fonts, SIL OFL 1.1), Claude-authored mana symbol SVGs. See `LICENSES.md` for the full list.

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
