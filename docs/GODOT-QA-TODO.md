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

## Traps we already hit on the proto side (don't re-discover them)

The Godot mirror does the **same** Slice 3 migration. These are the failure
modes that actually bit during the proto refactor — each cost a reactive
fix-after-the-user-noticed cycle. Front-load them.

1. **The top-level `target()` step is a distributed invariant.** Moving targets
   off per-effect `target` onto a top-level step (with bare effects) broke
   **every** reader that still asked `effects.some(needs_target)`: the cast flow,
   the trigger-target prompt, the castable-card highlight, and (cousin) the AI
   cast scorer. On proto these were found one at a time. **Before migrating, grep
   every site that reads a card/ability/trigger's targeting and convert them
   together.** Proto's fix of last resort was one canonical API —
   `objectNeedsTarget` / `primaryLegalTargets` / `probeTargetsForObject` in
   `engine.js` — that all consumers route through. Build the Godot equivalent
   (one place that answers "does this need a target / what are its legal
   targets," covering top-level `target`+`target_filter`, ability `target_slots`,
   and legacy per-effect) **from the start**, and route the cast UI, the
   playable-highlight, and the trigger prompt through it.

2. **The AI-valuation lockstep (§8.1) is wider than one function, and coverage
   checks membership not correctness.** Collapsing/renaming/retargeting effect
   kinds silently zeroed the AI's value for them — boss removal (`ripPermanent`,
   `symmetricize`, `destroyAndStickerSlot`, bounce/exile `move_card`), mind
   control (`change_control`), and the drain cards all stopped being cast/scored.
   Per-kind value lives in **several** scorers (proto: `spellValueForEffects`,
   `abilityValue`, `scoreSpellTargetForMode`, `pickBestActivation`,
   `pickBestTriggerTarget`, `scoreUntargetedSituation`) — Godot has the analogous
   spread across `scoring.gd`/`burn.gd`/`ai.gd`. The §7b coverage assertion only
   caught "kind has no branch in the ONE scorer I wired it to"; it did **not**
   catch a kind missing from a *different* scorer, nor a branch that handled the
   sign/shape wrong (signed `gain_life`). So: (a) when a kind changes, update
   *every* scorer, and (b) treat a green coverage check as "membership in the
   sets I declared," not "the AI values this correctly."

3. **"Mechanism built" ≠ "migration done."** Signed `gain_life` shipped a full
   version before any card used it; the drain cards stayed `damage`. Same with
   the splice merge-math (shared) vs the slot-write (still duplicated), and the
   `target_filter` taxonomy (added) vs the cards (unmigrated). A foundation with
   no callers looks finished and isn't — when you build a mechanism, migrate the
   cards onto it in the same pass or it rots.

4. **Green Node tests say nothing about the UI/runtime layer.** Every
   targeting-*UI* regression (auto-selected targets, missing castable glow)
   sailed through a fully-green proto suite because the harness stubs the DOM.
   Godot's headless tests have the same blind spot for anything that needs the
   scene tree / input. Verify cast-targeting, highlights, and prompts **in a
   running game**, not just via the phase tests.

5. **A test can encode the bug.** Proto's `test_targeting_cast` asserted the
   buggy auto-pick ("so the AI auto-pick targets it") as correct, and passed
   happily. When porting tests, check that each one asserts *intended* behavior,
   not whatever the code happened to do.

6. **Output that looks wrong is often faithful to wrong data.** The drain cards
   rendering "deal damage" was the card-text generator correctly describing a
   `damage` effect — the bug was upstream in the card data. Trace
   renderer-vs-data before "fixing the text."

---

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
  recurring silent-regression trap; the §7b boot-coverage assertion (now built,
  see below) is the guard.

- **§7b boot-coverage assertion (done, proto):** `effectCoverageReport()`
  (engine.js) partitions every `EFFECTS` (HANDLERS) kind into `VALUED_EFFECT_KINDS`
  (has a real valuation branch) vs `UNVALUED_EFFECT_KINDS` (consciously unscored)
  and probes card-text for the `[kind]` debug sentinel (`TEXT_IDIOM_ONLY` lists
  the kinds rendered only inside multi-effect idioms). Add/rename/remove a handler
  and forget the consumer → the partition breaks → `test_effect_coverage.js` fails
  and `main.js` boot `console.warn`s. The §12.12 regression registers a throwaway
  handler and asserts it's flagged. **Godot mirror:** build the equivalent in
  `engine.gd._ready()` as a `push_error` — register the kinds `scoring.gd`/`burn.gd`
  and `scenes/card.gd` (oracle text) handle into coverage sets, check against the
  `HANDLERS`/`EFFECTS` keys at boot. This is the single most important guard to
  port BEFORE the Godot valuation/text migration, not after.

