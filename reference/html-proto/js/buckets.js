// BUCKETS — synergy-graph bucket generation (the Growing Deck's card faucet).
//
// A bucket is a named bundle of 3 cards + 2 basic lands that share a PLAN.
// The core idea: a cohesive bucket is a micro-engine — cards that COMPLETE
// each other (producer → consumer), not cards that merely resemble each
// other. Blood Artist doesn't want other drain cards; it wants things that
// die. The generator never decides "I'll build a Goblin bucket" — it picks
// a seed card and asks the graph "who wants to be near this card?"; the
// theme name is read off the answer afterward.
//
// Pipeline (see docs/plans/plan-bucket-draft.md for the full design):
//   §1 analyze(card)  — derive PROVIDES / WANTS resource sets + plan tags
//                       from card.json structure (~15 rules, the whole
//                       authored surface).
//   §2 edge(a, b)     — labeled synergy weight between two cards:
//                       provides×wants matches (strong) + shared plan tags
//                       (weak). Every edge carries human-readable reasons.
//   §3 growBucket()   — seed-and-grow: start from a seed, twice add the
//                       softmax-sampled best companion under constraints
//                       (≤2 colors, castable in deck colors, curve spread).
//   §4 rollOffer()    — compose a 3-bucket offer: seeds sampled from the
//                       whole legal pool, each card weighted by its deck-
//                       affinity (weights-as-weights: the wishlist shapes
//                       the odds, not the outcomes). Low-coherence buckets
//                       fall back to a loose "Reinforcements" bundle so
//                       offers never come up empty.
//   §5 naming         — bucket name = label of the dominant edge resource.
//
// API: rollBucketOffer(deckTplIds), rollBucket(seedTplId, deckTplIds),
//      edgeBetween(aId, bId), analyzeCard(tplId), landsForCards(cardTplIds),
//      themeHealthReport(), _resetCacheForTest, _setRandForTest.
const BUCKETS = (function() {

// ---------------------------------------------------------------------------
// §0 Tuning constants — the entire balance surface, in one place.
// ---------------------------------------------------------------------------
const BUCKET_CARDS = 3;        // spells (well, nonland cards) per bucket
const BUCKET_LANDS = 2;        // basic lands per bucket (colored by bucket pips)
const OFFER_SIZE = 3;          // buckets per offer

// Provides/wants weights. A payoff's WANT (3) times a strong PROVIDE (2)
// makes a 6-point edge; homophily tops out at 0.5 per shared tag — the
// producer/consumer force always dominates the "we're similar" force.
const W_WANT_PAYOFF   = 3;     // subtype lords, death/lifegain/spellcast payoffs
const W_WANT_WIDE     = 2;     // global anthems want a wide board
const W_PROV_SUBTYPE  = 1;     // a creature provides its own tribe
const W_PROV_TOKENS   = 2;     // token makers provide fodder/deaths/width
const W_PROV_LIFE     = 2;     // lifegain sources
const W_PROV_EXPEND   = 1;     // cost ≤1 creatures are willing fodder
const W_PROV_DIES_CHEAP = 0.75; // cost ≤2 creatures die readily enough to count
const W_HOMOPHILY     = 0.5;   // shared plan tag (flying / aggro / removal / cardflow)

const GROWTH_TEMPERATURE = 0.7; // softmax temperature: 0 → same bucket every
                                // run (boring), high → incoherent. Variety dial.
// λ: how much a candidate's edges into the existing DECK count during bucket
// GROWTH (vs. edges into the bucket itself). Kept deliberately small: seed
// selection already carries the deck's identity (weights-as-weights), so a
// large λ double-counts it — at 0.25, even off-theme seeds grew deck-themed
// members and 42% of post-first-pick buckets were the same tribe (measured);
// at 0.1 that's 29% (influential, not dictatorial) with committed mid-run
// decks still ~87% identity-themed. Growth's job is serving the SEED's plan.
const DECK_COUPLING = 0.1;
const CURVE_CLASH_PENALTY = 0.5;// score multiplier when a candidate shares a
                                // mana cost with a card already in the bucket.
const MIN_COHERENCE = 3;        // buckets below this fall back to Reinforcements.
// There is deliberately NO deck-wide copy cap (Joe's call, 2026-07-06): an
// earlier 4-copy rule here was an unauthorized import of MTG convention.
// Redundancy self-prices via the graph (self-feeding cards pull their own
// twins; pure payoffs don't).

// Baseline seed weight added to every legal card's deck-affinity before
// proportional sampling (Laplace smoothing). This is the exploration dial
// with a built-in curriculum: the baseline is constant while affinity mass
// GROWS with the deck, so early offers (tiny deck, peaked affinity) stay
// exploratory and late offers naturally follow the earned wishlist. Without
// it, a 5-card mono-theme start leaves ~170 pool cards at literal zero seed
// probability and the first pick dictates the whole draft (measured: 49% of
// post-first-pick buckets were the same tribe).
const SEED_BASE_WEIGHT = 0.75;

// No subtype is excluded from the graph. Even very broad tribes (Human: ~59
// members, 0 payoffs as of v2.2.0) are harmless without a payoff — provides
// never attract provides, so a want-less tribe generates zero edges — and
// the moment someone ships a Human lord, Human tribal simply starts working.
// If a broad tribe ever swamps offers, the principled lever is specificity
// weighting (scale a resource's edges down by how many cards provide it),
// not a ban list.

// ---------------------------------------------------------------------------
// §5 (data) Theme names — resource key → bucket display name.
// The one place flavor is authored. Fallbacks: tribal themes without an
// entry get "<Subtype> Pack"; anything else gets "Reinforcements".
// ---------------------------------------------------------------------------
const THEME_NAMES = {
  'sub:Goblin':   'Goblin Warband',
  'sub:Spirit':   'Spirit Choir',
  'sub:Soldier':  'The Muster',
  'sub:Wizard':   'Arcanum Circle',
  'sub:Cleric':   'The Congregation',
  'sub:Knight':   'The Vanguard',
  'sub:Beast':    'The Wild Hunt',
  'sub:Treefolk': 'The Old Growth',
  'sub:Druid':    'Grove Keepers',
  'sub:Elf':      'The Greenweald',
  'sub:Drake':    'Drake Aerie',
  'sub:Vampire':  'The Thirst',
  'sub:Zombie':   'The Risen',
  dies:      'Grave Bargains',
  fodder:    'The Expendables',
  etb:       'The Processional',
  lifegain:  'Communion',
  spellcast: 'Spellstorm',
  wide:      'The Horde',
  flying:    'Skyborne',
  aggro:     'The Red Charge',
  removal:   'The Culling',
  cardflow:  'Deep Lore',
  fallback:  'Reinforcements',
};

// Test seam: all randomness flows through _rand so tests can inject a
// deterministic sequence (mirrors run.js's _setPendingRewardForTest pattern).
let _rand = Math.random;

// ---------------------------------------------------------------------------
// §1 Card analysis — PROVIDES / WANTS / plan tags from card.json structure.
// ---------------------------------------------------------------------------
const PIP_COLORS = ['W', 'U', 'B', 'R', 'G'];

function colorsOf(tpl) {
  const cost = tpl.cost || {};
  const out = PIP_COLORS.filter(k => cost[k] > 0);
  if (out.length === 0 && tpl.color) return [tpl.color];
  return out;   // empty array = colorless, compatible with any deck
}
function totalCost(tpl) {
  let sum = 0;
  for (const v of Object.values(tpl.cost || {})) sum += (v || 0);
  return sum;
}

// Recursively collect every {kind:...} effect object and every condition
// string in a card — shape-agnostic, so triggers / abilities / modal arms
// / stapled shapes all feed the same rules.
function collectKindsAndConds(node, kinds, conds) {
  if (Array.isArray(node)) { for (const x of node) collectKindsAndConds(x, kinds, conds); return; }
  if (!node || typeof node !== 'object') return;
  if (typeof node.kind === 'string') kinds.push(node);
  for (const [key, val] of Object.entries(node)) {
    if (key === 'condition') {
      const list = Array.isArray(val) ? val : [val];
      for (const s of list) if (typeof s === 'string') conds.push(s);
    }
    collectKindsAndConds(val, kinds, conds);
  }
}

// §1b Card-local synergy hints — the custom_text of the graph.
//
// Rule of thumb: mechanics that appear on 2+ cards get an extraction rule
// here; a one-off custom kind the extractor deliberately doesn't parse
// (endomorph_absorb, Elystra's permanence) may instead declare its synergy
// ON the card:  "synergy": { "wants": {"dies": 3}, "provides": {...} }.
// Hints are ADDITIVE (max-merged with derived values, same as bump), and
// resource names are validated against the vocabulary below — a typo warns
// at index time instead of silently doing nothing (the predicate-registry
// boot-validation pattern).
const HINT_RESOURCES = new Set([
  'dies', 'fodder', 'etb', 'lifegain', 'spellcast', 'wide', 'anthem',
]);
function applySynergyHints(tpl, provides, wants) {
  if (!tpl.synergy) return;
  const bump = (map, key, w) => { map[key] = Math.max(map[key] || 0, w); };
  for (const [map, src, label] of [[provides, tpl.synergy.provides, 'provides'],
                                   [wants, tpl.synergy.wants, 'wants']]) {
    if (!src) continue;
    for (const [res, w] of Object.entries(src)) {
      if (!HINT_RESOURCES.has(res) && !/^sub:[A-Z]/.test(res)) {
        console.warn(`BUCKETS: ${tpl.tplId} synergy.${label} names unknown resource "${res}" — ignored`);
        continue;
      }
      if (typeof w === 'number' && w > 0) bump(map, res, w);
    }
  }
}

// The extraction rules. Each rule is one small block; together they are the
// module's entire authored knowledge about what synergy IS. Adding a new
// mechanic to the game usually means adding ~2 lines here.
function analyze(tpl) {
  const kinds = [];
  const conds = [];
  collectKindsAndConds(tpl, kinds, conds);
  const provides = {};
  const wants = {};
  const tags = new Set();
  const bump = (map, key, w) => { map[key] = Math.max(map[key] || 0, w); };

  const isCreature = hasType(tpl, 'Creature');
  const isSpellCard = hasType(tpl, 'Sorcery') || hasType(tpl, 'Instant');
  const subtypes = (tpl.types || []).filter(t => !TYPE_RANK_TYPES.has(t));

  // --- PROVIDES ---
  for (const st of subtypes) bump(provides, 'sub:' + st, W_PROV_SUBTYPE);
  for (const k of kinds) {
    if (k.kind === 'create_tokens') {
      // token_id like "goblin_r_1_1" → the tokens are Goblins.
      const tribe = String(k.token_id || '').split('_')[0];
      if (tribe) bump(provides, 'sub:' + tribe.charAt(0).toUpperCase() + tribe.slice(1), W_PROV_TOKENS);
      bump(provides, 'fodder', W_PROV_TOKENS);
      bump(provides, 'dies', W_PROV_TOKENS);
      bump(provides, 'wide', W_PROV_TOKENS);
      bump(provides, 'etb', W_PROV_TOKENS);
    }
    if (k.kind === 'gain_life' && (k.amount || 0) > 0) bump(provides, 'lifegain', W_PROV_LIFE);
  }
  if ((tpl.keywords || []).includes('lifelink')) bump(provides, 'lifegain', W_PROV_LIFE * 0.75);
  if (isCreature) {
    // Cheap bodies are willing fodder; big ones aren't. This gate is what
    // keeps "everything dies eventually" from wiring every creature to
    // every death payoff (the prototype's promiscuity bug).
    const cost = totalCost(tpl);
    if (cost <= 1) bump(provides, 'fodder', W_PROV_EXPEND);
    if (cost <= 2) bump(provides, 'dies', W_PROV_DIES_CHEAP);
    // Every creature enters. These constants express only the MECHANICAL
    // strength (cheap creatures enter more often); the fact that ~188 cards
    // provide etb is priced separately and automatically by the specificity
    // weighting (idf) in the edge function — measured offer histograms:
    // The Processional 51% of offers vs. an ETB-payoff deck pre-idf, 14%
    // with it (one identity theme among several, which is correct).
    bump(provides, 'etb', cost <= 3 ? 0.75 : 0.4);
  }
  if (isSpellCard) bump(provides, 'spellcast', 1);

  // --- WANTS ---
  // Trigger conditions. `this_card` triggers are self-referential (my own
  // ETB/death) — they are NOT a want on other cards, so we require the
  // trigger to plausibly fire off OTHER cards before recording a want.
  for (const trg of (tpl.triggers || [])) {
    const cs = [];
    collectKindsAndConds({ condition: trg.condition }, [], cs);
    const selfOnly = cs.includes('this_card');
    for (const s of cs) {
      const sub = s.match(/^card_has_subtype\((\w+)\)$/);
      if (sub) bump(wants, 'sub:' + sub[1], W_WANT_PAYOFF);
      if (selfOnly) continue;
      if (/^card_moves\(battlefield,\s*graveyard\)$/.test(s)) bump(wants, 'dies', W_WANT_PAYOFF);
      if (/^card_moves\([^)]*battlefield\)$/.test(s) && cs.includes('another_card')) {
        bump(wants, 'etb', W_WANT_PAYOFF);          // "when another creature enters" payoffs
      }
    }
    if (trg.event === 'life_changed') bump(wants, 'lifegain', W_WANT_PAYOFF);
    if (trg.event === 'spell_cast') bump(wants, 'spellcast', W_WANT_PAYOFF);
  }
  // Static buffs: tribal lords want their tribe; global anthems want width.
  for (const sb of (tpl.static_buffs || [])) {
    if (sb.subtype) {
      bump(wants, 'sub:' + sb.subtype, W_WANT_PAYOFF);
      bump(provides, 'anthem', 1);
    } else if (!sb.subtype) {
      bump(wants, 'wide', W_WANT_WIDE);
    }
  }
  // Sacrifice costs: sac outlets WANT fodder and PRODUCE deaths.
  for (const ab of (tpl.abilities || [])) {
    if (ab.cost && ab.cost.sacrifice && ab.cost.sacrifice !== 'self') {
      bump(wants, 'fodder', W_WANT_PAYOFF);
      bump(provides, 'dies', W_PROV_TOKENS);
    }
  }

  // --- Plan tags (weak similarity: shared strategy, not producer/consumer) ---
  if ((tpl.keywords || []).includes('flying')) tags.add('flying');
  if ((tpl.keywords || []).includes('haste')) tags.add('aggro');
  if ((tpl.triggers || []).some(t => t.event === 'attacks')) tags.add('aggro');
  // Damage that can go to the face is part of the race plan.
  if (kinds.some(k => k.kind === 'damage') && /player|opp|any/.test(String(tpl.target || ''))) tags.add('aggro');
  if (kinds.some(k => k.kind === 'affect_creature' || k.kind === 'fight' ||
                      (k.kind === 'damage' && isSpellCard))) tags.add('removal');
  if (kinds.some(k => k.kind === 'move_card')) tags.add('cardflow');

  applySynergyHints(tpl, provides, wants);

  return {
    // In-engine cards carry tplId (cards.js renames the wire format's
    // card_id at ingestion).
    tplId: tpl.tplId,
    provides, wants, tags,
    colors: colorsOf(tpl),
    cost: totalCost(tpl),
    isLand: hasType(tpl, 'Land'),
  };
}

// Supertypes stripped when reading subtypes off `types[]`.
const TYPE_RANK_TYPES = new Set([
  'Creature', 'Land', 'Instant', 'Sorcery', 'Artifact', 'Enchantment',
  'Basic', 'Spell', 'Token',
]);

// ---------------------------------------------------------------------------
// §2 Pool + graph (lazy caches — CARDS loads async at boot).
// ---------------------------------------------------------------------------
let _pool = null;        // [analysis] for every bucket-eligible card
let _byId = null;        // tplId → analysis
let _idf = null;         // resource → specificity factor (see below)

// Specificity weighting (inverse document frequency). A resource provided by
// half the pool (etb: ~188 providers) says almost nothing about two cards
// belonging together; a resource provided by a dozen (a tribe) says a lot.
// Each provide-side contribution is scaled by anchor/log2(2+providers), so a
// resource with IDF_ANCHOR_PROVIDERS providers scores ×1.0, tribes sit near
// ×0.8–1.0, and ubiquitous resources (etb/spellcast/dies) bind loosely
// (~×0.45–0.55). This is the general mechanism behind ad-hoc judgments like
// "Human is too broad to be a theme" and "etb provision must be weak" —
// breadth is priced automatically, for every resource, present and future.
const IDF_ANCHOR_PROVIDERS = 8;

function ensurePool() {
  if (_pool) return;
  _pool = [];
  _byId = {};
  for (const id of Object.keys(CARDS)) {
    const tpl = CARDS[id];
    if (!tpl) continue;
    if (hasType(tpl, 'Basic')) continue;               // basics ride the land slots
    // EVERY card gets analyzed into _byId — including special (boss/boon-only)
    // cards — so a boon card sitting in your deck still exerts pull on what
    // the offers court (an Endomorph wants the same world an aristocrats
    // deck wants). Only the OFFERABLE subset joins _pool: specials and
    // explicitly undraftable cards are seen, never offered.
    const a = analyze(tpl);
    _byId[id] = a;
    if (tpl.special) continue;
    const w = tpl.draftWeight;
    if (typeof w === 'number' && w <= 0) continue;
    _pool.push(a);
  }
  const providerCount = {};
  for (const a of _pool) {
    for (const r of Object.keys(a.provides)) providerCount[r] = (providerCount[r] || 0) + 1;
  }
  _idf = {};
  const anchor = Math.log2(2 + IDF_ANCHOR_PROVIDERS);
  for (const [r, n] of Object.entries(providerCount)) {
    _idf[r] = anchor / Math.log2(2 + n);
  }
}
function idf(res) { return _idf[res] || 1; }

function edge(a, b) {
  let w = 0;
  const reasons = [];
  for (const [r, pw] of Object.entries(a.provides)) {
    if (b.wants[r]) { w += pw * b.wants[r] * idf(r); reasons.push(`${a.tplId} feeds ${b.tplId} [${r}]`); }
  }
  for (const [r, pw] of Object.entries(b.provides)) {
    if (a.wants[r]) { w += pw * a.wants[r] * idf(r); reasons.push(`${b.tplId} feeds ${a.tplId} [${r}]`); }
  }
  for (const t of a.tags) {
    if (b.tags.has(t)) { w += W_HOMOPHILY; reasons.push(`shared plan [${t}]`); }
  }
  return { w, reasons };
}

function edgeMassIntoDeck(analysis, deckAnalyses) {
  let sum = 0;
  for (const d of deckAnalyses) sum += edge(analysis, d).w;
  return sum;
}

// ---------------------------------------------------------------------------
// §3 Seed-and-grow.
// ---------------------------------------------------------------------------
function deckColorSet(deckTplIds) {
  const colors = new Set();
  for (const id of (deckTplIds || [])) {
    const tpl = CARDS[id];
    if (!tpl) continue;
    for (const c of colorsOf(tpl)) colors.add(c);
    if (hasType(tpl, 'Land') && tpl.mana && PIP_COLORS.includes(tpl.mana)) colors.add(tpl.mana);
  }
  return colors;
}

// Candidate legality inside a bucket: the bucket stays ≤2 colors, the deck's
// color identity stays ≤2 colors, and the deck-wide copy cap holds.
//
// The color rule is two-phase: while the deck holds FEWER than two colors
// (run start, or a mono-color first pick), candidates may introduce a second
// color — otherwise a mono-blue first bucket would lock the whole run to
// blue. Once the deck is committed to two colors, candidates must be
// castable inside them (colorless always fits).
function isLegalCandidate(cand, bucket, deckColors) {
  const bucketColors = new Set();
  for (const b of bucket) for (const c of b.colors) bucketColors.add(c);
  for (const c of cand.colors) bucketColors.add(c);
  if (bucketColors.size > 2) return false;
  if (deckColors.size >= 2) {
    for (const c of cand.colors) if (!deckColors.has(c)) return false;
  } else {
    const combined = new Set([...deckColors, ...bucketColors]);
    if (combined.size > 2) return false;
  }
  return true;
}

// Softmax-sample one entry from scored [{item, score}] — never argmax, so the
// same seed grows into recognizably-the-same-plan but not the-same-three-cards.
function softmaxPick(scored, temperature) {
  if (scored.length === 0) return null;
  let max = -Infinity;
  for (const s of scored) if (s.score > max) max = s.score;
  const denom = temperature * Math.max(1, max / 4);
  const weights = scored.map(s => Math.exp((s.score - max) / denom));
  let total = 0;
  for (const w of weights) total += w;
  let roll = _rand() * total;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return scored[i].item;
  }
  return scored[scored.length - 1].item;
}

