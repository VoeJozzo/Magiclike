// Golden test for the on-cast targeting migration (Slice 3 / effects-refactor
// §3.5, migrate-effects.js). Verifies the migrated pool: every top-level
// target() step is in the closed taxonomy, migrated on-cast effects are bare
// (no per-effect target), skipped cards kept their non-taxonomy filters, and a
// few representative cards have the exact expected shape.

const setup = require('./_setup');
setup.loadEngine();
RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
RUN.startNextGame();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== migrated pool shape ===');
(() => {
  let withStep = 0, badFilter = 0, residualTarget = 0;
  for (const card of Object.values(CARDS)) {
    if (!card.target) continue;
    withStep++;
    if (!ENGINE.TARGET_FILTERS.has(card.target)) { badFilter++; console.log('   out-of-taxonomy:', card.tplId, card.target); }
    // The on-cast effects that operate on the step must be bare (no own target),
    // except target:'self' effects which legitimately keep theirs.
    for (const e of (Array.isArray(card.effects) ? card.effects : [])) {
      if (e && e.target && e.target !== 'self') { residualTarget++; }
    }
  }
  check('42 cards carry a top-level target() step', withStep === 42, 'got ' + withStep);
  check('every target() step is in the closed taxonomy', badFilter === 0);
  check('no migrated on-cast effect kept a per-effect target', residualTarget === 0, 'got ' + residualTarget);
})();

console.log('\n=== triggered / activated ability target() steps ===');
(() => {
  let trig = 0, ab = 0, bad = 0, residual = 0;
  for (const card of Object.values(CARDS)) {
    for (const t of (card.triggers || [])) {
      if (!t.target) continue;
      trig++;
      if (!ENGINE.TARGET_FILTERS.has(t.target)) bad++;
      for (const e of (t.effects || [])) if (e && e.target && e.target !== 'self') residual++;
    }
    for (const a of (card.abilities || [])) {
      if (!a.target) continue;
      ab++;
      if (!ENGINE.TARGET_FILTERS.has(a.target)) bad++;
      for (const e of (a.effects || [])) if (e && e.target && e.target !== 'self') residual++;
    }
  }
  check('48 triggered abilities carry a target() step', trig === 48, 'got ' + trig);
  check('4 activated abilities carry a target() step', ab === 4, 'got ' + ab);
  check('all trigger/ability target() steps in taxonomy', bad === 0);
  check('no migrated trigger/ability effect kept a per-effect target', residual === 0, 'got ' + residual);
})();

console.log('\n=== representative cards ===');
(() => {
  const bolt = CARDS.bolt;
  check('bolt: target(creature_or_player)', bolt.target === 'creature_or_player');
  check('bolt: bare damage(3)', bolt.effects[0].kind === 'damage' && bolt.effects[0].amount === 3 && !bolt.effects[0].target);

  // Boot validation: the whole migrated pool is clean.
  const r = ENGINE.validateAllCardEffects(CARDS);
  check('boot validation: no unknown kinds', r.unknownKinds.length === 0, r.unknownKinds.join(','));
  check('boot validation: no out-of-taxonomy filters', r.unknownFilters.length === 0, r.unknownFilters.join(','));
})();

console.log('\n=== skipped cards kept their non-taxonomy filters (no silent loss) ===');
(() => {
  // Cards whose targeted on-cast effect carries a subtype/keyword/maxTough
  // filter were intentionally NOT migrated (the closed taxonomy can't express
  // them). Verify at least one such card still has its filter and NO top-level
  // target() step.
  let preserved = 0;
  for (const card of Object.values(CARDS)) {
    if (card.target) continue;
    for (const e of (Array.isArray(card.effects) ? card.effects : [])) {
      if (e && e.target && e.target !== 'self' && e.filter) {
        const keys = Object.keys(e.filter).filter(k => k !== 'controller');
        if (keys.length > 0) preserved++;
      }
    }
  }
  check('non-taxonomy-filter cards retained their filter (skipped, not lost)', preserved >= 1, 'count=' + preserved);
})();

console.log('\n=== kind-collapse: legacy mass/weaken kinds gone from card data ===');
(() => {
  const GONE = ['damageAll', 'removeAll', 'pumpAllYours', 'weaken'];
  const seen = {};
  const allEffs = (card) => {
    const out = [];
    if (Array.isArray(card.effects)) out.push(...card.effects);
    else if (card.effects && Array.isArray(card.effects.modes)) for (const m of card.effects.modes) out.push(...m);
    for (const t of (card.triggers || [])) out.push(...(t.effects || []));
    for (const a of (card.abilities || [])) out.push(...(a.effects || []));
    return out;
  };
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) if (e && GONE.includes(e.kind)) seen[e.kind] = (seen[e.kind] || 0) + 1;
  }
  for (const k of GONE) check('no card uses legacy ' + k, !seen[k], (seen[k] || 0) + ' remain');

  // The collapsed forms are present.
  let massDmg = 0, massPump = 0, massRemove = 0, signedPump = 0;
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) {
      if (e && e.kind === 'damage' && e.scope === 'all_creatures') massDmg++;
      if (e && e.kind === 'pump' && (e.scope === 'all_yours' || e.scope === 'all_creatures')) massPump++;
      if (e && e.kind === 'removeCreature' && e.scope) massRemove++;
      if (e && e.kind === 'pump' && ((e.power || 0) < 0 || (e.toughness || 0) < 0)) signedPump++;
    }
  }
  check('damageAll collapsed to damage+scope (4)', massDmg === 4, 'got ' + massDmg);
  check('pumpAllYours collapsed to pump+scope (7)', massPump === 7, 'got ' + massPump);
  check('removeAll collapsed to removeCreature+scope (3)', massRemove === 3, 'got ' + massRemove);
  check('weaken collapsed to signed pump (3)', signedPump === 3, 'got ' + signedPump);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
