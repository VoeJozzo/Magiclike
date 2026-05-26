// Boot-time effect validation (Slice 3 step 4). validateAllCardEffects walks
// every card's effects (on-cast flat/modal + activated/triggered abilities)
// and flags unknown effect kinds and out-of-taxonomy target()/chooses()
// filters. Catches typos at boot. The live pool must validate clean.

const setup = require('./_setup');
setup.loadEngine();
// Boot a game so ENGINE internals are live (CARDS loaded by _setup).
RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), Array(12).fill('plains'));

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== synthetic cards: detection ===');
(() => {
  const synthetic = [
    { tplId: 'goodCast', effects: [{ kind: 'damage', amount: 3 }] },
    { tplId: 'goodNew', effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'hand' }, { kind: 'change_control' }] },
    { tplId: 'badKind', effects: [{ kind: 'definitely_not_a_kind', amount: 1 }] },
    { tplId: 'goodModal', effects: { modes: [[{ kind: 'damage', amount: 2 }], [{ kind: 'frobnicate' }]] } },
    { tplId: 'badAbility', abilities: [{ effects: [{ kind: 'bogus_ability_effect' }] }] },
    { tplId: 'badTrigger', triggers: [{ event: 'attacks', effects: [{ kind: 'no_such_effect' }] }] },
    { tplId: 'badChoosesFilter', effects: [{ kind: 'chooses', filter: 'not_a_filter' }] },
    { tplId: 'goodChooses', effects: [{ kind: 'chooses', filter: 'creature' }] },
    { tplId: 'badTargetStep', target: 'nonsense_filter', effects: [{ kind: 'damage', amount: 1 }] },
    { tplId: 'goodTargetStep', target: 'creature_or_player', effects: [{ kind: 'damage', amount: 1 }] },
  ];
  const r = ENGINE.validateAllCardEffects(synthetic);
  check('flags unknown on-cast kind', r.unknownKinds.includes('badKind.definitely_not_a_kind'));
  check('flags unknown modal-mode kind', r.unknownKinds.includes('goodModal.frobnicate'));
  check('flags unknown ability kind', r.unknownKinds.includes('badAbility.bogus_ability_effect'));
  check('flags unknown trigger kind', r.unknownKinds.includes('badTrigger.no_such_effect'));
  check('does NOT flag valid kinds', !r.unknownKinds.some(u => u.startsWith('goodCast.') || u.startsWith('goodNew.')));
  check('flags out-of-taxonomy chooses filter', r.unknownFilters.includes('badChoosesFilter.chooses(not_a_filter)'));
  check('does NOT flag valid chooses filter', !r.unknownFilters.some(u => u.startsWith('goodChooses.')));
  check('flags out-of-taxonomy target() step', r.unknownFilters.includes('badTargetStep.target(nonsense_filter)'));
  check('does NOT flag valid target() step', !r.unknownFilters.some(u => u.startsWith('goodTargetStep.')));
})();

console.log('\n=== per-kind schema for the new atomics ===');
(() => {
  const bad = [
    { tplId: 'mcNoZones', effects: [{ kind: 'move_card', amount: 1 }] },
    { tplId: 'mcBadZone', effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'nowhere' }] },
    { tplId: 'choosesNoFilter', effects: [{ kind: 'chooses' }] },
    { tplId: 'sevBad', effects: [{ kind: 'affect_creature', severity: 'vaporize' }] },
  ];
  const good = [
    { tplId: 'mcOk', effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'hand' }] },
    { tplId: 'sevOk', effects: [{ kind: 'affect_creature', severity: 'destroy' }] },
  ];
  const r = ENGINE.validateAllCardEffects(bad.concat(good));
  check('move_card missing zones flagged', r.schemaErrors.some(e => e.startsWith('mcNoZones:')));
  check('move_card bad to_zone flagged', r.schemaErrors.some(e => e.startsWith('mcBadZone:')));
  check('chooses missing filter flagged', r.schemaErrors.some(e => e.startsWith('choosesNoFilter:')));
  check('affect_creature bad severity flagged', r.schemaErrors.some(e => e.startsWith('sevBad:')));
  check('valid new-atomic effects NOT flagged',
    !r.schemaErrors.some(e => e.startsWith('mcOk:') || e.startsWith('sevOk:')));
})();

console.log('\n=== live shipped pool validates clean ===');
(() => {
  const r = ENGINE.validateAllCardEffects(CARDS);
  check('no unknown effect kinds in CARDS', r.unknownKinds.length === 0, r.unknownKinds.join(', '));
  check('no out-of-taxonomy filters in CARDS', r.unknownFilters.length === 0, r.unknownFilters.join(', '));
  check('no schema errors in CARDS', r.schemaErrors.length === 0, r.schemaErrors.join('; '));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
