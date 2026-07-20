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
// Cost-triviality gates only the AUTO-PAYER (isAutoUsableManaAbility), not what
// counts as a mana ability — a sacrifice/mana-cost mana ability still resolves
// off-stack and is legal any time its cost can be paid (this is the contract the
// closed-window-drain test relies on). Targeting, not cost, is the discriminator.
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
    // getLegalActions' activated-ability lane must not crash on an
    // empty-effects ability (the effects[0] deref case).
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
// doActivateAbility — so a {choose} color and an untargeted rider both
// resolve like any other mana ability.
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
    { kind: 'gain_life', amount: 1 },     // untargeted rider
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

console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
if (fail > 0) process.exit(1);