function growBucket(seedAnalysis, deckAnalyses, deckColors) {
  const bucket = [seedAnalysis];
  const why = [];
  while (bucket.length < BUCKET_CARDS) {
    const scored = [];
    for (const cand of _pool) {
      if (bucket.includes(cand)) continue;
      if (cand.isLand) continue;   // lands ride the dedicated land slots
      if (!isLegalCandidate(cand, bucket, deckColors)) continue;
      let score = 0;
      const reasons = [];
      for (const b of bucket) {
        const e = edge(cand, b);
        score += e.w;
        for (const r of e.reasons) reasons.push(r);
      }
      if (score <= 0) continue;
      score += DECK_COUPLING * edgeMassIntoDeck(cand, deckAnalyses);
      if (bucket.some(b => b.cost === cand.cost)) score *= CURVE_CLASH_PENALTY;
      scored.push({ item: { cand, reasons }, score });
    }
    const pick = softmaxPick(scored, GROWTH_TEMPERATURE);
    if (!pick) break;
    bucket.push(pick.cand);
    for (const r of pick.reasons) why.push(r);
  }
  return { bucket, why };
}

// Internal coherence = sum of pairwise edges. This is the anti-grab-bag gate.
function coherenceOf(bucket) {
  let sum = 0;
  for (let i = 0; i < bucket.length; i++) {
    for (let j = i + 1; j < bucket.length; j++) sum += edge(bucket[i], bucket[j]).w;
  }
  return sum;
}

