// Exercises the removeSlotByIdx caller contract (js/run.js).

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
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.stack = []; G.gameOver = false;
  G.you.playedSlotIdxs = new Set();
  return G;
}
const ripCtx = { controller: 'you', sourceName: 'Vile Edict', sourceIid: null };

console.log('=== A9-2 + A9-3: EFFECTS.rip honors the slot-removal contract (slotIdx + playedSlotIdxs) ===');
(() => {
  const G = newGame();
  const victim = mk('gray_ogre', 'you'); victim.slotIdx = 0;
  const bystander = mk('gray_ogre', 'you'); bystander.slotIdx = 1;
  G.you.battlefield = [victim, bystander];
  G.you.playedSlotIdxs.add(1);
  const before = RUN.getSlots().length;

  ENGINE.applyEffect(ripCtx, { kind: 'rip' }, { controller: 'you', slotIdx: 0, iid: victim.iid, label: 'Victim' });

  check('a run slot was removed', RUN.getSlots().length === before - 1, 'before=' + before + ' after=' + RUN.getSlots().length);
  check('A9-2: bystander slotIdx decremented 1 -> 0 (was stale at 1)', bystander.slotIdx === 0, 'slotIdx=' + bystander.slotIdx);
  check('A9-3: playedSlotIdxs remapped {1} -> {0}', G.you.playedSlotIdxs.has(0) && !G.you.playedSlotIdxs.has(1),
    JSON.stringify([...G.you.playedSlotIdxs]));
})();

console.log('\n=== A9-3: the REMOVED index is dropped, not just decremented ===');
(() => {
  const G = newGame();
  const victim = mk('gray_ogre', 'you'); victim.slotIdx = 0;
  const bystander = mk('gray_ogre', 'you'); bystander.slotIdx = 1;
  G.you.battlefield = [victim, bystander];
  G.you.playedSlotIdxs.add(0); G.you.playedSlotIdxs.add(1);

  ENGINE.applyEffect(ripCtx, { kind: 'rip' }, { controller: 'you', slotIdx: 0, iid: victim.iid, label: 'Victim' });

  check('drop-at + decrement-above: {0,1} -> {0}',
    G.you.playedSlotIdxs.has(0) && !G.you.playedSlotIdxs.has(1) && G.you.playedSlotIdxs.size === 1,
    JSON.stringify([...G.you.playedSlotIdxs]));
  check('bystander slotIdx decremented to 0', bystander.slotIdx === 0, 'slotIdx=' + bystander.slotIdx);
})();

console.log('\n=== slot ownership survives temporary opposing control ===');
(() => {
  const G = newGame();
  G.you.library = [];
  const victim = mk('gray_ogre', 'you');
  victim.slotIdx = 0;
  victim.controller = 'opp';
  const shifted = mk('gray_ogre', 'you');
  shifted.slotIdx = 1;
  shifted.controller = 'opp';
  const opponentCard = mk('gray_ogre', 'opp');
  opponentCard.slotIdx = 2;
  G.opp.battlefield = [victim, shifted, opponentCard];

  ENGINE.applyEffect(ripCtx, { kind: 'rip' },
    { controller: 'you', slotIdx: 0, iid: victim.iid, label: 'Victim' });

  check('removed human-owned slot leaves the opposing battlefield',
    !G.opp.battlefield.some(c => c.iid === victim.iid));
  check('higher human-owned slot shifts under opposing control',
    shifted.slotIdx === 0, 'slotIdx=' + shifted.slotIdx);
  check('opponent-owned slot pointer is untouched',
    opponentCard.slotIdx === 2, 'slotIdx=' + opponentCard.slotIdx);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
