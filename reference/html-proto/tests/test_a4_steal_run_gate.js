// Audit A4-15 — the steal handler wrote the HUMAN's persisted run state for
// ANY controller: RUN.appendSlot was the lone RUN-writing call without the
// 'you' gate every sibling handler has (endomorph_absorb, apply_sticker,
// rip). An opp-controlled Steal (latent today — steal is special:true and no
// opp deck carries it, but test_boss_removal_ai pins that the AI CAN cast
// it) appended the stolen slot to the VICTIM's run deck: a duplicate of your
// own card, persisted into your save.
//
// Fix: slot mint gated on ctx.controller === 'you'. An opp thief keeps the
// theft in-game only (fresh instance into its in-game library, slotIdx
// null); the victim's slot is deliberately untouched (in-game-only theft).

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
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.stack = []; G.gameOver = false;
  return G;
}

console.log('=== A4-15: an OPP-controlled steal must NOT touch the human run deck ===');
(() => {
  const G = newGame();
  // The victim's creature carries a real run slot (the dangerous shape).
  const mine = mk('gray_ogre', 'you');
  mine.slotIdx = 0;
  G.you.battlefield.push(mine);
  const slotsBefore = RUN.getSlots().length;
  const ctx = { controller: 'opp', sourceName: 'Thief Boss', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'steal' }, { kind: 'creature', iid: mine.iid });
  check('creature left the human battlefield', G.you.battlefield.length === 0);
  check('human run deck did NOT grow (no phantom duplicate slot)',
    RUN.getSlots().length === slotsBefore,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  const fresh = G.opp.library.find(c => c.tplId === 'gray_ogre');
  check("fresh instance shuffled into the thief's in-game library", !!fresh);
  if (fresh) {
    check('fresh instance is opp-owned', fresh.owner === 'opp');
    check('fresh instance has no run-slot pointer (in-game-only theft)',
      fresh.slotIdx == null, 'slotIdx=' + fresh.slotIdx);
  }
  check("victim's original slot untouched (still " + slotsBefore + ' slots, idx 0 intact)',
    RUN.getSlots()[0] != null);
})();

console.log('\n=== control: the HUMAN-controlled steal still mints a slot ===');
(() => {
  const G = newGame();
  const theirs = mk('gray_ogre', 'opp');
  G.opp.battlefield.push(theirs);
  const slotsBefore = RUN.getSlots().length;
  const ctx = { controller: 'you', sourceName: 'Steal', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'steal' }, { kind: 'creature', iid: theirs.iid });
  check('human steal appends a run slot (yours forever)',
    RUN.getSlots().length === slotsBefore + 1,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  const fresh = G.you.library.find(c => c.tplId === 'gray_ogre');
  check('fresh instance shuffled into YOUR library', !!fresh);
  if (fresh) {
    check('fresh instance points at the minted slot',
      typeof fresh.slotIdx === 'number' && fresh.slotIdx === slotsBefore);
  }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
