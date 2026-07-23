// Growing Deck integration: the run-start bucket draft (DRAFT 'growing'
// mode), the addBucket reward (two-phase commit through RUN), the dynamic
// growth weight, the land top-up, opponent deck-size mirroring, and the
// config backfill for legacy saves.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function countSpells(tplIds) {
  return tplIds.filter(id => CARDS[id] && !hasType(CARDS[id], 'Land')).length;
}

// Growing mode opens with the boon pick (#0) before any buckets exist; the
// picked boon later rides into the deck as an extra card ahead of the picks.
function pickThroughBoonPhase() {
  const boon = DRAFT.getPlayerPack()[0];
  DRAFT.pickPlayer(boon);
  return boon;
}

// --- §1 run-start bucket draft (DRAFT 'growing' mode) ------------------------
{
  DRAFT.startDraft('growing');
  check('growing mode opens in the boon phase (pick #0)', DRAFT.isBoonPhase());
  check('no bucket offer during the boon phase', DRAFT.getBucketOffer().length === 0);
  const boon = pickThroughBoonPhase();
  check('boon pick ends the boon phase', !DRAFT.isBoonPhase());
  check('growing draft starts with a 3-bucket offer', DRAFT.getBucketOffer().length === 3);
  check('growing draft has no card pack', DRAFT.getPlayerPack().length === 0);

  const draftState = DRAFT._state();
  const pickedBoon = draftState.boon;
  const previewCards = DRAFT.getBucketOffer()[0].cards;
  draftState.boon = 'elystra_the_immortal';
  const nonlandPreviewIds = CONSTELLATION._offerGraphForTest(previewCards).nodes.map(n => n.id);
  check('pre-run bucket preview includes the pick-#0 nonland boon',
    nonlandPreviewIds.includes('elystra_the_immortal'));
  draftState.boon = 'city_of_brass';
  const landPreviewIds = CONSTELLATION._offerGraphForTest(previewCards).nodes.map(n => n.id);
  check('pre-run bucket preview preserves intentional land exclusion',
    !landPreviewIds.includes('city_of_brass'));
  draftState.boon = pickedBoon;

  check('progress counts buckets: 0/5', (() => {
    const p = DRAFT.getProgress();
    return p.picked === 0 && p.total === 5;
  })());

  DRAFT.pickBucketOffer(0);
  check('after 1 pick: 3 cards + 2 lands in youPicks', (() => {
    const s = DRAFT._state();
    return s.youPicks.length === 5 && countSpells(s.youPicks) === 3;
  })(), JSON.stringify(DRAFT._state().youPicks));
  check('offer rerolled against picks so far', DRAFT.getBucketOffer().length === 3);
  check('not complete after 1 of 5', !DRAFT.isComplete());

  DRAFT.pickBucketOffer(1);
  DRAFT.pickBucketOffer(0);
  DRAFT.pickBucketOffer(2);
  DRAFT.pickBucketOffer(0);
  check('complete after 5 bucket picks', DRAFT.isComplete());

  const deck = DRAFT.getPlayerDeck();
  // The boon may itself be a land (City of Brass, Phylactery), so the spell
  // count is derived from the picked boon rather than pinned to a literal.
  const boonSpells = hasType(CARDS[boon], 'Land') ? 0 : 1;
  check('player deck = boon + 15 spells + 10 lands', (() => {
    const spells = countSpells(deck.cards);
    return deck.cards.length === 26 && spells === 15 + boonSpells;
  })(), `${deck.cards.length} cards, ${countSpells(deck.cards)} spells, boon=${boon}`);
  check('boon rides ahead of the bucket picks', deck.cards[0] === boon);
  check('player deck mode passthrough = growing', deck.mode === 'growing');
  check('deck colors derived from picks', Array.isArray(deck.colors) && deck.colors.length >= 1);

  // --- §2 RUN.start stores growing config ------------------------------------
  RUN.start(deck, null);
  const slots = RUN.getSlots();
  check('run slots match deck size', slots.length === deck.cards.length,
    `${slots.length} slots, ${deck.cards.length} cards`);

  // --- §3 addBucket reward: two-phase commit ---------------------------------
  const deckTplIds = slots.map(s => s.tplId);
  const buckets = BUCKETS.rollBucketOffer(deckTplIds);
  RUN._setPendingRewardForTest({
    phase: 'mixed',
    candidates: [{ kind: 'addBucket', buckets }],
  });
  RUN.pickRewardCandidate(0);
  const reward = RUN.getReward();
  check('picking addBucket opens bucketPick phase', reward && reward.phase === 'bucketPick');
  check('bucketPick carries 3 buckets', reward.buckets.length === 3);

  const before = RUN.getSlots().length;
  RUN.pickBucket(1);
  const after = RUN.getSlots();
  check('pickBucket pushes 5 slots (3 cards + 2 lands)', after.length === before + 5,
    `${before} -> ${after.length}`);
  check('reward cleared after pickBucket', !RUN.getReward());
  check('new slots are fresh {tplId, stickers:[]}', (() => {
    const added = after.slice(before);
    return added.every(s => typeof s.tplId === 'string' && Array.isArray(s.stickers) &&
      s.stickers.length === 0);
  })());

  // --- §4 out-of-range / wrong-phase guards ----------------------------------
  RUN.pickBucket(7);   // must not throw
  check('pickBucket without pendingReward is a no-op', RUN.getSlots().length === after.length);

  RUN._setPendingRewardForTest({ phase: 'bucketPick', buckets: buckets.slice(0, 1) });
  RUN.pickBucket(5);
  check('pickBucket with bad index leaves reward pending', !!RUN.getReward());
  RUN.pickBucket(0);
  check('valid index then commits', !RUN.getReward());
}

