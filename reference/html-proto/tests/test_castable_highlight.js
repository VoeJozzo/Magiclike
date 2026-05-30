// Castable-card highlight (render canPlayFromUI). The §3.5 targeting migration
// moved single-target spells to a top-level target() step with bare effects, but
// canPlayFromUI still only checked per-effect targets (effectNeedsTarget) — so it
// probed a target-LESS cast for every migrated spell, isLegalAction rejected it,
// and the card never got the .castable glow. (Same class as the clickHand and
// trigger-prompt bugs.) This locks: migrated single-target spells highlight when
// castable, and the gates (mana, no-legal-target, target_filter) still apply.

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
    iid: iid++, tplId: '_dummy', name: 'Dummy', type: 'Creature', controller, owner: controller,
    color: 'W', colors: ['W'], power: 2, toughness: 2, tapped: false, sick: false, damage: 0,
    tempPower: 0, tempTou: 0, permPower: 0, permTou: 0, keywords: [], damagedBySources: new Set(),
  }, props || {});
}
function mk(t, c) {
  return Object.assign(JSON.parse(JSON.stringify(CARDS[t])), {
    iid: iid++, tplId: t, controller: c, owner: c, tapped: false, sick: false,
    damage: 0, keywords: (CARDS[t].keywords || []).slice(), damagedBySources: new Set(),
  });
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
function inHand(G, tpl) { const c = mk(tpl, 'you'); G.you.hand.push(c); return c; }

console.log('=== migrated single-target spells highlight as castable ===');
(() => {
  const G = game();
  G.opp.battlefield.push(mkCreature('opp', { color: 'W', colors: ['W'] }));   // a non-black creature
  for (const t of ['lightning_bolt', 'doom_blade', 'murder', 'swords_to_plowshares', 'mind_control']) {
    check(t + ' is castable-highlighted', canPlayFromUI('you', inHand(G, t)));
  }
})();

console.log('\n=== gates still apply (no false highlight) ===');
(() => {
  const G = game();
  G.opp.battlefield.push(mkCreature('opp', { color: 'W', colors: ['W'] }));
  // No mana → not castable.
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  check('doomBlade NOT highlighted with no mana', !canPlayFromUI('you', inHand(G, 'doom_blade')));
})();
(() => {
  const G = game();
  // Only a BLACK creature on board → Doom Blade (non-black) has no legal target.
  G.opp.battlefield.push(mkCreature('opp', { color: 'B', colors: ['B'] }));
  check('doomBlade NOT highlighted when only a black creature exists (target_filter)',
    !canPlayFromUI('you', inHand(G, 'doom_blade')));
})();
(() => {
  const G = game();
  // Empty board → a creature-only removal spell has no legal target.
  check('terror NOT highlighted with no creatures on board', !canPlayFromUI('you', inHand(G, 'murder')));
})();

console.log('\n=== restricted target highlights only when a legal target exists ===');
(() => {
  const G = game();
  // Vine Strangle: opp creature WITH flying.
  G.opp.battlefield.push(mkCreature('opp', { keywords: [] }));            // ground only
  check('vinestrangle NOT highlighted vs a ground opp creature', !canPlayFromUI('you', inHand(G, 'vine_strangle')));
  G.opp.battlefield.push(mkCreature('opp', { keywords: ['flying'] }));    // now a flyer exists
  check('vinestrangle highlighted once an opp flyer exists', canPlayFromUI('you', inHand(G, 'vine_strangle')));
})();

console.log('\n=== untargeted + land still work ===');
(() => {
  const G = game();
  const land = mk('plains', 'you'); G.you.hand.push(land);
  check('a land highlights as playable', canPlayFromUI('you', land));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
