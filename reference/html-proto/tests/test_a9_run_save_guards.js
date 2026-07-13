// Audit A9-4 + A9-5 — run save/analytics guards.
//
// A9-4 (defensive guard, standing rule): RUN.load() must REFUSE a save blob
// whose version is newer than this build's SAVE_VERSION (warn + return false)
// — and must NOT clear it: a newer build can still read that save; clearing
// would destroy it. Before the fix, the migration loop was upward-only
// (`while (blob.version < SAVE_VERSION)`), so a future-version blob sailed
// through as-is and the run proceeded on whatever shape it carried.
//
// A9-5 (analytics-only): picklog's per-draft gamesPlayed counter must count
// game COMPLETIONS (recordResult), not game starts. Before the fix it was
// incremented in startNextGame, which (a) double-counted crash-restores —
// the resume path replays startNextGame after rollbackForMidGameRestore —
// and (b) counted abandoned games that were never finished.
//
// All localStorage traffic here hits the scratch shim from _setup.js,
// never real storage.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== A9-4: future-version save is refused, and NOT cleared ===');
(() => {
  RUN.clearSave();
  const blob = {
    version: 99,
    runState: { slots: [{ tplId: 'plains', stickers: [] }] },
  };
  const raw = JSON.stringify(blob);
  localStorage.setItem(SAVE_KEY, raw);
  const loaded = RUN.load();
  check('load() returns false for a v99 blob', loaded === false,
    'got ' + loaded);
  check('the blob is left in localStorage untouched (no clear, no rewrite)',
    localStorage.getItem(SAVE_KEY) === raw);
  RUN.clearSave();
})();

console.log('\n=== A9-5: picklog gamesPlayed counts completions, not starts ===');
const DECK = { cards: Array(12).fill('plains'), colors: ['W'] };
function lastDraft() {
  const d = PICKLOG.exportData();
  return d.drafts[d.drafts.length - 1];
}
function freshDraft() {
  PICKLOG.clearAll();
  PICKLOG.startDraft();
  PICKLOG.finishDraft(['W']);
}

(() => {
  // (a) Start alone is 0; completing the game makes it 1.
  freshDraft();
  RUN.start(DECK, null);
  RUN.startNextGame();
  check('game start alone counts 0', lastDraft().gamesPlayed === 0,
    'got ' + lastDraft().gamesPlayed);
  RUN.recordResult('you', [], []);
  check('completing the game counts 1', lastDraft().gamesPlayed === 1,
    'got ' + lastDraft().gamesPlayed);
})();

(() => {
  // (b) Crash-restore: start → rollback → replayed start → completion = 1.
  freshDraft();
  RUN.start(DECK, null);
  RUN.startNextGame();
  RUN.rollbackForMidGameRestore();   // mid-game reload path (controller)
  RUN.startNextGame();               // resume replays the start path
  RUN.recordResult('you', [], []);
  check('crash-restored game counts 1, not 2', lastDraft().gamesPlayed === 1,
    'got ' + lastDraft().gamesPlayed);
})();

(() => {
  // (c) An abandoned game (started, never completed) counts 0.
  freshDraft();
  RUN.start(DECK, null);
  RUN.startNextGame();
  RUN.clearSave();                   // walked away — no recordResult
  check('abandoned game counts 0', lastDraft().gamesPlayed === 0,
    'got ' + lastDraft().gamesPlayed);
})();

(() => {
  // (d) A LOSS is still a completed game.
  freshDraft();
  RUN.start(DECK, null);
  RUN.startNextGame();
  RUN.recordResult('opp', [], []);
  check('a lost game counts as completed (1)', lastDraft().gamesPlayed === 1,
    'got ' + lastDraft().gamesPlayed);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
