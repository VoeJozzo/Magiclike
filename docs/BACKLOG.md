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
- **Discuss: Gemma usage** — when to delegate vs. do it directly, model routing (Gemma 4 vs. Gemini Flash, RPD limits), bare-API vs. OpenCode-agent paths, and the verify-after discipline. See the `opencode-delegation` skill.

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
- **Godot loose-ends scan (post-proto-audit, maybe).** During the html-proto audit planning (2026-06-09, `docs/plans/plan-proto-audit.md`) the Godot port was deliberately excluded from audit scope — it isn't worth rebuilding yet. Parked here: a *light* pass over the Godot side for obvious dead threads to snip (vestigial wiring, stale TODOs, half-removed seams), explicitly NOT a comprehensive audit. Consider after the proto audit's remediation phase, when the port's re-sync against the cleaned proto is being planned.
- **Run the Godot phase suite as a PR gate.** The html-proto side has `tests/run_all.js`; the Godot side has 11 phase tests (`tests/test_phase*.tscn`) + the loader test (`test_json_card_loader.tscn`) but nothing runs them automatically. PR #37 shipped two Godot regressions green -- the `c8ecb8a` settle-loop auto-pass (casting auto-resolved the whole stack before the human's window) and the v2.0.70 type cutover silently breaking `json_card_loader` (0/279 supported) -- both invisible until run headless by hand. Add a runner (a `run_all.gd` or shell script invoking each `res://tests/test_*.tscn` headless and asserting exit 0) and wire it into a pre-push hook / PR check, mirroring the proto's `run_all.js`. Headless invocation pattern is in CLAUDE.md -> Testing.

