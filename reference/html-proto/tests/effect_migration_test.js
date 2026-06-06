// On-cast targeting migration (Slice 3 / effects-refactor §3.5). The migration
// itself is long done; what still earns its keep here are the ONGOING invariants
// it established — every target() step is in the closed taxonomy, no effect kept
// a per-effect target, no card uses a retired effect kind, and the canonical
// decompositions (edict/flicker/restrict/bolt) still have the right shape.
//
// NOTE: this file used to assert exact card COUNTS ("55 cards carry a target()
// step", "22 draws collapsed to move_card", etc). Those were count-the-
// implementation: they broke every time a card was added (a non-event) and
// caught no behavior. Replaced with existence checks (the collapsed form is
// PRESENT) — the invariant that actually matters post-migration.

const setup = require('./_setup');
setup.loadEngine();
RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
RUN.startNextGame();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== migrated pool shape (invariants, not counts) ===');
(() => {
  let withStep = 0, badFilter = 0, residualTarget = 0;
  for (const card of Object.values(CARDS)) {
    if (!card.target) continue;
    withStep++;
    if (!ENGINE.TARGET_FILTERS.has(card.target)) { badFilter++; console.log('   out-of-taxonomy:', card.tplId, card.target); }
    // On-cast effects operating on the step must be bare (no own target), except
    // target:'self' effects which legitimately keep theirs.
    for (const e of (Array.isArray(card.effects) ? card.effects : [])) {
      if (e && e.target && e.target !== 'self') { residualTarget++; }
    }
  }
  check('the pool has top-level target() cards (migration happened)', withStep > 0, 'got ' + withStep);
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
  check('triggers and abilities carry target() steps', trig > 0 && ab > 0, 'trig=' + trig + ' ab=' + ab);
  check('all trigger/ability target() steps in taxonomy', bad === 0);
  check('no migrated trigger/ability effect kept a per-effect target', residual === 0, 'got ' + residual);
})();

console.log('\n=== representative cards (canonical decompositions) ===');
(() => {
  const bolt = CARDS.lightning_bolt;
  check('bolt: target(creature_or_player)', bolt.target === 'creature_or_player');
  check('bolt: bare damage(3)', bolt.effects[0].kind === 'damage' && bolt.effects[0].amount === 3 && !bolt.effects[0].target);

  // Boot validation: the whole pool is clean (behavioral — runs the validator).
  const r = ENGINE.validateAllCardEffects(CARDS);
  check('boot validation: no unknown kinds', r.unknownKinds.length === 0, r.unknownKinds.join(','));
  check('boot validation: no out-of-taxonomy filters', r.unknownFilters.length === 0, r.unknownFilters.join(','));
})();

