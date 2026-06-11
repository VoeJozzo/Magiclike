// Audit A4-7 — the trigger (and ability) resolution loops never routed a
// `chooses()` step to the human prompt: the pause-and-ask contract
// (pendingEdictChoice, GAP 2) was shipped ONLY in the spell resolver, so an
// AI-controlled Heir to the Burnt House dying silently sacrificed a land of
// the ENGINE's choosing when the human was the chooser. The card's own text
// makes the choice the chooser's.
//
// Fix: maybeDeferHumanChooses() — the spell resolver's human-prompt branch
// extracted into ONE shared gate consumed by all three resolution loops
// (spell / trigger / activated ability). AI path unchanged (auto-pick).
//
// This is the trigger-path twin of test_edict_human_choice.js.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9600;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.stack = []; G.gameOver = false;
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
// Drive to quiescence; stops at a pending human decision (the gate blocks
// all other actions while a prompt is open).
function settle(G) {
  let safety = 60;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    if (G.pendingEdictChoice) break;
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}

console.log('=== A4-7: AI-controlled Heir dies → the HUMAN chooser gets the prompt ===');
(() => {
  const G = newGame();
  // Heir under the AI: its dies-trigger targets 'opp' (the trigger
  // controller's opponent) = the human, who must sacrifice a LAND.
  const heir = mk('heir_to_burnt_house', 'opp'); G.opp.battlefield.push(heir);
  const landA = mk('forest', 'you'); G.you.battlefield.push(landA);
  const landB = mk('plains', 'you'); G.you.battlefield.push(landB);
  const bolt = mk('lightning_bolt', 'you'); G.you.hand.push(bolt);

  // Kill the 3/3 Heir through the real cast path so its trigger queues,
  // stacks, and resolves through resolveTrigger/runTriggerEffects.
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'creature', iid: heir.iid }] });
  settle(G);

  check('Heir is dead', G.opp.graveyard.some(c => c.tplId === 'heir_to_burnt_house'));
  check('pendingEdictChoice opened for the human (was: silent auto-pick)',
    !!G.pendingEdictChoice, JSON.stringify(G.pendingEdictChoice));
  if (G.pendingEdictChoice) {
    check("prompt belongs to 'you'", G.pendingEdictChoice.who === 'you');
    check('prompt pool is the two lands',
      G.pendingEdictChoice.pool.length === 2
      && G.pendingEdictChoice.pool.some(c => c.iid === landA.iid)
      && G.pendingEdictChoice.pool.some(c => c.iid === landB.iid),
      JSON.stringify(G.pendingEdictChoice.pool));
    check('prompt source is the Heir', /Heir/.test(G.pendingEdictChoice.source || ''));
  }
  check('NO land was auto-sacrificed while the prompt is open',
    G.you.battlefield.filter(c => hasType(c, 'Land')).length === 2,
    'lands=' + G.you.battlefield.filter(c => hasType(c, 'Land')).length);

  // The human picks: the chosen land (and ONLY it) is sacrificed.
  if (G.pendingEdictChoice) {
    const ok = ENGINE.executeAction('you', { type: 'edictChoice', iid: landB.iid });
    check('edictChoice action accepted', ok === true);
    check('the CHOSEN land was sacrificed', !G.you.battlefield.some(c => c.iid === landB.iid));
    check('the other land survives', G.you.battlefield.some(c => c.iid === landA.iid));
    check('prompt cleared', !G.pendingEdictChoice);
  }
})();

console.log('\n=== control: human-controlled Heir dies → AI chooser still auto-picks ===');
(() => {
  const G = newGame();
  const heir = mk('heir_to_burnt_house', 'you'); G.you.battlefield.push(heir);
  const oppLand = mk('forest', 'opp'); G.opp.battlefield.push(oppLand);
  const bolt = mk('lightning_bolt', 'you'); G.you.hand.push(bolt);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'creature', iid: heir.iid }] });
  settle(G);
  check('no human prompt for an AI chooser', !G.pendingEdictChoice);
  check("the AI's land was auto-sacrificed", !G.opp.battlefield.some(c => c.iid === oppLand.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
