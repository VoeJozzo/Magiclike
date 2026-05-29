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
  'v80_helpers_test.js',
  'subtype_v2_test.js',
  'subtype_rolls_complete_test.js',
  'three_stickers_subtype_test.js',
  'faketargets_refactor_test.js',
  'stickersfor_consolidation_test.js',
  'template_isolation_test.js',
  'extracted_helpers_test.js',
  'sticker_kinds_dispatch_test.js',
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
];

const TESTS_DIR = __dirname;
let totalPass = 0, totalFail = 0;
const failures = [];

const t0 = Date.now();
for (const file of CATEGORY_A) {
  process.stdout.write('=== ' + file + ' ... ');
  const result = spawnSync('node', [path.join(TESTS_DIR, file)], { encoding: 'utf8' });
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
