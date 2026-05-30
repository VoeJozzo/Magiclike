// Human-facing edict selection (GAP 2 — plan-effects-refactor.md §3.5).
//
// `chooses()` (Diabolic Edict / Vile Edict) used to ALWAYS auto-pick the
// lowest-sac-value permanent, even when the player being forced to sacrifice
// was the human — so a human edict-victim had their creature chosen for them.
// This is the engine contract for the human prompt: when the chooser is the
// human ('you'), resolution pauses with `pendingEdictChoice` set, the human
// submits an `edictChoice` action, and the chosen-dependent trailing effects
// (sacrifice / annihilate / rip) replay against their pick.
//
// AI behavior must be UNCHANGED (auto-pick lowest sac-value) — selfplay is the
// regression signal and exercises only the AI path, so this dedicated test is
// the only coverage of the human branch. The DOM modal itself is browser-only
// (verify in a running game); this covers the engine/decision layer.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9000;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame(cards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: cards || Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
// Active player `who` (the caster) holds priority in MAIN1 with full mana.
function readyForCast(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
}
// Drive priority passes until the stack empties (stops AT a pending choice,
// since pendingEdictChoice empties the stack but blocks via anyoneOwesDecision).
function drainStack(G) {
  let safety = 30;
  while (G.stack.length > 0 && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
// Drive the game to quiescence (AI resolves any stack items, queued triggers,
// or trigger-target prompts). Used after a deferred sacrifice to settle its
// death triggers — Blood Artist's trigger is player-controlled, so it may open
// a (forced, single-target) trigger-target prompt that the AI resolves.
function settle(G) {
  let safety = 40;
  while (safety-- > 0) {
    const work = G.stack.length > 0 || (G.pendingTriggers || []).length > 0
      || (G.pendingTriggerTarget && G.pendingTriggerTarget.controller);
    if (!work) break;
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
// A vanilla creature template (no triggers/abilities) for clean board setup.
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

console.log('=== Opp edicts the human: prompt opens, creature NOT auto-sacrificed ===');
{
  const G = newGame();
  const mine = mk(VANILLA, 'you'); G.you.battlefield.push(mine);
  const edict = mk('diabolic_edict', 'opp'); G.opp.hand.push(edict);
  readyForCast(G, 'opp');

  const cast = { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'you', label: 'You' }] };
  check('opp casting Diabolic Edict at the human is legal', ENGINE.isLegalAction('opp', cast));
  ENGINE.executeAction('opp', cast);
  drainStack(G);

  check('pendingEdictChoice is set after resolution',
    G.pendingEdictChoice != null);
  if (G.pendingEdictChoice) {
    check("prompt belongs to the human ('you')", G.pendingEdictChoice.who === 'you');
    check('prompt pool contains the human creature',
      G.pendingEdictChoice.pool.some(c => c.iid === mine.iid));
    check("prompt source is 'Diabolic Edict'", G.pendingEdictChoice.source === 'Diabolic Edict');
  }
  check('creature was NOT auto-sacrificed (still on battlefield)',
    G.you.battlefield.some(c => c.iid === mine.iid));
  check('creature NOT in graveyard yet',
    !G.you.graveyard.some(c => c.iid === mine.iid));
  check('engine considers the human the actor (owes a decision)',
    ENGINE.expectedActor() === 'you');
}

console.log("\n=== The human's choice is honored (not forced to the AI's lowest-value pick) ===");
{
  const G = newGame();
  // Two creatures with distinct sac-values; the AI auto-pick would take the
  // lowest. The human picks the OTHER — proving the choice is real.
  const a = mk(VANILLA, 'you'); G.you.battlefield.push(a);
  const b = mk(VANILLA, 'you'); G.you.battlefield.push(b);
  // Force a sac-value gap so "lowest" is unambiguous.
  a.tempPower = 5; a.tempTou = 5; // a is the bigger body → higher sac value
  const edict = mk('diabolic_edict', 'opp'); G.opp.hand.push(edict);
  readyForCast(G, 'opp');
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'you', label: 'You' }] });
  drainStack(G);

  check('two creatures offered in the pool', G.pendingEdictChoice && G.pendingEdictChoice.pool.length === 2);
  // The AI would auto-pick lowest sac-value; pick the higher-value one instead.
  const aVal = ENGINE.sacValueOnBoard(a), bVal = ENGINE.sacValueOnBoard(b);
  const higher = (aVal >= bVal) ? a : b;
  const lower  = (aVal >= bVal) ? b : a;
  const choice = { type: 'edictChoice', iid: higher.iid };
  check('edictChoice for an in-pool creature is legal', ENGINE.isLegalAction('you', choice));
  ENGINE.executeAction('you', choice);

  check('pendingEdictChoice cleared after submit', G.pendingEdictChoice == null);
  check('the human-chosen (higher-value) creature was sacrificed',
    G.you.graveyard.some(c => c.iid === higher.iid));
  check('the un-chosen (lower-value) creature survived',
    G.you.battlefield.some(c => c.iid === lower.iid) && !G.you.graveyard.some(c => c.iid === lower.iid));
}

