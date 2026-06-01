# Godot port — phase roadmap

Forward-looking roadmap for the Godot port. State of the engine and architectural decisions live in [`/CLAUDE.md`](../../CLAUDE.md); deferred work lives in [`BACKLOG.md`](../BACKLOG.md).

The port ships in slices. Each slice has a corresponding `tests/test_phaseN.{gd,tscn}` smoke test (see `/CLAUDE.md` for the invocation pattern). A slice is "done" when its new test passes and all prior phase tests still pass.

## Completed

- **Phase 0** — Repo setup. ✓
- **Phase 1** — Lightning Bolt slice (click-to-cast, real stack, priority). ✓ — `tests/test_phase1.gd`
- **Phase 2** — Creatures + summoning sickness + SBAs. ✓ — `tests/test_phase2.gd`
- **Phase 3** — Combat (attackers, blockers, first-strike step) + first instant on the stack (Giant Growth). ✓ — `tests/test_phase3.gd`
- **Phase 4** — Triggered abilities (pending_triggers queue, APNAP drain, predicate registry). ✓ — `tests/test_phase4.gd`
- **Phase 4.5** — Real-game interlude.
  - **4.5a** — Libraries, draw, decking (MTG 704.5b loss). ✓ — `tests/test_phase4_5a.gd`
  - **4.5b** — Interactive trigger target picker. ✓ — `tests/test_phase4_5b.gd`
  - **4.5c** — Card pool 8 → 16 (basics + vanilla curve + Healing Salve + Counterspell). ✓ — `tests/test_phase4_5c.gd`
- **Phase 5a** — Combat keywords (11 evergreens) + two-pass damage. ✓ — `tests/test_phase5a.gd`
- **Phase 5b** — Engine introspection API for AI (`get_legal_actions`, `duplicate_deep`, `AIScoring.card_value`). ✓ — `tests/test_phase5b.gd`
- **Phase 5c** — `AI.decide` port. Real AI vs AI plays full games to a winner. ✓ — `tests/test_phase5c.gd`

## Phase 6 — Card pool expansion

> **Sequencing note:** land the **E1/E2** (zone-change + composable predicates) and **effects** refactors *before* this phase — see [`plan-zone-change-and-composable-predicates.md`](plan-zone-change-and-composable-predicates.md) and [`plan-effects-refactor.md`](plan-effects-refactor.md). Both plans recommend this so new cards are authored in the atomic/composable style instead of accumulating in the old monolithic shape.

**Reframed by `json_card_loader.gd` (standardization Pass 4):** Godot now reads the html-proto `card.json` files directly (the cross-engine wire format — see [`PROTOCOL.md`](../PROTOCOL.md)), and a boot supportability scan reports which of the 258 proto cards are fully playable (today: 109 supported, 149 awaiting handlers). So card-pool growth is **no longer a transcription problem** ("translate JS templates into `card_database.gd`") — it's a **prioritization problem**: implement the next-most-valuable missing effect/event/predicate kinds, and the cards that need them light up automatically. Grow the supported pool toward ~40 playable across two or three colors (R/G/U) for meaningful draft picks by picking which handlers to add next from the scan's missing-kind tally (top misses today: `remove_creature`, `draw`, `discard`, `grant_keyword`, events `attacks`/`spell_cast`).

Verification: run the supportability scan; confirm the targeted cards move from "awaiting" to "supported"; smoke-assert each newly-supported card instantiates, has correct cost, and casts + resolves.

## Phase 7 — Stickers

> **Design target:** follow the refined sticker design in [`plan-effects-refactor.md`](plan-effects-refactor.md) §3.8, **not** a literal port of the current JS sticker shapes. That section is canonical (signed `cost_mod`, `set_color`, `grant_mana_ability`, the empower redesign with registry-declared empowerable params, the dedup'd apply path, snake_case kinds, and `apply_sticker` as an effect primitive). Stickers and effects are entangled via `apply_sticker`, so this phase rides on the effects refactor.

Per-instance card modifiers that persist with the deck across runs. New `engine/sticker.gd` (RefCounted `{kind, params}`); add `CardInstance.stickers: Array[Sticker]`; effective-stat / effective-keyword reads union template + grants + sticker contributions (the seam already exists in `CardInstance.effective_keywords()`). `Sticker.is_legal_for(card_resource)` mirrors the eligibility rules (empower needs an empowerable effect; lifelink needs a damage-dealing source) — see §3.8 for the canonical form.

Verification: `kw_flying` sticker on Grizzly Bears lets bears attack past a ground blocker; empower sticker on Lightning Bolt deals 4 instead of 3.

## Phase 8 — Draft

Port `DRAFT.startDraft` and `pickFromPack` from `reference/html-proto/js/draft.js`. 23-pick single-player draft, 3-card packs, color-biased pool sampling. Opponent deck simulated post-draft via the heuristic scorer (`AIScoring.card_value` is already in place from Phase 5b). Auto-land allocation via `allocLands()` port. New `scenes/draft/draft_screen.{gd,tscn}`.

Verification: complete a 23-pick draft, deck size 40, lands allocated to roughly 17, opponent deck generated.

## Phase 9 — Run / roguelike loop / persistence

Port `RUN` from `reference/html-proto/js/run.js`. Run state `{slots, colors, modifier, game_num, wins, active, last_result, pending_reward}` saved to `user://magiclike_run_v1.json` via `FileAccess` + `JSON.stringify`. Reward flow after wins: sticker / two-stickers / transform / clone / rip-up. Per-game opponent scaling: game N gets N-1 stickers on their deck. Schema versioning + migrations port directly from JS. New `scenes/run/run_map.{gd,tscn}`.

Verification: start a run, win 2 games with auto-AI, save, reload, confirm slots / wins / game_num match.

## Phase 10 — Analytics (optional)

Port `PICKLOG` from `reference/html-proto/js/picklog.js`. Records draft history to `user://magiclike_picklog_v1.json` for offline pick-quality analysis. Low priority; ship without and add later if useful.
