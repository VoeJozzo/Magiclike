// BUCKETS core: extraction rules, labeled edges, seed-and-grow invariants,
// offer composition, naming, and the Reinforcements fallback.
//
// The generator is stochastic by design (softmax sampling), so most
// assertions are STRUCTURAL INVARIANTS checked across many rolls (size,
// colors, coherence floor, land count) rather than exact contents.
// Known-card extraction facts (Goblin Chieftain is a Goblin payoff, Goblin
// Rabble's tokens feed sac outlets, ...) pin the rule table itself.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// --- §1 extraction rules pin known cards -----------------------------------
{
  const chieftain = BUCKETS.analyzeCard('goblin_chieftain');
  check('chieftain WANTS sub:Goblin (lord payoff)', chieftain.wants['sub:Goblin'] > 0);
  check('chieftain PROVIDES sub:Goblin (is a goblin)', chieftain.provides['sub:Goblin'] > 0);

  const rabble = BUCKETS.analyzeCard('goblin_rabble');
  check('rabble PROVIDES sub:Goblin via token_id', rabble.provides['sub:Goblin'] > 0);
  check('rabble PROVIDES fodder + dies (token maker)',
    rabble.provides.fodder > 0 && rabble.provides.dies > 0);

  const artist = BUCKETS.analyzeCard('blood_artist');
  check('blood_artist WANTS dies (death payoff)', artist.wants.dies > 0);

  const feeder = BUCKETS.analyzeCard('carrion_feeder');
  check('carrion_feeder WANTS fodder (sac outlet)', feeder.wants.fodder > 0);
  check('carrion_feeder PROVIDES dies (sac outlets produce deaths)', feeder.provides.dies > 0);

  const pridemate = BUCKETS.analyzeCard('ajanis_pridemate');
  check('pridemate WANTS lifegain (life_changed trigger)', pridemate.wants.lifegain > 0);

  const bolt = BUCKETS.analyzeCard('lightning_bolt');
  check('bolt has aggro plan tag (face damage = the race plan)', bolt.tags.has('aggro'));

  // Humans are NOT special-cased: they provide their subtype like any tribe.
  // Nothing in today's pool WANTS them (a pool fact, not a ban) — so Human
  // generates zero edges until someone ships a Human payoff, at which point
  // Human tribal simply starts working with no code change.
  const knight = BUCKETS.analyzeCard('white_knight');
  check('Humans provide sub:Human like any tribe (no exclusion list)',
    knight && knight.provides['sub:Human'] > 0);
  const anyHumanWant = Object.keys(CARDS).find(id => {
    const a = BUCKETS.analyzeCard(id);
    return a && a.wants['sub:Human'];
  });
  check('today: nothing wants Humans (documents the pool, not a rule)', !anyHumanWant);

  // this_card self-triggers must not register wants on other cards: an ETB
  // "when THIS enters, X" card is not an ally-ETB payoff.
  const selfEtb = Object.keys(CARDS)
    .map(id => ({ id, tpl: CARDS[id] }))
    .find(({ tpl }) => (tpl.triggers || []).some(t =>
      Array.isArray(t.condition) && t.condition.includes('this_card') &&
      t.condition.some(c => /card_moves\([^)]*battlefield\)/.test(c))));
  if (selfEtb) {
    const a = BUCKETS.analyzeCard(selfEtb.id);
    check(`self-ETB card (${selfEtb.id}) does not WANT etb`, !a || !a.wants.etb);
  }
}

// --- §2 labeled edges -------------------------------------------------------
{
  const e = BUCKETS.edgeBetween('goblin_rabble', 'carrion_feeder');
  check('rabble↔feeder edge > 0 (fodder feeds the sac outlet)', e.w > 0);
  check('edge carries a human-readable reason mentioning fodder',
    e.reasons.some(r => r.includes('[fodder]')), JSON.stringify(e.reasons));

  const lord = BUCKETS.edgeBetween('goblin_rabble', 'goblin_chieftain');
  check('rabble↔chieftain edge (tokens ARE goblins)', lord.w > 0);

  const island = BUCKETS.edgeBetween('counterspell', 'goblin_chieftain');
  const tribal = lord.w;
  check('counterspell↔chieftain weaker than rabble↔chieftain (islands stay islands)',
    island.w < tribal, `island=${island.w} tribal=${tribal}`);
}