// Loose fallback: a curve-spread trio of solid cards in deck colors. Exists
// so an offer can never come up empty (thin pools, exotic deck colors).
function reinforcementsBucket(deckColors, deckTplIds) {
  // Goodstuff's job is NEW power, never redundancy — cards you already own
  // are excluded (dupes are earned through synergy buckets, where a twin
  // must pull its weight via self-feeding edges). Cards are softmax-sampled
  // by intrinsic value, not top-sorted: a playtest caught the sort-with-
  // small-jitter version selling the player their exact deck back, three
  // offers in a row.
  const owned = new Set(deckTplIds || []);
  const legal = _pool.filter(c =>
    !c.isLand && !owned.has(c.tplId) && isLegalCandidate(c, [], deckColors));
  const bucket = [];
  while (bucket.length < BUCKET_CARDS) {
    const scored = [];
    for (const c of legal) {
      if (bucket.includes(c)) continue;
      if (!isLegalCandidate(c, bucket, deckColors)) continue;
      let v = ENGINE.getCardValue(CARDS[c.tplId], 'draft');
      if (bucket.some(b => b.cost === c.cost)) v *= CURVE_CLASH_PENALTY;
      if (v > 0) scored.push({ item: c, score: v });
    }
    const pick = softmaxPick(scored, 1);
    if (!pick) break;
    bucket.push(pick);
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// §4 Lands + naming + offer composition.
// ---------------------------------------------------------------------------
// Coverage-first at bucket scale: with only 2 land slots, every color the
// bucket actually needs gets a land before proportionality kicks in. (Pure
// largest-remainder rounds a U:3/B:1 bucket to island+island — faithful
// math, unplayable splash; playtest-caught.) Deck-wide allocation (17
// lands) stays proportional over in draft.js.
function landsForCards(cardTplIds) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const id of cardTplIds) {
    const tpl = CARDS[id];
    if (!tpl || !tpl.cost) continue;
    for (const k of PIP_COLORS) pips[k] += (tpl.cost[k] || 0);
  }
  const colors = PIP_COLORS.filter(k => pips[k] > 0)
    .sort((a, b) => pips[b] - pips[a]);
  if (colors.length === 0) return DRAFT.allocLandsFor(pips, BUCKET_LANDS);
  const out = [];
  for (let i = 0; i < BUCKET_LANDS; i++) {
    out.push(COLOR_TO_BASIC[colors[i % colors.length]]);
  }
  return out;
}
const COLOR_TO_BASIC = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };

