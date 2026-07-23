// removeSlotByIdx's caller contract: a removal must be followed by
// fixupSlotPointersAfterRemoval (route through the shared helper the
// splice-removal sites use), or cached slotIdx pointers above the removed
// index go stale. The Stapler boon slot is appended LAST at run start, so a
// merged slot minted seconds earlier in the SAME handler (cross-owner perm
// path -> fresh appendSlot) can sit ABOVE the stapler; removing the stapler
// shifts that slot down by one, and an un-fixed-up cached slotIdx then points
// out of bounds (slots[cachedIdx] === undefined).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Same pool the splice-core test uses.
const baseTpl = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
const stapleTpl = Object.keys(CARDS).find(k => k !== baseTpl && hasType(CARDS[k], 'Creature') && isSpliceableStaple(k));

console.log('=== A5-4: out-of-charges rip fixes up cached slot pointers ===');
(() => {
  // Deck lists Stapler LAST so its slot lands at the end.
  RUN.start({ cards: [...Array(5).fill('plains'), 'stapler'], colors: ['W'] });
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.mana = { C: 9, W: 9, U: 9, B: 9, R: 9, G: 9 };

  const slots0 = RUN.getSlots();
  const staplerIdx = slots0.findIndex(s => s.tplId === 'stapler');
  check('Stapler slot is last', staplerIdx === slots0.length - 1, 'idx=' + staplerIdx + ' len=' + slots0.length);
  check('Stapler slot carries charges', typeof slots0[staplerIdx].charges === 'number', 'charges=' + slots0[staplerIdx].charges);
  // Drive it to its FINAL charge so this activation rips it.
  slots0[staplerIdx].charges = 1;
  const slotsBefore = slots0.length;

  // Build the cross-owner perm splice by hand: base = OPP's creature (slotIdx
  // null -> NOT reuseBaseSlot -> a FRESH appendSlot mint above the stapler);
  // staple = YOUR creature (slotIdx null -> no staple-slot removal noise).
  let iid = 9100;
  const mkPerm = (tplId, owner, slotIdx) => {
    const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
    return Object.assign(inst, { iid: iid++, tplId, controller: owner, owner, slotIdx,
      stickers: [], empowerRolls: [], subtypeRolls: [],
      tapped: false, sick: false, damage: 0, keywords: [], damagedBySources: new Set() });
  };
  const oppBase = mkPerm(baseTpl, 'opp', null);
  const youStaple = mkPerm(stapleTpl, 'you', null);
  const stapler = Object.assign(JSON.parse(JSON.stringify(CARDS.stapler)),
    { iid: iid++, tplId: 'stapler', controller: 'you', owner: 'you', slotIdx: staplerIdx,
      chargesLeft: 1, tapped: false, sick: false, keywords: [], damagedBySources: new Set() });
  G.you.battlefield = [youStaple, stapler];
  G.opp.battlefield = [oppBase];
  const baseIid = oppBase.iid;

  // A played-slot pointer above the rip must be remapped too.
  G.you.playedSlotIdxs = new Set([staplerIdx]);

  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: stapler.iid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: oppBase.iid, label: oppBase.name },
              { kind: 'permanent', iid: youStaple.iid, label: youStaple.name }] });

  const slots = RUN.getSlots();
  const merged = G.you.battlefield.find(c => c.iid === baseIid);
  check('merged base moved to your battlefield', !!merged, merged ? 'iid=' + merged.iid : 'NOT FOUND');

  check('merged slot pointer in bounds', merged && merged.slotIdx >= 0 && merged.slotIdx < slots.length,
    merged ? 'slotIdx=' + merged.slotIdx + ' len=' + slots.length : 'no merged card');
  check('slots[merged.slotIdx] IS the merged base card', merged && slots[merged.slotIdx] && slots[merged.slotIdx].tplId === baseTpl,
    merged && slots[merged.slotIdx] ? slots[merged.slotIdx].tplId : 'undefined');

  // Guards against an over-decrement fix.
  check('Stapler slot removed', !slots.some(s => s.tplId === 'stapler'));
  check('slots length: +1 mint, -1 stapler rip', slots.length === slotsBefore, 'before=' + slotsBefore + ' after=' + slots.length);

  const stalePlayed = [...G.you.playedSlotIdxs].filter(i => i >= slots.length);
  check('playedSlotIdxs has no out-of-range pointer', stalePlayed.length === 0, 'stale=' + JSON.stringify(stalePlayed));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
