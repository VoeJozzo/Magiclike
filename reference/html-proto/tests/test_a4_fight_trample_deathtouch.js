// Design ruling — non-combat trample scope:
//
//   - Trample stickers are offered to damaging sorceries; this SPELL-damage
//     branch is the only place they do anything.
//   - FIGHT damage does NOT spill: a fight is two creatures dealing power
//     damage to each other (the fight cards' own text), not a trampling
//     attack — the fight handler's intent comment lists deathtouch/lifelink
//     and deliberately omits trample. Canon §902.2 defines trample for
//     combat.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9400;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    dealtDeathtouch: false,
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['G'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.life = 20; G.opp.life = 20;
  G.stack = []; G.gameOver = false;
  return G;
}

console.log('=== A4-9: a trampler that FIGHTS does not spill damage to the player ===');
(() => {
  const G = newGame();
  const titan = mk('forest_titan', 'you');     // 5/5 trample
  const raider = mk('goblin_raider', 'opp');   // 2/1
  check('forest_titan has trample', titan.keywords.includes('trample'));
  G.you.battlefield.push(titan); G.opp.battlefield.push(raider);
  const ctx = { controller: 'you', sourceName: 'Prey Upon', sourceIid: null,
    allTargets: [{ kind: 'creature', iid: titan.iid }, { kind: 'creature', iid: raider.iid }] };
  ENGINE.applyEffect(ctx, { kind: 'fight', operands: [{ slot: 0 }, { slot: 1 }] });
  check('fight dealt the titan\'s FULL power to the raider (no trample cap)',
    raider.damage === 5, 'damage=' + raider.damage);
  check('NO damage spilled to the defending player (fight is not combat)',
    G.opp.life === 20, 'opp life=' + G.opp.life);
  check('the raider hit back for its power', titan.damage === 2, 'damage=' + titan.damage);
})();

console.log('\n=== pinned design: SPELL effect damage from a trample source still spills ===');
(() => {
  const G = newGame();
  const raider = mk('goblin_raider', 'opp');   // 2/1
  G.opp.battlefield.push(raider);
  const spell = { name: 'Trample Bolt', keywords: ['trample'] };
  const ctx = { controller: 'you', sourceName: 'Trample Bolt', sourceIid: null, sourceCard: spell };
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 5 }, { kind: 'creature', iid: raider.iid });
  check('creature takes only lethal (1 for the 2/1)', raider.damage === 1, 'damage=' + raider.damage);
  check('excess 4 spills to the creature\'s controller (deliberate design)',
    G.opp.life === 16, 'opp life=' + G.opp.life);
})();

console.log('\n=== deathtouch plus trample effect damage assigns one before spilling ===');
(() => {
  const G = newGame();
  const giant = mk('hill_giant', 'opp');
  G.opp.battlefield.push(giant);
  const bolt = ENGINE.makeCard('lightning_bolt', ['kw_deathtouch', 'kw_trample']);
  check('stickered Lightning Bolt carries both damage keywords',
    bolt.keywords.includes('deathtouch') && bolt.keywords.includes('trample'));
  const ctx = { controller: 'you', sourceName: bolt.name, sourceIid: bolt.iid, sourceCard: bolt };
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 3 }, { kind: 'creature', iid: giant.iid });
  check('undamaged 3/3 receives one lethal deathtouch damage',
    giant.damage === 1 && giant.dealtDeathtouch === true,
    'damage=' + giant.damage + ', marked=' + giant.dealtDeathtouch);
  check('remaining two damage tramples to its controller',
    G.opp.life === 18, 'opp life=' + G.opp.life);
})();

console.log('\n=== deathtouch effect damage without trample still deals its full amount ===');
(() => {
  const G = newGame();
  const giant = mk('hill_giant', 'opp');
  G.opp.battlefield.push(giant);
  const bolt = ENGINE.makeCard('lightning_bolt', ['kw_deathtouch']);
  const ctx = { controller: 'you', sourceName: bolt.name, sourceIid: bolt.iid, sourceCard: bolt };
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 3 }, { kind: 'creature', iid: giant.iid });
  check('ordinary deathtouch effect assigns all three to the creature',
    giant.damage === 3 && giant.dealtDeathtouch === true,
    'damage=' + giant.damage + ', marked=' + giant.dealtDeathtouch);
  check('ordinary deathtouch effect does not spill to the controller',
    G.opp.life === 20, 'opp life=' + G.opp.life);
})();

console.log('\n=== A4-9 fence: deathtouch rides fight damage (victim-mark) ===');
(() => {
  const G = newGame();
  const viper = mk('venom_viper', 'you');      // 1/2 deathtouch
  const ogre = mk('gray_ogre', 'opp');         // 2/2
  check('venom_viper has deathtouch', viper.keywords.includes('deathtouch'));
  G.you.battlefield.push(viper); G.opp.battlefield.push(ogre);
  const ctx = { controller: 'you', sourceName: 'Prey Upon', sourceIid: null,
    allTargets: [{ kind: 'creature', iid: viper.iid }, { kind: 'creature', iid: ogre.iid }] };
  ENGINE.applyEffect(ctx, { kind: 'fight', operands: [{ slot: 0 }, { slot: 1 }] });
  check('ogre received deathtouch damage (lethal_marked for the SBA sweep)',
    ogre.dealtDeathtouch === true);
  check('ogre took the viper\'s 1 damage', ogre.damage === 1, 'damage=' + ogre.damage);
  check('viper took the ogre\'s 2 damage', viper.damage === 2, 'damage=' + viper.damage);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
