// BUCKETS core: extraction rules, labeled edges, seed-and-grow invariants,
// offer composition, and the Reinforcements fallback (fallback: true).
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
    rabble.provides.fodder > 0 && rabble.provides.your_dies > 0);

  const artist = BUCKETS.analyzeCard('blood_artist');
  check('blood_artist WANTS both dies directions (any-death payoff)',
    artist.wants.your_dies > 0 && artist.wants.opp_dies > 0);

  const feeder = BUCKETS.analyzeCard('carrion_feeder');
  check('carrion_feeder WANTS fodder (sac outlet)', feeder.wants.fodder > 0);
  check('carrion_feeder PROVIDES your_dies (sac outlets produce YOUR deaths)', feeder.provides.your_dies > 0);

  const pridemate = BUCKETS.analyzeCard('ajanis_pridemate');
  check('pridemate WANTS lifegain (life_changed trigger)', pridemate.wants.lifegain > 0);

  const bolt = BUCKETS.analyzeCard('lightning_bolt');
  check('bolt has aggro plan tag (face damage = the race plan)', bolt.tags.has('aggro'));

  // Subtype-implied keywords reach the graph (engine.js SUBTYPE_KEYWORDS via
  // ENGINE.addSubtypeKeywords): this Serra Angel has no explicit flying in
  // keywords[] — Angels fly at runtime only.
  const serra = BUCKETS.analyzeCard('serra_angel');
  check('implied keywords: Angel gets the flying plan tag', serra.tags.has('flying'));

  const knight = BUCKETS.analyzeCard('white_knight');
  check('Humans provide sub:Human like any tribe (no exclusion list)',
    knight && knight.provides['sub:Human'] > 0);
  const recruiter = BUCKETS.analyzeCard('chapter_recruiter');
  check('chapter_recruiter WANTS Humans (the payoff arrived, no code change)',
    recruiter && recruiter.wants['sub:Human'] > 0,
    JSON.stringify(recruiter && recruiter.wants));

  // Vocabulary pins — one wanter + one provider per new resource.
  const w2 = (id) => BUCKETS.analyzeCard(id);
  check('trick: sapling_tender wants, updraft provides',
    w2('sapling_tender').wants.trick > 0 && w2('updraft').provides.trick > 0);
  check('activation: backlash_mage wants, pyromaniac provides',
    w2('backlash_mage').wants.activation > 0 && w2('pyromaniac').provides.activation > 0);
  check('landdrop: frontier_sapling wants, rampant_growth provides (no sub:Land theme)',
    w2('frontier_sapling').wants.landdrop > 0 && !w2('frontier_sapling').wants['sub:Land']
    && w2('rampant_growth').provides.landdrop > 0);
  check('animate: rootbound_sentinel wants, earthsinger provides',
    w2('rootbound_sentinel').wants.animate > 0 && w2('earthsinger').provides.animate > 0);
  check('flashcast (qualified spellcast wart): feinting_sprite wants it, NOT generic spellcast',
    w2('feinting_sprite').wants.flashcast > 0 && !w2('feinting_sprite').wants.spellcast
    && w2('lightning_bolt').provides.flashcast > 0);
  check('carddraw: curious_faerie wants, divination provides (tutors count — house ruling)',
    w2('curious_faerie').wants.carddraw > 0 && w2('divination').provides.carddraw > 0
    && w2('worldly_tutor').provides.carddraw > 0);
  check('any-of tribal wart: covenant_scholar wants BOTH Elf and Merfolk',
    w2('covenant_scholar').wants['sub:Elf'] > 0 && w2('covenant_scholar').wants['sub:Merfolk'] > 0);
  check('mass-buff wants:wide wart: warchanter and steadfast_knight want wide now',
    w2('warchanter').wants.wide > 0 && w2('steadfast_knight').wants.wide > 0);
  check('kw:flying: wing_commander wants, air_elemental provides',
    w2('wing_commander').wants['kw:flying'] > 0 && w2('air_elemental').provides['kw:flying'] > 0);

  // Extraction-audit sweep pins. The principle each rule obeys:
  // a filter earns a want only when YOUR deck can manufacture the condition.
  check('tapped: smite_the_wicked wants, intimidating_lancer + roots_and_branches provide',
    w2('smite_the_wicked').wants.tapped > 0 && w2('intimidating_lancer').provides.tapped > 0
    && w2('roots_and_branches').provides.tapped > 0);
  check('tapped: sage_of_the_wilds does NOT want it (own-creature untap filter is legality, not a want)',
    !w2('sage_of_the_wilds').wants.tapped);
  check('wrathproof: pyroclasm + day_of_reckoning want, cinder_ward + vanishing_act provide',
    w2('pyroclasm').wants.wrathproof > 0 && w2('day_of_reckoning').wants.wrathproof > 0
    && w2('cinder_ward').provides.wrathproof > 0 && w2('vanishing_act').provides.wrathproof > 0);
  check('blink manufactures ETBs: vanishing_act + tideglass_broker provide etb',
    w2('vanishing_act').provides.etb >= 1.5 && w2('tideglass_broker').provides.etb >= 1.5);
  check('graveyard consumers want dies (grave_digger, deepseam_quarry); opp-yard hate does not (seal_thief)',
    w2('grave_digger').wants.your_dies > 0 && w2('deepseam_quarry').wants.your_dies > 0
    && !w2('seal_thief_courier').wants.your_dies);
  check('theft feeds sac outlets: threaten provides fodder',
    w2('threaten').provides.fodder > 0);
  check('untap spells want TAPABILITY machines: awaken_the_stone wants, pyromaniac provides',
    w2('awaken_the_stone').wants.tapability > 0 && w2('pyromaniac').provides.tapability > 0);
  check('flying-hate wants nothing (cannot manufacture their fliers): choking_vines',
    Object.keys(w2('choking_vines').wants).length === 0, JSON.stringify(w2('choking_vines').wants));
  // etbtrigger (Joe's direction review of the sweep): blink wants ETB VALUE,
  // not just bodies.
  check('etbtrigger: vanishing_act wants, pyromaniac provides, grizzly_bears does not',
    w2('vanishing_act').wants.etbtrigger > 0 && w2('pyromaniac').provides.etbtrigger > 0
    && !w2('grizzly_bears').provides.etbtrigger);
  const eBlink = BUCKETS.edgeBetween('vanishing_act', 'pyromaniac');
  const eBear = BUCKETS.edgeBetween('vanishing_act', 'grizzly_bears');
  check('the flicker edge is live and the vanilla edge is not',
    eBlink.w > 1 && eBear.w === 0, eBlink.w.toFixed(2) + ' vs ' + eBear.w.toFixed(2));
  // Broad gated-on-X audit (Joe: "any card gated on X potentially wants X"):
  check('tapability split: awaken pulls pyromaniac, NOT furnace_whelp (Joe\'s disambiguation)',
    w2('awaken_the_stone').wants.tapability > 0
    && BUCKETS.edgeBetween('awaken_the_stone', 'furnace_whelp').w === 0
    && BUCKETS.edgeBetween('awaken_the_stone', 'pyromaniac').w > 1);
  check('mana dorks are tapability providers (untapping llanowar is real value)',
    w2('llanowar_elves').provides.tapability > 0);
  check('lost_life_this_turn gate wants opp_loss regardless of event (bloodlust_berserker)',
    w2('bloodlust_berserker').wants.opp_loss > 0
    && BUCKETS.edgeBetween('bloodlust_berserker', 'lightning_bolt').w >= 2);
  check('counterspell payoff wants counterspells, not every sorcery (counter_specialist)',
    w2('counter_specialist').wants.counterspell > 0 && !w2('counter_specialist').wants.spellcast
    && w2('counterspell').provides.counterspell > 0);
  // Removal manufactures deaths (the "organic Murder" rule): destroy and
  // damage-removal feed any-death payoffs; bounce and exile make NO death
  // event and stay silent.
  check('removal provides dies: murder 1 (destroy), bolt kills-most (0.5-1), wash_away (bounce) none',
    w2('murder').provides.opp_dies === 1
    && w2('lightning_bolt').provides.opp_dies > 0.5 && w2('lightning_bolt').provides.opp_dies < 1
    && !w2('wash_away').provides.opp_dies && !w2('wash_away').provides.your_dies);
  // Damage death-credit = killFraction(amount): a bigger burn clears more of
  // the toughness curve, so the opp_dies weight rises monotonically with damage
  // (deal-2 ~0.53, deal-3 ~0.81, deal-5 ~0.98 of destroy's 1.0).
  check('damage opp_dies scales with kill-fraction: shock(2) < bolt(3) < searing_blast(5)',
    w2('shock').provides.opp_dies < w2('lightning_bolt').provides.opp_dies
    && w2('lightning_bolt').provides.opp_dies < w2('searing_blast').provides.opp_dies);
  check('murder <-> blood_artist is a live edge with the dies reason',
    BUCKETS.edgeBetween('murder', 'blood_artist').w > 1
    && /dies/.test(BUCKETS.edgeBetween('murder', 'blood_artist').reasons[0] || ''));
  // Joe's generic-target correction ("your etb value deck will get more out
  // of it than their deck"): a generic creature target includes YOURS, and a
  // mass bounce rebuys your whole board. Deaths still require destruction
  // (the dies pin above).
  check('generic bounce provides replay value: mist_raider + cloud_caller provide etb',
    w2('mist_raider').provides.etb >= 0.75 && w2('cloud_caller').provides.etb >= 0.75
    && w2('mist_raider').wants.etbtrigger > 0);
  check('mass bounce is the Evacuation engine: wash_away provides etb 1.5 + wants etbtrigger 3',
    w2('wash_away').provides.etb === 1.5 && w2('wash_away').wants.etbtrigger === 3
    && BUCKETS.edgeBetween('wash_away', 'bramble_acolyte').w > 2);
  // The fallback flag IS the contract line between a bucket's story and its
  // origin — the two must never disagree.
  let unstoried = 0, storiedFallbacks = 0;
  for (let i = 0; i < 20; i++) {
    for (const b of BUCKETS.rollBucketOffer([])) {
      if (!b.fallback && !(b.why || []).length) unstoried++;
      if (b.fallback && (b.why || []).length) storiedFallbacks++;
    }
  }
  check('every seed-grown bucket carries its story (why[] non-empty)', unstoried === 0,
    unstoried + ' grown buckets with no story');
  check('fallback bundles never carry a story (value-sampling made no contract)',
    storiedFallbacks === 0, storiedFallbacks + ' fallbacks with why[]');

  // Qualified-entry wart: Joe's playtest catch — drummer had an etb edge to
  // a Human Cleric that can never fire it.
  check('subtype-gated entry payoffs want the tribe, NOT generic etb',
    !w2('goblin_war_drummer').wants.etb && w2('goblin_war_drummer').wants['sub:Goblin'] > 0
    && !w2('chapter_recruiter').wants.etb && !w2('skyfire_drakelord').wants.etb
    && !w2('high_priestess').wants.etb && !w2('covenant_scholar').wants.etb);
  check('unqualified entry payoffs still want etb (beast_whisperer, charnel_chorister)',
    w2('beast_whisperer').wants.etb > 0 && w2('charnel_chorister').wants.etb > 0);
  check('the phantom drummer edge is dead (cult_priest cannot trigger it)',
    BUCKETS.edgeBetween('cult_priest', 'goblin_war_drummer').w === 0);
  // Non-spell destroyers manufacture deaths too — the dies provide is
  // shape-agnostic (chupacabra's ETB destroy, assassin's repeatable tap).
  check('creature-borne destroy provides dies (chupacabra, royal_assassin)',
    w2('ravenous_chupacabra').provides.opp_dies === 1 && w2('royal_assassin').provides.opp_dies === 1);
  // The gate asymmetry is doctrine: a subtype-gated DIES trigger keeps the
  // generic dies want (sac outlets work on your demons), while a subtype-
  // gated ENTRY trigger drops generic etb (wrong-tribe bodies never fire it).
  check('subtype-gated dies payoff keeps both wants (rakdos_underboss)',
    w2('rakdos_underboss').wants['sub:Demon'] > 0 && w2('rakdos_underboss').wants.your_dies > 0
    && w2('rakdos_underboss').wants.opp_dies > 0);
  // Opp-discard is their loss, not your engine: toll_of_secrets hears only
  // YOUR discards, so duress/mind_rot provide no discard.
  check('opp-discard cards provide no discard resource (duress, mind_rot)',
    !w2('duress').provides.self_discard && !w2('mind_rot').provides.self_discard);
  // card_damaged_by_this gates make external death-manufacturers useless
  // (Murder's kill was never damaged by Sengir): those payoffs must not
  // want generic dies. Ungated and merely ownership-gated payoffs keep it.
  check('damaged-by-this dies payoffs want no generic dies (sengir, endomorph)',
    !w2('sengir_vampire').wants.your_dies && !w2('sengir_vampire').wants.opp_dies
    && !w2('endomorph').wants.your_dies && !w2('endomorph').wants.opp_dies);
  // The ownership discrimination: Joe's question made it a rule.
  check('any-death payoff wants both directions (blood_artist)',
    w2('blood_artist').wants.your_dies > 0 && w2('blood_artist').wants.opp_dies > 0);
  check('your-side-only payoff wants your_dies only (charnel_shaman)',
    w2('charnel_shaman').wants.your_dies > 0 && !w2('charnel_shaman').wants.opp_dies);
  check('murder has no edge into charnel_shaman (removal kills THEIRS)',
    !BUCKETS.edgeBetween('murder', 'charnel_shaman').reasons.some(r => /dies/.test(r)));
  check('the pyromaniac->sengir phantom edge is dead',
    !BUCKETS.edgeBetween('pyromaniac', 'sengir_vampire').reasons.some(r => /dies/.test(r)));

  // Tripwire (dormant): the extractor's condition walker (collectKindsAndConds)
  // pushes only strings sitting DIRECTLY under a `condition` key — it does not
  // descend into {op:and/or/not} sub-trees, so any predicate nested inside one
  // is invisible to want/provide extraction. Benign today: spellrider's
  // {op:not} only drops a "noncreature" refinement (it still wants spellcast).
  // But an {op:or} carrying the sole copy of a want-predicate would silently
  // drop that want. This flips RED the day a NEW card ships an {op} condition,
  // signalling: check that card's extraction, and teach the walker to descend
  // if the hidden predicates matter.
  const VETTED_OP_CONDITIONS = new Set(['spellrider']);   // {op:not}, judged benign
  const hasOpNode = (node) => {
    if (Array.isArray(node)) return node.some(hasOpNode);
    if (!node || typeof node !== 'object') return false;
    if (typeof node.op === 'string') return true;
    return Object.values(node).some(hasOpNode);
  };
  const opCards = Object.keys(CARDS).filter(id => {
    const tpl = CARDS[id];
    return tpl && (tpl.triggers || []).some(trg => hasOpNode(trg.condition));
  });
  const unvetted = opCards.filter(id => !VETTED_OP_CONDITIONS.has(id));
  check('no unvetted {op}-tree trigger condition (extraction-blindness tripwire)',
    unvetted.length === 0, 'unvetted {op} conditions: ' + unvetted.join(','));

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
// Structural invariants that must hold for EVERY roll (size, land type, the
// one hard color law, the fallback flag) — so they ride real randomness on
// purpose: a failure here is a real bug, never a false red.
{
  const colorsOfTpl = tpl => ['W', 'U', 'B', 'R', 'G'].filter(k => (tpl.cost || {})[k] > 0);
  let sizeOk = true, landOk = true, flagOk = true, bucketTwoColorOk = true;
  const deck = ['goblin_piercer', 'raging_goblin', 'blood_artist', 'carrion_feeder',
                'mountain', 'mountain', 'swamp', 'swamp'];
  for (let i = 0; i < 40; i++) {
    const offer = BUCKETS.rollBucketOffer(deck);
    if (offer.length !== 3) sizeOk = false;
    for (const b of offer) {
      if (b.cards.length !== 3 || b.lands.length !== 2) sizeOk = false;
      if (typeof b.fallback !== 'boolean') flagOk = false;
      const bucketCols = new Set();
      for (const id of b.cards) {
        for (const c of colorsOfTpl(CARDS[id])) bucketCols.add(c);
      }
      if (bucketCols.size > 2) bucketTwoColorOk = false;
      for (const id of b.lands) {
        const tpl = CARDS[id];
        if (!tpl || !hasType(tpl, 'Basic')) landOk = false;
      }
    }
  }
  check('every offer is 3 buckets of 3 cards + 2 lands (40 rolls)', sizeOk);
  check('bucket lands are basic lands', landOk);
  check('no bucket spans more than two colors (the one hard color law)', bucketTwoColorOk);
  check('every bucket declares its fallback flag', flagOk);
}

