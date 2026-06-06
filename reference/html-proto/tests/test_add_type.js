// addType — the single write helper for permanent type identity (types.js).
// Replaces the raw `if (!x.types.includes(t)) x.types.push(t)` idiom that was
// copy-pasted across the two sticker subtype-roll sites (stickers.js) and the two
// staple-merge unions (engine.js). Behavior-identical to those raw pushes: dedup
// is against the STORED base, so a permanently-rolled tag is stored even while a
// temporary `typeGrants` modifier happens to provide it. The end-to-end sticker /
// staple paths are covered by subtype_rolls_complete_test + three_stickers_subtype_test
// (both must stay green — that's the call-site integration coverage).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== addType: add + base dedup ===');
(() => {
  const c = { types: ['Creature'] };
  addType(c, 'Goblin');
  check('adds a new tag to the base', c.types.includes('Goblin') && c.types.length === 2);
  addType(c, 'Goblin');
  check('idempotent — no duplicate', c.types.filter(t => t === 'Goblin').length === 1);
  addType(c, 'Warrior');
  check('appends in order', c.types.join(',') === 'Creature,Goblin,Warrior');
})();

console.log('\n=== addType: missing / empty inputs ===');
(() => {
  const c = {};
  addType(c, 'Artifact');
  check('initializes types[] when absent', Array.isArray(c.types) && c.types[0] === 'Artifact');
  const d = { types: ['Land'] };
  addType(d, null); addType(d, '');
  check('null / empty tag is a no-op', d.types.length === 1);
  check('null card does not throw', (addType(null, 'X'), true));
})();

console.log('\n=== addType stores to the PERMANENT base, not the effective set ===');
(() => {
  // A temporary add_type grant makes the card effectively a Goblin while the base
  // does not carry it. A subtype-roll addType must STILL store Goblin — otherwise
  // it would vanish when the grant clears. (An effective-set/hasType dedup would
  // wrongly skip it; this pins the correct base-dedup behavior.)
  const c = { types: ['Creature'], typeGrants: [{ tags: ['Goblin'], op: 'add', eot: true }] };
  check('granted Goblin is effective but absent from the base',
    hasType(c, 'Goblin') && !c.types.includes('Goblin'));
  addType(c, 'Goblin');
  check('addType stores Goblin permanently despite the active grant', c.types.includes('Goblin'));
  c.typeGrants = [];   // grant clears
  check('Goblin survives the grant clearing', hasType(c, 'Goblin'));
  check('no duplicate Goblin in the base', c.types.filter(t => t === 'Goblin').length === 1);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
