// Exact-two reward contract: offer-time feasibility and pick-time commit share
// one sequential planner, including claim provenance and roll materialization.
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const reward = (slotIdx) => ({ phase: 'mixed', candidates: [{ kind: 'twoStickers', slotIdx }] });
function freshRun(cards, claimed) {
  RUN.clearSave();
  RUN.start({ cards, colors: [] });
  if (claimed) RUN.recordResult('you', [], claimed);
  RUN._setPendingRewardForTest(null);
}
function withOnlyStickerWeights(ids, fn) {
  const saved = Object.fromEntries(Object.entries(STICKERS).map(([id, sticker]) => [id, sticker.weight]));
  const enabled = new Set(ids);
  try {
    for (const [id, sticker] of Object.entries(STICKERS)) {
      sticker.weight = enabled.has(id) ? (saved[id] || 1) : 0;
    }
    fn();
  } finally {
    for (const [id, weight] of Object.entries(saved)) STICKERS[id].weight = weight;
  }
}
function withFixedRandom(value, fn) {
  const saved = Math.random;
  Math.random = () => value;
  try { fn(); } finally { Math.random = saved; }
}
function withZeroRandom(fn) {
  withFixedRandom(0, fn);
}

console.log('=== Fresh B/W land gets exactly Innate + its missing basic type ===');
(() => {
  freshRun(['swamp', 'plains']);
  check('Innate remains reward-eligible without a claimed combat keyword',
    RUN._rewardStickerIdsForTest(0).includes('innate'));
  check('fresh B/W Swamp can materialize two sequential stickers',
    RUN._canMaterializeStickerSequenceForTest(0, 2));
  RUN._setPendingRewardForTest(reward(0));
  withZeroRandom(() => RUN.pickRewardCandidate(0));
  const reveal = RUN.getReward();
  const ids = reveal && reveal.appliedStickerIds;
  check('successful reveal contains exactly two entries', Array.isArray(ids) && ids.length === 2,
    JSON.stringify(ids));
  check('the two entries are Innate and Also a Plains',
    Array.isArray(ids) && ids.includes('innate') && ids.includes('land_color_w'), JSON.stringify(ids));
  check('both applications persist on the Swamp slot',
    RUN.getSlots()[0].stickers.includes('innate') && RUN.getSlots()[0].stickers.includes('land_color_w'));
})();

console.log('\n=== Claim provenance gates kw_* stickers, not Innate ===');
(() => {
  freshRun(['savannah_lions']);
  check('unclaimed ordinary keyword is gated', !RUN._rewardStickerIdsForTest(0).includes('kw_flying'));
  freshRun(['savannah_lions'], ['flying']);
  check('claimed ordinary keyword is offered', RUN._rewardStickerIdsForTest(0).includes('kw_flying'));
  freshRun(['city_of_brass', 'plains']);
  check('intrinsic Innate is not offered redundantly', !RUN._rewardStickerIdsForTest(0).includes('innate'));
})();

console.log('\n=== Impossible land sequences are not two-sticker candidates ===');
(() => {
  freshRun(['swamp']);
  check('one-color fresh basic has only one materializable application',
    !RUN._canMaterializeStickerSequenceForTest(0, 2));
  check('one-color fresh basic cannot be offered as twoStickers',
    RUN._rollOneCandidateForTest('twoStickers') === null);
  RUN.getSlots()[0].stickers.push('innate');
  check('exhausted one-color basic still cannot be offered',
    RUN._rollOneCandidateForTest('twoStickers') === null);

  freshRun(['swamp', 'plains', 'island']);
  check('three-color basic remains eligible for exact two',
    RUN._canMaterializeStickerSequenceForTest(0, 2));
  freshRun(['swamp', 'plains', 'island', 'mountain', 'forest']);
  check('five-color basic remains eligible for exact two',
    RUN._canMaterializeStickerSequenceForTest(0, 2));
  freshRun(['city_of_brass']);
  check('any-color nonbasic with intrinsic Innate is exhausted',
    !RUN._canMaterializeStickerSequenceForTest(0, 2));
})();

