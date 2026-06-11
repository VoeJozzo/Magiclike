// Audit fix A1-2 — payer unification: ONE mana brain (Joe-approved, PR #98
// round 4 "A1-2: Go" on the proposal: "have the smart check hand its winning
// combination to the payer, and the payer just executes it").
//
// Pre-fix, affordability (canPayPotential — backtracking over choose-source
// color assignments) and payment (payMana — greedy fixed W,U,B,R,G order via
// tapSourceProducing, no backtracking) were two different algorithms. With
// two partially-overlapping choose-sources the checker said "castable", the
// greedy payer spent the wrong dual first, hit a dead end mid-payment and
// THREW out of executeAction — half-applied state: a land wrongly tapped,
// its mana consumed, the spell still in hand, step()/notify() never ran.
// Post-fix, solveManaPayment computes a concrete plan (the same backtracking
// search, now recording its solution) and payMana executes exactly that
// plan — solve-then-execute, validated before any mutation, so payment is
// atomic by construction. Same solver behind all three payMana call sites
// (doCastSpell, doActivateAbility, doOptionalCost).
//
// Arms:
//   1. KEY — checker-approves/greedy-fails geometry ({U}{B} cost; first dual
//      makes U/B, second makes W/U): the cast must actually pay and land on
//      the stack (red pre-fix: executeAction threw, dual A left tapped with
//      its mana consumed, spell stranded in hand).
//   2. KEY — atomic failure: a genuinely unaffordable payMana throws BEFORE
//      touching anything — no lands tapped, pool untouched (red pre-fix:
//      greedy tapped the dual, spent its mana, then threw).
//   3. Guard — floating pool is still spent before sources are tapped, and
//      a fixed source is still preferred over a flexible one (green pre-
//      and post-fix; pins that the plan keeps the old payer's preferences).
//   4. KEY — the optional-cost call site (doOptionalCost) pays through the
//      same solver: a Land+Spell staple ETB with the arm-1 geometry pays
//      and resolves (red pre-fix: payMana threw mid-optional-cost and the
//      trigger was irrecoverably lost).

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
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  return G;
}
const poolTotal = (m) => (m.W||0)+(m.U||0)+(m.B||0)+(m.R||0)+(m.G||0)+(m.C||0);

// Two partial-overlap choose-duals (the A1-2 repro geometry, built the
// reachable-today way: land_color_* stickers). landA: Island + B sticker →
// choose ['U','B']; landB: Plains + U sticker → choose ['W','U'].
function makeDuals(G) {
  const landA = ENGINE.makeCard('island', 'you', null);
  applyOneStickerToRuntimeCard(landA, 'land_color_b');
  const landB = ENGINE.makeCard('plains', 'you', null);
  applyOneStickerToRuntimeCard(landB, 'land_color_u');
  G.you.battlefield.push(landA, landB);
  return { landA, landB };
}

// No {U}{B}-cost card exists in the pool today; fabricate a minimal
// untargeted sorcery (the mismatch is about the mana layer, not any card).
const UB_TPL = { card_id: '__a12_ub', name: 'A12 Repro UB', types: ['Sorcery'],
  cost: { U: 1, B: 1 }, effects: [{ kind: 'gain_life', amount: 5 }] };
ingestCard(UB_TPL);                 // card_id → tplId
CARDS[UB_TPL.tplId] = UB_TPL;
const B2_TPL = { card_id: '__a12_bb', name: 'A12 Repro BB', types: ['Sorcery'],
  cost: { B: 2 }, effects: [{ kind: 'gain_life', amount: 5 }] };
ingestCard(B2_TPL);
CARDS[B2_TPL.tplId] = B2_TPL;

