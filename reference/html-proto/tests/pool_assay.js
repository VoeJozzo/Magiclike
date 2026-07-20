// Pool assay — card-pool health metrics for the bucket generator.
// Not part of run_all.js; run on demand like selfplay_harness.js:
//
//   node tests/pool_assay.js
//
// Reports, in order:
//   1. HUB SHARE      — % of offered buckets containing any top-5 hub card,
//                       per committed archetype deck. The perceptual-sameness
//                       proxy: players read a bucket by its marquee card, so
//                       clumpiness = the same connector recurring, NOT card-set
//                       overlap (measured Jaccard of same-theme buckets is only
//                       ~0.17-0.24 — contents already vary).
//   2. PLANS PER PAIR — distinct bucket names seen across 75 offered buckets
//                       for each color pair. Target: >= 12 everywhere (the
//                       level of the pairs that don't feel clumpy).
//   3. HOOK HISTOGRAM — strong synergy edges (weight >= 2) per pool card.
//                       The "vanilla ocean" count: cards with zero strong
//                       edges can never connect anything.
//   4. TRIBE CENSUS   — members / payoffs / top-card recurrence per tribe.
//
// History: docs/plans/plan-bucket-draft.md; the measured findings behind the
// metric choices are in the Depth Assay session notes (2026-07-07): member
// injection and same-tribe payoff injection were both tested and neither
// moves perceived clumpiness — new-niche hubs and cross-theme bridges do.

const setup = require('./_setup');
setup.loadEngine();

const PIP = ['W', 'U', 'B', 'R', 'G'];
const LAND = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };

const pool = Object.keys(CARDS).filter(id => {
  const c = CARDS[id];
  if (!c || c.special || hasType(c, 'Basic') || hasType(c, 'Land')) return false;
  if (typeof c.draftWeight === 'number' && c.draftWeight <= 0) return false;
  return true;
});

// ---- 1. Hub share ----------------------------------------------------------
const DECKS = {
  'goblin (R)':   ['goblin_chieftain', 'goblin_rabble', 'goblin_piercer', 'raging_goblin', 'mountain', 'mountain', 'mountain'],
  'wizard (U)':   ['archmage_patriarch', 'wizard_adept', 'scrying_wizard', 'island', 'island', 'island'],
  'aristo (BR)':  ['blood_artist', 'carrion_feeder', 'cult_priest', 'vampire_bat', 'swamp', 'swamp', 'mountain'],
  'spirit (W)':   ['spirit_shepherd', 'echo_spirit', 'devoted_watcher', 'plains', 'plains', 'plains'],
};
console.log('=== 1 · HUB SHARE (per committed deck: % of buckets containing any of its top-5 recurring cards) ===');
for (const [label, deck] of Object.entries(DECKS)) {
  const cardCount = {};
  let buckets = 0;
  for (let i = 0; i < 40; i++) for (const b of BUCKETS.rollBucketOffer(deck)) {
    buckets++;
    for (const id of new Set(b.cards)) cardCount[id] = (cardCount[id] || 0) + 1;
  }
  const top5 = Object.entries(cardCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const hubSet = new Set(top5.map(([id]) => id));
  // second pass so hub-share is measured on fresh offers, not the fitting set
  let hubBuckets = 0, buckets2 = 0;
  for (let i = 0; i < 40; i++) for (const b of BUCKETS.rollBucketOffer(deck)) {
    buckets2++;
    if (b.cards.some(id => hubSet.has(id))) hubBuckets++;
  }
  console.log(`  ${label.padEnd(13)} hub share ${(100 * hubBuckets / buckets2).toFixed(0).padStart(3)}%   hubs: ${top5.map(([id, n]) => `${id}(${(100 * n / buckets).toFixed(0)}%)`).join(', ')}`);
}

// ---- 2. Plans per pair ------------------------------------------------------
console.log('\n=== 2 · PLANS PER COLOR PAIR (distinct seed cards in 75 buckets; target >= 12) ===');
// Bucket names died at v2.2.22 (identity = the seed + why[]), so plan
// diversity counts distinct SEED cards — the doctrine's own identity field
// (audit R58/R59: the old bb.name read collected only undefined).
const pairs = [['W','U'],['U','B'],['B','R'],['R','G'],['G','W'],['W','B'],['U','R'],['B','G'],['R','W'],['G','U']];
const pairResults = [];
for (const [a, b] of pairs) {
  const deck = [LAND[a], LAND[a], LAND[b], LAND[b]];
  const seeds = new Set();
  for (let i = 0; i < 25; i++) for (const bb of BUCKETS.rollBucketOffer(deck)) seeds.add(bb.cards[0]);
  pairResults.push({ pair: a + b, plans: seeds.size });
}
pairResults.sort((x, y) => x.plans - y.plans);
for (const r of pairResults) {
  console.log(`  ${r.pair}  ${String(r.plans).padStart(2)} ${r.plans < 12 ? ' — PLAN-POOR' : ''}`);
}

// ---- 3. Hook histogram ------------------------------------------------------
console.log('\n=== 3 · HOOK HISTOGRAM (strong edges, weight >= 2, per pool card) ===');
const bins = { '0': 0, '1-2': 0, '3-5': 0, '6-10': 0, '11-20': 0, '21+': 0 };
for (const id of pool) {
  let deg = 0;
  for (const other of pool) if (other !== id && BUCKETS.edgeBetween(id, other).w >= 2) deg++;
  if (deg === 0) bins['0']++;
  else if (deg <= 2) bins['1-2']++;
  else if (deg <= 5) bins['3-5']++;
  else if (deg <= 10) bins['6-10']++;
  else if (deg <= 20) bins['11-20']++;
  else bins['21+']++;
}
for (const [k, v] of Object.entries(bins)) {
  console.log(`  ${k.padEnd(6)} ${String(v).padStart(3)}  ${'#'.repeat(Math.round(v / 3))}`);
}
console.log(`  zero-hook share: ${(100 * bins['0'] / pool.length).toFixed(0)}% of ${pool.length} (target < 25%)`);

// ---- 4. Tribe census --------------------------------------------------------
console.log('\n=== 4 · TRIBE CENSUS (members / payoffs; themes need payoffs to exist) ===');
const tribes = {};
for (const id of pool) {
  const a = BUCKETS.analyzeCard(id);
  if (!a) continue;
  for (const r of Object.keys(a.provides)) if (r.startsWith('sub:'))
    (tribes[r] = tribes[r] || { m: 0, p: 0 }).m++;
  for (const r of Object.keys(a.wants)) if (r.startsWith('sub:'))
    (tribes[r] = tribes[r] || { m: 0, p: 0 }).p++;
}
for (const [r, t] of Object.entries(tribes).sort((a, b) => b[1].m - a[1].m)) {
  if (t.p === 0 || t.m < 6) continue;
  console.log(`  ${r.slice(4).padEnd(10)} ${String(t.m).padStart(3)} members  ${t.p} payoff${t.p > 1 ? 's' : ''}`);
}
console.log('\n(Themes with payoffs but < 6 members, or members but no payoff, are card-design leads.)');