console.log('\n=== One-option cost and keyword slots cannot reveal short ===');
(() => {
  CARDS.test_exact_two_cost = {
    tplId: 'test_exact_two_cost', name: 'Test Cost', types: ['Sorcery'], color: 'R',
    cost: { C: 1, R: 1 }, effects: [],
  };
  CARDS.test_exact_two_keyword = {
    tplId: 'test_exact_two_keyword', name: 'Test Keyword', types: ['Creature'], color: 'W',
    cost: { W: 1 }, power: 1, toughness: 1, keywords: [], effects: [],
  };
  CARDS.test_exact_two_empower = {
    tplId: 'test_exact_two_empower', name: 'Test Empower', types: ['Sorcery'], color: 'U',
    cost: { U: 1 }, effects: [{ kind: 'affect_creature', target: 'creature', severity: 'tap' }],
  };
  try {
    withOnlyStickerWeights(['cost_minus_1'], () => {
      freshRun(['test_exact_two_cost']);
      check('single cost reduction that exhausts generic cost is ineligible',
        RUN._rollOneCandidateForTest('twoStickers') === null);
    });
    withOnlyStickerWeights(['kw_flying'], () => {
      freshRun(['test_exact_two_keyword'], ['flying']);
      check('single non-stackable keyword option is ineligible',
        RUN._rollOneCandidateForTest('twoStickers') === null);
    });
    withOnlyStickerWeights(['empower'], () => {
      freshRun(['test_exact_two_empower']);
      const slot = RUN.getSlots()[0];
      const severityRoll = { location: 'effects', subIdx: null, effIdx: 0, modeIdx: null, field: 'severity' };
      slot.stickers.push('empower', 'empower', 'empower');
      slot.empowerRolls = [{...severityRoll}, {...severityRoll}, {...severityRoll}];
      check('capped empower target is not counted as materializable',
        RUN._rollOneCandidateForTest('twoStickers') === null);
    });
  } finally {
    delete CARDS.test_exact_two_cost;
    delete CARDS.test_exact_two_keyword;
    delete CARDS.test_exact_two_empower;
  }
})();

console.log('\n=== Stackable IDs may repeat; non-stackable IDs may not ===');
(() => {
  withOnlyStickerWeights(['plus1_plus1'], () => {
    freshRun(['savannah_lions']);
    check('+1/+1 alone can satisfy exact two', RUN._canMaterializeStickerSequenceForTest(0, 2));
    RUN._setPendingRewardForTest(reward(0));
    withZeroRandom(() => RUN.pickRewardCandidate(0));
    const ids = RUN.getReward().appliedStickerIds;
    check('+1/+1 repeats exactly twice', ids.length === 2 && ids.every(id => id === 'plus1_plus1'),
      JSON.stringify(ids));
  });
  withOnlyStickerWeights(['kw_flying', 'kw_haste'], () => {
    freshRun(['savannah_lions'], ['flying', 'haste']);
    RUN._setPendingRewardForTest(reward(0));
    withZeroRandom(() => RUN.pickRewardCandidate(0));
    const ids = RUN.getReward().appliedStickerIds;
    check('two non-stackable keyword applications are distinct', ids.length === 2 && new Set(ids).size === 2,
      JSON.stringify(ids));
  });
  withOnlyStickerWeights(['plus1_plus1', 'subtype'], () => {
    freshRun(['savannah_lions', 'goblin_chieftain']);
    RUN._setPendingRewardForTest(reward(0));
    withFixedRandom(0.999, () => RUN.pickRewardCandidate(0));
    const slot = RUN.getSlots()[0];
    check('mixed exact-two commit keeps subtype rolls parallel to subtype occurrences',
      slot.stickers.length === 2 && slot.stickers.includes('subtype')
        && Array.isArray(slot.subtypeRolls) && slot.subtypeRolls.length === 1
        && slot.subtypeRolls[0] === 'Goblin',
      JSON.stringify({ stickers: slot.stickers, subtypeRolls: slot.subtypeRolls }));
  });
})();

console.log('\n=== Null subtype rolls do not count as applications ===');
(() => {
  CARDS.test_exact_two_cat = {
    tplId: 'test_exact_two_cat', name: 'Test Cat', types: ['Creature', 'Cat'], color: 'W',
    cost: { W: 1 }, power: 1, toughness: 1, keywords: [], effects: [],
  };
  try {
    withOnlyStickerWeights(['subtype'], () => {
      freshRun(['test_exact_two_cat', 'goblin_chieftain']);
      check('one subtype roll followed by exhaustion cannot satisfy exact two',
        !RUN._canMaterializeStickerSequenceForTest(0, 2));
      check('one-roll subtype slot cannot produce a short two-sticker candidate',
        RUN._rollOneCandidateForTest('twoStickers') === null);
      check('failed feasibility probing does not commit the first subtype',
        RUN.getSlots()[0].stickers.length === 0 && RUN.getSlots()[0].subtypeRolls === undefined);

      freshRun(['test_exact_two_cat', 'test_exact_two_cat']);
      check('fully exhausted subtype pool cannot satisfy exact two',
        !RUN._canMaterializeStickerSequenceForTest(0, 2));
      check('exhausted subtype pool cannot produce a two-sticker candidate',
        RUN._rollOneCandidateForTest('twoStickers') === null);
      check('single-sticker offer also rejects the null subtype roll',
        RUN._rollOneCandidateForTest('sticker') === null);
      check('null subtype probing leaves sticker and roll arrays untouched',
        RUN.getSlots().every(slot => slot.stickers.length === 0 && slot.subtypeRolls === undefined));
    });
  } finally {
    delete CARDS.test_exact_two_cat;
  }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
