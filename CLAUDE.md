# Magiclike — Godot port

Magic: The Gathering-style roguelike. The repo holds two things: the in-progress **Godot 4.6 port** (at the repo root) and the **html-proto** reference implementation it's being ported from (at `reference/html-proto/` — it has its own CLAUDE.md; read that before working on the proto side). Both are under active development.

The Godot port reimplements the engine natively. **Structurally similar, not 1:1** — the JS rendering layer doesn't translate, and several JS-specific patterns need rethinking (see "Patterns to NOT replicate" below). For current status and roadmap: `docs/plans/godot-port-plan.md`. For everything else, start at [`docs/README.md`](docs/README.md) — the **doc router** (which doc owns which question).

Deferred work lives in `docs/BACKLOG.md` — read it when relevant, but don't open a session by attacking it. The user picks what to work on; if you finish a task and have idle attention, surface 1–2 backlog items as suggestions rather than just starting the next one.

## Testing

Tests are runnable scenes in `tests/` — one per port phase (e.g., `test_phase4_5a`) plus a few standalone. Headless invocation:

```
"/c/Program Files (x86)/Steam/steamapps/common/Godot Engine/godot.windows.opt.tools.64.exe" \
  --headless --path . res://tests/test_phaseN.tscn
```

Run it from the root of the checkout you are working in — **your worktree, not the main checkout** — or `--path` will test someone else's code.

**Fresh worktree: run `--import -v` first** (same binary, `--headless --path . --import -v`). Otherwise the first test scene triggers the full asset import silently — minutes of zero output, indistinguishable from a hang.

Each test prints assertion results and exits with code 0 (pass) / 1 (fail). Roughly 30 seconds per scene. A change is "done" when the whole `tests/` suite passes and the change itself is exercised by a test — extending an existing scene beats adding a new one.

## Durable concepts wiki (`docs/wiki/`)

Interlinked concept pages owning the **"why"** — architecture rationale, design discipline, the cross-engine relationship. Entry point: [`docs/wiki/README.md`](docs/wiki/README.md). Rules:

- **When you make a new durable design decision, mirror it into the wiki** — this file stays terse directives only.
- Don't move reference content there (wire format, module map, cross-engine gaps, live status) — the wiki links `docs/` proper. One exception: the canonical rulebook lives at `docs/wiki/rules/`.
- "Sync the wiki" = follow `docs/wiki/README.md` → *Keeping it current*.

## Engine rules — follow these when writing code

*The "why" for these lives in the durable concepts wiki ([`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md)); the directives to follow while coding stay here.*

- **`engine/engine.gd` is the autoload `RulesEngine`.** State holder + action dispatcher. (Named `RulesEngine`, not `Engine` — Godot reserves that global.)
- **State logic in `RefCounted` classes** — `Player`, `ManaPool`, `Stack`, `PhaseMachine`, `CardInstance`, `EngineState` — instantiable in tests without autoload boilerplate; each has `duplicate_deep()` for AI snapshots.
- **Action-descriptor pattern.** All state mutations go through `RulesEngine.execute_action(action: Dictionary)` (`{kind, source, targets, ...}`); mirrors the JS `executeAction`. → [`docs/wiki/action-descriptor-pattern.md`](docs/wiki/action-descriptor-pattern.md)
- **String-keyed trigger predicates.** Cards reference conditions by `cond_id`; the registry at `engine/predicates/predicates.gd` resolves name → fn. → [`docs/wiki/predicate-registry.md`](docs/wiki/predicate-registry.md)
- **Click-to-cast UI, not drag-to-cast.** Drag conflicts with card-framework's drag-to-move semantics. Click a spell → target-picking mode → click a target → resolve.
- **Data on `EngineState`, behavior on `RulesEngine`.** One-way dependency: `RulesEngine` reads/writes `EngineState`, never the reverse. Don't put helpers needing `get_legal_actions`/`_dispatch_action` on `EngineState` (circular ref) — new behavior goes on the autoload.

## Patterns to NOT replicate from the prototype

Port the **behavior**, not the implementation shape — the prototype's engine has known scars from organic growth. The reasoning and cautionary tales live in the wiki ([`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md) design discipline, [`docs/wiki/cross-engine-port.md`](docs/wiki/cross-engine-port.md)); the directives:

