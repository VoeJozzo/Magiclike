// ability_triggered semantics:
//   - FIRE-TIME emission, before fizzle checks: an ability that
//     triggers-then-fizzles-at-targeting still TRIGGERED (MTG 603). The emit
//     site is the drainTriggers take-up point — the one seam every fired
//     trigger passes through (auto-pick, human-prompt, unstackable arms).
//   - CAUSE payload: the originating event rides as `cause`; the firing
//     ability as `trig` (trigger_has_effect(kind) reads it).
//   - RECURSION by meta-rule, not etiquette: no bespoke self-exclusion;
//     TRIGGER_DEPTH_CAP (the per-episode budget) is MTG's infinite-loop
//     meta-rule. A loosely-conditioned meta-listener loops to the budget and
//     bails loudly — the game survives.
// Boundary: activated abilities emit ability_activated, never this; mana
// abilities emit nothing.

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
    grantedBy: new Map(), eotGrants: [], typeGrants: [],
  });
}
// A meta-listener; another_card keeps it off its own procs.
function mkListener(controller, condition) {
  const c = mk('grizzly_bears', controller);
  c.name = 'Meta Listener';
  c.triggers = [{
    event: 'ability_triggered',
    condition: condition || ['another_card', 'controlled_by(you)'],
    effects: [{ kind: 'gain_life', amount: 1 }],
  }];
  return c;
}
function drain(G) {
  let safety = 200;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
function freshGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('forest'), colors: ['G'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];
  return G;
}
function cast(G, tplId, targets, who) {
  who = who || 'you';
  setup.startMainPhase(who);
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const spell = mk(tplId, who);
  G[who].hand.push(spell);
  const act = { type: 'castSpell', cardIid: spell.iid };
  if (targets) act.targets = targets;
  const ok = ENGINE.executeAction(who, act);
  drain(G);
  return { spell, ok };
}
function logHas(G, re) { return G.log.some(e => re.test(e.msg)); }

console.log('=== (a) KEY: a triggered ability firing wakes the meta-listener; cause + trig payload carried ===');
(() => {
  const G = freshGame();
  const listener = mkListener('you');
  G.you.battlefield.push(listener);
  G.opp.battlefield.push(mk('grizzly_bears', 'opp')); // ping target
  // Capture the payload through a test-registered atomic (function
  // conditions are unsupported — JSON wire can't hold them).
  let seen = null;
  ATOMIC_PREDICATES.__test_spy = (ctx) => { if (!seen) seen = ctx.event; return false; };
  const spy = mk('grizzly_bears', 'you');
  spy.name = 'Payload Spy';
  spy.triggers = [{
    event: 'ability_triggered',
    condition: ['__test_spy'],
    effects: [{ kind: 'gain_life', amount: 1 }],
  }];
  G.you.battlefield.push(spy);
  const life0 = G.you.life;
  const { spell } = cast(G, 'pyromaniac');   // its ETB ping is a triggered ability
  check('listener gained 1 off the pyromaniac ETB trigger firing',
    G.you.life === life0 + 1, life0 + ' -> ' + G.you.life);
  check('payload: subject is the pyromaniac', !!seen && seen.subject_iid === spell.iid,
    seen && JSON.stringify({ subject_iid: seen.subject_iid, want: spell.iid }));
  check('payload: cause is the originating event (the zone change that fired it)',
    !!seen && !!seen.cause && seen.cause.type === 'card_zone_change',
    seen && JSON.stringify(seen.cause && seen.cause.type));
  check('payload: trig is the firing ability (has the damage effect)',
    !!seen && !!seen.trig && (seen.trig.effects || []).some(e => e.kind === 'damage'));
  check('trigger_has_effect(damage) reads the payload',
    evaluateCondition(['trigger_has_effect(damage)'],
      { state: G, source: listener, event: seen, who: 'you' }) === true);
  check('trigger_has_effect(counter) rejects it',
    evaluateCondition(['trigger_has_effect(counter)'],
      { state: G, source: listener, event: seen, who: 'you' }) === false);
})();

