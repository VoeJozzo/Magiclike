// Hymnwright — "verse" counters: the first NAMED-counter card (a counter that
// is a bare resource and does NOT change P/T). Covers the whole primitive:
//   (1) accrual — a verse per OTHER creature that dies (per-death),
//   (2) generated card text (accrual clause + the remove_counters cost + recall),
//   (3) the remove_counters activation cost gated in BOTH isLegalAction AND
//       getLegalActions (the engine's add-it-in-both-places invariant),
//   (4) end-to-end activation: {T} taps her, exactly 3 verses are spent, and the
//       targeted creature returns from the graveyard to hand,
//   (5) counters vanish when she leaves play (MTG 122.1g).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function freshGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.pendingTriggers = []; G.pendingTriggerTarget = null;
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  return G;
}
function place(G, tplId, who) {
  const c = ENGINE.makeCard(tplId);
  c.controller = who; c.owner = who; c.sick = false;
  G[who].battlefield.push(c);
  return c;
}
function inHand(G, tplId, who) {
  const c = ENGINE.makeCard(tplId);
  c.controller = who; c.owner = who;
  G[who].hand.push(c);
  return c;
}
function drain(G) {
  let safety = 80;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
// A clean vanilla creature, bolt-killable (toughness 1-3, no triggers/abilities).
const VICTIM = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && (c.toughness || 0) >= 1 && (c.toughness || 0) <= 3
        && !c.triggers && !c.abilities && !c.static_buffs
        && (!c.keywords || c.keywords.length === 0)) return id;
  }
  return 'grizzly_bears';
})();

console.log('=== card loaded + generated text ===');
check('hymnwright in CARDS', !!CARDS['hymnwright']);
check('VICTIM is a bolt-killable vanilla', !!VICTIM && (CARDS[VICTIM].toughness || 0) <= 3, VICTIM);
(() => {
  const txt = describeCardText(CARDS['hymnwright']);
  check('text: triggers on another creature dying', /another creature dies/i.test(txt), txt);
  check('text: puts a verse counter', /verse counter/i.test(txt), txt);
  check('text: cost removes three verse counters', /Remove three verse counters/i.test(txt), txt);
  check('text: recall references the graveyard', /graveyard/i.test(txt), txt);
})();

console.log('\n=== accrual: a verse per OTHER creature that dies ===');
(() => {
  const G = freshGame();
  const hymn = place(G, 'hymnwright', 'you');
  check('starts with zero verse counters', (hymn.counters.verse || 0) === 0, 'verse=' + hymn.counters.verse);

  const v1 = place(G, VICTIM, 'opp');
  const bolt1 = inHand(G, 'lightning_bolt', 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt1.iid, targets: [{ kind: 'creature', iid: v1.iid }] });
  drain(G);
  check('victim 1 died', G.opp.graveyard.some(c => c.iid === v1.iid));
  check('Hymnwright gained 1 verse', (hymn.counters.verse || 0) === 1, 'verse=' + hymn.counters.verse);

  // The first resolve ran priority forward (into combat) and emptied the mana
  // pool at the phase boundary (v2.0.42); reopen a MAIN1 window with mana.
  G.phase = 'MAIN1'; G.activePlayer = 'you'; G.priorityHolder = 'you';
  G.stack = []; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const v2 = place(G, VICTIM, 'opp');
  const bolt2 = inHand(G, 'lightning_bolt', 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt2.iid, targets: [{ kind: 'creature', iid: v2.iid }] });
  drain(G);
  check('Hymnwright gained a 2nd verse (per-death)', (hymn.counters.verse || 0) === 2, 'verse=' + hymn.counters.verse);
})();

console.log('\n=== remove_counters cost gated in BOTH legality paths ===');
(() => {
  const G = freshGame();
  const hymn = place(G, 'hymnwright', 'you');
  const dead = ENGINE.makeCard(VICTIM); dead.owner = 'you'; dead.controller = 'you'; G.you.graveyard.push(dead);
  const tgt = ENGINE.targetsForFilter('graveyard_card', 'you', { type: 'Creature' }).find(t => t.iid === dead.iid);
  check('graveyard_card target resolves the dead creature', !!tgt);
  const recall = { type: 'activateAbility', cardIid: hymn.iid, abilityIdx: 0, targets: [tgt] };
  const enumerated = () => ENGINE.getLegalActions('you').some(a => a.type === 'activateAbility' && a.cardIid === hymn.iid);

  hymn.counters.verse = 2;
  check('isLegalAction FALSE at 2 verses', ENGINE.isLegalAction('you', recall) === false);
  check('getLegalActions EXCLUDES recall at 2 verses', enumerated() === false);

  hymn.counters.verse = 3;
  check('isLegalAction TRUE at 3 verses', ENGINE.isLegalAction('you', recall) === true);
  check('getLegalActions INCLUDES recall at 3 verses', enumerated() === true);

  // No legal target (empty graveyard) → not activatable even with enough verses.
  G.you.graveyard = [];
  check('isLegalAction FALSE with no graveyard target', ENGINE.isLegalAction('you', recall) === false);
})();

console.log('\n=== end-to-end activation: {T} + spend exactly 3 + return to hand ===');
(() => {
  const G = freshGame();
  const hymn = place(G, 'hymnwright', 'you');
  hymn.counters.verse = 4;   // spend 3, leave 1
  const dead = ENGINE.makeCard(VICTIM); dead.owner = 'you'; dead.controller = 'you'; G.you.graveyard.push(dead);
  const tgt = ENGINE.targetsForFilter('graveyard_card', 'you', { type: 'Creature' }).find(t => t.iid === dead.iid);
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: hymn.iid, abilityIdx: 0, targets: [tgt] });
  drain(G);
  check('Hymnwright is tapped', hymn.tapped === true);
  check('exactly 3 verses spent (4 → 1)', (hymn.counters.verse || 0) === 1, 'verse=' + hymn.counters.verse);
  check('creature left the graveyard', !G.you.graveyard.some(c => c.iid === dead.iid));
  check('creature returned to hand', G.you.hand.some(c => c.iid === dead.iid));
})();

console.log('\n=== leave-play: verse counters vanish when she leaves ===');
(() => {
  const G = freshGame();
  const hymn = place(G, 'hymnwright', 'you');
  hymn.counters.verse = 3;
  const bolt = inHand(G, 'lightning_bolt', 'you');
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid, targets: [{ kind: 'creature', iid: hymn.iid }] });
  drain(G);
  const inGrave = G.you.graveyard.find(c => c.iid === hymn.iid);
  check('Hymnwright died (1/3 to a 3-damage bolt)', !!inGrave);
  check('her verse counters were cleared on leave-play',
    !!inGrave && (!inGrave.counters || (inGrave.counters.verse || 0) === 0),
    inGrave && JSON.stringify(inGrave.counters));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