console.log('=== 1. KEY: the payer executes the solution the checker found ===');
(() => {
  // 1a. Direct payment: payMana alone (no settle loop) must solve the
  // overlap — A pays {B}, B pays {U} — where the greedy payer dead-ended.
  const G = newGame();
  const { landA, landB } = makeDuals(G);
  let threw = null;
  try { ENGINE.payMana('you', { U: 1, B: 1 }); } catch (e) { threw = e; }
  check('payMana solved the dual overlap (no throw)', threw === null,
    threw && threw.message);
  check('both duals tapped (A paid {B}, B paid {U})',
    landA.tapped === true && landB.tapped === true,
    'A=' + landA.tapped + ' B=' + landB.tapped);
  check('no mana stranded in the pool', poolTotal(G.you.mana) === 0,
    JSON.stringify(G.you.mana));

  // 1b. End to end through the public API: the checker-approved cast must
  // actually happen (pre-fix: executeAction threw, spell stranded in hand).
  // The settle loop resolves the stack and rolls the turn, so the durable
  // proof of "payment + resolution fully happened" is the life delta.
  const G2 = newGame();
  makeDuals(G2);
  const card = ENGINE.makeCard(UB_TPL.tplId, null, null);
  G2.you.hand.push(card);
  const lifeBefore = G2.you.life;
  check('checker approves the {U}{B} cast (two overlapping duals)',
    ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: card.iid }));
  threw = null;
  try {
    ENGINE.executeAction('you', { type: 'castSpell', cardIid: card.iid });
  } catch (e) { threw = e; }
  check('executeAction did NOT throw mid-payment', threw === null,
    threw && threw.message);
  check('spell left the hand', !G2.you.hand.some(c => c.iid === card.iid));
  check('spell resolved (life +5 → payment fully happened)',
    G2.you.life === lifeBefore + 5, 'life ' + lifeBefore + ' -> ' + G2.you.life);
})();

console.log('\n=== 2. KEY: unaffordable payment fails atomically (no mutation) ===');
(() => {
  const G = newGame();
  const landA = ENGINE.makeCard('island', 'you', null);
  applyOneStickerToRuntimeCard(landA, 'land_color_b');  // choose ['U','B']
  G.you.battlefield.push(landA);

  const card = ENGINE.makeCard(B2_TPL.tplId, null, null);
  G.you.hand.push(card);
  check('checker honestly rejects {B}{B} on one dual',
    !ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: card.iid }));

  let threw = null;
  try { ENGINE.payMana('you', { B: 2 }); } catch (e) { threw = e; }
  check('payMana threw on the unaffordable cost', threw !== null);
  check('the dual was NOT tapped (nothing half-applied)', landA.tapped === false,
    'tapped=' + landA.tapped);
  check('pool untouched', poolTotal(G.you.mana) === 0, JSON.stringify(G.you.mana));
})();

console.log('\n=== 3. Guard: pool-first and fixed-preferred behavior unchanged ===');
(() => {
  const G = newGame();
  // Floating {U} + a U/B dual; {U}{B} must spend the pool's U and tap the
  // dual for B (one tap, not two-and-strand).
  const landA = ENGINE.makeCard('island', 'you', null);
  applyOneStickerToRuntimeCard(landA, 'land_color_b');
  G.you.battlefield.push(landA);
  G.you.mana.U = 1;
  ENGINE.payMana('you', { U: 1, B: 1 });
  check('floating mana spent first, dual tapped only for the missing {B}',
    landA.tapped === true && poolTotal(G.you.mana) === 0,
    JSON.stringify(G.you.mana));

  // Fixed source preferred over a flexible one for the same color.
  const G2 = newGame();
  const plains = ENGINE.makeCard('plains', 'you', null);
  const cob = ENGINE.makeCard('city_of_brass', 'you', null);
  G2.you.battlefield.push(plains, cob);
  ENGINE.payMana('you', { W: 1 });
  check('fixed Plains tapped, City of Brass left untapped',
    plains.tapped === true && cob.tapped === false,
    'plains=' + plains.tapped + ' cob=' + cob.tapped);
})();

console.log('\n=== 4. KEY: doOptionalCost pays through the same solver ===');
(() => {
  // Land+Spell staple: playing the land opens a "you may pay {the spell\'s
  // cost}" prompt (test_optional_paid_etb.js). Forest base so the played
  // land itself can\'t rescue the {U}{B} payment — the duals must be solved.
  const G = newGame();
  makeDuals(G);
  const staple = ENGINE.makeCard('forest', undefined, 0, undefined, undefined,
    undefined, [UB_TPL.tplId]);
  staple.controller = 'you'; staple.owner = 'you';
  G.you.hand.push(staple);
  G.you.landPlayedThisTurn = false;
  const lifeBefore = G.you.life;

  ENGINE.executeAction('you', { type: 'playLand', cardIid: staple.iid });
  check('optional-cost prompt opened',
    G.pendingOptionalCost && G.pendingOptionalCost.who === 'you',
    G.pendingOptionalCost && ('who=' + G.pendingOptionalCost.who));

  let threw = null;
  try {
    ENGINE.executeAction('you', { type: 'optionalCost', pay: true });
  } catch (e) { threw = e; }
  check('paying the optional cost did NOT throw', threw === null,
    threw && threw.message);
  check('prompt cleared', G.pendingOptionalCost == null);
  check('stapled effect resolved (life +5 → the cost was actually paid)',
    G.you.life === lifeBefore + 5, 'life ' + lifeBefore + ' -> ' + G.you.life);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