- **Card migration — TARGETING decomposition DONE (proto, step 6 part 1):**
  `tools/migrate-effects.js` migrated the target() steps across the real pool —
  on-cast (`card.target`), triggered (`trig.target`), activated (`ab.target`).
  Idempotent. Two integration fixes it surfaced: makeCard must copy the top-level
  `target` (and `target_filter`) to the runtime instance (else resolution crashes
  — caught by selfplay), and card-text threads the target() step into bare
  effects. `tests/effect_migration_test.js`. **Godot mirror:** the same migration
  over the 31 `.tres` templates, plus the makeCard-equivalent
  (`JsonCardLoader`/`CardResource`) carrying the `target` + `target_filter` fields.

- **Top-level target() RESTRICTIONS DONE (proto, v2):** the closed taxonomy now
  carries an optional **`target_filter`** beside `target` — the matchFilter keys
  the taxonomy can't name (`notColor`, `hasKeyword`, `subtype`, `tapped`,
  `maxTough`/`minTough`, `maxPower`/`minPower`, `notToken`). `targetsForFilter`
  merges it into the cast-time enumeration (so the hexproof checkpoint honors it),
  and render's `isValidTargetCreature` was rewritten to handle the full taxonomy
  (`your_creature`/`opp_creature`/etc.) + route restrictions through
  `matchFilter`, so highlight == cast legality. Five previously filter-carrying
  cards now migrate (doomBlade, ravenousPlague, smite, vinestrangle, naturalize)
  plus 3 triggers + 2 abilities. Only `steal` stays per-effect — its target is
  `permanentOrSpell`, a target *kind* outside the taxonomy (like Stapler), not a
  restriction. `tests/test_target_restrictions.js`. **Godot mirror:** thread a
  `target_filter` Dictionary through `CardResource` + the targeting legality/
  enumeration + highlight, mirroring `targetsForFilter(filter, who, restrict)`.

- **Kind-COLLAPSE — mass + weaken DONE (proto, step 6 part 2a):** 17 effects
  collapsed via migrate-effects.js — damageAll → damage+scope(all_creatures),
  removeAll → removeCreature+scope, pumpAllYours → pump+scope(all_yours), weaken
  → pump(signed). Card-text lockstep done (signedStat for "-N/-N"; scope phrases
  "to each creature" / "creatures you control get…"). 0 cards use the legacy
  mass/weaken kinds. Suite 732/732; selfplay 500 clean. `effect_migration_test.js`.

- **Kind-COLLAPSE — change_control + move_card DONE (proto, step 6 part 2b):**
  gainControl/steal → change_control (3 cards), returnFromGraveyard/
  shuffleIntoLibrary → move_card (4 cards). Each with strict before==after
  parity (card-text, spellValueForEffects, scoreSpellTargetForMode). 0 cards
  use the legacy kinds. Suite 740/740; selfplay 500 clean. **All
  straightforward (non-structural, non-engine-gated) collapses are now done.**

- **addCounter → permanent pump DONE (proto):** built pump `duration:permanent`
  (permPower/permTou), collapsed 9 addCounter effects (8 cards), full card-text
  + valuation parity. addCounter handler kept (MERCURIAL_TRIGGER_POOL uses it).

**Step 7 part 1 DONE (proto):** deleted ~175 lines of dead EFFECTS handlers
(damageAll, removeAll, pumpAllYours, weaken, returnFromGraveyard,
shuffleIntoLibrary, both gainControl defs incl. the decision-11 dead
duplicate). steal handler kept (change_control delegates). Suite 744/744;
selfplay 500 clean, no "Unknown effect" warnings.

**Step 7 part 2 DONE (proto):** removed the dead card-text (8) +
spellValueForEffects (8) + scoreSpellTargetForMode (3) cases + the
massEffectInfo legacy branches + the dead `steal` instant-response check.
**This surfaced + fixed a latent §8.1 regression**: the weaken collapse
(→ negative pump) had silently broken the AI's debuff valuation (negative pump
hit the pump scoring case, which returns -100 for opp creatures), so the AI
stopped casting sicken-style debuffs. Fixed: the pump scoring case routes
negative deltas to the weaken (debuff-opp) valuation. **Lesson for the Godot
mirror: verify scoreSpellValue/scoring parity, not just rendering, for every
collapse.** Suite 742/742; selfplay 500 clean.