// Bucket name = label of the resource carrying the most internal edge weight.
// Tribal resources win ties (a Goblin bucket should be named for goblins even
// when generic dies-edges carry similar mass).
function nameBucket(bucket) {
  const mass = {};
  for (let i = 0; i < bucket.length; i++) {
    for (let j = i + 1; j < bucket.length; j++) {
      const a = bucket[i], b = bucket[j];
      for (const [r, pw] of Object.entries(a.provides)) {
        if (b.wants[r]) mass[r] = (mass[r] || 0) + pw * b.wants[r] * idf(r);
      }
      for (const [r, pw] of Object.entries(b.provides)) {
        if (a.wants[r]) mass[r] = (mass[r] || 0) + pw * a.wants[r] * idf(r);
      }
      for (const t of a.tags) if (b.tags.has(t)) mass[t] = (mass[t] || 0) + W_HOMOPHILY;
    }
  }
  let best = null;
  let bestScore = 0;
  for (const [r, m] of Object.entries(mass)) {
    const tribalBoost = r.startsWith('sub:') ? 1.5 : 1;
    if (m * tribalBoost > bestScore) { bestScore = m * tribalBoost; best = r; }
  }
  if (!best) return THEME_NAMES.fallback;
  if (THEME_NAMES[best]) return THEME_NAMES[best];
  if (best.startsWith('sub:')) return best.slice(4) + ' Pack';
  return THEME_NAMES.fallback;
}

