// Optional paid ETB for Land+Spell staples (BACKLOG feature).
// A spell stapled onto a LAND used to give a FREE ETB. Now it's a "you may pay
// {the spell's cost}" trigger — a land is free to play, so the stapled effect
// should cost something. Creature+Spell staples stay free (you paid the body).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[who].landPlayedThisTurn = false;
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();
const SPELL = 'goblinRabble';   // create_tokens, {R:1,C:2}, untargeted
let iidc = 7000;
function stapleInstance(baseTplId, controller) {
  const card = ENGINE.makeCard(baseTplId, undefined, 0, undefined, undefined, undefined, [SPELL]);
  card.iid = iidc++; card.controller = controller; card.owner = controller;
  return card;
}

console.log('=== synthesis: Land+Spell ETB is optional+paid; Creature+Spell stays free ===');
if (!CARDS[SPELL] || !VANILLA) {
  console.log('  (goblinRabble or a vanilla creature unavailable -- skipping)');
} else {
  const land = ENGINE.makeCard('plains', undefined, 0, undefined, undefined, undefined, [SPELL]);
  const etb = (land.triggers || []).find(t => t.event === 'card_zone_change');
  check('Land+Spell has an ETB trigger', !!etb);
  check('Land+Spell ETB carries optional_cost = the spell cost',
    etb && etb.optional_cost && etb.optional_cost.R === 1 && etb.optional_cost.C === 2,
    etb && JSON.stringify(etb.optional_cost));

  const cre = ENGINE.makeCard(VANILLA, undefined, 0, undefined, undefined, undefined, [SPELL]);
  const cEtb = (cre.triggers || []).find(t => t.event === 'card_zone_change');
  check('Creature+Spell has the ETB trigger', !!cEtb);
  check('Creature+Spell ETB is FREE (no optional_cost)', cEtb && !cEtb.optional_cost);
}

console.log('\n=== play the land → prompt opens for the controller; PAY → effect + mana spent ===');
{
  const G = newGame();
  const land = stapleInstance('plains', 'you');
  G.you.hand.push(land);
  readyMain(G, 'you');
  G.you.mana = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 5 };   // can afford {R}{2}
  const bfBefore = G.you.battlefield.filter(c => c.type === 'Creature').length;

  ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  check('land is on the battlefield', G.you.battlefield.some(c => c.iid === land.iid));
  check('optional-cost prompt opened for the controller (you)',
    G.pendingOptionalCost && G.pendingOptionalCost.who === 'you',
    G.pendingOptionalCost && ('who=' + G.pendingOptionalCost.who));
  check('pay/decline are the legal actions',
    ENGINE.isLegalAction('you', { type: 'optionalCost', pay: true })
    && ENGINE.isLegalAction('you', { type: 'optionalCost', pay: false }));

  ENGINE.executeAction('you', { type: 'optionalCost', pay: true });
  check('prompt cleared after paying', G.pendingOptionalCost == null);
  // The effect running IS the payment proof: doOptionalCost only calls
  // runTriggerEffects after payMana succeeds (and the can't-pay case below
  // confirms no-pay → no-effect). We don't assert a post-action mana delta —
  // since B2, the settle advances MAIN1→COMBAT and empties the pool anyway.
  check('stapled effect resolved (goblin tokens entered → cost was paid)',
    G.you.battlefield.filter(c => c.type === 'Creature').length > bfBefore);
}

console.log('\n=== DECLINE → effect does not run ===');
{
  // (Mana isn't asserted here: declining lets the turn settle to CLEANUP, which
  // empties the pool anyway under the current "clear at CLEANUP only" model
  // — backlog B2. The no-effect signal below is the real contract: the decline
  // path never calls payMana or runTriggerEffects.)
  const G = newGame();
  const land = stapleInstance('plains', 'you');
  G.you.hand.push(land);
  readyMain(G, 'you');
  G.you.mana = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 5 };
  const bfBefore = G.you.battlefield.filter(c => c.type === 'Creature').length;
  ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  ENGINE.executeAction('you', { type: 'optionalCost', pay: false });
  check('prompt cleared after declining', G.pendingOptionalCost == null);
  check('no tokens entered on decline (effect skipped)',
    G.you.battlefield.filter(c => c.type === 'Creature').length === bfBefore);
}

console.log('\n=== CAN\'T pay (no R source) → auto-declines, no prompt ===');
{
  const G = newGame();
  const land = stapleInstance('plains', 'you');
  G.you.hand.push(land);
  readyMain(G, 'you');
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };   // a Plains can't make R
  const bfBefore = G.you.battlefield.filter(c => c.type === 'Creature').length;
  ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  check('no prompt when the controller cannot pay', G.pendingOptionalCost == null);
  check('no tokens (effect skipped)',
    G.you.battlefield.filter(c => c.type === 'Creature').length === bfBefore);
}

console.log('\n=== AI pays for a worthwhile stapled effect, declines a worthless one ===');
{
  const G = newGame();
  G.pendingOptionalCost = { who: 'opp', cost: { R: 1, C: 2 }, source: 'Test', sourceIid: 1,
    item: { trig: { effects: CARDS[SPELL].effects } } };
  const a = AI.decide(G, 'opp');
  check('AI pays for a positive-value effect', a && a.type === 'optionalCost' && a.pay === true, JSON.stringify(a));

  const G2 = newGame();
  G2.pendingOptionalCost = { who: 'opp', cost: { C: 1 }, source: 'Test', sourceIid: 1,
    item: { trig: { effects: [] } } };
  const a2 = AI.decide(G2, 'opp');
  check('AI declines a zero-value effect', a2 && a2.type === 'optionalCost' && a2.pay === false, JSON.stringify(a2));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
