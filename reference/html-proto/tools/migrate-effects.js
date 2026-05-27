// Migrate proto card targeting to the target()-step model (Slice 3 /
// effects-refactor §3.5). CONSERVATIVE targeting decomposition: move a single
// per-effect `target` up to a top-level `target` step on its container
// (the card for on-cast effects, the trigger for trig.effects, the ability for
// ab.effects). Effect kinds are unchanged — they become bare and operate on the
// established target via the engine's resolution wiring.
//
// SKIPS (would lose information the closed target() taxonomy can't express):
// multi-slot effects, mixed target values, permanentOrSpell, and any effect
// carrying a non-controller filter (subtype/keyword/maxTough/…). Idempotent.
//
//   node tools/migrate-effects.js --dry   # report, write nothing
//   node tools/migrate-effects.js         # rewrite cards/<id>/card.json in place

const fs = require('fs');
const path = require('path');
const CARDS_DIR = path.join(__dirname, '..', 'cards');
const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');

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
    default: return null;
  }
}
function filterIsControllerOnly(filter) {
  if (!filter) return true;
  const keys = Object.keys(filter);
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'controller');
}

// Compute the target() step for an effects array, or a skip reason. Pure.
function planBlock(effects, alreadyHasTarget) {
  if (!Array.isArray(effects)) return { skip: 'no-array' };
  if (alreadyHasTarget) return { skip: 'already' };
  const targeted = effects.filter(e => e && e.target && e.target !== 'self');
  if (targeted.length === 0) return { skip: 'none' };
  if (targeted.some(e => typeof e.targetSlot === 'number' && e.targetSlot > 0)) return { skip: 'multi-slot' };
  const vals = [...new Set(targeted.map(e => e.target))];
  if (vals.length !== 1) return { skip: 'mixed-target' };
  const tv = vals[0];
  if (tv === 'permanentOrSpell') return { skip: 'permanentOrSpell' };
  if (targeted.some(e => !filterIsControllerOnly(e.filter))) return { skip: 'non-controller-filter' };
  const ctrls = [...new Set(targeted.map(e => (e.filter && e.filter.controller) || null))];
  if (ctrls.length !== 1) return { skip: 'mixed-controller' };
  const top = mapFilter(tv, ctrls[0]);
  if (!top) return { skip: 'unmappable' };
  const newEffects = effects.map(e => {
    if (e && e.target === tv) { const { target, filter, ...rest } = e; return rest; }
    return e;
  });
  return { target: top, effects: newEffects };
}

// Kind-collapse: rewrite a redundant legacy kind into its atomic + scope/sign
// form (the engine + AI valuation already support these). Returns the rewritten
// effect, or the same object if nothing to do. Idempotent (collapsed shapes
// aren't re-touched). addCounter is NOT collapsed yet (pump lacks `duration`).
function collapseEffect(e) {
  if (!e || !e.kind) return e;
  if (e.kind === 'damageAll') return { kind: 'damage', scope: 'all_creatures', amount: e.amount || 0 };
  if (e.kind === 'pumpAllYours') return { kind: 'pump', scope: 'all_yours', power: e.power || 0, toughness: e.toughness || 0 };
  if (e.kind === 'removeAll') {
    const whose = e.whose;
    const scope = whose === 'opp' ? 'all_opps' : (whose === 'self' || whose === 'you') ? 'all_yours' : 'all_creatures';
    return { kind: 'removeCreature', scope, severity: e.severity || 3 };
  }
  if (e.kind === 'weaken') {
    const { kind, power, toughness, ...rest } = e;
    return Object.assign({ kind: 'pump', power: -(power || 0), toughness: -(toughness || 0) }, rest);
  }
  if (e.kind === 'gainControl') {
    const { kind, ...rest } = e;  // preserves duration/grantHaste/untap (+ target if not migrated)
    return Object.assign({ kind: 'change_control' }, rest);
  }
  if (e.kind === 'steal') {
    const { kind, ...rest } = e;  // preserves target:permanentOrSpell + filter
    return Object.assign({ kind: 'change_control', transfer_ownership: true }, rest);
  }
  return e;
}
// Apply collapseEffect to every effect in a card (on-cast flat/modal, trigger,
// ability). Returns count rewritten.
function collapseAll(card) {
  let n = 0;
  const mapArr = (arr) => arr.map(e => { const c = collapseEffect(e); if (c !== e) n++; return c; });
  if (Array.isArray(card.effects)) card.effects = mapArr(card.effects);
  else if (card.effects && Array.isArray(card.effects.modes)) card.effects.modes = card.effects.modes.map(mapArr);
  for (const t of (card.triggers || [])) if (Array.isArray(t.effects)) t.effects = mapArr(t.effects);
  for (const a of (card.abilities || [])) if (Array.isArray(a.effects)) a.effects = mapArr(a.effects);
  return n;
}

const stats = { onCast: 0, trigger: 0, ability: 0, collapsed: 0 };
const skips = {};
function note(r) { if (r.skip) skips[r.skip] = (skips[r.skip] || 0) + 1; }

const manifest = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, '_manifest.json'), 'utf8'));
for (const folderId of manifest) {
  const file = path.join(CARDS_DIR, folderId, 'card.json');
  if (!fs.existsSync(file)) continue;
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;

  // Kind-collapse pass (damageAll/removeAll/pumpAllYours → scope; weaken → signed pump).
  const collapsedN = collapseAll(card);
  if (collapsedN) { stats.collapsed += collapsedN; changed = true; }

  // On-cast effects (skip whole-card multi-target spells). Rebuild so `target`
  // sits just before `effects`.
  if (!card.multiTarget) {
    const r = planBlock(card.effects, !!card.target);
    if (r.target) {
      const out = {};
      for (const [k, v] of Object.entries(card)) {
        if (k === 'effects') { out.target = r.target; out.effects = r.effects; }
        else if (k === 'target') { /* drop; re-added before effects */ }
        else out[k] = v;
      }
      Object.keys(card).forEach(k => delete card[k]);
      Object.assign(card, out);
      stats.onCast++; changed = true;
    } else note(r);
  }

  // Triggered abilities.
  for (const trig of (card.triggers || [])) {
    const r = planBlock(trig.effects, !!trig.target);
    if (r.target) { trig.target = r.target; trig.effects = r.effects; stats.trigger++; changed = true; }
    else note(r);
  }

  // Activated abilities.
  for (const ab of (card.abilities || [])) {
    const r = planBlock(ab.effects, !!ab.target);
    if (r.target) { ab.target = r.target; ab.effects = r.effects; stats.ability++; changed = true; }
    else note(r);
  }

  if (changed && !DRY) fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
}
console.log(`${DRY ? '[dry-run] ' : ''}Migrated target() steps — on-cast: ${stats.onCast}, trigger: ${stats.trigger}, ability: ${stats.ability}; collapsed kinds: ${stats.collapsed}.`);
console.log('Skips:', JSON.stringify(skips));
