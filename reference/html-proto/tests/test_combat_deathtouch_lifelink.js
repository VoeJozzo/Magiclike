// Audit fix A2-7 — deathtouch lethal dose vs indestructible + lifelink
// overkill full-gain. Design ruling (PR #98, 2026-06-10):
//   "1 point of deathtouch damage is lethal. Indestructible creatures
//    survive lethal damage."
//   "Lifelink should always gain its full power, even when that damage is
//    overkill."
//
// Pre-fix, dealCombatDamage's lethal-threshold ternary carved indestructible
// blockers OUT of deathtouch's 1-damage dose (`atkDeathtouch &&
// !indestructible`): a deathtouch trampler had to assign the indestructible
// blocker's FULL remaining toughness before anything spilled — a 3-power
// deathtouch+trample attacker vs Iron Statue (0/5 indestructible) trampled
// 0 instead of 2. The ruling removes the carve-out: the dose is 1 vs every
// blocker; indestructibles are lethal-marked but survive (the immunity
// lives in checkDeaths). ai.js's simulateCombat mirrored the identical
// carve-out and changes in lockstep.
//
// Lifelink: the "all blockers satisfied + no trample" leftover arm wasted
// the remainder with NO lifelink — a 6/6 lifelink attacker over a 2/2
// blocker gained 2, not 6. Per the ruling it now gains its full power.
//
// This file pins:
//   1. deathtouch+trample vs Iron Statue: dose 1, spill 2 to the defender,
//      statue lethal-marked but alive
//   2. deathtouch+lifelink (no trample) vs Iron Statue: dose 1 satisfies,
//      overkill wasted but lifelink gains full power (3)
//   3. lifelink overkill full-gain: 6/6 lifelink vs 2/2 blocker, no
//      trample -> gains 6 (2 assigned + 4 wasted)
//   4. guard (green before AND after): lifelink+trample 6/6 vs 2/2 ->
//      gains 6 (2 + 4 spill), defender takes 4
//   5. guard (green before AND after): deathtouch vs a KILLABLE blocker —
//      dose 1, blocker dies at the SBA sweep

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9950;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
}
function passUntil(G, done, max) {
  let safety = max || 40;
  while (!done() && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

// Drive one full combat: `you` attacks with a creature of the given stats/
// keywords; the given defender creature blocks it. Returns observations.
function runCombat({ atkPower, atkTou, atkKeywords, blockerTpl, blockerStats }) {
  const G = newGame();
  const atk = mk(VANILLA, 'you');
  atk.power = atkPower; atk.toughness = atkTou; atk.sick = false;
  atk.keywords = atkKeywords.slice();
  G.you.battlefield.push(atk);
  const blk = mk(blockerTpl, 'opp');
  blk.sick = false;
  if (blockerStats) { blk.power = blockerStats[0]; blk.toughness = blockerStats[1]; }
  G.opp.battlefield.push(blk);
  readyMain(G, 'you');
  const oppLifeAtStart = G.opp.life;
  const youLifeAtStart = G.you.life;

  passUntil(G, () => G.phase === 'COMBAT_ATTACK');
  ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
  passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
  const okBlock = ENGINE.executeAction('opp', {
    type: 'declareBlockers', blockMap: new Map([[blk.iid, atk.iid]]),
  });
  passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
  const blkNow = G.opp.battlefield.find(c => c.iid === blk.iid);
  return {
    G, atk, blk, okBlock,
    faceDamage: oppLifeAtStart - G.opp.life,
    lifeGain: G.you.life - youLifeAtStart,
    blockerAlive: !!blkNow,
    blockerDamage: blkNow ? blkNow.damage : null,
    blockerMarked: blkNow ? !!blkNow.dealtDeathtouch : null,
    blockerDied: G.opp.graveyard.some(c => c.iid === blk.iid),
    reachedMain2: G.phase === 'MAIN2',
  };
}

if (!VANILLA || !CARDS['iron_statue'] || !CARDS['plains']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A2-7: deathtouch+trample vs Iron Statue — dose is 1, remainder tramples ===');
  {
    const r = runCombat({
      atkPower: 3, atkTou: 4, atkKeywords: ['deathtouch', 'trample'],
      blockerTpl: 'iron_statue',
    });
    check('block declared', !!r.okBlock);
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('A2-7: deathtouch dose vs indestructible is 1 (statue marked 1)',
      r.blockerDamage === 1, 'statue damage=' + r.blockerDamage);
    check('A2-7: remainder tramples to the defender (2)',
      r.faceDamage === 2, 'face damage=' + r.faceDamage);
    check('A2-7: statue is lethal-marked (dealtDeathtouch)',
      r.blockerMarked === true, 'marked=' + r.blockerMarked);
    check('ruling: indestructible SURVIVES the lethal deathtouch damage',
      r.blockerAlive && !r.blockerDied);
  }

  console.log('\n=== A2-7: deathtouch+lifelink (no trample) vs Iron Statue — full-power gain ===');
  {
    const r = runCombat({
      atkPower: 3, atkTou: 4, atkKeywords: ['deathtouch', 'lifelink'],
      blockerTpl: 'iron_statue',
    });
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('A2-7: dose 1 satisfies the statue (no dump pile-on)',
      r.blockerDamage === 1, 'statue damage=' + r.blockerDamage);
    check('ruling: lifelink gains FULL power (1 assigned + 2 overkill = 3)',
      r.lifeGain === 3, 'life gain=' + r.lifeGain);
    check('no trample: nothing hits the face', r.faceDamage === 0,
      'face damage=' + r.faceDamage);
    check('statue survives', r.blockerAlive && !r.blockerDied);
  }

  console.log('\n=== lifelink overkill full-gain: 6/6 lifelink vs 2/2, no trample ===');
  {
    const r = runCombat({
      atkPower: 6, atkTou: 6, atkKeywords: ['lifelink'],
      blockerTpl: VANILLA, blockerStats: [2, 2],
    });
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('the 2/2 blocker died', r.blockerDied);
    check('ruling: lifelink gains FULL power (2 assigned + 4 overkill = 6)',
      r.lifeGain === 6, 'life gain=' + r.lifeGain);
    check('no trample: nothing hits the face', r.faceDamage === 0,
      'face damage=' + r.faceDamage);
    check('attacker took the blocker\'s 2 back', r.atk.damage === 2,
      'attacker damage=' + r.atk.damage);
  }

  console.log('\n=== guard: lifelink+trample 6/6 vs 2/2 — full gain via spill (green pre/post) ===');
  {
    const r = runCombat({
      atkPower: 6, atkTou: 6, atkKeywords: ['lifelink', 'trample'],
      blockerTpl: VANILLA, blockerStats: [2, 2],
    });
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('the 2/2 blocker died', r.blockerDied);
    check('trample: 4 spills to the defender', r.faceDamage === 4,
      'face damage=' + r.faceDamage);
    check('lifelink gains full power via assignment + spill (2+4=6)',
      r.lifeGain === 6, 'life gain=' + r.lifeGain);
  }

  console.log('\n=== guard: deathtouch vs a KILLABLE blocker — dose 1 kills (green pre/post) ===');
  {
    const r = runCombat({
      atkPower: 3, atkTou: 4, atkKeywords: ['deathtouch'],
      blockerTpl: VANILLA, blockerStats: [2, 4],
    });
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('dose 1 lethal-marks the 2/4 blocker and it dies at SBA',
      r.blockerDied, 'died=' + r.blockerDied);
    check('no trample: nothing hits the face', r.faceDamage === 0,
      'face damage=' + r.faceDamage);
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
