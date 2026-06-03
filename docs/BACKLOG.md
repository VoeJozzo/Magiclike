# Backlog (Godot side)

Parking lot for deferred work on the Godot port. Not a session agenda. Items live here because they came up in past sessions, got considered, and were deferred for a reason — usually "later," "blocked on X," or "needs the user's call."

For html-proto deferred work, see [`reference/html-proto/BACKLOG.md`](../reference/html-proto/BACKLOG.md).

## How to maintain this file

- **Update on state change.** Adding a new deferred item, moving one to "Recently done," or marking one rejected — all part of normal work. Include the date or phase tag on "Recently done" entries.
- **Prune "Recently done" periodically.** Once an item is a few phases old and visibly shipped, drop it. This isn't a changelog — git log is the changelog.

---

## Open

### Discuss / decide (top of queue)
- **Discuss: Secrets** — review the `~/.config/magiclike/secrets.env` setup (Gemini key + `GH_PAT_GEMMA`), rotation, multi-machine handling, and whether anything should change.
- **Discuss: Gemma usage** — when to delegate vs. do it directly, model routing (Gemma 4 vs. Gemini Flash, RPD limits), bare-API vs. OpenCode-agent paths, and the verify-after discipline. See the `gemma-delegate` skill.
- **Discuss: GitHub accounts / access best practices** — the `Thaumaturge-Gemma` bot account, classic-vs-fine-grained PAT scope, fork/cross-PR flow, commit-email linking, and credential-manager (GCM) handling on Windows.

### Rules-engine correctness
- **Trigger chain depth cap** — Godot to mirror proto's 100-depth threshold in `_drain_pending_triggers`. See `docs/DIVERGENCE.md` E6.

### Divergence-tracked work
The following items live in `docs/DIVERGENCE.md` as their primary tracker. Listed here so they're visible in the BACKLOG queue. Look up each by its ID for full context and TO-DO details.

**Major refactor plans** (own docs, multi-item):
- **B6 + B7** — priority-window helper + auto-pass + end-turn fast-forward (godot). Plan: [`docs/plans/plan-priority-window-refactor.md`](plans/plan-priority-window-refactor.md). Effort: M (~8h).
- **E1 + E2** — zone-change event unification + composable predicates (both). Plan: [`docs/plans/plan-zone-change-and-composable-predicates.md`](plans/plan-zone-change-and-composable-predicates.md). Effort: L (~34h).
- **Effects refactor** (subsumes D2, D3, D4; touches every card with effects) — 38 proto effects → ~22 atomic registry, `target()`/`chooses()` targeting + hexproof model, compound decomposition. Now also folds in the sticker system, deep-clean mana model (full-convergence Godot land-as-ability), and staple-synthesis cleanup (plan §3.8–§3.10). Plan: [`docs/plans/plan-effects-refactor.md`](plans/plan-effects-refactor.md). Effort: L (~92–97h). Sequenced AFTER E1/E2.

**Individual items:**

- **A1** — randomize first player at game start (godot)
- **A2** — first-turn draw-skip rule (godot)
- **A4** — forced mulligan on extreme land counts (godot)
- **A5** — `KIND_CONCEDE` action (godot)
- **B3** — CLEANUP step ordering harmonization (either)
- **B4** — delayed triggers (godot, Phase 7+)
- **B5** — temp-control revert (godot, Phase 7+)
- **B6 + B7** — `_open_priority_window` helper + auto-pass when no legal action + end-turn fast-forward (godot). Detailed refactor plan: [`docs/plans/plan-priority-window-refactor.md`](plans/plan-priority-window-refactor.md). Effort: M, ~8 hours.
- **C1, C2** — multi-blocker damage assignment + deathtouch (godot)
- **C4** — declaration UI refactor: build selection in UI, atomic commit (godot)
- **C5** — `killedBy` tracking for keyword-claim death triggers (godot, Phase 7+)
- **D3** — `gain_life` flexibility (target/who parameter) (godot)
- **D4** — `gain_life` signed-delta with direction-based event emission (both)
- **D7** — legendary uniqueness at cast (godot, when first legendary lands)
- **E1 + E2** — zone-change event unification + composable predicate refactor (both engines). Detailed plan: [`docs/plans/plan-zone-change-and-composable-predicates.md`](plans/plan-zone-change-and-composable-predicates.md). Effort: L (~34h). Recommended **before** Phase 6 card-pool expansion so new cards don't accumulate in the old monolithic style.
- **E7** — effect-aware AI trigger-target picking (godot)
- **F3** — token vanishing on leave-play (godot, when first token lands)
- **G1** — opponent hand face-down UI (godot) — engine handles hidden info correctly; UI leaks identity

