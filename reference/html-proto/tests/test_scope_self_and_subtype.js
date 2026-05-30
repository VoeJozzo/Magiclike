// Regression: two trigger/effect bugs surfaced by "Patient Saint + High
// Priestess + Ajani's Pridemate didn't chain."
//
// Bug 1 — card_has_subtype(X): the predicate guarded on Array.isArray(c.sub),
//   but `sub` is a space-separated STRING everywhere (token cards, splice
//   merge, matchFilter). So every subtype-ETB trigger (High Priestess: "another
//   Cleric entered → gain life") silently never fired. Fixed to a word-boundary
//   string match (triggers.js), matching matchFilter's semantics.
//
// Bug 2 — scope:'self' creature effects (pump/affect_creature/grant_keyword) and
//   self-targeted player damage were silently dropped. The handlers route any
//   `params.scope` through creaturesInScope(), which returns [] for 'self' — so
//   a self-pump applied to NOBODY. The callers already resolve scope:'self' into
//   the `target` arg, so resolveEffectParams now strips scope:'self' (engine.js)
//   and the handler operates on that target. Affected ~13 self-pump cards
//   (Ajani's Pridemate, Bloodlust, Carrion Feeder, Dragon, …), two stickers, and
//   Char's "1 damage to you". No crash → tests/selfplay stayed green (the §8.1
//   lockstep trap), so this test asserts the OBSERVABLE effect, not the shape.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let iid = 7000;
function mk(t, c) {
  return Object.assign(JSON.parse(JSON.stringify(CARDS[t])), {
    iid: iid++, tplId: t, controller: c, owner: c, tapped: false, sick: false,
    damage: 0, permPower: 0, permTou: 0, tempPower: 0, tempTou: 0,
    keywords: (CARDS[t].keywords || []).slice(), damagedBySources: new Set(),
  });
}
function game(active) {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = active; G.priorityHolder = active; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[active].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = [];
  return G;
}
function drain(G) {
  let safety = 60;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}

console.log('=== Bug 1: card_has_subtype matches a string `sub` (word-boundary) ===');
(() => {
  const ctx = { state: ENGINE.state(), source: { iid: 1 }, who: 'you',
    event: { subject_card: { iid: 2, types: ['Creature', 'Human', 'Cleric', 'Wall'] } } };
  check('card_has_subtype(Cleric) matches "Human Cleric Wall"',
    evaluateCondition('card_has_subtype(Cleric)', ctx) === true);
  check('card_has_subtype(Wall) matches the last token',
    evaluateCondition('card_has_subtype(Wall)', ctx) === true);
  check('card_has_subtype(Cler) does NOT match a partial word',
    evaluateCondition('card_has_subtype(Cler)', ctx) === false);
})();

console.log('\n=== Bug 1 + 2 end-to-end: cast a Cleric → High Priestess gains life → Pridemate grows ===');
(() => {
  const G = game('you');
  const hp = mk('high_priestess', 'you'); G.you.battlefield.push(hp);
  const pm = mk('ajanis_pridemate', 'you'); G.you.battlefield.push(pm);
  const saint = mk('patient_saint', 'you'); G.you.hand.push(saint);
  const life0 = G.you.life;
  const pm0 = ENGINE.getStats(pm);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: saint.iid });
  drain(G);
  const pm1 = ENGINE.getStats(pm);
  check('High Priestess gained 2 life when a Cleric entered', G.you.life === life0 + 2,
    life0 + '→' + G.you.life);
  check('Ajani’s Pridemate got a +1/+1 counter from that lifegain',
    pm1[0] === pm0[0] + 1 && pm1[1] === pm0[1] + 1, pm0.join('/') + ' → ' + pm1.join('/'));
})();

console.log('\n=== Bug 2: tapping Patient Saint for life triggers Pridemate (scope:self pump) ===');
(() => {
  const G = game('you');
  const pm = mk('ajanis_pridemate', 'you'); G.you.battlefield.push(pm);
  const saint = mk('patient_saint', 'you'); G.you.battlefield.push(saint);
  const life0 = G.you.life;
  const pm0 = ENGINE.getStats(pm);
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: saint.iid, abilityIdx: 0 });
  drain(G);
  const pm1 = ENGINE.getStats(pm);
  check('tapping the Saint gained 1 life', G.you.life === life0 + 1, life0 + '→' + G.you.life);
  check('Ajani’s Pridemate grew +1/+1 from the tap lifegain',
    pm1[0] === pm0[0] + 1 && pm1[1] === pm0[1] + 1, pm0.join('/') + ' → ' + pm1.join('/'));
})();

console.log('\n=== Bug 2: Char (scope:self damage) deals its "1 damage to you" ===');
(() => {
  const G = game('you');
  const char = mk('char', 'you'); G.you.hand.push(char);
  const my0 = G.you.life, opp0 = G.opp.life;
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: char.iid, targets: [{ kind: 'player', who: 'opp' }] });
  drain(G);
  check('opponent took the 4 damage', G.opp.life === opp0 - 4, opp0 + '→' + G.opp.life);
  check('caster took the 1 self-damage', G.you.life === my0 - 1, my0 + '→' + G.you.life);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
