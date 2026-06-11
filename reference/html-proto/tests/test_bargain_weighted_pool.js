// Audit A6-1, option C (Joe, PR #98 round 3, 2026-06-10: "Do C. Keep the
// pool broad, but make it factor weights in appropriately.").
//
// The Archdemon-of-Bargains random sticker reward (applyRandomStickersToSide)
// keeps the BROAD registry pool — stat boosts, keyword grants, Innate, the
// five land-color (add_type) stickers, the −1-cost (cost_mod) sticker, and
// lose_defender — excluding only scarified (boss-only, weight 0) and the
// roll-needing subtype/empower. But each pick now draws the STICKER by rarity
// weight via pickWeightedSticker (the same machinery normal reward offers
// use), then a target permanent uniformly among that sticker's eligible
// permanents. Pre-fix the bargain drew UNIFORMLY over (permanent, sticker)
// pairings, ignoring weights entirely: Indestructible (weight 1) was exactly
// as likely as +1/+1 (weight 20).
//
// Determinism: no sampling — Math.random is stubbed to fixed values, and the
// constructed weighted pool is inspected directly via bargainStickerCandidates.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9500;
// Minimal battlefield permanent — just the fields the sticker appliesTo
// gates and kind-effects read (types/keywords/stickers/modifiers/cost).
function dummyCreature(over) {
  return Object.assign({
    iid: nextIid++, name: 'Test Dummy', types: ['Creature'],
    power: 2, toughness: 2, cost: { C: 0 },
    keywords: [], stickers: [], modifiers: [],
  }, over || {});
}
// All grantable keywords EXCEPT indestructible (weight 1) — and except
// defender/innate, which have no kw_* grant sticker. A creature wearing
// these is eligible for exactly TWO bargain stickers: plus1_plus1
// (weight 20) and kw_indestructible (weight 1). That 20-vs-1 pair is the
// deterministic weighted-vs-uniform discriminator below.
const ALL_BUT_INDESTRUCTIBLE = [
  'flying', 'vigilance', 'trample', 'haste', 'first_strike', 'reach',
  'lifelink', 'deathtouch', 'menace', 'hexproof', 'flash', 'unblockable',
];
function bargainState(perms) {
  return { opp: { battlefield: perms } };
}

console.log('=== Rarity weights drive the bargain pick (deterministic Math.random) ===');
const realRandom = Math.random;
try {
  // Eligible pool: [+1/+1 (w20), Has Indestructible (w1)], total weight 21.
  // Roll 0.6 → weighted walk lands at 12.6, inside +1/+1's 20-wide band
  // (whichever order the pool iterates: 12.6 < 20 and 12.6 - 1 < 20).
  // Pre-fix uniform pairing draw: floor(0.6 * 2) = 1 → Indestructible.
  {
    const c = dummyCreature({ keywords: ALL_BUT_INDESTRUCTIBLE.slice() });
    Math.random = () => 0.6;
    applyRandomStickersToSide(bargainState([c]), 'opp', 1, 'Bargain Test', null);
    check('roll 0.6 picks +1/+1 (weight 20), not Indestructible (weight 1)',
      c.stickers.includes('plus1_plus1'), 'stickers=' + JSON.stringify(c.stickers));
    check('the stat boost was actually applied (one +1/+1 modifier)',
      c.modifiers.length === 1 && c.modifiers[0].power === 1 && c.modifiers[0].toughness === 1,
      'modifiers=' + JSON.stringify(c.modifiers));
    check('Indestructible was NOT granted at roll 0.6',
      !c.keywords.includes('indestructible'));
  }
  // Tail roll 0.99 → 20.79, past +1/+1's band → the weight-1 rare sticker.
  // Rare stickers stay REACHABLE, just rare (broad pool, weighted draw).
  {
    const c = dummyCreature({ keywords: ALL_BUT_INDESTRUCTIBLE.slice() });
    Math.random = () => 0.99;
    applyRandomStickersToSide(bargainState([c]), 'opp', 1, 'Bargain Test', null);
    check('roll 0.99 reaches the weight-1 tail (Indestructible granted)',
      c.keywords.includes('indestructible'), 'keywords=' + JSON.stringify(c.keywords));
  }
  // Multi-pick: candidates re-derive between picks, so eligibility updates.
  // Pick 1 at 0.99 → Indestructible; pick 2's pool shrinks to [+1/+1] alone
  // (the keyword sticker no longer applies) → +1/+1.
  {
    const c = dummyCreature({ keywords: ALL_BUT_INDESTRUCTIBLE.slice() });
    Math.random = () => 0.99;
    applyRandomStickersToSide(bargainState([c]), 'opp', 2, 'Bargain Test', null);
    check('n=2 re-derives eligibility per pick (Indestructible then +1/+1)',
      c.keywords.includes('indestructible') && c.stickers.includes('plus1_plus1'),
      'stickers=' + JSON.stringify(c.stickers));
  }
} finally {
  Math.random = realRandom;
}

