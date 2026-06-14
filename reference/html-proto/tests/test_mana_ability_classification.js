// PR #133 follow-up — mana-ability classification is keyed on TARGETING, not
// effect-purity, and is crash-safe on a malformed (empty-effects) ability.
//
// Background: doActivateAbility / isLegalAction / getLegalActions previously
// decided "is this a mana ability?" via `ab.effects[0].kind === 'add_mana'`,
// which (a) threw a TypeError on an empty effects[] and (b) mis-classified a
// TARGETED hybrid ("T: add G, +1/+1 target creature") as a pure mana ability —
// silently dropping the rider on the tap-lane and letting the auto-payer fire it
// involuntarily. The unified isManaAbility(ab) helper now requires: produces mana
// (leading add_mana) AND requires no target (objectNeedsTarget) AND has a trivial
// (tap-only) cost. An UNtargeted rider ("T: add G, gain 1 life") STAYS a mana
// ability (Joe's ruling — only targeting disqualifies, not a side effect).
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
    // Inject a battlefield permanent carrying a malformed (empty-effects)
    // activated ability — the exact shape that used to crash the effects[0] deref
    // in getLegalActions' activated-ability lane.
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

console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
if (fail > 0) process.exit(1);
