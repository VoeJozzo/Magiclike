// Audit A6-3 — inline set-semantics sticker descriptors (set_color / set_types)
// dedup on push instead of appending an identical entry every application
// (unbounded growth of the stored list, e.g. Bleaching one slot across N games).
// The EFFECT is idempotent either way; this only stops the duplicate STORE.
// cost_mod stays stackable (embargo taxes intentionally accumulate).
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const countKind = (arr, k) => (arr || []).filter(s => s && typeof s === 'object' && s.kind === k).length;

console.log('=== A6-3: runtime card dedups inline set_color ===');
(() => {
  const card = { tplId: 'x', name: 'x', stickers: [], cost: { R: 1, C: 2 } };
  applyOneStickerToRuntimeCard(card, { kind: 'set_color', color: 'C' });
  applyOneStickerToRuntimeCard(card, { kind: 'set_color', color: 'C' });
  check('one set_color entry after two applies', countKind(card.stickers, 'set_color') === 1,
    'count=' + countKind(card.stickers, 'set_color'));
  check('set_color effect still applied (color C)', card.color === 'C');
})();

console.log('\n=== A6-3: runtime card dedups inline set_types ===');
(() => {
  const card = { tplId: 'x', name: 'x', stickers: [], types: ['Creature'] };
  applyOneStickerToRuntimeCard(card, { kind: 'set_types', types: ['Artifact'] });
  applyOneStickerToRuntimeCard(card, { kind: 'set_types', types: ['Artifact'] });
  check('one set_types entry after two applies', countKind(card.stickers, 'set_types') === 1,
    'count=' + countKind(card.stickers, 'set_types'));
  check('set_types effect still applied', JSON.stringify(card.types) === JSON.stringify(['Artifact']));
})();

console.log('\n=== A6-3: persisted slot dedups inline set_color ===');
(() => {
  RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.applyStickerToSlot(0, { kind: 'set_color', color: 'C' });
  RUN.applyStickerToSlot(0, { kind: 'set_color', color: 'C' });
  check('one set_color entry on the slot', countKind(RUN.getSlots()[0].stickers, 'set_color') === 1,
    'count=' + countKind(RUN.getSlots()[0].stickers, 'set_color'));
})();

console.log('\n=== A6-3 control: cost_mod STILL stacks (not over-deduped) ===');
(() => {
  RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.applyStickerToSlot(0, { kind: 'cost_mod', amount: 1, stackable: true });
  RUN.applyStickerToSlot(0, { kind: 'cost_mod', amount: 1, stackable: true });
  check('two cost_mod entries remain (stackable preserved)',
    countKind(RUN.getSlots()[0].stickers, 'cost_mod') === 2,
    'count=' + countKind(RUN.getSlots()[0].stickers, 'cost_mod'));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
