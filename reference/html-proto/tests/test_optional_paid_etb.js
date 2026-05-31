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
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();
const SPELL = 'goblin_rabble';   // create_tokens, {R:1,C:2}, untargeted
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
  const bfBefore = G.you.battlefield.filter(c => hasType(c, 'Creature')).length;

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
    G.you.battlefield.filter(c => hasType(c, 'Creature')).length > bfBefore);
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
  const bfBefore = G.you.battlefield.filter(c => hasType(c, 'Creature')).length;
  ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  ENGINE.executeAction('you', { type: 'optionalCost', pay: false });
  check('prompt cleared after declining', G.pendingOptionalCost == null);
  check('no tokens entered on decline (effect skipped)',
    G.you.battlefield.filter(c => hasType(c, 'Creature')).length === bfBefore);
}

console.log('\n=== CAN\'T pay (no R source) → auto-declines, no prompt ===');
{
  const G = newGame();
  const land = stapleInstance('plains', 'you');
  G.you.hand.push(land);
  readyMain(G, 'you');
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };   // a Plains can't make R
  const bfBefore = G.you.battlefield.filter(c => hasType(c, 'Creature')).length;
  ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  check('no prompt when the controller cannot pay', G.pendingOptionalCost == null);
  check('no tokens (effect skipped)',
    G.you.battlefield.filter(c => hasType(c, 'Creature')).length === bfBefore);
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

console.log('\n=== Land+TARGETED-spell ETB carries the target step + resolves (no null-target crash) ===');
if (CARDS.lightning_bolt) {
  // Regression: the synthesized ETB trigger copied the spell's effects but NOT
  // its top-level target() step. A migrated targeted spell (lightning_bolt: target() + a
  // BARE damage effect) thus ran a TARGETLESS damage on resolve → null-target
  // crash in applyDamageFrom — an uncaught throw that froze the AI mid-turn
  // ("AI hangs on a land+spell ETB"). The untargeted goblinRabble staple above
  // never exercised this. Modeled on the AI path (the side that hung): the
  // controller auto-picks the target (no human prompt), then the optional cost.
  const G = newGame();
  const etbTpl = ENGINE.makeCard('plains', undefined, 0, undefined, undefined, undefined, ['lightning_bolt']);
  const etb = (etbTpl.triggers || []).find(t => t.event === 'card_zone_change');
  check('stapled bolt ETB carries the target step (target + optional_cost)',
    etb && etb.target === 'creature_or_player' && etb.optional_cost && etb.optional_cost.R === 1,
    etb && JSON.stringify({ target: etb.target, cost: etb.optional_cost }));

  const land = ENGINE.makeCard('plains', undefined, 0, undefined, undefined, undefined, ['lightning_bolt']);
  land.iid = iidc++; land.controller = 'opp'; land.owner = 'opp';
  G.opp.hand.push(land);
  readyMain(G, 'opp');
  G.opp.mana = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 5 };
  // A tough creature on the HUMAN's board (the AI's enemy) so the auto-picker
  // has a creature to aim at and it survives the 3 (damage stays observable).
  const victim = ENGINE.makeCard('savannah_lions', undefined, 0);
  victim.iid = iidc++; victim.controller = 'you'; victim.owner = 'you'; victim.sick = false;
  victim.toughness = 9; victim.power = 0;
  G.you.battlefield.push(victim);

  const youLife0 = G.you.life;
  ENGINE.executeAction('opp', { type: 'playLand', cardIid: land.iid });
  // Drive the priority loop to resolution: pass / pay the optional cost / pick
  // any trigger target, until nothing's owed. This is the path that hung — the
  // ETB resolving used to throw (null target) inside executeAction.
  let threw = null, guard = 0;
  try {
    while (guard++ < 60) {
      const who = ENGINE.expectedActor();
      if (!who) break;
      if (G.pendingOptionalCost && G.pendingOptionalCost.who === who) {
        ENGINE.executeAction(who, { type: 'optionalCost', pay: true });
      } else if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who) {
        ENGINE.executeAction(who, { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] });
      } else {
        ENGINE.executeAction(who, { type: 'pass' });
      }
    }
  } catch (e) { threw = e.message || String(e); }
  check('resolving the TARGETED staple ETB does not crash (was a null-target throw → AI hang)',
    threw === null, threw || '');
  check('the bolt dealt its 3 damage to a real target (your creature or face)',
    victim.damage === 3 || G.you.life === youLife0 - 3,
    'victim.damage=' + victim.damage + ' youLife=' + youLife0 + '→' + G.you.life);
}

console.log('\n=== cost sticker reduces the optional ETB cost (not just the vestigial land cost) ===');
if (CARDS.mind_rot) {
  // mindrot is {B}{1}; a "-1 cost" (cost_minus_1) sticker on the spell must
  // reduce the ETB's optional_cost too — it used to only touch the vestigial
  // (free-land) card.cost, leaving the "you may pay" cost unchanged.
  const inst = ENGINE.makeCard('mountain', ['cost_minus_1'], 0, undefined, undefined, undefined, ['mind_rot']);
  const etb = (inst.triggers || []).find(t => t.event === 'card_zone_change');
  check('mindrot base cost is {B}{1}', CARDS.mind_rot.cost.B === 1 && CARDS.mind_rot.cost.C === 1);
  check('cost_minus_1 reduces the optional_cost to {B} (C: 1 → 0)',
    etb && etb.optional_cost && etb.optional_cost.B === 1 && etb.optional_cost.C === 0,
    etb && JSON.stringify(etb.optional_cost));
}

console.log('\n=== ETB trigger hits the stack immediately on play (not deferred to next action) ===');
{
  const G = newGame();
  const land = stapleInstance('plains', 'you');   // plains + goblinRabble (untargeted)
  G.you.hand.push(land);
  readyMain(G, 'you');
  G.you.mana = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 5 };
  // Give the human ANOTHER action so step() won't auto-pass-and-resolve — that's
  // the condition under which the trigger used to sit queued until the next pass.
  const extra = ENGINE.makeCard('lightning_bolt', undefined, 0);
  extra.iid = iidc++; extra.controller = 'you'; extra.owner = 'you';
  G.you.hand.push(extra);
  const enemy = ENGINE.makeCard('savannah_lions', undefined, 0);
  enemy.iid = iidc++; enemy.controller = 'opp'; enemy.owner = 'opp'; enemy.sick = false;
  G.opp.battlefield.push(enemy);

  ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  check('the ETB is on the stack right after playing the land (drained, not left queued)',
    G.stack.length === 1 && G.pendingTriggers.length === 0,
    'stack=' + G.stack.length + ' pendingTriggers=' + G.pendingTriggers.length);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