function finishBucket(bucketAnalyses, why) {
  const cards = bucketAnalyses.map(a => a.tplId);
  return {
    name: nameBucket(bucketAnalyses),
    cards,
    lands: landsForCards(cards),
    coherence: Math.round(coherenceOf(bucketAnalyses) * 10) / 10,
    why: Array.from(new Set(why)).slice(0, 6),
  };
}

// Seed selection. Identity seeds: softmax over the top-N cards by edge mass
// into the current deck (deck empty → by payoff-ness, so run-start "banner"
// buckets grow around lords and engine payoffs). Adjacent seed: a payoff the
// deck is NOT feeding yet — same colors, different plan.
// Seed selection: sample OFFER_SIZE seeds from the whole legal pool, each
// card weighted by its deck-affinity (sum of edge weights into every card
// you own; for an empty deck, by payoff-ness so run-start "banners" grow
// around lords and engine payoffs). Weights-as-weights, no head/band
// special cases: your wishlist shapes the ODDS, not the outcomes — the
// wishlist's top is likely, coherent-but-uncommitted plans are possible,
// and the long tail stays alive. Sampling is without replacement.
function pickSeeds(deckAnalyses, deckColors) {
  const candidates = _pool.filter(c =>
    !c.isLand && isLegalCandidate(c, [], deckColors));
  const payoffness = c => {
    let sum = 0;
    for (const v of Object.values(c.wants)) sum += v;
    return sum + (c.provides.anthem || 0);
  };
  const weightOf = c => deckAnalyses.length
    ? edgeMassIntoDeck(c, deckAnalyses)
    : payoffness(c);
  const entries = candidates.map(c => ({ c, w: SEED_BASE_WEIGHT + weightOf(c) }));
  const seeds = [];
  for (let k = 0; k < OFFER_SIZE && entries.length; k++) {
    let total = 0;
    for (const e of entries) total += e.w;
    if (total <= 0) break;
    let roll = _rand() * total;
    let picked = entries.length - 1;
    for (let i = 0; i < entries.length; i++) {
      roll -= entries[i].w;
      if (roll <= 0) { picked = i; break; }
    }
    seeds.push(entries[picked].c);
    entries.splice(picked, 1);   // without replacement
  }
  return seeds;
}

