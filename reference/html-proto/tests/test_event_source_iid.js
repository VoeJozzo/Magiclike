// Audit fixes A2-8 + A3-11 — event payload conformance: life_changed and the
// leave-play card_zone_change family carry `source_iid` (PROTOCOL §3.3).
//
// Pre-fix, two of the four life_changed emitters omitted the field:
//   - combat lifelink (A2-8) — `{type, who, delta}` only, while
//     applyDamageFrom and gain_life both attach `source_iid: ctx.sourceIid`;
//   - damagePlayer's life-loss emit (A3-11) — the function was only ever
//     handed a display STRING, so it structurally could not attach the iid.
// And the whole leave-play family (emitLeavesBattlefield) had no sourceIid
// parameter at all — every bounce/exile/steal/move card_zone_change was
// anonymous even when the causing card was in scope at the call site.
//
// The only consumer of source_iid today is the noSelfCascade guard
// (triggers.js — "don't fire off your own card's event"), so each corrected
// emit site is pinned through it: a noSelfCascade trigger on the CAUSING
// card must NOT fire from its own event (red pre-fix: the missing tag made
// every event look foreign), and must STILL fire from a foreign source's
// event (over-suppression guard).
//
// Sites pinned:
//   1. combat lifelink gain        (A2-8,  dealCombatDamage applyLifelink)
//   2. combat face-damage loss     (A3-11, damagePlayer via combat)
//   3. spell-path face-damage loss (A3-11, damagePlayer via applyDamageFrom)
//   4. bounce leave-play           (A3-11, emitLeavesBattlefield via affect_creature)
//   5. move_card leave-play        (A3-11, emitLeavesBattlefield via move_card)
// (The exile / steal emitLeavesBattlefield call sites take the identical
// `ctx.sourceIid` thread as #4/#5.)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9300;
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
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  return G;
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
}
// Untapped land + a castable card keep hasNoAction() false so the auto-pass
// fast path doesn't consume the combat rounds (test_combat_change_control.js).
function giveHold(G, who) {
  G[who].battlefield.push(mk('mountain', who));
  G[who].hand.push(mk('lightning_bolt', who));
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
// noSelfCascade trigger factories (the Codex/Mercurial shape).
const gainOnLifeGain = () => ({
  event: 'life_changed', condition: ['is_life_gain'],
  text: 'Whenever you gain life, gain 5 life.',
  effects: [{ kind: 'gain_life', scope: 'self', amount: 5 }],
  generated: true, noSelfCascade: true,
});
const gainOnLifeLoss = () => ({
  event: 'life_changed', condition: ['is_life_loss'],
  text: 'Whenever a player loses life, gain 3 life.',
  effects: [{ kind: 'gain_life', scope: 'self', amount: 3 }],
  generated: true, noSelfCascade: true,
});
const onBounce = () => ({
  event: 'card_zone_change', condition: ['another_card', 'card_moves(battlefield, hand)'],
  text: 'Whenever another card is returned to hand, gain 1 life.',
  effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }],
  generated: true, noSelfCascade: true,
});

