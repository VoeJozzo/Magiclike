// Cast-time decision prompts (symmetricize + number choice).
//
// Both modals are normally only reachable mid-game against specific
// bosses or with specific cards (Symmetricize is an instant, Archdemon
// of Bargains is a Demon). Hand-testing means fighting through to the
// right encounter. These tests construct the relevant state directly:
//
//   Symmetricize: place a creature, cast Symmetricize at it, verify
//     pendingSymmetricizeChoice gets set with the right values, submit
//     a choice, verify the target's stats/cost collapse to the chosen
//     value AND slot.symmetricized persists (player-side only).
//
//   Number choice: put Archdemon onto the battlefield through ETB
//     trigger flow, verify pendingNumberChoice is set with min/max,
//     submit a number, verify bargainsNum lands on the source.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function makeBaselineGame(cards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({cards: cards || ['plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['W']}, null);
  RUN.startNextGame();
  return ENGINE.state();
}

let nextIid = 9000;
function mk(tplId, controller) {
  const tpl = CARDS[tplId];
  const inst = JSON.parse(JSON.stringify(tpl));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    legendary: !!inst.legendary, tapped: false, sick: false,
    damage: 0, tempPower: 0, tempTou: 0,
    damagedBySources: new Set(), modifiers: [],
    keywords: (inst.keywords || []).slice(),
  });
}

function readyForCast(G, who) {
  G.activePlayer = who;
  G.priorityHolder = who;
  G.phase = 'MAIN1';
  G.stack = [];
  G.gameOver = false;
  G.priority = { passes: new Set() };
}

// Drive an instant-window cast to completion: cast, then both sides
// pass priority so the stack resolves and any pendingX state appears.
function drainStack(G) {
  let safety = 20;
  while (G.stack.length > 0 && safety-- > 0) {
    const who = ENGINE.expectedActor();
    if (!who) break;
    const a = AI.decide(G, who);
    if (!a) break;
    ENGINE.executeAction(who, a);
  }
}

