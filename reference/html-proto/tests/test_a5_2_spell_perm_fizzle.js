// Audit A5-2 (Joe ruled FIZZLE, PR #98) — stapling a just-cast SPELL onto a
// non-creature battlefield PERMANENT.
//
// canonicalSplicePair ranks by template TYPE with no zone awareness, so a
// creature SPELL on the stack (type Creature, rank 0) wrongly outranked a
// battlefield Land (rank 2) and became the splice "base", routing the merge
// into the both-were-spells (S+S) path. Three things broke at once: the spell
// "fast-resolved" (mana gone, never reached any zone), the Land stayed in play
// untouched, and the S+S manual slot-shift over-deleted an UNRELATED run slot
// (saved to disk). Fix: the spell fizzles — countered to its owner's graveyard,
// before any charge accounting. Narrow: spell-onto-CREATURE is unaffected.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9600;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, damagedBySources: new Set(), keywords: [],
  });
}

const baseCre = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
const stapleLand = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Land') && isSpliceableStaple(k) && k !== 'city_of_brass');

console.log('=== A5-2: a creature spell stapled onto a battlefield land FIZZLES (no data loss) ===');
(() => {
  RUN.start({ cards: ['mountain', 'plains', 'swamp', 'forest'], colors: ['R', 'W', 'B', 'G'] }, 'stapler');
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };

  const slots0 = RUN.getSlots();
  const slotsLen0 = slots0.length;
  const staplerSlot0 = slots0.find(s => s.tplId === 'stapler');
  const charges0 = staplerSlot0.charges;
  check('precondition: stapler boon slot has charges', typeof charges0 === 'number', 'charges=' + charges0);

  // Battlefield land (the would-be staple permanent), owned by you with a run slot.
  const land = mk(stapleLand, 'you'); land.slotIdx = 0;
  G.you.battlefield.push(land);
  // A creature SPELL on the stack (the would-be base), with an unrelated run slot.
  const spellCard = mk(baseCre, 'you'); spellCard.slotIdx = 3;
  G.stack.push({ kind: 'spell', card: spellCard, controller: 'you', targets: [], modeIdx: 0 });
  const spellItem = G.stack[G.stack.length - 1];
  // The Stapler card driving the splice (for charge accounting).
  const stapler = mk('stapler', 'you'); stapler.slotIdx = slots0.findIndex(s => s.tplId === 'stapler');

  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Stapler', sourceIid: stapler.iid, sourceCard: stapler,
      allTargets: [{ kind: 'stack', stackItem: spellItem }, { kind: 'permanent', iid: land.iid }] },
    { kind: 'apply_in_game_splice' }, null);

  check('A5-2: the spell FIZZLED to its owner graveyard (was: vanished)',
    G.you.graveyard.some(c => c.iid === spellCard.iid), 'gy=' + JSON.stringify(G.you.graveyard.map(c => c.tplId)));
  check('the spell is off the stack', !G.stack.includes(spellItem));
  check('the land permanent survives on the battlefield', G.you.battlefield.some(c => c.iid === land.iid));

  const slotsAfter = RUN.getSlots();
  check('A5-2: no run slot deleted or minted (length unchanged)',
    slotsAfter.length === slotsLen0, 'before=' + slotsLen0 + ' after=' + slotsAfter.length);
  check('A5-2: the four deck slots are all intact', ['mountain', 'plains', 'swamp', 'forest'].every(t => slotsAfter.some(s => s.tplId === t)),
    JSON.stringify(slotsAfter.map(s => s.tplId)));
  const staplerAfter = slotsAfter.find(s => s.tplId === 'stapler');
  check('A5-2: a fizzle costs NO charge', staplerAfter && staplerAfter.charges === charges0,
    'before=' + charges0 + ' after=' + (staplerAfter && staplerAfter.charges));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