if (!VANILLA || !CARDS['lightning_bolt'] || !CARDS['mountain']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A2-8: combat lifelink gain carries source_iid (noSelfCascade self-suppresses) ===');
  (() => {
    const G = newGame();
    const atk = mk(VANILLA, 'you');
    atk.power = 2; atk.toughness = 2; atk.sick = false;
    atk.keywords = ['lifelink'];
    atk.triggers = [gainOnLifeGain()];
    G.you.battlefield.push(atk);
    giveHold(G, 'you');
    readyMain(G, 'you');
    const youLife0 = G.you.life;
    const oppLife0 = G.opp.life;
    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
    // Run until any queued life_changed trigger has fully resolved, not just
    // until MAIN2 opens — otherwise the assertion races the stack.
    passUntil(G, () => (G.phase === 'MAIN2' && G.stack.length === 0
      && G.pendingTriggers.length === 0) || G.gameOver, 120);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('defender took 2', G.opp.life === oppLife0 - 2, oppLife0 + ' -> ' + G.opp.life);
    check('A2-8: lifelink gained 2 and the noSelfCascade trigger did NOT fire off its own gain',
      G.you.life === youLife0 + 2, youLife0 + ' -> ' + G.you.life + ' (pre-fix: +7)');
  })();

  console.log('\n=== A2-8 guard: a FOREIGN gain still fires the trigger ===');
  (() => {
    const G = newGame();
    const listener = mk(VANILLA, 'you');
    listener.triggers = [gainOnLifeGain()];
    G.you.battlefield.push(listener);
    readyMain(G, 'you');
    G.pendingTriggers.length = 0;
    ENGINE.applyEffect(
      { controller: 'you', sourceName: 'Foreign Heal', sourceIid: -1 },
      { kind: 'gain_life', scope: 'self', amount: 2 }, null);
    check('foreign gain_life queues the trigger (no over-suppression)',
      G.pendingTriggers.length === 1, 'queued=' + G.pendingTriggers.length);
    G.pendingTriggers.length = 0;
  })();

  console.log('\n=== A3-11: combat face damage emits life loss with source_iid = attacker ===');
  (() => {
    const G = newGame();
    const atk = mk(VANILLA, 'you');
    atk.power = 2; atk.toughness = 2; atk.sick = false;
    atk.triggers = [gainOnLifeLoss()];
    G.you.battlefield.push(atk);
    giveHold(G, 'you');
    readyMain(G, 'you');
    const youLife0 = G.you.life;
    const oppLife0 = G.opp.life;
    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
    passUntil(G, () => (G.phase === 'MAIN2' && G.stack.length === 0
      && G.pendingTriggers.length === 0) || G.gameOver, 120);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('defender took 2', G.opp.life === oppLife0 - 2, oppLife0 + ' -> ' + G.opp.life);
    check('A3-11: the noSelfCascade is_life_loss trigger did NOT fire off its own combat damage',
      G.you.life === youLife0, youLife0 + ' -> ' + G.you.life + ' (pre-fix: +3)');
  })();

  console.log('\n=== A3-11: spell-path damagePlayer threads ctx.sourceIid ===');
  (() => {
    const G = newGame();
    const listener = mk(VANILLA, 'you');
    listener.triggers = [gainOnLifeLoss()];
    G.you.battlefield.push(listener);
    readyMain(G, 'you');
    G.pendingTriggers.length = 0;
    // The listener itself pings the opponent's face (ctx.sourceIid = its iid):
    // the loss event must carry that iid, so noSelfCascade suppresses.
    ENGINE.applyEffect(
      { controller: 'you', sourceName: listener.name, sourceIid: listener.iid },
      { kind: 'damage', amount: 1 }, { kind: 'player', who: 'opp' });
    check('A3-11: own face-ping loss is self-suppressed (source_iid threaded)',
      G.pendingTriggers.length === 0, 'queued=' + G.pendingTriggers.length);
    // A foreign source's face damage still fires it.
    ENGINE.applyEffect(
      { controller: 'you', sourceName: 'Foreign Burn', sourceIid: -1 },
      { kind: 'damage', amount: 1 }, { kind: 'player', who: 'opp' });
    check('foreign face damage still queues the trigger',
      G.pendingTriggers.length === 1, 'queued=' + G.pendingTriggers.length);
    G.pendingTriggers.length = 0;
  })();

  console.log('\n=== A3-11: bounce leave-play emit carries the causing card ===');
  (() => {
    const G = newGame();
    const listener = mk(VANILLA, 'you');
    listener.triggers = [onBounce()];
    G.you.battlefield.push(listener);
    const victimA = mk(VANILLA, 'opp');
    const victimB = mk(VANILLA, 'opp');
    G.opp.battlefield.push(victimA, victimB);
    readyMain(G, 'you');
    G.pendingTriggers.length = 0;
    // The listener bounces a creature (ctx.sourceIid = its iid): the
    // card_zone_change must carry source_iid, so noSelfCascade suppresses.
    ENGINE.applyEffect(
      { controller: 'you', sourceName: listener.name, sourceIid: listener.iid },
      { kind: 'affect_creature', severity: 'bounce' },
      { kind: 'creature', iid: victimA.iid });
    check('victim was bounced', G.opp.hand.some(c => c.iid === victimA.iid));
    check('A3-11: own bounce is self-suppressed (source_iid threaded)',
      G.pendingTriggers.length === 0, 'queued=' + G.pendingTriggers.length);
    // A foreign source's bounce still fires it.
    ENGINE.applyEffect(
      { controller: 'you', sourceName: 'Foreign Bounce', sourceIid: -1 },
      { kind: 'affect_creature', severity: 'bounce' },
      { kind: 'creature', iid: victimB.iid });
    check('foreign bounce still queues the trigger',
      G.pendingTriggers.length === 1, 'queued=' + G.pendingTriggers.length);
    G.pendingTriggers.length = 0;
  })();

  console.log('\n=== A3-11: move_card leave-play emit carries the causing card ===');
  (() => {
    const G = newGame();
    const listener = mk(VANILLA, 'you');
    listener.triggers = [onBounce()];
    G.you.battlefield.push(listener);
    const victim = mk(VANILLA, 'opp');
    G.opp.battlefield.push(victim);
    readyMain(G, 'you');
    G.pendingTriggers.length = 0;
    ENGINE.applyEffect(
      { controller: 'you', sourceName: listener.name, sourceIid: listener.iid },
      { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' },
      { kind: 'creature', iid: victim.iid });
    check('victim was moved to hand', G.opp.hand.some(c => c.iid === victim.iid));
    check('A3-11: own move_card departure is self-suppressed (source_iid threaded)',
      G.pendingTriggers.length === 0, 'queued=' + G.pendingTriggers.length);
    G.pendingTriggers.length = 0;
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
