// Wave 2 — the ability_activated event (primitive bill item 6; customer:
// Backlash Mage, "Whenever you activate an ability of a creature you
// control, ~ deals 1 damage to target opponent").
//
// The event announces a NON-MANA activated ability taking its kind:'ability'
// stack entry (the single emit site in doActivateAbility's stackable branch).
// What this file pins:
//   (a) KEY — activating a creature's non-mana ability fires the event; a
//       Backlash-shaped listener's trigger lands ON TOP of the ability entry
//       (LIFO — the trigger resolves first, MtG placement) and drains the
//       opponent promptlessly via the blood_artist target:'opp' house shape.
//   (b) KEY (structural exclusion, canon §705) — mana abilities NEVER emit:
//       neither a creature dork through activateAbility nor a land through
//       tapLandForMana wakes the listener. "Tap a dork for mana" can never
//       feed an activations-matter payoff.
//   (c) Condition scoping — controlled_by(you) silences an OPPONENT's
//       activation; card_is_creature silences a non-creature source's.
//   (d) Boot validation — 'ability_activated' is a VALID_TRIGGER_EVENTS
//       member (a card using it boots clean) while a typo'd event name is
//       still flagged (control).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9700;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
// A Backlash Mage-shaped listener: creature payoff for your creature
// activations, draining the opponent through the trigger-level target:'opp'
// implicit slot (blood_artist house shape — auto-fills, zero prompts).
function mkListener(controller) {
  const c = mk('grizzly_bears', controller);
  c.name = 'Backlash Listener';
  c.triggers = [{
    event: 'ability_activated',
    condition: ['controlled_by(you)', 'card_is_creature'],
    effects: [{ kind: 'damage', amount: 1 }],
    target: 'opp',
  }];
  return c;
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  setup.startMainPhase('you');
  G.pendingTriggers = []; G.pendingTriggerTarget = null;
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
// Pass-until-settled (bounded), same as test_stackable_infra.
function settle(G) {
  let safety = 12;
  while (G.stack.length > 0 && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}

if (!CARDS['prodigal_sorcerer'] || !CARDS['llanowar_elves'] || !CARDS['grizzly_bears']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {

  console.log('=== (a) KEY: non-mana creature activation fires the event; trigger stacks ABOVE the ability ===');
  (() => {
    const G = newGame();
    const listener = mkListener('you');
    const sorcerer = mk('prodigal_sorcerer', 'you');
    G.you.battlefield.push(listener, sorcerer);
    const victim = mk('grizzly_bears', 'opp');
    G.opp.battlefield.push(victim);
    // Anchor: a castable response in opp's hand keeps the priority window
    // OPEN (the engine auto-passes a seat with zero legal responses, which
    // would resolve the whole stack synchronously — same lesson as the
    // wave2_hook_test fizzle case).
    G.opp.hand.push(mk('lightning_bolt', 'opp'));
    const oppLife0 = G.opp.life;
    const ok = ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: sorcerer.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    check('activation executed', ok === true);
    check('KEY: two entries stacked — ability below, trigger on top (LIFO)',
      G.stack.length === 2 && G.stack[0].kind === 'ability' && G.stack[1].kind === 'trigger',
      'stack=' + G.stack.map(e => e.kind).join(','));
    check('the trigger belongs to the listener',
      G.stack[1].sourceIid === listener.iid,
      'sourceIid=' + G.stack[1].sourceIid);
    check('nothing resolved yet (opp life unchanged, victim undamaged)',
      G.opp.life === oppLife0 && victim.damage === 0);
    settle(G);
    check('KEY: listener drained the opponent promptlessly (target:opp auto-fill)',
      G.opp.life === oppLife0 - 1, 'life=' + G.opp.life + ' expected=' + (oppLife0 - 1));
    check('and the ability itself still resolved (victim took the ping)',
      victim.damage === 1 || !G.opp.battlefield.some(c => c.iid === victim.iid),
      'damage=' + victim.damage);
    check('stack empty after settle', G.stack.length === 0);
  })();

  console.log('\n=== (b) KEY: mana abilities are structurally silent (canon §705) ===');
  (() => {
    const G = newGame();
    const listener = mkListener('you');
    const elves = mk('llanowar_elves', 'you');
    const land = mk('mountain', 'you');
    // Untapped sorcerer anchors 'you' (hasNoAction stays false → step() parks
    // instead of marching phases and emptying the mana pool).
    G.you.battlefield.push(listener, elves, land, mk('prodigal_sorcerer', 'you'));
    G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const oppLife0 = G.opp.life;
    ENGINE.executeAction('you', { type: 'activateAbility', cardIid: elves.iid, abilityIdx: 0 });
    check('dork tapped for mana ({G} floating, resolved inline)', G.you.mana.G === 1);
    check('KEY: creature MANA ability woke nothing (no stack, no pending trigger)',
      G.stack.length === 0 && G.pendingTriggers.length === 0,
      'stack=' + G.stack.length + ' pending=' + G.pendingTriggers.length);
    ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: land.iid });
    check('land tapped ({R} floating)', G.you.mana.R === 1);
    check('KEY: land tap woke nothing either',
      G.stack.length === 0 && G.pendingTriggers.length === 0);
    check('opponent untouched throughout', G.opp.life === oppLife0);
  })();

  console.log('\n=== (c) condition scoping: opponent activations and non-creature sources stay silent ===');
  (() => {
    // Opponent activates THEIR creature: controlled_by(you) fails for your
    // listener, so nothing fires (event still emitted — the condition is the
    // filter, same contract as every composable trigger).
    const G = newGame();
    G.activePlayer = 'opp'; G.priorityHolder = 'opp';
    setup.startMainPhase('opp');
    const listener = mkListener('you');
    G.you.battlefield.push(listener);
    const theirSorc = mk('prodigal_sorcerer', 'opp');
    G.opp.battlefield.push(theirSorc);
    const bystander = mk('grizzly_bears', 'you');
    G.you.battlefield.push(bystander);
    // Anchor 'you' so the window over opp's activation stays open.
    G.you.hand.push(mk('lightning_bolt', 'you'));
    const oppLife0 = G.opp.life;
    const ok = ENGINE.executeAction('opp', { type: 'activateAbility',
      cardIid: theirSorc.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: bystander.iid, label: bystander.name }] });
    check('setup: opponent activation executed', ok === true);
    check('only the ability is stacked — your listener stayed quiet',
      G.stack.length === 1 && G.stack[0].kind === 'ability',
      'stack=' + G.stack.map(e => e.kind).join(','));
    settle(G);
    check('opponent took no listener damage', G.opp.life === oppLife0);

    // Non-creature source: an artifact's non-mana ability emits the event,
    // but card_is_creature filters it out.
    const G2 = newGame();
    const listener2 = mkListener('you');
    G2.you.battlefield.push(listener2);
    const relic = mk('grizzly_bears', 'you');
    relic.name = 'Test Relic';
    relic.types = ['Artifact'];
    delete relic.power; delete relic.toughness;
    relic.abilities = [{ cost: { tap: true },
      effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }] }];
    G2.you.battlefield.push(relic, mk('prodigal_sorcerer', 'you'));
    // Anchor opp so the window over your activation stays open.
    G2.opp.hand.push(mk('lightning_bolt', 'opp'));
    const oppLife2 = G2.opp.life;
    const ok2 = ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: relic.iid, abilityIdx: 0 });
    check('setup: artifact activation executed', ok2 === true);
    check('artifact ability stacked WITHOUT waking the creature-only listener',
      G2.stack.length === 1 && G2.stack[0].kind === 'ability',
      'stack=' + G2.stack.map(e => e.kind).join(','));
    settle(G2);
    check('opponent untouched (card_is_creature filtered)', G2.opp.life === oppLife2);
  })();

  console.log('\n=== (d) boot validation: the event name is registered; typos still flagged ===');
  (() => {
    const good = {
      tplId: 'ability_event_good', name: 'Good', types: ['Creature'],
      power: 1, toughness: 1, effects: [],
      triggers: [{ event: 'ability_activated',
        condition: ['controlled_by(you)', 'card_is_creature'],
        effects: [{ kind: 'damage', amount: 1 }], target: 'opp' }],
    };
    const bad = {
      tplId: 'ability_event_bad', name: 'Bad', types: ['Creature'],
      power: 1, toughness: 1, effects: [],
      triggers: [{ event: 'ability_actviated', condition: [],
        effects: [{ kind: 'damage', amount: 1 }], target: 'opp' }],
    };
    const r = validateAllCardConditions([good, bad]);
    check('ability_activated boots clean',
      !r.unknownEvents.some(e => /ability_event_good/.test(e)),
      JSON.stringify(r.unknownEvents));
    check('typo\'d event name is still flagged (control)',
      r.unknownEvents.some(e => /ability_event_bad/.test(e)),
      JSON.stringify(r.unknownEvents));
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
