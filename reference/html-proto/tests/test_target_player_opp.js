// Accurate player-target text: a card's rendered text must match what's actually
// targetable. The old code GUESSED "target opponent" vs "target player" from the
// effect kind/sign while the data was `target:'player'` (either player legal) —
// so it printed "target opponent" for cards you could actually aim at yourself.
// Now there are two precise filters: `opp` (opponent-only) renders "target
// opponent" AND only the opponent is legal; `player` (choose-any) renders "target
// player" AND both players are legal. Text == behavior, so plans are trustworthy.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
function r(c) { return describeCardSegments(c, { skipKeywords: false }).map(x => x.text).join(''); }

console.log('=== opp-targeting cards: text says "opponent" AND only the opponent is legal ===');
(() => {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  // targetsForFilter('opp', who) must return exactly the one opponent.
  const oppTargets = ENGINE.targetsForFilter('opp', 'you');
  check('targetsForFilter(opp) → exactly the opponent', oppTargets.length === 1
    && oppTargets[0].kind === 'player' && oppTargets[0].who === 'opp', JSON.stringify(oppTargets));
  // representative migrated cards
  const want = {
    duress: /target opponent discards/i,
    blood_priest: /target opponent loses 2 life/i,
    diabolic_edict: /target opponent sacrifices/i,
    goblin_chieftain: /target opponent loses 1 life/i,
  };
  for (const [id, re] of Object.entries(want)) {
    check(id + ' is target:opp', CARDS[id].target === 'opp' || (CARDS[id].triggers || []).some(t => t.target === 'opp')
      || (CARDS[id].abilities || []).some(a => a.target === 'opp'));
    check(id + ' text reads "target opponent"', re.test(r(CARDS[id])), r(CARDS[id]));
  }
})();

console.log('\n=== choose-any heals: text says "target player" AND both players legal ===');
(() => {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const playerTargets = ENGINE.targetsForFilter('player', 'you');
  check('targetsForFilter(player) → both players', playerTargets.length === 2);
  for (const id of ['healing_light', 'healing_salve']) {
    check(id + ' stays target:player', CARDS[id].target === 'player');
    check(id + ' text reads "target player"', /target player gains/i.test(r(CARDS[id])), r(CARDS[id]));
  }
})();

console.log('\n=== targetPhrase is kind-independent now (no guessing) ===');
(() => {
  check('opp + any kind → "target opponent"',
    targetPhrase({ target: 'opp', kind: 'damage' }) === 'target opponent'
    && targetPhrase({ target: 'opp', kind: 'gain_life', amount: -2 }) === 'target opponent');
  check('player + any kind → "target player"',
    targetPhrase({ target: 'player', kind: 'damage' }) === 'target player'
    && targetPhrase({ target: 'player', kind: 'gain_life' }) === 'target player');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