function rollBucketOffer(deckTplIds) {
  ensurePool();
  const deckIds = deckTplIds || [];
  const deckAnalyses = deckIds.map(id => _byId[id]).filter(Boolean);
  const deckColors = deckColorSet(deckIds);
  const offer = [];
  const usedNames = new Set();
  // Grow one bucket per seed. An offer of three identically-named plans is
  // a boring offer, so a bucket whose name duplicates an already-offered one
  // gets ONE retry with a fresh seed before being accepted anyway.
  const tryAddBucket = (seed) => {
    const { bucket, why } = growBucket(seed, deckAnalyses, deckColors);
    if (bucket.length === BUCKET_CARDS && coherenceOf(bucket) >= MIN_COHERENCE) {
      return finishBucket(bucket, why);
    }
    const loose = reinforcementsBucket(deckColors, deckIds);
    return (loose.length === BUCKET_CARDS) ? finishBucket(loose, []) : null;
  };
  const seeds = pickSeeds(deckAnalyses, deckColors);
  for (const seed of seeds) {
    if (offer.length >= OFFER_SIZE) break;
    let bucket = tryAddBucket(seed);
    if (bucket && usedNames.has(bucket.name)) {
      const retrySeeds = pickSeeds(deckAnalyses, deckColors)
        .filter(s => s.tplId !== seed.tplId && !offer.some(b => b.cards.includes(s.tplId)));
      if (retrySeeds.length) {
        const retry = tryAddBucket(retrySeeds[Math.floor(_rand() * retrySeeds.length)]);
        if (retry && !usedNames.has(retry.name)) bucket = retry;
      }
    }
    if (bucket) { usedNames.add(bucket.name); offer.push(bucket); }
  }
  // Backfill with Reinforcements if seeding starved (tiny pools, weird colors).
  while (offer.length < OFFER_SIZE) {
    const loose = reinforcementsBucket(deckColors, deckIds);
    if (loose.length < BUCKET_CARDS) break;
    offer.push(finishBucket(loose, []));
  }
  return offer;
}

