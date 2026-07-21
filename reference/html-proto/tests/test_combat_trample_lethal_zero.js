// Trample vs a blocker whose lethalNeeded is already 0.
//
// dealCombatDamage's lethalNeeded = max(0, toughness - marked damage) is the
// per-blocker remaining-damage figure. A LIVING blocker can answer 0 — a
// fully-marked indestructible retains marked damage, so lethalNeeded can hit
// 0 while the blocker is still alive.
// Canon §803: with trample the attacker need only assign each blocker's
// REMAINING toughness (0 ⇒ satisfied with 0) before the rest spills over.
//
// `remaining >= lethalNeeded` decides satisfied; the `lethalNeeded > 0` check
// applies only inside that satisfied arm, so a 0-damage recordDamage never
// falsely stakes a kill claim. ai.js's simulateCombat mirrors the same
// comparison, keeping AI prediction in lockstep with the engine.

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

function runCombat({ trample, preMark }) {
  const G = newGame();
  const atk = mk(VANILLA, 'you');
  atk.power = 6; atk.toughness = 6; atk.sick = false;
  atk.keywords = trample ? ['trample'] : [];
  G.you.battlefield.push(atk);
  const statue = mk('iron_statue', 'opp');
  statue.sick = false;
  statue.damage = preMark;   // indestructibles retain marked damage
  G.opp.battlefield.push(statue);
  readyMain(G, 'you');
  const oppLifeAtStart = G.opp.life;

  passUntil(G, () => G.phase === 'COMBAT_ATTACK');
  ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
  passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
  const okBlock = ENGINE.executeAction('opp', {
    type: 'declareBlockers', blockMap: new Map([[statue.iid, atk.iid]]),
  });
  passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
  const statueNow = G.opp.battlefield.find(c => c.iid === statue.iid);
  return {
    G, atk, statue, okBlock, oppLifeAtStart,
    faceDamage: oppLifeAtStart - G.opp.life,
    statueAlive: !!statueNow,
    statueDamage: statueNow ? statueNow.damage : null,
    reachedMain2: G.phase === 'MAIN2',
  };
}

if (!VANILLA || !CARDS['iron_statue'] || !CARDS['plains']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A2-2: fully-marked indestructible blocker (lethalNeeded 0) vs 6/6 trampler ===');
  {
    const r = runCombat({ trample: true, preMark: 5 });
    check('block declared', !!r.okBlock);
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('A2-2: full remainder tramples to the defender (6)',
      r.faceDamage === 6, 'face damage=' + r.faceDamage);
    check('A2-2: zero-need blocker takes NO extra damage (stays at 5)',
      r.statueDamage === 5, 'statue damage=' + r.statueDamage);
    check('statue survives (indestructible)', r.statueAlive);
    check('attacker took the statue\'s 0 power back (undamaged)',
      r.atk.damage === 0, 'attacker damage=' + r.atk.damage);
  }

  console.log('\n=== control: partially-marked statue (lethalNeeded 2) — boundary respected ===');
  {
    const r = runCombat({ trample: true, preMark: 3 });
    check('block declared', !!r.okBlock);
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('attacker assigns the 2 still needed, spills 4',
      r.faceDamage === 4, 'face damage=' + r.faceDamage);
    check('statue marked exactly to full toughness (3+2=5)',
      r.statueDamage === 5, 'statue damage=' + r.statueDamage);
    check('statue survives (indestructible)', r.statueAlive);
  }

  console.log('\n=== guard: NO trample, fully-marked statue — leftover wasted, not dumped ===');
  {
    const r = runCombat({ trample: false, preMark: 5 });
    check('block declared', !!r.okBlock);
    check('combat completed (reached MAIN2)', r.reachedMain2, 'phase=' + r.G.phase);
    check('no trample: nothing hits the face',
      r.faceDamage === 0, 'face damage=' + r.faceDamage);
    check('zero-need blocker is not a dump target (stays at 5)',
      r.statueDamage === 5, 'statue damage=' + r.statueDamage);
    check('statue survives (indestructible)', r.statueAlive);
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
