// Runs every Category A test and prints a summary. Exits non-zero if any
// fail. Usage: node tests/run_all.js
//
// Each test file is spawned as a separate Node process — that's wasteful
// (each one re-loads the engine, ~1s overhead per file) but it guarantees
// clean state isolation between tests. A future optimization would be a
// unified runner that loads once and runs every test's assertions
// cumulatively; not worth doing until the overhead actually hurts.

const { spawnSync } = require('child_process');
const path = require('path');

const CATEGORY_A = [
  // Ported from prior-session bundle.
  'subtype_v2_test.js',
  'subtype_rolls_complete_test.js',
  'three_stickers_subtype_test.js',
  'faketargets_refactor_test.js',
  'stickersfor_consolidation_test.js',
  'template_isolation_test.js',
  'extracted_helpers_test.js',
  'sticker_kinds_dispatch_test.js',
  'keyword_icons_test.js',
  // Authored this session to cover PR #5's test-plan items 2/3, 4, 5
  // plus cast-time decision prompts.
  'modal_helper_test.js',
  'trigger_generator_test.js',
  'ai_burn_lethal_test.js',
  'choice_prompts_test.js',
  // Locks in card-text output after the card-text.js extraction (v1.0.134).
  'card_text_test.js',
  'art_ladder_test.js',
  'draft_pool_lazy_test.js',
  'boon_art_derives_from_card_test.js',
  'tplid_renames_test.js',
  // Slice 2 / E2 — composable atomic predicates + evaluator + parser.
  'composable_predicates_test.js',
  // Slice 2 / E2 — condId -> composable condition migration (golden).
  'trigger_migration_test.js',
  // Slice 3 — mass scope groundwork (decision 2).
  'test_effects_scope.js',
  // Slice 3 — target()/chooses() targeting + structural hexproof.
  'test_targeting.js',
  // Slice 3 — move_card unified card-movement primitive.
  'test_move_card.js',
  // Slice 3 — change_control unified control primitive.
  'test_change_control.js',
  // Slice 3 — boot-time effect validation (step 4).
  'test_effect_validation.js',
  // Slice 3 — cast→resolution wiring for top-level target() (keystone).
  'test_targeting_cast.js',
  // GAP 2 — human-facing edict chooses() prompt (pause/replay; AI auto-pick unchanged).
  'test_edict_human_choice.js',
  // Heir to the Burnt House — type-symmetric chooses() filter (land edict).
  'heir_edict_test.js',
  // The False Witness — become_copy_of doppelganger (copy/exile/return/revert + AI).
  'false_witness_test.js',
  // Regression — migrated targeted triggers PROMPT the human (not auto-pick).
  'test_trigger_target_prompt.js',
  // Slice 3 — §8.1 AI-valuation lockstep for migrated targeted spells.
  'test_ai_targeting.js',
  // Slice 3 — flicker decomposition (two move_cards; ETB re-fire, LTB, token cease).
  'test_flicker.js',
  // Slice 3 — exile_until_eot decomposition (move_card + schedule_delayed; end-step return).
  'test_exile_until_eot.js',
  // Slice 3 step 12 — Stapler noop→target_slots (ability-level multi-target slots).
  'test_stapler_target_slots.js',
  // Slice 3 step 7b — effect coverage assertion (HANDLERS↔valuation/card-text partition).
  'test_effect_coverage.js',
  // Review #8 — effect-shorthand parser (§5.1 call syntax + §5.2 movement desugar).
  'test_effect_shorthand.js',
  // Slice 3 steps 0+11 — splice harmonization (shared mergeSpliceData; reward↔in-game parity).
  'test_splice_core.js',
  // v2 targeting — top-level target() restrictions (target_filter) enforced at cast + highlight.
  'test_target_restrictions.js',
  // Accurate player-target text: opp (opponent-only) vs player (choose-any) match legal targets.
  'test_target_player_opp.js',
  // Filter parity: card text renders exactly the restrictions matchFilter enforces.
  'test_filter_parity.js',
  // Boss special-removal AI casting (scoreSpellTargetForMode branches for the boss kinds).
  'test_boss_removal_ai.js',
  // Drain cards are life loss, not damage (signed gain_life migration + valuation).
  'test_drain_lifeloss.js',
  // Slice 3 — §3.9 mana deep-clean (land-as-ability, choose form, sticker, staple).
  'test_mana.js',
  // Slice 3 — §3.8 empower system (single-source EMPOWER_FIELDS, post-collapse).
  'test_empower.js',
  // Slice 3 — §3.8 empower persistence (RUN.load backfill idempotency + staple remap).
  'test_empower_persistence.js',
  // Slice 3 — §3.8 Balancer decomposition (embargo/bleach → apply_sticker + move_card).
  'test_balancer.js',
  // Canonical targeting-shape API (single source of truth for needs-target/legal-targets).
  'test_targeting_shape.js',
  // Castable-card highlight honors the top-level target() step.
  'test_castable_highlight.js',
  // Seal-Thief Courier: combat-damage theft from graveyard into castable exile.
  'test_seal_thief_courier.js',
  // Human cast-from-exile UI: a targeted/modal stolen spell resolves its target
  // through the full click flow (not just the initial click) + picker prompt text.
  'test_cast_from_exile_ui.js',
  // Authored text keyed on custom_text only (special decoupled); 5 cards now generate.
  'test_generated_special_text.js',
  // Slice 3 — §3.5 browser targeting (clickHand/ability honor the top-level target() step).
  'test_ui_targeting.js',
  // DIVERGENCE D4 — signed gain_life (life loss + is_life_loss).
  'test_signed_life.js',
  // Slice 3 — on-cast targeting migration (golden).
  'effect_migration_test.js',
  // Regression — card_has_subtype string match + scope:'self' effect application
  // (subtype-ETB triggers like High Priestess; self-pump like Ajani's Pridemate).
  'test_scope_self_and_subtype.js',
  // Regression — boss-node advance must not crash (DRAFT.getConstructedDeck) +
  // map state present at every transition (the "always show minimap" contract).
  'test_map_progression.js',
  // Sandbox mode — RUN-less boot + spawning complete card instances onto the
  // battlefield (engine-level; the floating panel DOM is browser-only).
  'test_sandbox_spawn.js',
  // Archdemon bargain chooser follows the controller + empower amplifies
  // magnitude in the field's direction (signed debuffs go more negative).
  'test_bargain_chooser_and_empower.js',
  // decideMain sequences by play value (cheap removal beats expensive filler).
  'test_ai_main_sequencing.js',
  // Optional paid ETB for Land+Spell staples (synthesis gate + pay/decline flow).
  'test_optional_paid_etb.js',
  // Rules infra: B2 mana-at-phase-boundary, F2 indestructible keeps damage, D4 damage fires is_life_loss.
  'test_rules_infra.js',
  // Unified type system Phase 1 — typesOf/hasType/governingType/typeLine equivalence with legacy type/sub.
  'test_types_identity.js',
  // addType write helper — single source of truth for permanent type-identity writes.
  'test_add_type.js',
  // Type-change layer (add_type/set_types) + Phase-4 test cards (type-change spells, artifact creatures, artifact lands).
  'test_type_change.js',
  // Subtype-implied keywords (Angel/Dragon→flying, Treefolk→reach, Wall→defender):
  // eager makeCard injection + survival through the intrinsicKeywords re-derive seam.
  'test_subtype_keywords.js',
  // Colorless artifact boss special cards (Equatorial Engine / Artifice Triumphant / Ingenuity Unbounded).
  'test_equatorial_artificer_boss.js',
  // Oracle text is generated from effects — no card may carry a dead (render-irrelevant) top-level text field.
  'test_no_dead_text.js',
  // Predate (buff-then-fight) + the D1 live-read hybrid it forces + static-lord keyword grants.
  'test_predate_fight_d1.js',
  // Hymnwright — verse counters (first named-counter card): accrual on death,
  // remove_counters cost gated in both legality paths, end-to-end recall, leave-play clear.
  'verse_counter_test.js',
  // Deepseam Quarry — reanimation land: enters-tapped, all-graveyards + greatest-
  // total-mana-cost targeting, self-sac activation cost, reanimate-under-your-control.
  'test_deepseam_quarry.js',
  // distinct_targets opt-in (Roots and Branches / Sword and Sorcery): two-creature
  // spells whose slots must differ — "another target creature" text + same-target
  // legality rejection + no same-target combo + needs two creatures to cast.
  'test_distinct_targets.js',
  // Unified multi-slot selection, end-to-end: the AI enumerates multi-target
  // activated abilities (Stapler), a stapled multi-target spell's ETB resolves
  // every slot, a human-controlled multi-target ETB prompts per choosable slot,
  // and a distinct_targets ETB resolves onto two DIFFERENT creatures.
  'test_multitarget_trigger.js',
  // Static-lord keyword grants, dedicated: real entry (emit on cast) + real
  // leave paths (death/bounce), controller + cross-lord gating, intrinsic
  // protection, multi-source survival, and the six-lord sweep.
  'test_lord_keyword_grants.js',
  // Endomorph absorb: regression pin for the E1 subject_card payload rename
  // (every absorb silently fizzled), keyword priority, +1/+1 fallback,
  // defender exclusion, dead-Endomorph corpse path, opp-side no-persistence,
  // plus the shared trophy rule (claimableKeywords): intrinsics-only claims
  // for BOTH the absorb and the reward-screen claimedKeywords, intrinsic
  // novelty (borrowed keywords don't block absorption), bounced-fade edge.
  'test_endomorph_absorb.js',
  // Audit A1-3 — SBA zero-toughness death: indestructible creatures die at
  // t <= 0 (704.5f), while the damage/deathtouch exemptions stay intact.
  'test_sba_zero_toughness.js',
  // Audit A1-10 — the cleanup discard grants no priority: tapLandForMana is
  // illegal/rejected mid-discard, the discard stays legal, taps resume after.
  'test_cleanup_no_mana_taps.js',
  // Audit A2-3 — ghost attacker: leaving the battlefield removes a creature
  // from combat (bounce + flash re-cast deals NO damage), while a killed
  // blocker still leaves its attacker blocked (510.1c tombstone semantics).
  'test_combat_ghost_attacker.js',
  // Audit A2-5 — change_control removes the creature from combat (506.4c):
  // a stolen attacker stops dealing damage (was: damaged its own new
  // controller), can't block itself; a stolen blocker stops trading damage.
  'test_combat_change_control.js',
  // Audit A2-2 — trample vs a lethalNeeded==0 blocker: a fully-marked
  // indestructible counts as satisfied (full carryover spills, no dump),
  // while partial marking still respects the boundary.
  'test_combat_trample_lethal_zero.js',
  // Audit A2-4 — declareAttackers legality rejects duplicate iids (mirrors
  // declareBlockers' usedBlockers Set); normal multi-attacker unaffected.
  'test_combat_duplicate_attackers.js',
  // Audit A2-7 (design ruling, PR #98) — deathtouch dose is 1 vs every
  // blocker incl. indestructible (marked, survives); lifelink always gains
  // full power even when the damage is overkill.
  'test_combat_deathtouch_lifelink.js',
  // Audit A2-1 (design ruling, PR #98) — first-strike membership snapshotted
  // at combat-damage start: a lord dying in pass 1 doesn't make its granted
  // creature deal damage twice, and a creature gaining first strike between
  // passes still deals its single snapshot-assigned pass-2 hit.
  'test_combat_first_strike_snapshot.js',
  // Audit A1-9 — DRAW-step log truthfulness: "X draws." only logs when a
  // card actually moved (no phantom-draw line on deck-out / Phylactery rip).
  'test_draw_log_truthfulness.js',
  // Audit A2-8 + A3-11 — event payload conformance: life_changed (combat
  // lifelink, damagePlayer loss) and the leave-play family carry source_iid,
  // pinned through the noSelfCascade guard (self-suppression + foreign-fire).
  'test_event_source_iid.js',
  // Audit A3-12 — a mid-prompt trigger fizzle logs (sibling-path wording)
  // instead of evaporating wordlessly; happy path logs no fizzle.
  'test_trigger_prompt_fizzle_log.js',
  // Audit A3-1 — resolution-time target re-validation (§1006.1/§704.1):
  // hexproof gained in response fizzles the waiting trigger/spell (riders
  // included), multi-target entries partial-fizzle onto remaining legal
  // targets, happy path unchanged.
  'test_resolution_revalidation.js',
  // Audit A3-10 — no silent emit-time trigger eat: a targeted trigger with
  // no legal target queues on event match and fizzles WITH a log at the
  // stack-push moment (§1004/§1005); happy path pinned green.
  'test_trigger_emit_fizzle_log.js',
  // Audit A3-13 — trigger copies are exact at copy-time, then diverge:
  // condition arrays deep-copied at makePlayer's Mercurial pool pick,
  // makeCard's bonusTrigger push, and finalizeBuild's slot/live-card writes.
  'test_trigger_condition_clone.js',
  // Audit A3-14 — schedule_delayed refuses unknown `when` loudly (no more
  // immortal zombie entries in delayedTriggers) + EFFECT_SCHEMA boot arm.
  'test_delayed_fireat_validation.js',
  // Audit A3-5 — boot validation for the three generated-trigger tables
  // (GENERATOR_EFFECTS/CONDITIONS + MERCURIAL_TRIGGER_POOL) + the stale-save
  // bonusTrigger warn at makePlayer.
  'test_generated_tables_validation.js',
  // Audit A1-1 leg 2 — non-mana ability activation resets the priority
  // pass tracker (§603 both-pass-in-succession); mana abilities exempt.
  'test_ability_pass_reset.js',
  // Audit A1-1 leg 3 — triggers queued while priority is closed WAIT for
  // the next real window (§1004.4); no synthetic round conjured mid-pause,
  // pending declarations never silently skipped.
  'test_trigger_closed_window_drain.js',
  // Audit A6-1 option C — the bargain sticker pool stays BROAD (add_type/
  // cost_mod/remove_keyword included; scarified/subtype/empower excluded)
  // and each pick now respects rarity weights via pickWeightedSticker.
  'test_bargain_weighted_pool.js',
  // Audit A1-2 — payer unification: canPayPotential and payMana share ONE
  // solver (solveManaPayment); the payer executes the checker's solution,
  // payment is atomic (full payment or zero mutation, never half-applied).
  'test_paymana_plan_unification.js',
  // Audit A4-2 (adjudicates A2-9) — one shared lordBuffApplies predicate for
  // both static_buff halves; applyStaticKeywordGrants diff-reconciles (grants
  // revoke when the lord's filter stops matching — steal, type change).
  'test_lord_grant_reconcile.js',
  // Audit A4-3 — fight fizzles (never retargets) when a chosen {slot}
  // participant is gone at resolution; {select} auto-pick unaffected.
  'test_fight_fizzle.js',
  // Audit A4-5 — intrinsicKeywords is copy-aware: a become_copy_of copy keeps
  // the copied keywords through the CLEANUP eotGrants rebuild; leave-play
  // revert still lands on the base identity.
  'test_copy_keyword_persistence.js',
  // Audit A4-6 — color/not_color filters test the full color identity
  // (colorsOfCard), not just the first pip; multicolor + token paths.
  'test_color_filter_multicolor.js',
  // Audit A4-19/20/22 — counter routes to the OWNER's graveyard; library
  // fetches go through placeCardOnBattlefield (fresh iid + sickness);
  // reanimation resets via the full resetInPlayState (killedBy cleared).
  'test_a4_zone_state_fixes.js',
  // Audit A4-16 — move_card battlefield-leaves flush Elystra's pending
  // permanent_eot buffs (the dead post.keep_buffs fork is gone). BEHAVIOR
  // CHANGE: her EOT buffs now survive flicker, per her printed text.
  'test_a4_elystra_flicker_buffs.js',
  // Audit A4-15 — steal's RUN.appendSlot is human-gated: an opp thief never
  // writes the victim's persisted run deck (in-game-only theft).
  'test_a4_steal_run_gate.js',
  // Audit A4-9 (design ruling) — trample spills from effect damage, never
  // from fights; deathtouch fight victim-mark fenced.
  'test_a4_fight_trample_deathtouch.js',
  // Audit A4-12 (design ruling) — life LOSS shares damage's Phylactery
  // floor/rip via losePlayerLife (drains can no longer go below 0).
  'test_a4_phylactery_lifeloss.js',
  // Audit A4-13 — ability scope:'self' creature-vs-player fork via the
  // shared resolveSelfTarget (the divergent third copy); add_type stays
  // creature-routed (artifice_triumphant trap).
  'test_a4_self_target_ability.js',
  // Audit A4-7 — trigger-path chooses() routes to the human edict prompt
  // via the shared maybeDeferHumanChooses gate (trigger twin of
  // test_edict_human_choice).
  'test_a4_trigger_edict_prompt.js',
  // Audit A4-8 + A4-14 — creature_or_player/spell arms honor target_filter;
  // stat-bounded lord static_buffs can't stack-overflow getStats.
  'test_a4_targeting_filters.js',
  // Audit A4-11/17/21 (+8/14 boot legs) — filter-key vocabulary closed at
  // boot; required-param schema; targeted-kinds-need-a-target sweep;
  // move_card selector table; no-target/no-amount resolution guards; the
  // discard arm honors its selector.
  'test_a4_validation_guards.js',
  // Audit A3-6 (approved build-out) — card_zone_change emits for EVERY
  // genuine zone move (draws, tutors, discards, mills, casts, counters,
  // resolutions, recursion, none→library mints); pool isolation pins,
  // budget no-loop, noSelfCascade via drawCard sourceIid, setup-silence.
  'test_a3_6_zone_events.js',
  // Audit A4-4 — mass removal is simultaneous: the affect_creature scope
  // path batches its leave emits (checkDeaths' two-pass design), so a
  // dies-listener swept by the same wipe hears every death, order-
  // independently; bounce/exile arms + pass-1 indestructible included.
  'test_mass_removal_batch.js',
  // Audit A3-2 — stackable infrastructure: kind:'ability' stack entries with
  // response windows + §1006.1 re-validation; mana fast path untouched;
  // `stackable` absent → true, non-boolean rejected at boot; dormant
  // drain-time-immediate arm for stackable:false triggers; counter parity;
  // AI sanity over ability entries.
  'test_stackable_infra.js',
  // Audit A7-4 — bestSpellPlay's self-damage lethal gate is per OPTION: a
  // modal mode whose self-damage would kill us scores -100 (the old gate
  // covered non-modal cards only; the comment-promised per-option check
  // didn't exist). Synthetic modal templates — no pool card has the shape.
  'test_a7_modal_self_damage.js',
  // Audit A7-3 — AI value-picks grave-return targets (the migrated move_card
  // graveyard->hand shape; yard derived from the target's stamped controller
  // tag) instead of returning valid[0] (oldest card, value-blind).
  'test_a7_grave_return_pick.js',
  // Audit A7-2 — add_counter has a non-zero cast value (mirrors abilityValue
  // 3+P+T, floored >=1) so the AI tries to cast untargeted counter spells.
  'test_a7_add_counter_cast_value.js',
  // Audit A7-1 — extra-cost mana abilities ({T},sacrifice: add mana, and the
  // tapless variant) are excluded from every auto-pay path (the tap lane never
  // silently pays a non-trivial cost) + a boot tripwire flags the shape.
  'test_a7_extra_cost_mana.js',
  // Audit A9-4 + A9-5 — RUN.load() refuses future-version saves (warn +
  // return false, blob left intact); picklog gamesPlayed counts game
  // COMPLETIONS in recordResult (no crash-restore double-count, no
  // abandoned-game count).
  'test_a9_run_save_guards.js',
  // Audit A9-2 + A9-3 — run-slot removal contract: EFFECTS.rip (Vile Edict)
  // routes through ripSlotByIdx, and a shared fixup decrements in-game slotIdx
  // AND remaps playedSlotIdxs (drop-at + decrement-above) on every rip.
  'test_a9_slot_invariant.js',
  // Audit A1-6 — the CLEANUP end-step delayed-trigger drain warns (not silently
  // drops) on an unhandled effect kind; the deferredEffects path is unchanged.
  'test_a1_6_unknown_delayed_kind.js',
  // Audit A10-1/3/4 — card-text truthfulness pins (picker label = oracle, no
  // raw-kind leak; ~ substitution incl. the Mercurial Adept face leak;
  // add_type/set_types scope:self subject "this").
  'test_a10_text_truthfulness.js',
  // Audit A11-1 — slot/effect-level target strings validated at boot (an
  // unknown name = a silently-uncastable card); the live pool stays clean.
  'test_a11_target_string_validation.js',
];