function rollBucket(seedTplId, deckTplIds) {
  ensurePool();
  const seed = _byId[seedTplId];
  if (!seed) return null;
  const deckIds = deckTplIds || [];
  const deckAnalyses = deckIds.map(id => _byId[id]).filter(Boolean);
  const deckColors = deckColorSet(deckIds);
  const { bucket, why } = growBucket(seed, deckAnalyses, deckColors);
  return finishBucket(bucket, why);
}

// ---------------------------------------------------------------------------
// §6 Theme health report — one boot line; doubles as a card-design TODO list.
// ---------------------------------------------------------------------------
function themeHealthReport() {
  ensurePool();
  const tribes = {};   // subtype → {members, payoffs}
  for (const a of _pool) {
    for (const r of Object.keys(a.provides)) {
      if (!r.startsWith('sub:')) continue;
      tribes[r] = tribes[r] || { members: 0, payoffs: 0 };
      tribes[r].members++;
    }
    for (const r of Object.keys(a.wants)) {
      if (!r.startsWith('sub:')) continue;
      tribes[r] = tribes[r] || { members: 0, payoffs: 0 };
      tribes[r].payoffs++;
    }
  }
  const healthy = [];
  const thin = [];
  for (const [r, t] of Object.entries(tribes)) {
    if (t.payoffs === 0) continue;   // no payoff → not a theme, just a species
    const label = `${r.slice(4)}(${t.members})`;
    if (t.members >= 6) healthy.push(label); else thin.push(label);
  }
  return `Bucket themes: ${healthy.length} healthy [${healthy.sort().join(', ')}]` +
         (thin.length ? `; thin: [${thin.sort().join(', ')}]` : '');
}

return {
  rollBucketOffer,
  rollBucket,
  landsForCards,
  themeHealthReport,
  // Introspection (tests + future UI copy):
  analyzeCard: (tplId) => { ensurePool(); return _byId[tplId] || null; },
  edgeBetween: (aId, bId) => {
    ensurePool();
    const a = _byId[aId], b = _byId[bId];
    return (a && b) ? edge(a, b) : { w: 0, reasons: [] };
  },
  // Test seams:
  _resetCacheForTest: () => { _pool = null; _byId = null; },
  _setRandForTest: (fn) => { _rand = fn || Math.random; },
};
})();
