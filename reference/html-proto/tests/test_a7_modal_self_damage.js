// Audit A7-4 — modal self-damage lethal gate is per OPTION, not just per card.
//
// bestSpellPlay's self-damage gate used to run only for non-modal cards, with
// a comment deferring modal cards to a per-option check that didn't exist: a
// modal mode whose self-damage would kill us still scored positively (the
// damage kind is valued as if it hit the opponent), so the AI would
// suicide-cast it at lethal life. The fix folds selfDamageOf(modeEffects)
// into the per-option scoring (lethal self-damage option scores -100).
//
// No card in the current pool has a self-damage modal mode (the finding is
// pool-scanned "honestly unreachable"), so the cards here are synthetic
// templates registered straight into CARDS — the bug class is what's pinned.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Boot a baseline game we can mutate (same recipe as ai_burn_lethal_test).
function makeBaselineGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({cards:['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','plains','plains'], colors:['R']}, null);
  RUN.load();
  ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
  return ENGINE.state();
}

function giveHand(G, who, tplIds) {
  G[who].hand = tplIds.map(tplId => ENGINE.makeCard(tplId));
  for (const c of G[who].hand) c.owner = who;
}

function setMana(G, who, pool) {
  G[who].mana = Object.assign({W:0,U:0,B:0,R:0,G:0,C:0}, pool);
}

function readyForMain(G, who) {
  G.activePlayer = who;
  G.priorityHolder = who;
  G.phase = 'MAIN2';   // MAIN2 to skip computeReservedBurnForLethal
  G.stack = [];
  G.gameOver = false;
  if (G.priority) G.priority.passes = new Set();
  else G.priority = { passes: new Set() };
}

// Synthetic templates. Registered AFTER ENGINE.init so they ride no draft
// pool / boot scan — makeCard only needs CARDS[tplId] at call time.
// Untargeted modes throughout, so every cast option is targetless and flows
// through bestSpellPlay's untargeted scoring branch.
const SUICIDE_MODAL = {
  tplId: '__a7_modal_suicide',
  name: 'Desperate Gambit',
  types: ['Sorcery'],
  cost: { R: 1 },
  // Single suicide mode: 5 self-damage + draw 4. spellValueForEffects scores
  // this 23 (damage 6+5, draw 12) — strongly positive — so only a per-option
  // self-damage gate stops the cast at <=5 life.
  effects: { modes: [
    [ {kind: 'damage', scope: 'self', amount: 5}, {kind: 'draw', amount: 4} ],
  ] },
  mode_names: ['Pay in blood'],
};
const TWO_MODE_MODAL = {
  tplId: '__a7_modal_twomode',
  name: 'Measured Gambit',
  types: ['Sorcery'],
  cost: { R: 1 },
  // Mode 0 is the suicide mode above (scores 23); mode 1 is safe lifegain
  // (scores 18 at low life). Ungated, the AI picks the suicide mode.
  effects: { modes: [
    [ {kind: 'damage', scope: 'self', amount: 5}, {kind: 'draw', amount: 4} ],
    [ {kind: 'gain_life', amount: 1} ],
  ] },
  mode_names: ['Blood for cards', 'Small mercy'],
};
const SUICIDE_FLAT = {
  tplId: '__a7_flat_suicide',
  name: 'Flat Gambit',
  types: ['Sorcery'],
  cost: { R: 1 },
  // Non-modal twin of the suicide mode — pins that the old non-modal gate's
  // behavior survives the fold into per-option scoring.
  effects: [ {kind: 'damage', scope: 'self', amount: 5}, {kind: 'draw', amount: 4} ],
};

function registerSynthetics() {
  for (const tpl of [SUICIDE_MODAL, TWO_MODE_MODAL, SUICIDE_FLAT]) {
    ingestCard(tpl);
    CARDS[tpl.tplId] = tpl;
  }
}

console.log('=== Modal, single suicide mode: AI refuses at lethal life ===');
{
  const G = makeBaselineGame();
  registerSynthetics();
  giveHand(G, 'opp', ['__a7_modal_suicide']);
  setMana(G, 'opp', { R: 1 });
  G.opp.life = 3;   // 5 self-damage >= 3 life — casting is suicide
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI returns an action', !!action);
  check('AI does NOT cast the suicide modal at 3 life',
    !action || action.type !== 'castSpell',
    action ? 'got ' + action.type : '');
}

console.log('\n=== Modal, single suicide mode: AI still casts at healthy life ===');
{
  const G = makeBaselineGame();
  registerSynthetics();
  giveHand(G, 'opp', ['__a7_modal_suicide']);
  setMana(G, 'opp', { R: 1 });
  G.opp.life = 20;   // 5 self-damage is survivable — gate must not over-fire
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI casts the modal when self-damage is survivable',
    action && action.type === 'castSpell',
    action ? 'got ' + action.type : 'no action');
}

console.log('\n=== Modal, suicide mode + safe mode: AI picks the safe MODE at lethal life ===');
{
  const G = makeBaselineGame();
  registerSynthetics();
  giveHand(G, 'opp', ['__a7_modal_twomode']);
  setMana(G, 'opp', { R: 1 });
  G.opp.life = 3;
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI casts the two-mode card', action && action.type === 'castSpell');
  if (action && action.type === 'castSpell') {
    check('AI picks the safe mode (modeIdx 1), not the suicide mode',
      action.modeIdx === 1, 'modeIdx=' + action.modeIdx);
  }
}

console.log('\n=== Non-modal regression: flat suicide card still refused at lethal life ===');
{
  const G = makeBaselineGame();
  registerSynthetics();
  giveHand(G, 'opp', ['__a7_flat_suicide']);
  setMana(G, 'opp', { R: 1 });
  G.opp.life = 3;
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI does NOT cast the flat self-damage card at 3 life',
    !action || action.type !== 'castSpell',
    action ? 'got ' + action.type : '');
}

console.log('\n=== Non-modal regression: flat suicide card cast at healthy life ===');
{
  const G = makeBaselineGame();
  registerSynthetics();
  giveHand(G, 'opp', ['__a7_flat_suicide']);
  setMana(G, 'opp', { R: 1 });
  G.opp.life = 20;
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI casts the flat card when self-damage is survivable',
    action && action.type === 'castSpell',
    action ? 'got ' + action.type : 'no action');
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
