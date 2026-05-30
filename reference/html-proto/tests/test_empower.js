// §3.8 empower system: EMPOWER_FIELDS is the single source of empowerable params,
// aligned to the post-collapse effect set (§3.5). Notably the draw→move_card
// collapse must NOT have dropped draw-empowerability — a cantrip's draw is still
// a valid empower target via the move_card(library→hand) shape.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
RUN.startNextGame();

console.log('=== EMPOWER_FIELDS references only live effect kinds (no collapsed-away kinds) ===');
(() => {
  const DEAD = ['damageAll', 'pumpAllYours', 'removeAll', 'weaken', 'add_counter', 'draw', 'discard'];
  const offenders = Object.keys(EMPOWER_FIELDS).filter(k => DEAD.includes(k));
  check('no collapsed-away kinds remain in EMPOWER_FIELDS', offenders.length === 0, offenders.join(','));
})();

console.log('\n=== move_card draw is empowerable; other move_card shapes are not ===');
(() => {
  check('move_card(library→hand) amount is empowerable (draw)',
    isEmpowerableField({ kind: 'move_card', from_zone: 'library', to_zone: 'hand', amount: 1 }, 'amount'));
  check('move_card(battlefield→hand) is NOT empowerable (bounce)',
    !isEmpowerableField({ kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand' }, 'amount'));
  check('move_card(hand→graveyard) is NOT empowerable (discard)',
    !isEmpowerableField({ kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', amount: 1 }, 'amount'));
})();

console.log('\n=== a real cantrip exposes its draw as an empower target (regression: draw collapse) ===');
(() => {
  // divination: on-cast draw 2 (now move_card library→hand). Must be enumerable.
  const targets = enumerateEmpowerTargets(CARDS.divination);
  const drawTarget = targets.find(t => t.field === 'amount');
  check('divin has an empowerable amount target (draw not silently dropped)', !!drawTarget, JSON.stringify(targets));
})();

console.log('\n=== mass effects empower on the collapsed shape (damage+scope / affect_creature+scope) ===');
(() => {
  // A mass damage (damage+scope) still exposes amount; affect_creature severity capped below exile.
  check('damage+scope amount empowerable',
    isEmpowerableField({ kind: 'damage', scope: 'all_creatures', amount: 2 }, 'amount'));
  check('affect_creature severity empowerable below exile',
    isEmpowerableField({ kind: 'affect_creature', severity: 'bounce' }, 'severity'));
  check('affect_creature severity NOT empowerable at exile (max)',
    !isEmpowerableField({ kind: 'affect_creature', severity: 'exile' }, 'severity'));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