const TESTS_DIR = __dirname;
let totalPass = 0, totalFail = 0;
const failures = [];

// Mutation-runner hooks (tools/audit/mutation). Both inert unless the env
// vars are set: RUN_ALL_BAIL stops at the first failing file (a killed
// mutant doesn't need the rest of the suite); RUN_ALL_TEST_TIMEOUT_MS
// bounds each test process (mutants can introduce infinite loops).
const BAIL = !!process.env.RUN_ALL_BAIL;
const PER_TEST_TIMEOUT_MS = parseInt(process.env.RUN_ALL_TEST_TIMEOUT_MS, 10) || 0;

const t0 = Date.now();
for (const file of CATEGORY_A) {
  process.stdout.write('=== ' + file + ' ... ');
  const result = spawnSync('node', [path.join(TESTS_DIR, file)],
    { encoding: 'utf8', ...(PER_TEST_TIMEOUT_MS ? { timeout: PER_TEST_TIMEOUT_MS } : {}) });
  const out = (result.stdout || '') + (result.stderr || '');
  // Parse the final "=== TOTAL: N passed, M failed ===" line.
  const m = out.match(/TOTAL:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
  if (m) {
    const p = parseInt(m[1], 10), f = parseInt(m[2], 10);
    totalPass += p; totalFail += f;
    if (f === 0 && result.status === 0) {
      console.log(p + ' passed');
    } else {
      console.log(p + ' passed, ' + f + ' FAILED');
      failures.push({ file, output: out });
    }
  } else {
    // Couldn't parse — treat as failure.
    console.log('UNPARSEABLE OUTPUT (likely crashed)');
    totalFail += 1;
    failures.push({ file, output: out });
  }
  if (BAIL && totalFail > 0) {
    console.log('(bailing: RUN_ALL_BAIL set and a failure was seen)');
    break;
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log('=== Category A SUMMARY ===');
console.log('Files: ' + CATEGORY_A.length + ', assertions: ' + (totalPass + totalFail));
console.log('Passed: ' + totalPass + ', failed: ' + totalFail);
console.log('Elapsed: ' + elapsed + 's');

if (failures.length > 0) {
  console.log('\n=== FAILURE DETAILS ===');
  for (const f of failures) {
    console.log('\n--- ' + f.file + ' ---');
    // Trim to last 30 lines to keep summary readable.
    const lines = f.output.trim().split('\n');
    console.log(lines.slice(-30).join('\n'));
  }
  process.exit(1);
}
process.exit(0);
