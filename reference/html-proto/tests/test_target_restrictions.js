// Top-level target() restrictions (v2 targeting): the closed taxonomy now
// carries an optional `target_filter` so cards like Doom Blade ("non-black
// creature"), Ravenous Plague ("toughness 3 or less"), Smite ("tapped"), and
// Vine Strangle ("flying creature an opponent controls") express their
// restriction on the unified target() step instead of a per-effect filter.
// This proves the restriction is ENFORCED at cast legality + highlights, not
// just rendered in text.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 6000;
function mkCreature(controller, props) {
  return Object.assign({
    iid: nextIid++, tplId: '_dummy', name: 'Dummy', types: ['Creature'],
    controller, owner: controller, color: 'W', colors: ['W'], power: 2, toughness: 2,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0, permPower: 0, permTou: 0,
    keywords: [], damagedBySources: new Set(),
  }, props || {});
}
function newGame() {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
let castIid = 6500;
function mkSpell(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, { iid: castIid++, tplId, controller, owner: controller });
}
function canCast(G, tplId, targetCreature) {
  const spell = mkSpell(tplId, 'you'); G.you.hand.push(spell);
  return ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: targetCreature.iid, label: targetCreature.name }] });
}

console.log('=== Doom Blade: target_filter not_color B — cannot hit a black creature ===');
(() => {
  const G = newGame();
  const black = mkCreature('opp', { color: 'B', colors: ['B'] });
  const white = mkCreature('opp', { color: 'W', colors: ['W'] });
  G.opp.battlefield.push(black, white);
  check('CARDS.doom_blade migrated to target+target_filter',
    CARDS.doom_blade.target === 'creature' && CARDS.doom_blade.target_filter && CARDS.doom_blade.target_filter.not_color === 'B');
  check('illegal vs a black creature', !canCast(G, 'doom_blade', black));
  check('legal vs a non-black creature', canCast(G, 'doom_blade', white));
})();

console.log('\n=== Ravenous Plague: max_tough 3 — cannot hit a fat creature ===');
(() => {
  const G = newGame();
  const small = mkCreature('opp', { toughness: 3 });
  const fat = mkCreature('opp', { toughness: 5 });
  G.opp.battlefield.push(small, fat);
  check('legal vs toughness 3', canCast(G, 'ravenous_plague', small));
  check('illegal vs toughness 5', !canCast(G, 'ravenous_plague', fat));
})();

console.log('\n=== Smite: tapped only ===');
(() => {
  const G = newGame();
  const tapped = mkCreature('opp', { tapped: true });
  const untapped = mkCreature('opp', { tapped: false });
  G.opp.battlefield.push(tapped, untapped);
  check('legal vs a tapped creature', canCast(G, 'smite_the_wicked', tapped));
  check('illegal vs an untapped creature', !canCast(G, 'smite_the_wicked', untapped));
})();

console.log('\n=== Vine Strangle: opp_creature + flying ===');
(() => {
  const G = newGame();
  const oppFlyer = mkCreature('opp', { keywords: ['flying'] });
  const oppGround = mkCreature('opp', { keywords: [] });
  const yourFlyer = mkCreature('you', { keywords: ['flying'] });
  G.opp.battlefield.push(oppFlyer, oppGround);
  G.you.battlefield.push(yourFlyer);
  check('legal vs an opp flyer', canCast(G, 'vine_strangle', oppFlyer));
  check('illegal vs an opp non-flyer', !canCast(G, 'vine_strangle', oppGround));
  check('illegal vs YOUR flyer (opp_creature excludes your side)', !canCast(G, 'vine_strangle', yourFlyer));
})();

console.log('\n=== highlight path honors the restriction (render isValidTargetCreature) ===');
(() => {
  // doomBlade's pending step: render must NOT mark a black creature targetable.
  const G = newGame();
  const black = mkCreature('opp', { color: 'B', colors: ['B'] });
  const white = mkCreature('opp', { color: 'W', colors: ['W'] });
  const eff = { target: 'creature', filter: { not_color: 'B' } };
  check('highlight rejects black creature', !isValidTargetCreature(eff, black));
  check('highlight accepts non-black creature', isValidTargetCreature(eff, white));
  const oppEff = { target: 'opp_creature', filter: { has_keyword: 'flying' } };
  const yourFlyer = mkCreature('you', { keywords: ['flying'] });
  const oppFlyer = mkCreature('opp', { keywords: ['flying'] });
  check('highlight rejects your own creature for opp_creature', !isValidTargetCreature(oppEff, yourFlyer));
  check('highlight accepts opp flyer', isValidTargetCreature(oppEff, oppFlyer));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
