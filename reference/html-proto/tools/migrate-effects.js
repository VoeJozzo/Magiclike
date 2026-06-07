// Migrate proto card targeting to the target()-step model (Slice 3 /
// effects-refactor §3.5). CONSERVATIVE targeting decomposition: move a single
// per-effect `target` up to a top-level `target` step on its container
// (the card for on-cast effects, the trigger for trig.effects, the ability for
// ab.effects). Effect kinds are unchanged — they become bare and operate on the
// established target via the engine's resolution wiring.
//
// SKIPS (would lose information the closed target() taxonomy can't express):
// multi-slot effects, mixed target values, permanent_or_spell, and any effect
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
    // The legacy `graveyard_creature` kind collapsed into the composable
    // `graveyard_card` target; its implicit "Creature" restriction is injected as
    // an explicit type filter in planBlock (the kind itself no longer carries it).
    case 'graveyard_creature': return 'graveyard_card';
    case 'creature':
      if (controller === 'self') return 'your_creature';
      if (controller === 'opp') return 'opp_creature';
      return 'creature';
    default: return null;
  }
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
  if (tv === 'permanent_or_spell') return { skip: 'permanent_or_spell' };
  // All targeted effects must share one filter so a single top-level step
  // covers them (single-target cards trivially do).
  const filterKeys = [...new Set(targeted.map(e => JSON.stringify(e.filter || null)))];
  if (filterKeys.length !== 1) return { skip: 'mixed-filter' };
  const filter = targeted[0].filter || null;
  const ctrl = (filter && filter.controller) || null;
  const top = mapFilter(tv, ctrl);
  if (!top) return { skip: 'unmappable' };
  // Controller folds into the taxonomy kind (your_creature/opp_creature); any
  // remaining restriction keys (notColor, hasKeyword, maxTough, tapped,
  // notToken, …) lift to a top-level `target_filter`.
  let targetFilter = null;
  if (filter) {
    const { controller, ...rest } = filter;
    if (Object.keys(rest).length > 0) targetFilter = rest;
  }
  // `graveyard_creature` implied a Creature restriction that the generic
  // `graveyard_card` kind doesn't; make it explicit (merged with any subtype the
  // card already carried, e.g. Spirit). Own-yard default is `graveyards: ['self']`.
  if (tv === 'graveyard_creature') {
    targetFilter = Object.assign({ type: 'Creature' }, targetFilter || {});
  }
  const newEffects = effects.map(e => {
    if (e && e.target === tv) { const { target, filter, ...rest } = e; return rest; }
    return e;
  });
  const plan = { target: top, effects: newEffects };
  if (targetFilter) plan.targetFilter = targetFilter;
  return plan;
}

