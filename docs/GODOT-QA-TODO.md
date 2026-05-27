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

## Slice 3 — Effects refactor (38→~22 atomics)  ·  proto in progress

The big one (`plan-effects-refactor.md`, ~92h, touches every card + the
dispatch table). Proto is being built step-by-step (plan §10). Godot mirror is
**not started**. Proto progress so far:

All additive (legacy handlers untouched; no card uses the new shapes yet —
exercised directly via an exposed `ENGINE.applyEffect` test seam):

- **Step 1 (done):** mass `scope` (`all_creatures`/`all_yours`/`all_opps`) on
  `damage`/`pump`/`removeCreature` via `creaturesInScope()`; `removeCreature`'s
  severity ladder factored into `affectOneCreature()`. `tests/test_effects_scope.js`.
- **`annihilate` verb (done):** rip's no-trigger removal sibling (cease-to-exist:
  no graveyard, no death/leave triggers). `annihilateCard()`.
- **Step 2 (done — primitives):** `targetsForFilter(filter, controller)` (the
  `target()` step's hexproof-checked legal set over the closed `TARGET_FILTERS`
  taxonomy) + the `chooses` effect (selection-by-targeted-player, no hexproof,
  records `ctx.chosen`; `sacrifice`/`annihilate` fall back to it). Structural
  hexproof proven: edict sacrifices a hexproof creature. `tests/test_targeting.js`.
  - **DEFERRED:** wiring a top-level `target` field through the live cast →
    resolution flow (so a migrated single-target card collects its target and
    bare effects operate on it). Pairs with card migration (steps 5/6).
- **`move_card` (done — deterministic subset):** draw/mill/bounce/shuffle-in/
  exile/graveyard-return via selectors `controller_top`/`target`/`self`.
  `tests/test_move_card.js`.
  - **DEFERRED:** battlefield ARRIVAL (reanimate/flicker-return — needs iid-mint
    §3.7 + ETB emit, pairs with flicker decomposition step 8) and prompt-driven
    selectors (`controller_chosen`/`target_player`/`library_search` — need the
    human-prompt/AI-pick infra).
- **`change_control` (done):** control-change core (Mind Control/Threaten);
  `transfer_ownership` delegates to `steal`. `tests/test_change_control.js`.
- **Step 4 (done):** `validateAllCardEffects` boot validation — unknown kinds,
  out-of-taxonomy target/chooses filters, per-kind schema for the new atomics.
  `tests/test_effect_validation.js`.
- **Step 2 KEYSTONE (done — spells):** top-level `target` step wired end-to-end
  through cast→resolution: **(A) resolution** (`resolveTopOfStack` threads a
  `currentTarget` seeded from the target step; `chooses()` replaces it; bare
  effects operate on it), **(B) legality** (`isLegalAction` enforces the
  cast-time hexproof checkpoint via `targetsForFilter`), **(C) enumeration**
  (`getLegalActions` emits one cast per legal target). Casting a synthetic Bolt
  / edict / Pyroclasm through the real path passes. `tests/test_targeting_cast.js`.
  All three inert for legacy cards (only fire when `card.target` is set).

- **Step 2 KEYSTONE wiring COMPLETE across all 3 resolution paths (done):**
  top-level `target` step is now wired through spells (`resolveTopOfStack`),
  triggered abilities (`resolveTrigger` + `triggerHasAnyValidTarget` +
  `pushTriggerOnStack`), and activated abilities (`doActivateAbility` +
  `isLegalAction` + `getLegalActions`). Each: resolution `currentTarget`
  threading (chooses replaces it), cast-time hexproof checkpoint, per-target
  enumeration. All inert for legacy cards. `tests/test_targeting_cast.js`.

- **§8.1 AI-valuation lockstep (done, proto):** single-target spells (the AI
  casts/burns migrated bare-effect spells correctly — scoreMultiTargetSpell +
  scoreSpellTargetForMode recognize a top-level `card.target`; burn lethal
  already worked) AND mass effects (massEffectInfo normalizes legacy
  damageAll/removeAll/pumpAllYours vs new damage/affect_creature/pump+scope;
  spellValueForEffects scope-aware). `tests/test_ai_targeting.js`. The Godot
  mirror (`scoring.gd`/`burn.gd`/`ai.gd`) needs the SAME treatment — this is the
  recurring silent-regression trap; the §7b boot-coverage assertion is the guard.

- **Card migration — TARGETING decomposition DONE (proto, step 6 part 1):**
  `tools/migrate-effects.js` migrated **94 target() steps** across the real pool
  — 42 on-cast (`card.target`), 48 triggered (`trig.target`), 4 activated
  (`ab.target`). Conservative: skips multi-target/modal and any effect with a
  non-controller filter (subtype/keyword/maxTough) the closed taxonomy can't
  express (those kept their filters — no silent loss). Idempotent. Two
  integration fixes it surfaced: makeCard must copy the top-level `target` to
  the runtime instance (else resolution crashes — caught by selfplay), and
  card-text threads the target() step into bare effects. Suite 724/724;
  selfplay 500 clean. `tests/effect_migration_test.js`. **Godot mirror:** the
  same migration over the 31 `.tres` templates, plus the makeCard-equivalent
  (`JsonCardLoader`/`CardResource`) carrying the `target` field.

