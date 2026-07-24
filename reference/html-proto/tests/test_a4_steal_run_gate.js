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
function newGame(cards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: cards || Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.stack = []; G.gameOver = false;
  return G;
}
function moveRunCardToBattlefield(G, slotIdx) {
  for (const zoneName of ['hand', 'library']) {
    const zone = G.you[zoneName];
    const idx = zone.findIndex(c => c.slotIdx === slotIdx);
    if (idx < 0) continue;
    const card = zone.splice(idx, 1)[0];
    card.controller = 'you';
    G.you.battlefield.push(card);
    return card;
  }
  throw new Error('run card not found for slot ' + slotIdx);
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

console.log('\n=== a human-owned run permanent retains its slot when Steal targets it directly ===');
(() => {
  const cards = ['gray_ogre', ...Array(11).fill('plains')];
  const G = newGame(cards);
  const mine = moveRunCardToBattlefield(G, 0);
  const slotsBefore = RUN.getSlots().length;
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Steal', sourceIid: null },
    { kind: 'steal' },
    { kind: 'creature', iid: mine.iid });
  check('direct self-target does not append a duplicate persisted slot',
    RUN.getSlots().length === slotsBefore,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  const fresh = G.you.library.find(c => c.tplId === 'gray_ogre');
  check('direct self-target reuses the original slot identity',
    !!fresh && fresh.slotIdx === 0, 'slotIdx=' + (fresh && fresh.slotIdx));
  check('the retained slot still describes the original run card',
    RUN.getSlots()[0].tplId === 'gray_ogre');
})();

console.log('\n=== stealing back a temporarily controlled run permanent retains its slot ===');
(() => {
  const cards = ['gray_ogre', ...Array(11).fill('plains')];
  const G = newGame(cards);
  const mine = moveRunCardToBattlefield(G, 0);
  ENGINE.applyEffect(
    { controller: 'opp', sourceName: 'Threaten', sourceIid: null },
    { kind: 'change_control', duration: 'eot' },
    { kind: 'creature', iid: mine.iid });
  check('temporary control moved the human-owned permanent to the opponent',
    G.opp.battlefield.includes(mine) && mine.owner === 'you' && mine.slotIdx === 0);
  const slotsBefore = RUN.getSlots().length;
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Steal', sourceIid: null },
    { kind: 'steal' },
    { kind: 'creature', iid: mine.iid });
  check('steal-back does not append a duplicate persisted slot',
    RUN.getSlots().length === slotsBefore,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  const fresh = G.you.library.find(c => c.tplId === 'gray_ogre');
  check('steal-back reuses the original slot identity',
    !!fresh && fresh.slotIdx === 0, 'slotIdx=' + (fresh && fresh.slotIdx));
  check('steal-back mints a clean human-owned instance',
    !!fresh && fresh.owner === 'you' && !fresh.tempControlUntilEot);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