console.log('\n=== (b) KEY: fire-time — a trigger that FIZZLES at targeting still triggered (MTG 603) ===');
(() => {
  const G = freshGame();
  const listener = mkListener('you');
  G.you.battlefield.push(listener);
  // Synthetic ETB whose trigger targets an OPP creature; opp board is empty,
  // so the trigger fizzles at target selection — after it fired.
  const etb = mk('grizzly_bears', 'you');
  etb.name = 'Doomed Pinger';
  etb.triggers = [{
    event: 'card_zone_change',
    condition: ['this_card', 'card_moves(anywhere, battlefield)'],
    effects: [{ kind: 'damage', amount: 1 }],
    target: 'creature', target_filter: { controller: 'opp' },
  }];
  G.you.hand.push(etb);
  const life0 = G.you.life;
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: etb.iid });
  drain(G);
  check('the doomed trigger fizzled (logged)', logHas(G, /fizzles — no legal target/),
    JSON.stringify(G.log.slice(0, 4).map(e => e.msg)));
  check('KEY: the listener STILL heard it trigger (+1 life)',
    G.you.life === life0 + 1, life0 + ' -> ' + G.you.life);
})();

console.log('\n=== (c) another_card keeps a well-formed listener off its own procs (exactly one fire) ===');
(() => {
  const G = freshGame();
  const listener = mkListener('you');
  G.you.battlefield.push(listener);
  G.opp.battlefield.push(mk('grizzly_bears', 'opp'));
  const life0 = G.you.life;
  // The listener's own gain-life trigger firing ALSO emits ability_triggered
  // (no bespoke exclusion); another_card filters the self-echo.
  cast(G, 'pyromaniac');
  check('exactly one gain (no self-echo chain)', G.you.life === life0 + 1,
    life0 + ' -> ' + G.you.life);
})();

console.log('\n=== (d) KEY: the depth-cap meta-rule contains a self-feeding meta-listener ===');
(() => {
  const G = freshGame();
  // Deliberately loosely-conditioned: hears EVERY ability_triggered,
  // including its own procs → self-feeding loop → the per-episode trigger
  // budget bails loudly. This is the MTG infinite-loop meta-rule in action.
  const loop = mkListener('you', []);
  loop.name = 'Ouroboros';
  G.you.battlefield.push(loop);
  G.opp.battlefield.push(mk('grizzly_bears', 'opp'));
  cast(G, 'pyromaniac');
  check('KEY: the budget bailed (logged), no crash', logHas(G, /Trigger budget exhausted/),
    JSON.stringify(G.log.slice(0, 3).map(e => e.msg)));
  check('game continues (not gameOver, engine responsive)',
    !G.gameOver && !!ENGINE.state());
  check('stack drained clean after the bail', G.stack.length === 0,
    'stack=' + G.stack.length);
})();

console.log('\n=== (e) boundary: ACTIVATED abilities do not emit ability_triggered ===');
(() => {
  const G = freshGame();
  const listener = mkListener('you');
  const sorcerer = mk('prodigal_sorcerer', 'you'); sorcerer.sick = false;
  const victim = mk('grizzly_bears', 'opp');
  G.you.battlefield.push(listener, sorcerer); G.opp.battlefield.push(victim);
  const life0 = G.you.life;
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: sorcerer.iid, abilityIdx: 0,
    targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
  drain(G);
  check('activation resolved (victim damaged or dead)',
    victim.damage > 0 || !G.opp.battlefield.some(c => c.iid === victim.iid));
  check('listener silent — activations are ability_activated\'s domain',
    G.you.life === life0, life0 + ' -> ' + G.you.life);
})();

console.log('\n=== (f) boot validation: event + predicate registered; typos flagged ===');
(() => {
  const good = {
    tplId: 'abtrig_good', name: 'Good', types: ['Creature'], power: 1, toughness: 1, effects: [],
    triggers: [{ event: 'ability_triggered',
      condition: ['another_card', 'controlled_by(you)', 'trigger_has_effect(damage)'],
      effects: [{ kind: 'gain_life', amount: 2 }] }],
  };
  const bad = {
    tplId: 'abtrig_bad', name: 'Bad', types: ['Creature'], power: 1, toughness: 1, effects: [],
    triggers: [{ event: 'ability_triggered', condition: ['trigger_has_efect(damage)'],
      effects: [{ kind: 'gain_life', amount: 2 }] }],
  };
  const r = validateAllCardConditions([good, bad]);
  check('ability_triggered + trigger_has_effect boot clean',
    !r.unknownEvents.some(e => /abtrig_good/.test(e))
    && !r.unknownAtomics.some(e => /abtrig_good/.test(e)),
    JSON.stringify([r.unknownEvents, r.unknownAtomics]));
  check('typo\'d predicate still flagged (control)',
    r.unknownAtomics.some(e => /abtrig_bad/.test(e)));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
