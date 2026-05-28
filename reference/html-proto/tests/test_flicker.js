// flicker decomposition (Slice 3 step 8 / plan-effects-refactor §4.1, line 763):
// flicker collapses to two back-to-back move_cards — move_card(battlefield→exile)
// then move_card(exile→battlefield) — on the card's top-level target() step. The
// exile→battlefield half mints a fresh iid (§3.7) and re-fires ETB triggers.
//
// One DELIBERATE behavior change vs the old monolithic flicker: the bf→exile
// half now emits emitLeavesBattlefield, so "leaves play" triggers fire (MTG-
// correct; the monolith silently skipped them). Cloudshift is the only flicker
// card and is migrated; the flicker EFFECTS handler + its card-text/AI cases
// are gone. This test casts cloudshift through the REAL resolution path.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Synthetic creatures with observable enter / leave triggers (gain_life, no
// targeting ambiguity) so we can prove the re-fire without a trigger target.
CARDS._flickerEtb = { tplId: '_flickerEtb', name: 'ETB Gainer', type: 'Creature', cost: { W: 1 }, color: 'W', colors: ['W'], power: 1, toughness: 1,
  triggers: [{ event: 'card_zone_change', condition: ['this_card', 'card_moves(anywhere, battlefield)'], effects: [{ kind: 'gain_life', scope: 'self', amount: 2 }] }] };
CARDS._flickerLtb = { tplId: '_flickerLtb', name: 'LTB Gainer', type: 'Creature', cost: { W: 1 }, color: 'W', colors: ['W'], power: 1, toughness: 1,
  triggers: [{ event: 'card_zone_change', condition: ['this_card', 'card_moves(battlefield, anywhere)'], effects: [{ kind: 'gain_life', scope: 'self', amount: 3 }] }] };

let nextIid = 9000;
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
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyForCast(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
}
function drainAll(G) {
  let safety = 60;
  while ((G.stack.length > 0 || (G.pendingTriggers || []).length > 0) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
function castCloudshiftOn(G, creature) {
  const cs = mk('cloudshift', 'you'); G.you.hand.push(cs);
  readyForCast(G, 'you');
  const cast = { type: 'castSpell', cardIid: cs.iid, targets: [{ kind: 'creature', iid: creature.iid, label: creature.name }] };
  const legal = ENGINE.isLegalAction('you', cast);
  ENGINE.executeAction('you', cast);
  drainAll(G);
  return legal;
}

console.log('=== flicker re-fires ETB + re-mints iid ===');
(() => {
  const G = newGame();
  const c = mk('_flickerEtb', 'you'); c.sick = false; G.you.battlefield.push(c);
  const oldIid = c.iid;   // snapshot: placeCardOnBattlefield re-mints c.iid in place
  const life0 = G.you.life;
  const legal = castCloudshiftOn(G, c);
  check('cast legal (your_creature target)', legal);
  check('creature is back on the battlefield', G.you.battlefield.some(x => x.tplId === '_flickerEtb'));
  const back = G.you.battlefield.find(x => x.tplId === '_flickerEtb');
  check('returned with a FRESH iid (old iid gone → removal fizzles)', !!back && back.iid !== oldIid, 'old=' + oldIid + ' new=' + (back && back.iid));
  check('ETB re-fired (gained 2 life on return)', G.you.life === life0 + 2, life0 + '→' + G.you.life);
})();

console.log('\n=== flicker fires "leaves play" triggers (deliberate behavior change) ===');
(() => {
  const G = newGame();
  const c = mk('_flickerLtb', 'you'); c.sick = false; G.you.battlefield.push(c);
  const life0 = G.you.life;
  castCloudshiftOn(G, c);
  check('LTB fired on the exile half (gained 3 life)', G.you.life === life0 + 3, life0 + '→' + G.you.life);
  check('creature still returned to the battlefield', G.you.battlefield.some(x => x.tplId === '_flickerLtb'));
})();

console.log('\n=== flickering a token ceases it (no return) ===');
(() => {
  const G = newGame();
  const tok = ENGINE.makeToken('spirit_w_1_1', 'you'); tok.sick = false; G.you.battlefield.push(tok);
  const exile0 = G.you.exile.length;
  castCloudshiftOn(G, tok);
  check('token gone from battlefield', !G.you.battlefield.some(x => x.iid === tok.iid));
  check('token did NOT return / is not in exile (ceased to exist)',
    !G.you.battlefield.some(x => x.isToken) && G.you.exile.length === exile0);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
