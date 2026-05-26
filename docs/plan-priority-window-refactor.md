# Refactor Plan: Centralize Priority-Window Opening

**Status:** Plan complete, ready for review. Not yet executed.
**Cross-references:** `docs/DIVERGENCE.md` items B6 (auto-pass when no legal action) and B7 (end-turn fast-forward). `docs/BACKLOG.md` lists this in the rules-engine queue.
**Effort estimate:** M (half a day to a day, ~8 hours total).

This plan was produced by an Explore/Plan pass against `engine/engine.gd` and `reference/html-proto/js/engine.js`, with the goal of making priority-window opening a single structural operation rather than 8 separate direct assignments.

---

## 1. Direct assignment sites in `engine/engine.gd`

There are **8** sites total. Six are "open a real priority window" calls that route through the new helper; two are init paths; one is a close-priority sentinel.

| Line | Function | Setting to | Purpose |
|---|---|---|---|
| 49, 69, 94, 130, 215 | `init_phase{1..4}`, `init_game` | `"you"` | Boot-time, **game start MAIN1**. Active player gets priority. These can route through the helper too (preserves the invariant; auto-pass is rare here since MAIN1 has playable lands). |
| 649 | `_do_cast_spell` | `controller.key` | **Post-cast retain priority** (MTG 117.1c). Caster keeps priority on top of fresh stack entry. |
| 663 | `_do_pass_priority` | `_state.active_player_key` | **Post-resolution.** Both passed → top resolved → AP gets priority on the (still-loaded or now-empty) stack. |
| 669 | `_do_pass_priority` | `opponent_of(...)` | **Pass to other player.** Must call the helper to trigger the next-holder auto-pass check. |
| 938 | `_do_confirm_blocks` | `_state.active_player_key` | **Post-block-declaration APNAP open** (MTG 117.1b). |
| 1209, 1211 | `_advance_phase` | `""` or `_state.active_player_key` | **Phase entry.** Closes priority if `awaiting_block`/`awaiting_discard`, else opens to AP. The `""` branch is the close-priority sentinel. |
| 1451 | `_do_discard_card` | `_state.active_player_key` | **Post-cleanup-discard.** Restores AP priority once excess hand is gone. |
| 1512 | `_drain_continue` | `_state.active_player_key` | **Post-trigger-drain** (MTG 116.5). AP gets priority after pending triggers flush onto stack. |

## 2. Helper design

The helper lives on `RulesEngine` (i.e., `engine.gd`), not `EngineState`. `EngineState` is a passive data bag; the helper needs `get_legal_actions` and `_dispatch_action`, both of which live on the engine.

**Signature:** `func _open_priority_window(player_key: String) -> void`

**Pseudocode:**
```gdscript
if player_key == "":
    _state.priority_player_key = ""    # close-priority sentinel
    _reset_priority_passes()
    return
_state.priority_player_key = player_key
_reset_priority_passes()
if _state.winner != "":
    return
# Don't auto-pass during gated turn-based states; _current_actor handles routing.
if _state.awaiting_block_declaration or not _state.awaiting_discard.is_empty() \
        or not _state.awaiting_target_for_trigger.is_empty():
    return
if _should_auto_pass(player_key):
    _dispatch_action(Action.make_pass_priority())
```

`_should_auto_pass` combines B6 (no meaningful action) + B7 (`endTurnPending` for active player on empty stack) + proto's "AP empty-stack END skip." The recursion `_dispatch_action(pass)` → `_do_pass_priority` → flips holder → calls helper on new holder is bounded by `_settle_state`'s safety counter and naturally terminates.

## 3. `_has_no_meaningful_action(player_key)` predicate

**Recommendation: introduce `KIND_TAP_LAND_FOR_MANA` as a separate action kind.** Reasoning:

- Inspecting an ability's first effect for `add_mana` is a fragile probe that buries semantics in shape inspection. It won't generalize once Phase 6+ introduces non-mana activated abilities.
- A separate kind mirrors proto exactly (`tapLandForMana` is its own action kind in `engine.js`). It makes "this is a mana ability" a structural fact, not an inference. The B6 filter becomes a clean kind-set check.
- Phase 1 has **only** land mana abilities under `KIND_ACTIVATE_ABILITY`, so the migration is mechanical: rename `_legal_activate_ability` / `_do_activate_ability` to `_legal_tap_land_for_mana` / `_do_tap_land_for_mana`, swap the kind constant, and update `get_legal_actions`. When non-mana activations land in Phase 6+, `KIND_ACTIVATE_ABILITY` returns clean.

