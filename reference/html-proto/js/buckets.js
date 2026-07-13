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

// Growth samples weights-as-weights like everything else, but SQUARES its
// weights first: a bundle must cohere, so strong edges should dominate —
// while seeds stay linear (offers should explore). Raising this sharpens
// buckets toward the platonic engine; 1 = flat proportional (measured too
// incoherent: ~19% Reinforcements fallback), 2 lands at ~6-8%.
const GROWTH_SHARPNESS = 2;
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
  'sub:Artifact': 'The Foundry',
  dies:      'Grave Bargains',
  discard:   'The Toll',
  opp_loss:  'Bloodletting',
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
  'discard', 'self_pain', 'opp_loss',
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
  // Effective keywords include the engine's subtype implications (Angel/Dragon
  // fly, Treefolk reach, Wall defends — engine.js SUBTYPE_KEYWORDS via the
  // shared addSubtypeKeywords helper). Reading raw keywords[] alone made the
  // graph blind to every implied keyword — found by a Wave 1.5 judge agent
  // citing engine.js:729 while killing a redundant "add flying to the Angel"
  // patch.
  const effKeywords = ENGINE.addSubtypeKeywords(
    (tpl.types || []), (tpl.keywords || []).slice());
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
  if (effKeywords.includes('lifelink')) bump(provides, 'lifegain', W_PROV_LIFE * 0.75);
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
  // Wave 1 vocabulary (~2 lines per niche; scope + rationale in
  // docs/plans/plan-pool-waves.md — bounce/deathtouch/reanimation rules were
  // measured but dropped with their cards; re-add when a card pays for them):
  if (kinds.some(k => k.kind === 'move_card' && k.from_zone === 'hand' && k.to_zone === 'graveyard' && k.scope === 'self')) bump(provides, 'discard', 2);
  if (kinds.some(k => (k.kind === 'gain_life' && (k.amount || 0) < 0 && k.scope === 'self') || (k.kind === 'damage' && k.scope === 'self'))) bump(provides, 'self_pain', 2);
  if ((kinds.some(k => k.kind === 'damage') && /player|opp|any/.test(String(tpl.target || '')))
      || kinds.some(k => k.kind === 'gain_life' && (k.amount || 0) < 0 && k.scope !== 'self')) bump(provides, 'opp_loss', 1);
  if (isCreature && hasType(tpl, 'Artifact')) bump(provides, 'sub:Artifact', W_PROV_SUBTYPE);
  // Wave 2 vocabulary (same ~2-lines-per-niche contract; each rule has a
  // shipped customer — deletions-are-wins applies if a niche ever empties):
  // landdrop: ramp puts extra lands onto the battlefield (landfall fuel).
  if (kinds.some(k => k.kind === 'move_card' && k.to_zone === 'battlefield'
      && k.filter && k.filter.type === 'Land')) bump(provides, 'landdrop', 2);
  // animate: turning lands into creatures (rootbound_sentinel's food).
  if (kinds.some(k => k.kind === 'add_type'
      && (Array.isArray(k.types) ? k.types : [k.type]).includes('Creature'))) bump(provides, 'animate', 2);
  // flashcast: a flash spell specifically (subset of spellcast — the
  // "qualified spellcast" wart: flash-matters payoffs must not wire to
  // every sorcery in the pool).
  if (isSpellCard && effKeywords.includes('flash')) bump(provides, 'flashcast', 1);
  // burnspell: a spell that deals damage (wildfire_colossus's diet).
  if (isSpellCard && kinds.some(k => k.kind === 'damage')) bump(provides, 'burnspell', 1);
  // trick: a spell aimed at YOUR creature (the protect/pump shelf —
  // sapling_tender and vigil_chanter reward casting these).
  if (isSpellCard && String(tpl.target || '') === 'your_creature') bump(provides, 'trick', 1);
  // carddraw: puts cards from library into hand (house ruling: tutors ARE
  // draws — "drawing = any library→hand move").
  if (kinds.some(k => k.kind === 'move_card' && k.from_zone === 'library'
      && k.to_zone === 'hand')) bump(provides, 'carddraw', 1);
  // activation: a non-mana activated ability (backlash_mage's providers).
  if ((tpl.abilities || []).some(ab =>
      (ab.effects || []).some(e => e && e.kind !== 'add_mana'))) bump(provides, 'activation', 1);
  // kw:flying: intrinsic/implied fliers feed the fliers-matter lord
  // (wing_commander). Scoped to flying while it is the only keyword with a
  // payoff — extend per-customer, not speculatively.
  if (isCreature && effKeywords.includes('flying')) bump(provides, 'kw:flying', 1);

  // --- WANTS ---
  // Trigger conditions. `this_card` triggers are self-referential (my own
  // ETB/death) — they are NOT a want on other cards, so we require the
  // trigger to plausibly fire off OTHER cards before recording a want.
  for (const trg of (tpl.triggers || [])) {
    const cs = [];
    collectKindsAndConds({ condition: trg.condition }, [], cs);
    const selfOnly = cs.includes('this_card');
    for (const s of cs) {
      // Any-of args (card_has_subtype(Elf, Merfolk) — Covenant Scholar) want
      // EACH named tribe; the old \w+ regex silently extracted nothing from
      // multi-arg predicates. A Land gate is landfall, not tribal: it wants
      // extra land DROPS (ramp), and "sub:Land" would spawn an unfeedable
      // bucket theme.
      const sub = s.match(/^card_has_subtype\(([^)]+)\)$/);
      if (sub) {
        for (const one of sub[1].split(/,\s*/)) {
          if (one === 'Land') bump(wants, 'landdrop', W_WANT_PAYOFF);
          else bump(wants, 'sub:' + one, W_WANT_PAYOFF);
        }
      }
      if (selfOnly) continue;
      if (/^card_moves\(battlefield,\s*graveyard\)$/.test(s)) bump(wants, 'dies', W_WANT_PAYOFF);
      if (/^card_moves\(hand,\s*graveyard\)$/.test(s)) bump(wants, 'discard', W_WANT_PAYOFF);
      if (/^card_moves\(library,\s*hand\)$/.test(s)) bump(wants, 'carddraw', W_WANT_PAYOFF);
      if (/^card_moves\([^)]*battlefield\)$/.test(s) && cs.includes('another_card')) {
        bump(wants, 'etb', W_WANT_PAYOFF);          // "when another creature enters" payoffs
      }
    }
    // Life-change payoffs are directional: a card fed by LOSS must not be
    // bucketed with lifegain providers (found as a 23-false-edge latent bug
    // during Wave 1 annotation — Gloomfang Leech registered wants:lifegain).
    if (trg.event === 'life_changed') {
      if (cs.includes('is_life_loss')) {
        bump(wants, cs.includes('affected_player_is(you)') ? 'self_pain' : 'opp_loss', W_WANT_PAYOFF);
      } else bump(wants, 'lifegain', W_WANT_PAYOFF);
    }
    // Qualified spell-cast payoffs want the QUALIFIED subset, not every
    // spell (the Wave 2 "qualified spellcast" wart): flash-matters and
    // cast-on-their-turn payoffs both feed on flash spells specifically.
    if (trg.event === 'spell_cast') {
      if (cs.some(s => /^card_has_keyword\(flash\)$/.test(s)) || cs.includes('opponents_turn')) {
        bump(wants, 'flashcast', W_WANT_PAYOFF);
      } else if (cs.some(s => /^card_has_effect\(damage\)$/.test(s))) {
        // Damage-spell payoffs (ashclot_zealot) feed on burn, not on every
        // sorcery — same qualified-spellcast reasoning as flashcast.
        bump(wants, 'burnspell', W_WANT_PAYOFF);
      } else {
        bump(wants, 'spellcast', W_WANT_PAYOFF);
      }
    }
    // Activations-matter (backlash_mage): fed by non-mana activated abilities.
    if (trg.event === 'ability_activated') bump(wants, 'activation', W_WANT_PAYOFF);
  }
  // Static spell riders reward CASTING: your-creature-targeted riders live
  // on the trick shelf; creature-targeted on tricks too; all-target riders
  // on any spell; damage-filtered riders on burn.
  for (const rd of (tpl.spell_riders || [])) {
    if (rd.spell_filter && rd.spell_filter.has_effect === 'damage') {
      bump(wants, 'burnspell', W_WANT_PAYOFF);
    } else if (rd.rider_scope === 'your_creature_targets' || rd.rider_scope === 'creature_targets') {
      bump(wants, 'trick', W_WANT_PAYOFF);
    } else {
      bump(wants, 'spellcast', W_WANT_PAYOFF);
    }
  }
  // Static buffs: tribal lords want their tribe; global anthems want width.
  for (const sb of (tpl.static_buffs || [])) {
    if (sb.subtype === 'Land') {
      // "Land creatures you control ..." (rootbound_sentinel) is fed by
      // animators, not by a Land tribe.
      bump(wants, 'animate', W_WANT_PAYOFF);
      bump(provides, 'anthem', 1);
    } else if (sb.subtype) {
      bump(wants, 'sub:' + sb.subtype, W_WANT_PAYOFF);
      bump(provides, 'anthem', 1);
    } else {
      bump(wants, 'wide', W_WANT_WIDE);
      // Keyword-filtered anthems also want that keyword on the board
      // (wing_commander: fliers-matter).
      if (sb.filter && sb.filter.has_keyword) {
        bump(wants, 'kw:' + sb.filter.has_keyword, W_WANT_PAYOFF);
      }
    }
  }
  // One-shot mass buffs (trigger or spell effects with scope all_yours) want
  // a wide board just like anthems — the Wave 2 "mass-buff wants:wide" wart:
  // warchanter / inspiring_herald / horned_herald / soulblade_captain (and
  // now steadfast_knight, overrun, rally_the_troops) were mis-measured as
  // wanting nothing.
  if (kinds.some(k => (k.kind === 'pump' || k.kind === 'grant_keyword') && k.scope === 'all_yours')) {
    bump(wants, 'wide', W_WANT_WIDE);
  }
  // Sacrifice costs: sac outlets WANT fodder and PRODUCE deaths.
  for (const ab of (tpl.abilities || [])) {
    if (ab.cost && ab.cost.sacrifice && ab.cost.sacrifice !== 'self') {
      bump(wants, 'fodder', W_WANT_PAYOFF);
      bump(provides, 'dies', W_PROV_TOKENS);
    }
  }

  // --- Plan tags (weak similarity: shared strategy, not producer/consumer) ---
  if (effKeywords.includes('flying')) tags.add('flying');
  if (effKeywords.includes('haste')) tags.add('aggro');
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