### Addons / vendored
- **Bump `addons/card-framework/` from v1.3.2 → v1.4.0.** Relevant changes: defensive handling for freed cards in `_held_cards`, fix for card offset after layout shifts, `get_target_pose_for()` hook for layout-race-safe returns. Not blocking but worth doing alongside the layout / cramping pass (touches the same area). Our hover-scale override in `scenes/card.gd` will continue to apply — the upstream bug isn't fixed in main yet.
- **Upstream the hover fixes to chun92/card-framework.** Three real bugs in their `draggable_object.gd` that any consumer would benefit from fixing:
  1. **Scale accumulation.** `original_scale = scale` is captured at each hover-start, so rapid mouse in/out compounds (mid-tween value becomes the new "baseline"). Fix: capture `_baseline_scale` once in `_ready()` and use that constant; preserves consumer-set non-1.0 baselines.
  2. **Rotation tween is forced-on.** addon always tweens `rotation` to `hover_rotation` on hover. Correct for fanned hands (straightens for reading), wrong for any game where rotation is semantic state (Magic-style tap=90°, sideways "exhausted" indicators, etc.). Fix: add `@export var hover_animates_rotation: bool = true`; consumers with semantic rotation set it to false. Our override becomes a one-line property set instead of a full method override.
  3. **MOVING-entry doesn't reset scale.** `_enter_state`'s MOVING branch kills the hover tween but never restores `scale`; `move()`/`_finish_move()` don't touch scale either — so a card hover-inflated to `hover_scale` that then receives a programmatic `move()` lands (and stays) oversized. Vanilla-reachable: hover a card in a `Hand`, draw a card → the relayout `move()`s the still-hovered card. Sibling of bug 1 (both scale-hygiene) — bundle in the same PR. We work around it in `scenes/card.gd:462-463` (`elif state == MOVING: scale = Vector2.ONE`). Fix upstream: reset `scale` to baseline on MOVING entry.
  MIT-licensed, PR-friendly project. Worth doing once our local fix holds up in playtest. Once landed upstream + we bump versions, our `scenes/card.gd::_start_hover_animation` override goes away entirely. **Also surveyed (softer, design-change sells — not bug fixes):** a `drag_enabled`/`draggable` export so click-to-act games keep hover without the drag grab (we override `_handle_mouse_pressed` to skip HOLDING); hardening the `hovering_card_count` global-counter desync (breaks hover for *every* card if a subclass's transitions go asymmetric — fragile to exactly the override-based extension the addon's docstring invites); and a floored integer-division spacing nit in `hand.gd::_update_target_positions`. The `card_container`/`hand`/`pile` sweep was otherwise a thin vein (we don't lean on `Hand`). See vault `magiclike-card-framework` for the tiered inventory + the [[dependency-judgment]] two-tier framing.
- **`gcard_layout` (cyanglaz, MIT) — pure-data hand-layout technique worth knowing.** A separate, independent Godot hand-layout plugin ([github.com/cyanglaz/gcard_layout](https://github.com/cyanglaz/gcard_layout)) — stale (last push 2024-05), beta, hand-only, so **nothing to vendor wholesale**. Its one durable idea: `GCardHandLayoutService` computes layout as **pure data** (`Array[{position, rotation}]`) decoupled from any node, then a thin node applies it. That "compute layout as data, apply idempotently" split is exactly what our hover/reorder bug class lacks (our math is intermixed with node-state mutation inside tweens — `scenes/card.gd` lift-creep, `battlefield_zone.gd` combat-reorder snap-back). Two relevances: (a) adopt the *pattern* in our own subclasses to harden the layout code; (b) a *possible* second upstream PR to chun92 — but calibrated as a **harder sell** than the hover bug fixes above (it replaces working layout code rather than fixing an outright bug; maintainers are conservative about behaviour changes). Take the technique, not the addon. If code is ever lifted directly, MIT requires preserving cyanglaz's copyright notice on it. (Surveyed 2026-06-06 alongside `AmyF/nascent-soul`, a broader card/board framework — also not adopted; see vault `magiclike-card-framework`.)

### Card data / wire format
- **Execute Part 1 of `plan-card-data-unification.md`: retire the `.tres` registry, single JSON source.** Today a Godot card lives in two places -- the 23 hand-authored `cards/templates/*.tres` (the playable pool, via `CardDatabase.get_card`) and the 279 `reference/html-proto/cards/<id>/card.json` (read by `JsonCardLoader` for the boot supportability scan only). Full plan + decisions in [`plan-card-data-unification.md`](plans/plan-card-data-unification.md); execute its Part 1 (give the ~10 Godot-only cards JSON forms, repoint `CardDatabase.get_card` at `JsonCardLoader.load_all()`, rebuild the visual factory off JSON-backed `CardResource`, delete the 23 `.tres` + `TresCardFactory`). **This dissolves the live data "divergence" flagged in PR #37 review:** the `.tres` spells carry `card_types: ["instant"]` while the JSON says `types: ["Sorcery"]` (the Instant->flash-Sorcery retirement never reached the `.tres`), and the JSON has full subtype lists the `.tres` lacks. They don't interact at runtime today (`.tres` = game, JSON = diagnostic only), so it's latent -- but it's why `CardResource.is_spell()` currently accepts BOTH `"instant"` and `"sorcery"` as a bridge (`data/card_resource.gd:44`); once JSON is the sole source that hack goes away and the 5 `has_type("instant")` flash-gates (`engine.gd:636,1310`, `ai.gd:261`, `game_board.gd:971,1086`) flip to a `flash`-keyword check. **Deserves its own PR** (factory rebuild + `.tres` deletion + re-verify all phase tests), not folded into a data/refactor PR. **Note -- plan sequencing has drifted:** the plan said keep `JsonCardLoader`'s remap tables through Part 1 and delete them in Part 2, but the wire already went snake_case so they're already gone, and the loader already classifies off `types[]` (post-v2.0.70 cutover). Part 2's snake_case sweep is largely done; re-scope when picking this up.
- **Port procedural oracle-text generation to Godot (`describeCardText`).** The proto GENERATES rules text from each card's effects/triggers/abilities; as of proto v2.0.55 the dead hand-written `text` field was stripped from ~250 procedural cards (kept only on the 10 `custom_text` authored cards). But the Godot port DISPLAYS `template.text` directly (`scenes/card.gd:193` `oracle = str(template.text)`), so those cards now render BLANK oracle text in Godot. Fix: port the proto's `card-text.js` (`describeCardText` / `describeCardSegments` — effect→sentence rendering, keyword preambles, the indefinite-article + type-line logic, etc.) to a Godot module, and drive the card's oracle label off it instead of the stored field. Until then, Godot card faces show no rules text for stripped cards. This is the principled end-state ("the proto generates, production implements the behavior") — once Godot generates, it stops needing the stored `text` too.
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

## Recently done

- **Proto card-id snake_case normalization — already shipped, item retired** (verified 2026-06-09). All 297 manifest ids are pure snake_case; landed back at `e2e151f` "Normalize card ids to match names + add types[] to every card" (proto v2.0.67), with the old camelCase names kept as a save-migration rename map in `js/run.js` and pinned by `tests/tplid_renames_test.js` — exactly the save-compat touch this entry called for. The Phase 6 gate is satisfied.
