// tplId renames: four cards had legacy tplIds that didn't match their
// display names.
//
// If a future Claude reverts a rename or adds a 5th legacy mismatch, this
// test fails loudly.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const RENAMES = {
  archmage: 'archmage_of_veils',
  fireImp:  'cinder_sprite',
  zealot:   'holy_zealot',
  merfolk:  'merfolk_looter',
};

console.log('=== TPLID_RENAMES matches the canonical map ===');
for (const [oldId, newId] of Object.entries(RENAMES)) {
  check(oldId + ' -> ' + newId, TPLID_RENAMES[oldId] === newId,
    'got ' + TPLID_RENAMES[oldId]);
}

console.log('\n=== renameTplId passes through unknown ids ===');
check('"savannah_lions" -> "savannah_lions"', renameTplId('savannah_lions') === 'savannah_lions');
check('"" -> ""', renameTplId('') === '');
check('null -> null', renameTplId(null) == null);  // == catches both null and undefined

console.log('\n=== CARDS lookup works for new ids, fails for old ===');
for (const [oldId, newId] of Object.entries(RENAMES)) {
  check('CARDS.' + newId + ' exists', !!CARDS[newId]);
  check('CARDS.' + oldId + ' is gone', !CARDS[oldId]);
}

console.log('\n=== manifest contains new ids only ===');
const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'cards', '_manifest.json'), 'utf8'));
for (const [oldId, newId] of Object.entries(RENAMES)) {
  check('manifest has ' + newId, manifest.includes(newId));
  check('manifest no longer has ' + oldId, !manifest.includes(oldId));
}

console.log('\n=== v1->v2 save migration translates every PERSISTED tplId carrier (audit A9-1) ===');
{
  // A v1 save blob using ONLY fields that actually persist on runState:
  // save() stores {version, runState}; youPicks/currentPack live on DRAFT's
  // in-memory `state`, never on the save. The real tplId carriers are: slots,
  // the mid-game snapshot (a deep-clone of slots) and pendingReward.replacementPack
  // (two shapes).
  const v1Blob = {
    version: 1,
    runState: {
      slots: [
        { tplId: 'fireImp', stickers: ['plus1_plus1'] },
        { tplId: 'archmage', stickers: [] },
        { tplId: 'zealot', stickers: [], stapledTpls: ['merfolk', 'savannah_lions'] },
      ],
      midGameSlotsSnapshot: [
        { tplId: 'fireImp', stickers: [] },
        { tplId: 'zealot', stickers: [], stapledTpls: ['merfolk'] },
      ],
      // 'mixed'-phase reward (Shape A): a transform candidate carries replacementPack.
      pendingReward: {
        phase: 'mixed',
        candidates: [
          { kind: 'transform', slotIdx: 1, replacementPack: ['fireImp', 'merfolk'] },
          { kind: 'sticker', slotIdx: 0, sticker_id: 'empower' },
        ],
      },
    },
  };
  const migrated = MIGRATIONS[1](v1Blob);
  check('version bumped to 2', migrated.version === 2);
  check('slot[0].tplId fireImp -> cinder_sprite', migrated.runState.slots[0].tplId === 'cinder_sprite');
  check('slot[1].tplId archmage -> archmage_of_veils', migrated.runState.slots[1].tplId === 'archmage_of_veils');
  check('slot[2].tplId zealot -> holy_zealot', migrated.runState.slots[2].tplId === 'holy_zealot');
  check('slot[2].stapledTpls[0] merfolk -> merfolk_looter', migrated.runState.slots[2].stapledTpls[0] === 'merfolk_looter');
  check('slot[2].stapledTpls[1] savannah_lions unchanged', migrated.runState.slots[2].stapledTpls[1] === 'savannah_lions');
  // An unmigrated snapshot keeps legacy tplIds, which resolve to "Unknown card"
  // on mid-game restore and wipe the run.
  check('A9-1: midGameSlotsSnapshot[0] fireImp -> cinder_sprite', migrated.runState.midGameSlotsSnapshot[0].tplId === 'cinder_sprite');
  check('A9-1: midGameSlotsSnapshot[1] zealot -> holy_zealot', migrated.runState.midGameSlotsSnapshot[1].tplId === 'holy_zealot');
  check('A9-1: snapshot stapledTpls merfolk -> merfolk_looter', migrated.runState.midGameSlotsSnapshot[1].stapledTpls[0] === 'merfolk_looter');
  check('A9-1: reward candidate replacementPack[0] fireImp -> cinder_sprite', migrated.runState.pendingReward.candidates[0].replacementPack[0] === 'cinder_sprite');
  check('A9-1: reward candidate replacementPack[1] merfolk -> merfolk_looter', migrated.runState.pendingReward.candidates[0].replacementPack[1] === 'merfolk_looter');
  check('sticker_id empower untouched (never a tplId)', migrated.runState.pendingReward.candidates[1].sticker_id === 'empower');
  check('no phantom pendingNeowModifier field invented', !('pendingNeowModifier' in migrated.runState));
  check('no phantom currentPack field invented', !('currentPack' in migrated.runState));
  check('no phantom youPicks field invented', !('youPicks' in migrated.runState));
  check('no phantom oppDecks field invented', !('oppDecks' in migrated.runState));
  // Unmigrated ids throw "Unknown card" (js/engine.js) on next deck build.
  const allIds = [...migrated.runState.slots, ...migrated.runState.midGameSlotsSnapshot].map(s => s.tplId);
  check('every migrated slot/snapshot tplId resolves in CARDS (no run-destruction)',
    allIds.every(id => !!CARDS[id]), allIds.filter(id => !CARDS[id]).join(','));
}

