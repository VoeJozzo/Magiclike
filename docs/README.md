# docs/ — index

Map of the documentation set. Each doc has a single, distinct job; this page is the entry point that says which is which and how they relate. (Onboarding + architecture *decisions* live in the root [`/CLAUDE.md`](../CLAUDE.md); the html-proto has its own [`reference/html-proto/CLAUDE.md`](../reference/html-proto/CLAUDE.md).)

**Layout:** reference docs live at `docs/` root; durable concept pages (the conceptual *why* layer) live in [`wiki/`](wiki/); forward-looking plan specs live in [`plans/`](plans/); superseded handoff narratives are kept for history in [`archive/`](archive/).

## Reference docs — "how things are"

| Doc | Answers |
|---|---|
| [`RULES.md`](RULES.md) | **Canon.** How the game works, in plain English, independent of code. When doc and code disagree, this wins. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **Engine reference** — where Godot behavior lives (modules) **and** its runtime data contracts (action descriptors, the effect-handler `ctx`, signals, awaiting states, `CardInstance`/`EngineState` shapes), by subsystem. Defers to PROTOCOL for the wire vocabulary; the html-proto's internals live in its own `CLAUDE.md`. |
| [`PROTOCOL.md`](PROTOCOL.md) | **The cross-engine wire format** (between-engines contract): the `card.json` schema and the effect-kind / event-kind / predicate-id / target catalogs both engines must agree on. |
| [`DIVERGENCE.md`](DIVERGENCE.md) | Where the Godot port and html-proto behave differently, each row tagged with severity + a to-do. RULES.md is the tie-breaker. |
| [`wiki/`](wiki/) | **Durable concepts** — the conceptual *why* layer: engine architecture rationale, design discipline, the cross-engine relationship. Obsidian-style pages, co-located with the code. |

**Wire vs runtime:** `PROTOCOL.md` owns the format shared *between* engines; `ARCHITECTURE.md` owns the shapes internal to the Godot engine. When they touch, ARCHITECTURE defers to PROTOCOL.

## Planning docs — "what to change"

| Doc | Scope |
|---|---|
| [`godot-port-plan.md`](plans/godot-port-plan.md) | Forward phase roadmap for the Godot port (what ships next, in order). |
| [`BACKLOG.md`](BACKLOG.md) | Deferred **features**, unsequenced parking lot (Godot side). Proto side: [`../reference/html-proto/BACKLOG.md`](../reference/html-proto/BACKLOG.md). |
| [`REFACTOR-NOTES.md`](REFACTOR-NOTES.md) | Structural **debt**, prioritized P0–P2. Advisory; pick up opportunistically. |
| [`STANDARDIZATION-PLAN.md`](STANDARDIZATION-PLAN.md) | Cross-engine standardization rollout (Passes 1–4 shipped: snake_case wire, 258-card migration, JsonCardLoader; Pass 5/6 = future Godot-native wire shape, retire `.tres`, effect-kind porting). |
| [`STANDARDIZATION-CONTEXT.md`](archive/STANDARDIZATION-CONTEXT.md) | Handoff narrative + decision record from the standardization work (locked decisions, gotchas). History, not an active to-do. |

## Refactor specs — "the big coordinated pass"

One coordinated refactor pass, sequenced before Phase 6 card expansion. **Start here:** [`plan-coordinated-refactor.md`](plans/plan-coordinated-refactor.md) is the **master sequencing doc** — the conductor that orders the four workstream plans below into slices with dependencies and verification gates. The four below are the detailed specs for each workstream.

| Doc | Covers |
|---|---|
| [`plan-coordinated-refactor.md`](plans/plan-coordinated-refactor.md) | **Master conductor** — slice order (priority-window → card-data single-source → E1/E2 → effects), dependency graph, per-engine sequencing, checkpoints. |
| [`plan-priority-window-refactor.md`](plans/plan-priority-window-refactor.md) | B6/B7 — centralize priority-window opening, auto-pass, end-turn fast-forward (Godot). |
| [`plan-card-data-unification.md`](plans/plan-card-data-unification.md) | Retire `.tres`; JSON as the single card source (Part 1; Part 2 folds into the effects refactor). |
| [`plan-zone-change-and-composable-predicates.md`](plans/plan-zone-change-and-composable-predicates.md) | E1/E2 — unified `card_zone_change` event + atomic composable predicates (both engines). |
| [`plan-effects-refactor.md`](plans/plan-effects-refactor.md) | 38→~22 atomic effects + `target()`/`chooses()` targeting; folds in the **sticker system** (§3.8), **mana-model deep clean** (§3.9, full-convergence Godot land-as-ability), and **staple-synthesis cleanup** (§3.10). |
| [`GODOT-QA-TODO.md`](archive/GODOT-QA-TODO.md) | **Execution handoff** — the coordinated pass is being built in a container with no Godot binary, so Godot-side code is unverified. This is the checklist for a future Godot 4.6 session: what to run, what to reconcile, deviations to confirm. Proto (JS) work is validated as written. |

## How the trackers divide

`DIVERGENCE.md` (behavior gaps), `REFACTOR-NOTES.md` (code-quality debt), and `BACKLOG.md` (deferred features) are three different lenses on "things to do." A few items are intentionally cross-listed for visibility, with explicit notes where so. Refactor specs supersede the corresponding `DIVERGENCE`/`BACKLOG` rows once they land.