// --- §3 bucket invariants across many rolls ---------------------------------
{
  const PIP_COLORS = ['W', 'U', 'B', 'R', 'G'];
  const colorsOfTpl = tpl => PIP_COLORS.filter(k => (tpl.cost || {})[k] > 0);
  let sizeOk = true, landOk = true, colorOk = true, nameOk = true;
  const seenNames = new Set();
  // A committed two-color deck: bucket cards must stay castable inside it.
  const deck = ['goblin_piercer', 'raging_goblin', 'blood_artist', 'carrion_feeder',
                'mountain', 'mountain', 'swamp', 'swamp'];
  for (let i = 0; i < 40; i++) {
    const offer = BUCKETS.rollBucketOffer(deck);
    if (offer.length !== 3) sizeOk = false;
    for (const b of offer) {
      seenNames.add(b.name);
      if (b.cards.length !== 3 || b.lands.length !== 2) sizeOk = false;
      if (!b.name || typeof b.name !== 'string') nameOk = false;
      for (const id of b.cards) {
        const cols = colorsOfTpl(CARDS[id]);
        if (cols.some(c => c !== 'B' && c !== 'R')) colorOk = false;
      }
      for (const id of b.lands) {
        const tpl = CARDS[id];
        if (!tpl || !hasType(tpl, 'Basic')) landOk = false;
      }
    }
  }
  check('every offer is 3 buckets of 3 cards + 2 lands (40 rolls)', sizeOk);
  check('bucket lands are basic lands', landOk);
  check('bucket cards stay inside the deck\'s colors (BR)', colorOk);
  check('every bucket has a name', nameOk);
  check('offers vary across rolls (softmax, not argmax)', seenNames.size >= 3,
    [...seenNames].join(', '));
}

// --- §3b second-color expansion + offer name diversity -----------------------
{
  // A mono-color deck must NOT lock the run to one color: while the deck has
  // <2 colors, buckets may introduce a second (browser-verified regression —
  // the SPELLSTORM×3 lockout).
  const monoRed = ['raging_goblin', 'goblin_piercer', 'lightning_bolt',
                   'mountain', 'mountain'];
  const PIP_COLORS = ['W', 'U', 'B', 'R', 'G'];
  let sawSecondColor = false;
  let colorBudgetOk = true;
  let diverseOffers = 0;
  for (let i = 0; i < 15; i++) {
    const offer = BUCKETS.rollBucketOffer(monoRed);
    const names = new Set(offer.map(b => b.name));
    if (names.size >= 2) diverseOffers++;
    for (const b of offer) {
      const cols = new Set(['R']);
      for (const id of b.cards) {
        for (const k of PIP_COLORS) if ((CARDS[id].cost || {})[k] > 0) cols.add(k);
      }
      if (cols.size > 2) colorBudgetOk = false;
      if (cols.size === 2) sawSecondColor = true;
    }
  }
  check('mono-color deck: buckets can introduce a second color', sawSecondColor);
  check('...but never a third (deck identity stays ≤2 colors)', colorBudgetOk);
  check('offers usually carry ≥2 distinct plan names', diverseOffers >= 10,
    `${diverseOffers}/15`);
}

// --- §4 run-start (empty deck) offers ---------------------------------------
{
  let ok = true, twoColorOk = true;
  for (let i = 0; i < 20; i++) {
    const offer = BUCKETS.rollBucketOffer([]);
    if (offer.length !== 3) ok = false;
    for (const b of offer) {
      const cols = new Set();
      for (const id of b.cards) {
        for (const k of ['W', 'U', 'B', 'R', 'G']) {
          if ((CARDS[id].cost || {})[k] > 0) cols.add(k);
        }
      }
      if (cols.size > 2) twoColorOk = false;
    }
  }
  check('empty-deck (banner) offers materialize', ok);
  check('banner buckets stay ≤2 colors (the pick chooses run colors)', twoColorOk);
}

