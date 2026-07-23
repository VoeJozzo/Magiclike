// Audit A4-15 — this steal handler gates its slot mint on
// ctx.controller === 'you', the same you-side gate every sibling
// RUN-writing call has (endomorph_absorb, apply_sticker, rip). Steal is a
// boon that no opp deck carries today, but test_boss_removal_ai pins that
// the AI CAN cast it, so an opp-controlled steal must still be exercised:
// it mints a fresh instance into the thief's in-game library only
// (slotIdx null), never touching the victim's persisted run deck.

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
  // The opp's randomly-built deck may already hold a gray_ogre (carrying its own
  // run slot), so snapshot the existing gray_ogre iids and later pick out the
  // one the steal NEWLY minted — not a pre-existing library copy. Without this,
  // a find-first match on a stray deck gray_ogre flakes the slotIdx assertion.
  const beforeIids = new Set(
    G.opp.library.filter(c => c.tplId === 'gray_ogre').map(c => c.iid));
  ENGINE.applyEffect(ctx, { kind: 'steal' }, { kind: 'creature', iid: mine.iid });
  const durationLog = G.log.find(e => /theirs for this fight\.$/.test(e.msg));
  check('opponent steal log says the theft lasts for this fight',
    !!durationLog, durationLog && durationLog.msg);
  check('creature left the human battlefield', G.you.battlefield.length === 0);
  check('human run deck did NOT grow (no phantom duplicate slot)',
    RUN.getSlots().length === slotsBefore,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  const fresh = G.opp.library.find(c => c.tplId === 'gray_ogre' && !beforeIids.has(c.iid));
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
  const durationLog = G.log.find(e => /yours for the rest of the run\.$/.test(e.msg));
  check('human steal log says the theft lasts for the rest of the run',
    !!durationLog, durationLog && durationLog.msg);
  check('human steal appends a run-persistent slot',
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