// Kind-collapse: rewrite a redundant legacy kind into its atomic + scope/sign
// form (the engine + AI valuation already support these). Returns the rewritten
// effect, or the same object if nothing to do. Idempotent (collapsed shapes
// aren't re-touched). add_counter is NOT collapsed yet (pump lacks `duration`).
function collapseEffect(e) {
  if (!e || !e.kind) return e;
  if (e.kind === 'damageAll') return { kind: 'damage', scope: 'all_creatures', amount: e.amount || 0 };
  if (e.kind === 'pumpAllYours') return { kind: 'pump', scope: 'all_yours', power: e.power || 0, toughness: e.toughness || 0 };
  if (e.kind === 'removeAll') {
    const whose = e.whose;
    const scope = whose === 'opp' ? 'all_opps' : (whose === 'self' || whose === 'you') ? 'all_yours' : 'all_creatures';
    return { kind: 'affect_creature', scope, severity: e.severity || 'destroy' };
  }
  if (e.kind === 'weaken') {
    const { kind, power, toughness, ...rest } = e;
    return Object.assign({ kind: 'pump', power: -(power || 0), toughness: -(toughness || 0) }, rest);
  }
  if (e.kind === 'add_counter') {
    const { kind, ...rest } = e;  // +1/+1 counters → permanent pump (preserves target:self)
    return Object.assign({ kind: 'pump', duration: 'permanent' }, rest);
  }
  if (e.kind === 'gainControl') {
    const { kind, ...rest } = e;  // preserves duration/grantHaste/untap (+ target if not migrated)
    return Object.assign({ kind: 'change_control' }, rest);
  }
  if (e.kind === 'steal') {
    const { kind, ...rest } = e;  // preserves target:permanent_or_spell + filter
    return Object.assign({ kind: 'change_control', transfer_ownership: true }, rest);
  }
  if (e.kind === 'draw') {
    // Every draw in the pool is a controller-draw (no targeted-player draw).
    // → move_card(library → hand, controller_top). Drops target:'self' if present.
    const { kind, target, ...rest } = e;
    return Object.assign({ kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top' }, rest);
  }
  if (e.kind === 'exileUntilEOT') {
    // Exile then return at end of turn (plan §9.1/D9): move_card(bf→exile) +
    // schedule_delayed(move_card(exile→bf), end_step). Both on the top-level target.
    const { kind, target, filter, ...rest } = e;
    return [
      Object.assign({ kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target' }, rest),
      { kind: 'schedule_delayed', when: 'end_step',
        effects: [{ kind: 'move_card', from_zone: 'exile', to_zone: 'battlefield', selector: 'target' }] },
    ];
  }
  if (e.kind === 'flicker') {
    // flicker = exile then immediately return (plan §4.1 / line 763: the
    // synchronous variant, two move_cards back-to-back, no schedule_delayed).
    // Both operate on the card's top-level target() step via selector:'target'.
    const { kind, target, filter, ...rest } = e;
    return [
      Object.assign({ kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target' }, rest),
      { kind: 'move_card', from_zone: 'exile', to_zone: 'battlefield', selector: 'target' },
    ];
  }
  if (e.kind === 'discard') {
    const { kind, ...rest } = e;  // preserves target:'self' (controller) or bare (targeted player) + amount
    return Object.assign({ kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard' }, rest);
  }
  if (e.kind === 'searchCreature') {
    const { kind, ...rest } = e;  // → prompt-driven library search to hand
    return Object.assign({ kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'library_search', filter: { type: 'Creature' } }, rest);
  }
  if (e.kind === 'searchLandTapped') {
    const { kind, ...rest } = e;  // → auto land-fetch onto the battlefield, tapped
    return Object.assign({ kind: 'move_card', from_zone: 'library', to_zone: 'battlefield', filter: { type: 'Land' }, post: { tap: true } }, rest);
  }
  if (e.kind === 'returnFromGraveyard') {
    const { kind, ...rest } = e;  // bare (target migrated to top-level graveyard_card)
    return Object.assign({ kind: 'move_card', from_zone: 'graveyard', to_zone: 'hand', selector: 'target' }, rest);
  }
  if (e.kind === 'shuffleIntoLibrary') {
    const { kind, ...rest } = e;  // bare (target migrated to top-level creature)
    return Object.assign({ kind: 'move_card', from_zone: 'battlefield', to_zone: 'library', selector: 'target', post: { shuffle: true } }, rest);
  }
  return e;
}
// Step 12 (§1.2): strip an ability's `noop` slot-marker. The per-effect
// {targetSlot, target, filter} specs become an ability-level `targetSlots`
// array; the noop is removed and the real effects shed their slot-targeting
// (Stapler's apply_in_game_splice reads ctx.allTargets directly). Idempotent —
// an ability with no noop is left untouched. Returns true if rewritten.
function stripNoopSlots(ab) {
  if (!Array.isArray(ab.effects) || !ab.effects.some(e => e.kind === 'noop')) return false;
  const specs = [];
  for (const e of ab.effects) {
    if (typeof e.targetSlot === 'number' && e.target) {
      const spec = { target: e.target };
      if (e.filter) spec.filter = e.filter;
      specs[e.targetSlot] = spec;
    }
  }
  ab.targetSlots = specs;
  ab.effects = ab.effects.filter(e => e.kind !== 'noop')
    .map(e => { const { target, targetSlot, filter, ...rest } = e; return rest; });
  return true;
}

// Apply collapseEffect to every effect in a card (on-cast flat/modal, trigger,
// ability). Returns count rewritten.
function collapseAll(card) {
  let n = 0;
  const mapArr = (arr) => arr.flatMap(e => {
    const c = collapseEffect(e);
    if (c !== e) n++;
    return Array.isArray(c) ? c : [c];   // flicker expands one effect into two
  });
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
        if (k === 'effects') {
          out.target = r.target;
          if (r.targetFilter) out.target_filter = r.targetFilter;
          out.effects = r.effects;
        }
        else if (k === 'target' || k === 'target_filter') { /* drop; re-added before effects */ }
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
    if (r.target) {
      trig.target = r.target;
      if (r.targetFilter) trig.target_filter = r.targetFilter;
      trig.effects = r.effects; stats.trigger++; changed = true;
    } else note(r);
  }

  // Activated abilities.
  for (const ab of (card.abilities || [])) {
    if (stripNoopSlots(ab)) { stats.noopStripped = (stats.noopStripped || 0) + 1; changed = true; }
    const r = planBlock(ab.effects, !!ab.target);
    if (r.target) {
      ab.target = r.target;
      if (r.targetFilter) ab.target_filter = r.targetFilter;
      ab.effects = r.effects; stats.ability++; changed = true;
    } else note(r);
  }

  if (changed && !DRY) fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
}
console.log(`${DRY ? '[dry-run] ' : ''}Migrated target() steps — on-cast: ${stats.onCast}, trigger: ${stats.trigger}, ability: ${stats.ability}; collapsed kinds: ${stats.collapsed}.`);
console.log('Skips:', JSON.stringify(skips));
