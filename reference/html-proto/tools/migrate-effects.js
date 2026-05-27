// Migrate proto card ON-CAST effects to the target()-step model (Slice 3 /
// effects-refactor §3.5). CONSERVATIVE targeting decomposition only: move a
// single per-effect `target` up to a top-level `target` step; the effect kinds
// are unchanged (they become bare and operate on the established target via the
// engine's resolution wiring). Mass/multi-target/modal cards and any effect
// carrying a non-controller filter (subtype/keyword/maxTough/…) are SKIPPED —
// the closed target() taxonomy can't express those yet, and dropping the filter
// would be a correctness regression.
//
//   node tools/migrate-effects.js --dry   # report, write nothing
//   node tools/migrate-effects.js         # rewrite cards/<id>/card.json in place

const fs = require('fs');
const path = require('path');
const CARDS_DIR = path.join(__dirname, '..', 'cards');
const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');

// per-effect target value → top-level target() filter (closed taxonomy).
function mapFilter(targetVal, controller) {
  switch (targetVal) {
    case 'any': return 'creature_or_player';
    case 'player': return 'player';
    case 'spell': return 'spell';
    case 'permanent': return 'permanent';
    case 'graveyardCreature': return 'graveyard_creature';
    case 'creature':
      if (controller === 'self') return 'your_creature';
      if (controller === 'opp') return 'opp_creature';
      return 'creature';
    default: return null; // permanentOrSpell etc. → not migratable here
  }
}
// A filter is taxonomy-expressible only if its sole key is `controller`.
function filterIsControllerOnly(filter) {
  if (!filter) return true;
  const keys = Object.keys(filter);
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'controller');
}

function migrateOnCast(card) {
  if (!Array.isArray(card.effects)) return { skip: 'modal/none' };
  if (card.multiTarget) return { skip: 'multiTarget' };
  if (card.target) return { skip: 'already-migrated' };
  const targeted = card.effects.filter(e => e && e.target && e.target !== 'self');
  if (targeted.length === 0) return { skip: 'no-targeted-effect' };
  if (targeted.some(e => typeof e.targetSlot === 'number' && e.targetSlot > 0)) return { skip: 'multi-slot' };
  const vals = [...new Set(targeted.map(e => e.target))];
  if (vals.length !== 1) return { skip: 'mixed-target-values' };
  const targetVal = vals[0];
  if (targetVal === 'permanentOrSpell') return { skip: 'permanentOrSpell' };
  if (targeted.some(e => !filterIsControllerOnly(e.filter))) return { skip: 'non-controller-filter' };
  const controllers = [...new Set(targeted.map(e => (e.filter && e.filter.controller) || null))];
  if (controllers.length !== 1) return { skip: 'mixed-controller-filter' };
  const top = mapFilter(targetVal, controllers[0]);
  if (!top) return { skip: 'unmappable-target' };

  // Build the migrated effects array: strip target+filter from the matching
  // targeted effects; leave self/untargeted effects untouched.
  const newEffects = card.effects.map(e => {
    if (e && e.target === targetVal) {
      const { target, filter, ...rest } = e;
      return rest;
    }
    return e;
  });
  // Rebuild the card with `target` placed just before `effects` for readability.
  const out = {};
  for (const [k, v] of Object.entries(card)) {
    if (k === 'effects') { out.target = top; out.effects = newEffects; }
    else out[k] = v;
  }
  if (!('effects' in card)) { out.target = top; } // defensive
  return { card: out };
}

let migrated = 0, scanned = 0;
const skips = {};
const manifest = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, '_manifest.json'), 'utf8'));
for (const folderId of manifest) {
  const file = path.join(CARDS_DIR, folderId, 'card.json');
  if (!fs.existsSync(file)) continue;
  scanned++;
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = migrateOnCast(card);
  if (r.skip) { skips[r.skip] = (skips[r.skip] || 0) + 1; continue; }
  migrated++;
  if (!DRY) fs.writeFileSync(file, JSON.stringify(r.card, null, 2) + '\n');
}
console.log(`${DRY ? '[dry-run] ' : ''}Scanned ${scanned}; migrated ${migrated} on-cast targeting steps.`);
console.log('Skips:', JSON.stringify(skips, null, 0));
