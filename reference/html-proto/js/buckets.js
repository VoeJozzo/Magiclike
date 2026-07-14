// BUCKETS — synergy-graph bucket generation (the Growing Deck's card faucet).
//
// A bucket is a bundle of 3 cards + 2 basic lands that share a PLAN.
// The core idea: a cohesive bucket is a micro-engine — cards that COMPLETE
// each other (producer → consumer), not cards that merely resemble each
// other. Blood Artist doesn't want other drain cards; it wants things that
// die. The generator never decides "I'll build a Goblin bucket" — it picks
// a seed card and asks the graph "who wants to be near this card?"; the
// bucket's identity is its STORY (cards[0] is the seed, why[] the recruited
// friends' reasons), read straight off the growth edges. There used to be a
// derived display name on top (THEME_NAMES + dominant-edge nameBucket) —
// killed at v2.2.22: a second, parallel summarization of the same bucket
// that drifted from the story twice in one week (v2.2.15, v2.2.21).
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
//                       the odds, not the outcomes). Every grown bucket
//                       ships; seats that growth can't fill get one
//                       value-sampled card each (the per-slot fill). A
//                       whole value bundle (fallback: true — the UI's
//                       "Reinforcements") appears only if seeding itself
//                       starves, so offers never come up empty.
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
// There is deliberately NO copy of the old MIN_COHERENCE floor here: it was
// retired at v2.2.26 (Joe's call). The floor existed so incoherent buckets
// wouldn't ship wearing a lying theme label — labels died at v2.2.22, and an
// unlabeled weak bucket tells an honest weak story the player can decline
// with open eyes. Weak plans are now a product, not a failure.
// There is deliberately NO deck-wide copy cap (Joe's call, 2026-07-06): an
// earlier 4-copy rule here was an unauthorized import of MTG convention.
// Redundancy self-prices via the graph (self-feeding cards pull their own
// twins; pure payoffs don't) — and since v2.2.24 ALSO via the dupe shelf
// below, which is a gradient, never a cap.

