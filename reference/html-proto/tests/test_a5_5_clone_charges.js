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

console.log('\n=== A5-5 review: a charged clone Stapler SURVIVES the original ripping out of charges ===');
(() => {
  // With two Stapler instances on independent slots, the original running out of
  // charges must rip ONLY its own slot/instance — not purge every card by tplId
  // (which would also destroy the still-charged clone). Drives a real cross-owner
  // splice so the charge-accounting rip block fires.
  const baseTpl = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
  const stapleTpl = Object.keys(CARDS).find(k => k !== baseTpl && hasType(CARDS[k], 'Creature') && isSpliceableStaple(k));

  RUN.start({ cards: Array(5).fill('plains'), colors: ['W'] }, 'stapler');
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { C: 9, W: 9, U: 9, B: 9, R: 9, G: 9 };

  // Two independent Stapler slots: the boon original (1 charge, about to rip) and
  // a clone right after it (3 charges). Set up directly to avoid the reward/map flow.
  const slots = RUN.getSlots();
  const origIdx = slots.findIndex(s => s.tplId === 'stapler');
  slots.splice(origIdx + 1, 0, { tplId: 'stapler', stickers: [], charges: 3 });
  const cloneIdx = origIdx + 1;
  slots[origIdx].charges = 1;
  check('two Stapler slots exist',
    slots[origIdx].tplId === 'stapler' && slots[cloneIdx].tplId === 'stapler',
    JSON.stringify(slots.map(s => s.tplId)));

  let iid = 9300;
  const mkPerm = (tplId, owner, slotIdx, chargesLeft) => {
    const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
    return Object.assign(inst, { iid: iid++, tplId, controller: owner, owner, slotIdx,
      stickers: [], empowerRolls: [], subtypeRolls: [], chargesLeft,
      tapped: false, sick: false, damage: 0, keywords: [], damagedBySources: new Set() });
  };
  const oppBase = mkPerm(baseTpl, 'opp', null);
  const youStaple = mkPerm(stapleTpl, 'you', null);
  const actingStapler = mkPerm('stapler', 'you', origIdx, 1);
  const cloneStapler = mkPerm('stapler', 'you', cloneIdx, 3);
  G.you.battlefield = [youStaple, actingStapler, cloneStapler];
  G.opp.battlefield = [oppBase];
  const cloneIid = cloneStapler.iid;

  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: actingStapler.iid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: oppBase.iid, label: oppBase.name },
              { kind: 'permanent', iid: youStaple.iid, label: youStaple.name }] });
  // The ability goes on the stack (A3-2); drain it so the splice + charge-rip resolve.
  let drain = 20;
  while (G.stack.length > 0 && drain-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
  check('the splice resolved (acting Stapler spent its last charge)',
    RUN.getSlots().every(s => s.tplId !== 'stapler' || s.charges !== 1), 'slots=' + JSON.stringify(RUN.getSlots().map(s => s.tplId + ':' + s.charges)));

  check('A5-5: the still-charged clone Stapler SURVIVED the rip',
    G.you.battlefield.some(c => c.iid === cloneIid),
    'bf=' + JSON.stringify(G.you.battlefield.map(c => c.tplId)));
  check('the acting (out-of-charges) Stapler instance is gone',
    !G.you.battlefield.some(c => c.iid === actingStapler.iid));
  check('a Stapler run slot still exists (the clone)', RUN.getSlots().some(s => s.tplId === 'stapler'));
  const survivor = G.you.battlefield.find(c => c.iid === cloneIid);
  check('the clone Stapler still points at a valid stapler slot',
    survivor && RUN.getSlots()[survivor.slotIdx] && RUN.getSlots()[survivor.slotIdx].tplId === 'stapler',
    survivor ? 'slotIdx=' + survivor.slotIdx : 'no survivor');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
