// Audit A5-5 — a cloned Stapler slot had no `charges` field, so the engine
// charge gate (`typeof stSlot.charges === 'number'`) read it as infinite: the
// clone never decremented, never ripped, and the UI showed "3 charges" forever.
// Joe Option A (PR #98): photocopy the source slot's REMAINING charges onto the
// clone — a copy of a half-used Stapler is half-used.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Drive the REAL clone reward branch: a win sets a (mutable) reward offer; we
// force it to a single clone candidate aimed at a chosen slot, then commit.
function cloneSlot(targetIdx) {
  RUN.recordResult('you', [], []);
  const reward = RUN.getReward();
  reward.candidates = [{ kind: 'clone', slotIdx: targetIdx }];
  RUN.pickRewardCandidate(0);
  return RUN.getSlots();
}

console.log('=== A5-5: cloning a half-used Stapler photocopies its REMAINING charges ===');
(() => {
  RUN.start({ cards: Array(5).fill('mountain'), colors: ['R'] }, 'stapler');
  const slots = RUN.getSlots();
  const stIdx = slots.findIndex(s => s.tplId === 'stapler');
  check('Stapler boon slot present', stIdx >= 0, 'idx=' + stIdx);
  check('Stapler slot starts at 3 charges', slots[stIdx].charges === 3, 'charges=' + slots[stIdx].charges);
  slots[stIdx].charges = 1;   // half-used

  const after = cloneSlot(stIdx);
  const clone = after[stIdx + 1];
  check('clone slot inserted after the original', clone && clone.tplId === 'stapler', clone ? clone.tplId : 'none');
  check('clone carries a numeric charges field (was: undefined -> infinite)',
    clone && typeof clone.charges === 'number', clone ? typeof clone.charges : 'n/a');
  check('clone photocopies REMAINING charges (1, not a fresh 3)',
    clone && clone.charges === 1, clone ? 'charges=' + clone.charges : 'n/a');
  check('original Stapler slot is untouched at 1', after[stIdx].charges === 1, 'charges=' + after[stIdx].charges);
})();

console.log('\n=== control: cloning a non-charges slot adds NO charges field (guard is a pure superset) ===');
(() => {
  RUN.start({ cards: Array(5).fill('mountain'), colors: ['R'] }, 'stapler');
  const after = cloneSlot(0);   // slot 0 is a mountain — no charges
  const clone = after[1];
  check('mountain clone inserted', clone && clone.tplId === 'mountain', clone ? clone.tplId : 'none');
  check('mountain clone has NO charges field', clone && !('charges' in clone),
    clone ? JSON.stringify(Object.keys(clone)) : 'none');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
