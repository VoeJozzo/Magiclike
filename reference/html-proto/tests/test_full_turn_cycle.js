// Audit A1-23 — the turn machine had no single scripted full-turn behavioral
// test (the lens estimated one kills 100+ mutation survivors at once). This
// drives real turns via the executeAction pass-loop and pins: the play/draw rule
// (first player skips turn-1 draw, the other draws), mana emptying on phase
// change, the UNTAP lifeLostThisTurn reset, the active-player handoff, and the
// endTurnPending feature (arm + auto-declare-empty fast-forward past a combat
// that would otherwise pause — previously a total coverage gap). Tests only.
const setup = require('./_setup');
setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  '+(ok?'PASS':'FAIL')+': '+label+(info?' -- '+info:'')); if(ok)pass++;else fail++; }
function newGame(){ RUN.clearSave && RUN.clearSave(); RUN.start({cards:Array(20).fill('plains'),colors:['W']},null); RUN.startNextGame(); return ENGINE.state(); }
// Pass for whoever the engine waits on until the ACTIVE PLAYER changes. NOTE: the
// handoff and the NEXT player's UNTAP->DRAW->MAIN1 all run inside the final
// executeAction's step loop, so by the time this returns the new AP has ALREADY
// drawn — hence library deltas are measured from game start, not post-handoff.
function advanceUntilApChanges(G){
  const startAP = G.activePlayer; let s = 600;
  while (G.activePlayer === startAP && !G.gameOver && s-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
const COLS = ['W','U','B','R','G','C'];
const poolEmpty = p => COLS.every(k => (p.mana[k] || 0) === 0);
const VANILLA = (() => { for (const [id,c] of Object.entries(CARDS)) if (hasType(c,'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id; return null; })();

console.log('=== A1-23: scripted full-turn cycle (play/draw, mana emptying, lifeLost reset, handoff) ===');
(() => {
  const G = newGame();
  const first = G.firstPlayer; const second = first === 'you' ? 'opp' : 'you';
  const firstLib0 = G[first].library.length;
  const secondLib0 = G[second].library.length;
  check('starts on turn 1, first player active', G.turn === 1 && G.activePlayer === first, 'turn=' + G.turn + ' ap=' + G.activePlayer);
  advanceUntilApChanges(G);
  check('A1-23#8: first player skipped turn-1 draw (library unchanged)', G[first].library.length === firstLib0, firstLib0 + ' -> ' + G[first].library.length);
  check('turn handed to the second player', G.activePlayer === second, 'ap=' + G.activePlayer);
  check('A1-23#8: second player DREW entering their turn (library -1)', G[second].library.length === secondLib0 - 1, secondLib0 + ' -> ' + G[second].library.length);
  check('A1-23#10: both mana pools empty after the turn boundary', poolEmpty(G.you) && poolEmpty(G.opp));
  check('A1-23#4: lifeLostThisTurn reset to 0 for both (UNTAP)', (G.you.lifeLostThisTurn || 0) === 0 && (G.opp.lifeLostThisTurn || 0) === 0);
})();

console.log('\n=== A1-23: endTurnPending arms + fast-forwards past a would-pause combat ===');
(() => {
  const G = newGame();
  const ap0 = G.activePlayer;
  // A ready creature would normally PAUSE the machine at COMBAT_ATTACK awaiting a
  // declaration; endTurnPending must auto-declare empty and roll through (7607).
  if (VANILLA) {
    const cr = JSON.parse(JSON.stringify(CARDS[VANILLA]));
    Object.assign(cr, { iid: 99001, tplId: VANILLA, controller: ap0, owner: ap0,
      tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0, permPower: 0, permTou: 0, keywords: [] });
    G[ap0].battlefield.push(cr);
  }
  ENGINE.executeAction(ap0, { type: 'endTurn' });
  check('endTurn ARMS endTurnPending', G.endTurnPending === true, 'flag=' + G.endTurnPending);
  // Pump passes; the flag auto-declares empty combat so the turn rolls over.
  let s = 400;
  while (G.activePlayer === ap0 && !G.gameOver && s-- > 0) { const w = ENGINE.expectedActor(); if (!w) break; ENGINE.executeAction(w, { type: 'pass' }); }
  check('flag fast-forwarded past combat to the next turn (AP changed)', G.activePlayer !== ap0, 'ap ' + ap0 + ' -> ' + G.activePlayer);
  check('endTurnPending cleared on rollover', G.endTurnPending === false, 'flag=' + G.endTurnPending);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