### AI
- **Per-effect triggered-ability scoring in `AIScoring.card_value`.** Currently a flat keyword/triggered-ability bump. The JS prototype walks effects to score them individually (a Pyromaniac-style ETB is worth less than a Sheoldred-style draw-step lifelink). Deferred from Phase 5b.

### Tooling / process
- **Run the Godot phase suite as a PR gate.** The html-proto side has `tests/run_all.js`; the Godot side has 11 phase tests (`tests/test_phase*.tscn`) + the loader test (`test_json_card_loader.tscn`) but nothing runs them automatically. PR #37 shipped two Godot regressions green -- the `c8ecb8a` settle-loop auto-pass (casting auto-resolved the whole stack before the human's window) and the v2.0.70 type cutover silently breaking `json_card_loader` (0/279 supported) -- both invisible until run headless by hand. Add a runner (a `run_all.gd` or shell script invoking each `res://tests/test_*.tscn` headless and asserting exit 0) and wire it into a pre-push hook / PR check, mirroring the proto's `run_all.js`. Headless invocation pattern is in CLAUDE.md -> Testing.

### Addons / vendored
- **Bump `addons/card-framework/` from v1.3.2 → v1.4.0.** Relevant changes: defensive handling for freed cards in `_held_cards`, fix for card offset after layout shifts, `get_target_pose_for()` hook for layout-race-safe returns. Not blocking but worth doing alongside the layout / cramping pass (touches the same area). Our hover-scale override in `scenes/card.gd` will continue to apply — the upstream bug isn't fixed in main yet.
- **Upstream the hover fixes to chun92/card-framework.** Two real bugs in their `draggable_object.gd` that any consumer would benefit from fixing:
  1. **Scale accumulation.** `original_scale = scale` is captured at each hover-start, so rapid mouse in/out compounds (mid-tween value becomes the new "baseline"). Fix: capture `_baseline_scale` once in `_ready()` and use that constant; preserves consumer-set non-1.0 baselines.
  2. **Rotation tween is forced-on.** addon always tweens `rotation` to `hover_rotation` on hover. Correct for fanned hands (straightens for reading), wrong for any game where rotation is semantic state (Magic-style tap=90°, sideways "exhausted" indicators, etc.). Fix: add `@export var hover_animates_rotation: bool = true`; consumers with semantic rotation set it to false. Our override becomes a one-line property set instead of a full method override.
  MIT-licensed, PR-friendly project. Worth doing once our local fix holds up in playtest. Once landed upstream + we bump versions, our `scenes/card.gd::_start_hover_animation` override goes away entirely.