// The dupe shelf (Joe's 3.1, 2026-07-13, "derived from anti-card-counting
// strategies"): imagine the pool holds n+1 copies of every card, where
// n = the max copy-count over your deck's NONBASIC slots (basics excluded —
// seventeen Forests would set n=17 and switch the mechanism off; nonbasic
// land piles are a deliberate identity and count). A candidate's weight is
// multiplied by its remaining shelf share, (n+1 − copies)/(n+1):
// fresh cards ride at ×1, your n-th copy at 1/(n+1) — never zero, and the
// wall RETREATS when touched: reaching n+1 copies of anything raises n,
// restocking the shelf for everyone ("you can always go deeper; it just
// gets progressively rarer"). Multiplicative on the same weights the graph
// already computes, so self-feeding twins survive (a second recruiter's
// mutual edges keep it competitive at ×½) while a second Murder's
// edgeless twin gets halved into oblivion — the discrimination falls out
// of the arithmetic, no rule written. Ledger note (Joe): this is demand-
// driven scarcity, "almost like tcgplayer — Tarmogoyf isn't actually rarer
// than Death's Shadow, just more people trying to put copies in their
// decks" — the same multiplier fed by pool-wide demand instead of deck
// copies would be an emergent global-rarity mechanism. That door is noted
// and deliberately NOT opened (his call, "which we do not currently").
function dupeShelf(deckTplIds) {
  const counts = {};
  let n = 0;
  for (const id of (deckTplIds || [])) {
    const tpl = CARDS[id];
    if (!tpl || hasType(tpl, 'Basic')) continue;
    counts[id] = (counts[id] || 0) + 1;
    if (counts[id] > n) n = counts[id];
  }
  return { counts, n };
}
function dupeFactor(tplId, shelf) {
  const copies = shelf.counts[tplId] || 0;
  if (copies === 0) return 1;
  return (shelf.n + 1 - copies) / (shelf.n + 1);
}

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
// Direction-split vocabulary (Joe, 2026-07-14): deaths and discards carry
// WHOSE side the event happens on — 'your_dies' (sacrifice/token/combat/
// sweeper deaths on your side), 'opp_dies' (removal-made deaths on theirs),
// 'self_discard' (your cards hitting the graveyard). Any-death payoffs want
// both dies directions; side-gated payoffs want their side only.
const HINT_RESOURCES = new Set([
  'your_dies', 'opp_dies', 'fodder', 'etb', 'lifegain', 'spellcast', 'wide',
  'anthem', 'self_discard', 'self_pain', 'opp_loss',
  // eot_buff: whitelisted for Elystra (v2.2.25 as trick, refined v2.2.30) —
  // her permanence wants until-EOT buffs specifically (eot_buff), not
  // your-creature targeting generically; hints are exactly how a
  // custom-kind card declares that (she was this mechanism's design
  // exemplar all along).
  'eot_buff',
  'trick',
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
      bump(provides, 'your_dies', W_PROV_TOKENS);
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
    if (cost <= 2) bump(provides, 'your_dies', W_PROV_DIES_CHEAP);
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
  // DIRECTION CONVENTION: 'self_discard' = YOUR OWN cards hitting the
  // graveyard (looting fuel) — the sole wanter (toll_of_secrets) hears only
  // controlled_by(you) discards, hence scope self here. OPP-discard effects
  // (duress, mind_rot, hypnotic_specter) deliberately provide nothing; the
  // day an opp-discard payoff ships ("when your opponent discards, ..."),
  // it wants a NEW resource (opp_discard) with those cards as providers.
  if (kinds.some(k => k.kind === 'move_card' && k.from_zone === 'hand' && k.to_zone === 'graveyard' && k.scope === 'self')) bump(provides, 'self_discard', 2);
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
  if (isSpellCard && String(tpl.target || '') === 'your_creature') {
    bump(provides, 'trick', 1);
    // eot_buff: the subset of tricks whose payload is an until-EOT buff
    // (pump / keyword grant — EOT is the engine default duration). Elystra's
    // permanence wants THESE, not tricks generically: Cloudshift targets
    // your creature but flickering her resets her buffs AND rips the spell
    // (Joe: "ripping stuff up is actually a downside").
    if (kinds.some(k => k.kind === 'pump' || k.kind === 'grant_keyword')) {
      bump(provides, 'eot_buff', 1);
    }
  }
  // carddraw: puts cards from library into hand (house ruling: tutors ARE
  // draws — "drawing = any library→hand move").
  if (kinds.some(k => k.kind === 'move_card' && k.from_zone === 'library'
      && k.to_zone === 'hand')) bump(provides, 'carddraw', 1);
  // activation: a non-mana activated ability (backlash_mage's providers).
  if ((tpl.abilities || []).some(ab =>
      (ab.effects || []).some(e => e && e.kind !== 'add_mana'))) bump(provides, 'activation', 1);
  // tapability: a TAP-COST ability specifically (mana dorks included —
  // untapping llanowar_elves is real value). Split from 'activation' at
  // Joe's direction: awaken_the_stone must not pull furnace_whelp, whose
  // {R}-pump activation gains nothing from untapping.
  if (isCreature && (tpl.abilities || []).some(ab => ab.cost && ab.cost.tap)) {
    bump(provides, 'tapability', 1);
  }
  // counterspell: a spell that counters (counter_specialist's diet — the
  // third arm of the qualified-spellcast family, found by the broad
  // gated-on-X audit).
  if (isSpellCard && kinds.some(k => k.kind === 'counter')) bump(provides, 'counterspell', 1);
  // kw:flying: intrinsic/implied fliers feed the fliers-matter lord
  // (wing_commander). Scoped to flying while it is the only keyword with a
  // payoff — extend per-customer, not speculatively.
  if (isCreature && effKeywords.includes('flying')) bump(provides, 'kw:flying', 1);

  // --- Extraction-audit sweep (Joe, post-Wave-2): (target, filter) pairs at
  // every authoring level, for filter-driven wants like "destroy target
  // TAPPED creature". Doctrine (Joe's generalization): ANY card gated on X
  // being true potentially wants X — the want ships when (a) your deck can
  // manufacture X (choking_vines' flying-gate stays parked: every granter
  // in the pool is your-side-only; fuse = the first generic flying-granter)
  // and (b) the gate exploits X rather than self-restricts (sage's own-
  // creature tapped filter). Direction convention: the card that is nearly
  // DEAD ALONE holds the want — and direction is load-bearing even though
  // today's edge formula is symmetric: legibility, the payoff census reads
  // wants, and hub-group placement (provides never attract provides, so
  // threaten-as-fodder-PROVIDER pulls sac outlets without pulling token
  // makers — Joe's right-side-of-the-equation rule).
  const targetSteps = [{ t: tpl.target, f: tpl.target_filter }];
  for (const src of [tpl, ...(tpl.triggers || []), ...(tpl.abilities || [])]) {
    if (src !== tpl) targetSteps.push({ t: src.target, f: src.target_filter });
    for (const sp of (src.target_slots || [])) targetSteps.push({ t: sp.target, f: sp.filter });
  }
  // tapped: tap-effects feed the destroy-tapped suite (smite_the_wicked,
  // royal_assassin, righteous_judge).
  if (kinds.some(k => k.kind === 'affect_creature' && k.severity === 'tap')) {
    bump(provides, 'tapped', 2);
  }
  // Blink (bf→exile + exile→bf) re-fires YOUR ETBs and dodges sweepers;
  // bounce-your-own does both more weakly (replay costs the mana again).
  const blinks = kinds.some(k => k.kind === 'move_card' && k.from_zone === 'battlefield' && k.to_zone === 'exile')
    && kinds.some(k => k.kind === 'move_card' && k.from_zone === 'exile' && k.to_zone === 'battlefield');
  // A GENERIC creature target includes yours (Joe's correction, 2026-07-13:
  // "your etb value deck will get more out of it than their deck bc they
  // didn't build around that") — wash_away can always be pointed inward,
  // so it provides the same replay/dodge value as a printed
  // "creature you control" bounce. Only opp-locked targets are excluded.
  const bouncesOwn = kinds.some(k => k.kind === 'affect_creature' && k.severity === 'bounce')
    && targetSteps.some(s => s.t === 'your_creature' || s.t === 'creature');
  // Mass bounce (wash_away, devastation_tide) rebuys your WHOLE board's
  // ETBs and dodges a wrath in response — Evacuation-plus-Processional is a
  // real archetype. Symmetry (their board bounces too) is priced into the
  // modest weights.
  const massBounce = kinds.some(k => k.kind === 'affect_creature' && k.severity === 'bounce'
    && /^all/.test(String(k.scope || '')));
  if (blinks) { bump(provides, 'etb', 1.5); bump(provides, 'wrathproof', 1.5); }
  if (massBounce) { bump(provides, 'etb', 1.5); bump(provides, 'wrathproof', 1.5); }
  else if (bouncesOwn) { bump(provides, 'etb', 0.75); bump(provides, 'wrathproof', 1); }
  // etbtrigger: creatures whose triggers fire on entry carry re-usable ETB
  // VALUE — distinct from 'etb' (every body enters; only these are worth
  // re-entering). Blink is nearly dead pointed at a vanilla bear and
  // excellent pointed at pyromaniac, so blink holds the want (below).
  if (isCreature && (tpl.triggers || []).some(t => triggerFiresOnEnter(t))) {
    bump(provides, 'etbtrigger', 1);
  }
  // Indestructible grants are the direct sweeper insurance (cinder_ward).
  if (kinds.some(k => k.kind === 'grant_keyword' && k.keyword === 'indestructible')) {
    bump(provides, 'wrathproof', 2);
  }
  // Temporary (or permanent) theft hands the sac outlets a body that was
  // never yours — the killer's "makes Threaten a two-for-one" play pattern.
  if (kinds.some(k => k.kind === 'change_control')) {
    bump(provides, 'fodder', 1.5);
    bump(provides, 'your_dies', 1);   // the stolen body dies under YOUR control
  }
  // Removal MANUFACTURES death events, and any-death payoffs (blood_artist's
  // archetype has no controller term — it hears THEIR creatures dying) feed
  // on them: "Murder feeds Blood Artist [dies]" is the organic road into a
  // deck that wants deaths (Joe's sweep follow-up, 2026-07-13). Destroy
  // effects only — exile and bounce make no death event. Damage-based
  // removal kills via SBAs, slightly less reliably (survivors, face mode).
  // ANY card shape counts (Joe's rule-shape audit, 2026-07-14): the v2.2.19
  // rule was spell-scoped for no semantic reason, leaving chupacabra's ETB
  // destroy (a blinkable death engine) and royal_assassin's repeatable
  // tap-destroy providing dies 0 while one-shot Murder provided 1.
  if (kinds.some(k => k.kind === 'affect_creature' && k.severity === 'destroy')) {
    bump(provides, 'opp_dies', 1);   // you point removal at THEIR creatures
    // A sweeper kills your board too — wraths genuinely feed your-side
    // death payoffs (charnel_shaman hears your creatures die to Pyroclasm).
    if (kinds.some(k => k.kind === 'affect_creature' && k.severity === 'destroy'
        && /^all/.test(String(k.scope || '')))) {
      bump(provides, 'your_dies', 1);
    }
  }
  if (isSpellCard && kinds.some(k => k.kind === 'damage' && !k.scope)
      && targetSteps.some(st => /creature/.test(String(st.t || '')))) {
    bump(provides, 'opp_dies', 0.75);
  }
  if (kinds.some(k => k.kind === 'fight')) bump(provides, 'opp_dies', 0.75);

  // --- WANTS ---
  // Trigger conditions. `this_card` triggers are self-referential (my own
  // ETB/death) — they are NOT a want on other cards, so we require the
  // trigger to plausibly fire off OTHER cards before recording a want.
  for (const trg of (tpl.triggers || [])) {
    const cs = [];
    collectKindsAndConds({ condition: trg.condition }, [], cs);
    const selfOnly = cs.includes('this_card');
    // A subtype-gated entry trigger ("whenever another GOBLIN enters") is a
    // payoff for that tribe, NOT for bodies in general — the tribal want is
    // recorded by the card_has_subtype arm below, and the generic etb want
    // must stay silent or the drummer wires to every creature in the pool
    // (Joe's playtest catch, 2026-07-14: "why is there an etb connection
    // between war drummer and cult priest?" — a Human Cleric that can never
    // fire it). Same qualified-payoff wart family as flashcast/burnspell.
    const subGatedEntry = cs.some(x => /^card_has_subtype\(/.test(x));
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
      // The gate test for dies wants (doctrine, per the 2026-07-14 rule-shape
      // audit): keep the generic want when dies-PROVIDERS stay useful under
      // the trigger's gate, drop it when they don't.
      //  - subtype gate ("whenever a DEMON dies", rakdos_underboss): KEEP —
      //    a sac outlet sacrifices YOUR demons. (Contrast the entry rule
      //    below: a wrong-tribe body can never fire a gated entry trigger.)
      //  - controlled_by(you) ("a creature you control dies",
      //    charnel_shaman): KEEP — outlets, token deaths, and combat all
      //    qualify; only the removal arm is wasted.
      //  - card_damaged_by_this ("a creature THIS damaged dies",
      //    sengir_vampire, endomorph): DROP — no external death-
      //    manufacturer qualifies; the card feeds itself by fighting.
      //    (Its real want is fight spells — parked until that resource
      //    has a second customer.)
      if (/^card_moves\(battlefield,\s*graveyard\)$/.test(s)
          && !cs.includes('card_damaged_by_this')) {
        // Direction split (Joe): "a creature dies" hears both sides; "a
        // creature YOU CONTROL dies" (charnel_shaman) is fed by outlets,
        // tokens, sweepers, and combat — never by targeted removal.
        bump(wants, 'your_dies', W_WANT_PAYOFF);
        if (!cs.some(x => /^controlled_by\(you\)$/.test(x))) {
          bump(wants, 'opp_dies', W_WANT_PAYOFF);
        }
      }
      if (/^card_moves\(hand,\s*graveyard\)$/.test(s)) bump(wants, 'self_discard', W_WANT_PAYOFF);
      if (/^card_moves\(library,\s*hand\)$/.test(s)) bump(wants, 'carddraw', W_WANT_PAYOFF);
      if (/^card_moves\([^)]*battlefield\)$/.test(s) && cs.includes('another_card')
          && !subGatedEntry) {
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
      } else if (cs.some(s => /^card_has_effect\(counter\)$/.test(s))) {
        // Counterspell payoffs (counter_specialist) feed on counterspells —
        // the broad audit caught this arm wanting generic spellcast.
        bump(wants, 'counterspell', W_WANT_PAYOFF);
      } else {
        bump(wants, 'spellcast', W_WANT_PAYOFF);
      }
    }
    // A lost-life-this-turn gate is a payoff for opponent life loss no
    // matter which event carries it (bloodlust_berserker rides 'attacks' —
    // the broad audit caught it wanting nothing).
    if (cs.some(s => /^lost_life_this_turn\(opp\)$/.test(s))) {
      bump(wants, 'opp_loss', W_WANT_PAYOFF);
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
      bump(provides, 'your_dies', W_PROV_TOKENS);
    }
  }
  // Extraction-audit wants (sweep, post-Wave-2):
  // "Destroy target TAPPED creature" is a payoff for tapping — but a tapped
  // filter on YOUR OWN creature (sage_of_the_wilds' untap) is a legality
  // nicety, not a want.
  if (targetSteps.some(s => s.f && s.f.tapped === true && s.t !== 'your_creature')) {
    bump(wants, 'tapped', W_WANT_PAYOFF);
  }
  // Symmetric sweepers want board-wipe insurance (cinder_ward's whole plan:
  // one-side your own wrath; blink/bounce dodge it too).
  if (kinds.some(k => k.scope === 'all_creatures'
      && (k.kind === 'damage' || (k.kind === 'affect_creature' && k.severity === 'destroy')))) {
    bump(wants, 'wrathproof', 2);
  }
  // Graveyard consumers (grave_digger, deepseam_quarry) feed on creatures
  // dying — the reanimation-wants rule Wave 1 measured then dropped,
  // re-added now that the sweep confirmed two live customers. A consumer
  // locked to the OPPONENT's graveyard (seal_thief_courier's hate trigger)
  // is meta, not deck synergy.
  if (targetSteps.some(s => s.t === 'graveyard_card'
      && !(s.f && Array.isArray(s.f.graveyards) && s.f.graveyards.length === 1 && s.f.graveyards[0] === 'opp'))) {
    bump(wants, 'your_dies', 2);   // your graveyard fills from YOUR deaths
  }
  // Untap-your-creature effects want TAP-COST machines specifically
  // (awaken_the_stone + pyromaniac yes, furnace_whelp no — Joe's
  // disambiguation of the original activation-flavored version).
  if (kinds.some(k => k.kind === 'untap') && targetSteps.some(s => s.t === 'your_creature')) {
    bump(wants, 'tapability', 2);
  }
  // Blink/bounce-own want ETB VALUE to re-fire (the flicker-deck edge —
  // surfaced by Joe's direction review of the sweep). Mass bounce wants it
  // hardest: every ETB creature multiplies the rebuy.
  if (blinks || massBounce) bump(wants, 'etbtrigger', W_WANT_PAYOFF);
  else if (bouncesOwn) bump(wants, 'etbtrigger', 2);

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
// see colorFitFactor: off-color candidates are down-weighted by commitment,
// never banned; whether a splash is castable is the player's call to make.
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

// Presence-pull color allocation (Joe's 2.1, 2026-07-13 — replaces the old
// deckFitMultiplier ×0.05-per-extra-color cliff, which was commitment-blind
// — one white card fenced a third color exactly as hard as twelve — and
// near-banned marginal splashes via the free-slot + magic-constant shape).
// What survives from 2.1: the commitment curriculum. Empty and mono decks
// explore freely ("when you start, no color pull; your first color, still
// no pull"); once ≥2 colors are committed, off-color candidates are
// suppressed by base^(C·offFraction) — the fence scales continuously with
// how many colors you've committed (C) and with how off-color the card is
// (offFraction = share of its pip-colors the deck does NOT own, so a
// half-in-color gold card is fenced far less than a fully foreign one:
// the marginal-splash legalization the cliff denied).
// What did NOT survive: the additive form ("(color_pull)+(want pull)").
// Measured 2026-07-13 (200 simulated 7-pick drafts per k, random picker):
// additive pull at k=0.5..3 collapsed clean-two-color decks 83.5%→≤10%,
// sprawled decks to 4-5 colors, and drove the fallback rate 16%→30-44%
// (rising with k) — same mechanism as the ε-value dead end (plan doc §8b):
// additive uniform bonuses flatten within-group ranking and can't produce
// the ~20× between-group suppression colors need. Color force must be
// MULTIPLICATIVE. One knob (`let` for the _setColorPullForTest sweep seam);
// measured origin 0.3 (v2.2.23), re-tuned to 0.25 when the dupe shelf
// shifted weight toward fresh (disproportionately off-color) cards and
// softened the color shape — 0.25 under the shelf reproduces the 0.3
// pre-shelf histogram (v2.2.24 changelog has both tables).
let SPLASH_BASE = 0.25;
function colorFitFactor(cand, deckColors) {
  const C = deckColors.size;
  if (C <= 1 || cand.colors.length === 0) return 1;
  const off = cand.colors.filter(c => !deckColors.has(c)).length;
  if (off === 0) return 1;
  return Math.pow(SPLASH_BASE, C * (off / cand.colors.length));
}


function growBucket(seedAnalysis, deckAnalyses, deckColors, shelf) {
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
      // Color fence toward the DECK's committed colors (the deck is the
      // color identity; the bucket's own ≤2-color law is enforced by
      // isLegalCandidate above). Multiplicative, post-gate — the plan
      // stays sovereign; the fence only reweights plan-legal candidates.
      score *= colorFitFactor(cand, deckColors);
      score *= dupeFactor(cand.tplId, shelf);
      if (bucket.some(b => b.cost === cand.cost)) score *= CURVE_CLASH_PENALTY;
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

// Per-slot value fill (Joe's design, v2.2.26 — the Reinforcements
// retirement): when growth strands below BUCKET_CARDS (no gate-legal
// candidates left), the empty seats are filled one card at a time by the
// goodstuff logic — value-weighted, color-fenced, never a card you own
// (new power: the old bundles' contract, kept). A filled seat is a natural
// tail seat: a value outlet that fires exactly when synergy is exhausted —
// the honest micro-form of the value channel the ε experiments couldn't
// build additively (plan-bucket-draft §8b).
function valueFillSeats(bucket, why, deckColors, deckTplIds) {
  const owned = new Set(deckTplIds || []);
  while (bucket.length < BUCKET_CARDS) {
    const entries = [];
    for (const c of _pool) {
      if (c.isLand || bucket.includes(c) || owned.has(c.tplId)) continue;
      if (!isLegalCandidate(c, bucket)) continue;
      let v = ENGINE.getCardValue(CARDS[c.tplId], 'draft');
      if (bucket.some(b => b.cost === c.cost)) v *= CURVE_CLASH_PENALTY;
      v *= colorFitFactor(c, deckColors);
      if (v > 0) entries.push({ item: c, w: v });
    }
    const pick = weightedSample(entries);
    if (!pick) break;
    bucket.push(pick);
    why.push(`${pick.tplId} joins [value]`);
  }
}

// Loose fallback: a curve-spread trio of solid cards in deck colors. Since
// v2.2.26 this fires ONLY when seeding itself starves (the offer backfill
// loop — tiny pools, pool exhaustion); normal offers never fall back.
function reinforcementsBucket(deckColors, deckTplIds) {
  // Goodstuff's job is NEW power, never redundancy — cards you already own
  // are excluded (dupes are earned through synergy buckets, where a twin
  // must pull its weight via self-feeding edges), which is why the dupe
  // shelf isn't applied here: every remaining candidate sits at factor 1
  // by construction. Cards are softmax-sampled
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
      v *= colorFitFactor(c, deckColors);
      if (v > 0) entries.push({ item: c, w: v });
    }
    const pick = weightedSample(entries);
    if (!pick) break;
    bucket.push(pick);
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// §4 Lands + offer composition.
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

function finishBucket(bucketAnalyses, why, isFallback) {
  const cards = bucketAnalyses.map(a => a.tplId);
  return {
    // The fallback flag IS the contract line: a seed-grown bucket carries a
    // story (cards[0] = seed, why[] = recruited friends' reasons); a
    // value-sampled goodstuff bundle carries neither and must say so —
    // its cards can share accidental edge mass, and a story implies a
    // synergy contract that value-sampling never made (v2.2.21's bug, when
    // this distinction was carried by a derived display name instead).
    fallback: !!isFallback,
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
function pickSeeds(deckAnalyses, deckColors, shelf) {
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
    w: (SEED_BASE_WEIGHT + weightOf(c)) * colorFitFactor(c, deckColors)
       * dupeFactor(c.tplId, shelf),
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
  // Grow one bucket per seed. Offer-level plan diversity is carried by seed
  // sampling without replacement; the old name-dedup retry (re-roll a bucket
  // whose derived display name collided with an already-offered one) died
  // with the naming system — it was string-keyed on a cosmetic proxy and
  // leaked in both directions. If PICKLOG shows offers converging on one
  // plan, the principled replacement is seed-level MMR, not a name check.
  const shelf = dupeShelf(deckIds);
  // Every grown bucket ships (the coherence floor died with the labels —
  // see the §0 note); stranded seats get value-filled per slot.
  const tryAddBucket = (seed) => {
    const { bucket, why } = growBucket(seed, deckAnalyses, deckColors, shelf);
    valueFillSeats(bucket, why, deckColors, deckIds);
    return (bucket.length === BUCKET_CARDS) ? finishBucket(bucket, why) : null;
  };
  const seeds = pickSeeds(deckAnalyses, deckColors, shelf);
  for (const seed of seeds) {
    if (offer.length >= OFFER_SIZE) break;
    const bucket = tryAddBucket(seed);
    if (bucket) offer.push(bucket);
  }
  // Backfill with Reinforcements if seeding starved (tiny pools, weird colors).
  while (offer.length < OFFER_SIZE) {
    const loose = reinforcementsBucket(deckColors, deckIds);
    if (loose.length < BUCKET_CARDS) break;
    offer.push(finishBucket(loose, [], true));
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
  const { bucket, why } = growBucket(seed, deckAnalyses, deckColors, dupeShelf(deckIds));
  valueFillSeats(bucket, why, deckColors, deckIds);
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
  _setColorPullForTest: (k) => { SPLASH_BASE = (typeof k === 'number') ? k : 0.3; },
  _valueFillForTest: (bucketTplIds, deckTplIds) => {
    ensurePool();
    const bucket = (bucketTplIds || []).map(id => _byId[id]).filter(Boolean);
    const why = [];
    valueFillSeats(bucket, why, deckColorSet(deckTplIds || []), deckTplIds || []);
    return { cards: bucket.map(a => a.tplId), why };
  },
  _dupeFactorForTest: (tplId, deckTplIds) => dupeFactor(tplId, dupeShelf(deckTplIds)),
};
})();
