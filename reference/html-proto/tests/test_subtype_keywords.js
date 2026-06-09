// Subtype-implied keywords (Angel/Dragon→flying, Treefolk→reach, Wall→defender).
//
// Two halves to the contract:
//   1. makeCard injects the implied keyword eagerly (so it renders in oracle text).
//   2. intrinsicKeywords — the re-derive seam used by resetInPlayState (leave-play)
//      AND the end-of-turn eotGrants cleanup — ALSO yields it. Without (2), a Dragon
//      that bounced/recast, or merely shed an until-EOT grant while in play, would
//      silently lose its flying because the rebuild starts from template+stickers
//      only. This test pins both halves and the grant round-trip.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// tplId, the subtype under test, and the keyword it should imply. Each card has
// the keyword STRIPPED from its card.json — derivation is the only source.
const CASES = [
  ['shivan_dragon', 'Dragon', 'flying'],
  ['serra_angel', 'Angel', 'flying'],
  ['treefolk_guard', 'Treefolk', 'reach'],
  ['wall_of_omens', 'Wall', 'defender'],
];

console.log('=== makeCard injects the subtype-implied keyword (eager) ===');
for (const [tplId, sub, kw] of CASES) {
  const c = ENGINE.makeCard(tplId);
  check(`${tplId} (${sub}) has ${kw} after makeCard`, c.keywords.includes(kw),
    JSON.stringify(c.keywords));
}

console.log('\n=== intrinsicKeywords re-derives the implied keyword (leave-play / EOT seam) ===');
for (const [tplId, sub, kw] of CASES) {
  const c = ENGINE.makeCard(tplId);
  // This is exactly what resetInPlayState and the eotGrants cleanup do.
  c.keywords = ENGINE.intrinsicKeywords(c);
  check(`${tplId} (${sub}) keeps ${kw} through an intrinsic rebuild`, c.keywords.includes(kw),
    JSON.stringify(c.keywords));
}

console.log('\n=== grant round-trip: implied keyword survives alongside a permanent grant ===');
(() => {
  // Shivan Dragon under a Skyfire Drakelord (grants first_strike to Dragons).
  const dragon = ENGINE.makeCard('shivan_dragon');
  dragon.grantedBy = new Map([['first_strike', new Set([999])]]);
  if (!dragon.keywords.includes('first_strike')) dragon.keywords.push('first_strike');
  check('starts with both flying (subtype) and first_strike (grant)',
    dragon.keywords.includes('flying') && dragon.keywords.includes('first_strike'));

  // Mirror the EOT cleanup (engine.js): rebuild from intrinsics, then re-add
  // anything still live in grantedBy.
  const rebuilt = ENGINE.intrinsicKeywords(dragon);
  for (const [k, srcs] of dragon.grantedBy) {
    if (srcs.size > 0 && !rebuilt.includes(k)) rebuilt.push(k);
  }
  dragon.keywords = rebuilt;
  check('flying survives the keyword rebuild', dragon.keywords.includes('flying'));
  check('the permanent first_strike grant also survives', dragon.keywords.includes('first_strike'));
})();

console.log('\n=== negative: a subtype with no implied keyword gains nothing ===');
(() => {
  const goblin = ENGINE.makeCard('raging_goblin');   // Goblin Warrior — no implied kw
  check('raging_goblin (Goblin Warrior) does not gain flying',
    !goblin.keywords.includes('flying'), JSON.stringify(goblin.keywords));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
