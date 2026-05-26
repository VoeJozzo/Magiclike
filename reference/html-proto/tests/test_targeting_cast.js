// End-to-end cast → resolution wiring for the top-level target() step
// (Slice 3 step 2 keystone). Injects synthetic top-level-`target` cards and
// casts them through the REAL executeAction → resolveTopOfStack path:
//   - part A (resolution): bare effects operate on the established target;
//     chooses() replaces the operative target for the following effect.
//   - part B (legality): a top-level target() step is the cast-time hexproof
//     checkpoint (can't target an opp hexproof creature).
// No real card uses the new shape yet, so this is additive — verified inert
// for the live pool by the rest of the suite + selfplay.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Synthetic top-level-target cards (added to CARDS so mk() can clone them).
CARDS._testBolt  = { tplId: '_testBolt',  name: 'Test Bolt',  type: 'Instant', cost: { R: 1 }, color: 'R', colors: ['R'], target: 'creature_or_player', effects: [{ kind: 'damage', amount: 3 }] };
CARDS._testEdict = { tplId: '_testEdict', name: 'Test Edict', type: 'Instant', cost: { B: 1 }, color: 'B', colors: ['B'], target: 'player', effects: [{ kind: 'chooses', filter: 'creature' }, { kind: 'sacrifice' }] };
CARDS._testPyro  = { tplId: '_testPyro',  name: 'Test Pyro',  type: 'Sorcery', cost: { R: 1 }, color: 'R', colors: ['R'], effects: [{ kind: 'damage', amount: 2, scope: 'all_creatures' }] };
// Creature with a top-level-target ETB trigger ("when this enters, deal 1 to
// target creature") — exercises the trigger-path target() wiring.
CARDS._testZapper = { tplId: '_testZapper', name: 'Test Zapper', type: 'Creature', cost: { R: 1 }, color: 'R', colors: ['R'], power: 1, toughness: 1,
  triggers: [{ event: 'card_zone_change', condition: ['this_card', 'card_moves(anywhere, battlefield)'], target: 'creature', effects: [{ kind: 'damage', amount: 1 }] }] };

