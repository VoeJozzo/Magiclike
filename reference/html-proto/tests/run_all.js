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
