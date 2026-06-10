// Audit fix A1-9 — the DRAW step logs "X draws." only when a card actually
// moved to hand.
//
// Pre-fix, step()'s DRAW case was `drawCard(ap); log(`${name} draws.`)` with
// no return-value check. drawCard returns null on BOTH empty-library paths:
//   1. deck-out — the player loses, yet the topmost log line claimed a
//      successful draw ("You draws." / "Opponent wins!" / "can't draw — loses!"
//      reading newest-first);
//   2. Phylactery rip — the curse rips a slot INSTEAD of drawing ("rips a
//      slot instead" was followed by a false "draws." in live play).
// Engine state was always correct (loss/rip per §100.6/§512); only the log lied.
//
// This file pins:
//   1. a deck-out DRAW step produces NO "draws." line (loss line present)
//   2. a Phylactery-protected empty-library DRAW produces NO "draws." line
//      (rip line present, game continues)
//   3. a normal draw still logs "draws." (regression guard)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function newGame(deckCards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: deckCards || Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
}
// Pass priority for whoever is expected to act until the turn rolls over
// (or the game ends) — same shape as test_exile_until_eot.js's endTurn.
function endTurn(G) {
  const startTurn = G.turn;
  let safety = 200;
  while (G.turn === startTurn && !G.gameOver && safety-- > 0) {
    const w = ENGINE.expectedActor();
    if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
const drawLineFor = (G, who) => G[who].name + ' draws.';
const logHas = (G, substr) => G.log.some(e => e.msg.includes(substr));

console.log('=== A1-9: deck-out DRAW step logs the loss, NOT a draw ===');
(() => {
  const G = newGame();
  readyMain(G, 'you');
  // The opponent will deck out on their upcoming DRAW step.
  G.opp.library = [];
  G.log.length = 0;   // only inspect lines produced from here on
  endTurn(G);
  check('game ended (opponent decked out)', G.gameOver === true);
  check('you won', G.winner === 'you', 'winner=' + G.winner);
  check('loss line logged', logHas(G, "can't draw"));
  check("A1-9: no false '" + drawLineFor(G, 'opp') + "' line on deck-out",
    !logHas(G, drawLineFor(G, 'opp')),
    G.log.slice(0, 4).map(e => e.msg).join(' | '));
})();

console.log('\n=== A1-9: Phylactery rip on empty library logs the rip, NOT a draw ===');
(() => {
  // 'you' holds a Phylactery slot: drawing from an empty library rips a slot
  // instead of losing — and must not claim a draw either.
  const deck = Array(11).fill('plains'); deck.push('phylactery');
  const G = newGame(deck);
  check('you have Phylactery protection',
    RUN.getSlots().some(s => s && s.tplId === 'phylactery'));
  readyMain(G, 'opp');
  G.you.library = [];
  G.log.length = 0;
  endTurn(G);   // opp's turn ends; YOUR turn begins with the empty-library draw
  check('game continues (Phylactery absorbed the deck-out)', G.gameOver === false);
  check('rip line logged', logHas(G, 'rips a slot'));
  check("A1-9: no false '" + drawLineFor(G, 'you') + "' line on a Phylactery rip",
    !logHas(G, drawLineFor(G, 'you')),
    G.log.slice(0, 4).map(e => e.msg).join(' | '));
})();

console.log('\n=== regression guard: a normal draw still logs "draws." ===');
(() => {
  const G = newGame();
  readyMain(G, 'you');
  // The opponent takes the next DRAW step after your turn ends. Assert on the
  // library (the hand count is muddied by the cleanup hand-size discard).
  const oppLibBefore = G.opp.library.length;
  G.log.length = 0;
  endTurn(G);
  check('opponent drew a card (library shrank)',
    G.opp.library.length === oppLibBefore - 1,
    oppLibBefore + ' -> ' + G.opp.library.length);
  check("normal draw still logs '" + drawLineFor(G, 'opp') + "'",
    logHas(G, drawLineFor(G, 'opp')),
    G.log.slice(0, 4).map(e => e.msg).join(' | '));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