// --- §5 seeded bucket + naming ----------------------------------------------
{
  const b = BUCKETS.rollBucket('goblin_chieftain', []);
  check('seeded bucket contains its seed', b.cards.includes('goblin_chieftain'));
  check('seeded goblin bucket coherence > 0', b.coherence > 0, `coherence=${b.coherence}`);

  // Naming: run several rolls; a chieftain-seeded bucket should usually be
  // named for goblins (tribal boost), never nameless.
  let goblinNamed = 0;
  for (let i = 0; i < 12; i++) {
    const roll = BUCKETS.rollBucket('goblin_chieftain', []);
    if (roll.name === 'Goblin Warband') goblinNamed++;
  }
  check('chieftain-seeded buckets usually named Goblin Warband', goblinNamed >= 8,
    `${goblinNamed}/12`);
}

// --- §6 lands follow bucket pips --------------------------------------------
{
  const lands = BUCKETS.landsForCards(['lightning_bolt', 'shock', 'raging_goblin']);
  check('mono-red bucket gets 2 mountains', lands.length === 2 && lands.every(l => l === 'mountain'),
    lands.join(','));
}

// --- §6b special cards: seen by the graph, never offered ----------------------
{
  check('special cards are analyzed (deck presence exerts pull)',
    !!BUCKETS.analyzeCard('elystra_the_immortal') && !!BUCKETS.analyzeCard('endomorph'));
  let offeredSpecial = false;
  for (let i = 0; i < 25; i++) {
    for (const b of BUCKETS.rollBucketOffer([])) {
      for (const id of b.cards) if (CARDS[id] && CARDS[id].special) offeredSpecial = true;
    }
  }
  check('...but special cards never appear in offers', !offeredSpecial);
}

// --- §6c synergy hints: the custom_text of the graph --------------------------
{
  // Inject a synthetic custom-kind card that declares its synergy by hand.
  CARDS.__hint_test = {
    tplId: '__hint_test', name: 'Hint Tester', types: ['Creature', 'Horror'],
    cost: { B: 1 }, power: 1, toughness: 1, special: true,
    synergy: { wants: { dies: 3, bogusResource: 5 }, provides: { fodder: 2 } },
  };
  BUCKETS._resetCacheForTest();
  const a = BUCKETS.analyzeCard('__hint_test');
  check('synergy hint: declared wants applied', a && a.wants.dies === 3);
  check('synergy hint: declared provides applied', a && a.provides.fodder === 2);
  check('synergy hint: unknown resource ignored (warns, no crash)',
    a && !a.wants.bogusResource);
  // Threshold is idf-aware: dies has ~64 providers so its contributions are
  // deliberately discounted (2 provide × 3 want × ~0.55 idf ≈ 3.3).
  const e = BUCKETS.edgeBetween('__hint_test', 'goblin_rabble');
  check('hinted card grows real edges (rabble dies-feeds it)',
    e.w >= 2.5 && e.reasons.some(r => r.includes('[dies]')), `w=${e.w}`);
  delete CARDS.__hint_test;
  BUCKETS._resetCacheForTest();
}

// --- §6d playtest regressions: lands coverage + Reinforcements honesty --------
{
  // U:3/B:1 bucket must produce island+swamp, not island+island (pure
  // largest-remainder rounds the splash color to zero at n=2).
  const lands = BUCKETS.landsForCards(['skyfire_drakelord', 'mind_control', 'final_strike']);
  check('bucket lands cover every needed color (U3/B1 → island+swamp)',
    lands.includes('island') && lands.includes('swamp'), lands.join(','));

  // Reinforcements must never sell the player their own deck back, and must
  // vary across offers (playtest caught identical goodstuff 3 offers running).
  const deck = ['skyfire_drakelord', 'mind_control', 'final_strike', 'island', 'island'];
  const sets = new Set();
  let soldOwnCard = false;
  for (let i = 0; i < 12; i++) {
    for (const b of BUCKETS.rollBucketOffer(deck)) {
      if (b.name !== 'Reinforcements') continue;
      sets.add(b.cards.slice().sort().join(','));
      if (b.cards.some(c => deck.includes(c))) soldOwnCard = true;
    }
  }
  check('Reinforcements never contains cards already in the deck', !soldOwnCard);
  check('Reinforcements varies across offers', sets.size >= 2, `${sets.size} distinct sets`);
}

// --- §7 theme health report -------------------------------------------------
{
  const report = BUCKETS.themeHealthReport();
  check('health report mentions Goblin as healthy', /Goblin\(\d+\)/.test(report), report);
  check('health report is one line', !report.includes('\n'));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
