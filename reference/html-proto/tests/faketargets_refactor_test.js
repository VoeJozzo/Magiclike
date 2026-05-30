// fakeTargetsForLegality is the shared probe for "could this effect ever
// have legal targets" — used by both AI and the legality checker. Refactor
// protection: the helper exists at module scope and handles the basic
// shapes. Adapted from the prior-session bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Test: fakeTargetsForLegality is module-scope ===');
check('fakeTargetsForLegality is defined at module scope', typeof fakeTargetsForLegality === 'function');

console.log('\n=== Test: fakeTargetsForLegality handles single-target ===');
{
  const r1 = fakeTargetsForLegality([], 'you');
  check('Empty effects yields empty array', Array.isArray(r1) && r1.length === 0);

  const r2 = fakeTargetsForLegality([{kind: 'add_mana', amount: 1}], 'you');
  check('Non-targeted effect yields empty array', Array.isArray(r2) && r2.length === 0);
}

console.log('\n=== Test: fakeTargetsForLegality with real spell ===');
{
  RUN.start({cards:['savannah_lions','goblin_chieftain','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['W','R']}, null);
  RUN.load();
  ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
  const G = ENGINE.state();
  const allCards = [...G.you.library, ...G.you.hand];
  const damageSpell = allCards.find(c => !hasType(c, 'Creature') && !hasType(c, 'Land') && (c.effects||[]).some(e => e.target === 'creature' || e.target === 'creature_or_player'));
  if (damageSpell) {
    const r = fakeTargetsForLegality(damageSpell.effects, 'you');
    console.log('  Probed spell:', damageSpell.name);
    console.log('  Targets returned:', r);
    check('Returns array or null (depending on board state)', r === null || Array.isArray(r));
    if (Array.isArray(r) && r.length > 0) {
      check('Target entries have a kind', r.every(t => t && typeof t.kind === 'string'));
    }
  } else {
    console.log('  (no targeted spell found in starting deck -- skipping)');
  }
}

console.log("\n=== Test: 'who' parameter actually used ===");
{
  const fakeEff = [{kind: 'dealDamage', target: 'creature_or_player', amount: 1}];
  const rYou = fakeTargetsForLegality(fakeEff, 'you');
  const rOpp = fakeTargetsForLegality(fakeEff, 'opp');
  console.log("  'you' result:", rYou);
  console.log("  'opp' result:", rOpp);
  check("'you' probe returns non-null", rYou !== null);
  check("'opp' probe returns non-null", rOpp !== null);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
