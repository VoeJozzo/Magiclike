// §3.8 Balancer decomposition: embargo / bleach (and later symmetricize) no
// longer write bespoke slot fields read by applyBalancerOverrides — they
// decompose into the sticker pipeline via the apply_sticker effect, which
// applies an inline {kind,...} sticker to the target's slot (persisted) AND the
// runtime card. Everything flows through one sticker pipeline.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// A real, non-special creature for slot 0.
const CR = (() => {
  for (const id in CARDS) { const c = CARDS[id]; if (c.type === 'Creature' && !c.special && c.cost) return id; }
  return null;
})();
function bootWithCreature() {
  RUN.start({ cards: [CR].concat(Array(11).fill('plains')), colors: ['W'] }, null);
  RUN.load();
  ENGINE.init(RUN.getSlots(), [CR].concat(Array(11).fill('plains')));
  const G = ENGINE.state();
  const inst = ENGINE.makeCard(CR, [], 0);
  inst.controller = 'you'; inst.owner = 'you';
  G.you.battlefield.push(inst);
  return { G, inst };
}
const CTX = (name) => ({ controller: 'you', sourceName: name, sourceIid: -1 });

console.log('=== embargo: apply_sticker(cost_mod +1) + move_card(bf→hand) ===');
(() => {
  const { G, inst } = bootWithCreature();
  const before = (inst.cost && inst.cost.C) || 0;
  const tgt = { kind: 'creature', iid: inst.iid };
  ENGINE.applyEffect(CTX('Embargo'), { kind: 'apply_sticker', sticker: { kind: 'cost_mod', amount: 1, stackable: true } }, tgt);
  ENGINE.applyEffect(CTX('Embargo'), { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' }, tgt);
  check('runtime cost.C raised by 1', (inst.cost.C || 0) === before + 1, before + '→' + inst.cost.C);
  check('creature bounced to hand', !G.you.battlefield.some(c => c.iid === inst.iid) && G.you.hand.some(c => c.iid === inst.iid));
  check('cost_mod sticker persisted on the slot', RUN.getSlots()[0].stickers.some(s => s && s.kind === 'cost_mod'));
})();

console.log('\n=== embargo persists across a fresh makeCard (next-game rebuild) ===');
(() => {
  // Slot 0 now carries the cost_mod sticker from the prior block's RUN.
  const rebuilt = ENGINE.makeCard(CR, RUN.getSlots()[0].stickers, 0);
  const base = (CARDS[CR].cost && CARDS[CR].cost.C) || 0;
  check('rebuilt card from the stickered slot costs {1} more', (rebuilt.cost.C || 0) === base + 1, 'base=' + base + ' rebuilt=' + rebuilt.cost.C);
})();

console.log('\n=== bleach: apply_sticker(set_color C) + move_card(bf→exile) ===');
(() => {
  const { G, inst } = bootWithCreature();
  const tgt = { kind: 'creature', iid: inst.iid };
  ENGINE.applyEffect(CTX('Bleach'), { kind: 'apply_sticker', sticker: { kind: 'set_color', color: 'C' } }, tgt);
  ENGINE.applyEffect(CTX('Bleach'), { kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target' }, tgt);
  check('runtime color set to C', inst.color === 'C', 'color=' + inst.color);
  check('creature exiled', !G.you.battlefield.some(c => c.iid === inst.iid) && G.you.exile.some(c => c.iid === inst.iid));
  check('set_color sticker persisted on the slot', RUN.getSlots()[0].stickers.some(s => s && s.kind === 'set_color'));
})();

console.log('\n=== embargo/bleach card.json are decomposed (no bespoke kinds) ===');
(() => {
  const embKinds = CARDS.embargo.effects.map(e => e.kind);
  const blKinds = CARDS.bleach.effects.map(e => e.kind);
  check('embargo = [apply_sticker, move_card]', JSON.stringify(embKinds) === JSON.stringify(['apply_sticker', 'move_card']));
  check('bleach = [apply_sticker, move_card]', JSON.stringify(blKinds) === JSON.stringify(['apply_sticker', 'move_card']));
  check('no card uses the legacy embargo/bleach effect kinds', !Object.values(CARDS).some(c =>
    (Array.isArray(c.effects) ? c.effects : []).some(e => e && (e.kind === 'embargo' || e.kind === 'bleach'))));
})();

console.log('\n=== §3.8 snake_case: a save with legacy sticker ids loads renamed (no data loss) ===');
(() => {
  const blob = {
    version: SAVE_VERSION,
    runState: {
      slots: [{ tplId: 'plains', stickers: ['plus1plus1', 'costMinus1', 'landColor_W'] }],
    },
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  const ok = RUN.load();
  check('save loaded', ok === true);
  const stickers = RUN.getSlots()[0].stickers;
  check('plus1plus1 → plus1_plus1', stickers.includes('plus1_plus1'));
  check('costMinus1 → cost_minus_1', stickers.includes('cost_minus_1'));
  check('landColor_W → land_color_w', stickers.includes('land_color_w'));
  check('no legacy ids survive (would have been pruned as unknown)',
    !stickers.some(s => s === 'plus1plus1' || s === 'costMinus1' || s === 'landColor_W'));
})();

console.log('\n=== §3.8: the applyBalancerOverrides channel is gone (one sticker pipeline) ===');
(() => {
  const fs = require('fs');
  const path = require('path');
  const src = ['engine', 'stickers', 'run'].map(m =>
    fs.readFileSync(path.join(__dirname, '..', 'js', m + '.js'), 'utf8')).join('\n');
  check('applyBalancerOverrides function deleted', !/function applyBalancerOverrides/.test(src));
  check('symmetrizedTo sentinel gone (no property reads/writes)', !/\.symmetrizedTo\b/.test(src));
  // The slot-field write paths (slot.symmetricized/.colorOverride/.extraCost) are gone.
  check('no slot.symmetricized / colorOverride / extraCost writes', !/\.symmetricized\s*=|\.colorOverride\s*=|\.extraCost\s*=/.test(src));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
