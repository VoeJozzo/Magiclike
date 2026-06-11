// Audit A4-8 + A4-14 — targeting-layer filter holes:
//
//   A4-8: getValidTargets silently DROPPED the optional `target_filter`
//         restriction for the creature_or_player and spell kinds (while the
//         function's own header and PROTOCOL §3.5 claimed it was honored).
//         Latent — no shipped card pairs a restriction with those kinds —
//         but "deal 3 to any target with flying" would have shipped silently
//         unrestricted. Now: the creature HALF of creature_or_player is
//         filtered (players are always legal — matchFilter's vocabulary is
//         card axes); the spell arm filters through matchFilterSpell (spell
//         axes: spliceable_*/not_token). player/opp + target_filter is
//         boot-rejected (see test_a4_validation_guards).
//   A4-14: getStats ↔ matchFilter mutual recursion — a stat-bounded filter
//         (max/min power/toughness) inside a lord's static_buff re-entered
//         getStats per lord and hard-crashed with RangeError. Lord-buff
//         evaluation now goes through a stats-free view (the four bound axes
//         are skipped until stat-bounded lord buffs are designed; boot
//         validation rejects them loudly).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9700;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['U'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.stack = []; G.gameOver = false;
  return G;
}

console.log('=== A4-8: creature_or_player honors target_filter on the creature half ===');
(() => {
  const G = newGame();
  const raider = mk('goblin_raider', 'opp');  // Goblin Warrior
  G.opp.battlefield.push(raider);
  const noMatch = ENGINE.targetsForFilter('creature_or_player', 'you', { subtype: 'Dragon' });
  check('non-matching creature is EXCLUDED (was: silently offered)',
    !noMatch.some(t => t.iid === raider.iid),
    JSON.stringify(noMatch.map(t => t.label)));
  check('both players remain legal (card axes never exclude players)',
    noMatch.filter(t => t.kind === 'player').length === 2);
  const match = ENGINE.targetsForFilter('creature_or_player', 'you', { subtype: 'Goblin' });
  check('matching creature IS offered', match.some(t => t.iid === raider.iid));
  const unrestricted = ENGINE.targetsForFilter('creature_or_player', 'you');
  check('no restriction → creature offered (unchanged)',
    unrestricted.some(t => t.iid === raider.iid));
})();

console.log('\n=== A4-8: the spell arm honors target_filter (matchFilterSpell axes) ===');
(() => {
  const G = newGame();
  const tokSpell = { name: 'Token Copy', tplId: 'lightning_bolt', isToken: true, iid: nextIid++ };
  const realSpell = mk('lightning_bolt', 'opp');
  const itemTok = { kind: 'spell', card: tokSpell, controller: 'opp', targets: [] };
  const itemReal = { kind: 'spell', card: realSpell, controller: 'opp', targets: [] };
  G.stack.push(itemTok, itemReal);
  const filtered = ENGINE.targetsForFilter('spell', 'you', { not_token: true });
  check('not_token excludes the token spell (was: silently offered)',
    !filtered.some(t => t.stackItem === itemTok),
    JSON.stringify(filtered.map(t => t.label)));
  check('the real spell stays targetable', filtered.some(t => t.stackItem === itemReal));
  const unrestricted = ENGINE.targetsForFilter('spell', 'you');
  check('no restriction → both spells offered (unchanged)', unrestricted.length === 2);
})();

console.log('\n=== A4-14: a stat-bounded lord static_buff must not stack-overflow ===');
(() => {
  const G = newGame();
  // The exact shape the A2-1 builder hit: an ordinary-looking card.json edit —
  // "creatures with power 2 or less get +1/+1" — closing the
  // getStats → lordBuffApplies → matchFilter → getStats cycle.
  const lord = mk('gray_ogre', 'you');
  lord.static_buffs = [{ power: 1, toughness: 1, filter: { max_power: 2 } }];
  const cub = mk('bear_cub', 'you');   // 1/1
  G.you.battlefield.push(lord, cub);
  let threw = null, stats = null;
  try { stats = ENGINE.getStats(cub); } catch (e) { threw = e; }
  check('getStats does not crash (was: RangeError stack overflow)', threw === null,
    threw && threw.constructor && threw.constructor.name);
  check('buff applies through the stats-free view (1/1 → 2/2)',
    !!stats && stats[0] === 2 && stats[1] === 2, JSON.stringify(stats));

  // Second crash entry point: the keyword half fires from emit() pre-trigger.
  lord.static_buffs = [{ keywords: ['haste'], filter: { max_power: 2 } }];
  let threw2 = null;
  try { ENGINE.applyStaticKeywordGrants(); } catch (e) { threw2 = e; }
  check('applyStaticKeywordGrants does not crash', threw2 === null,
    threw2 && threw2.constructor && threw2.constructor.name);
  check('keyword grant landed through the stats-free view', cub.keywords.includes('haste'));
})();

console.log('\n=== A4-14 control: non-stat lord filters unchanged ===');
(() => {
  const G = newGame();
  const lord = mk('gray_ogre', 'you');
  lord.static_buffs = [{ power: 2, toughness: 2, filter: { controller: 'self' }, subtype: 'Bear' }];
  const cub = mk('bear_cub', 'you');       // Bear 1/1 → buffed
  const raider = mk('goblin_raider', 'you'); // not a Bear → unbuffed
  G.you.battlefield.push(lord, cub, raider);
  check('subtype-gated lord buff still applies', ENGINE.getStats(cub)[0] === 3);
  check('non-matching creature unbuffed', ENGINE.getStats(raider)[0] === 2);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
