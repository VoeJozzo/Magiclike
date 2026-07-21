// declareAttackers legality rejects duplicate iids via a seen-Set that
// rejects re-use rather than deduping, mirroring declareBlockers' usedBlockers
// Set. §801 step 505: attackers are declared by tapping each — set
// membership, one attack role per creature. executeAction is the public
// protocol surface (tests, console, imported actions, future callers); do*
// handlers assume isLegalAction-validated input.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9900;
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
  setup.startMainPhase(who);
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

if (!VANILLA || !CARDS['plains']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A2-4: duplicate iids in declareAttackers are rejected ===');
  {
    const G = newGame();
    const A = mk(VANILLA, 'you');
    A.power = 2; A.toughness = 2; A.sick = false;
    G.you.battlefield.push(A);
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    check('reached COMBAT_ATTACK', G.phase === 'COMBAT_ATTACK', 'phase=' + G.phase);

    // A successful declareAttackers fast-forwards through the whole combat
    // inside this call — the empty-board defender auto-declares no blocks
    // and auto-passes drive to MAIN2 — so the assertions read executeAction's
    // return, the phase, and the final life total, not mid-combat lists.
    const okDup = ENGINE.executeAction('you', {
      type: 'declareAttackers', cardIids: [A.iid, A.iid],
    });
    check('A2-4: duplicate declaration is ILLEGAL (executeAction false)',
      !okDup, 'returned=' + okDup);
    check('A2-4: the rejected action declared nothing (still in COMBAT_ATTACK)',
      G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared,
      'phase=' + G.phase + ' declared=' + G.attackersDeclared);

    const okSingle = ENGINE.executeAction('you', {
      type: 'declareAttackers', cardIids: [A.iid],
    });
    check('legal single declaration still accepted after the rejection',
      !!okSingle, 'returned=' + okSingle);
    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('A2-4: the attacker dealt its damage exactly ONCE (2, not 4)',
      oppLifeAtStart - G.opp.life === 2,
      'face damage=' + (oppLifeAtStart - G.opp.life));
  }

  console.log('\n=== guard: normal multi-attacker declaration unaffected ===');
  {
    const G = newGame();
    const A = mk(VANILLA, 'you');
    A.power = 2; A.toughness = 2; A.sick = false;
    const B = mk(VANILLA, 'you');
    B.power = 3; B.toughness = 3; B.sick = false;
    G.you.battlefield.push(A, B);
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    const okBoth = ENGINE.executeAction('you', {
      type: 'declareAttackers', cardIids: [A.iid, B.iid],
    });
    check('distinct multi-attacker declaration accepted',
      !!okBoth, 'returned=' + okBoth);

    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('both attackers dealt damage once each (2+3=5)',
      oppLifeAtStart - G.opp.life === 5,
      'face damage=' + (oppLifeAtStart - G.opp.life));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