**Step 7 leftover (minor, OPTIONAL):** the dead legacy kind names still appear
in a few data tables as harmless no-ops (EMPOWER_FIELDS, draft FIELD_VALUE_BY_KIND
weights, render kind-lists, CREATURE_EFFECT_KINDS). Removing them would subtly
shift empower draft-weighting for the collapsed mass cards (damageAll weight 5 →
damage weight 4) — a tiny §8.1 tail. Either leave them (harmless) or, for strict
parity, teach draft.js's empower weighting to read `scope` first.

**edict → target(player)+chooses+sacrifice DONE (proto).** 1 card (diabolicEdict):
`target:'player'` + `[chooses(creature), sacrifice]`. AI valuation moved into
`scoreSpellTargetForMode`'s `sacrifice` case (target opp player, never self,
value = 10 + lowest-creature kill-value). Golden test asserts the shape.

**restrict → grant_keyword DONE (proto).** 1 card (pacifism): `target:'creature'`
+ `[grantKeyword(defender), grantKeyword(no_block)]`. New HIDDEN `no_block`
keyword supplies the "can't block" half (defender = "can't attack");
`canCreatureBlock` honors it, and `keywordPreamble` + the render pip loop hide
it. Pacifism keeps `customText` (preserves authored text AND splice
eligibility — `special:true` would disable splicing). AI values the defender
grant as the lockdown debuff. **Godot mirror:** add a `no_block` keyword +
block-legality check; grant-revocation-on-source-leave is N/A for a Sorcery
(grants are permanent, like the legacy restrict).

