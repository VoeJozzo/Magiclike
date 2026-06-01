// DIVERGENCE D4: gain_life is a unified signed life-delta. amount > 0 gains and
// fires life_changed(delta>0) → is_life_gain; amount < 0 loses life, tracks
// lifeLostThisTurn, and fires life_changed(delta<0) → is_life_loss; 0 = no-op.
// Card-text renders the sign. (No card uses negatives yet — this enables drain-
// as-loss and lose-life triggers without a new effect kind.)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
RUN.startNextGame();
const G = ENGINE.state();
const CTX = { controller: 'you', sourceName: 'X', sourceIid: -1 };

console.log('=== positive gain_life unchanged ===');
(() => {
  G.you.life = 20;
  ENGINE.applyEffect(CTX, { kind: 'gain_life', scope: 'self', amount: 4 }, null);
  check('gains 4 life', G.you.life === 24, 'life=' + G.you.life);
})();

console.log('\n=== negative gain_life loses life + tracks lifeLostThisTurn ===');
(() => {
  G.you.life = 20; G.you.lifeLostThisTurn = 0;
  ENGINE.applyEffect(CTX, { kind: 'gain_life', scope: 'self', amount: -3 }, null);
  check('loses 3 life', G.you.life === 17, 'life=' + G.you.life);
  check('lifeLostThisTurn += 3', G.you.lifeLostThisTurn === 3, 'lost=' + G.you.lifeLostThisTurn);
})();

console.log('\n=== zero is a no-op ===');
(() => {
  G.you.life = 20; G.you.lifeLostThisTurn = 0;
  ENGINE.applyEffect(CTX, { kind: 'gain_life', scope: 'self', amount: 0 }, null);
  check('life unchanged at 0', G.you.life === 20);
  check('no loss tracked at 0', G.you.lifeLostThisTurn === 0);
})();

console.log('\n=== life-loss fires is_life_loss; gain fires is_life_gain ===');
(() => {
  check('is_life_loss matches delta<0', ATOMIC_PREDICATES.is_life_loss({ event: { delta: -2 } }) === true);
  check('is_life_loss false for delta>0', ATOMIC_PREDICATES.is_life_loss({ event: { delta: 3 } }) === false);
  check('is_life_gain matches delta>0', ATOMIC_PREDICATES.is_life_gain({ event: { delta: 3 } }) === true);
})();

console.log('\n=== card-text renders the sign ===');
(() => {
  const neg = describeEffect({ kind: 'gain_life', scope: 'self', amount: -2 }).map(s => s.text).join('');
  const pos = describeEffect({ kind: 'gain_life', scope: 'self', amount: 2 }).map(s => s.text).join('');
  check('negative → "lose 2 life"', /lose 2 life/.test(neg), neg);
  check('positive → "gain 2 life"', /gain .*2.* life/.test(pos.replace(/\s+/g, ' ')), pos);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
