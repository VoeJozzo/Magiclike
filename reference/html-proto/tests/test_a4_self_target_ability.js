// scope:'self' on an ability effect resolves to the SOURCE CREATURE for
// creature-operating effects (pump, add_type, ...) and to the SOURCE'S
// CONTROLLER for player-operating effects (damage, gain_life, draw, ...).
// add_type/set_types are in CREATURE_EFFECT_KINDS: artifice_triumphant's
// `add_type scope:'self'` ability must stay creature-routed.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9500;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    typeGrants: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.life = 20; G.opp.life = 20;
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}

console.log('=== A4-13: ability damage scope:self routes to the CONTROLLER ===');
(() => {
  const G = newGame();
  const ogre = mk('gray_ogre', 'you');   // 2/2 vanilla
  ogre.abilities = [{ cost: { tap: true },
    effects: [{ kind: 'damage', amount: 1, scope: 'self' }] }];
  G.you.battlefield.push(ogre);
  const ok = ENGINE.executeAction('you',
    { type: 'activateAbility', cardIid: ogre.iid, abilityIdx: 0, targets: [] });
  check('ability activation executed', ok === true);
  check('the CONTROLLER lost 1 life ("deal 1 to you")', G.you.life === 19,
    'you life=' + G.you.life);
  check('the source creature took NO damage', ogre.damage === 0,
    'damage=' + ogre.damage);
})();

console.log('\n=== trap pin: ability add_type scope:self stays CREATURE-routed ===');
(() => {
  const G = newGame();
  const ogre = mk('gray_ogre', 'you');
  ogre.abilities = [{ cost: { tap: true },
    effects: [{ kind: 'add_type', types: ['Artifact'], scope: 'self' }] }];
  G.you.battlefield.push(ogre);
  const ok = ENGINE.executeAction('you',
    { type: 'activateAbility', cardIid: ogre.iid, abilityIdx: 0, targets: [] });
  check('ability activation executed', ok === true);
  check('the source creature gained the type (artifice_triumphant shape)',
    hasType(ogre, 'Artifact'));
})();

console.log('\n=== control: creature-operating self (pump) unchanged ===');
(() => {
  const G = newGame();
  const ogre = mk('gray_ogre', 'you');
  ogre.abilities = [{ cost: { tap: true },
    effects: [{ kind: 'pump', power: 1, toughness: 1, scope: 'self' }] }];
  G.you.battlefield.push(ogre);
  ENGINE.executeAction('you',
    { type: 'activateAbility', cardIid: ogre.iid, abilityIdx: 0, targets: [] });
  check('self-pump still lands on the creature', ogre.tempPower === 1 && ogre.tempTou === 1,
    ogre.tempPower + '/' + ogre.tempTou);
  check('controller life untouched', G.you.life === 20);
})();

console.log('\n=== control: trigger + spell self forks unchanged (shared helper) ===');
(() => {
  // effectOperatesOnCreature is not exported, so this asserts through the
  // shared gain_life route: an ability's gain_life scope:'self' must hit
  // the controller, same as patient_saint's own tap ability.
  const G = newGame();
  const saint = mk('gray_ogre', 'you');
  saint.abilities = [{ cost: { tap: true },
    effects: [{ kind: 'gain_life', amount: 2, scope: 'self' }] }];
  G.you.battlefield.push(saint);
  ENGINE.executeAction('you',
    { type: 'activateAbility', cardIid: saint.iid, abilityIdx: 0, targets: [] });
  check('ability gain_life scope:self heals the controller', G.you.life === 22,
    'life=' + G.you.life);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
