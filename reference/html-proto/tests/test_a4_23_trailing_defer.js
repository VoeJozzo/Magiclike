// Audit A4-23 leg-1 — effects AFTER a human-pausing effect (a tutor search or a
// forced discard) must resolve AFTER the human's pick, not before (canon §704.2
// "resolve each effect in order"; §600 makes resolution atomic). Before the fix,
// searchLibraryToHand / discardFromHand opened their prompt and RETURNED, but the
// resolution loop kept going and ran the trailing effects immediately — so e.g.
// Demonic Tutor's "lose 2 life" fired BEFORE you chose the tutored card. The fix
// generalizes the edict (A4-7) deferral: a human pause stashes the trailing
// effects on the prompt and breaks; doSearchPick / doDiscard replay them once the
// pick completes (resumeTrailingEffects). AI path is unchanged (resolves inline).
//
// Demonic Tutor is a REAL card that exhibits this (effects: [library_search,
// gain_life -2 scope:self]); the discard block uses a synthetic sorcery to cover
// the forced-discard path + the "replay exactly once after the LAST discard"
// subtlety. DOM is browser-only; this covers the engine/resolution layer.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9300;
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
function readyForCast(G, who) {
  setup.startMainPhase(who);
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
}
function drainStack(G) {
  let safety = 30;
  while (G.stack.length > 0 && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

console.log('=== Demonic Tutor (human): trailing "lose 2 life" DEFERS until the search pick ===');
if (!CARDS['demonic_tutor']) {
  console.log('  (demonic_tutor not in CARDS -- skipping)');
} else {
  const G = newGame();
  // A findable creature for the tutor (filter: type Creature) — the plains deck has none.
  const findable = mk(VANILLA, 'you'); G.you.library.push(findable);
  const lifeBefore = G.you.life;
  const tutor = mk('demonic_tutor', 'you'); G.you.hand.push(tutor);
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: tutor.iid, targets: [] });
  drainStack(G);

  check('search prompt opens for the human', G.pendingSearch && G.pendingSearch.who === 'you');
  check('trailing "lose 2 life" DEFERRED — life unchanged before the pick',
    G.you.life === lifeBefore, 'life=' + G.you.life + ' before=' + lifeBefore);
  check('engine awaits the human (owes the searchPick)', ENGINE.expectedActor() === 'you');

  ENGINE.executeAction('you', { type: 'searchPick', cardIid: findable.iid });
  check('search prompt cleared after the pick', G.pendingSearch == null);
  check('tutored creature is in hand', G.you.hand.some(c => c.iid === findable.iid));
  check('trailing "lose 2 life" applied AFTER the pick', G.you.life === lifeBefore - 2,
    'life=' + G.you.life + ' (expected ' + (lifeBefore - 2) + ')');
}

console.log('\n=== Regression: AI casting the same tutor resolves inline (no prompt, trailing runs) ===');
if (CARDS['demonic_tutor']) {
  const G = newGame();
  G.opp.library.push(mk(VANILLA, 'opp'));
  const oppLifeBefore = G.opp.life;
  const tutor = mk('demonic_tutor', 'opp'); G.opp.hand.push(tutor);
  readyForCast(G, 'opp');
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: tutor.iid, targets: [] });
  drainStack(G);
  check('no human search prompt when the AI tutors', G.pendingSearch == null);
  check('AI trailing "lose 2 life" ran inline (resolved in order)', G.opp.life === oppLifeBefore - 2,
    'oppLife=' + G.opp.life + ' (expected ' + (oppLifeBefore - 2) + ')');
}

console.log('\n=== Synthetic forced-discard sorcery (human): trailing "+3 life" defers until the LAST discard ===');
{
  // A real card with a HUMAN discard + a trailing effect doesn't ship today, so
  // synthesize one (added post-boot; boot validation already ran). discard 2,
  // then gain 3 — the +3 must replay exactly once, after the SECOND discard.
  CARDS['_a4_23_rummage'] = {
    card_id: '_a4_23_rummage', name: 'Test Rummage', cost: { C: 0 }, types: ['Sorcery'],
    effects: [
      { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'controller_chosen', amount: 2 },
      { kind: 'gain_life', amount: 3, scope: 'self' },
    ],
  };
  const G = newGame();
  const lifeBefore = G.you.life;
  const spell = mk('_a4_23_rummage', 'you'); G.you.hand.push(spell);
  const d1 = mk(VANILLA, 'you'); const d2 = mk(VANILLA, 'you');
  G.you.hand.push(d1, d2);   // two cards to discard
  readyForCast(G, 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: spell.iid, targets: [] });
  drainStack(G);

  check('forced-discard prompt opens for the human (remaining 2)',
    G.forcedDiscard && G.forcedDiscard.who === 'you' && G.forcedDiscard.remaining === 2);
  check('trailing "+3 life" DEFERRED — life unchanged before any discard', G.you.life === lifeBefore);

  ENGINE.executeAction('you', { type: 'discard', cardIid: d1.iid });
  check('after FIRST discard: prompt still open (remaining 1)',
    G.forcedDiscard && G.forcedDiscard.remaining === 1);
  check('after FIRST discard: trailing still DEFERRED (life unchanged)', G.you.life === lifeBefore,
    'life=' + G.you.life);

  ENGINE.executeAction('you', { type: 'discard', cardIid: d2.iid });
  check('after LAST discard: prompt cleared', G.forcedDiscard == null);
  check('trailing "+3 life" applied exactly once, after the last discard',
    G.you.life === lifeBefore + 3, 'life=' + G.you.life + ' (expected ' + (lifeBefore + 3) + ')');
  delete CARDS['_a4_23_rummage'];
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
