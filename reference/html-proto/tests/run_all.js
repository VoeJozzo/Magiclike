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
  // Audit A1-9 — DRAW-step log truthfulness: "X draws." only logs when a
  // card actually moved (no phantom-draw line on deck-out / Phylactery rip).
  'test_draw_log_truthfulness.js',
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
