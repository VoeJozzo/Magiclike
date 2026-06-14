// Audit A4-6 — color/not_color target filters must test the FULL color
// identity, not just the first colored pip (Joe's ruling PR #98: "we're
// likely to want to use 'not_color b' again, so we should definitely fix
// this").
//
// card.color is derived as colors[0] (cards.js), and matchFilter used to
// compare ONLY that — so Doom Blade ("Destroy target non-Black creature", its
// own rendered oracle text) legally destroyed the {U}{B} Seal-Thief Courier
// (first pip U), and a positive {color:'U'} filter would have REJECTED a W/U
// card (first pip W). Fix: both checks route through colorsOfCard's color
// list, with a card.color fallback so cost-less cards (tokens) keep their
// single-color identity. This file pins:
//   1. Doom Blade vs the real {U}{B} Seal-Thief Courier: ILLEGAL at cast
//      legality (executed end-to-end pre-fix: it was destroyed);
//   2. the mono-color pins stay: illegal vs mono-black, legal vs non-black;
//   3. matchFilter unit pins for both directions on multicolor cards;
//   4. the token path: tokens have no cost/colors — color identity falls
//      back to their printed single color.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 6800;
function mkInstance(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, keywords: (inst.keywords || []).slice(),
    damagedBySources: new Set(),
  });
}
function newGame() {
  RUN.start({ cards: Array(12).fill('swamp'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = [];
  return G;
}
function canCast(G, tplId, targetCreature) {
  const spell = mkInstance(tplId, 'you'); G.you.hand.push(spell);
  return ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: targetCreature.iid, label: targetCreature.name }] });
}

console.log('=== 1. Doom Blade vs the {U}{B} Seal-Thief Courier — end to end ===');
(() => {
  const G = newGame();
  const courier = mkInstance('seal_thief_courier', 'opp');
  G.opp.battlefield.push(courier);
  check('data pin: courier is U-first multicolor with B in its identity',
    courier.color === 'U' && JSON.stringify(courier.colors) === '["U","B"]',
    'color=' + courier.color + ' colors=' + JSON.stringify(courier.colors));
  check('"non-Black" Doom Blade is ILLEGAL vs the U/B courier (was: destroyed it)',
    !canCast(G, 'doom_blade', courier));
})();

console.log('\n=== 2. mono-color behavior unchanged ===');
(() => {
  const G = newGame();
  const black = mkInstance('abyss_lurker', 'opp');     // mono-{B}
  const red = mkInstance('goblin_raider', 'opp');      // mono-{R}
  G.opp.battlefield.push(black, red);
  check('still illegal vs a mono-black creature', !canCast(G, 'doom_blade', black));
  check('still legal vs a non-black creature', canCast(G, 'doom_blade', red));
})();

console.log('\n=== 3. matchFilter unit pins — both filter directions, full identity ===');
(() => {
  newGame();
  const ub = { iid: -1, types: ['Creature'], color: 'U', colors: ['U', 'B'],
    cost: { U: 1, B: 1, C: 1 }, keywords: [] };
  check('not_color B rejects a U/B card', !ENGINE.matchFilter(ub, { not_color: 'B' }, 'opp', 'you'));
  check('not_color W still accepts it', ENGINE.matchFilter(ub, { not_color: 'W' }, 'opp', 'you'));
  check('color B accepts a U/B card (B anywhere in the identity)',
    ENGINE.matchFilter(ub, { color: 'B' }, 'opp', 'you'));
  check('color U accepts it too', ENGINE.matchFilter(ub, { color: 'U' }, 'opp', 'you'));
  check('color G still rejects it', !ENGINE.matchFilter(ub, { color: 'G' }, 'opp', 'you'));
})();

console.log('\n=== 4. token path: color identity falls back to the printed color ===');
(() => {
  newGame();
  const token = ENGINE.makeToken('spirit_w_1_1', 'you');   // white token, no cost/colors
  check('data pin: token has color but no cost/colors array',
    token.color === 'W' && token.cost === undefined && !Array.isArray(token.colors));
  check('not_color W rejects the white token', !ENGINE.matchFilter(token, { not_color: 'W' }, 'you', 'you'));
  check('color W accepts the white token', ENGINE.matchFilter(token, { color: 'W' }, 'you', 'you'));
  check('not_color B accepts it', ENGINE.matchFilter(token, { not_color: 'B' }, 'you', 'you'));
})();

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
