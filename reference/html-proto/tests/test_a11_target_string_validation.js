// Audit chunk 11 — A11-1: slot- and effect-level target STRINGS
// (target_slots[i].target, e.target) resolve through getValidTargets directly
// — NOT the matchFilter taxonomy — and getValidTargets' default arm returns []
// (console.warn). So a typo'd target name boots clean and the card is silently
// uncastable forever. Boot validation now sweeps these strings against
// GETVALIDTARGETS_TARGETS at card-, ability-, and trigger-level slots plus
// effect-level e.target. The live 297-card pool was conformance-clean; this
// pins the guard so a future typo goes RED at boot instead of shipping mute.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const quiet = (fn) => {
  const orig = console.warn; console.warn = () => {};
  try { return fn(); } finally { console.warn = orig; }
};

console.log('=== A11-1: unknown slot/effect-level target strings flagged at boot ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    // effect-level e.target typo
    { tplId: 'effBad', effects: [{ kind: 'damage', amount: 2, target: 'creatrue' }] },
    // card-level target_slots[i].target typo
    { tplId: 'slotBad', target_slots: [{ target: 'permanant' }], effects: [{ kind: 'damage', amount: 2 }] },
    // ability-level slot typo
    { tplId: 'abSlotBad', abilities: [{ cost: { tap: true }, target_slots: [{ target: 'nope' }],
        effects: [{ kind: 'pump', power: 1, toughness: 1 }] }] },
    // trigger-level slot typo
    { tplId: 'trigSlotBad', triggers: [{ event: 'card_zone_change', target_slots: [{ target: 'whoops' }],
        effects: [{ kind: 'pump', power: 1, toughness: 1 }] }] },
    // a fully-valid targeted card — must NOT be flagged
    { tplId: 'topOk', target: 'creature', effects: [{ kind: 'damage', amount: 2 }] },
  ]));
  check('returns a targetErrors list', Array.isArray(r.targetErrors), JSON.stringify(r.targetErrors));
  if (!Array.isArray(r.targetErrors)) return;
  check('effect-level typo flagged (with the bad value)',
    r.targetErrors.some(e => e.startsWith('effBad:') && e.includes('creatrue')), r.targetErrors.join('; '));
  check('card slot-level typo flagged', r.targetErrors.some(e => e.startsWith('slotBad:') && e.includes('permanant')));
  check('ability slot-level typo flagged', r.targetErrors.some(e => e.includes('abSlotBad') && e.includes('ability') && e.includes('nope')));
  check('trigger slot-level typo flagged', r.targetErrors.some(e => e.includes('trigSlotBad') && e.includes('trigger') && e.includes('whoops')));
  check('a valid targeted card is NOT flagged', !r.targetErrors.some(e => e.startsWith('topOk:')));
})();

console.log('\n=== the live shipped pool resolves every target string (stays clean) ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects(CARDS));
  check('no target-string errors in CARDS', r.targetErrors.length === 0, r.targetErrors.join('; '));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