**draw → move_card DONE (proto).** All 22 draw effects (22 cards) are
controller-draws (zero targeted-player draws in the pool), so all collapse to
`move_card(library→hand, controller_top, amount)` via migrate-effects.js. §8.1
lockstep across the broad surface: card-text (draw idiom + the `[draw,discard]`
loot pattern), `spellValueForEffects` + `abilityValue` (parity), the AI
instant-response heuristic, the activated-ability draw scoring, and the
controller ability label — all recognize the library→hand shape inline (same
style as the returnFromGraveyard/shuffleIntoLibrary branches). **The legacy
`draw` EFFECTS handler + its card-text/valuation cases STAY** — the runtime
trigger generator (Mercurial pool, `engine.js` `MERCURIAL_TRIGGER_POOL` +
`trigger-generator.js` drawSelf) still emits `draw` (same precedent as
addCounter's pool retention). Golden test: 22-card collapse + draw in the
card-data GONE list. **Godot mirror:** same migration over `.tres`/JSON + the
`abilityValue`/`scoring.gd`/`burn.gd` draw reads must learn the move_card shape.

**flicker → move_card DONE (proto).** Cloudshift (the only flicker card) is now
two back-to-back move_cards — `move_card(battlefield→exile)` then
`move_card(exile→battlefield)` — both on the top-level `your_creature` target
step (plan §4.1 line 763: the synchronous variant, no `schedule_delayed`, no B4
dependency). The flicker EFFECTS handler + its card-text/AI/spellValue cases are
deleted; consumers recognize the bf→exile shape (card-text renders the
one-sentence flicker idiom via a pattern like the loot pattern;
`scoreSpellTargetForMode` routes the ETB-re-fire valuation when the effects also
contain the exile→bf return). `test_flicker.js` casts cloudshift through the
real resolution path. **Two things the Godot mirror MUST replicate:**
1. **ETB double-fire fix in the arrival path.** Proto's `placeCardOnBattlefield`
   pushed the card onto the battlefield AND passed it as `emitZoneChange`
   extraSources, so `emit()`'s battlefield walk + the extraSources walk both
   matched the arrival → the ETB trigger fired TWICE. Fixed by dropping the
   redundant extraSources (arrivals are already on the battlefield; extraSources
   is only for cards that have LEFT a zone — dies/leave). Godot's arrival emit
   has the same shape; do NOT pass the arriving card as an extra source.
2. **DELIBERATE behavior change (user-approved):** the bf→exile half emits
   `emitLeavesBattlefield`, so "leaves play" triggers now fire on flicker
   (MTG-correct; the old monolith skipped them). Only Archdemon Bargains has
   such a trigger in the pool.

**exileUntilEOT → move_card + schedule_delayed DONE (proto).** Otherworldly
Journey now resolves as a top-level `creature` target step plus
`move_card(battlefield→exile)` and `schedule_delayed(when:end_step, effects:[
move_card(exile→battlefield)])`. Proto's `schedule_delayed` registers a delayed
trigger on `G.delayedTriggers` (`effect:'deferredEffects'`) that the CLEANUP
processor fires at end step, applying the wrapped effects on the captured
target. The end-step return re-enters via `placeCardOnBattlefield` (fresh iid,
§3.7; re-fires ETB — the monolith skipped this) and routes opp-owned creatures
to their OWNER's battlefield (`placeCardOnBattlefield` uses `card.owner`, and
`move_card` searches both players' exile zones). `test_exile_until_eot.js`
covers return-with-fresh-iid + ETB re-fire, token-ceases, and opp-owner routing.
**Godot mirror needs B4** — a delayed-trigger queue on `EngineState` drained at
the end step. Until B4 lands, Godot may keep a monolithic `exile_until_eot`
handler; the cross-engine wire shape (`schedule_delayed`) is the target.

**search → move_card DONE (proto).** Both search kinds (10 cards) fully
collapse (no generator emits them → handlers removed). New move_card branches:
`library→hand` + `library_search` selector (prompt-driven creature tutor) and
`library→battlefield` (auto land-fetch, `post.tap`). They delegate to extracted
helpers (`searchLibraryToHand`, `fetchLibraryToBattlefield`) carrying the exact
prior behavior — human → existing `pendingSearch` prompt (the `doSearchPick`/UI
completion path is UNCHANGED), AI → auto-pick. **Godot mirror:** the
`library_search` selector + filter; preserve the land-fetch-is-auto /
creature-search-prompts split.

**discard → move_card DONE (proto, partial).** All 14 card-data discards →
`move_card(hand→graveyard)`. Controller discards keep `target:'self'`; targeted
discards (duress/mindrot/graveCurate/hypnotic) stay bare under a top-level
`player` target step. Shared `discardFromHand` helper (human → existing
`forcedDiscard` prompt UNCHANGED; AI → cheapest) is called by both the move_card
branch and the **retained** legacy `discard` handler — the Mercurial generator
(`discardOpp`) still emits `discard`, same precedent as draw. §8.1 lockstep:
card-text (discard idiom + the loot pattern is now move_card-draw/move_card-
discard), `scoreSpellTargetForMode` (targeted-player discard), the AI
instant-response + ability scoring, `spellValueForEffects`, and
`pickBestTriggerTarget` (the dies/attacks discard triggers auto-target the
opponent). **Godot mirror:** the `who`-resolution (`discardWho`: explicit player
target else controller) + the same human-prompt/AI-pick split.

**Key de-risking note for the Godot mirror of discard/search:** route move_card
through the SAME pending-prompt mechanisms (`forcedDiscard`/`pendingSearch` or
their Godot equivalents) the legacy handlers used, so the UI completion path
(the `discard`/`searchPick` actions + the search modal) is behaviorally
unchanged — only what SETS the pending flag changes.

**§3.9 mana deep-clean DONE (proto).** Lands now produce mana through a
tap-for-mana ability (Llanowar-Elves model); the `extraManaColors` parallel
model is fully retired. Every land's card.json carries
`abilities:[{cost:{tap}, effects:[{addMana, …}]}]` — basics use fixed
`amounts`, City of Brass uses the new `choose:'any'` form (a dual would use
`choose:['W','U']`). The `mana` field is KEPT as the primary-color label
(deck-color / draft / single-pip display); production reads from the ability via
`landProducibleColors`. `doTapLandForMana`/`tapSourceProducing`/`canPayPotential`
collapsed their land-vs-dork branch into one ability path (summoning sickness
gates creature dorks only). Staple-merge builds/merges tap-abilities; landColor
stickers extend the ability (`amounts`→`choose`) instead of `extraManaColors`;
card-text suppresses a basic land's intrinsic tap-ability (empty rules) but
renders City of Brass / duals. New top-level helpers `manaAbilityOf`,
`manaEffectColors`, `manaAbilityForColors`, `addColorToManaAbility`,
`landProducibleColors`. `test_mana.js` (14 checks).

**Deliberate scope note:** the proto KEEPS the `mana` field as a derived/label
field rather than fully deleting it from card.json (the plan's "rendering reads
the ability's color set" is satisfied in spirit — production is ability-only;
`mana` is just a color label, validated to be in the ability's colors by
`test_mana.js`). Fully deleting `mana` is a mechanical ~15-site follow-up across
draft/render/controller, deferred as low-value. The §3.10 multi-color staple
rejection is also left in place (lift it there now that `choose` exists).

**Godot mirror — §3.9 FULL CONVERGENCE (option 3, still TODO):** `JsonCardLoader`
emits the tap-for-mana ability onto `CardResource` (retire the
`mana_produced`/`extraManaColors` read at `json_card_loader.gd:209–217`); Godot's
mana resolution runs the ability path (same as a dork); `KIND_TAP_LAND_FOR_MANA`
→ a structural `is_mana_ability` classification (couples with the priority-window
plan's auto-pass meaningfulness check). Add the `add_mana` choose form. The proto
helpers above are the reference. Card data is already migrated (shared wire), so
Godot just needs to consume the ability shape natively.

**§3.10 staple-synthesis cleanup DONE (proto).** `mergeStapleInto` now dispatches
on the STAPLE's type (leveraging the `canonicalSplicePair` hierarchy that picks
the base) instead of an order-dependent 7-branch chain — three behaviors: staple
Creature → body merge; staple Land → permanent base gains the land's tap-ability
(Cr+Ld appends, Ld+Ld / mana-dork base merges colors); staple Spell → permanent
base gets an ETB trigger (Cr+Sp and Ld+Sp were byte-identical, collapsed), spell
base concats (Sp+Sp). Impossible pairs `throw` instead of degrading to Sp+Sp.
Deleted the dead Sp+Ld branch; lifted the multi-color-land staple rejection (City
of Brass is now a valid staple onto any base → choose ability); replaced the
hand-maintained `merged` field-copy with a JSON deep clone (new schema fields
carry automatically). Removed `appendMergedText` — `describeCardText` is now the
single source of card text (verified no consumer reads a synthesized template's
`.text`: makeCard + the staple preview both regenerate, and special/customText
cards can't be staple bases/staples). **Godot mirror:** Godot has no staple system yet — design from this
proto reference (staple-type dispatch + the §3.9 tap-ability merge), don't port
the old order-dependent chain.

**§3.8 sticker pipeline — SUBSTANCE DONE (proto).** "Decision 7 reversed": the
parallel `applyBalancerOverrides` channel is deleted and every Balancer effect
flows through one sticker pipeline.
- **Parameterized stickers:** a slot/card sticker entry is now a registry id
  (string) OR an inline `{kind,...params}` descriptor — `resolveSticker()`
  normalizes both; run.js migration-prune keeps inline ones; `applyStickerToSlot`
  accepts them. New kinds `cost_mod` (signed, generic-floored) + `set_color`.
- **embargo/bleach → `[apply_sticker, move_card]`** via the new `apply_sticker`
  effect (applies an inline sticker to the target's slot + runtime card). Their
  dedicated handlers + inline `RUN.save` are gone — persistence is the sticker
  API's job.
- **symmetricize → additive snapshot:** `doSymmetricizeChoice` records the
  deltas to reach N as `stat_boost` + `cost_mod` stickers (NOT a persistent
  P=T=cost=N clamp). `symmetrizedTo` sentinel + the slot.symmetricized/
  colorOverride/extraCost fields + the `slotMeta` makeCard param are all gone.
- **Pipeline dedup:** both apply paths share `applyStickerKindEffect`.
- **costReduction → signed `cost_mod`** unification (one cost-change kind).
- **empower:** `EMPOWER_FIELDS` is the single source, aligned to the
  post-collapse effect set (move_card-draw empowerability restored).
- **empower addressing-shape — RESOLVED (skip the rewrite, harden the seams):**
  the positional → semantic-identity *addressing* change is a deliberate skip:
  a global Nth-of-kind scheme has the SAME staple-fragility as positional
  (inserting a staple trigger of kind-K shifts the Nth of base *ability* effects
  of kind-K), so it's net-neutral and positional + `remapEmpowerRollForStaple`
  is retained. The plan's *other two* empower asks ARE done: **additive deltas**
  (`applyEmpowerRoll` is `cur + amount`) and **deterministic persistence** — and
  the latter surfaced a real bug: `RUN.load()` backfilled missing `empowerRolls`
  (and subtype/rename/map migrations) in memory but only re-saved when stale
  stickers were pruned, so a buffed stat re-rolled (flickered) on every load.
  Fixed with a `dirty` flag covering all load-time migrations.
  `test_empower_persistence.js` locks both seams (backfill idempotency + the
  staple remap).
- **snake_case DONE:** sticker kinds (`statBoost`→`stat_boost`,
  `landColor`→`land_color`) + IDs (`plus1plus1`→`plus1_plus1`,
  `costMinus1`→`cost_minus_1`, `landColor_W`→`land_color_w`). A
  `STICKER_ID_RENAMES` map in `RUN.load()` migrates legacy save slots (no
  sticker loss); `test_balancer` covers it.
- **`grant_mana_ability(color)` — DONE:** generalizes the old land-only
  `land_color` sticker to grant any permanent a `{T}: add {color}` ability
  (folds into an existing tap-ability or creates one). `test_mana` covers it.
- **Godot mirror:** Godot has no sticker layer — build from this proto reference
  (one pipeline, inline parameterized stickers, apply_sticker effect).

Remaining collapse:
- **exileUntilEOT → move_card decomp — DONE.** Otherworldly Journey resolves as
  `target()` + `move_card(bf→exile)` + `schedule_delayed(end_step,
  move_card(exile→bf))`. The end-step return re-mints a fresh iid (§3.7) and
  re-fires ETB — which the old monolith skipped; opp-owned creatures route to
  their owner. `test_exile_until_eot.js` covers it. (The Godot mirror needs the
  B4 delayed-trigger queue — see the Godot section.)

### Proto side — COMPLETE (Slice 3)

The proto effects refactor is done. The earlier "still pending" list here is
resolved:
- **apply_sticker + sticker pipeline (§3.8), mana deep-clean (§3.9), staple
  cleanup (§3.10)** — DONE (see the sections above).
- **Step 7 dead-handler purge** — DONE (no legacy EFFECTS handler remains; the
  empower/draft/render dead-kind tables were refreshed in §3.8 + the valence
  cleanup; the dead `weaken`/`flicker`/`exileUntilEOT` entries in
  `CREATURE_EFFECT_KINDS` were also pruned).
- **Step 7b coverage assertion** — DONE (see the §7b note above:
  `effectCoverageReport()` + `test_effect_coverage.js`, the partition guard).
- **Step 12 Stapler `noop`→`targetSlots`** — DONE. The `noop` slot-marker effect
  is gone (handler + valuation + card-text case deleted). Stapler's ability now
  declares `targetSlots: [{spliceableBase},{spliceableStaple}]` — an ability-level
  array of per-slot target specs. Legality (`isLegalAction`), the controller pick
  flow (`objNeedsTarget`/`probeTargetsFor`/`slotsNeededForPending`), and the AI
  enumeration skip all read it; `applyInGameSplice` reads `ctx.allTargets[0/1]`
  unchanged. `migrate-effects.js` gained an idempotent `stripNoopSlots` pass.
  `test_stapler_target_slots.js` covers the 2-target requirement + per-slot filter
  + resolution. The other 5 multi-target cards (twinStrike/branchingBolt/drainLife/
  rootsAndBranches/swordAndSorcery) still use per-effect `targetSlot` — they work
  and were left untouched; folding them onto ability-level `targetSlots` is an
  optional unification, not a fix. **Godot mirror:** add a `target_slots` field to
  the activated-ability schema (`data/card_resource.gd`) for Stapler-style abilities.
- **Browser target-pick (§3.5 part D)** — DONE. The human cast flow
  (`clickHand` + the activated-ability picker) now honors the top-level
  `target()` step via `objNeedsTarget`/`probeTargetsFor`, and the render slot
  helpers via `pendingTopTargetFilter`. Covered by `test_ui_targeting.js` (drives
  the real CONTROLLER handlers under the stubbed DOM).
- **`selfDamageOf` scope** — verified a non-issue (self-damage is `target:'self'`
  player recoil; mass `scope` hits creatures, not the caster).
- **PROTOCOL.md / DIVERGENCE.md** — updated to the post-refactor reality (§10
  step 13). **SPEC.md intentionally NOT updated** — it's the *Godot* runtime
  contract; it changes when the Godot mirror lands, not before.

Remaining on the proto side — NONE. All Slice 3 step 0–13 items are landed and
test-gated, including the splice harmonization that was previously deferred:
- **Splice duplicate-pathway harmonization (steps 0 + 11) — DONE.** The merge
  math + assembly that was duplicated between `RUN.applySplice` (reward-time, slot
  data) and `EFFECTS.applyInGameSplice` (in-game Stapler, runtime cards) is now one
  shared pure core, `mergeSpliceData(base, staple)` in `engine.js` (module scope,
  beside `remapEmpowerRollForStaple`). Each caller passes its slot-shaped parts
  (the reward path from `slot.*`, the in-game path from `card.*` /
  `card.stapledFrom.stapledTpls`) and applies the returned `{stapledTpls, stickers,
  empowerRolls, subtypeRolls, permaBuffs, bonusTrigger}` its own way — the reward
  path writes the slot + saves; the in-game path layers the runtime-card rebuild,
  slot mint, and combat-state transfer on top. Rather than the plan's
  `applySpliceCore(baseSlotIdx, stapleSlotIdx, opts)` sketch (which assumed both
  paths key off slot indices — they don't; the in-game path operates on
  battlefield cards), the shared unit is the pure data-merge, which is the part
  that was actually duplicated. Side benefit: the reward path now preserves the
  staple's `subtypeRolls` (it silently dropped them before). `test_splice_core.js`
  unit-checks the core AND proves the two pathways produce identical merged slot
  data for the same two cards. (The `fireStackEffects` path remains Stapler-only.)
  **Godot mirror:** Godot has no splice/staple system yet — build from this
  reference, with the merge math as one shared helper from the start.

The previously-deferred four are all landed (test-gated):
- `exile_until_eot` decomposition — DONE (`test_exile_until_eot.js`).
- empower addressing-shape — RESOLVED (rewrite skipped as net-neutral; the
  additive-delta + deterministic-persistence asks done, persistence bug fixed;
  `test_empower_persistence.js`).
- `grant_mana_ability` generalization of `land_color` — DONE (`test_mana.js`).
- D4 `gain_life` signed-delta redesign — DONE (`test_signed_life.js`).

Everything else below is the **Godot mirror** (separate Godot-equipped session).

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
- [ ] **Effect-kind dispatch keys are now snake_case (DONE on proto).** The
  card-data-Part-2 sweep renamed every camelCase effect kind in both card.json
  and the JS `EFFECTS` table to snake_case (`gain_life`, `add_mana`,
  `remove_creature`, `create_tokens`, `grant_keyword`, `fight_target`,
  `rip_permanent`, `apply_in_game_splice`, `destroy_and_sticker_slot`,
  `endomorph_absorb`, `bargain_sticker_self/other`, `add_counter`). The card.json
  is now one snake_case wire both engines read directly. The same sweep also
  snake_cased **keywords** (`first_strike`, `double_strike`) and **target
  filters** (`permanent_or_spell`, `graveyard_creature`); events + predicate ids
  were already snake from Slice 2. **Godot side:** `Effects.HANDLERS` already uses
  snake_case, so it Just Works via passthrough — and **all four** remap tables
  (`_EFFECT_KIND_REMAP`, `_EVENT_KIND_REMAP`, `_KEYWORD_REMAP`,
  `_TARGET_FILTER_REMAP`) are now dead for the live vocabulary and should be
  **deleted** per the plan (`plan-card-data-unification.md` Part 2);
  `_build_resource()` becomes direct field assignment. Verify load +
  supportability scan after deleting.

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
   (`engine.gd._ready()`). The proto reference is now built: model the Godot
   version on `effectCoverageReport()` + the `VALUED_EFFECT_KINDS`/
   `UNVALUED_EFFECT_KINDS` partition in `engine.js` and `test_effect_coverage.js`.
2. **Effects need a booted game to test** (they mutate state, unlike the pure
   predicates). Proto exposed an `applyEffect` seam on the ENGINE object for
   tests; Godot's `Effects.resolve_one` is already callable, but tests need a
   board fixture (place CardInstances on `EngineState`, build a `ctx`).
3. **`counter_spell` → `counter`** rename is canonical (standardization branch
   already did Godot); the targeting step is `target(spell)`.

Proto reference for the Godot port lives in `reference/html-proto/js/engine.js`
(`EFFECTS` table, `applyEffect`, `creaturesInScope`, `affectOneCreature`).
