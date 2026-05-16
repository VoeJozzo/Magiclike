// Regression: draftPool() / oppPool() must be lazy. The card-data
// refactor (v1.0.134) made CARDS empty at module-load time; if these
// pools were computed at module-load (the old DRAFT_POOL const), they'd
// freeze to an empty array and the draft screen would offer no cards.
//
// This test verifies the pools have content AFTER the engine + cards
// have loaded. If a future refactor accidentally restores eager
// evaluation against an empty CARDS, this test fails immediately.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// draftPool is inside the DRAFT IIFE, so it's not directly on global.
// Instead, exercise it through the public draft surface that uses it:
// DRAFT.rollTransformPack() ultimately calls rollPack(draftPool(), ...)
// and returns a list of tplIds — empty result means the pool was empty.

console.log('=== draftPool: rollTransformPack returns a non-empty pack ===');
{
  const pack = DRAFT.rollTransformPack([]);
  check('pack is an array', Array.isArray(pack), 'got ' + typeof pack);
  check('pack has cards in it (would be empty if draftPool was frozen at []) ',
    Array.isArray(pack) && pack.length > 0,
    'pack.length = ' + (pack ? pack.length : 'undefined'));
  if (Array.isArray(pack) && pack.length > 0) {
    check('pack entries are valid tplIds present in CARDS',
      pack.every(id => CARDS[id]),
      'first entry: ' + JSON.stringify(pack[0]));
    check('no Land cards in the draft pool (filter intact)',
      pack.every(id => CARDS[id].type !== 'Land'));
    check('no special cards in the draft pool (filter intact)',
      pack.every(id => !CARDS[id].special));
  }
}

console.log('\n=== draftPool: matches the documented filter ===');
{
  // Re-derive the expected pool here and compare counts.
  const expected = Object.keys(CARDS).filter(id => CARDS[id].type !== 'Land' && !CARDS[id].special);
  // Pull pack multiple times and union the unique tplIds — should be a
  // subset of expected, and over many rolls should cover most of it.
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    for (const id of DRAFT.rollTransformPack([])) seen.add(id);
  }
  check('every drafted tplId comes from the expected pool',
    [...seen].every(id => expected.includes(id)),
    'seen=' + seen.size + ' expected=' + expected.length);
  check('200 rolls cover most of the pool (lazy compute is sane, not frozen mid-load)',
    seen.size > expected.length * 0.5,
    'covered ' + seen.size + ' of ' + expected.length);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
