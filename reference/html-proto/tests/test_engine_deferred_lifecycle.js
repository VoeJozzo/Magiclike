const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 24000;
function mk(tplId, controller, slotIdx) {
  const card = ENGINE.makeCard(tplId, undefined, slotIdx);
  card.iid = nextIid++;
  card.owner = controller;
  card.controller = controller;
  return card;
}
function newGame(cards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: cards || Array(12).fill('plains'), colors: ['W', 'U', 'B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.gameOver = false;
  return G;
}
function removeFromPlayerZones(G, card) {
  for (const zoneName of ['library', 'hand', 'battlefield', 'graveyard', 'exile']) {
    const zone = G.you[zoneName];
    const idx = zone.indexOf(card);
    if (idx >= 0) zone.splice(idx, 1);
  }
}
function findAll(G, tplId) {
  const cards = [];
  for (const zoneName of ['library', 'hand', 'battlefield', 'graveyard', 'exile']) {
    cards.push(...G.you[zoneName].filter(c => c.tplId === tplId));
  }
  return cards;
}
function readyForCast(G, who) {
  setup.startMainPhase(who);
  G[who].mana = { W: 20, U: 20, B: 20, R: 20, G: 20, C: 20 };
}
function passUntil(G, done, max) {
  let safety = max || 40;
  while (!done() && safety-- > 0) {
    const who = ENGINE.expectedActor();
    if (!who) break;
    ENGINE.executeAction(who, { type: 'pass' });
  }
}
const VANILLA = Object.keys(CARDS).find(id => {
  const card = CARDS[id];
  return hasType(card, 'Creature') && !card.triggers && !card.abilities && !card.static_buffs;
});

console.log('=== Run-slot removal tracks stack and active resolution cards ===');
{
  const G = newGame(['plains', 'island']);
  const waiting = mk('preordain', 'you', 1);
  G.stack = [{ controller: 'you', card: waiting, targets: [] }];
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Test Rip', sourceIid: null },
    { kind: 'rip' },
    { kind: 'permanent', controller: 'you', slotIdx: 0, iid: -1, label: 'Plains' }
  );
  check('a waiting stack spell is reindexed with its run slot', waiting.slotIdx === 0,
    'slotIdx=' + waiting.slotIdx);
}
{
  const G = newGame(['phylactery', 'preordain']);
  const preordain = findAll(G, 'preordain')[0];
  removeFromPlayerZones(G, preordain);
  G.you.library = [];
  G.you.hand = [preordain];
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: preordain.iid });
  passUntil(G, () => G.stack.length === 0);
  check('deck-out Phylactery rip removes the currently resolving Preordain slot',
    RUN.getSlots().length === 1 && RUN.getSlots()[0].tplId === 'phylactery');
  check('a ripped resolving spell does not enter the graveyard under a stale slot alias',
    !G.you.graveyard.some(c => c.iid === preordain.iid));
  check('active resolution context clears after the spell finishes', G.resolutionContext == null);
}

console.log('\n=== Deferred search and discard finish housekeeping after the answer ===');
{
  const G = newGame();
  const findable = mk(VANILLA, 'you');
  const tutor = mk('demonic_tutor', 'you');
  G.you.library.push(findable);
  G.you.hand.push(tutor);
  G.you.life = 1;
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: tutor.iid });
  passUntil(G, () => !!G.pendingSearch);
  check('search pause does not check lethal before its continuation', !G.gameOver && G.you.life === 1);
  ENGINE.executeAction('you', { type: 'searchPick', cardIid: findable.iid });
  check('search continuation applies trailing life loss then checks life totals',
    G.gameOver && G.winner === 'opp');
}
{
  CARDS._continuation_discard = {
    name: 'Continuation Discard', cost: {}, types: ['Sorcery'],
    effects: [
      { kind: 'discard', amount: 1 },
      { kind: 'gain_life', amount: -2, scope: 'self' },
    ],
  };
  const G = newGame();
  const spell = mk('_continuation_discard', 'you');
  const fodder = mk(VANILLA, 'you');
  G.you.hand.push(spell, fodder);
  G.you.life = 1;
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: spell.iid });
  passUntil(G, () => !!G.forcedDiscard);
  check('discard pause remains live before housekeeping', !G.gameOver && G.forcedDiscard.remaining === 1);
  ENGINE.executeAction('you', { type: 'discard', cardIid: fodder.iid });
  check('last discard applies trailing effects and checks life totals once',
    G.gameOver && G.winner === 'opp');
  delete CARDS._continuation_discard;
}