**Coordination with the effects-plan mana model — `is_mana_ability` is COMMITTED this pass (decided — §3.9 option 3).** `KIND_TAP_LAND_FOR_MANA` is named land-specifically because Phase 1 has only land mana abilities. The thing the auto-pass check *actually* cares about is "is this a **mana ability**" (produces mana, no target — MTG's definition), not "is this a land." The effects-plan §3.9 mana deep-clean was decided as **full convergence (option 3)**: Godot adopts the land-as-`add_mana`-ability model internally in that slice. So `KIND_TAP_LAND_FOR_MANA` **generalizes to a structural `is_mana_ability` classification** on the ability — keying both the stack fast-path (D8) and the auto-pass meaningfulness check off that property — as a committed step of §3.9, **not** a deferred forward note. Proto already works this way in spirit: its `tapLandForMana` action kind covers creature dorks too (engine.js:4191). Slice 0 (this plan) ships `KIND_TAP_LAND_FOR_MANA` as the minimal priority-window change; §3.9 (Slice 3) generalizes it to `is_mana_ability` when Godot's lands become real abilities — introduce-then-generalize, each slice focused.

**Predicate body:**
```gdscript
func _has_no_meaningful_action(player_key: String) -> bool:
    for a in get_legal_actions(player_key):
        match a.get("kind", ""):
            Action.KIND_CAST_SPELL, Action.KIND_ACTIVATE_ABILITY, \
            Action.KIND_PLAY_LAND, Action.KIND_DECLARE_ATTACKER, \
            Action.KIND_DECLARE_BLOCKER:
                return false
    return true
```

Including `DECLARE_ATTACKER` / `DECLARE_BLOCKER` is necessary because Godot's model opens a priority window at COMBAT_ATTACK before declarations (unlike proto where declarations aren't priority-windowed). Without them, the engine would auto-skip combat.

## 4. B7 end-turn integration