// --- §5 growth weight: addBucket offered while under target, gone at target --
{
  DRAFT.startDraft('growing');
  pickThroughBoonPhase();
  for (let i = 0; i < 5; i++) DRAFT.pickBucketOffer(0);
  RUN.start(DRAFT.getPlayerDeck(), null);
  let sawAddBucket = 0;
  for (let i = 0; i < 12; i++) {
    RUN._setPendingRewardForTest(null);
    // recordResult path is heavy; drive the generator through load()'s
    // reroll instead: a stale-phase pendingReward forces generateRewardOffer.
    RUN._setPendingRewardForTest({ phase: 'legacyNonsense' });
    RUN.save();
    RUN.load();
    const r = RUN.getReward();
    if (r && r.phase === 'mixed' && r.candidates.some(c => c.kind === 'addBucket')) sawAddBucket++;
  }
  // 15-or-16-spell start (boon may add one) → deficit 7-8 → weight 14-16 vs
  // table sum 23: P(offer has one) ≈ 0.8.
  check('under target: addBucket appears in most offers', sawAddBucket >= 6, `${sawAddBucket}/12`);

  // Grow the deck to target: weight must drop to zero (classic reward table).
  while (true) {
    const slots = RUN.getSlots();
    const spells = slots.filter(s => CARDS[s.tplId] && !hasType(CARDS[s.tplId], 'Land')).length;
    if (spells >= 23) break;
    const buckets = BUCKETS.rollBucketOffer(slots.map(s => s.tplId));
    RUN._setPendingRewardForTest({ phase: 'bucketPick', buckets });
    RUN.pickBucket(0);
  }
  const slots = RUN.getSlots();
  const spells = slots.filter(s => CARDS[s.tplId] && !hasType(CARDS[s.tplId], 'Land')).length;
  const lands = slots.length - spells;
  check('deck grew to >= 23 spells', spells >= 23, `${spells} spells`);
  check('land top-up brought lands to 17', lands >= 17, `${lands} lands`);

  let sawAtTarget = 0;
  for (let i = 0; i < 12; i++) {
    RUN._setPendingRewardForTest({ phase: 'legacyNonsense' });
    RUN.save();
    RUN.load();
    const r = RUN.getReward();
    if (r && r.phase === 'mixed' && r.candidates.some(c => c.kind === 'addBucket')) sawAtTarget++;
  }
  check('at target: addBucket disappears from offers', sawAtTarget === 0, `${sawAtTarget}/12`);
}

// --- §6 bucketPick survives save/load ----------------------------------------
{
  const buckets = BUCKETS.rollBucketOffer(RUN.getSlots().map(s => s.tplId));
  RUN._setPendingRewardForTest({ phase: 'bucketPick', buckets });
  RUN.save();
  RUN.load();
  const r = RUN.getReward();
  check('bucketPick phase survives save/load (not rerolled)',
    r && r.phase === 'bucketPick' && r.buckets.length === buckets.length);
  RUN.pickBucket(0);
}

// --- §7 opponent deck-size mirroring -----------------------------------------
// Picks may legitimately include nonbasic lands (they're in the draft pool),
// so total deck size — picks + allocated basics — is the deterministic metric:
// numPicks + round(numPicks × 17/23).
{
  const opp9 = DRAFT.buildOpponentDeck(0, 0, 0, null, null, 9);
  check('mirrored opponent deck = 9 picks + 7 basics', opp9.cards.length === 16,
    `${opp9.cards.length}`);

  const oppFull = DRAFT.buildOpponentDeck(0, 0, 0, null, null);
  check('no numPicks → classic 40-card deck', oppFull.cards.length === 40,
    `${oppFull.cards.length}`);

  const boss = DRAFT.buildOpponentDeck(0, 0, 0, null, 'goblinAggro', 9);
  check('constructed decks ignore the mirror (scripted landmarks)', boss.cards.length === 40,
    `${boss.cards.length}`);
}

// --- §8 config backfill for legacy saves --------------------------------------
{
  // Simulate a pre-Growing-Deck save: strip config, reload.
  const raw = JSON.parse(localStorage.getItem('magiclike_run_v1'));
  delete raw.runState.config;
  localStorage.setItem('magiclike_run_v1', JSON.stringify(raw));
  RUN.load();
  const stats = RUN.getStats();
  check('legacy save backfills config.mode = classic', (() => {
    const blob = JSON.parse(localStorage.getItem('magiclike_run_v1'));
    return blob.runState.config && blob.runState.config.mode === 'classic';
  })(), JSON.stringify(stats && stats.config));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
