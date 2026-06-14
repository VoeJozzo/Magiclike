// Audit A7-3 — pickBestTriggerTarget's grave-return branch keyed on the
// RETIRED `returnFromGraveyard` effect kind. The migration collapsed that kind
// to move_card {from_zone:'graveyard', to_zone:'hand'}, so for the 3 live pool
// cards (grave_digger / morticians_assistant / spirit_shepherd) the AI's
// auto-pick fell through every branch to `return valid[0]` — the oldest card
// in the yard, value-blind and order-dependent. The fix recognizes the
// migrated shape and value-picks the best returnable card, deriving WHICH
// graveyard each candidate sits in from its stamped `controller` tag. AI-only
// pick quality (P3 STAGE); humans get the graveyard picker prompt.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 7300;
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
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  G.you.hand = []; G.opp.hand = [];
  G.stack = []; G.gameOver = false;
  return G;
}

// The migrated grave-return effect shape.
const RETURN_EFF = { kind: 'move_card', from_zone: 'graveyard', to_zone: 'hand', selector: 'target' };
// bear_cub (low value) vs ancient_hydra (high value) — a wide, unambiguous gap
// so the pick can't tie. The AI should always prefer the Hydra.

console.log('=== A7-3: AI value-picks grave-return targets (migrated move_card shape) ===');
(() => {
  // ASSERT 1 — graveyard order [bear, hydra]: must pick the Hydra, NOT valid[0].
  let G = newGame();
  const bear1 = mk('bear_cub', 'opp'), hydra1 = mk('ancient_hydra', 'opp');
  G.opp.graveyard = [bear1, hydra1];
  let valid = ENGINE.getValidTargets({ target: 'graveyard_card', filter: { type: 'Creature' } }, 'opp');
  let pick = ENGINE.pickBestTriggerTarget(RETURN_EFF, valid, 'opp');
  check('order [bear, hydra]: picks the higher-value Hydra (not valid[0])',
    pick && pick.iid === hydra1.iid, pick ? 'picked iid ' + pick.iid + ' (hydra=' + hydra1.iid + ' bear=' + bear1.iid + ')' : 'null');

  // ASSERT 2 — reversed order [hydra, bear]: still the Hydra (order-independent).
  G = newGame();
  const hydra2 = mk('ancient_hydra', 'opp'), bear2 = mk('bear_cub', 'opp');
  G.opp.graveyard = [hydra2, bear2];
  valid = ENGINE.getValidTargets({ target: 'graveyard_card', filter: { type: 'Creature' } }, 'opp');
  pick = ENGINE.pickBestTriggerTarget(RETURN_EFF, valid, 'opp');
  check('reversed order: still picks the Hydra (order-independent)',
    pick && pick.iid === hydra2.iid, pick ? 'picked iid ' + pick.iid : 'null');

  // ASSERT 3 — grant_cast_permission disjunct stays alive and value-picks.
  G = newGame();
  const bear3 = mk('bear_cub', 'opp'), hydra3 = mk('ancient_hydra', 'opp');
  G.opp.graveyard = [bear3, hydra3];
  valid = ENGINE.getValidTargets({ target: 'graveyard_card', filter: { type: 'Creature' } }, 'opp');
  pick = ENGINE.pickBestTriggerTarget({ kind: 'grant_cast_permission' }, valid, 'opp');
  check('grant_cast_permission still value-picks the Hydra',
    pick && pick.iid === hydra3.iid, pick ? 'picked iid ' + pick.iid : 'null');

  // ASSERT 4 — cross-yard: bear in opp yard, hydra in your yard. Per-target
  // stamped controller tag must value the Hydra correctly across yards.
  G = newGame();
  const bear4 = mk('bear_cub', 'opp'), hydra4 = mk('ancient_hydra', 'you');
  G.opp.graveyard = [bear4]; G.you.graveyard = [hydra4];
  valid = ENGINE.getValidTargets({ target: 'graveyard_card', filter: { type: 'Creature', graveyards: ['self', 'opp'] } }, 'opp');
  pick = ENGINE.pickBestTriggerTarget(RETURN_EFF, valid, 'opp');
  check('cross-yard: picks the Hydra via per-target stamped yard',
    pick && pick.iid === hydra4.iid, pick ? 'picked iid ' + pick.iid + ' (hydra=' + hydra4.iid + ' bear=' + bear4.iid + ')' : 'null');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
