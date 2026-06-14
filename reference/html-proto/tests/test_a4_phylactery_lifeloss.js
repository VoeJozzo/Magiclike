// Audit A4-12 — Phylactery's "Your life can't go below 0" was violated by
// life-LOSS effects: gain_life's negative branch (the ~14-card drain family)
// subtracted raw with no floor and no rip, leaving the protected player at
// NEGATIVE life indefinitely — and the next damagePlayer then computed
// max(0, neg − amount), RESETTING them up to 0 (a net gain from being hit).
//
// Design ruling (option A, per the staged packet): ONE price for losing
// life — drains past 0 rip slots exactly like damage does. Shared helper
// losePlayerLife(who, n) is the single writer for life loss from both
// damagePlayer and gain_life's negative branch: floor at 0 under
// protection, overflow rips, lifeLostThisTurn + life_changed(delta<0) for
// the ACTUAL loss. Phylactery's card text amended "Damage past 0" → "Life
// lost past 0".

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function newGame(cards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards, colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.stack = []; G.gameOver = false;
  return G;
}
const PHYL_DECK = ['phylactery'].concat(Array(11).fill('plains'));

console.log('=== A4-12: a drain past 0 floors at 0 and rips (protected) ===');
(() => {
  const G = newGame(PHYL_DECK);
  G.you.life = 1;
  G.you.lifeLostThisTurn = 0;
  const slotsBefore = RUN.getSlots().length;
  const ctx = { controller: 'you', sourceName: 'Blood Priest', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'gain_life', amount: -3 });
  check('life floors at 0 (was: went to -2)', G.you.life === 0, 'life=' + G.you.life);
  check('the 2 points past 0 each rip a slot (was: 0 rips)',
    RUN.getSlots().length === slotsBefore - 2,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  check('lifeLostThisTurn tracks the ACTUAL loss (1)',
    G.you.lifeLostThisTurn === 1, 'lifeLostThisTurn=' + G.you.lifeLostThisTurn);
  check('game not over (Phylactery holds)', G.gameOver === false);
})();

console.log('\n=== control: the damage path is unchanged ===');
(() => {
  const G = newGame(PHYL_DECK);
  G.you.life = 1;
  G.you.lifeLostThisTurn = 0;
  const slotsBefore = RUN.getSlots().length;
  const ctx = { controller: 'opp', sourceName: 'Lightning Bolt', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 3 }, { kind: 'player', who: 'you' });
  check('damage floors at 0', G.you.life === 0, 'life=' + G.you.life);
  check('damage overflow rips 2', RUN.getSlots().length === slotsBefore - 2,
    'slots ' + slotsBefore + ' -> ' + RUN.getSlots().length);
  check('lifeLostThisTurn = 1 (actual)', G.you.lifeLostThisTurn === 1);
})();

console.log('\n=== control: drains WITHOUT Phylactery are untouched ===');
(() => {
  const G = newGame(Array(12).fill('plains'));
  G.you.life = 1;
  G.you.lifeLostThisTurn = 0;
  const slotsBefore = RUN.getSlots().length;
  const ctx = { controller: 'you', sourceName: 'Blood Priest', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'gain_life', amount: -3 });
  check('unprotected drain still goes negative (checkLifeTotals owns the loss)',
    G.you.life === -2, 'life=' + G.you.life);
  check('no slots ripped without the boon', RUN.getSlots().length === slotsBefore);
  check('lifeLostThisTurn = 3 (full)', G.you.lifeLostThisTurn === 3);
})();

console.log('\n=== control: positive gain_life unchanged ===');
(() => {
  const G = newGame(PHYL_DECK);
  G.you.life = 5;
  const ctx = { controller: 'you', sourceName: 'Heal', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'gain_life', amount: 4 });
  check('gain still adds', G.you.life === 9, 'life=' + G.you.life);
})();

console.log('\n=== Phylactery card text says "life lost", not "damage" ===');
(() => {
  const txt = (CARDS.phylactery.text || '');
  check('text covers life loss past 0', /[Ll]ife lost past 0/.test(txt), txt);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
