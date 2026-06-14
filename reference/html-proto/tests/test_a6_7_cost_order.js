// Audit A6-7 — multi-sticker cost resolution is apply-order (= acquisition-order)
// dependent: a cost_mod floor vs a set_color('C') pip-fold give different final
// generic cost depending on which sticker applied first. Canon is silent and the
// case is P3-rare (one slot carrying BOTH cost_minus_1 AND Bleach), so the chosen
// remediation is fork (b): DOCUMENT acquisition-order as canonical + pin it here.
// (Fork (a), order-independent resolution, would change the castable cost and
// needs a design ruling — see the audit note. If taken, flip the two divergence
// asserts below to assertEqual.)
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const mk = (stickers) => {
  const c = { tplId: 'x', name: 'x', cost: { W: 2, C: 0 }, modifiers: [], stickers,
              empowerRolls: [], subtypeRolls: [] };
  applyStickersToCard(c);
  return c;
};

console.log('=== A6-7: cost_mod + set_color order (current = acquisition order) ===');
(() => {
  const a = mk([{ kind: 'cost_mod', amount: -1, stackable: true }, { kind: 'set_color', color: 'C' }]);
  const b = mk([{ kind: 'set_color', color: 'C' }, { kind: 'cost_mod', amount: -1, stackable: true }]);
  // cost_mod-first: C floors at 0, then fold W2 -> C2. set_color-first: fold W2 -> C2, then -1 -> C1.
  check('cost_mod-then-bleach yields C=2', a.cost.C === 2, 'C=' + a.cost.C);
  check('bleach-then-cost_mod yields C=1', b.cost.C === 1, 'C=' + b.cost.C);
  check('=> order currently MATTERS (documents the gap; fork-b pins it)', a.cost.C !== b.cost.C);
})();

console.log('\n=== A6-7 control: single-sticker paths unchanged ===');
(() => {
  check('cost_mod only: W2,C0 -> C0 (floored)', mk([{ kind: 'cost_mod', amount: -1, stackable: true }]).cost.C === 0);
  check('set_color only: W2 fold -> C2', mk([{ kind: 'set_color', color: 'C' }]).cost.C === 2);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