// The one HARD color law: a single bucket never spans more than two colors
// (a 3-color 3-card bundle isn't a plan, it's a pile). Deck fit is SOFT —
// see deckFitMultiplier: off-color candidates are down-weighted, never
// banned; whether a splash is castable is the player's call to make.
function isLegalCandidate(cand, bucket) {
  const bucketColors = new Set();
  for (const b of bucket) for (const c of b.colors) bucketColors.add(c);
  for (const c of cand.colors) bucketColors.add(c);
  return bucketColors.size <= 2;
}

// Weights-as-weights: draw one entry from [{item, w}], probability
// proportional to w. THE house sampling pattern — seeds, Reinforcements,
// and (candidate follow-up) growth all express "likelihood follows weight".
function weightedSample(entries) {
  let total = 0;
  for (const e of entries) total += e.w;
  if (total <= 0) return null;
  let roll = _rand() * total;
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

// Soft third-color handling (Joe's call: castability is a skill issue, not a
// law). A deck's first two colors are free; each ADDITIONAL new color a
// candidate would introduce multiplies its weight by this factor — off-color
// cards become rare temptations the player may decline, mirroring classic
// draft's escalating splash penalty instead of the old hard ban.
const OFF_COLOR_PENALTY = 0.05;
function deckFitMultiplier(cand, deckColors) {
  const newColors = cand.colors.filter(c => !deckColors.has(c)).length;
  const freeSlots = Math.max(0, 2 - deckColors.size);
  const penalized = Math.max(0, newColors - freeSlots);
  return penalized > 0 ? Math.pow(OFF_COLOR_PENALTY, penalized) : 1;
}


function growBucket(seedAnalysis, deckAnalyses, deckColors) {
  const bucket = [seedAnalysis];
  const why = [];
  while (bucket.length < BUCKET_CARDS) {
    const scored = [];
    for (const cand of _pool) {
      if (bucket.includes(cand)) continue;
      if (cand.isLand) continue;   // lands ride the dedicated land slots
      if (!isLegalCandidate(cand, bucket)) continue;
      let score = 0;
      const reasons = [];
      for (const b of bucket) {
        const e = edge(cand, b);
        score += e.w;
        for (const r of e.reasons) reasons.push(r);
      }
      // The plan gate: a candidate with NO edge into the bucket can't join,
      // no matter how much the deck likes it — the deck bonus below only
      // re-ranks cards that already serve the seed's plan.
      if (score <= 0) continue;
      score += DECK_COUPLING * edgeMassIntoDeck(cand, deckAnalyses);
      if (bucket.some(b => b.cost === cand.cost)) score *= CURVE_CLASH_PENALTY;
      // Fit is judged against deck colors PLUS colors this bucket already
      // introduces — otherwise each candidate would claim the free
      // new-color slot independently and a mono-color deck could be
      // offered a fully off-color two-color bundle at no penalty.
      const effColors = new Set(deckColors);
      for (const b of bucket) for (const c of b.colors) effColors.add(c);
      score *= deckFitMultiplier(cand, effColors);
      scored.push({ item: { cand, reasons }, score });
    }
    const pick = weightedSample(scored.map(e => ({ item: e.item, w: Math.pow(e.score, GROWTH_SHARPNESS) })));
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
  const legal = _pool.filter(c => !c.isLand && !owned.has(c.tplId));
  const bucket = [];
  while (bucket.length < BUCKET_CARDS) {
    const entries = [];
    for (const c of legal) {
      if (bucket.includes(c)) continue;
      if (!isLegalCandidate(c, bucket)) continue;
      let v = ENGINE.getCardValue(CARDS[c.tplId], 'draft');
      if (bucket.some(b => b.cost === c.cost)) v *= CURVE_CLASH_PENALTY;
      const effColors = new Set(deckColors);
      for (const b of bucket) for (const cc of b.colors) effColors.add(cc);
      v *= deckFitMultiplier(c, effColors);
      if (v > 0) entries.push({ item: c, w: v });
    }
    const pick = weightedSample(entries);
    if (!pick) break;
    bucket.push(pick);
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// §4 Lands + naming + offer composition.
// ---------------------------------------------------------------------------
// Bucket lands, in Joe's words: "What's the most common color? You get one
// of those! What's the second most common color? You get one of those!"
// (Mono-color buckets get two of the same; deck-wide 17-land allocation
// stays proportional in draft.js. Pure largest-remainder here rounded a
// U:3/B:1 bucket to island+island — playtest-caught.)
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
  const candidates = _pool.filter(c => !c.isLand);
  const payoffness = c => {
    let sum = 0;
    for (const v of Object.values(c.wants)) sum += v;
    return sum + (c.provides.anthem || 0);
  };
  const weightOf = c => deckAnalyses.length
    ? edgeMassIntoDeck(c, deckAnalyses)
    : payoffness(c);
  let entries = candidates.map(c => ({
    item: c,
    w: (SEED_BASE_WEIGHT + weightOf(c)) * deckFitMultiplier(c, deckColors),
  }));
  const seeds = [];
  for (let k = 0; k < OFFER_SIZE && entries.length; k++) {
    const pick = weightedSample(entries);
    if (!pick) break;
    seeds.push(pick);
    entries = entries.filter(e => e.item !== pick);   // without replacement
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
