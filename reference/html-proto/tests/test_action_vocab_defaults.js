// Exercises engine.js's A1-5 step() hang-guard: an unrecognized G.phase in
// step()'s phase switch would otherwise spin its while(true) loop forever.
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
  ENGINE.executeAction(ap, { type: 'pass' });
  const ms = Date.now() - t0;
  check('executeAction/step returned (did not hang) on a corrupt phase', ms < 3000, ms + 'ms');
  check('bogus phase left unchanged (no silent phase corruption)', G.phase === 'BOGUS_PHASE', 'phase=' + G.phase);
})();

console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
process.exit(fail>0?1:0);
