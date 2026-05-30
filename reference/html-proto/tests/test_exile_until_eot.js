// exile_until_eot decomposition (Slice 3 / plan-effects-refactor §4.1):
// the old monolithic exileUntilEOT handler is gone. Otherworldly Journey now
// resolves as a top-level target() step plus two effects —
//   move_card(battlefield→exile, selector:target)
//   schedule_delayed(when:end_step, effects:[move_card(exile→battlefield, selector:target)])
// The end-step half re-enters the creature via placeCardOnBattlefield, which
// mints a FRESH iid (§3.7) and re-fires ETB. A token that gets exiled ceases to
// exist (it's not in any zone at end step, so the return move_card no-ops).
// Opp-OWNED creatures route back to their owner's battlefield, not the caster's.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

CARDS._ojEtb = { tplId: '_ojEtb', name: 'OJ ETB Gainer', type: 'Creature', cost: { W: 1 }, color: 'W', colors: ['W'], power: 1, toughness: 1,
  triggers: [{ event: 'card_zone_change', condition: ['this_card', 'card_moves(anywhere, battlefield)'], effects: [{ kind: 'gain_life', scope: 'self', amount: 2 }] }] };

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
// Drive the turn to its end so CLEANUP fires the delayed trigger. Both players
// pass priority at every window; no attackers are declared, so combat
// fast-forwards. Stop once the turn counter advances (cleanup completed).
function endTurn(G) {
  const startTurn = G.turn;
  let safety = 200;
  while (G.turn === startTurn && safety-- > 0) {
    const w = ENGINE.expectedActor();
    if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
function castOJOn(G, creature) {
  const oj = mk('otherworldly_journey', 'you'); G.you.hand.push(oj);
  readyForCast(G, 'you');
  const cast = { type: 'castSpell', cardIid: oj.iid, targets: [{ kind: 'creature', iid: creature.iid, label: creature.name }] };
  const legal = ENGINE.isLegalAction('you', cast);
  ENGINE.executeAction('you', cast);
  drainAll(G);
  return legal;
}

console.log('=== exile now, return at end step with fresh iid + ETB re-fire ===');
(() => {
  const G = newGame();
  const c = mk('_ojEtb', 'you'); c.sick = false; G.you.battlefield.push(c);
  const oldIid = c.iid;
  const legal = castOJOn(G, c);
  check('cast legal (creature target)', legal);
  check('creature exiled (off battlefield)', !G.you.battlefield.some(x => x.iid === oldIid));
  check('creature is in exile while delayed trigger pending', G.you.exile.some(x => x.tplId === '_ojEtb'));
  check('a delayed trigger is queued for end step',
    (G.delayedTriggers || []).some(dt => dt.fireAt === 'endStep'));
  const life0 = G.you.life;
  endTurn(G);
  drainAll(G);
  const back = G.you.battlefield.find(x => x.tplId === '_ojEtb');
  check('returned to the battlefield at end step', !!back);
  check('returned with a FRESH iid (§3.7 re-mint)', !!back && back.iid !== oldIid, 'old=' + oldIid + ' new=' + (back && back.iid));
  check('not left in exile', !G.you.exile.some(x => x.tplId === '_ojEtb'));
  check('ETB re-fired on return (gained 2 life)', G.you.life === life0 + 2, life0 + '→' + G.you.life);
  check('delayed trigger consumed', !(G.delayedTriggers || []).some(dt => dt.fireAt === 'endStep'));
})();

console.log('\n=== exiling a token ceases it (no return) ===');
(() => {
  const G = newGame();
  const tok = ENGINE.makeToken('spirit_w_1_1', 'you'); tok.sick = false; G.you.battlefield.push(tok);
  castOJOn(G, tok);
  check('token gone from battlefield', !G.you.battlefield.some(x => x.iid === tok.iid));
  endTurn(G);
  check('token did NOT return (ceased to exist)', !G.you.battlefield.some(x => x.isToken));
  check('token not stranded in exile', !G.you.exile.some(x => x.isToken));
})();

console.log('\n=== exiling an OPPONENT-owned creature routes it back to its owner ===');
(() => {
  const G = newGame();
  const oc = mk('_ojEtb', 'opp'); oc.sick = false; G.opp.battlefield.push(oc);
  const oldIid = oc.iid;
  const legal = castOJOn(G, oc);
  check('cast legal on opp creature', legal);
  check('exiled from opp battlefield', !G.opp.battlefield.some(x => x.iid === oldIid));
  check('held in owner (opp) exile', G.opp.exile.some(x => x.tplId === '_ojEtb'));
  endTurn(G);
  drainAll(G);
  check('returned to OWNER (opp) battlefield, not caster', G.opp.battlefield.some(x => x.tplId === '_ojEtb'));
  check('did NOT return to caster (you) battlefield', !G.you.battlefield.some(x => x.tplId === '_ojEtb'));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
