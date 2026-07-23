// mergeStapleInto folds a spell staple into an ETB trigger on any permanent
// base (creature OR land). remapEmpowerRollForStaple must relocate an
// effects[] roll to triggers[] whenever baseIsPermanent, or the roll targets
// a card with no effects[] and applyEmpowerRoll silently no-ops.
//
// Prior-staple counts are oracle-derived (synthesizeStapledTemplate): a prior
// SPELL staple on a land base counts as +1 trigger (it becomes an ETB), so a
// later spell's roll lands on its own trigger index, not the prior spell's.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const LAND = 'mountain';     // a Land base
const SPELL = 'lava_spike';  // damage 3 spell staple
const PRIOR = 'shock';       // damage 2 spell staple (a prior chain link)
const effectsRoll = () => ({ location: 'effects', subIdx: null, effIdx: 0, field: 'amount' });

console.log('=== A5-8: empower roll survives a spell-onto-LAND splice ===');

(() => {
  // 1. Unit — the gate: a Land base (baseIsPermanent, NOT creature) relocates an
  // effects-roll to triggers, exactly as a creature base does.
  const r = remapEmpowerRollForStaple(effectsRoll(), false, false, true, 0, 0, 0);
  check('land base relocates an effects-roll -> triggers[0]',
    r.location === 'triggers' && r.subIdx === 0 && r.effIdx === 0, JSON.stringify(r));
})();

(() => {
  // 2. End-to-end: merge a spell onto a land, synthesize, apply the empower roll
  // -> the ETB trigger's damage is amplified.
  const merged = mergeSpliceData(
    { tplId: LAND, empowerRolls: [], priorStaples: [] },
    { tplId: SPELL, empowerRolls: [effectsRoll()] });
  check('staple roll remapped to triggers[0]',
    merged.empowerRolls[0].location === 'triggers' && merged.empowerRolls[0].subIdx === 0,
    JSON.stringify(merged.empowerRolls[0]));
  const card = JSON.parse(JSON.stringify(ENGINE.synthesizeStapledTemplate(LAND, merged.stapledTpls)));
  const before = card.triggers[0].effects[0].amount;
  applyEmpowerRoll(card, merged.empowerRolls[0], 1);
  check('empower amplified the ETB trigger damage (3 -> 4)',
    card.triggers[0].effects[0].amount === before + 1, before + ' -> ' + card.triggers[0].effects[0].amount);
})();

(() => {
  // 3. Control: a CREATURE base still works (no over-correction / regression).
  const cre = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
  const merged = mergeSpliceData(
    { tplId: cre, empowerRolls: [], priorStaples: [] },
    { tplId: SPELL, empowerRolls: [effectsRoll()] });
  check('creature base: staple roll -> triggers[0] (unchanged behavior)',
    merged.empowerRolls[0].location === 'triggers' && merged.empowerRolls[0].subIdx === 0,
    JSON.stringify(merged.empowerRolls[0]));
})();

(() => {
  // 4. Secondary chain leg: a land base with a PRIOR spell staple — the new
  // spell's roll must land on its OWN trigger (subIdx 1), not the prior spell's.
  const merged = mergeSpliceData(
    { tplId: LAND, empowerRolls: [], priorStaples: [PRIOR] },
    { tplId: SPELL, empowerRolls: [effectsRoll()] });
  check('chain: new spell roll lands on subIdx 1 (after the prior spell ETB)',
    merged.empowerRolls[0].subIdx === 1, JSON.stringify(merged.empowerRolls[0]));
  const card = JSON.parse(JSON.stringify(ENGINE.synthesizeStapledTemplate(LAND, merged.stapledTpls)));
  applyEmpowerRoll(card, merged.empowerRolls[0], 1);
  check('chain: lava_spike ETB amplified (3 -> 4)', card.triggers[1].effects[0].amount === 4,
    'trig1=' + card.triggers[1].effects[0].amount);
  check('chain: the prior shock ETB is NOT amplified (stays 2)', card.triggers[0].effects[0].amount === 2,
    'trig0=' + card.triggers[0].effects[0].amount);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
