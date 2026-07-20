// draftPool() / oppPool() must be lazy: CARDS is empty at module-load time,
// so a pool computed eagerly would freeze to an empty array and the draft
// screen would offer no cards.

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
    check('no BASIC lands in the draft pool (all nonbasic lands are allowed)',
      pack.every(id => !hasType(CARDS[id], 'Basic')));
    check('no undraftable (boon/boss) cards in the draft pool (filter intact)',
      pack.every(id => !isUndraftable(CARDS[id])));
  }
}

console.log('\n=== draftPool: matches the documented filter ===');
{
  // Must match draftPool()'s real predicate. Only BASIC lands are excluded —
  // they're auto-allocated after the draft; every nonbasic land (artifact
  // lands, utility lands like Deepseam Quarry) drafts like any other pick.
  const expected = Object.keys(CARDS).filter(id => {
    const c = CARDS[id];
    return !isUndraftable(c) && !hasType(c, 'Basic');
  });
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

console.log('\n=== colorless cards are offered every slot (not bucketed away) ===');
{
  // Colorless creatures (color:null) belong to no WUBRG bucket; color-rolled
  // draft slots must still offer them like any other creature.
  const colorlessCreatures = new Set(Object.keys(CARDS).filter(id => {
    const c = CARDS[id];
    return hasType(c, 'Creature') && !isUndraftable(c) && !c.color;
  }));
  check('there ARE colorless creatures to offer', colorlessCreatures.size > 0, colorlessCreatures.size + ' cards');
  let seen = 0;
  for (let i = 0; i < 300; i++) {
    for (const id of DRAFT.rollTransformPack([])) if (colorlessCreatures.has(id)) seen++;
  }
  check('colorless creatures actually appear across 300 packs (was 0 before the fix)',
    seen > 0, 'appearances=' + seen);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
