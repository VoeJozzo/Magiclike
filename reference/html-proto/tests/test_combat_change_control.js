// Audit fix A2-5 — change_control removes the creature from combat.
//
// change_control spliced the card between battlefields and touched nothing
// else. findCard searches BOTH battlefields, so (unlike death/bounce) the
// swapped creature still resolved in dealCombatDamage — and since the
// defender is fixed at start of combat but the damage credit reads the LIVE
// controller, a mid-combat stolen attacker dealt its combat damage TO ITS
// OWN NEW CONTROLLER. A stolen (vigilance) attacker could also legally be
// declared to block ITSELF.
//
// Fix: change_control now calls removeFromCombat(iid) (the shared A2-3
// helper) on a successful control swap — real MTG removes a permanent from
// combat when its controller changes (CR 506.4c); canon §801 documents it.
//
// This file pins:
//   1. a stolen ATTACKER is pruned from G.attackers and deals NO damage
//      (pre-fix it damaged its own new controller)
//   2. a stolen attacker can NOT be assigned to block itself
//   3. a stolen BLOCKER stops participating: no damage exchange (pre-fix
//      the stolen creature still traded damage with its old attacker),
//      while the attacker it was blocking STAYS blocked (510.1c)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9800;
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
// Untapped lands + a castable card keep hasNoAction() false so the engine's
// auto-pass fast-path doesn't consume the combat priority rounds before the
// test can act in them (same trick as test_combat_ghost_attacker.js).
function giveHold(G, who) {
  G[who].battlefield.push(mk('mountain', who));
  G[who].hand.push(mk('lightning_bolt', who));
}
function steal(G, toCtrl, iid) {
  ENGINE.applyEffect(
    { controller: toCtrl, sourceName: 'Test Steal', sourceIid: -1 },
    { kind: 'change_control', duration: 'permanent' },
    { kind: 'creature', iid });
}
function passUntil(G, done, max) {
  let safety = max || 30;
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

if (!VANILLA || !CARDS['lightning_bolt'] || !CARDS['mountain']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A2-5: a stolen ATTACKER leaves combat (no damage to anyone) ===');
  {
    const G = newGame();
    const A = mk(VANILLA, 'you');
    A.power = 2; A.toughness = 2; A.sick = false;
    G.you.battlefield.push(A);
    giveHold(G, 'you');
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;
    const youLifeAtStart = G.you.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [A.iid] });
    check('A declared as attacker', G.attackers.includes(A.iid));
    // Pass to the block window (empty-board defender auto-no-blocks).
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && G.blockersDeclared, 10);
    check('block window reached', G.phase === 'COMBAT_BLOCK' && G.blockersDeclared,
      'phase=' + G.phase);

    // The defender steals the attacker mid-combat.
    steal(G, 'opp', A.iid);
    check('A is on the opponent battlefield',
      G.opp.battlefield.some(c => c.iid === A.iid));
    check('A2-5: the control change pruned A from G.attackers',
      !G.attackers.includes(A.iid), 'attackers=' + JSON.stringify(G.attackers));

    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('A2-5: the stolen attacker did NOT damage its new controller',
      G.opp.life === oppLifeAtStart,
      'life ' + oppLifeAtStart + ' -> ' + G.opp.life);
    check('the original controller took no damage either',
      G.you.life === youLifeAtStart,
      'life ' + youLifeAtStart + ' -> ' + G.you.life);
  }

  console.log('\n=== A2-5: a stolen attacker cannot be assigned to block ITSELF ===');
  {
    const G = newGame();
    const X = mk(VANILLA, 'you');
    X.power = 2; X.toughness = 2; X.sick = false;
    X.keywords = ['vigilance'];   // stays untapped after attacking
    G.you.battlefield.push(X);
    // The defender needs an eligible blocker so the machine pauses at the
    // block declaration instead of auto-declaring no blocks.
    const W = mk(VANILLA, 'opp');
    W.power = 0; W.toughness = 3; W.sick = false;
    G.opp.battlefield.push(W);
    readyMain(G, 'you');

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [X.iid] });
    check('X declared as attacker', G.attackers.includes(X.iid));
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
    check('waiting on the block declaration',
      G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 'phase=' + G.phase);

    // The defender steals the (untapped, vigilance) attacker pre-blocks.
    steal(G, 'opp', X.iid);
    check('X is on the opponent battlefield',
      G.opp.battlefield.some(c => c.iid === X.iid));
    check('A2-5: X blocking ITSELF is rejected',
      !ENGINE.isLegalAction('opp', {
        type: 'declareBlockers', blockMap: new Map([[X.iid, X.iid]]),
      }));
    check('A2-5: the control change pruned X from G.attackers',
      !G.attackers.includes(X.iid), 'attackers=' + JSON.stringify(G.attackers));
  }

  console.log('\n=== A2-5: a stolen BLOCKER stops participating in combat ===');
  {
    const G = newGame();
    const atk = mk(VANILLA, 'you');
    atk.power = 2; atk.toughness = 2; atk.sick = false;
    G.you.battlefield.push(atk);
    giveHold(G, 'you');
    const blk = mk(VANILLA, 'opp');
    blk.power = 1; blk.toughness = 1; blk.sick = false;
    G.opp.battlefield.push(blk);
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
    const okBlock = ENGINE.executeAction('opp', {
      type: 'declareBlockers', blockMap: new Map([[blk.iid, atk.iid]]),
    });
    check('blocker declared', !!okBlock && G.blockers.get(blk.iid) === atk.iid);

    // The ATTACKING player steals the blocker in the block-window round.
    steal(G, 'you', blk.iid);
    check('the blocker is on your battlefield',
      G.you.battlefield.some(c => c.iid === blk.iid));
    check('A2-5: the live blocker entry is retired',
      G.blockers.get(blk.iid) === undefined,
      'entry=' + JSON.stringify(G.blockers.get(blk.iid)));

    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('A2-5: the stolen blocker no longer trades damage (it survived)',
      G.you.battlefield.some(c => c.iid === blk.iid));
    const fAtk = G.you.battlefield.find(c => c.iid === atk.iid);
    check('A2-5: the attacker took no blocker damage', fAtk && fAtk.damage === 0,
      fAtk && ('damage=' + fAtk.damage));
    check('510.1c: the attacker STAYED blocked — no face damage',
      G.opp.life === oppLifeAtStart,
      'life ' + oppLifeAtStart + ' -> ' + G.opp.life);
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