// --- §3b color fence mechanism (deterministic) ------------------------------
// colorFitFactor(card, deckColors) is the pure weight multiplier for color
// fit; pinning it directly needs no rolls and no threshold.
{
  const fit = BUCKETS._colorFitForTest;
  // Factor 1 = no fence. Guards the SPELLSTORM×3 lockout, where this returned
  // ~0 and trapped a mono deck in its one color.
  check('mono deck: no color fence, off-color rides at full weight',
    fit('counterspell', ['R']) === 1, String(fit('counterspell', ['R'])));
  // Deliberate: damping off-color splash instead of banning it is Joe's call.
  const onColor = fit('lightning_bolt', ['B', 'R']);
  const offColor = fit('counterspell', ['B', 'R']);
  check('committed deck: on-color card rides at full weight', onColor === 1,
    String(onColor));
  check('committed deck: off-color splash is damped but not banned (0 < f < 1)',
    offColor > 0 && offColor < 1, String(offColor));
}

// --- §3c softmax, not argmax (RNG-sensitivity probe) ------------------------
// Pinning the RNG to opposite extremes must yield different offers; argmax
// collapse (ignoring the dice, always taking the single best card) would make
// them identical. Two constant RNGs, so it's deterministic.
{
  const sig = () =>
    BUCKETS.rollBucketOffer([]).map(b => b.cards.slice().sort().join(',')).join('|');
  BUCKETS._setRandForTest(() => 0);
  const low = sig();
  BUCKETS._setRandForTest(() => 0.9999);
  const high = sig();
  BUCKETS._setRandForTest();
  check('offers depend on the dice (softmax, not argmax)', low !== high,
    low === high ? 'identical at both RNG extremes' : 'differ');
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

// --- §5 seeded bucket serves the seed's plan ---------------------------------
// Invariants (real randomness, like §3): coherence is >0 because growBucket
// only adds positive-edge cards, so an internal edge always exists.
{
  const b = BUCKETS._rollBucketForTest('goblin_chieftain', []);
  check('seeded bucket contains its seed AT cards[0] (the story contract)',
    b.cards[0] === 'goblin_chieftain');
  check('seeded goblin bucket coherence > 0', b.coherence > 0, `coherence=${b.coherence}`);
}

// --- §6 lands follow bucket pips --------------------------------------------
{
  const lands = BUCKETS.landsForCards(['lightning_bolt', 'shock', 'raging_goblin']);
  check('mono-red bucket gets 2 mountains', lands.length === 2 && lands.every(l => l === 'mountain'),
    lands.join(','));
}

// --- §6b undraftable cards (boons/bosses): seen by the graph, never offered ---
{
  check('undraftable cards are analyzed (deck presence exerts pull)',
    !!BUCKETS.analyzeCard('elystra_the_immortal') && !!BUCKETS.analyzeCard('endomorph'));
  // Guard the guard: the pool must actually contain undraftable cards, or the
  // never-offered sweep below passes vacuously.
  check('boon/boss cards exist to be excluded',
    Object.values(CARDS).some(c => isUndraftable(c)));
  let offeredUndraftable = false;
  for (let i = 0; i < 25; i++) {
    for (const b of BUCKETS.rollBucketOffer([])) {
      for (const id of b.cards) if (CARDS[id] && isUndraftable(CARDS[id])) offeredUndraftable = true;
    }
  }
  check('...but undraftable cards never appear in offers', !offeredUndraftable);
}

// --- §6c synergy hints: the custom_text of the graph --------------------------
{
  CARDS.__hint_test = {
    tplId: '__hint_test', name: 'Hint Tester', types: ['Creature', 'Horror'],
    cost: { B: 1 }, power: 1, toughness: 1, boon: true,
    synergy: { wants: { your_dies: 3, bogusResource: 5 }, provides: { fodder: 2 } },
  };
  BUCKETS._resetCacheForTest();
  const a = BUCKETS.analyzeCard('__hint_test');
  check('synergy hint: declared wants applied', a && a.wants.your_dies === 3);
  check('synergy hint: declared provides applied', a && a.provides.fodder === 2);
  check('synergy hint: unknown resource ignored (warns, no crash)',
    a && !a.wants.bogusResource);
  // Threshold is idf-aware: dies has ~64 providers so its contributions are
  // deliberately discounted (2 provide × 3 want × ~0.55 idf ≈ 3.3).
  const e = BUCKETS.edgeBetween('__hint_test', 'goblin_rabble');
  check('hinted card grows real edges (rabble dies-feeds it)',
    e.w >= 2.5 && e.reasons.some(r => r.includes('[your_dies]')), `w=${e.w}`);
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

  const deck = ['skyfire_drakelord', 'mind_control', 'final_strike', 'island', 'island'];
  let soldOwnCard = false;
  let rolls = 0, seen = 0;
  while (seen < 4 && rolls++ < 60) {
    for (const b of BUCKETS.rollBucketOffer(deck)) {
      if (!b.fallback) continue;
      seen++;
      if (b.cards.some(c => deck.includes(c))) soldOwnCard = true;
    }
  }
  check('Reinforcements never contains cards already in the deck', !soldOwnCard);
}

// --- §6c2 Elystra's authored want -------------------------------------------
{
  // Elystra's permanence (EOT effects stick forever) auto-derives
  // wants:eot_buff from permanent_eot, not a synergy hint. She's a boon
  // (never offered), but a deck holding her must still pull trick spells
  // into offers via seed affinity.
  const w2 = (id) => BUCKETS.analyzeCard(id);
  const ely = BUCKETS.analyzeCard('elystra_the_immortal');
  check('elystra WANTS eot_buff (derived from permanent_eot, not a hint)',
    ely && ely.wants.eot_buff === 3 && !CARDS.elystra_the_immortal.synergy,
    JSON.stringify(ely && ely.wants));
  const e = BUCKETS.edgeBetween('giant_growth', 'elystra_the_immortal');
  check('a pump spell feeds elystra (live edge, eot_buff reason)',
    e.w > 1 && e.reasons.some(r => r.includes('[eot_buff]')),
    `w=${e.w} ${JSON.stringify(e.reasons)}`);
  // Joe's refinement: trick overmatched — Cloudshift targets your creature
  // but flickering Elystra RESETS her buffs and rips the spell. It provides
  // trick (tender still rewards casting it) but NOT eot_buff, and its edge
  // to Elystra is dead.
  check('cloudshift provides trick but not eot_buff; no elystra edge',
    w2('cloudshift').provides.trick > 0 && !w2('cloudshift').provides.eot_buff
    && BUCKETS.edgeBetween('cloudshift', 'elystra_the_immortal').w === 0);
}

// --- §6e the dupe shelf -------------------------------------------------------
{
  const f = BUCKETS._dupeFactorForTest;
  check('empty deck: everything rides at full shelf (factor 1)',
    f('goblin_rabble', []) === 1);
  check('one copy owned at n=1: factor 1/2; fresh cards untouched',
    f('goblin_rabble', ['goblin_rabble']) === 0.5
    && f('lightning_bolt', ['goblin_rabble']) === 1);
  check('shelf shares at n=3: 3 copies -> 1/4, 1 copy -> 3/4 (never zero)',
    f('raging_goblin', ['raging_goblin', 'raging_goblin', 'raging_goblin', 'lightning_bolt']) === 0.25
    && f('lightning_bolt', ['raging_goblin', 'raging_goblin', 'raging_goblin', 'lightning_bolt']) === 0.75);
  check('basics never set n (17 Forests must not switch the shelf off)',
    f('goblin_rabble', ['forest', 'forest', 'forest', 'forest', 'goblin_rabble']) === 0.5);
  check('nonbasic lands count (a Quarry pile is a deliberate identity)',
    f('deepseam_quarry', ['deepseam_quarry', 'deepseam_quarry']) === 1 / 3);
  // The wall retreats when touched: adding a 4th raging_goblin raises n,
  // restocking every other card's shelf share (3/4 -> 4/5 for a 1-of).
  check('reaching the wall raises it for everyone',
    f('lightning_bolt', ['raging_goblin', 'raging_goblin', 'raging_goblin', 'raging_goblin', 'lightning_bolt'])
      === 0.8);
}

// --- §6f the Reinforcements retirement ---------------------------------------
{
  // Per-slot value fill: a stranded bucket keeps its grown members and
  // value-weights only the empty seats.
  const deck = ['murder', 'swamp', 'swamp'];
  const r = BUCKETS._valueFillForTest(['blood_artist'], deck);
  check('value fill completes a stranded bucket to 3 cards', r.cards.length === 3,
    r.cards.join(','));
  check('filled seats carry the [value] why line (one per seat)',
    r.why.length === 2 && r.why.every(w => / joins \[value\]$/.test(w)),
    JSON.stringify(r.why));
  check('value fill never sells you your own cards', !r.cards.includes('murder'));
  const PIPS = ['W', 'U', 'B', 'R', 'G'];
  const cols = new Set();
  for (const id of r.cards) for (const k of PIPS) if ((CARDS[id].cost || {})[k] > 0) cols.add(k);
  check('filled bucket still obeys the two-color law', cols.size <= 2, [...cols].join(','));

  // With a full pool, normal offers never fall back: every seed grows-or-
  // fills to a full bucket; whole-bundle Reinforcements is reserved for
  // seeding starvation.
  let fallbacks = 0, tiles = 0;
  for (let i = 0; i < 15; i++) {
    for (const b of BUCKETS.rollBucketOffer(['goblin_piercer', 'blood_artist', 'mountain', 'swamp'])) {
      tiles++;
      if (b.fallback) fallbacks++;
    }
  }
  check('normal offers contain zero Reinforcements bundles (retirement)',
    fallbacks === 0, `${fallbacks}/${tiles}`);
}

// --- §7 theme health report -------------------------------------------------
{
  const report = BUCKETS.themeHealthReport();
  check('health report mentions Goblin as healthy', /Goblin\(\d+\)/.test(report), report);
  check('health report is one line', !report.includes('\n'));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
