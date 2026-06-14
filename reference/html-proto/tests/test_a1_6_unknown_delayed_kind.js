// Audit A1-6 — the CLEANUP end-step delayed-trigger drain handled only
// effect:'deferredEffects'; an endStep entry with any OTHER effect kind fell
// through and was dropped SILENTLY (no log) while the comment claimed "fired,
// don't keep". Behavior-neutral fix (the sole producer, schedule_delayed,
// hardcodes 'deferredEffects', so the path is unreachable today): WARN loudly
// on the unhandled kind instead of dropping it silently. Ships under Joe's
// standing rule (diagnostics that can't change game behavior).

const setup = require('./_setup');
setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false;
  return G;
}
// Drive the turn to its end so the CLEANUP drain runs (mirror test_exile_until_eot).
function endTurn(G) {
  const t = G.turn; let s = 200;
  while (G.turn === t && s-- > 0) { const w = ENGINE.expectedActor(); if (!w) break; ENGINE.executeAction(w, { type: 'pass' }); }
}
function withWarn(fn) {
  const orig = console.warn; const msgs = [];
  console.warn = (...a) => msgs.push(a.join(' '));
  try { fn(); } finally { console.warn = orig; }
  return msgs;
}

console.log('=== A1-6: an unhandled endStep delayed-trigger kind WARNS (not silently dropped) ===');
(() => {
  const G = newGame();
  const before = G.you.life;
  // Synthetic endStep delayed trigger with an UNRECOGNIZED effect kind + a real
  // (gain_life) effects payload that must NOT fire.
  G.delayedTriggers = [{ fireAt: 'endStep', fireFor: 'either', effect: '__bogus_kind__',
    effects: [{ kind: 'gain_life', amount: 5 }], controller: 'you', sourceName: 'Test', sourceIid: null, target: { kind: 'player', who: 'you' } }];
  const warns = withWarn(() => endTurn(G));
  check('the unhandled-kind entry WARNED (was: silent drop)',
    warns.some(m => /A1-6|unhandled effect kind/.test(m)), JSON.stringify(warns).slice(0, 160));
  check('the entry was drained, not left pending', !(G.delayedTriggers || []).some(dt => dt.effect === '__bogus_kind__'));
  check('behavior-neutral: its effects did NOT fire (life unchanged)', G.you.life === before, before + '->' + G.you.life);
})();

console.log('\n=== control: a deferredEffects entry fires and does NOT warn ===');
(() => {
  const G = newGame();
  const before = G.you.life;
  G.delayedTriggers = [{ fireAt: 'endStep', fireFor: 'either', effect: 'deferredEffects',
    effects: [{ kind: 'gain_life', amount: 2 }], controller: 'you', sourceName: 'Test', sourceIid: null, target: { kind: 'player', who: 'you' } }];
  const warns = withWarn(() => endTurn(G));
  check('deferredEffects entry did NOT raise the A1-6 warn', !warns.some(m => /A1-6/.test(m)));
  check('deferredEffects fired (life +2)', G.you.life === before + 2, before + '->' + G.you.life);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
