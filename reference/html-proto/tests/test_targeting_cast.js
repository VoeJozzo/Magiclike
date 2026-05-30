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
// Creature with a top-level-target activated ability ("{T}: deal 1 to target creature").
CARDS._testPinger = { tplId: '_testPinger', name: 'Test Pinger', type: 'Creature', cost: { R: 1 }, color: 'R', colors: ['R'], power: 0, toughness: 3,
  abilities: [{ cost: { tap: true }, target: 'creature', effects: [{ kind: 'damage', amount: 1 }] }] };

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
  // Cast the creature; its ETB trigger (target(creature) → damage(1)). With the
  // zapper itself now on the board there are TWO legal creature targets, so a
  // PLAYER-controlled trigger must PROMPT (it must not silently auto-pick — the
  // regression that auto-selected migrated triggers' targets on cast).
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: zapper.iid, targets: [] });
  drainAll(G);
  check('zapper resolved onto the battlefield', G.you.battlefield.some(c => c.tplId === '_testZapper'));
  check('player IS prompted for the ETB trigger target (not auto-picked)',
    !!G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you');
  // Player chooses the opp creature; the trigger then resolves on it.
  ENGINE.executeAction('you', { type: 'triggerTargetPick',
    target: { kind: 'creature', iid: victim.iid, ctrl: 'opp', label: victim.name } });
  drainAll(G);
  check('ETB trigger killed the chosen opp creature (1 dmg to a 1-tough creature)',
    !G.opp.battlefield.some(c => c.iid === victim.iid) && G.opp.graveyard.some(c => c.iid === victim.iid));
})();

console.log('\n=== Activated ability with a top-level target() step ===');
(() => {
  const G = newGame();
  const pinger = mk('_testPinger', 'you'); pinger.sick = false; G.you.battlefield.push(pinger);
  const v1 = mk(TOUGH_CREATURE, 'opp'); v1.toughness = 1; v1.power = 1; G.opp.battlefield.push(v1);
  const hex = mk(TOUGH_CREATURE, 'opp'); hex.toughness = 1; hex.keywords.push('hexproof'); G.opp.battlefield.push(hex);
  readyForCast(G, 'you');

  const acts = ENGINE.getLegalActions('you').filter(a => a.type === 'activateAbility' && a.cardIid === pinger.iid);
  const tgtIids = acts.map(a => a.targets && a.targets[0] && a.targets[0].iid).filter(x => x != null);
  check('ability enumerates the plain opp creature', tgtIids.includes(v1.iid));
  check('ability does NOT enumerate the opp hexproof creature', !tgtIids.includes(hex.iid));

  const act = acts.find(a => a.targets && a.targets[0] && a.targets[0].iid === v1.iid);
  check('a targeting action exists', !!act);
  if (act) {
    ENGINE.executeAction('you', act);
    drainAll(G);
    check('ability killed the targeted opp creature', !G.opp.battlefield.some(c => c.iid === v1.iid));
    check('pinger tapped to pay the cost', pinger.tapped === true);
  }
})();

console.log('\n=== #5b canonical multi-target: target_slots is the single source ===');
(() => {
  // The 5 multi-target spells carry a card-level target_slots array; their
  // slot-bound effects bind via target_slot and carry NO inline target (the
  // filter lives in the slot spec). Pin the shape so a regression can't
  // silently reintroduce per-effect target.
  for (const id of ['branchingBolt', 'twinStrike', 'drainLife', 'rootsAndBranches', 'swordAndSorcery']) {
    const c = CARDS[id];
    const slotsOk = Array.isArray(c.target_slots) && c.target_slots.length === 2;
    const noInline = (c.effects || []).every(e => e.target_slot == null || e.target === undefined);
    const noFlag = c.multi_target === undefined;
    check(id + ': target_slots[2] + no inline target on slot effects + no multi_target flag',
      slotsOk && noInline && noFlag);
  }
})();