// Shape B: replacementPack is top-level on pendingReward, not nested under a candidate (contrast Shape A above).
console.log('\n=== A9-1: transformPick-phase reward replacementPack (Shape B) ===');
{
  const v1Blob = {
    version: 1,
    runState: {
      slots: [{ tplId: 'archmage', stickers: [] }],
      pendingReward: { phase: 'transformPick', slotIdx: 0, replacementPack: ['fireImp', 'archmage', 'lightning_bolt'] },
    },
  };
  const migrated = MIGRATIONS[1](v1Blob);
  check('Shape B replacementPack[0] fireImp -> cinder_sprite', migrated.runState.pendingReward.replacementPack[0] === 'cinder_sprite');
  check('Shape B replacementPack[1] archmage -> archmage_of_veils', migrated.runState.pendingReward.replacementPack[1] === 'archmage_of_veils');
  check('Shape B replacementPack[2] lightning_bolt unchanged', migrated.runState.pendingReward.replacementPack[2] === 'lightning_bolt');
}

console.log('\n=== no TPLID_RENAMES key is a live card id (full map) ===');
{
  // Audit A9-9: picklog.js re-applies TPLID_RENAMES unconditionally on every
  // load, so if a future card ever REUSES one of the ~250 legacy keys, its
  // picklog rows get silently rewritten to the rename target forever. Every
  // key must stay retired.
  const reused = Object.keys(TPLID_RENAMES).filter(k => CARDS[k]);
  check('every TPLID_RENAMES key is absent from CARDS',
    reused.length === 0,
    reused.length ? 'reused as live ids: ' + reused.join(', ') : undefined);
}

console.log('\n=== A9-9 boot helper: no rename-key collisions today ===');
{
  // The same invariant via the shared boot helper (main.js runs this at startup
  // and console.errors any collision). Empty today by construction.
  const clashes = tplidRenameKeyCollisions(CARDS);
  check('tplidRenameKeyCollisions(CARDS) is empty',
    Array.isArray(clashes) && clashes.length === 0,
    clashes && clashes.length ? clashes.join(', ') : undefined);
}

// NOTE: PICKLOG's IIFE caches `data` at load with no public reset, so its
// load-time tplId translation can't be exercised without a closure reset —
// there's nothing genuine to assert here yet.

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