Still TODO proto — the **kind-COLLAPSE phase** (step 6 part 2): damageAll →
damage+scope, removeAll → removeCreature+scope, pumpAllYours → pump+scope,
weaken → pump(signed), gainControl/steal → change_control, edict →
target(player)+chooses+sacrifice, returnFromGraveyard/shuffleIntoLibrary →
move_card. Engine + AI valuation already support these, BUT each needs a
**card-text lockstep** (describeEffect renders the legacy kinds; the collapsed
shapes — damage+scope "to each creature", pump negative "-N/-N", etc. — need
rendering support). Then step 7 (delete the collapsed legacy handlers + the
§8.1 dead-code purge), `apply_sticker` + sticker pipeline (step 10), mana
deep-clean (§3.9), flicker decomposition (step 8). Also: selfDamageOf
scope:controller (minor) · UI target-pick (part D, browser) · staple
`fireStackEffects` path still per-effect (Stapler-only).

### Godot mirror — major work items (per plan §10/§11)

- [ ] **Mass `scope` on `damage.gd`/`pump.gd` + new `affect_creature.gd`**
  (step 1). Godot already merged `add_counter` into `pump` via `duration`.
- [ ] **`target()`/`chooses()` targeting steps + STRUCTURAL hexproof** (step 2,
  plan §3.5). "Is it targeted?" becomes "does the spell have a `target()`
  step?" — retire any `is_targeted_filter` value-lookup. Hexproof checked at
  `target()` only; `chooses()` and mass `scope` never check it. **Godot has no
  edict/`chooses` path at all** — build the human choose-your-creature prompt
  from scratch (proto reuses its `pendingRipSelect` infra).
- [ ] **New atomics** (step 3): `move_card`, `change_control`, `target`/
  `chooses`, `sacrifice`, `annihilate` (no-trigger sibling), `apply_sticker`,
  signed/`permanent` `pump`. Godot writes most from scratch (~8h). `move_card`
  is the big one (replaces draw/discard/shuffle/return/search/flicker/etc.).
- [ ] **§3.6 last-known-info** snapshot + **§3.7 iid-mint-on-arrival** (inside
  `move_card` for `to_zone=battlefield`). Regression test points at the
  exile-return path, NOT flicker (flicker already mints).
- [ ] **§3.9 mana FULL CONVERGENCE** (decided — option 3): Godot adopts
  land-as-ability *internally*. `JsonCardLoader` emits the tap-for-mana ability
  onto `CardResource` (retire the `mana_produced`/`extraManaColors` read at
  `json_card_loader.gd:209–217`); mana resolution runs the ability path;
  `KIND_TAP_LAND_FOR_MANA` → structural `is_mana_ability`. **Couples with the
  priority-window plan** (the Slice 0 `is_mana_ability` meaningfulness check).
- [ ] **Build-from-scratch on Godot:** sticker system (§3.8), staple synthesis
  (§3.10), splice. Godot has none of these yet — design from the proto
  reference, don't port the proto scars.

### Gotchas (the recurring lockstep trap — applies hard here)

1. **§8.1 AI-valuation lockstep is THE silent-regression class** — and it's
   the same trap that bit the Slice 2 migration three times. When kinds
   collapse (`damageAll`→`damage(scope)`, `removeAll`→`affect_creature(scope)`,
   `edict`→`target;chooses;sacrifice`), Godot's `engine/ai/scoring.gd`,
   `burn.gd` (lethal recognition off `effect.target`/face-damage), and `ai.gd`
   (target_filter reads) MUST become **scope-aware** and **`target()`-step-
   aware**, or the AI silently mis-values the collapsed cards with no crash.
   The plan's **§7b boot-coverage assertion** (every `HANDLERS` kind must
   register a valuation branch AND a card-text branch, else boot `push_error`)
   is the thing that turns this loud — implement it on the Godot side too
   (`engine.gd._ready()`).
2. **Effects need a booted game to test** (they mutate state, unlike the pure
   predicates). Proto exposed an `applyEffect` seam on the ENGINE object for
   tests; Godot's `Effects.resolve_one` is already callable, but tests need a
   board fixture (place CardInstances on `EngineState`, build a `ctx`).
3. **`counter_spell` → `counter`** rename is canonical (standardization branch
   already did Godot); the targeting step is `target(spell)`.

Proto reference for the Godot port lives in `reference/html-proto/js/engine.js`
(`EFFECTS` table, `applyEffect`, `creaturesInScope`, `affectOneCreature`).
