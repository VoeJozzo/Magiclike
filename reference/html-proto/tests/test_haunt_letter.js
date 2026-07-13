// Patient Haunt + Letter of Passage (color-pie session ships, 2026-07-13).
//
// Patient Haunt — {1}{W} Spirit 1/1 flying, "When ~ dies, put a +1/+1 sticker
// on it." Death-memory: the dies-trigger runs apply_sticker with scope:'self'
// (new branch — the card is already in the graveyard when the trigger
// resolves, so the lookup spans zones via findCardAnyZone). The sticker lands
// on the runtime card AND persists to the owning run slot. Documented
// semantics: modifiers/stickers survive death and same-battle revival
// (resetInPlayState never touches them), so a reanimated Haunt is bigger THIS
// battle, not just next battle.
//
// Letter of Passage — {1}{W} flash sorcery, "Exile target creature. Its
// controller may pay {2} during their turn to return it to their hand."
// Arrest with bail: move_card's post.ransom rider flags the exiled card; the
// payRansom action (isLegalAction + getLegalActions, the engine's standing
// parallel paths) surfaces the buy-back at sorcery speed on the owner's turn.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9800;
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
function drain(G) {
  let safety = 200;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
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

console.log('=== (a) Patient Haunt: death leaves a +1/+1 sticker on card AND slot ===');
(() => {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: ['patient_haunt', 'plains', 'plains', 'plains'], colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];

  const slots = RUN.getSlots();
  const slotIdx = slots.findIndex(s => s.tplId === 'patient_haunt');
  check('precondition: haunt has a run slot', slotIdx >= 0, 'slotIdx=' + slotIdx);

  const haunt = mk('patient_haunt', 'you');
  haunt.slotIdx = slotIdx;
  G.you.battlefield.push(haunt);
  check('precondition: 1/1', JSON.stringify(ENGINE.getStats(haunt)) === '[1,1]',
    JSON.stringify(ENGINE.getStats(haunt)));

  cast(G, 'lightning_bolt', [{ kind: 'creature', iid: haunt.iid, label: haunt.name }], 'opp');

  const dead = G.you.graveyard.find(c => c.iid === haunt.iid);
  check('haunt died to the bolt', !!dead);
  check('runtime card carries the stat_boost sticker',
    !!dead && (dead.stickers || []).some(s => s && s.kind === 'stat_boost'));
  const slotStickers = RUN.getSlots()[slotIdx].stickers || [];
  check('run slot persisted the sticker',
    slotStickers.some(s => s && s.kind === 'stat_boost'), JSON.stringify(slotStickers));

  // Same-battle revival: the sticker's modifiers survive resetInPlayState.
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Test Reanimate', sourceIid: 1 },
    { kind: 'move_card', from_zone: 'graveyard', to_zone: 'battlefield', selector: 'target' },
    { kind: 'creature', iid: haunt.iid });
  drain(G);
  const back = G.you.battlefield.find(c => c.iid === haunt.iid);
  check('haunt reanimated', !!back);
  check('reanimated haunt is 2/2 THIS battle',
    !!back && JSON.stringify(ENGINE.getStats(back)) === '[2,2]',
    back && JSON.stringify(ENGINE.getStats(back)));

  // Second death stacks a second sticker (inline descriptors stack).
  cast(G, 'lightning_bolt', [{ kind: 'creature', iid: haunt.iid, label: haunt.name }], 'opp');
  const dead2 = G.you.graveyard.find(c => c.iid === haunt.iid);
  check('second death recorded a second sticker',
    !!dead2 && (dead2.stickers || []).filter(s => s && s.kind === 'stat_boost').length === 2);
  check('slot now carries two stickers',
    (RUN.getSlots()[slotIdx].stickers || []).filter(s => s && s.kind === 'stat_boost').length === 2);
})();

