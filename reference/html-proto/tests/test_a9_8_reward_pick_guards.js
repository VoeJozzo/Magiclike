// Audit A9-8 — reward-pick guard symmetry. The sticker/ripUp pick arms now do
// the bounds re-check (and the sticker arm the non-stackable dedup) that the
// other pick arms (twoStickers/clone/transform/splice) and the canonical
// applyStickerToSlot already perform. Unreachable in normal play (the reward is
// pre-rolled single-shot and the offer never lists a non-stackable id a slot
// already has), so these are guard/characterization assertions driven through a
// test-only pendingReward seam — which also seeds the previously-absent
// reward-pick coverage (a valid sticker applies; a valid ripUp removes).
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const reward = (candidates) => ({ phase: 'mixed', candidates });
const freshRun = () => { RUN.clearSave(); RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null); };

console.log('=== A9-8: sticker arm out-of-bounds slotIdx does not throw ===');
(() => {
  freshRun();
  const n = RUN.getSlots().length;
  RUN._setPendingRewardForTest(reward([{ kind: 'sticker', slotIdx: n /* one past end */, sticker_id: 'plus1_plus1' }]));
  let threw = null;
  try { RUN.pickRewardCandidate(0); } catch (e) { threw = e; }
  check('OOB sticker pick does not throw', threw === null, threw ? String(threw.message) : undefined);
  check('reward cleared after OOB sticker pick', RUN.getReward() == null);
})();

console.log('\n=== A9-8: ripUp arm out-of-bounds slotIdx is a no-op ===');
(() => {
  freshRun();
  const before = RUN.getSlots().length;
  RUN._setPendingRewardForTest(reward([{ kind: 'ripUp', slotIdx: before /* OOB */ }]));
  let threw = null;
  try { RUN.pickRewardCandidate(0); } catch (e) { threw = e; }
  check('OOB ripUp pick does not throw', threw === null, threw ? String(threw.message) : undefined);
  check('slot count unchanged after OOB ripUp', RUN.getSlots().length === before, 'len=' + RUN.getSlots().length);
})();

console.log('\n=== A9-8: non-stackable dedup on the single-sticker arm ===');
(() => {
  freshRun();
  const id = 'innate';   // STICKERS.innate.stackable === false
  const slots = RUN.getSlots();
  if (!slots[0].stickers.includes(id)) slots[0].stickers.push(id);
  RUN._setPendingRewardForTest(reward([{ kind: 'sticker', slotIdx: 0, sticker_id: id }]));
  RUN.pickRewardCandidate(0);
  const count = RUN.getSlots()[0].stickers.filter(s => s === id).length;
  check('non-stackable id present exactly once after re-offer', count === 1, 'count=' + count);
})();

console.log('\n=== A9-8 happy path (reward-pick coverage seed) ===');
(() => {
  freshRun();
  RUN._setPendingRewardForTest(reward([{ kind: 'sticker', slotIdx: 0, sticker_id: 'innate' }]));
  RUN.pickRewardCandidate(0);
  check('valid sticker pick adds the sticker', RUN.getSlots()[0].stickers.includes('innate'));
  check('reward cleared after valid sticker pick', RUN.getReward() == null);

  const before = RUN.getSlots().length;
  RUN._setPendingRewardForTest(reward([{ kind: 'ripUp', slotIdx: 1 }]));
  RUN.pickRewardCandidate(0);
  check('valid ripUp removes one slot', RUN.getSlots().length === before - 1, 'len=' + RUN.getSlots().length);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
