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
  const G = makeBaselineGame(['ancestralGuard','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'ancestralGuard');
  const piercer = mk('ancestralGuard', 'you');
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
    check('values.cost matches Watcher cmc (2 = W+C)', p.values.cost === 2);
  }
}

console.log('\n=== Submitting symmetricizeChoice collapses stats + persists to slot ===');
{
  const G = makeBaselineGame(['ancestralGuard','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'ancestralGuard');
  const piercer = mk('ancestralGuard', 'you');
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

  // Player picks 'toughness' (=3). After this, Watcher should be 3/3
  // cost {C:3} — chosen because it differs from both the native power
  // (1) and the native cost (2), so all three fields visibly change.
  const choiceAction = {type: 'symmetricizeChoice', which: 'toughness'};
  check("symmetricizeChoice is legal for the prompt's owner (you)",
    ENGINE.isLegalAction('you', choiceAction));
  ENGINE.executeAction('you', choiceAction);

  check('pendingSymmetricizeChoice cleared after submit',
    G.pendingSymmetricizeChoice === null);
  check('Watcher.power collapsed to 3', piercer.power === 3);
  check('Watcher.toughness collapsed to 3', piercer.toughness === 3);
  check('Watcher.cost.C = 3', piercer.cost && piercer.cost.C === 3);
  check('Watcher.symmetrizedTo sentinel set to 3', piercer.symmetrizedTo === 3);
  // tempPower / tempTou / permPower / permTou should be wiped.
  check('Watcher.tempPower wiped', piercer.tempPower === 0);
  check('Watcher.tempTou wiped', piercer.tempTou === 0);
  check('Watcher.permPower wiped', !piercer.permPower);
  check('Watcher.permTou wiped', !piercer.permTou);
  // Slot persistence (player-side only).
  const slotAfter = RUN.getSlots()[piercerSlotIdx];
  check('slot.symmetricized = 3 (persists for the run)',
    slotAfter && slotAfter.symmetricized === 3);
}

console.log("\n=== Picking 'power' on Watcher (power=1) collapses to 1/1 cost {C:1} ===");
{
  const G = makeBaselineGame(['ancestralGuard','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'ancestralGuard');
  const piercer = mk('ancestralGuard', 'you');
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

  check('power pick: power == 1', piercer.power === 1);
  check('power pick: toughness == 1', piercer.toughness === 1);
  check('power pick: cost.C == 1', piercer.cost.C === 1);
}

console.log('\n=== Out-of-set choices are rejected (validates whitelist) ===');
{
  const G = makeBaselineGame(['ancestralGuard','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains']);
  const slots = RUN.getSlots();
  const piercerSlotIdx = slots.findIndex(s => s.tplId === 'ancestralGuard');
  const piercer = mk('ancestralGuard', 'you');
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

console.log('\n=== Number choice: Archdemon ETB opens 1-5 prompt for the player ===');
{
  if (!CARDS['archdemonBargains']) {
    console.log('  (archdemonBargains not in CARDS -- skipping)');
  } else {
    const G = makeBaselineGame();
    // Put Archdemon in opp's hand with enough mana to cast.
    const demon = mk('archdemonBargains', 'opp');
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
      // The bargain prompt is always for the human player (per design).
      check("prompt who is 'you'", p.who === 'you');
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
  if (!CARDS['archdemonBargains']) {
    console.log('  (archdemonBargains not in CARDS -- skipping)');
  } else {
    const G = makeBaselineGame();
    const demon = mk('archdemonBargains', 'opp');
    G.opp.hand.push(demon);
    G.opp.mana.B = 2; G.opp.mana.C = 3;
    readyForCast(G, 'opp');
    ENGINE.executeAction('opp', {type: 'castSpell', cardIid: demon.iid, targets: []});
    drainStack(G);

    // Submit number 3.
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
  if (!CARDS['archdemonBargains']) {
    console.log('  (archdemonBargains not in CARDS -- skipping)');
  } else {
    const G = makeBaselineGame();
    const demon = mk('archdemonBargains', 'opp');
    G.opp.hand.push(demon);
    G.opp.mana.B = 2; G.opp.mana.C = 3;
    readyForCast(G, 'opp');
    ENGINE.executeAction('opp', {type: 'castSpell', cardIid: demon.iid, targets: []});
    drainStack(G);

    // Try a number outside [1,5].
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
