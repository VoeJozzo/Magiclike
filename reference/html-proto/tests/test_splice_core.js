// Splice harmonization (plan-effects-refactor §7, steps 0+11): the merge math
// that was duplicated between RUN.applySplice (reward-time, slot data) and
// EFFECTS.apply_in_game_splice (in-game Stapler, runtime cards) is now one shared
// `mergeSpliceData(base, staple)` core. This test:
//   1. unit-checks the core (concat + empower-roll remap + bonus precedence), and
//   2. proves the two pathways agree — splice the SAME two cards via the reward
//      path and the in-game path, assert the resulting merged slot data matches.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
function eqArr(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }

// Two vanilla spliceable creatures (creature+creature merge).
const baseTpl = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
const stapleTpl = Object.keys(CARDS).find(k => k !== baseTpl && hasType(CARDS[k], 'Creature') && isSpliceableStaple(k));

console.log('=== mergeSpliceData core: concat + bonus precedence + chain ===');
(() => {
  const merged = mergeSpliceData(
    { tplId: baseTpl, stickers: ['plus1_plus1'], empowerRolls: [], subtypeRolls: ['Goblin'],
      permaBuffs: [{ power: 1, toughness: 0 }], bonusTrigger: null, priorStaples: [] },
    { tplId: stapleTpl, stickers: ['cost_minus_1'], empowerRolls: [], subtypeRolls: ['Wizard'],
      permaBuffs: [{ power: 0, toughness: 1 }], bonusTrigger: { foo: 1 } });
  check('stapledTpls = priorStaples + staple', eqArr(merged.stapledTpls, [stapleTpl]), JSON.stringify(merged.stapledTpls));
  check('stickers concat (base then staple)', eqArr(merged.stickers, ['plus1_plus1', 'cost_minus_1']));
  check('subtypeRolls concat', eqArr(merged.subtypeRolls, ['Goblin', 'Wizard']));
  check('permaBuffs concat', merged.permaBuffs.length === 2);
  check('bonusTrigger: staple inherited when base lacks one', merged.bonusTrigger && merged.bonusTrigger.foo === 1);
})();

console.log('\n=== bonus precedence: base wins when both present ===');
(() => {
  const merged = mergeSpliceData(
    { tplId: baseTpl, bonusTrigger: { which: 'base' }, priorStaples: [] },
    { tplId: stapleTpl, bonusTrigger: { which: 'staple' } });
  check('base bonusTrigger wins', merged.bonusTrigger.which === 'base');
})();

console.log('\n=== empower-roll remap accounts for prior staple chain ===');
(() => {
  // A creature base + a prior creature staple with 1 trigger: a staple empower
  // roll on a trigger must shift its subIdx by the prior staple's trigger count.
  const priorWithTrigger = Object.keys(CARDS).find(k =>
    hasType(CARDS[k], 'Creature') && isSpliceableStaple(k) && (CARDS[k].triggers || []).length >= 1);
  if (!priorWithTrigger) { check('(skipped: no creature staple with a trigger in pool)', true); return; }
  const roll = { location: 'triggers', subIdx: 0, effIdx: 0, field: 'amount' };
  const baseTriggers = (CARDS[baseTpl].triggers || []).length;
  const priorTriggers = (CARDS[priorWithTrigger].triggers || []).length;
  const merged = mergeSpliceData(
    { tplId: baseTpl, empowerRolls: [], priorStaples: [priorWithTrigger] },
    { tplId: stapleTpl, empowerRolls: [roll] });
  // Only meaningful when both base and staple are creatures (trigger-merge case).
  if (hasType(CARDS[baseTpl], 'Creature') && hasType(CARDS[stapleTpl], 'Creature')) {
    const expected = baseTriggers + priorTriggers;
    check('staple trigger-roll subIdx shifted past base + prior triggers',
      merged.empowerRolls[0].subIdx === expected, 'got ' + merged.empowerRolls[0].subIdx + ' expected ' + expected);
  } else {
    check('(merge case not creature+creature; remap path not exercised)', true);
  }
})();

console.log('\n=== the two pathways agree on merged slot data (identical end state) ===');
(() => {
  // Reward path: two slots, RUN.applySplice, read the merged base slot.
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  const slots = RUN.getSlots();
  slots.length = 0;
  slots.push({ tplId: baseTpl, stickers: ['plus1_plus1'], empowerRolls: [], subtypeRolls: [] });
  slots.push({ tplId: stapleTpl, stickers: ['cost_minus_1'], empowerRolls: [], subtypeRolls: [] });
  const ok = RUN.applySplice(0, 1);
  check('reward-path applySplice succeeded', ok === true);
  const rewardSlot = RUN.getSlots()[0];

  // In-game path: same two as battlefield perms with run slots; Stapler staples.
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { C: 9, W: 9, U: 9, B: 9, R: 9, G: 9 };
  const igSlots = RUN.getSlots();
  igSlots.length = 0;
  igSlots.push({ tplId: baseTpl, stickers: ['plus1_plus1'], empowerRolls: [], subtypeRolls: [] });
  igSlots.push({ tplId: stapleTpl, stickers: ['cost_minus_1'], empowerRolls: [], subtypeRolls: [] });
  let iid = 8800;
  const mkPerm = (tplId, slotIdx) => {
    const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
    return Object.assign(inst, { iid: iid++, tplId, controller: 'you', owner: 'you', slotIdx,
      stickers: tplId === baseTpl ? ['plus1_plus1'] : ['cost_minus_1'], empowerRolls: [], subtypeRolls: [],
      tapped: false, sick: false, damage: 0, keywords: [], damagedBySources: new Set() });
  };
  const baseCard = mkPerm(baseTpl, 0);
  const stapleCard = mkPerm(stapleTpl, 1);
  const stapler = Object.assign(JSON.parse(JSON.stringify(CARDS.stapler)),
    { iid: iid++, tplId: 'stapler', controller: 'you', owner: 'you', tapped: false, sick: false,
      chargesLeft: 3, keywords: [], damagedBySources: new Set() });
  G.you.battlefield.push(baseCard, stapleCard, stapler);
  const slotsBefore = RUN.getSlots().length;
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: stapler.iid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: baseCard.iid, label: baseCard.name },
              { kind: 'permanent', iid: stapleCard.iid, label: stapleCard.name }] });
  // The merged base card carries its slot index; read that minted/updated slot.
  const mergedBaseCard = G.you.battlefield.find(c => c.tplId === baseTpl);
  const igSlot = RUN.getSlots()[mergedBaseCard.slotIdx];
  check('in-game path produced a merged slot', !!igSlot);

  check('stapledTpls match across paths', eqArr(rewardSlot.stapledTpls, igSlot.stapledTpls),
    'reward=' + JSON.stringify(rewardSlot.stapledTpls) + ' ingame=' + JSON.stringify(igSlot.stapledTpls));
  check('stickers match across paths', eqArr(rewardSlot.stickers, igSlot.stickers),
    'reward=' + JSON.stringify(rewardSlot.stickers) + ' ingame=' + JSON.stringify(igSlot.stickers));
  check('empowerRolls match across paths', eqArr(rewardSlot.empowerRolls, igSlot.empowerRolls));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