console.log('=== (b) Patient Haunt: next battle rebuilds from the scarred slot ===');
(() => {
  RUN.startNextGame();
  const G = ENGINE.state();
  let inst = null;
  for (const z of ['battlefield', 'hand', 'library', 'graveyard']) {
    const c = G.you[z].find(x => x.tplId === 'patient_haunt');
    if (c) { inst = c; break; }
  }
  check('haunt instantiated somewhere in the new game', !!inst);
  check('carries both death-stickers into the new battle: 3/3',
    !!inst && JSON.stringify(ENGINE.getStats(inst)) === '[3,3]',
    inst && JSON.stringify(ENGINE.getStats(inst)));
})();

console.log('=== (c) Letter of Passage: exile with ransom; owner buys it back ===');
(() => {
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];
  G.you.exile = []; G.opp.exile = [];
  G.stack = [];

  const bear = mk('grizzly_bears', 'opp');
  G.opp.battlefield.push(bear);

  const { ok } = cast(G, 'letter_of_passage',
    [{ kind: 'creature', iid: bear.iid, label: bear.name }], 'you');
  check('letter cast + resolved', ok === true);
  const exiled = G.opp.exile.find(c => c.iid === bear.iid);
  check('bear exiled to ITS OWNER\'s exile', !!exiled);
  check('ransom flag set at {2}', !!exiled && !!exiled.ransom && exiled.ransom.cost.C === 2,
    exiled && JSON.stringify(exiled.ransom));

  // Not the opp's turn -> illegal for both sides.
  check('payRansom illegal on the exiler\'s turn',
    ENGINE.isLegalAction('opp', { type: 'payRansom', cardIid: bear.iid }) === false);
  check('payRansom never legal for the exiler',
    ENGINE.isLegalAction('you', { type: 'payRansom', cardIid: bear.iid }) === false);

  // Owner's main phase without mana -> gated on affordability.
  setup.startMainPhase('opp');
  G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  G.opp.battlefield = [];
  check('payRansom illegal without mana',
    ENGINE.isLegalAction('opp', { type: 'payRansom', cardIid: bear.iid }) === false);

  // With mana: legal, enumerated, and the AI reaches for it on idle mana.
  G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
  check('payRansom legal on owner\'s main phase with mana',
    ENGINE.isLegalAction('opp', { type: 'payRansom', cardIid: bear.iid }) === true);
  const acts = ENGINE.getLegalActions('opp').filter(a => a.type === 'payRansom');
  check('enumerated by getLegalActions', acts.length === 1, JSON.stringify(acts));
  // Determinism: shuffle-dependent posing can leave a land in opp's hand, and
  // the AI (correctly) plays lands before spending on ransoms. The assertion
  // is about idle-mana behavior, so idle the hand explicitly.
  G.opp.hand = [];
  const aiPick = AI.decide(G, 'opp');
  check('AI decides to pay the ransom with idle mana',
    !!aiPick && aiPick.type === 'payRansom', JSON.stringify(aiPick));

  const okPay = ENGINE.executeAction('opp', { type: 'payRansom', cardIid: bear.iid });
  check('payRansom executed', okPay === true);
  check('bear returned to owner\'s hand', G.opp.hand.some(c => c.iid === bear.iid));
  check('exile emptied', !G.opp.exile.some(c => c.iid === bear.iid));
  const bearBack = G.opp.hand.find(c => c.iid === bear.iid);
  check('ransom flag cleared', !!bearBack && !bearBack.ransom);
  check('mana spent', (G.opp.mana.C || 0) === 0, 'C=' + G.opp.mana.C);
})();

console.log('=== (d) Generated card text ===');
(() => {
  const letterText = describeCardText(CARDS.letter_of_passage);
  check('letter text carries the ransom clause',
    letterText.includes('Its controller may pay {2} during their turn to return it to their hand'),
    letterText);
  const hauntText = describeCardText(CARDS.patient_haunt);
  check('haunt text: dies-trigger + permanent +1/+1',
    /dies/i.test(hauntText) && hauntText.includes('+1/+1 permanently'), hauntText);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
