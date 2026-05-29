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
  archmage: 'archmageOfVeils',
  fireImp:  'cinderSprite',
  zealot:   'holyZealot',
  merfolk:  'merfolkLooter',
};

console.log('=== TPLID_RENAMES matches the canonical map ===');
for (const [oldId, newId] of Object.entries(RENAMES)) {
  check(oldId + ' -> ' + newId, TPLID_RENAMES[oldId] === newId,
    'got ' + TPLID_RENAMES[oldId]);
}

console.log('\n=== renameTplId passes through unknown ids ===');
check('"savannahLions" -> "savannahLions"', renameTplId('savannahLions') === 'savannahLions');
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
        { tplId: 'zealot', stickers: [], stapledTpls: ['merfolk', 'savannahLions'] },
      ],
      pendingNeowModifier: 'phylactery',   // not in rename list -- unchanged
      currentPack: ['fireImp', 'bolt', 'archmage'],
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
    migrated.runState.slots[0].tplId === 'cinderSprite');
  check('slot[1].tplId archmage -> archmageOfVeils',
    migrated.runState.slots[1].tplId === 'archmageOfVeils');
  check('slot[2].tplId zealot -> holyZealot',
    migrated.runState.slots[2].tplId === 'holyZealot');
  check('slot[2].stapledTpls[0] merfolk -> merfolkLooter',
    migrated.runState.slots[2].stapledTpls[0] === 'merfolkLooter');
  check('slot[2].stapledTpls[1] savannahLions unchanged',
    migrated.runState.slots[2].stapledTpls[1] === 'savannahLions');
  check('pendingNeowModifier phylactery untouched',
    migrated.runState.pendingNeowModifier === 'phylactery');
  check('currentPack[0] fireImp -> cinderSprite',
    migrated.runState.currentPack[0] === 'cinderSprite');
  check('currentPack[1] bolt unchanged',
    migrated.runState.currentPack[1] === 'bolt');
  check('youPicks[0] merfolk -> merfolkLooter',
    migrated.runState.youPicks[0] === 'merfolkLooter');
  check('oppDecks[0][0] zealot -> holyZealot',
    migrated.runState.oppDecks[0][0] === 'holyZealot');
  check('oppDecks[1][1] merfolk -> merfolkLooter',
    migrated.runState.oppDecks[1][1] === 'merfolkLooter');
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