console.log('=== Symmetricize sets up pendingSymmetricizeChoice ===');
{
  // Use Devoted Watcher (ancestralGuard) — power=1, toughness=3,
  // cost=2 ({W:1,C:1}). All three values differ, so each choice
  // produces a visibly distinct outcome.
  const G = makeBaselineGame(['devoted_watcher','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'devoted_watcher');
  const piercer = mk('devoted_watcher', 'you');
  piercer.slotIdx = piercerSlotIdx;
  G.you.battlefield.push(piercer);

  // Opp casts Symmetricize at the piercer.
  const sym = mk('symmetricize', 'opp');
  G.opp.hand.push(sym);
  G.opp.mana.W = 1; G.opp.mana.C = 1;
  readyForCast(G, 'opp');

  const cast = {
    type: 'castSpell',
    cardIid: sym.iid,
    targets: [{kind: 'creature', iid: piercer.iid, label: 'Goblin Piercer'}],
  };
  check('cast Symmetricize is legal', ENGINE.isLegalAction('opp', cast));

  ENGINE.executeAction('opp', cast);
  drainStack(G);

  check('pendingSymmetricizeChoice is set after resolution',
    G.pendingSymmetricizeChoice !== null && G.pendingSymmetricizeChoice !== undefined);
  if (G.pendingSymmetricizeChoice) {
    const p = G.pendingSymmetricizeChoice;
    check("prompt targets the piercer's controller (you)", p.who === 'you');
    check("prompt source is 'Symmetricize'", p.source === 'Symmetricize');
    check('prompt records targetIid', p.targetIid === piercer.iid);
    check('prompt records targetIsYours', p.targetIsYours === true);
    check('prompt records targetSlotIdx', p.targetSlotIdx === piercerSlotIdx);
    check('values.power matches Watcher power (1)', p.values.power === 1);
    check('values.toughness matches Watcher toughness (3)', p.values.toughness === 3);
    check('values.cost matches Watcher total mana cost (2 = W+C)', p.values.cost === 2);
  }
}

console.log('\n=== Submitting symmetricizeChoice collapses stats + persists to slot ===');
{
  const G = makeBaselineGame(['devoted_watcher','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'devoted_watcher');
  const piercer = mk('devoted_watcher', 'you');
  piercer.slotIdx = piercerSlotIdx;
  G.you.battlefield.push(piercer);

  const sym = mk('symmetricize', 'opp');
  G.opp.hand.push(sym);
  G.opp.mana.W = 1; G.opp.mana.C = 1;
  readyForCast(G, 'opp');

  ENGINE.executeAction('opp', {
    type: 'castSpell',
    cardIid: sym.iid,
    targets: [{kind: 'creature', iid: piercer.iid, label: 'Devoted Watcher'}],
  });
  drainStack(G);

  // Player picks 'toughness' (=3). §3.8 additive snapshot: effective
  // power/toughness become 3/3 and total mana cost becomes 3 via stat_boost +
  // cost_mod stickers (not a base-stat clamp). Watcher is 1/3 for {W}{1},
  // so picking 3 raises power by +2 and total mana cost by +1.
  const costTotal = (c) => c.cost ? ['W','U','B','R','G','C'].reduce((s,k)=>s+(c.cost[k]||0),0) : 0;
  const choiceAction = {type: 'symmetricizeChoice', which: 'toughness'};
  check("symmetricizeChoice is legal for the prompt's owner (you)",
    ENGINE.isLegalAction('you', choiceAction));
  ENGINE.executeAction('you', choiceAction);

  check('pendingSymmetricizeChoice cleared after submit',
    G.pendingSymmetricizeChoice === null);
  const [ep, et] = ENGINE.getStats(piercer);
  check('Watcher effective power == 3', ep === 3, 'power=' + ep);
  check('Watcher effective toughness == 3', et === 3, 'toughness=' + et);
  check('Watcher total mana cost == 3', costTotal(piercer) === 3, 'cost=' + JSON.stringify(piercer.cost));
  check('no symmetrizedTo sentinel (additive, not a clamp)', piercer.symmetrizedTo === undefined);
  // Slot persistence: stat_boost + cost_mod stickers recorded for the run.
  const slotAfter = RUN.getSlots()[piercerSlotIdx];
  check('slot gained a stat_boost sticker',
    slotAfter && slotAfter.stickers.some(s => s && s.kind === 'stat_boost'));
  check('slot gained a cost_mod sticker',
    slotAfter && slotAfter.stickers.some(s => s && s.kind === 'cost_mod'));
}

console.log("\n=== Picking 'power' on Watcher (power=1) collapses to 1/1 cost {C:1} ===");
{
  const G = makeBaselineGame(['devoted_watcher','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'devoted_watcher');
  const piercer = mk('devoted_watcher', 'you');
  piercer.slotIdx = piercerSlotIdx;
  G.you.battlefield.push(piercer);

  const sym = mk('symmetricize', 'opp');
  G.opp.hand.push(sym);
  G.opp.mana.W = 1; G.opp.mana.C = 1;
  readyForCast(G, 'opp');

  ENGINE.executeAction('opp', {
    type: 'castSpell', cardIid: sym.iid,
    targets: [{kind: 'creature', iid: piercer.iid, label: 'Devoted Watcher'}],
  });
  drainStack(G);
  ENGINE.executeAction('you', {type: 'symmetricizeChoice', which: 'power'});

  // Pick 'power' (=1): effective stats collapse to 1/1, total mana cost to 1
  // (additive: toughness -2, cost -1).
  const costTotal = (c) => c.cost ? ['W','U','B','R','G','C'].reduce((s,k)=>s+(c.cost[k]||0),0) : 0;
  const [ep2, et2] = ENGINE.getStats(piercer);
  check('power pick: effective power == 1', ep2 === 1, 'power=' + ep2);
  check('power pick: effective toughness == 1', et2 === 1, 'toughness=' + et2);
  check('power pick: total mana cost == 1', costTotal(piercer) === 1, 'cost=' + JSON.stringify(piercer.cost));
}

console.log('\n=== Out-of-set choices are rejected (validates whitelist) ===');
{
  const G = makeBaselineGame(['devoted_watcher','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'devoted_watcher');
  const piercer = mk('devoted_watcher', 'you');
  piercer.slotIdx = piercerSlotIdx;
  G.you.battlefield.push(piercer);

  const sym = mk('symmetricize', 'opp');
  G.opp.hand.push(sym);
  G.opp.mana.W = 1; G.opp.mana.C = 1;
  readyForCast(G, 'opp');

  ENGINE.executeAction('opp', {
    type: 'castSpell', cardIid: sym.iid,
    targets: [{kind: 'creature', iid: piercer.iid, label: 'Devoted Watcher'}],
  });
  drainStack(G);

  // Try a bogus 'which' value.
  const before = JSON.stringify({p: piercer.power, t: piercer.toughness, c: piercer.cost});
  ENGINE.executeAction('you', {type: 'symmetricizeChoice', which: 'banana'});
  const after = JSON.stringify({p: piercer.power, t: piercer.toughness, c: piercer.cost});
  check('bogus which value does not mutate target', before === after);
  check('pendingSymmetricizeChoice still set after rejected pick',
    G.pendingSymmetricizeChoice !== null);
}

console.log('\n=== Number choice: Archdemon ETB opens 1-5 prompt for the CONTROLLER ===');
{
  if (!CARDS['archdemon_of_bargains']) {
    console.log('  (archdemonBargains not in CARDS -- skipping)');
  } else {
    const G = makeBaselineGame();
    // Put Archdemon in opp's hand with enough mana to cast.
    const demon = mk('archdemon_of_bargains', 'opp');
    G.opp.hand.push(demon);
    G.opp.mana.B = 2; G.opp.mana.C = 3;
    readyForCast(G, 'opp');

    const cast = {type: 'castSpell', cardIid: demon.iid, targets: []};
    check('cast Archdemon is legal', ENGINE.isLegalAction('opp', cast));
    ENGINE.executeAction('opp', cast);
    drainStack(G);

    check('pendingNumberChoice set after Archdemon ETB',
      G.pendingNumberChoice !== null && G.pendingNumberChoice !== undefined);
    if (G.pendingNumberChoice) {
      const p = G.pendingNumberChoice;
      // You bargain WITH the demon: its non-controller picks. opp cast it, so
      // the chooser is opp(opp) = 'you' (the human is the dealmaker here).
      check("prompt who is the non-controller ('you')", p.who === 'you');
      check('prompt min is 1', p.min === 1);
      check('prompt max is 5', p.max === 5);
      check("prompt source is 'Archdemon of Bargains'",
        p.source === 'Archdemon of Bargains');
      check('prompt records sourceIid', p.sourceIid === demon.iid);
      check("onChoose continuation = 'bargainEtb'",
        p.onChoose === 'bargainEtb');
    }
  }
}

console.log('\n=== Submitting numberChoice stashes N on source + clears the prompt ===');
{
  if (!CARDS['archdemon_of_bargains']) {
    console.log('  (archdemonBargains not in CARDS -- skipping)');
  } else {
    const G = makeBaselineGame();
    const demon = mk('archdemon_of_bargains', 'opp');
    G.opp.hand.push(demon);
    G.opp.mana.B = 2; G.opp.mana.C = 3;
    readyForCast(G, 'opp');
    ENGINE.executeAction('opp', {type: 'castSpell', cardIid: demon.iid, targets: []});
    drainStack(G);

    // Submit number 3 as the non-controller (you), who owns the prompt.
    const choiceAction = {type: 'numberChoice', number: 3};
    check('numberChoice 3 is legal',
      ENGINE.isLegalAction('you', choiceAction));
    ENGINE.executeAction('you', choiceAction);

    check('pendingNumberChoice cleared after submit',
      G.pendingNumberChoice === null);
    // The Archdemon should now carry bargainsNum=3 so its dies-trigger
    // knows how many stickers to apply to the opposing side.
    const demonOnBoard = G.opp.battlefield.find(c => c.iid === demon.iid);
    check('demon still on battlefield', !!demonOnBoard);
    if (demonOnBoard) {
      check('demon.bargainsNum stashed as 3', demonOnBoard.bargainsNum === 3);
    }
  }
}

console.log('\n=== Out-of-range numbers are rejected ===');
{
  if (!CARDS['archdemon_of_bargains']) {
    console.log('  (archdemonBargains not in CARDS -- skipping)');
  } else {
    const G = makeBaselineGame();
    const demon = mk('archdemon_of_bargains', 'opp');
    G.opp.hand.push(demon);
    G.opp.mana.B = 2; G.opp.mana.C = 3;
    readyForCast(G, 'opp');
    ENGINE.executeAction('opp', {type: 'castSpell', cardIid: demon.iid, targets: []});
    drainStack(G);

    // Try numbers outside [1,5] as the non-controller (you) who owns the prompt,
    // so these exercise the range check rather than a who-mismatch.
    check('numberChoice 0 is NOT legal',
      !ENGINE.isLegalAction('you', {type: 'numberChoice', number: 0}));
    check('numberChoice 6 is NOT legal',
      !ENGINE.isLegalAction('you', {type: 'numberChoice', number: 6}));
    check('numberChoice -1 is NOT legal',
      !ENGINE.isLegalAction('you', {type: 'numberChoice', number: -1}));
    check('numberChoice 1 IS legal (min boundary)',
      ENGINE.isLegalAction('you', {type: 'numberChoice', number: 1}));
    check('numberChoice 5 IS legal (max boundary)',
      ENGINE.isLegalAction('you', {type: 'numberChoice', number: 5}));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
