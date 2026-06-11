// Audit A4-9 — non-combat trample scope (design ruling, option A):
//
//   - SPELL effect damage from a trample source still spills the excess to
//     the damaged creature's controller (deliberate design — trample
//     stickers are offered to damaging sorceries and only do anything via
//     this branch). PINNED here; previously you could delete the whole spill
//     and the suite stayed green.
//   - FIGHT damage does NOT spill: a fight is two creatures dealing power
//     damage to each other (the fight cards' own text), not a trampling
//     attack — the fight handler's intent comment lists deathtouch/lifelink
//     and deliberately omits trample. Canon §902.2 defines trample for
//     combat; the fight-path spill was collateral from the shared
//     applyDamageFrom plumbing.
//   - Deathtouch DOES ride fight damage (victim-mark) — also previously
//     unfenced (mutation-dark).

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
  // A damaging sorcery wearing the trample sticker (the live design route).
  const spell = { name: 'Trample Bolt', keywords: ['trample'] };
  const ctx = { controller: 'you', sourceName: 'Trample Bolt', sourceIid: null, sourceCard: spell };
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 5 }, { kind: 'creature', iid: raider.iid });
  check('creature takes only lethal (1 for the 2/1)', raider.damage === 1, 'damage=' + raider.damage);
  check('excess 4 spills to the creature\'s controller (deliberate design)',
    G.opp.life === 16, 'opp life=' + G.opp.life);
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