console.log('\n=== Legality: only in-pool iids, only the prompted player, only while pending ===');
{
  const G = newGame();
  const mine = mk(VANILLA, 'you'); G.you.battlefield.push(mine);
  const edict = mk('diabolic_edict', 'opp'); G.opp.hand.push(edict);
  readyForCast(G, 'opp');
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'you', label: 'You' }] });
  drainStack(G);

  check('edictChoice with a bogus iid is illegal',
    !ENGINE.isLegalAction('you', { type: 'edictChoice', iid: 999999 }));
  check('edictChoice from the wrong player (opp) is illegal',
    !ENGINE.isLegalAction('opp', { type: 'edictChoice', iid: mine.iid }));
  check('edictChoice with the real iid is legal',
    ENGINE.isLegalAction('you', { type: 'edictChoice', iid: mine.iid }));
  // Resolve it, then it should no longer be legal.
  ENGINE.executeAction('you', { type: 'edictChoice', iid: mine.iid });
  check('edictChoice illegal once no prompt is pending',
    !ENGINE.isLegalAction('you', { type: 'edictChoice', iid: mine.iid }));
}

console.log('\n=== Regression guard: human edicts the AI → AI auto-picks, no human prompt ===');
{
  const G = newGame();
  const theirs = mk(VANILLA, 'opp'); G.opp.battlefield.push(theirs);
  const edict = mk('diabolic_edict', 'you'); G.you.hand.push(edict);
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'opp', label: 'Opp' }] });
  drainStack(G);

  check('no human prompt when the AI is the one choosing', G.pendingEdictChoice == null);
  check('AI auto-sacrificed its creature immediately',
    G.opp.graveyard.some(c => c.iid === theirs.iid) && !G.opp.battlefield.some(c => c.iid === theirs.iid));
}

console.log('\n=== Deferred death triggers still drain (Blood Artist sees the sacrifice) ===');
if (!CARDS['blood_artist']) {
  console.log('  (bloodArtist not in CARDS -- skipping)');
} else {
  const G = newGame();
  const artist = mk('blood_artist', 'you'); G.you.battlefield.push(artist);
  const victim = mk(VANILLA, 'you'); G.you.battlefield.push(victim);
  const lifeBefore = G.you.life, oppBefore = G.opp.life;
  const edict = mk('diabolic_edict', 'opp'); G.opp.hand.push(edict);
  readyForCast(G, 'opp');
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'you', label: 'You' }] });
  drainStack(G);
  // Human deliberately sacrifices the victim (keeping Blood Artist alive to trigger).
  check('Blood Artist + victim both offered', G.pendingEdictChoice && G.pendingEdictChoice.pool.length === 2);
  ENGINE.executeAction('you', { type: 'edictChoice', iid: victim.iid });
  settle(G); // resolve Blood Artist's (player-controlled) death trigger

  check('victim sacrificed', G.you.graveyard.some(c => c.iid === victim.iid));
  // Blood Artist: "a creature dies → opp loses 1, you gain 1."
  check('Blood Artist death trigger drained (you gained life)', G.you.life === lifeBefore + 1,
    'life ' + lifeBefore + ' -> ' + G.you.life);
  check('Blood Artist death trigger drained (opp lost life)', G.opp.life === oppBefore - 1,
    'oppLife ' + oppBefore + ' -> ' + G.opp.life);
}

