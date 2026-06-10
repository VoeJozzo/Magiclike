// Audit fix A1-3 — indestructible creatures still die at toughness <= 0.
//
// Canon (docs/wiki/rules/1100-state-based-actions.md, MTG 704.5f):
// indestructible exempts a creature from the lethal-damage / deathtouch
// death checks, but a creature whose toughness is 0 or less dies anyway —
// 0-toughness death is not "destruction", so indestructible doesn't apply.
//
// Before the fix, checkDeaths()'s indestructible `continue` skipped ALL
// three death causes (damage >= t, t <= 0, dealtDeathtouch), so a creature
// shrunk to 0 toughness by -X/-X effects illegally survived.
//
// This file pins:
//   1. control: a plain creature at toughness <= 0 dies (already worked)
//   2. the fix: an INDESTRUCTIBLE creature at toughness <= 0 dies
//   3. the keyword's actual job: an indestructible creature with marked
//      damage >= toughness (toughness still > 0) SURVIVES

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9500;
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
// Pass priority for both seats until the phase changes (runs the transition's SBA).
function advanceOnePhase(G) {
  const start = G.phase;
  let safety = 16;
  while (G.phase === start && safety-- > 0) {
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

if (!VANILLA) {
  console.log('  (no vanilla creature in pool -- cannot run)');
  fail++;
} else {
  console.log('=== control: plain creature at toughness <= 0 dies ===');
  {
    const G = newGame();
    const c = mk(VANILLA, 'you');
    c.power = 2; c.toughness = 3;
    c.tempTou = -3;   // effective toughness 0 (a -X/-X debuff)
    G.you.battlefield.push(c);
    readyMain(G, 'you');
    advanceOnePhase(G);   // runs SBAs at the transition
    check('plain creature at t<=0 died',
      !G.you.battlefield.some(x => x.iid === c.iid));
    check('plain creature routed to graveyard',
      G.you.graveyard.some(x => x.iid === c.iid));
  }

  console.log('\n=== A1-3: indestructible creature at toughness <= 0 dies ===');
  {
    const G = newGame();
    const c = mk(VANILLA, 'you');
    c.keywords = ['indestructible'];
    c.power = 2; c.toughness = 3;
    c.tempTou = -3;   // effective toughness 0; no damage involved
    G.you.battlefield.push(c);
    readyMain(G, 'you');
    advanceOnePhase(G);
    check('A1-3: indestructible creature at t<=0 died (704.5f — not destruction)',
      !G.you.battlefield.some(x => x.iid === c.iid));
    check('A1-3: it routed to the graveyard',
      G.you.graveyard.some(x => x.iid === c.iid));
  }

  console.log('\n=== A1-3: deeper shrink (t strictly negative) also dies ===');
  {
    const G = newGame();
    const c = mk(VANILLA, 'you');
    c.keywords = ['indestructible'];
    c.power = 2; c.toughness = 3;
    c.permTou = -5;   // effective toughness -2
    G.you.battlefield.push(c);
    readyMain(G, 'you');
    advanceOnePhase(G);
    check('A1-3: indestructible creature at t<0 died',
      !G.you.battlefield.some(x => x.iid === c.iid));
  }

  console.log('\n=== guard: indestructible with lethal DAMAGE (t > 0) still survives ===');
  {
    const G = newGame();
    const c = mk(VANILLA, 'you');
    c.keywords = ['indestructible'];
    c.power = 2; c.toughness = 3;
    c.damage = 5;   // damage >= toughness, toughness positive
    G.you.battlefield.push(c);
    readyMain(G, 'you');
    advanceOnePhase(G);
    const live = G.you.battlefield.find(x => x.iid === c.iid);
    check('indestructible with damage >= t (t>0) survived', !!live);
    check('its marked damage was kept (F2 semantics intact)',
      live && live.damage === 5, live && ('damage=' + live.damage));
  }

  console.log('\n=== guard: indestructible + deathtouch flag (t > 0) still survives ===');
  {
    const G = newGame();
    const c = mk(VANILLA, 'you');
    c.keywords = ['indestructible'];
    c.power = 2; c.toughness = 3;
    c.damage = 1; c.dealtDeathtouch = true;
    G.you.battlefield.push(c);
    readyMain(G, 'you');
    advanceOnePhase(G);
    check('indestructible with dealtDeathtouch (t>0) survived',
      G.you.battlefield.some(x => x.iid === c.iid));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
