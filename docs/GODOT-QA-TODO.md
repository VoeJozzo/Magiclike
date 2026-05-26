# Godot QA / Handoff — `Refactor` branch

**Purpose.** This branch's coordinated refactor is being executed in an
environment **without a Godot binary**, so all Godot-side (GDScript) work is
written but **not runtime-tested**. The proto (JS) side IS validated against
`reference/html-proto/tests/run_all.js` (482 assertions) + `selfplay_harness.js`
as it's written. This file is the checklist for a future instance running in a
**Godot 4.6-equipped** session: verify the items below, reconcile tests, fix
what the runtime surfaces.

Headless Godot invocation (per project convention):
```
<godot> --headless --quit res://tests/test_<name>.tscn
```
Run every `tests/test_phase*.tscn` plus `tests/test_priority_window.tscn`.

---

## Slice 0 — Priority-window (B6/B7)  ·  commits 6bae434 → 8a405fd

**Status:** logic complete, **0% runtime-verified.**

### Must verify
1. **Run `tests/test_priority_window.tscn`.** It covers the deterministic
   predicate logic (`_can_pay_potential`, `_has_no_meaningful_action`,
   `_should_auto_pass`, `_legal_end_turn`, end-turn enumeration). These should
   pass as written; if not, the bug is in `engine/engine.gd`'s new predicates.
2. **Reconcile the 8 existing phase tests** (`test_phase1..5c`). B6 changed
   settle behavior: a spell now **auto-resolves** as soon as its caster has no
   further meaningful action (empty hand etc.), instead of sitting on the stack
   until an explicit pass. So any test that did `cast → assert stack.size()==1
   → explicit pass → assert resolved` will fail at the intermediate assertion.
   - **`test_phase1` is the worked example:** after casting Bolt with an empty
     hand, the Bolt auto-resolves within the same `execute_action(cast)` call
     and the turn fast-forwards. Update the assertions to the post-fast-forward
     reality (assert `opp.life == 17` and graveyard directly; drop the
     `stack==1` intermediate and the now-redundant explicit pass).
   - Do this **with the runner output in hand** — do not guess end-states.
   - The plan (plan-priority-window-refactor.md §6 step 3) anticipated this:
     "tests may show different settle behavior… update any test that explicitly
     walked through priority." The "tests pass unchanged" line in step 5 is the
     one that's wrong.
3. **Encode the [GODOT-QA] behavioral scenarios** listed at the bottom of
   `tests/test_priority_window.gd` (B7 end-turn cascade, COMBAT_ATTACK
   empty-attacker commit, trigger-interrupt-then-resume, flag-clear-on-UNTAP,
   re-engagement clear). They need live observation to assert correctly.
4. **Stack-overflow guard check.** The auto-pass is driven iteratively from
   `_settle_state` specifically to avoid call-stack recursion. Sanity-check a
   dead/locked AI-vs-AI position (run `test_phase5c` a few times) — it must not
   crash or hit the `safety` cap (200) under normal play.

### Deviations from the plan's pseudocode (all faithful to proto — verify intent)
- **Auto-pass is iterative, not recursive.** `_open_priority_window` only opens
  the window; `_settle_state`'s loop does the auto-passing (mirrors proto
  `step()`). The plan's recursive `_dispatch_action(pass)` tail in the helper
  would overflow the stack on fast-forward / dead positions.
- **`_open_priority_window(player_key, fresh)`** — `fresh=false` only at the
  pass-to-other-player site (engine.gd `_do_pass_priority`), so the prior
  player's pass isn't wiped (else both-passed never fires → priority loops).
- **`_has_no_meaningful_action` folds *potential* mana** (`_can_pay_potential`,
  proto `canPayPotential` parity). Godot's `_legal_cast_spell` only sees floated
  mana, so without this a player who must tap a land first is wrongly skipped —
  which would break `test_phase1` outright.
- **Init sites kept as direct `priority_player_key = "you"` assignment** (not
  routed through the helper): auto-pass must never fire at game start, and the
  active player always holds opening priority. Verify game-start isn't skipped.

### Still TODO (not built)
- **UI wiring for a human "End Turn" button.** The engine action
  (`KIND_END_TURN` / `Action.make_end_turn`) and `get_legal_actions` entry
  exist, but `scenes/game/game_board.gd` has no button/keybind to issue it.
  Wire one (and confirm B7 fast-forward feels right interactively).

---

## Slice 2 — Composable predicates (E1/E2)  ·  proto commits from c2029c9

**Proto (JS) side is being built and validated here** (Node suite). The Godot
side is **not started** — it must mirror what lands on proto. Track proto
progress in `plan-zone-change-and-composable-predicates.md` §11; the Godot
mirror of each step:

- [ ] **Atomic predicate registry in `engine/predicates/predicates.gd`** — port
  the 12 primitives + `evaluate()` walker + `_parse_call`/`_split_args`/
  `_coerce_arg` (plan §5–§6 has GDScript pseudocode; proto impl in
  `reference/html-proto/js/triggers.js` is the reference). Keep the existing
  `opp_lost_life_this_turn` working in parallel until card migration.
  - Note: proto atomics take `(ctx, args)` with `ctx.who` = source controller;
    Godot's plan signature is `(state, source, event, args)` resolving the
    player from `source.controller_key`. Same logic, per-engine signature.
- [ ] **Emit `card_zone_change`** alongside `card_etb`/`card_dies` (plan §3 / §11
  step 3) — `_run_sbas`, `_do_play_land`, `_resolve_spell_entry`. New unified
  event shape: `{kind, subject_iid, subject_card, controller, from_zone, to_zone, killed_by_iid?}`.
- [ ] **Boot-validator rewrite** — recursive walk over the new `condition` field
  (plan §8). Mirror the proto validator added in step 4.
- [ ] **Migrate Godot's 2 trigger cards** (`pyromaniac.tres`,
  `bloodlust_berserker.tres`) to `event: card_zone_change` + composed
  `condition` (plan §7 / §4.1). Run `test_phase4*` to confirm single-trigger
  semantics (no double-fire during the both-events cutover window).
- [ ] **Remove legacy** `self_only` / `condition_predicate` / `card_etb` /
  `card_dies` from Godot once both engines are migrated (plan §11 step 8).

**Proto reference for the Godot port:** atomics + evaluator + parser are in
`reference/html-proto/js/triggers.js` (search `ATOMIC_PREDICATES`,
`evaluateCondition`, `_parseCall`); unit tests in
`tests/composable_predicates_test.js`, `tests/trigger_migration_test.js`.

### Gotchas discovered during the proto build (replicate on the Godot side)

These weren't in the plan; the proto implementation surfaced them. The Godot
mirror will hit the same ones.

1. **`condId`/`event`-string had downstream consumers beyond trigger
   matching.** Removing/changing them broke THREE systems: (a) card-text
   trigger preambles, (b) AI trigger-frequency valuation (both keyed on
   `condId`), and (c) AI ETB-detection heuristics that matched
   `trig.event === 'cardEntersBattlefield'` (flicker / exileUntilEOT / flash
   valuation). Fixes: a centralized `triggerArchetype(trig)` classifier and a
   `triggerFiresOnEnter(trig)` helper (proto: `js/triggers.js`) that recover
   the classification from `event`+`condition`. Godot has the analogous
   coupling — `scenes/card.gd` oracle text, `engine/ai/scoring.gd`, and any
   AI code that pattern-matches `card_etb`/`card_dies` event kinds. **Audit
   every `condId`/`condition_predicate`/`event ==` read before deleting.**
2. **The plan's "fold `noSelfCascade` into an `another_card` term" is WRONG.**
   `noSelfCascade` guards a generated trigger against re-firing on its OWN
   created tokens — keyed on the event's *causing source*, not the subject. A
   created token has a different iid, so `another_card` (subject check) does
   NOT stop the cascade. Keep `noSelfCascade` as a field, and carry a
   `source_iid` (the causing card) on the unified zone-change event so the
   guard works. Proto: `emitZoneChange(..., sourceIid)` + the guard in
   `evalTriggerCondition`. Self-play `runaway=0` is the regression signal.
3. **`card_moves(battlefield, X)` needs the real destination zone.** A bounced
   creature must emit `battlefield→hand`, not `→graveyard`, or migrated "dies"
   triggers wrongly fire on bounce. Don't zone-detect after the move — a dead
   token never reaches the graveyard array. Thread an explicit `destZone` from
   each leave-site (proto: `emitLeavesBattlefield(card, ctrl, destZone)`).
4. **Simultaneous mutual kills need the death-batch as extra-sources** on the
   zone-change emit, or migrated `thisKillsCreature` (Sengir/Endomorph) misses
   same-sweep kills (the other creature is already off the battlefield).
5. **Life-LOSS emission is deferred** — `is_life_loss` exists as a primitive
   but no `life_changed(delta<0)` is emitted yet (no current card needs it).
   Wire it when the first loss-trigger card appears.
6. **`anyCardDies` (Blood Artist) is creature-only.** The plan's §2
   decomposition (`[card_moves(battlefield, graveyard)]`) is wrong — the legacy
   `cardDies` event was emitted creature-only, so the faithful condition is
   `[card_is_creature, card_moves(battlefield, graveyard)]`, else it fires on
   lands/artifacts dying. (`thisDies`/`anotherCreatureDies`/`thisKillsCreature`
   are already creature-correct: `this_card` implies creature, and the other
   two carry `card_is_creature`.)

**Proto Slice 2 is fully shipped (steps 1–8).** The proto code in
`reference/html-proto/js/{triggers,engine,cards,trigger-generator,card-text}.js`
+ `tools/migrate-triggers.js` is the reference implementation for the Godot
mirror. Tests: `composable_predicates_test.js`, `trigger_migration_test.js`,
`trigger_generator_test.js`.

<!-- Append new slices' Godot items below as they're written. -->