console.log('\n=== Vile Edict (rip-edict): human pick → annihilate + run-slot rip both replay ===');
{
  // Deck carries the creature so it has a real run-slot to rip.
  const deck = [VANILLA].concat(Array(11).fill('plains'));
  const G = newGame(deck);
  const slots = RUN.getSlots();
  const slotIdx = slots.findIndex(s => s.tplId === VANILLA);
  const slotCountBefore = slots.length;
  const mine = mk(VANILLA, 'you'); mine.slotIdx = slotIdx; G.you.battlefield.push(mine);
  const edict = mk('vile_edict', 'opp'); G.opp.hand.push(edict);
  readyForCast(G, 'opp');
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'you', label: 'You' }] });
  drainStack(G);

  check("Vile Edict opens a 'permanent' prompt for the human",
    G.pendingEdictChoice && G.pendingEdictChoice.who === 'you' && G.pendingEdictChoice.filter === 'permanent');
  ENGINE.executeAction('you', { type: 'edictChoice', iid: mine.iid });

  check('chosen permanent annihilated (left the battlefield)',
    !G.you.battlefield.some(c => c.iid === mine.iid));
  check('annihilated — NOT sent to graveyard (cease-to-exist)',
    !G.you.graveyard.some(c => c.iid === mine.iid));
  check('trailing rip stripped the run-deck slot',
    RUN.getSlots().length === slotCountBefore - 1, 'slots ' + slotCountBefore + ' -> ' + RUN.getSlots().length);
}

console.log('\n=== AI resolves its own pendingEdictChoice (selfplay path) → auto-picks lowest sac-value ===');
{
  // Mirrors selfplay: the prompt opens for a seat that the AI is driving (in
  // a real game 'you' is the human, but AI.decide is seat-agnostic and IS what
  // resolves this seat in AI-vs-AI). This is the ONLY deterministic coverage of
  // ai.js's pendingEdictChoice branch — selfplay only hits it when an opp edict
  // happens to resolve at the AI seat, so a regression there would otherwise
  // stay green in the suite (the §8.1 lockstep trap).
  const G = newGame();
  const big = mk(VANILLA, 'you'); G.you.battlefield.push(big);
  const small = mk(VANILLA, 'you'); G.you.battlefield.push(small);
  big.tempPower = 5; big.tempTou = 5; // higher sac-value than the vanilla `small`
  const edict = mk('diabolic_edict', 'opp'); G.opp.hand.push(edict);
  readyForCast(G, 'opp');
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: edict.iid, targets: [{ kind: 'player', who: 'you', label: 'You' }] });
  drainStack(G);

  check('prompt is open for the AI-driven seat', G.pendingEdictChoice && G.pendingEdictChoice.who === 'you');
  const bigVal = ENGINE.sacValueOnBoard(big), smallVal = ENGINE.sacValueOnBoard(small);
  const expected = (bigVal <= smallVal) ? big : small; // AI picks lowest sac-value
  const aiAct = AI.decide(G, 'you');
  check('AI.decide returns an edictChoice action', aiAct && aiAct.type === 'edictChoice');
  check('AI auto-picks the lowest sac-value permanent', aiAct && aiAct.iid === expected.iid,
    'picked ' + (aiAct && aiAct.iid) + ', expected ' + expected.iid);
  // And it executes legally + leaves the higher-value creature alive.
  ENGINE.executeAction('you', aiAct);
  check('AI-chosen (lowest) creature was sacrificed', G.you.graveyard.some(c => c.iid === expected.iid));
  const survivor = (expected === big) ? small : big;
  check('higher-value creature survived the AI pick',
    G.you.battlefield.some(c => c.iid === survivor.iid));
}

// NOTE: the in-place battlefield-click selection (v2.0.53, reverted from a
// modal) is a DOM interaction that can't be driven headlessly. It is verified
// in-browser, not here. A prior version of this file source-grepped render.js /
// controller.js to assert the wiring ("click routes to edictChoice", "modal show
// is gone") — those were deleted: a grep that the source contains a substring
// tests how the code is written, not that the click works, gives false
// confidence, and only ever fires when someone deliberately re-does the design.
// The engine contract above (prompt opens, human pick honored, legality, AI
// auto-pick) is the real coverage.

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