console.log('\n=== Symmetricize performs SBAs after the human choice ===');
{
  CARDS._continuation_symmetricize = {
    name: 'Continuation Symmetricize', cost: {}, types: ['Sorcery'],
    effects: [{ kind: 'symmetricize', target: 'creature' }],
  };
  const G = newGame();
  const spell = mk('_continuation_symmetricize', 'you');
  const target = mk(VANILLA, 'you');
  target.damage = 99;
  G.you.hand.push(spell);
  G.you.battlefield.push(target);
  readyForCast(G, 'you');
  ENGINE.executeAction('you', {
    type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: target.iid }],
  });
  passUntil(G, () => !!G.pendingSymmetricizeChoice);
  check('lethally damaged target remains until the deferred choice completes',
    G.you.battlefield.includes(target));
  ENGINE.executeAction('you', { type: 'symmetricizeChoice', which: 'power' });
  check('choice completion sweeps the lethally damaged creature',
    !G.you.battlefield.includes(target) && G.you.graveyard.includes(target));
  delete CARDS._continuation_symmetricize;
}

console.log("\n=== Multiple Architect's Codices queue distinct build prompts ===");
{
  CARDS._draw_two_codices = {
    name: 'Draw Two Codices', cost: {}, types: ['Sorcery'],
    effects: [{ kind: 'draw', amount: 2 }],
  };
  const G = newGame(['architects_codex', 'architects_codex', ...Array(10).fill('plains')]);
  const codices = findAll(G, 'architects_codex').sort((a, b) => a.slotIdx - b.slotIdx);
  for (const card of codices) {
    removeFromPlayerZones(G, card);
    card._builtThisGame = false;
  }
  G.pendingTriggerBuild = null;
  G.pendingTriggerBuildQueue = [];
  G.you.library = codices.slice();
  const drawSpell = mk('_draw_two_codices', 'you');
  G.you.hand = [drawSpell];
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: drawSpell.iid });
  passUntil(G, () => G.stack.length === 0);

  check('both drawn Codices are marked built only after both prompts are retained',
    codices.every(c => c._builtThisGame) && G.pendingTriggerBuildQueue.length === 1,
    'built=' + codices.map(c => !!c._builtThisGame).join(',')
      + ' queue=' + G.pendingTriggerBuildQueue.length
      + ' pending=' + (G.pendingTriggerBuild && G.pendingTriggerBuild.cardIid)
      + ' codices=' + codices.map(c => c.iid).join(',')
      + ' hand=' + G.you.hand.map(c => c.tplId).join(','));
  const firstIid = G.pendingTriggerBuild.cardIid;
  ENGINE.executeAction('you', { type: 'triggerBuildPick', choice: 0 });
  ENGINE.executeAction('you', { type: 'triggerBuildPick', choice: 0 });
  check('finishing the first build exposes the second Codex prompt',
    G.pendingTriggerBuild && G.pendingTriggerBuild.cardIid !== firstIid);
  const first = codices.find(c => c.iid === firstIid);
  check('the first ability persists to the first Codex slot',
    !!RUN.getSlots()[first.slotIdx].bonusTrigger);

  const secondIid = G.pendingTriggerBuild.cardIid;
  ENGINE.executeAction('you', { type: 'triggerBuildPick', choice: 0 });
  ENGINE.executeAction('you', { type: 'triggerBuildPick', choice: 0 });
  const second = codices.find(c => c.iid === secondIid);
  check('the second ability persists to the second Codex slot',
    !!RUN.getSlots()[second.slotIdx].bonusTrigger);
  check('the build queue clears only after both prompts complete',
    G.pendingTriggerBuild == null && G.pendingTriggerBuildQueue.length === 0);
  delete CARDS._draw_two_codices;
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
