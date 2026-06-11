// Audit fix A1-1 leg 3 — triggers queued while priority is CLOSED wait for
// the next real priority window instead of conjuring a synthetic round
// (Joe-approved, PR #98 round 3: "Sounds like a pair of good catches.
// Please fix them.").
//
// Pre-fix, drainTriggers ran unconditionally and pushTriggerEntry contained
// `if (!G.priority) G.priority = { passes: new Set() }` — a trigger draining
// while the engine was parked on a pending declaration (waiting for
// attackers/blocks, priority CLOSED per canon §605) invented a priority
// round on the spot. Both players auto-pass the invented round and
// advancePhaseAfterPriority marches the phase forward PAST the declaration:
// with zero attackers committed the COMBAT_ATTACK arm goes straight to
// MAIN2 — combat silently skipped with attackersDeclared still false.
// Reachable because mana abilities are legal at ANY time (even mid-pause)
// and doActivateAbility ends with an unconditional drainTriggers(): the
// first "Sacrifice a creature: add mana" card (sac → dies-trigger) springs
// it. Canon §1004.4: triggers queued while priority is closed WAIT; they
// drain at the next openPriorityRound.
//
// Arms:
//   1. KEY — parked on declare-attackers, a sac-for-mana ability fires a
//      dies-trigger: the trigger must stay QUEUED (no synthetic round, no
//      stack push, no resolution) and the engine must stay parked on the
//      declaration (red pre-fix: round conjured, trigger pushed).
//   2. KEY continuation — declaring attackers then drains the queued
//      trigger into the real (a.ii) window and combat actually happens
//      (red pre-fix: combat was skipped before the declaration could occur).
//   3. Guard — the same sac-for-mana ability used during an OPEN round
//      drains immediately onto the stack, exactly as before.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9900;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  return G;
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs
        && (!c.keywords || c.keywords.length === 0)) return id;
  }
  return null;
})();
// The landmine card class that makes the closed-window drain live: a
// "Sacrifice a creature: add {C}" mana ability (none exists in the pool yet
// — that's exactly why this was a latent landmine).
const SAC_MANA_ABILITY = { cost: { sacrifice: true }, effects: [{ kind: 'add_mana', amounts: { C: 1 } }] };
// The sacrifice fodder carries a dies-trigger so the sac queues a trigger.
const diesGainLife = () => ({
  event: 'card_zone_change',
  condition: ['this_card', 'card_moves(battlefield, graveyard)'],
  text: 'When this dies, you gain 2 life.',
  effects: [{ kind: 'gain_life', amount: 2 }],
});
function setupBoard(G) {
  const atk = mk(VANILLA, 'you');
  atk.power = 2; atk.toughness = 2;
  const altar = mk(VANILLA, 'you');
  altar.abilities = [JSON.parse(JSON.stringify(SAC_MANA_ABILITY))];
  const victim = mk(VANILLA, 'you');
  victim.triggers = [diesGainLife()];
  G.you.battlefield.push(atk, altar, victim);
  return { atk, altar, victim };
}

if (!VANILLA) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A1-1 leg 3 KEY: closed-window trigger stays queued (no synthetic round) ===');
  const G = newGame();
  const { atk, altar, victim } = setupBoard(G);
  // Close MAIN1: you pass; opp (empty) auto-passes; the engine parks on the
  // attacker declaration with priority CLOSED.
  ENGINE.executeAction('you', { type: 'pass' });
  check('setup: parked on declare-attackers with priority closed',
    G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared && G.priority === null
    && ENGINE.expectedActor() === 'you',
    'phase=' + G.phase + ' open=' + (G.priority !== null) + ' actor=' + ENGINE.expectedActor());
  // Mid-pause, use the mana ability (legal at ANY time), sacrificing the
  // dies-trigger creature.
  const ok = ENGINE.executeAction('you', { type: 'activateAbility',
    cardIid: altar.iid, abilityIdx: 0, sacIid: victim.iid });
  check('the mana ability executed mid-pause (legal at any time)', ok === true);
  check('the sacrifice happened and the mana arrived',
    !G.you.battlefield.some(c => c.iid === victim.iid) && G.you.mana.C === 1,
    'C=' + G.you.mana.C);
  check('KEY: no synthetic priority round was conjured (priority still closed)',
    G.priority === null,
    'open=' + (G.priority !== null) + ' holder=' + G.priorityHolder);
  check('KEY: the dies-trigger is QUEUED, not pushed to the stack',
    G.pendingTriggers.length === 1 && G.stack.length === 0,
    'pending=' + G.pendingTriggers.length + ' stack=' + G.stack.length);
  check('KEY: trigger has not resolved early (no life gained yet)',
    G.you.life === 20, 'life=' + G.you.life);
  check('KEY: still parked on the declaration — combat NOT silently skipped',
    G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared && ENGINE.expectedActor() === 'you',
    'phase=' + G.phase + ' declared=' + G.attackersDeclared + ' actor=' + ENGINE.expectedActor());

  console.log('\n=== A1-1 leg 3 KEY: the queued trigger drains at the next real window; combat happens ===');
  ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
  check('queued trigger drained and resolved in the post-declaration window (+2 life)',
    G.you.life === 22 && G.pendingTriggers.length === 0,
    'life=' + G.you.life + ' pending=' + G.pendingTriggers.length);
  check('combat actually happened (unblocked attacker connected)',
    G.opp.life === 18, 'opp.life=' + G.opp.life);

  console.log('\n=== guard: same ability during an OPEN round drains immediately (unchanged) ===');
  (() => {
    const G2 = newGame();
    const altar2 = mk(VANILLA, 'you');
    altar2.abilities = [JSON.parse(JSON.stringify(SAC_MANA_ABILITY))];
    const victim2 = mk(VANILLA, 'you');
    victim2.triggers = [diesGainLife()];
    // Opp gets an untapped Sorcerer as an auto-pass anchor (hasNoAction(opp)
    // stays false, so the engine parks with opp holding instead of
    // auto-passing through the post-push response window).
    const anchor = mk('prodigal_sorcerer', 'opp');
    G2.you.battlefield.push(altar2, victim2);
    G2.opp.battlefield.push(anchor);
    check('setup: open MAIN1 round, you hold priority',
      G2.priority !== null && G2.priorityHolder === 'you' && G2.phase === 'MAIN1');
    ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: altar2.iid, abilityIdx: 0, sacIid: victim2.iid });
    check('open-window drain unchanged: dies-trigger went straight onto the stack',
      G2.pendingTriggers.length === 0 && G2.stack.length === 1
      && G2.stack[0].kind === 'trigger',
      'pending=' + G2.pendingTriggers.length + ' stack=' + G2.stack.length);
    check('push reset the response round (opponent of controller holds, §1004.5)',
      G2.priorityHolder === 'opp', 'holder=' + G2.priorityHolder);
    // Let it resolve.
    ENGINE.executeAction('opp', { type: 'pass' });
    ENGINE.executeAction('you', { type: 'pass' });
    check('trigger resolved normally (+2 life)', G2.you.life === 22, 'life=' + G2.you.life);
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