- **Don't reach into autoloads from predicates or effect handlers.** Predicates take `(state, source, event)`; effect handlers take `(effect, ctx)` and read `ctx.state`. No reading `RulesEngine.state()` from inside. (One documented exception: `counter.gd` — see `docs/ARCHITECTURE.md` §2.5.) → [`docs/wiki/predicate-registry.md`](docs/wiki/predicate-registry.md)
- **Don't model per-instance state as dynamically-attached dictionary fields.** Use typed properties on `CardInstance` / `Player`; the `duplicate_deep()` overrides exist to prevent that class of bug. → [`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md)
- **Don't let the engine call the text generator.** Keep the engine UI-free — emit a structured "trigger fired" signal; the presentation layer renders the log/text. → [`docs/wiki/magiclike-architecture.md`](docs/wiki/magiclike-architecture.md)

## Comments

A comment must state something the code cannot: a constraint, invariant, rule citation, caller contract, or external data shape. Write in the eternal present — no diff narration ("removed", "the old X", version stamps), no port-phase labels, no "verified"-style claims (pin those with a test), no features that don't exist. In test files, assertion labels are the spec: a comment dominated by an adjacent check/assert label is noise. Shortest true form; when editing code, update or delete the comments it touches. *(Why + the failure taxonomy: [`docs/wiki/comment-doctrine.md`](docs/wiki/comment-doctrine.md).)*

## Risks and gotchas

- **`addons/card-framework/` is vendored — never edit it in place.**
- **Auto-passes are deliberate UX, not rules cheats — don't "fix" them.** AI auto-pass, the Space/Enter pass-priority keybind, and single-sweep SBAs are pragmatic shortcuts on top of a real priority model (canon: [§600 Priority & the Stack](docs/wiki/rules/600-priority-and-the-stack.md)).
- **Stack as `Array[StackEntry]`, not as a `CardContainer`.** Triggered abilities go on the stack but aren't cards. The engine model is `Array[StackEntry]`; the UI is a plain VBoxContainer repainted on `RulesEngine.state_changed`.
- **`@tool` and the autoload don't mix.** `@tool` scripts run inside the editor, where the `RulesEngine` autoload isn't initialized — any script that touches `RulesEngine` must NOT be `@tool`, or the editor spams errors. (Framework-derived visuals — `scenes/card.gd`, `scenes/tres_card_factory.gd` — are `@tool` by card-framework convention and are fine: they never read the autoload.)

## Git & GitHub

- **`dev`** — primary working branch for Godot-side work and the html-proto. PR to here. **`main`** — periodic forward-merge from `dev`.
- **GitHub Pages serves from `dev`**, pointing at `reference/html-proto/magiclike_engine.html`. Pushing to `dev` makes html-proto changes live for play-testing. Godot work doesn't affect Pages but shares the branch.
- Commit changes, but only push when explicitly asked. Don't open PRs unless asked.
- gh and git on the Claudhaus authenticate as **Thaumaturge-Claude** (global git identity uses its noreply), so commits, pushes, and PRs attribute to the bot by default.
- New work happens in a git worktree (they live at `.claude/worktrees/` inside the repo). Parallel Claude sessions each need their own worktree — sharing one causes branch-switch clobbering.
- No version-bump rule for the Godot side (the binary isn't browser-served; Pages serves html-proto only).

## Verification discipline

Three checkable rules. They exist because they are a recurring, costly failure mode (false-green commits; fabricated counts re-fixed two and three times) — not abstract caution.

- **Confirm green before committing or claiming a pass.** Read the test runner's actual summary/total line — never a truncated `tail` that can hide the count. A commit that says "N green" must cite a number you saw this session, not an assumption.
- **Copy facts; don't recall them.** Any number or identifier written into a commit message, PR body, or doc (diff counts, commit totals, SHAs, file paths) must be copied from verified tool output in this session, not typed from memory. When in doubt, re-query (`gh pr view`, `git rev-list --count`) and paste.
- **After a compaction, decisions come from the transcript, not the summary.** The compaction summary is the assistant's own paraphrase — if the assistant misread a decision, the summary preserves the misreading and "verifying against it" (or against a plan doc the assistant wrote under the same misreading) is circular. Before acting on any recently-discussed decision post-compaction, re-read the raw transcript tail (`~/.claude/projects/.../<session>.jsonl`); if a user message admits more than one reading — especially a confirmation question like "we're good to build this, right?" whose referent is ambiguous — ask, don't resolve it in favor of your own standing recommendation. (Cost of the failure this rule exists for: Wave 2 shipped without `ability_triggered` after exactly this misreading, 2026-07-12.)

## Licenses & attributions

**Any time a new outside resource is added to the project — code library, asset pack, AI-art batch, font, sound, tool, anything — log it in `LICENSES.md` at the repo root.** That file is the canonical record of what we depend on, what license each dependency is under, and what we owe attribution-wise. Add the entry in the same commit that pulls the resource in.

Assets shared by both engines go in `assets/` at repo root; html-proto-only assets go in `reference/html-proto/assets/`.
