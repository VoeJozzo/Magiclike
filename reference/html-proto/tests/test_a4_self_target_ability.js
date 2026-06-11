// Audit A4-13 — doActivateAbility's scope:'self' branch lacked the
// creature-vs-player fork BOTH sibling resolvers carry (the v0.99.29 Final
// Strike bug class, fixed in the spell + trigger loops, missed in the third
// hand-synced copy): 'self' means the SOURCE CREATURE for creature-operating
// effects and the SOURCE'S CONTROLLER for player-operating ones (damage =
// "you lose N", gain_life, draw, ...). The ability copy routed EVERY self to
// the creature, so the first "T: deal 1 to you" ability would silently burn
// the creature instead.
//
// Fix: one shared resolveSelfTarget() helper consumed by all three loops,
// and add_type/set_types added to CREATURE_EFFECT_KINDS (the fix-design trap
// the verifier flagged: artifice_triumphant grants an `add_type scope:'self'`
// ability that must STAY creature-routed).

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
  G.stack = []; G.gameOver = false;
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.priority = { passes: new Set() };
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
  // The trigger resolver already had the fork — patient_saint-style gain_life
  // self → controller. Drive it through the trigger effects runner shape via
  // a direct applyEffect equivalence check: effectOperatesOnCreature is not
  // exported, so we assert through the gain_life route that the LOOPS share:
  // a gain_life scope:'self' in an ability must hit the controller.
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