console.log('\n=== Pool breadth: the constructed weighted pool stays BROAD ===');
{
  // A battlefield that unlocks every pool corner the old comment omitted:
  // a defender creature (remove_keyword), a 2-generic-cost creature
  // (cost_mod), and a real land (add_type land-color + Innate).
  const wall = dummyCreature({ keywords: ['defender'] });
  const costly = dummyCreature({ cost: { C: 2 } });
  const land = ENGINE.makeCard('plains');
  const candidates = bargainStickerCandidates([wall, costly, land]);
  const ids = candidates.map(c => c.sticker.id);
  const kinds = new Set(candidates.map(c => c.sticker.kind));

  check('stat_boost in pool (+1/+1)', ids.includes('plus1_plus1'));
  check('keyword grants in pool (some kw_*)', ids.some(id => id.startsWith('kw_')));
  check('remove_keyword in pool (lose_defender)', ids.includes('lose_defender'));
  check('cost_mod in pool (cost_minus_1)', ids.includes('cost_minus_1'));
  check('add_type in pool (a land-color sticker)',
    ids.some(id => id.startsWith('land_color_')), 'ids=' + JSON.stringify(ids));
  check('Innate in pool (lands present)', ids.includes('innate'));
  check('pool covers all the kinds the pre-fix comment omitted',
    kinds.has('add_type') && kinds.has('cost_mod') && kinds.has('remove_keyword'),
    'kinds=' + JSON.stringify([...kinds]));

  check('scarified (boss-only) excluded', !ids.includes('scarified'));
  check('subtype (needs rolls) excluded', !ids.includes('subtype'));
  check('empower (needs rolls) excluded', !ids.includes('empower'));

  // The pool carries the REGISTRY weights — the rarity table feeds the draw
  // (no invented weights, no flattening).
  const byId = {};
  for (const c of candidates) byId[c.sticker.id] = c.sticker;
  check('+1/+1 candidate carries its registry weight (20)',
    byId['plus1_plus1'] && byId['plus1_plus1'].weight === 20);
  check('cost_minus_1 candidate carries its registry weight (1)',
    byId['cost_minus_1'] && byId['cost_minus_1'].weight === 1);
  check('every candidate has positive weight',
    candidates.every(c => c.sticker.weight > 0));

  // Per-sticker eligible-permanent lists honor appliesTo placement.
  check('lose_defender targets only the defender creature',
    byId['lose_defender'] && candidates.find(c => c.sticker.id === 'lose_defender')
      .perms.every(p => p === wall));
  check('cost_minus_1 targets only the 2-cost nonland',
    candidates.find(c => c.sticker.id === 'cost_minus_1')
      .perms.every(p => p === costly));
  check('every candidate lists at least one eligible permanent',
    candidates.every(c => c.perms.length > 0));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
