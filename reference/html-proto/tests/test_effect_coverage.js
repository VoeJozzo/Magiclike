// §7b coverage assertion (plan-effects-refactor §8.1 + §12.12): every kind in
// the EFFECTS dispatch table must be CLASSIFIED for AI valuation (a real scoring
// branch, or consciously unscored) and must have card-text (a describeEffect
// case, or be a documented idiom-only kind). This converts the "stringly-typed
// consumer drifted out of sync with HANDLERS" silent-regression class into a
// caught-at-boot failure. The §12.12 regression proves the net actually fires:
// a throwaway HANDLERS kind with no valuation/text is flagged.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== the live dispatch table is fully covered ===');
(() => {
  const cov = ENGINE.effectCoverageReport();
  check('no kind is unclassified for valuation', cov.unclassifiedValuation.length === 0,
    cov.unclassifiedValuation.join(','));
  check('no stale entry in the valuation sets (a removed handler left behind)',
    cov.staleValuation.length === 0, cov.staleValuation.join(','));
  check('no kind renders the "[kind]" card-text sentinel', cov.missingText.length === 0,
    cov.missingText.join(','));
  check('no kind is unclassified for the AI cast scorer', cov.unclassifiedCastScoring.length === 0,
    cov.unclassifiedCastScoring.join(','));
  check('no stale entry in the cast-scoring sets', cov.staleCastScoring.length === 0,
    cov.staleCastScoring.join(','));
})();

console.log('\n=== both partitions are exhaustive + disjoint over EFFECTS ===');
(() => {
  const kinds = new Set(Object.keys(ENGINE.EFFECTS));
  const partition = (label, a, b) => {
    const overlap = [...a].filter(k => b.has(k));
    check(label + ': sets disjoint', overlap.length === 0, overlap.join(','));
    const union = new Set([...a, ...b]);
    const uncovered = [...kinds].filter(k => !union.has(k));
    const extra = [...union].filter(k => !kinds.has(k));
    check(label + ': union = EFFECTS keys (exhaustive)', uncovered.length === 0 && extra.length === 0,
      'uncovered=[' + uncovered.join(',') + '] extra=[' + extra.join(',') + ']');
  };
  partition('valuation', AI.VALUED_EFFECT_KINDS, AI.UNVALUED_EFFECT_KINDS);
  partition('cast-scoring', TARGET_SCORED_KINDS, NOT_TARGET_SCORED_KINDS);
})();

console.log('\n=== §12.12 regression: an unhandled HANDLERS kind is CAUGHT ===');
(() => {
  const EFFECTS = ENGINE.EFFECTS;
  const FAKE = '__coverage_probe_kind__';
  EFFECTS[FAKE] = function () {};   // register a throwaway handler, no valuation/text
  try {
    const cov = ENGINE.effectCoverageReport();
    check('unclassified valuation flags the fake kind', cov.unclassifiedValuation.includes(FAKE),
      cov.unclassifiedValuation.join(','));
    check('missing card-text flags the fake kind', cov.missingText.includes(FAKE),
      cov.missingText.join(','));
    check('unclassified cast-scoring flags the fake kind', cov.unclassifiedCastScoring.includes(FAKE),
      cov.unclassifiedCastScoring.join(','));
  } finally {
    delete EFFECTS[FAKE];   // restore — don't leak into later test files
  }
  // Sanity: removing it restores a clean report.
  const after = ENGINE.effectCoverageReport();
  check('report is clean again after removing the probe',
    after.unclassifiedValuation.length === 0 && after.missingText.length === 0
      && after.unclassifiedCastScoring.length === 0);
})();

console.log('\n=== a stale valuation entry (registered kind with no handler) is CAUGHT ===');
(() => {
  const valued = AI.VALUED_EFFECT_KINDS;
  const GHOST = '__ghost_removed_handler__';
  valued.add(GHOST);   // simulate: handler deleted but its registration left behind
  try {
    const cov = ENGINE.effectCoverageReport();
    check('stale valuation entry is reported', cov.staleValuation.includes(GHOST), cov.staleValuation.join(','));
  } finally {
    valued.delete(GHOST);
  }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