console.log('\n=== Branching Bolt: 2-target cross-product enumerates + both take 2 dmg ===');
(() => {
  const G = newGame();
  const a = mk(TOUGH_CREATURE, 'opp'), b = mk(TOUGH_CREATURE, 'opp');
  G.opp.battlefield.push(a, b);
  const bb = mk('branchingBolt', 'you'); G.you.hand.push(bb);
  readyForCast(G, 'you');
  const casts = ENGINE.getLegalActions('you').filter(x => x.type === 'castSpell' && x.cardIid === bb.iid);
  // 2 creatures × 2 slots = 4 combos (incl. same-target pairs).
  check('enumerates the 2-slot cross-product (4 combos)', casts.length === 4, 'combos=' + casts.length);
  const distinct = casts.find(x => x.targets[0].iid !== x.targets[1].iid);
  check('a distinct-target combo exists', !!distinct);
  check('distinct combo is legal', ENGINE.isLegalAction('you', distinct));
  ENGINE.executeAction('you', distinct);
  drainStack(G);
  const fa = G.opp.battlefield.find(c => c.iid === distinct.targets[0].iid);
  const fb = G.opp.battlefield.find(c => c.iid === distinct.targets[1].iid);
  check('both targets took 2 damage', (fa && fa.damage === 2) && (fb && fb.damage === 2),
    'a=' + (fa && fa.damage) + ' b=' + (fb && fb.damage));
})();

console.log('\n=== Drain Life: slot 0 = creature, slot 1 = player (mixed-filter slots) ===');
(() => {
  const G = newGame();
  const cr = mk(TOUGH_CREATURE, 'opp'); G.opp.battlefield.push(cr);
  const dl = mk('drainLife', 'you'); G.you.hand.push(dl);
  readyForCast(G, 'you');
  const youLife = G.you.life, oppLife = G.opp.life;
  const cast = { type: 'castSpell', cardIid: dl.iid, targets: [
    { kind: 'creature', iid: cr.iid, label: cr.name },   // slot 0 (creature)
    { kind: 'player', who: 'opp', label: 'Opp' },         // slot 1 (opp player)
  ] };
  check('mixed-filter multi-target cast is legal', ENGINE.isLegalAction('you', cast));
  ENGINE.executeAction('you', cast);
  drainStack(G);
  check('slot-0 creature took 2 damage', cr.damage === 2, 'dmg=' + cr.damage);
  check('slot-1 opponent lost 2 life', G.opp.life === oppLife - 2, oppLife + '→' + G.opp.life);
  check('caster gained 4 life (scope:self half)', G.you.life === youLife + 4, youLife + '→' + G.you.life);
})();

console.log('\n=== target_slots survive REAL makeCard instantiation (not just deep-copy) ===');
(() => {
  // Regression: makeCard dropped target_slots, so multi-slot cards were
  // uncastable in the real UI (probeTargetsForObject found no slots → null →
  // not castable). The mk() helper above deep-copies the whole template, which
  // MASKED this — so assert the engine's real instance carries the field, and
  // that every authored multi-slot card is castable from a real instance.
  for (const id of ['drainLife', 'branchingBolt', 'twinStrike', 'rootsAndBranches', 'swordAndSorcery']) {
    const inst = ENGINE.makeCard(id, [], 0);
    check(id + ': real instance carries target_slots',
      Array.isArray(inst.target_slots) && inst.target_slots.length === (CARDS[id].target_slots || []).length,
      JSON.stringify(inst.target_slots));
  }
  // End-to-end castability of a real makeCard instance (the bug's exact surface).
  const G = newGame();
  const cr = mk(TOUGH_CREATURE, 'opp'); G.opp.battlefield.push(cr);
  const dl = ENGINE.makeCard('drainLife', [], 0); dl.controller = 'you'; dl.owner = 'you';
  G.you.hand.push(dl);
  readyForCast(G, 'you');
  const probe = ENGINE.probeTargetsForObject(dl, 'you');
  check('real drainLife instance probes to a full target set (castable)',
    Array.isArray(probe) && probe.length === 2, JSON.stringify(probe));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
