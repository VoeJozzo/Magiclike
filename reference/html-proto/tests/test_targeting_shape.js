// Canonical targeting-shape API (engine.js objectNeedsTarget / primaryLegalTargets
// / probeTargetsForObject). This is the single source of truth the §3.5 "top-
// level target() step" introduced — three consumers (clickHand, the castable
// highlight, the trigger prompt) each drifted and broke when they hand-rolled
// the "does this need a target" check. They all route through these now; this
// test pins the API across every targeting shape so it can't silently regress.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let iid = 5000;
function mkCreature(controller, props) {
  return Object.assign({
    iid: iid++, tplId: '_d', name: 'Dummy', type: 'Creature', controller, owner: controller,
    color: 'W', colors: ['W'], power: 2, toughness: 2, tapped: false, sick: false, damage: 0,
    tempPower: 0, tempTou: 0, permPower: 0, permTou: 0, keywords: [], damagedBySources: new Set(),
  }, props || {});
}
function game() {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}

console.log('=== objectNeedsTarget recognizes all three shapes (+ none) ===');
(() => {
  check('top-level target() step', ENGINE.objectNeedsTarget({ target: 'creature', effects: [{ kind: 'affect_creature' }] }));
  check('ability-level target_slots', ENGINE.objectNeedsTarget({ target_slots: [{ target: 'creature' }], effects: [{ kind: 'apply_in_game_splice' }] }));
  check('legacy per-effect target', ENGINE.objectNeedsTarget({ effects: [{ kind: 'damage', target: 'creature', amount: 2 }] }));
  check('untargeted → false', !ENGINE.objectNeedsTarget({ effects: [{ kind: 'create_tokens', count: 1 }] }));
  check('self-only effect → false', !ENGINE.objectNeedsTarget({ effects: [{ kind: 'gain_life', scope: 'self', amount: 3 }] }));
  check('modal (effects.modes, not an array) → false (handled separately by UI)',
    !ENGINE.objectNeedsTarget({ effects: { modes: [[{ kind: 'damage', target: 'creature' }]] } }));
})();

console.log('\n=== primaryLegalTargets resolves per shape (+ honors target_filter / hexproof) ===');
(() => {
  const G = game();
  G.opp.battlefield.push(mkCreature('opp', { color: 'W', colors: ['W'] }));     // white
  G.opp.battlefield.push(mkCreature('opp', { color: 'B', colors: ['B'] }));     // black
  // top-level creature → both creatures
  check('top-level creature → 2 targets', ENGINE.primaryLegalTargets({ target: 'creature' }, 'you').length === 2);
  // target_filter not_color:B → only the white one
  check('target_filter (not_color B) excludes the black creature',
    ENGINE.primaryLegalTargets({ target: 'creature', target_filter: { not_color: 'B' } }, 'you').length === 1);
  // hexproof opp creature excluded
  G.opp.battlefield.push(mkCreature('opp', { color: 'R', colors: ['R'], keywords: ['hexproof'] }));
  check('hexproof opp creature excluded from a top-level creature filter',
    ENGINE.primaryLegalTargets({ target: 'creature' }, 'you').length === 2);
})();

console.log('\n=== probeTargetsForObject builds a legality stand-in (null when no legal target) ===');
(() => {
  const G = game();
  G.opp.battlefield.push(mkCreature('opp', { color: 'W', colors: ['W'] }));
  const top = ENGINE.probeTargetsForObject({ target: 'creature' }, 'you');
  check('top-level → a 1-element targets array', Array.isArray(top) && top.length === 1 && top[0].kind === 'creature');
  // target_slots needing TWO targets, but only one creature on board → can't fill slot 2 → null
  const twoSlot = ENGINE.probeTargetsForObject(
    { target_slots: [{ target: 'creature' }, { target: 'creature', filter: { tapped: true } }] }, 'you');
  // (the lone creature is untapped, so slot 2 (tapped) has no legal target)
  check('target_slots with an unfillable slot → null', twoSlot === null);
  // empty board, top-level creature → null
  G.opp.battlefield.length = 0;
  check('no legal target → null', ENGINE.probeTargetsForObject({ target: 'creature' }, 'you') === null);
})();

console.log('\n=== all three consumers agree (one source of truth) ===');
(() => {
  // A migrated single-target spell: objectNeedsTarget(card) must be true, and the
  // castable highlight (canPlayFromUI) must agree it is castable with a target.
  const G = game();
  G.opp.battlefield.push(mkCreature('opp', { color: 'W', colors: ['W'] }));
  const bolt = Object.assign(JSON.parse(JSON.stringify(CARDS.bolt)),
    { iid: iid++, tplId: 'bolt', controller: 'you', owner: 'you' });
  G.you.hand.push(bolt);
  check('objectNeedsTarget(bolt) is true (top-level step)', ENGINE.objectNeedsTarget(bolt));
  check('canPlayFromUI agrees bolt is castable', canPlayFromUI('you', bolt));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
