// isManaAbility(ab) is keyed on targeting, not effect purity or cost, and
// must not throw on a malformed (empty-effects) ability. It requires:
// produces mana (leading add_mana) AND no target (objectNeedsTarget). An
// untargeted rider ("T: add G, gain 1 life") stays a mana ability — only
// targeting disqualifies it, not cost or a side effect (Joe's ruling).
const setup = require('./_setup');
setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  '+(ok?'PASS':'FAIL')+': '+label+(info?' -- '+info:'')); if(ok)pass++;else fail++; }

const M = (effects, extra) => Object.assign({ cost: { tap: true }, effects }, extra || {});

console.log('=== isManaAbility: targeting is the discriminator, not effect-purity ===');
check('pure mana (T: add) IS a mana ability',
  ENGINE.isManaAbility(M([{ kind: 'add_mana', choose: ['G'] }])) === true);
check('untargeted rider (T: add, gain 1 life) STAYS a mana ability',
  ENGINE.isManaAbility(M([{ kind: 'add_mana', choose: ['G'] }, { kind: 'gain_life', amount: 1 }])) === true);
check('targeted hybrid (T: add, +1/+1 target creature) is NOT a mana ability',
  ENGINE.isManaAbility(M([{ kind: 'add_mana', choose: ['G'] }, { kind: 'pump', target: 'creature', power: 1, toughness: 1 }])) === false);
check('top-level target on the ability disqualifies it',
  ENGINE.isManaAbility(M([{ kind: 'add_mana', choose: ['G'] }], { target: 'creature' })) === false);

console.log('\n=== isManaAbility: malformed / non-mana inputs are safe (#4 — no crash) ===');
check('empty effects[] is not a mana ability',
  ENGINE.isManaAbility(M([])) === false);
check('missing effects is not a mana ability',
  ENGINE.isManaAbility({ cost: { tap: true } }) === false);
check('null ability is not a mana ability',
  ENGINE.isManaAbility(null) === false);
check('non-mana ability (T: draw) is not a mana ability',
  ENGINE.isManaAbility(M([{ kind: 'draw', amount: 1 }])) === false);

console.log('\n=== isManaAbility: cost is a SEPARATE axis (a costly mana ability is still off-stack) ===');
// Cost-triviality gates only the AUTO-PAYER (isAutoUsableManaAbility); the
// closed-window-drain contract (test_trigger_closed_window_drain.js) relies
// on a costly mana ability still resolving off-stack.
check('non-tap extra cost does NOT disqualify (still a mana ability)',
  ENGINE.isManaAbility(M([{ kind: 'add_mana', choose: ['G'] }], { cost: { tap: true, R: 1 } })) === true);

console.log('\n=== getLegalActions does not throw on a permanent with an empty-effects ability (#4) ===');
(() => {
  let threw = null;
  try {
    RUN.clearSave && RUN.clearSave();
    RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
    RUN.startNextGame();
    const G = ENGINE.state();
    const who = G.activePlayer;
    // The activated-ability lane derefs effects[0] — the crash site for an
    // empty-effects ability.
    const c = ENGINE.makeCard('plains');
    c.abilities = [{ cost: { tap: true }, effects: [] }];
    c.tapped = false;
    c.summoningSick = false;
    G[who].battlefield.push(c);
    ENGINE.getLegalActions(who);
    ENGINE.getLegalActions(who === 'you' ? 'opp' : 'you');
  } catch (e) { threw = e; }
  check('getLegalActions enumerates without throwing on an empty-effects ability',
    threw === null, threw ? String(threw.message || threw) : '');
})();

console.log('\n=== tap-lane resolves through the shared path: color choice + untargeted rider ===');
// doTapLandForMana routes through runAbilityEffects — the same path as
// doActivateAbility.
(() => {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  const who = G.activePlayer;
  const lifeBefore = G[who].life;
  const c = ENGINE.makeCard('plains');
  c.types = ['Creature'];                 // a dork, so the tap lane applies
  c.abilities = [{ cost: { tap: true }, effects: [
    { kind: 'add_mana', choose: ['G'] },
    { kind: 'gain_life', amount: 1 },
  ] }];
  c.tapped = false; c.summoningSick = false; c.sick = false;
  G[who].battlefield.push(c);
  ENGINE.executeAction(who, { type: 'tapLandForMana', cardIid: c.iid, color: 'G' });
  check('chosen color threaded through the unified path ({G} added)', G[who].mana.G >= 1,
    'G=' + G[who].mana.G);
  check('untargeted rider resolved too (gain 1 life — dropped pre-consolidation)',
    G[who].life === lifeBefore + 1, 'life ' + lifeBefore + ' -> ' + G[who].life);
  RUN.clearSave && RUN.clearSave();
})();

console.log('\n=== UI/text consumers use the canonical targeting-aware classifier ===');
(() => {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = setup.startMainPhase('you');
  const creatureId = Object.keys(CARDS).find(id => hasType(CARDS[id], 'Creature') && !isUndraftable(CARDS[id]));
  const target = ENGINE.makeCard(creatureId);
  target.controller = 'opp'; target.owner = 'opp'; target.sick = false;
  G.opp.battlefield.push(target);

  const hybridLand = ENGINE.makeCard('plains');
  hybridLand.controller = 'you'; hybridLand.owner = 'you'; hybridLand.tapped = false;
  hybridLand.abilities = [M([{ kind: 'add_mana', amounts: { W: 1 } }], { target: 'opp_creature' })];
  G.you.battlefield.push(hybridLand);
  CONTROLLER.clickBattlefield(hybridLand.iid);
  const pending = CONTROLLER.pendingTarget();
  check('targeted mana-leading land enters normal ability targeting',
    pending && pending.kind === 'ability' && pending.cardIid === hybridLand.iid,
    pending && JSON.stringify(pending));
  CONTROLLER.cancelTarget();

  G.opp.battlefield = [];
  const hybridCreature = ENGINE.makeCard(creatureId);
  hybridCreature.controller = 'you'; hybridCreature.owner = 'you';
  hybridCreature.tapped = false; hybridCreature.sick = false;
  hybridCreature.abilities = [M([{ kind: 'add_mana', amounts: { W: 1 } }], { target: 'opp_creature' })];
  G.you.battlefield.push(hybridCreature);
  check('targeted mana-leading ability does not glow without a legal target',
    activationGlowAvailable(hybridCreature, 'you') === false);

  const textLand = ENGINE.makeCard('plains');
  textLand.abilities = [M([{ kind: 'add_mana', amounts: { W: 1 } }], { target: 'opp_creature' })];
  const text = describeCardText(textLand);
  check('targeted mana-leading land ability is not hidden as intrinsic land mana',
    /add \{W\}/i.test(text), text);
  RUN.clearSave && RUN.clearSave();
})();

console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
if (fail > 0) process.exit(1);
