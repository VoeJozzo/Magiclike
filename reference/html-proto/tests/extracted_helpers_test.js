// Boot smoke test: the engine initializes cleanly and basic state invariants
// hold. (Formerly also carried a source-grep layer asserting resolveTarget /
// pluckFromBattlefield call-site COUNTS — deleted: those tested how the code was
// written, not what it does, broke on benign refactors, and missed the bug they
// claimed to guard. The behavior those helpers centralize — clean fizzle on a
// dead target, hexproof gating — is covered behaviorally in test_targeting /
// test_targeting_cast / test_move_card.)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Smoke test: game boots and state is well-formed ===');
RUN.start({ cards: ['savannahLions', 'furnaceWhelp', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'], colors: ['W', 'R'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), Array(17).fill('mountain'));
const G = ENGINE.state();
check('ENGINE.init returned state', G !== null);
check('player drew an opening hand', G.you.hand.length > 0);
check('player has a library', G.you.library.length > 0);
check('opp battlefield is an array', Array.isArray(G.opp.battlefield));
check('both players start at the configured life', G.you.life > 0 && G.opp.life > 0);
check('phase machine initialized', typeof G.phase === 'string' && G.phase.length > 0);

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