const TOUGH_CREATURE = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && (c.toughness || 0) >= 4 && !c.triggers && !c.abilities) return id;
  }
  for (const [id, c] of Object.entries(CARDS)) if (c.type === 'Creature' && (c.toughness || 0) >= 4) return id;
  return null;
})();

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
  const G = ENGINE.state();
  return G;
}
function readyForCast(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
}
function drainStack(G) {
  let safety = 20;
  while (G.stack.length > 0 && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
// Like drainStack but also flushes pending triggers (ETB etc.) by passing
// priority until both the stack AND the trigger queue are empty.
function drainAll(G) {
  let safety = 40;
  while ((G.stack.length > 0 || (G.pendingTriggers || []).length > 0) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}

console.log('=== Test Bolt: target(creature_or_player) → damage(3) on the target ===');
(() => {
  const G = newGame();
  const tgt = mk(TOUGH_CREATURE, 'opp'); G.opp.battlefield.push(tgt);
  const bolt = mk('_testBolt', 'you'); G.you.hand.push(bolt);
  readyForCast(G, 'you');
  const cast = { type: 'castSpell', cardIid: bolt.iid, targets: [{ kind: 'creature', iid: tgt.iid, label: tgt.name }] };
  check('cast is legal', ENGINE.isLegalAction('you', cast));
  ENGINE.executeAction('you', cast);
  drainStack(G);
  check('bare damage effect hit the established target (3 dmg)', tgt.damage === 3, 'damage=' + tgt.damage);
})();

console.log('\n=== Test Bolt CANNOT target an opp hexproof creature (cast-time hexproof) ===');
(() => {
  const G = newGame();
  const hex = mk(TOUGH_CREATURE, 'opp'); hex.keywords.push('hexproof'); G.opp.battlefield.push(hex);
  const bolt = mk('_testBolt', 'you'); G.you.hand.push(bolt);
  readyForCast(G, 'you');
  const cast = { type: 'castSpell', cardIid: bolt.iid, targets: [{ kind: 'creature', iid: hex.iid, label: hex.name }] };
  check('targeting opp hexproof is ILLEGAL', !ENGINE.isLegalAction('you', cast));
  // ...but the SAME bolt can target the opponent player.
  const castP = { type: 'castSpell', cardIid: bolt.iid, targets: [{ kind: 'player', who: 'opp', label: 'Opp' }] };
  check('targeting the player is legal', ENGINE.isLegalAction('you', castP));
})();

console.log('\n=== Test Edict: target(player) → chooses(creature) → sacrifice (kills hexproof) ===');
(() => {
  const G = newGame();
  const oppHex = mk(TOUGH_CREATURE, 'opp'); oppHex.keywords.push('hexproof'); G.opp.battlefield.push(oppHex);
  const edict = mk('_testEdict', 'you'); G.you.hand.push(edict);
  readyForCast(G, 'you');
  const cast = { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'opp', label: 'Opp' }] };
  check('edict targeting the player is legal', ENGINE.isLegalAction('you', cast));
  ENGINE.executeAction('you', cast);
  drainStack(G);
  check('hexproof creature left the battlefield', !G.opp.battlefield.some(c => c.iid === oppHex.iid));
  check('hexproof creature sacrificed to graveyard', G.opp.graveyard.some(c => c.iid === oppHex.iid));
})();

console.log('\n=== Test Pyro: no target() step, mass scope hits hexproof ===');
(() => {
  const G = newGame();
  const a = mk(TOUGH_CREATURE, 'you'); G.you.battlefield.push(a);
  const b = mk(TOUGH_CREATURE, 'opp'); b.keywords.push('hexproof'); G.opp.battlefield.push(b);
  const pyro = mk('_testPyro', 'you'); G.you.hand.push(pyro);
  readyForCast(G, 'you');
  const cast = { type: 'castSpell', cardIid: pyro.iid, targets: [] };
  check('mass spell legal with no targets', ENGINE.isLegalAction('you', cast));
  ENGINE.executeAction('you', cast);
  drainStack(G);
  check('your creature took 2', a.damage === 2, 'damage=' + a.damage);
  check('opp hexproof creature took 2 (no target step → no hexproof gate)', b.damage === 2, 'damage=' + b.damage);
})();

console.log('\n=== getLegalActions enumerates one cast per legal target (hexproof excluded) ===');
(() => {
  const G = newGame();
  const plain = mk(TOUGH_CREATURE, 'opp'); G.opp.battlefield.push(plain);
  const hex = mk(TOUGH_CREATURE, 'opp'); hex.keywords.push('hexproof'); G.opp.battlefield.push(hex);
  const mine = mk(TOUGH_CREATURE, 'you'); G.you.battlefield.push(mine);
  const bolt = mk('_testBolt', 'you'); G.you.hand.push(bolt);
  readyForCast(G, 'you');

  const acts = ENGINE.getLegalActions('you').filter(a => a.type === 'castSpell' && a.cardIid === bolt.iid);
  const tgtIids = acts.map(a => a.targets && a.targets[0] && a.targets[0].iid).filter(x => x != null);
  const players = acts.filter(a => a.targets && a.targets[0] && a.targets[0].kind === 'player').length;
  check('enumerates the plain opp creature', tgtIids.includes(plain.iid));
  check('enumerates my own creature', tgtIids.includes(mine.iid));
  check('does NOT enumerate the opp hexproof creature', !tgtIids.includes(hex.iid));
  check('enumerates both players (creature_or_player)', players === 2);
})();

console.log('\n=== Triggered ability with a top-level target() step ===');
(() => {
  const G = newGame();
  // 1-toughness opp creature → the clear best damage target (so the AI
  // auto-pick targets it, not the 1/1 zapper itself).
  const victim = mk(TOUGH_CREATURE, 'opp'); victim.toughness = 1; victim.power = 1;
  G.opp.battlefield.push(victim);
  const zapper = mk('_testZapper', 'you'); G.you.hand.push(zapper);
  readyForCast(G, 'you');
  // Cast the creature; its ETB trigger (target(creature) → damage(1)) picks the
  // opp creature via the trigger-path target() wiring and kills it.
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: zapper.iid, targets: [] });
  drainAll(G);
  check('zapper resolved onto the battlefield', G.you.battlefield.some(c => c.tplId === '_testZapper'));
  check('ETB trigger killed the opp creature (1 dmg to a 1-tough creature)',
    !G.opp.battlefield.some(c => c.iid === victim.iid) && G.opp.graveyard.some(c => c.iid === victim.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