- **`EngineState.end_turn_pending: bool = false`** (new field; add to `_init` defaults and `duplicate_deep`).
- **`Action.make_end_turn()`** → `{"kind": "end_turn"}`.
- **`_legal_end_turn`**: legal only when actor is active player, stack is empty, `awaiting_discard` empty, no winner.
- **`_do_end_turn`**: if `phase == COMBAT_ATTACK` and player hasn't declared, commit empty attackers (mirrors proto:4622). Sets `_state.end_turn_pending = true`.
- **Flag clear sites**:
  - `_advance_phase` entering `UNTAP` (proto pattern at engine.js:5424) — flag clears as the new turn begins. Add explicit `_state.end_turn_pending = false`.
  - Inside `_do_action` whenever active player takes any non-pass/non-end-turn action (re-engagement; proto's pattern at engine.js:5466).
- **Helper consultation:**
  ```gdscript
  func _should_auto_pass(player_key: String) -> bool:
      var ap_empty_stack_end := (
          _state.phase_machine.current == PhaseMachine.Phase.END
          and player_key == _state.active_player_key
          and _state.stack.is_empty())
      var end_turn_fast_forward := (
          _state.end_turn_pending
          and player_key == _state.active_player_key
          and _state.stack.is_empty())
      return ap_empty_stack_end or end_turn_fast_forward or _has_no_meaningful_action(player_key)
  ```
- Wire `KIND_END_TURN` into `is_legal_action`, `_do_action`, `get_legal_actions`.

## 5. Coordination with `awaiting_*` states

The current `_advance_phase` (engine.gd:1196-1203) sets `priority_player_key = ""` when entering COMBAT_BLOCK with attackers or CLEANUP with excess hand. The helper handles this via the early-return: callers pass `""` to mean "close." The migration replaces:

```gdscript
if _state.awaiting_block_declaration or not _state.awaiting_discard.is_empty():
    _state.priority_player_key = ""
else:
    _state.priority_player_key = _state.active_player_key
_reset_priority_passes()
```

with:
```gdscript
var next_priority := "" if (_state.awaiting_block_declaration \
        or not _state.awaiting_discard.is_empty()) \
        else _state.active_player_key
_open_priority_window(next_priority)
```

The `""` early-return inside the helper preserves `_current_actor`'s precedence chain (engine.gd:432-440). Nothing downstream changes. The helper also belt-and-suspenders-checks `awaiting_*` before auto-passing — even if a caller forgets and passes `"you"` during an awaiting state, we won't fire a bogus pass.

## 6. Migration plan (sequenced)

Each step ends with `tests/test_phase*.gd` runs. Recommend sequenced, not all-at-once.

1. **Add `KIND_TAP_LAND_FOR_MANA`** (rename existing land-mana path). Don't touch priority logic yet. Update AI's enumerator if it filters action kinds. Run all tests — semantic equivalence check.
2. **Introduce `_open_priority_window(player_key)`** without auto-pass logic — body is just `priority_player_key = player_key; _reset_priority_passes()` plus the `""` early return. Migrate all 8 sites mechanically. Run all tests — should be no behavior change.
3. **Add `_should_auto_pass` and wire it in.** Tests may show different settle behavior (auto-passes that the AI previously did manually). Update any test that explicitly walked through opp's `make_pass_priority` calls.
4. **Add `KIND_END_TURN` + `end_turn_pending` field + flag-clear sites.** Wire into `_should_auto_pass`.
5. **Add the new B6/B7 tests** in `tests/test_priority_window.gd` (or extend `test_phase4_5b`):
   - Player with empty hand + tapped lands in MAIN1 → auto-passes (B6).
   - Player with only lands in hand at END step with empty stack → AP auto-passes (proto "skipApEndStep").
   - End-turn fast-forward: cast `KIND_END_TURN` in MAIN1 → engine fast-forwards to CLEANUP and stops (B7).
   - **End-turn during COMBAT_ATTACK before declaring attackers** → engine commits empty attackers automatically, then fast-forwards. Mirrors proto:4622. The mid-declaration case from B7 design.
   - End-turn during COMBAT_BLOCK with declared attackers → blocks already settled (or fast-forward begins after they're confirmed); subsequent priority windows auto-pass.
   - End-turn with a triggered ability firing mid-fast-forward → stack populates, fast-forward pauses, active player regains priority for instant-speed response; if they pass, trigger resolves and fast-forward resumes.
   - End-turn flag clears on UNTAP of next turn.
   - End-turn flag clears mid-turn if active player casts a spell (re-engagement).
   - Mana abilities (`KIND_TAP_LAND_FOR_MANA`) alone do NOT prevent auto-pass.
   - Existing `test_phase1..5c` should still pass unchanged.
6. **Update `docs/DIVERGENCE.md`** B6 and B7 rows to mark implemented (or move to a "Recently aligned" section).

Steps 1–3 each leave the engine in a runnable state and let you bisect any regressions cleanly. Step 4 is the only step that introduces a brand-new action kind affecting the legal-action enumeration; that's where AI integration risk concentrates.

## Effort breakdown (~8 hours)

| Step | Time |
|---|---|
| Helper + auto-pass predicate | ~1 hour |
| Migrate 8 priority assignment sites + tests | ~2 hours |
| Split `KIND_TAP_LAND_FOR_MANA` from `KIND_ACTIVATE_ABILITY` (rename, register constant, update dispatch + enumeration + AI callers) | ~1.5 hours |
| Add `KIND_END_TURN` + `end_turn_pending` field + flag clear sites | ~1.5 hours |
| New tests in `test_priority_window.gd` | ~2 hours |

## Critical files

- `engine/engine.gd`
- `engine/engine_state.gd`
- `engine/action.gd`
- `engine/ai/ai.gd` (if AI filters action kinds, needs update for new `KIND_TAP_LAND_FOR_MANA`)
- `docs/DIVERGENCE.md` (mark B6/B7 done after migration completes)
- `reference/html-proto/js/engine.js` (read-only cross-reference for proto patterns)
