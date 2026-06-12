// tplId renames: four cards had legacy tplIds that didn't match their
// display names. This test verifies:
//   1. The new tplIds are in CARDS and the manifest; the old ones are gone.
//   2. TPLID_RENAMES maps every old id to the right new id.
//   3. The v1->v2 save migration translates every persisted tplId field.
//   4. PICKLOG load-time translation converts old picks/offered tplIds.
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

console.log('\n=== v1->v2 save migration translates all tplId fields ===');
{
  // Build a contrived v1 save blob that exercises every field where a
  // tplId can live.
  const v1Blob = {
    version: 1,
    runState: {
      slots: [
        { tplId: 'fireImp', stickers: ['plus1_plus1'] },
        { tplId: 'archmage', stickers: [] },
        // A slot with stapledTpls covering an old + new id mix.
        { tplId: 'zealot', stickers: [], stapledTpls: ['merfolk', 'savannah_lions'] },
      ],
      pendingNeowModifier: 'phylactery',   // not in rename list -- unchanged
      currentPack: ['fireImp', 'lightning_bolt', 'archmage'],
      youPicks: ['merfolk', 'shock'],
      oppDecks: [
        ['zealot', 'archmage', 'forest'],
        ['fireImp', 'merfolk'],
      ],
    },
  };
  const migrated = MIGRATIONS[1](v1Blob);
  check('version bumped to 2', migrated.version === 2);
  check('slot[0].tplId fireImp -> cinderSprite',
    migrated.runState.slots[0].tplId === 'cinder_sprite');
  check('slot[1].tplId archmage -> archmageOfVeils',
    migrated.runState.slots[1].tplId === 'archmage_of_veils');
  check('slot[2].tplId zealot -> holyZealot',
    migrated.runState.slots[2].tplId === 'holy_zealot');
  check('slot[2].stapledTpls[0] merfolk -> merfolkLooter',
    migrated.runState.slots[2].stapledTpls[0] === 'merfolk_looter');
  check('slot[2].stapledTpls[1] savannahLions unchanged',
    migrated.runState.slots[2].stapledTpls[1] === 'savannah_lions');
  check('pendingNeowModifier phylactery untouched',
    migrated.runState.pendingNeowModifier === 'phylactery');
  check('currentPack[0] fireImp -> cinderSprite',
    migrated.runState.currentPack[0] === 'cinder_sprite');
  check('currentPack[1] bolt unchanged',
    migrated.runState.currentPack[1] === 'lightning_bolt');
  check('youPicks[0] merfolk -> merfolkLooter',
    migrated.runState.youPicks[0] === 'merfolk_looter');
  check('oppDecks[0][0] zealot -> holyZealot',
    migrated.runState.oppDecks[0][0] === 'holy_zealot');
  check('oppDecks[1][1] merfolk -> merfolkLooter',
    migrated.runState.oppDecks[1][1] === 'merfolk_looter');
}

console.log('\n=== no TPLID_RENAMES key is a live card id (full map) ===');
{
  // Audit A9-9 (parked invariant — this guard ships): picklog.js re-applies
  // TPLID_RENAMES unconditionally on every load, so if a future card ever
  // REUSES one of the ~250 legacy keys, its picklog rows get silently
  // rewritten to the rename target forever. Every key must stay retired.
  const reused = Object.keys(TPLID_RENAMES).filter(k => CARDS[k]);
  check('every TPLID_RENAMES key is absent from CARDS',
    reused.length === 0,
    reused.length ? 'reused as live ids: ' + reused.join(', ') : undefined);
}

// NOTE: a "PICKLOG load-time translation" section was deleted here. It seeded
// localStorage with legacy tplIds but then never exercised PICKLOG's load path
// (the IIFE had already cached `data` and has no public reset) — instead it
// called renameTplId directly on its own seed data and asserted the result, i.e.
// it re-tested renameTplId (already covered above) and asserted nothing about
// PICKLOG. The comment admitted this. A real integration test would need a
// PICKLOG closure reset; until then there's nothing genuine to assert.

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