### Card data / wire format
- **Execute Part 1 of `plan-card-data-unification.md`: retire the `.tres` registry, single JSON source.** Today a Godot card lives in two places -- the 23 hand-authored `cards/templates/*.tres` (the playable pool, via `CardDatabase.get_card`) and the 279 `reference/html-proto/cards/<id>/card.json` (read by `JsonCardLoader` for the boot supportability scan only). Full plan + decisions in [`plan-card-data-unification.md`](plans/plan-card-data-unification.md); execute its Part 1 (give the ~10 Godot-only cards JSON forms, repoint `CardDatabase.get_card` at `JsonCardLoader.load_all()`, rebuild the visual factory off JSON-backed `CardResource`, delete the 23 `.tres` + `TresCardFactory`). **This dissolves the live data "divergence" flagged in PR #37 review:** the `.tres` spells carry `card_types: ["instant"]` while the JSON says `types: ["Sorcery"]` (the Instant->flash-Sorcery retirement never reached the `.tres`), and the JSON has full subtype lists the `.tres` lacks. They don't interact at runtime today (`.tres` = game, JSON = diagnostic only), so it's latent -- but it's why `CardResource.is_spell()` currently accepts BOTH `"instant"` and `"sorcery"` as a bridge (`data/card_resource.gd:44`); once JSON is the sole source that hack goes away and the 5 `has_type("instant")` flash-gates (`engine.gd:636,1310`, `ai.gd:261`, `game_board.gd:971,1086`) flip to a `flash`-keyword check. **Deserves its own PR** (factory rebuild + `.tres` deletion + re-verify all phase tests), not folded into a data/refactor PR. **Note -- plan sequencing has drifted:** the plan said keep `JsonCardLoader`'s remap tables through Part 1 and delete them in Part 2, but the wire already went snake_case so they're already gone, and the loader already classifies off `types[]` (post-v2.0.70 cutover). Part 2's snake_case sweep is largely done; re-scope when picking this up.
- **Port procedural oracle-text generation to Godot (`describeCardText`).** The proto GENERATES rules text from each card's effects/triggers/abilities; as of proto v2.0.55 the dead hand-written `text` field was stripped from ~250 procedural cards (kept only on the 10 `custom_text` authored cards). But the Godot port DISPLAYS `template.text` directly (`scenes/card.gd:193` `oracle = str(template.text)`), so those cards now render BLANK oracle text in Godot. Fix: port the proto's `card-text.js` (`describeCardText` / `describeCardSegments` — effect→sentence rendering, keyword preambles, the indefinite-article + type-line logic, etc.) to a Godot module, and drive the card's oracle label off it instead of the stored field. Until then, Godot card faces show no rules text for stripped cards. This is the principled end-state ("the proto generates, production implements the behavior") — once Godot generates, it stops needing the stored `text` too.
- **Normalize all proto card ids to snake_case.** After the card-data-unification Slice 1 unifies the ~21 cards shared by both engines (keeping Godot's snake_case names, renaming the colliding proto folders — see [`plan-card-data-unification.md`](plans/plan-card-data-unification.md) Q1), the remaining ~237 proto-only ids are still camelCase/abbreviated (`bloodKnight`, `airel`, `growth`, …). This is a pure consistency cleanup, **not** a cross-engine unification blocker (Godot doesn't have those cards yet). Mechanical sweep: rename each folder + its `card_id` field + `_manifest.json` key + any proto deck-list / test references (`card_id` is "used in saves" per PROTOCOL.md §2.1, so it's also a save-compat touch). **Gate: do this BEFORE the Godot port consumes the full pool (Phase 6 card-pool expansion).** Cheap now while Godot references ~31 cards; expensive once Godot decks/tests/saves reference 250+ camelCase ids.
- **Board layout / cramping pass.** Open items from playtest at 1856×1044 that are still unaddressed:
  - **Stack as expandable popup / tray.** Currently the stack panel sits permanently top-center, colliding with the top-row land cascade. Move it into a tray the player can open/close as needed.
  - **Multi-row creature layout** when count exceeds a row's capacity.
  - **Right-side log bleed** into the card zones — log panel resize/clip or move out of the card area.
  - **Smaller card tiles** to fit more on screen, paired with the existing right-click focus for detail-on-demand.
  Done in earlier sessions: adaptive spacing for creatures and lands, color clumping for lands, right-click focus for inspection. Touches `BattlefieldZone`, `_make_battlefield`, `_make_hand`, the stack panel scenes.
- **Config for priority-pass stops.** MTGO-style "stop on cast / stop on draw / stop on attack" settings — let the player control which auto-passes are allowed and when the engine hands them priority explicitly. Engine has the seams (single `execute_action(pass_priority)` entry point); needs a settings layer and game-board wiring.
- **Manual "hold priority" UI for the human player.** Currently the player has a Space/Enter keybind that passes priority; no UI to retain priority for a follow-up instant. Becomes relevant once players have multi-instant lines they want to chain.
- **Touch/mobile: long-press to inspect.** Desktop currently uses right-click for card inspection (focus mode). When/if we port to touch, replace the right-click trigger with a long-press on the card visual (~400ms hold without significant movement). Existing `_toggle_focus` / `enter_focus` / `exit_focus` infrastructure carries over; only the input gesture changes.
- **Card art for the 23 existing cards.** Placeholders today. Four PNGs (blood_knight, cloud_pegasus, ember_drake, goblin_duelist) are already ported to `cards/images/` but unwired — they're art *inserts*, not full card faces, and our `scenes/card.tscn` treats `front_image` as the entire face. Wiring needs a frame+slot rebuild of card.tscn (Frame TextureRect + Art TextureRect children), then TresCardFactory sets both. After that, port the remaining cards' art from `reference/html-proto/cards/<tplId>/art.png`.