console.log('\n=== skipped cards kept their non-taxonomy filters (no silent loss) ===');
(() => {
  // Cards whose targeted on-cast effect carries a subtype/keyword/max_tough
  // filter were intentionally NOT migrated (the closed taxonomy can't express
  // them). At least one such card must still have its filter and NO top-level step.
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

console.log('\n=== kind-collapse: retired kinds gone, collapsed forms present ===');
(() => {
  // The retired kinds must be ABSENT from card data (this catches an incomplete
  // migration or a reverted decomposition, and does NOT break on adding cards).
  // 'draw'/'discard' stay in the EFFECTS dispatch table (the Mercurial trigger
  // generator still emits them) — GONE asserts the card TEMPLATES only.
  const GONE = ['damageAll', 'removeAll', 'pumpAllYours', 'weaken', 'gainControl', 'steal',
                'returnFromGraveyard', 'shuffleIntoLibrary', 'edict', 'restrict', 'draw', 'flicker',
                'searchCreature', 'searchLandTapped', 'discard'];
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

  // add_counter's +1/+1 form was collapsed to pump duration:permanent. The kind
  // survives for NAMED counters (verse etc.) — a bare resource that does NOT
  // change P/T, which pump cannot express. So the invariant is narrower than
  // "gone": no card may use the legacy +1/+1 (counter-less) form.
  let legacyPtCounter = 0;
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) if (e && e.kind === 'add_counter' && !e.counter) legacyPtCounter++;
  }
  check('no card uses legacy +1/+1 add_counter (use pump duration:permanent)', legacyPtCounter === 0, legacyPtCounter + ' remain');

  // The collapsed forms are PRESENT in the pool (existence, not count — a count
  // would break every time a card of that shape is added).
  let massDmg = 0, massPump = 0, massRemove = 0, signedPump = 0;
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) {
      if (e && e.kind === 'damage' && e.scope === 'all_creatures') massDmg++;
      if (e && e.kind === 'pump' && (e.scope === 'all_yours' || e.scope === 'all_creatures')) massPump++;
      if (e && e.kind === 'affect_creature' && e.scope) massRemove++;
      if (e && e.kind === 'pump' && ((e.power || 0) < 0 || (e.toughness || 0) < 0)) signedPump++;
    }
  }
  check('damageAll collapsed to damage+scope (present)', massDmg >= 1, 'got ' + massDmg);
  check('pumpAllYours collapsed to pump+scope (present)', massPump >= 1, 'got ' + massPump);
  check('removeAll collapsed to affect_creature+scope (present)', massRemove >= 1, 'got ' + massRemove);
  check('weaken collapsed to signed pump (present)', signedPump >= 1, 'got ' + signedPump);

  let changeControl = 0, stealVariant = 0;
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) {
      if (e && e.kind === 'change_control') { changeControl++; if (e.transfer_ownership) stealVariant++; }
    }
  }
  check('gainControl/steal collapsed to change_control (present)', changeControl >= 1, 'got ' + changeControl);
  check('steal is the transfer_ownership variant (present)', stealVariant >= 1, 'got ' + stealVariant);

  let mcReturn = 0, mcShuffle = 0, mcDraw = 0, mcSearchCr = 0, mcFetchLand = 0, mcDiscard = 0;
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) {
      if (e && e.kind === 'move_card' && e.from_zone === 'graveyard' && e.to_zone === 'hand') mcReturn++;
      if (e && e.kind === 'move_card' && e.from_zone === 'battlefield' && e.to_zone === 'library') mcShuffle++;
      if (e && e.kind === 'move_card' && e.from_zone === 'library' && e.to_zone === 'hand' && e.selector !== 'library_search') mcDraw++;
      if (e && e.kind === 'move_card' && e.from_zone === 'library' && e.to_zone === 'hand' && e.selector === 'library_search') mcSearchCr++;
      if (e && e.kind === 'move_card' && e.from_zone === 'library' && e.to_zone === 'battlefield') mcFetchLand++;
      if (e && e.kind === 'move_card' && e.from_zone === 'hand' && e.to_zone === 'graveyard') mcDiscard++;
    }
  }
  check('returnFromGraveyard collapsed to move_card graveyard→hand (present)', mcReturn >= 1, 'got ' + mcReturn);
  check('shuffleIntoLibrary collapsed to move_card battlefield→library (present)', mcShuffle >= 1, 'got ' + mcShuffle);
  check('draw collapsed to move_card library→hand controller_top (present)', mcDraw >= 1, 'got ' + mcDraw);
  check('searchCreature collapsed to move_card library→hand library_search (present)', mcSearchCr >= 1, 'got ' + mcSearchCr);
  check('searchLandTapped collapsed to move_card library→battlefield (present)', mcFetchLand >= 1, 'got ' + mcFetchLand);
  check('discard collapsed to move_card hand→graveyard (present)', mcDiscard >= 1, 'got ' + mcDiscard);

  let permPump = 0;
  for (const card of Object.values(CARDS)) {
    for (const e of allEffs(card)) if (e && e.kind === 'pump' && e.duration === 'permanent') permPump++;
  }
  check('add_counter collapsed to permanent pump (present)', permPump >= 1, 'got ' + permPump);

  // Canonical decompositions on named cards (shape goldens — pinned to specific
  // cards with a rationale, so they document the correct form and don't break on
  // adding unrelated cards).
  const edict = CARDS.diabolic_edict;
  check('diabolicEdict: target(opp)', edict.target === 'opp');
  check('diabolicEdict: chooses(creature) + sacrifice',
    edict.effects.length === 2 && edict.effects[0].kind === 'chooses' && edict.effects[1].kind === 'sacrifice');

  const cs = CARDS.cloudshift;
  check('cloudshift: target(your_creature)', cs.target === 'your_creature');
  check('cloudshift: move_card(bf→exile) + move_card(exile→bf)',
    cs.effects.length === 2
    && cs.effects[0].kind === 'move_card' && cs.effects[0].from_zone === 'battlefield' && cs.effects[0].to_zone === 'exile'
    && cs.effects[1].kind === 'move_card' && cs.effects[1].from_zone === 'exile' && cs.effects[1].to_zone === 'battlefield');

  const pac = CARDS.pacifism;
  check('pacifism: target(creature)', pac.target === 'creature');
  check('pacifism: grant_keyword(defender) + grant_keyword(no_block)',
    pac.effects.length === 2
    && pac.effects[0].kind === 'grant_keyword' && pac.effects[0].keyword === 'defender'
    && pac.effects[1].kind === 'grant_keyword' && pac.effects[1].keyword === 'no_block');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
