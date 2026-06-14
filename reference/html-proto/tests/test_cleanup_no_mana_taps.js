// Audit fix A1-10 — tapLandForMana is illegal during the cleanup discard.
//
// Canon: §605 closes the cleanup-discard window ("no spells or abilities can
// be cast or activated"); §705's mana-ability exception requires a window
// where mana could actually be paid — nothing is castable during CLEANUP and
// setPhase('UNTAP') zeroes the pool, so the mana is unusable by construction.
// Worse, UNTAP untaps only the NEW active player's permanents, so a land
// tapped here stays tapped through the opponent's entire turn.
//
// Before the fix, whoHasPriority() had a blanket cleanupDiscarding clause
// granting the active player "priority", which the tapLandForMana legality
// check consumed — so a misclick mid-discard wasted the land for a turn.
//
// This file pins:
//   1. tapLandForMana is NOT legal while cleanupDiscarding is set
//   2. executeAction rejects it (land stays untapped, no mana floats)
//   3. getLegalActions does not enumerate tap actions in that window
//   4. discard is STILL legal during the window (the gate that must survive)
//   5. after the discard completes, tapping the land works again

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(20).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}

const G = newGame();

// An untapped land on your battlefield.
const land = G.you.library.find(c => hasType(c, 'Land'));
G.you.library = G.you.library.filter(c => c !== land);
land.tapped = false;
G.you.battlefield.push(land);

// Hand of 9 — must discard down to 7. Force the engine's cleanup-discard
// pause exactly as setPhase('CLEANUP') produces it (engine.js doEndTurn path).
while (G.you.hand.length < 9) {
  const c = G.you.library.pop();
  G.you.hand.push(c);
}
G.activePlayer = 'you';
G.phase = 'CLEANUP';
G.stack = [];
G.priority = null;          // no open priority round during cleanup
G.priorityHolder = null;
G.cleanupDiscarding = true; // the flag set when hand.length > 7 at cleanup
G.forcedDiscard = null;
G.gameOver = false;

console.log('=== A1-10: the cleanup-discard window rejects mana taps ===');
const tapAction = { type: 'tapLandForMana', cardIid: land.iid };
check('A1-10: tapLandForMana is illegal during cleanupDiscarding',
  !ENGINE.isLegalAction('you', tapAction));
// Enumerate BEFORE attempting the tap — the land is still untapped here, so
// an enumeration that offers tapLandForMana is exposing the hole.
const typesDuring = ENGINE.getLegalActions('you').map(a => a.type);
check('A1-10: getLegalActions omits tapLandForMana during the discard',
  !typesDuring.includes('tapLandForMana'), 'actions=' + typesDuring.join(','));
const ok = ENGINE.executeAction('you', tapAction);
check('A1-10: executeAction rejects the tap', !ok, 'returned=' + ok);
check('A1-10: the land stayed untapped', land.tapped === false);
check('A1-10: no mana floated',
  Object.values(G.you.mana || {}).every(v => v === 0),
  'mana=' + JSON.stringify(G.you.mana));

console.log('\n=== the discard itself must remain legal (the surviving gate) ===');
check('discard is still legal during cleanupDiscarding',
  ENGINE.isLegalAction('you', { type: 'discard', cardIid: G.you.hand[0].iid }));
check('getLegalActions still enumerates discards',
  typesDuring.includes('discard'), 'actions=' + typesDuring.join(','));

console.log('\n=== after the discard completes, tapping works again ===');
// Discard down to 7 through the real action path; the engine clears
// cleanupDiscarding when hand.length <= 7.
let safety = 4;
while (G.cleanupDiscarding && G.you.hand.length > 7 && safety-- > 0) {
  ENGINE.executeAction('you', { type: 'discard', cardIid: G.you.hand[0].iid });
}
check('cleanup discard completed (flag cleared)', !G.cleanupDiscarding,
  'hand=' + G.you.hand.length);
// Give the player a normal main-phase priority window and tap. Reset the
// tap state so this section is independent of whether the buggy pre-fix
// engine tapped the land above.
land.tapped = false;
G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
G.stack = []; G.priority = { passes: new Set() };
check('tapLandForMana is legal again after the discard',
  ENGINE.isLegalAction('you', tapAction));
const ok2 = ENGINE.executeAction('you', tapAction);
check('the tap executes', !!ok2 && land.tapped === true,
  'returned=' + ok2 + ' tapped=' + land.tapped);

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
