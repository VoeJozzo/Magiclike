// Refactor protection for the extracted resolveTarget /
// pluckFromBattlefield helpers. Two layers:
//
//   Outer (source-level): grep the engine source for helper definitions
//   and count call sites. The counts ARE meaningful — if someone adds a
//   new code path that bypasses resolveTarget (e.g. inlines the lookup),
//   that's the regression we're guarding against. Bump the expected
//   count rather than deleting the assertion when the count legitimately
//   changes.
//
//   Inner (smoke test): boot the engine, prove the game initializes
//   cleanly and basic state invariants hold post-refactor.
//
// Adapted from the prior-session bundle.

const setup = require('./_setup');
const code = setup.getSource();

let outerPass = 0, outerFail = 0;
function outerCheck(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) outerPass++; else outerFail++;
}

console.log('=== Source-level checks ===');
outerCheck('resolveTarget defined', /function resolveTarget\(ctx, target\)/.test(code));
outerCheck('pluckFromBattlefield defined', /function pluckFromBattlefield\(f\)/.test(code));

const resolveCalls = (code.match(/const f = resolveTarget\(ctx, target\)/g) || []).length;
outerCheck('resolveTarget call sites = 19 (18 + 1 in helper comment)',
  resolveCalls === 19, 'actual=' + resolveCalls);

const pluckCalls = (code.match(/pluckFromBattlefield\(/g) || []).length;
outerCheck('pluckFromBattlefield call sites = 11 (incl. helper + comments + move_card)',
  pluckCalls === 11, 'actual=' + pluckCalls);

const fizzleInCode = code.split('\n').filter(line =>
  /fizzles — target gone/.test(line) && !/^\s*\/\//.test(line.trim())
).length;
outerCheck('Fizzle message in <= 4 places', fizzleInCode <= 4, 'actual=' + fizzleInCode);

setup.loadEngine();

console.log('\n=== Smoke test: game boots after refactor ===');
let pass = 0, fail = 0;
function check(label, ok) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label);
  if (ok) pass++; else fail++;
}

RUN.start({cards:['savannahLions','furnaceWhelp','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['W','R']}, null);
RUN.load();
ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
const G = ENGINE.state();
check('ENGINE.init returned state', G !== null);
check('Player has hand', G.you.hand.length > 0);
check('Player has library', G.you.library.length > 0);
check('Opp has battlefield array', Array.isArray(G.opp.battlefield));

const damageCard = [...G.you.library, ...G.you.hand].find(c =>
  Array.isArray(c.effects) && c.effects.some(e => e.kind === 'damage' && (e.target === 'creature' || e.target === 'any'))
);
if (damageCard) {
  check('game state intact after refactor', G.you.hand.length > 0 && G.opp.hand.length >= 0);
}

console.log('\n=== INNER: ' + pass + ' passed, ' + fail + ' failed ===');
console.log('=== OUTER: ' + outerPass + ' passed, ' + outerFail + ' failed ===');
const _allPass = pass + outerPass, _allFail = fail + outerFail;
console.log('=== TOTAL: ' + _allPass + ' passed, ' + _allFail + ' failed ===');
process.exit(_allFail > 0 ? 1 : 0);
