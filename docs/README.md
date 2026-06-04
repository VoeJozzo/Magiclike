# docs/ — index

Map of the documentation set. Each doc has a single, distinct job; this page is the entry point that says which is which and how they relate. (Onboarding + architecture *decisions* live in the root [`/CLAUDE.md`](../CLAUDE.md); the html-proto has its own [`reference/html-proto/CLAUDE.md`](../reference/html-proto/CLAUDE.md).)

**Layout:** reference docs live at `docs/` root; durable concept pages (the conceptual *why* layer) and the **canonical rulebook** (`wiki/rules/`) live in [`wiki/`](wiki/); forward-looking plan specs live in [`plans/`](plans/); superseded handoff narratives are kept for history in [`archive/`](archive/).

## Reference docs — "how things are"

| Doc | Answers |
|---|---|
| [`wiki/rules/`](wiki/rules/rulebook.md) | **Canon.** How the game works, in plain English, independent of code. When doc and code disagree, this wins. The rulebook — one page per §. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **Engine reference** — where Godot behavior lives (modules) **and** its runtime data contracts (action descriptors, the effect-handler `ctx`, signals, awaiting states, `CardInstance`/`EngineState` shapes), by subsystem. Defers to PROTOCOL for the wire vocabulary; the html-proto's internals live in its own `CLAUDE.md`. |
| [`PROTOCOL.md`](PROTOCOL.md) | **The cross-engine wire format** (between-engines contract): the `card.json` schema and the effect-kind / event-kind / predicate-id / target catalogs both engines must agree on. |
| [`DIVERGENCE.md`](DIVERGENCE.md) | Where the Godot port and html-proto behave differently, each row tagged with severity + a to-do. The rulebook (`wiki/rules/`) is the tie-breaker. |
| [`wiki/`](wiki/) | **Durable concepts** — the conceptual *why* layer: engine architecture rationale, design discipline, the cross-engine relationship. Also home to the **canonical rulebook**, decomposed one-page-per-§ into [`wiki/rules/`](wiki/rules/). Obsidian-style pages, co-located with the code. |

**Wire vs runtime:** `PROTOCOL.md` owns the format shared *between* engines; `ARCHITECTURE.md` owns the shapes internal to the Godot engine. When they touch, ARCHITECTURE defers to PROTOCOL.

## Find by topic

The reference docs are partitioned by **job**; most real questions are **topics** that span several. Where each topic's facets live — canon · wire · engine · gap · active plan:

- **Priority & the stack** — [RULES §600](wiki/rules/600-priority-and-the-stack.md) · [ARCHITECTURE](ARCHITECTURE.md) §2.4 · [DIVERGENCE](DIVERGENCE.md) B6/E6 · plan: [priority-window](plans/plan-priority-window-refactor.md)
- **Combat** — [RULES §800](wiki/rules/800-combat.md) · [ARCHITECTURE](ARCHITECTURE.md) §2.4 · [DIVERGENCE](DIVERGENCE.md) C
- **Triggered abilities** — [RULES §1000](wiki/rules/1000-triggered-abilities.md) · [PROTOCOL](PROTOCOL.md) §3.3–§3.5 / §5 · [ARCHITECTURE](ARCHITECTURE.md) §2.6 · [DIVERGENCE](DIVERGENCE.md) E · plan: [zone-change + composable predicates](plans/plan-zone-change-and-composable-predicates.md)
- **Effects** — [PROTOCOL](PROTOCOL.md) §3.2 / §4 · [ARCHITECTURE](ARCHITECTURE.md) §2.5 · [DIVERGENCE](DIVERGENCE.md) D · plan: [effects-refactor](plans/plan-effects-refactor.md)
- **Stickers** — [RULES §1300](wiki/rules/1300-stickers.md) · [PROTOCOL](PROTOCOL.md) §3.2 (`apply_sticker`) · [DIVERGENCE](DIVERGENCE.md) D · plan: [effects-refactor §3.8](plans/plan-effects-refactor.md) · (Godot: Phase 7)
- **Mana** — [PROTOCOL](PROTOCOL.md) §3.2 (`add_mana`) · [ARCHITECTURE](ARCHITECTURE.md) §2.5 · [DIVERGENCE](DIVERGENCE.md) D5 · plan: [effects-refactor §3.9](plans/plan-effects-refactor.md)
- **Card data & types** — [PROTOCOL](PROTOCOL.md) §2 · [ARCHITECTURE](ARCHITECTURE.md) §2.7 · plan: [card-data-unification](plans/plan-card-data-unification.md) · (the `types[]` system shipped on proto → [archived](archive/plan-unified-type-system.md))
- **AI** — [ARCHITECTURE](ARCHITECTURE.md) §2.8
- **The "why"** (architecture rationale, design discipline, the cross-engine relationship) — [`wiki/`](wiki/)

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
