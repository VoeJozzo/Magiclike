// test_effect_coverage.js's unscoredValuation check (ENGINE.effectCoverageReport)
// requires every VALUED effect kind to have a cast-scorer branch here.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== A7-2: add_counter has a non-zero cast value mirroring abilityValue (3+P+T, floored >=1) ===');
(() => {
  const v22 = AI.spellValueForEffects([{ kind: 'add_counter', power: 2, toughness: 2 }]);
  check('add_counter 2/2 -> 7 (3+P+T)', v22 === 7, '' + v22);
  check('add_counter 1/1 -> 5', AI.spellValueForEffects([{ kind: 'add_counter', power: 1, toughness: 1 }]) === 5);
  check('charge-counter 0/0 -> 3 (still > 0)', AI.spellValueForEffects([{ kind: 'add_counter', power: 0, toughness: 0 }]) === 3);
  const vNeg = AI.spellValueForEffects([{ kind: 'add_counter', power: -5, toughness: 0 }]);
  check('floor: degenerate -5/0 -> 1, never zero (Joe)', vNeg === 1, '' + vNeg);

  // Parity with the trigger/ability valuer (engine.js abilityValue add_counter)
  // wherever the floor does not bind.
  for (const pt of [[1, 1], [2, 3], [0, 2], [4, 0]]) {
    const got = AI.spellValueForEffects([{ kind: 'add_counter', power: pt[0], toughness: pt[1] }]);
    check('parity add_counter ' + pt[0] + '/' + pt[1] + ' = 3+P+T', got === 3 + pt[0] + pt[1], '' + got);
  }

  // bestSpellPlay drops any score <= 0, so a positive value here means the
  // AI actually considers this spell.
  check('an untargeted add_counter effect now scores > 0 (was 0 -> never cast)',
    AI.spellValueForEffects([{ kind: 'add_counter', power: 1, toughness: 1 }]) > 0);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
