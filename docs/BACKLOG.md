# Backlog (Godot side)

Parking lot for deferred work on the Godot port. Not a session agenda. Items live here because they came up in past sessions, got considered, and were deferred for a reason — usually "later," "blocked on X," or "needs the user's call."

For html-proto deferred work, see [`reference/html-proto/BACKLOG.md`](../reference/html-proto/BACKLOG.md).

## How to maintain this file

- **Update on state change.** Adding a new deferred item, moving one to "Recently done," or marking one rejected — all part of normal work. Include the date or phase tag on "Recently done" entries.
- **Prune "Recently done" periodically.** Once an item is a few phases old and visibly shipped, drop it. This isn't a changelog — git log is the changelog.

---

## Open

### Rules-engine correctness
- **Trigger chain depth cap** — Godot to mirror proto's 100-depth threshold in `_drain_pending_triggers`. See `docs/DIVERGENCE.md` E6.
- **"Intervening if" predicate re-check at trigger resolution** — both engines deviate from MTG 603.4 (predicate checked only at queue time, not at resolution). See `docs/DIVERGENCE.md` E5.
- **Non-self triggers exercised in tests.** The `self_only=false` listener path in trigger draining is implemented but no card or test currently exercises it. Add when a card legitimately needs a non-self listener.

### Divergence-tracked work
The following items live in `docs/DIVERGENCE.md` as their primary tracker. Listed here so they're visible in the BACKLOG queue. Look up each by its ID for full context and TO-DO details.

**Major refactor plans** (own docs, multi-item):
- **B6 + B7** — priority-window helper + auto-pass + end-turn fast-forward (godot). Plan: [`docs/plan-priority-window-refactor.md`](plan-priority-window-refactor.md). Effort: M (~8h).
- **E1 + E2** — zone-change event unification + composable predicates (both). Plan: [`docs/plan-zone-change-and-composable-predicates.md`](plan-zone-change-and-composable-predicates.md). Effort: L (~34h).
- **Effects refactor** (subsumes D2, D3, D4; touches every card with effects) — 38 proto effects → 19 atomic registry, target-filter unification, hexproof model, compound decomposition. Now also folds in the sticker system, deep-clean mana model, and staple-synthesis cleanup (plan §3.8–§3.10). Plan: [`docs/plan-effects-refactor.md`](plan-effects-refactor.md). Effort: L (~64–69h). Sequenced AFTER E1/E2.

**Individual items:**

- **A1** — randomize first player at game start (godot)
- **A2** — first-turn draw-skip rule (godot)
- **A4** — forced mulligan on extreme land counts (godot)
- **A5** — `KIND_CONCEDE` action (godot)
- **B3** — CLEANUP step ordering harmonization (either)
- **B4** — delayed triggers (godot, Phase 7+)
- **B5** — temp-control revert (godot, Phase 7+)
- **B6 + B7** — `_open_priority_window` helper + auto-pass when no legal action + end-turn fast-forward (godot). Detailed refactor plan: [`docs/plan-priority-window-refactor.md`](plan-priority-window-refactor.md). Effort: M, ~8 hours.
- **C1, C2** — multi-blocker damage assignment + deathtouch (godot)
- **C4** — declaration UI refactor: build selection in UI, atomic commit (godot)
- **C5** — `killedBy` tracking for keyword-claim death triggers (godot, Phase 7+)
- **D3** — `gain_life` flexibility (target/who parameter) (godot)
- **D4** — `gain_life` signed-delta with direction-based event emission (both)
- **D7** — legendary uniqueness at cast (godot, when first legendary lands)
- **E1 + E2** — zone-change event unification + composable predicate refactor (both engines). Detailed plan: [`docs/plan-zone-change-and-composable-predicates.md`](plan-zone-change-and-composable-predicates.md). Effort: L (~34h). Recommended **before** Phase 6 card-pool expansion so new cards don't accumulate in the old monolithic style.
- **E7** — effect-aware AI trigger-target picking (godot)
- **F3** — token vanishing on leave-play (godot, when first token lands)
- **G1** — opponent hand face-down UI (godot) — engine handles hidden info correctly; UI leaks identity

### AI
- **Per-effect triggered-ability scoring in `AIScoring.card_value`.** Currently a flat keyword/triggered-ability bump. The JS prototype walks effects to score them individually (a Pyromaniac-style ETB is worth less than a Sheoldred-style draw-step lifelink). Deferred from Phase 5b.

### Addons / vendored
- **Bump `addons/card-framework/` from v1.3.2 → v1.4.0.** Relevant changes: defensive handling for freed cards in `_held_cards`, fix for card offset after layout shifts, `get_target_pose_for()` hook for layout-race-safe returns. Not blocking but worth doing alongside the layout / cramping pass (touches the same area). Our hover-scale override in `scenes/card.gd` will continue to apply — the upstream bug isn't fixed in main yet.
- **Upstream the hover fixes to chun92/card-framework.** Two real bugs in their `draggable_object.gd` that any consumer would benefit from fixing:
  1. **Scale accumulation.** `original_scale = scale` is captured at each hover-start, so rapid mouse in/out compounds (mid-tween value becomes the new "baseline"). Fix: capture `_baseline_scale` once in `_ready()` and use that constant; preserves consumer-set non-1.0 baselines.
  2. **Rotation tween is forced-on.** addon always tweens `rotation` to `hover_rotation` on hover. Correct for fanned hands (straightens for reading), wrong for any game where rotation is semantic state (Magic-style tap=90°, sideways "exhausted" indicators, etc.). Fix: add `@export var hover_animates_rotation: bool = true`; consumers with semantic rotation set it to false. Our override becomes a one-line property set instead of a full method override.
  MIT-licensed, PR-friendly project. Worth doing once our local fix holds up in playtest. Once landed upstream + we bump versions, our `scenes/card.gd::_start_hover_animation` override goes away entirely.

### UI / UX
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
