// The browser loads cards through cards/_manifest.json, so a card folder that
// never got its manifest line ships INVISIBLE — present on disk, green in
// Node tests (which read the filesystem), absent from the actual game.
// Invariants:
//   1. Every folder under cards/ is listed in the manifest.
//   2. Every manifest entry has a folder with a card.json (no phantoms).
//   3. No duplicate manifest entries.
//   4. Each card.json's card_id matches its folder name (the tplId contract
//      from the module docs — catches copy-paste ids in new card batches).

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const cardsDir = path.join(__dirname, '..', 'cards');
const manifest = JSON.parse(fs.readFileSync(path.join(cardsDir, '_manifest.json'), 'utf8'));
const folders = fs.readdirSync(cardsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

console.log('=== cards/_manifest.json completeness ===');
const listed = new Set(manifest);
const onDisk = new Set(folders);

const unlisted = folders.filter((f) => !listed.has(f)).sort();
check('every card folder is listed in the manifest (' + folders.length + ' folders)',
  unlisted.length === 0,
  unlisted.length ? 'UNLISTED (invisible in the browser): ' + unlisted.join(', ') : '');

const phantoms = manifest.filter((m) => !onDisk.has(m)).sort();
check('every manifest entry has a folder (' + manifest.length + ' entries)',
  phantoms.length === 0,
  phantoms.length ? 'phantom entries: ' + phantoms.join(', ') : '');

check('no duplicate manifest entries',
  manifest.length === listed.size,
  manifest.length === listed.size ? '' : (manifest.length - listed.size) + ' duplicate(s)');

const badIds = [];
for (const f of folders) {
  const p = path.join(cardsDir, f, 'card.json');
  if (!fs.existsSync(p)) { badIds.push(f + ' (no card.json)'); continue; }
  const cj = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (cj.card_id !== f) badIds.push(f + ' (card_id: ' + cj.card_id + ')');
}
check('every folder has card.json with card_id === folder name',
  badIds.length === 0, badIds.join(', '));

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
