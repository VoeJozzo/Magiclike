// Audit fix A3-12 — a mid-prompt trigger fizzle logs, instead of vanishing
// wordlessly.
//
// doTriggerTargetPick: when the human's multi-slot target prompt ends in
// 'fizzle' (a LATER slot lost its only legal target after an earlier pick was
// committed), the trigger is dropped. Pre-fix the only handling was a comment
// + drainTriggers() — the player saw "X triggered — choose a target", picked
// one, and the trigger evaporated with no message. Both sibling fizzle paths
// (pushTriggerOnStack's auto-pick arm, resolveTrigger's dead-target arm) log;
// the fix adds the same wording here.
//
// Reaching the arm needs a multi-slot human prompt whose later slot strands
// mid-prompt — near-unreachable through pure play today (the prompt freezes
// all other actions), so the test opens a REAL prompt through a real cast
// (a clockwork_beetle + roots_and_branches staple: 2-slot controller-gated
// ETB) and then strands slot 1 by board mutation before submitting the
// slot-0 pick, exactly the shape the packet describes for future 3+-slot /
// asymmetric-filter cards.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9500;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
// Cast a beetle+roots staple with 2 opp creatures + 2 own creatures on board
// and run the machine until its 2-slot ETB prompt opens (slot 0: tap a
// creature an opponent controls — 2 valid → genuine choice).
function openStaplePrompt() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['G'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.battlefield.push(mk('savannah_lions', 'you'), mk('savannah_lions', 'you'));
  G.opp.battlefield.push(mk('savannah_lions', 'opp'), mk('savannah_lions', 'opp'));
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const beetle = ENGINE.makeCard('clockwork_beetle', [], 0, null, null, ['roots_and_branches']);
  Object.assign(beetle, { controller: 'you', owner: 'you', tapped: false,
    sick: false, damage: 0, damagedBySources: new Set() });
  G.you.hand.push(beetle);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: beetle.iid });
  let safety = 20;
  while ((G.stack.length || G.pendingTriggers.length) && !G.pendingTriggerTarget && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
  return G;
}
const FIZZLE_RE = /trigger fizzles — no legal target/;

console.log('=== A3-12: stranding a later slot mid-prompt logs the fizzle ===');
(() => {
  const G = openStaplePrompt();
  check('2-slot prompt opened at slot 0 with 2 valid targets',
    !!G.pendingTriggerTarget && G.pendingTriggerTarget.currentSlot === 0
    && G.pendingTriggerTarget.valid.length === 2,
    G.pendingTriggerTarget ? 'slot=' + G.pendingTriggerTarget.currentSlot
      + ' valid=' + G.pendingTriggerTarget.valid.length : 'no prompt');
  const pick = G.pendingTriggerTarget.valid[0];
  // Strand slot 1 ("target creature you control gets +1/+1") mid-prompt:
  // every creature you control leaves the battlefield.
  G.you.battlefield = G.you.battlefield.filter(c => !hasType(c, 'Creature'));
  G.log.length = 0;
  ENGINE.executeAction('you', { type: 'triggerTargetPick', target: pick });
  check('prompt closed', !G.pendingTriggerTarget);
  check('trigger dropped (nothing pushed to the stack)',
    !G.stack.some(e => e.kind === 'trigger'), 'stack=' + G.stack.length);
  check('A3-12: the fizzle is LOGGED (sibling-path wording)',
    G.log.some(e => FIZZLE_RE.test(e.msg)),
    G.log.length ? G.log.slice(0, 3).map(e => e.msg).join(' | ') : '(log empty — silent fizzle)');
})();

console.log('\n=== guard: a completed prompt does NOT log a fizzle ===');
(() => {
  const G = openStaplePrompt();
  check('prompt opened', !!G.pendingTriggerTarget);
  const pick = G.pendingTriggerTarget.valid[0];
  G.log.length = 0;
  ENGINE.executeAction('you', { type: 'triggerTargetPick', target: pick });
  // Slot 1 (your creature) auto-fills or prompts; finish any remaining slots.
  let safety = 5;
  while (G.pendingTriggerTarget && safety-- > 0) {
    ENGINE.executeAction('you', { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] });
  }
  check('no fizzle line on the happy path', !G.log.some(e => FIZZLE_RE.test(e.msg)),
    G.log.slice(0, 3).map(e => e.msg).join(' | '));
  check('trigger reached the stack or resolved (prompt done)',
    !G.pendingTriggerTarget);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
