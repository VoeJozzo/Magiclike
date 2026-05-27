// §3.5 browser targeting (controller/render UI): the targeting migration moved
// single-target spells/abilities to a top-level target() step. The human cast
// flow must enter target-picking for those — clickHand/ability previously only
// checked per-effect eff.target, so 38 migrated cards would have cast with no
// target. Drives the real CONTROLLER click handlers (DOM stubbed by _setup).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nid = 9000;
function mk(t, c) {
  const i = JSON.parse(JSON.stringify(CARDS[t]));
  return Object.assign(i, { iid: nid++, tplId: t, controller: c, owner: c, tapped: false, sick: false,
    damage: 0, tempPower: 0, tempTou: 0, permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (i.keywords || []).slice() });
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
const TOUGH = Object.keys(CARDS).find(id => CARDS[id].type === 'Creature' && (CARDS[id].toughness || 0) >= 4 && !CARDS[id].special);
const VANILLA = Object.keys(CARDS).find(id => CARDS[id].type === 'Creature' && !CARDS[id].target
  && !(CARDS[id].triggers || []).length && !(CARDS[id].abilities || []).length && !CARDS[id].special);

console.log('=== top-level target() spell enters targeting, then casts on a creature ===');
(() => {
  const G = game();
  const victim = mk(TOUGH, 'opp'); G.opp.battlefield.push(victim);
  const bolt = mk('bolt', 'you'); G.you.hand.push(bolt);
  check('bolt has a top-level target() step (migrated)', CARDS.bolt.target === 'creature_or_player');
  CONTROLLER.clickHand(bolt.iid);
  check('clickHand entered target-picking (did NOT cast targetlessly)', !!CONTROLLER.pendingTarget());
  check('bolt still in hand awaiting a target', G.you.hand.some(c => c.iid === bolt.iid));
  CONTROLLER.clickBattlefield(victim.iid);
  check('clicking the creature cast bolt at it (3 damage)', victim.damage === 3, 'damage=' + victim.damage);
  check('bolt left hand after resolving', !G.you.hand.some(c => c.iid === bolt.iid));
  check('targeting mode cleared', !CONTROLLER.pendingTarget());
})();

console.log('\n=== the same spell can target a player (face click) ===');
(() => {
  const G = game();
  const bolt = mk('bolt', 'you'); G.you.hand.push(bolt);
  const life0 = G.opp.life;
  CONTROLLER.clickHand(bolt.iid);
  check('entered target-picking', !!CONTROLLER.pendingTarget());
  CONTROLLER.clickPlayerTarget('opp');
  check('clicking the opponent face cast bolt at them (3 damage)', G.opp.life === life0 - 3, life0 + '→' + G.opp.life);
})();

console.log('\n=== getValidTargets accepts the taxonomy spelling (drives the player-target button) ===');
(() => {
  // render.js shows the "→ Target <player>" button when getValidTargets(eff)
  // lists a player target. Before the §3.5 sweep getValidTargets only knew the
  // legacy "any"; the canonical "creature_or_player" returned [] → no button →
  // "any target" spells couldn't hit a face. Lock the enumeration both ways.
  game();
  const anyT = ENGINE.getValidTargets({ target: 'creature_or_player' }, 'you');
  check('creature_or_player includes YOUR face', anyT.some(v => v.kind === 'player' && v.who === 'you'));
  check('creature_or_player includes the OPP face', anyT.some(v => v.kind === 'player' && v.who === 'opp'));
  const oppT = ENGINE.getValidTargets({ target: 'opp' }, 'you');
  check('opp lists ONLY the opponent face', oppT.length === 1 && oppT[0].kind === 'player' && oppT[0].who === 'opp');
  const crT = ENGINE.getValidTargets({ target: 'creature' }, 'you');
  check('creature lists NO player face (no button)', !crT.some(v => v.kind === 'player'));
})();

console.log('\n=== an untargeted spell still casts immediately (no false targeting) ===');
(() => {
  const G = game();
  const cr = mk(VANILLA, 'you'); G.you.hand.push(cr);
  CONTROLLER.clickHand(cr.iid);
  check('no targeting mode for an untargeted card', !CONTROLLER.pendingTarget());
  check('untargeted card resolved immediately (left hand)', !G.you.hand.some(c => c.iid === cr.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
