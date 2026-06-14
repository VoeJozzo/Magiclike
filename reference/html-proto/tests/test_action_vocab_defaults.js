// Audit A1-5 — three dispatch/phase switches had NO default arm: executeAction
// silently no-op'd an unknown action.type (yet returned true — silent success),
// and advancePhaseAfterPriority / step()'s phase switch left G.phase unchanged on
// an unknown phase (step()'s while(true) then spins forever — the audit
// reproduced an exit-124 hang). Loud defaults were added to all three (behavior-
// neutral: unreachable on legal input). This pins the one genuinely reachable,
// high-value leg — the step() unknown-phase HANG-GUARD: a corrupt phase now halts
// loudly instead of hanging. (The other two defaults are fenced by suite-green.)
const setup = require('./_setup');
setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  '+(ok?'PASS':'FAIL')+': '+label+(info?' -- '+info:'')); if(ok)pass++;else fail++; }
function newGame(){ RUN.clearSave && RUN.clearSave(); RUN.start({cards:Array(12).fill('plains'),colors:['W']},null); RUN.startNextGame(); return ENGINE.state(); }

console.log('=== A1-5: a corrupt G.phase makes the step loop halt loudly, not hang ===');
(() => {
  const G = newGame();
  G.phase = 'BOGUS_PHASE';
  const ap = G.activePlayer;
  const t0 = Date.now();
  // Drive the settle/step loop via a pass. WITHOUT the default arms this spins
  // forever (audit reproduced exit 124). WITH them it returns; the bogus phase is
  // left as-is (we don't pretend to recover it) and the loop exits.
  ENGINE.executeAction(ap, { type: 'pass' });
  const ms = Date.now() - t0;
  check('executeAction/step returned (did not hang) on a corrupt phase', ms < 3000, ms + 'ms');
  check('bogus phase left unchanged (no silent phase corruption)', G.phase === 'BOGUS_PHASE', 'phase=' + G.phase);
})();

console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
process.exit(fail>0?1:0);
