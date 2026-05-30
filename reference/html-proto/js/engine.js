// Mercurial Adept's trigger pool. makeCard rolls one fresh per game from
// this pool, so the same slot has a different personality each fight.
// `label` is shown in the card popup repertoire (with the active one indicated).
const MERCURIAL_TRIGGER_POOL = [
  {
    label: 'Striker',
    event: 'attacks',
    condition: ['this_card'],
    text: '~ attacked — opp loses 1 life.',
    effects: [{kind: 'damage', target: 'player', amount: 1}],
  },
  {
    label: 'Spellsworn',
    event: 'spell_cast',
    condition: ['another_card', 'controlled_by(you)'],
    text: 'Spell cast — ~ gets +1/+0 EOT.',
    effects: [{kind: 'pump', scope: 'self', power: 1, toughness: 0}],
  },
  {
    label: 'Standard-bearer',
    event: 'card_zone_change',
    condition: ['another_card', 'card_is_creature', 'controlled_by(you)', 'card_moves(anywhere, battlefield)'],
    text: 'Ally entered — ~ gets a +1/+1 counter.',
    effects: [{kind: 'add_counter', scope: 'self', power: 1, toughness: 1}],
  },
  {
    label: 'Bloodscholar',
    event: 'life_changed',
    condition: ['is_life_gain', 'affected_player_is(you)'],
    text: 'Life gained — draw a card.',
    effects: [{kind: 'draw', scope: 'self', amount: 1}],
  },
  {
    label: 'Reaper',
    event: 'card_zone_change',
    condition: ['another_card', 'card_is_creature', 'card_moves(battlefield, graveyard)'],
    text: 'Creature died — ~ gets +1/+0 EOT.',
    effects: [{kind: 'pump', scope: 'self', power: 1, toughness: 0}],
  },
  {
    label: 'Hexweaver',
    event: 'card_zone_change',
    condition: ['this_card', 'card_moves(anywhere, battlefield)'],
    text: '~ entered — gain 2 life.',
    effects: [{kind: 'gain_life', scope: 'self', amount: 2}],
  },
];

// Mercurial Adept now seeds her pool via trigger_pool_seed:'mercurial' (see makePlayer).
// Pre-v1.0.0 saves carried an embedded triggerPool on the slot — still works via the slot-level path.


// ENGINE — game rules, state, phase machine.
// Public API: init, state, expectedActor, getLegalActions, executeAction, subscribe, findCard, getStats.

// Sticker pipeline moved to js/stickers.js — see that file for
// weightedPick, applyStickersToCard, applyOneStickerToRuntimeCard,
// applyRandomStickersToSide, empowerRollLabel, applyEmpowerRoll
// (this range), and rollSubtypeFromDeck, pushStickerWithRoll,
// stickersForSlot (further below). They remain in global scope.


// Splice eligibility — module-level so ENGINE (synthesis) and RUN (reward) share.
// Modal-as-base unsupported. See isCompatibleStaplePair for type-pair matrix.
function isSpliceableBase(tplId) {
  const tpl = CARDS[tplId];
  if (!tpl) return false;
  if (tpl.special) return false;
  if (tpl.stapleable === false) return false;
  if (tpl.effects && tpl.effects.modes) return false;
  return true;
}
function isSpliceableStaple(tplId) {
  const tpl = CARDS[tplId];
  if (!tpl) return false;
  if (tpl.special) return false;
  if (tpl.stapleable === false) return false;
  if (tpl.effects && tpl.effects.modes) return false;
  return true;
}
// Splice compatibility:
//   Base\Staple  Creature  Spell  Land
//   Creature     ok(merge) ETB    tap-ability
//   Spell        NO        concat add_mana
//   Land         NO        ETB    mana-merge
// Callers must canonicalize first (canonicalSplicePair).

// Canonical ordering by type priority: Creature(0) > Artifact(1) > Land(2) > Spell(3).
// Returns [base, staple, swapped] so callers can fix parallel arrays.
function canonicalSplicePair(tplA, tplB) {
  const priority = (tplId) => {
    const tpl = CARDS[tplId];
    if (!tpl) return 4;
    if (hasType(tpl, 'Creature')) return 0;
    if (hasType(tpl, 'Artifact')) return 1;
    if (hasType(tpl, 'Land')) return 2;
    return 3;
  };
  const pA = priority(tplA);
  const pB = priority(tplB);
  if (pB < pA) return [tplB, tplA, true];
  return [tplA, tplB, false];
}

function isCompatibleStaplePair(baseTplId, stapleTplId) {
  if (!isSpliceableBase(baseTplId)) return false;
  if (!isSpliceableStaple(stapleTplId)) return false;
  // §3.10: the multi-color-land restriction is lifted — the synthesized
  // tap-ability now uses the add_mana choose form (§3.9), so a multi-color land
  // (City of Brass) is a valid staple onto any base.
  return true;
}

// Splice merge math — shared by RUN.applySplice and ENGINE.EFFECTS.apply_in_game_splice.
function countEffects(tpl) {
  if (!tpl || !tpl.effects) return 0;
  if (Array.isArray(tpl.effects)) return tpl.effects.length;
  if (tpl.effects.modes) {
    return tpl.effects.modes.reduce((s, m) => s + m.length, 0);
  }
  return 0;
}

function remapEmpowerRollForStaple(roll, baseIsCreature, stapleIsCreature,
                                   priorMergedEffectCount, priorMergedTriggerCount, priorMergedAbilityCount) {
  if (!roll) return roll;
  if (baseIsCreature && stapleIsCreature) {
    if (roll.location === 'triggers') {
      return {...roll, subIdx: (roll.subIdx || 0) + priorMergedTriggerCount};
    }
    if (roll.location === 'abilities') {
      return {...roll, subIdx: (roll.subIdx || 0) + priorMergedAbilityCount};
    }
    return roll;
  }
  if (roll.location !== 'effects') return roll;
  if (baseIsCreature) {
    return {
      ...roll,
      location: 'triggers',
      subIdx: priorMergedTriggerCount,
    };
  }
  return {
    ...roll,
    effIdx: roll.effIdx + priorMergedEffectCount,
  };
}

// Shared splice-merge core (plan-effects-refactor §7). The assembly logic that
// was duplicated between RUN.applySplice (reward-time, slot data) and
// EFFECTS.apply_in_game_splice (in-game, runtime cards): given the base + staple's
// slot-shaped parts, compute the merged slot data. PURE — no state mutation, no
// I/O; each caller applies the result its own way (RUN writes the slot + saves;
// the Stapler path rebuilds the runtime card + mints a slot + transfers combat).
//
// `base.priorStaples` is the base's existing staple chain — `slot.stapledTpls`
// for the reward path, `card.stapledFrom.stapledTpls` for the in-game path. The
// empower-roll remap depends on it (concatenating effects/triggers shifts the
// indices a roll points at). Callers pass whichever field holds their chain.
function mergeSpliceData(base, staple) {
  const baseTpl = CARDS[base.tplId];
  const stapleTpl = CARDS[staple.tplId];
  const baseIsCreature = hasType(baseTpl, 'Creature');
  const stapleIsCreature = !!(stapleTpl && hasType(stapleTpl, 'Creature'));
  // Merged effect/trigger/ability counts BEFORE this staple — accounts for any
  // prior staples, since each shifts the indices differently by merge case:
  //   Creature+Creature → prior's triggers + abilities concat into the merged
  //     arrays; Creature base + Spell staple → prior becomes one ETB trigger;
  //     Spell base + Spell staple → prior's effects concat.
  let priorMergedEffectCount = countEffects(baseTpl);
  let priorMergedTriggerCount = (baseTpl.triggers || []).length;
  let priorMergedAbilityCount = (baseTpl.abilities || []).length;
  const priorStaples = (base.priorStaples || []).slice();
  for (const priorTplId of priorStaples) {
    const priorTpl = CARDS[priorTplId];
    if (!priorTpl) continue;
    if (baseIsCreature && hasType(priorTpl, 'Creature')) {
      priorMergedTriggerCount += (priorTpl.triggers || []).length;
      priorMergedAbilityCount += (priorTpl.abilities || []).length;
    } else if (baseIsCreature) {
      priorMergedTriggerCount += 1;
    } else {
      priorMergedEffectCount += countEffects(priorTpl);
    }
  }
  const remappedRolls = (staple.empowerRolls || []).map(roll =>
    remapEmpowerRollForStaple(roll, baseIsCreature, stapleIsCreature,
                              priorMergedEffectCount, priorMergedTriggerCount, priorMergedAbilityCount));
  const baseBuffs = Array.isArray(base.permaBuffs) ? base.permaBuffs : [];
  const stapleBuffs = Array.isArray(staple.permaBuffs) ? staple.permaBuffs : [];
  return {
    stapledTpls: priorStaples.concat([staple.tplId]),
    stickers: (base.stickers || []).concat(staple.stickers || []),
    empowerRolls: (base.empowerRolls || []).concat(remappedRolls),
    subtypeRolls: (base.subtypeRolls || []).concat(staple.subtypeRolls || []),
    permaBuffs: baseBuffs.concat(stapleBuffs),
    bonusTrigger: base.bonusTrigger || staple.bonusTrigger || null,
  };
}

// Apply merged splice data onto a slot — the field-writes shared by the reward
// path (RUN.applySplice) and both in-game mint paths (perm-base, spell-base).
// Does NOT persist; callers control save() timing (RUN batches one save at the
// end; the in-game paths save per-mint).
function writeMergedSpliceToSlot(slot, merged) {
  if (!slot) return;
  slot.stapledTpls = merged.stapledTpls;
  slot.stickers = merged.stickers;
  slot.empowerRolls = merged.empowerRolls;
  if (merged.subtypeRolls.length > 0) slot.subtypeRolls = merged.subtypeRolls;
  if (merged.permaBuffs.length > 0) slot.permaBuffs = merged.permaBuffs;
  if (merged.bonusTrigger) slot.bonusTrigger = merged.bonusTrigger;
}

// §3.9: lands and creature dorks both produce mana via a tap-for-mana ability
// (the `extraManaColors` parallel model is retired). These helpers read that
// ability as the single source of truth. Top-level (not IIFE-internal) so the
// module-level splice helpers and stickers.js can share them.
//
// The tap-for-mana ability on a permanent (cost.tap + add_mana), or null.
function manaAbilityOf(card) {
  if (!card || !Array.isArray(card.abilities)) return null;
  return card.abilities.find(ab => ab && ab.cost && ab.cost.tap
    && ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana') || null;
}
// Colors an add_mana effect can produce ({choose} or {amounts}).
function manaEffectColors(eff) {
  if (!eff) return [];
  if (eff.choose) return eff.choose === 'any' ? ['W', 'U', 'B', 'R', 'G'] : eff.choose.slice();
  return Object.keys(eff.amounts || {});
}
// Build a tap-for-mana ability for a color set: one color → fixed amounts,
// several → choose. Used by the staple-merge (land staples).
function manaAbilityForColors(colors) {
  const eff = (colors.length <= 1)
    ? { kind: 'add_mana', amounts: { [colors[0]]: 1 } }
    : { kind: 'add_mana', choose: colors.slice() };
  return { cost: { tap: true }, effects: [eff] };
}
// §3.8 grant_mana_ability(color): give a permanent the ability to tap for one
// more color. Generalizes the old land-only landColor sticker — works on any
// permanent. If the card already taps for mana, fold the color into that
// ability (fixed→choose, extend an existing choose, no-op for choose:'any');
// otherwise CREATE a {T}: add {color} ability (so a creature mana-dork sticker
// needs no extra engine work). Mutates in place.
function grantManaAbility(card, color) {
  const ab = manaAbilityOf(card);
  if (!ab) {
    if (!Array.isArray(card.abilities)) card.abilities = [];
    card.abilities.push(manaAbilityForColors([color]));
    return;
  }
  const eff = ab.effects[0];
  if (eff.choose === 'any') return;
  const cur = manaEffectColors(eff);
  if (cur.includes(color)) return;
  delete eff.amounts;
  eff.choose = cur.concat(color);
}
// Colors a land taps for, read from its tap-ability (§3.9). The `mana` field is
// just the primary-color label. Shared by canPayPotential, tap action, AI.
function landProducibleColors(card) {
  if (!card || !hasType(card, 'Land')) return [];
  const ab = manaAbilityOf(card);
  return ab ? manaEffectColors(ab.effects[0]) : [];
}

// Resolve slot → effective template (synthesized merge if stapled, else CARDS entry).
function tplForSlot(slot) {
  if (!slot) return null;
  if (Array.isArray(slot.stapledTpls) && slot.stapledTpls.length > 0) {
    return ENGINE.synthesizeStapledTemplate(slot.tplId, slot.stapledTpls);
  }
  return CARDS[slot.tplId] || null;
}

// (continued) Sticker deck-construction helpers — rollSubtypeFromDeck,
// pushStickerWithRoll, stickersForSlot — moved to js/stickers.js.


// Compute deck color set from a list of slot objects. Pure helper for
// gating land-color stickers, evaluating splice color compatibility, etc.
function deckColorsFromSlots(slots) {
  const set = new Set();
  for (const slot of slots) {
    const tpl = tplForSlot(slot);
    if (!tpl) continue;
    if (hasType(tpl, 'Land') && tpl.mana) set.add(tpl.mana);
    if (tpl.cost) {
      for (const c of ['W','U','B','R','G']) {
        if ((tpl.cost[c] || 0) > 0) set.add(c);
      }
    }
  }
  return [...set];
}

// Build a placeholder target array for legality probing — "could this be
// cast right now?" without committing to a real target. Returns null if
// any slot has no valid target. Multi-target spells need one entry per
// unique target_slot.
function fakeTargetsForLegality(effects, who) {
  const targetedEffs = (effects || []).filter(ENGINE.effectNeedsTarget);
  if (targetedEffs.length === 0) return [];
  const bySlot = new Map();
  for (const eff of targetedEffs) {
    const slot = eff.target_slot || 0;
    if (!bySlot.has(slot)) bySlot.set(slot, eff);
  }
  const targets = [];
  for (const [slot, eff] of bySlot) {
    const valid = ENGINE.getValidTargets(eff, who);
    if (!valid.length) return null;
    targets[slot] = valid[0];
  }
  for (let i = 0; i < targets.length; i++) {
    if (!targets[i]) targets[i] = targets[0] || {kind:'player', who: who, label: who === 'you' ? 'You' : 'Opponent'};
  }
  return targets;
}


// Card-text helpers (describeCardSegments, describeCardText, etc.) live in
// js/card-text.js. Still global — callers use them without a namespace prefix.

const ENGINE = (function() {

const COLORS = ['W','U','B','R','G'];

let G = null;
let nextIid = 1;
let listeners = [];

// Registry of "player owes a decision" modal types. To add: add G.<field> to
// makeState, then add an entry here. Note pendingTriggerTarget uses .controller, not .who.
const PENDING_DECISIONS = [
  { field: 'forcedDiscard',        who: d => d.who,        active: d => d.remaining > 0 },
  { field: 'pendingSearch',        who: d => d.who,        active: () => true },
  { field: 'pendingTriggerTarget', who: d => d.controller, active: () => true },
  { field: 'pendingTriggerBuild',  who: d => d.who,        active: () => true },
  { field: 'pendingNumberChoice',  who: d => d.who,        active: () => true },
  { field: 'pendingSymmetricizeChoice', who: d => d.who,   active: () => true },
  { field: 'pendingEdictChoice',   who: d => d.who,        active: () => true },
  { field: 'pendingOptionalCost',  who: d => d.who,        active: () => true },
];

// True if `who` is owed a decision by any open modal.
function playerOwesDecision(who) {
  for (const d of PENDING_DECISIONS) {
    const obj = G[d.field];
    if (obj && d.active(obj) && d.who(obj) === who) return true;
  }
  return false;
}

// True if any modal is open. Phase machine pauses while a decision is outstanding.
function anyoneOwesDecision() {
  for (const d of PENDING_DECISIONS) {
    const obj = G[d.field];
    if (obj && d.active(obj)) return true;
  }
  return false;
}

// ----- Construction -----
// Deck entries: tplId string (opp) or {tplId, stickers:[...]} (player).
// Deep-copy effects (flat array OR modal {mode_names, modes}). Per-instance
// isolation matters because Severity mutates effect amounts in place.
function copyCardEffects(effects) {
  if (!effects) return undefined;
  if (Array.isArray(effects)) return effects.map(e => ({...e}));
  // Modal shape.
  return {
    mode_names: effects.mode_names ? effects.mode_names.slice() : undefined,
    modes: (effects.modes || []).map(m => m.map(e => ({...e}))),
  };
}

// Stapling: combine cards via stapledTpls. Engine sees only the merged template.
// Multi-target remap: staple's targeted effects get target_slot += next-free-above-base.
function synthesizeStapledTemplate(baseTplId, stapledTpls) {
  const baseTpl = CARDS[baseTplId];
  if (!baseTpl) throw new Error('Unknown card: ' + baseTplId);
  if (!stapledTpls || stapledTpls.length === 0) return baseTpl;
  // Walk the staples and merge step by step into a deep-cloned working copy.
  // §3.10: a full deep clone (templates are pure JSON) instead of a
  // hand-maintained field list — a new schema field is then carried
  // automatically rather than silently dropped on every stapled card.
  const merged = JSON.parse(JSON.stringify(baseTpl));
  delete merged.tplId;   // synthetic template — not a real card id
  merged.cost = merged.cost || {};
  merged.keywords = merged.keywords || [];
  merged.triggers = merged.triggers || [];
  // Runtime synthesis marker, threaded via card.stapledFrom for downstream
  // callers (empower target enumeration, sticker eligibility, etc.).
  merged.stapledFrom = { baseTplId, stapledTpls: stapledTpls.slice() };
  for (const stapleTplId of stapledTpls) {
    const stapleTpl = CARDS[stapleTplId];
    if (!stapleTpl) continue;
    mergeStapleInto(merged, stapleTpl);
  }
  // Re-derive primary (first WUBRG present) and full color set from merged cost.
  // Primary feeds col-W/col-U CSS classes; full set drives multi-color splice tiles.
  if (merged.cost) {
    const present = ['W','U','B','R','G'].filter(k => (merged.cost[k] || 0) > 0);
    merged.color = present[0] || baseTpl.color || null;
    merged.colors = present;
  }
  // §5 staple type-union: Artifact is a CO-TYPE that rides along — if
  // any fused card carries one, the merged permanent keeps it (so a stapled
  // artifact creature stays an Artifact Creature, dying to artifact removal and
  // counting for artifact-matters). Creature/Land governance is deliberately NOT
  // unioned — Land+Creature collapses to a cast creature (play-vs-cast gates key
  // on hasType('Land'); a "true land-creature" is out of scope), and stapled
  // spells already collapse to an ETB trigger. merged.types is the source of
  // truth (cloned from the base, then unioned with each staple's subtypes above);
  // here we just union the Artifact co-type in if any fused card carried it.
  const involved = [baseTpl, ...stapledTpls.map(id => CARDS[id]).filter(Boolean)];
  for (const co of ['Artifact']) {
    if (involved.some(t => hasType(t, co)) && !merged.types.includes(co)) {
      merged.types.push(co);
    }
  }
  return merged;
}

// Mutate `merged` to add the staple's contribution. §3.10: dispatch on the
// STAPLE's type (not base-type branch order), leveraging the canonicalization
// hierarchy (Creature>Artifact>Land>Spell picks the base). Three behaviors:
//   staple Creature → body merge (base is always Creature here).
//   staple Land     → permanent base gains the land's tap-ability (Cr+Ld / Ld+Ld).
//   staple Spell    → permanent base gets an ETB trigger (Cr+Sp / Ld+Sp, identical);
//                     spell base concatenates effects (Sp+Sp, multi_target).
// Impossible pairs (a higher-priority staple that should have won the base slot)
// throw rather than silently degrading to Sp+Sp.
function mergeStapleInto(merged, stapleTpl) {
  if (stapleTpl.cost) {
    for (const [k, v] of Object.entries(stapleTpl.cost)) {
      merged.cost[k] = (merged.cost[k] || 0) + v;
    }
  }
  const basePermanent = hasType(merged, 'Creature') || hasType(merged, 'Land');
  if (hasType(stapleTpl, 'Creature')) {
    // Body merge. Base is always a Creature here (canonicalization), else a
    // creature staple would have won the base slot.
    if (!hasType(merged, 'Creature')) {
      throw new Error('staple-merge: creature staple on non-creature base ' + governingType(merged));
    }
    merged.power = (merged.power || 0) + (stapleTpl.power || 0);
    merged.toughness = (merged.toughness || 0) + (stapleTpl.toughness || 0);
    const stapleKws = stapleTpl.keywords || [];
    for (const kw of stapleKws) {
      if (!merged.keywords.includes(kw)) merged.keywords.push(kw);
    }
    // Subtype union (token-level dedup so Goblin+Goblin doesn't double) into the
    // merged type list — the single source of truth. Lord checks read subtypes
    // via subtypesOf / hasType.
    for (const st of subtypesOf(stapleTpl)) {
      if (!merged.types.includes(st)) merged.types.push(st);
    }
    // Triggers/abilities/static_buffs: concat with deep copy. Base's first.
    if (stapleTpl.triggers) {
      for (const t of stapleTpl.triggers) {
        merged.triggers.push({
          ...t,
          effects: (t.effects || []).map(e => ({...e})),
        });
      }
    }
    if (stapleTpl.abilities) {
      if (!Array.isArray(merged.abilities)) merged.abilities = [];
      for (const ab of stapleTpl.abilities) {
        merged.abilities.push({
          ...ab,
          cost: ab.cost ? {...ab.cost} : undefined,
          effects: (ab.effects || []).map(e => ({...e})),
        });
      }
    }
    if (stapleTpl.static_buffs) {
      if (!Array.isArray(merged.static_buffs)) merged.static_buffs = [];
      for (const b of stapleTpl.static_buffs) {
        merged.static_buffs.push({
          ...b,
          filter: b.filter ? {...b.filter} : undefined,
          keywords: b.keywords ? b.keywords.slice() : undefined,
        });
      }
    }
    if (stapleTpl.permanent_eot) merged.permanent_eot = true;
  } else if (hasType(stapleTpl, 'Land')) {
    // Permanent base gains the staple land's tap-ability (§3.9). Merge into an
    // existing mana ability (Ld+Ld, or a creature that already taps for mana —
    // one tap can only fire once, so merging to a choose-ability is equivalent
    // to two single-color abilities and cleaner); else append a fresh one
    // (vanilla Cr+Ld). Multi-color staples use the choose form (§3.9).
    if (!basePermanent) {
      throw new Error('staple-merge: land staple on spell base (canonicalization should make the land the base)');
    }
    const stapColors = landProducibleColors(stapleTpl);
    const oldAb = manaAbilityOf(merged);
    let allColors;
    if (oldAb) {
      allColors = manaEffectColors(oldAb.effects[0]).slice();
      for (const c of stapColors) if (!allColors.includes(c)) allColors.push(c);
      merged.abilities = merged.abilities.filter(ab => ab !== oldAb);
    } else {
      allColors = stapColors;
      if (!Array.isArray(merged.abilities)) merged.abilities = [];
    }
    merged.abilities.push(manaAbilityForColors(allColors));
  } else if (basePermanent) {
    // Spell staple on a permanent base → ETB trigger. Cr+Sp and Ld+Sp are
    // structurally the same trigger; they differ only in whether it's free.
    const nextFreeSlot = computeNextFreeSlot(merged);
    const remapped = remapEffectSlots(stapleTpl.effects, nextFreeSlot);
    const trig = {
      event: 'card_zone_change',
      condition: ['this_card', 'card_moves(anywhere, battlefield)'],
      text: 'ETB: ' + (stapleTpl.text || stapleTpl.name),
      effects: Array.isArray(remapped) ? remapped : [],
    };
    // Carry the spell's targeting onto the trigger. A migrated targeted spell
    // (lightning_bolt: top-level target() + a BARE damage effect) keeps its target on the
    // card, not on the effect — without copying it, the ETB trigger would run a
    // targetless damage and crash on a null target (which froze the AI mid-turn
    // for any permanent+targeted-spell staple). Per-slot multi-target spells
    // carry target_slots; their effects' target_slot indices were already
    // remapped above.
    if (stapleTpl.target) {
      trig.target = stapleTpl.target;
      if (stapleTpl.target_filter) trig.target_filter = stapleTpl.target_filter;
    }
    if (Array.isArray(stapleTpl.target_slots)) {
      trig.target_slots = stapleTpl.target_slots.map(spec =>
        Object.assign({}, spec, spec.target_filter ? { target_filter: { ...spec.target_filter } } : {}));
    }
    // Land base → the ETB is OPTIONAL and costs the spell's mana cost. A land is
    // free to play, so a free stapled spell is pure value; making it a "you may
    // pay {cost}" trigger restores the bargain. Creature/artifact bases stay
    // free — you already paid the base's full cost. (BACKLOG: optional paid ETB.)
    if (hasType(merged, 'Land') && stapleTpl.cost && Object.keys(stapleTpl.cost).length > 0) {
      trig.optional_cost = { ...stapleTpl.cost };
    }
    merged.triggers.push(trig);
  } else {
    // Spell base + spell staple: effects concat with slot remap. The merged
    // spell is multi-target — recognized structurally via per-effect target_slot
    // (slotsNeededForPending) and the canonical target API, not a flag.
    const nextFreeSlot = computeNextFreeSlot(merged);
    const remapped = remapEffectSlots(stapleTpl.effects, nextFreeSlot);
    if (!Array.isArray(merged.effects)) merged.effects = [];
    if (Array.isArray(remapped)) {
      merged.effects = merged.effects.concat(remapped);
    }
  }
  // No merged.text is built here — describeCardText regenerates it from the
  // merged effects/triggers/abilities (in makeCard, and at render time via
  // describeCardSegments). The merged `name` IS concatenated (names aren't
  // regenerated). Special/custom_text cards can't be staple bases or staples
  // (isSpliceableBase/Staple reject them), so regeneration always applies.
  merged.name = merged.name + ' + ' + stapleTpl.name;
}

// Highest target_slot in use + 1 (next free slot). 0 if untargeted.
function computeNextFreeSlot(merged) {
  let maxSlot = -1;
  function visit(eff) {
    if (!eff) return;
    if (eff.target && eff.target !== 'self') {
      maxSlot = Math.max(maxSlot, eff.target_slot || 0);
    }
  }
  if (Array.isArray(merged.effects)) merged.effects.forEach(visit);
  if (merged.effects && merged.effects.modes) {
    merged.effects.modes.forEach(m => m.forEach(visit));
  }
  for (const t of (merged.triggers || [])) (t.effects || []).forEach(visit);
  for (const ab of (merged.abilities || [])) (ab.effects || []).forEach(visit);
  return maxSlot + 1;
}

// Deep-copy effects and offset each target_slot. Same-slot grouping preserved.
// Modal shape (object) returned unchanged — staple-as-modal unsupported.
function remapEffectSlots(effects, offset) {
  if (!effects) return [];
  if (!Array.isArray(effects)) return effects;
  return effects.map(e => {
    const copy = {...e};
    if (copy.target && copy.target !== 'self') {
      copy.target_slot = (e.target_slot || 0) + offset;
    }
    return copy;
  });
}

function makeCard(tplId, stickers, slotIdx, empowerRolls, permaBuffs, bonusTrigger, stapledTpls, subtypeRolls) {
  const tpl = (stapledTpls && stapledTpls.length > 0)
    ? synthesizeStapledTemplate(tplId, stapledTpls)
    : CARDS[tplId];
  if (!tpl) throw new Error('Unknown card: ' + tplId);
  const card = {
    iid: nextIid++,
    tplId,
    // slotIdx: player → runState.slots index for run-persistent effects; opp → transient.
    slotIdx: (typeof slotIdx === 'number') ? slotIdx : null,
    name: tpl.name, art: tpl.art, text: tpl.text,
    // types[] is the card's sole type identity (no legacy type/sub). Carried to
    // the instance so typesOf/hasType/governingType read the full tag list; the
    // live typeGrants layer (add_type / set_types) rides on top.
    types: Array.isArray(tpl.types) ? tpl.types.slice() : [],
    // Top-level target() step (§3.5) — must carry to the runtime instance so
    // cast legality / enumeration / resolution see the targeting step. The
    // optional target_filter carries restrictions the closed taxonomy can't name.
    target: tpl.target,
    target_filter: tpl.target_filter,
    // Per-slot targeting (§5b multi-target: drainLife, branchingBolt, …). MUST be
    // carried to the instance or probeTargetsForObject finds no slots, falls back
    // to the per-effect path (which can't resolve the slot filters), and the card
    // is uncastable in the real UI. Deep-copy each spec (incl. its optional
    // target_filter) for per-instance isolation.
    target_slots: Array.isArray(tpl.target_slots)
      ? tpl.target_slots.map(s => ({...s, target_filter: s.target_filter ? {...s.target_filter} : undefined}))
      : undefined,
    // Legendary uniqueness enforced at cast time only (no SBA); the Legendary
    // supertype tag derives from this boolean via typesOf.
    legendary: !!tpl.legendary,
    // Deep-copy mutable fields for per-instance isolation (costReduction,
    // Severity, etc.). Mana production lives on the tap-ability (abilities),
    // which is deep-copied below — `mana` is just the primary-color label.
    cost: tpl.cost ? {...tpl.cost} : undefined,
    mana: tpl.mana, color: tpl.color,
    keywords: (tpl.keywords || []).slice(),
    power: tpl.power, toughness: tpl.toughness,
    effects: copyCardEffects(tpl.effects),
    abilities: tpl.abilities ? tpl.abilities.map(ab => ({
      ...ab,
      cost: ab.cost ? {...ab.cost} : undefined,
      effects: (ab.effects || []).map(e => ({...e})),
    })) : undefined,
    static_buffs: tpl.static_buffs ? tpl.static_buffs.map(b => ({
      ...b,
      filter: b.filter ? {...b.filter} : undefined,
      keywords: b.keywords ? b.keywords.slice() : undefined,
    })) : undefined,
    tapped: false, sick: false, damage: 0,
    tempPower: 0, tempTou: 0,    // EOT — cleared at end of turn
    permPower: 0, permTou: 0,    // counters — reset on leave-play (death/bounce/exile)
    dealtDeathtouch: false,
    // Last-writer-wins approximation of "killer". Cleared by resetInPlayState
    // when a card returns fresh. Credits killer for G[killer].claimedKeywords.
    killedBy: null,
    cantAttack: false, cantBlock: false,
    // Source-iid sets — clearRestrictionsFromSource walks these on leave-play.
    cantAttackBy: new Set(),
    cantBlockBy: new Set(),
    damagedBySources: new Set(),
    grantedBy: new Map(),         // kw → Set of source iids
    eotGrants: [],                // cleared in EOT cleanup
    typeGrants: [],               // add_type/set_types layer; {tags,op,source,eot}
    modifiers: [],
    stickers: (stickers || []).slice(),
    // Rolls parallel occurrences of 'empower'/'subtype' stickers. Rolled at
    // sticker-apply time so the choice is fixed for the run. Saved/loaded.
    empowerRolls: (empowerRolls || []).slice(),
    subtypeRolls: (subtypeRolls || []).slice(),
    innate: false,
    triggers: (tpl.triggers || []).map(t => ({
      ...t,
      effects: (t.effects || []).map(e => ({...e})),
    })),
    // Stapled metadata for empower-target enumeration, sticker eligibility, etc.
    stapledFrom: tpl.stapledFrom,
  };
  // Order: stickers → permaBuffs → bonusTrigger. (§3.8: the Balancer overrides
  // channel is gone — symmetricize/embargo/bleach now flow through stickers.)
  applyStickersToCard(card);
  // permaBuffs: slot-persistent buffs from permanent_eot creatures (Elystra).
  // Shared with resetInPlayState (bounce/flicker recast).
  if (permaBuffs) applyPermaBuffsToCard(card, permaBuffs);
  // bonusTrigger: slot-persistent trigger from boons (Watcher's Gift). Stored
  // as data so it survives save/load; condId form is required (not closure).
  if (bonusTrigger && typeof bonusTrigger === 'object') {
    if (!Array.isArray(card.triggers)) card.triggers = [];
    card.triggers.push({
      ...bonusTrigger,
      effects: (bonusTrigger.effects || []).map(e => ({...e})),
    });
  }
  // Regenerate text from effects/triggers/abilities (post-empower mutation).
  // custom_text:true cards keep hand-authored text (Endomorph, Codex, Elystra, Steal).
  card.text = describeCardText(card);
  return card;
}

// Mint a token from TOKENS. isToken:true (vanish on leave-play), slotIdx:null,
// no stickers/modifiers. Otherwise behaves like a creature (targeted, takes
// damage, fires triggers).
function makeToken(tokenTplId, controller) {
  const tpl = TOKENS[tokenTplId];
  if (!tpl) throw new Error('Unknown token: ' + tokenTplId);
  const card = {
    iid: nextIid++,
    tplId: tokenTplId,
    isToken: true,
    owner: controller,
    slotIdx: null,
    name: tpl.name, art: tpl.art, text: tpl.text,
    types: Array.isArray(tpl.types) ? tpl.types.slice() : [],
    cost: undefined,
    mana: undefined, color: tpl.color,
    keywords: (tpl.keywords || []).slice(),
    power: tpl.power, toughness: tpl.toughness,
    effects: undefined,
    abilities: undefined,
    static_buffs: undefined,
    tapped: false, sick: true, damage: 0,    // ETB sick; haste overrides
    tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0,
    dealtDeathtouch: false,
    killedBy: null,
    cantAttack: false, cantBlock: false,
    cantAttackBy: new Set(),
    cantBlockBy: new Set(),
    damagedBySources: new Set(),
    grantedBy: new Map(),
    eotGrants: [],
    modifiers: [],
    stickers: [],
    innate: false,
    triggers: undefined,
  };
  return card;
}

// Intrinsic = template + stickers (NOT runtime grants). Used by
// clearRestrictionsFromSource. Stapled-aware so Knight+Spirit retains both halves' keywords.
function intrinsicKeywords(card) {
  if (card.isToken) {
    const tpl = TOKENS[card.tplId];
    return (tpl && tpl.keywords) ? tpl.keywords.slice() : [];
  }
  const tpl = card.stapledFrom
    ? synthesizeStapledTemplate(card.stapledFrom.baseTplId,
                                 card.stapledFrom.stapledTpls)
    : CARDS[card.tplId];
  const kw = (tpl && tpl.keywords) ? tpl.keywords.slice() : [];
  for (const sId of (card.stickers || [])) {
    const s = STICKERS[sId];
    if (s && s.kind === 'keyword' && !kw.includes(s.keyword)) kw.push(s.keyword);
  }
  return kw;
}


// Single source of truth for attack eligibility — shared by engine, UI, AI.
function canCreatureAttack(card) {
  if (!card || !hasType(card, 'Creature')) return false;
  if (card.tapped) return false;
  if (card.cantAttack) return false;
  if ((card.keywords || []).includes('defender')) return false;
  if (card.sick && !(card.keywords || []).includes('haste')) return false;
  return true;
}
// Block eligibility. `attacker` optional — when given, also checks flying/reach etc.
function canCreatureBlock(card, attacker) {
  if (!card || !hasType(card, 'Creature')) return false;
  if (card.tapped) return false;
  if (card.cantBlock) return false;
  if ((card.keywords || []).includes('no_block')) return false;  // hidden kw (restrict→grant_keyword)
  if (!attacker) return true;
  if ((attacker.keywords || []).includes('unblockable')) return false;
  if ((attacker.keywords || []).includes('flying')
      && !(card.keywords || []).includes('flying')
      && !(card.keywords || []).includes('reach')) return false;
  return true;
}
function makePlayer(name, deck, ownerSide) {
  // ownerSide stamped as card.owner so zone-routing returns cards to owner,
  // not controller — matters for steal effects. slotIdx threads deck index;
  // for player → runState.slots[i] for sticker persistence, for opp → transient.
  const cards = deck.map((entry, i) => {
    if (typeof entry === 'string') return makeCard(entry, undefined, i, undefined, undefined);
    // Bonus trigger: fixed bonusTrigger (locked at run-start) OR triggerPool
    // (rolled fresh per game). Fixed wins. Slot-level pool overrides template seed.
    let bonus = entry.bonusTrigger;
    let pool = Array.isArray(entry.triggerPool) ? entry.triggerPool : null;
    if (!pool && !bonus) {
      const tpl = CARDS[entry.tplId];
      if (tpl && tpl.trigger_pool_seed === 'mercurial') {
        pool = MERCURIAL_TRIGGER_POOL;
      }
    }
    if (!bonus && pool && pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      bonus = {
        ...pick,
        effects: (pick.effects || []).map(e => ({...e})),
      };
    }
    return makeCard(entry.tplId, entry.stickers, i, entry.empowerRolls, entry.permaBuffs, bonus, entry.stapledTpls, entry.subtypeRolls);
  });
  for (const c of cards) c.owner = ownerSide;
  // Stamp live charges and rewrite "N charges" text from slot data (Stapler etc.).
  for (let i = 0; i < deck.length; i++) {
    const entry = deck[i];
    const tplId = (typeof entry === 'string') ? entry : entry.tplId;
    const tpl = CARDS[tplId];
    if (!tpl || typeof tpl.charges_at_run_start !== 'number') continue;
    const slotCharges = (typeof entry === 'object' && typeof entry.charges === 'number')
      ? entry.charges
      : tpl.charges_at_run_start;
    const card = cards[i];
    card.chargesLeft = slotCharges;
    if (typeof card.text === 'string' && /^\d+ charges\b/.test(card.text)) {
      card.text = card.text.replace(/^\d+ charges[^.]*\./,
        slotCharges + ' charge' + (slotCharges === 1 ? '' : 's') + ' left.');
    }
  }
  // Opening hand: pull all innate cards first, then draw to 7 from the rest.
  const innate = [];
  const rest = [];
  for (const c of cards) (c.innate ? innate : rest).push(c);
  shuffle(rest);
  const drawNeeded = Math.max(0, 7 - innate.length);
  let hand = innate.concat(rest.splice(0, drawNeeded));
  // Forced single mulligan if opening hand has 0/1/6/7 lands (screwed/flooded).
  // Innates stay in hand; only the drawn portion reshuffles.
  const isLand = c => {
    const tpl = CARDS[c.tplId];
    return tpl && hasType(tpl, 'Land');
  };
  const landCount = h => h.filter(isLand).length;
  const lc = landCount(hand);
  let mulliganed = false;
  if (lc <= 1 || lc >= 6) {
    const drawnPortion = hand.filter(c => !c.innate);
    rest.push(...drawnPortion);
    shuffle(rest);
    hand = innate.concat(rest.splice(0, drawNeeded));
    mulliganed = true;
  }
  return { name, life: 20, mana:{W:0,U:0,B:0,R:0,G:0,C:0},
           library: rest, hand, battlefield: [], graveyard: [], exile: [],
           landPlayedThisTurn: false,
           mulliganed, // logged once by init(), then ignored
           // Slot indexes played this game → runState.lastPlayedSlotIdxs.
           // Sticker rewards target only cards actually played (fallback: all).
           playedSlotIdxs: new Set(),
           // Keywords claimed by killing opp's creatures → restricts keyword
           // sticker rewards. Thematic: "you claim the wings of what you killed."
           claimedKeywords: new Set(),
           // Total life lost this turn (UNTAP-reset). Used by bloodlust triggers.
           // Counts decreases only — Phylactery-absorbed damage doesn't count.
           lifeLostThisTurn: 0 };
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function makeState(playerDeck, oppDeck) {
  // Hard fail (no default-deck fallback) so missed-arg regressions are loud.
  if (!playerDeck) throw new Error('makeState: playerDeck is required (no default fallback)');
  if (!oppDeck)    throw new Error('makeState: oppDeck is required (no default fallback)');
  return {
    you: makePlayer('You', playerDeck, 'you'),
    opp: makePlayer('Opponent', oppDeck, 'opp'),
    activePlayer: 'you',
    // Who went first this game. Set by ENGINE.init's coin flip. The first
    // player skips their first draw step (standard Magic "play/draw" rule)
    // and the turn counter increments only when active player cycles back
    // to firstPlayer (so the player who went second doesn't appear to be
    // a turn ahead in the log).
    firstPlayer: 'you',
    phase: 'UNTAP',
    turn: 1,
    stack: [],
    log: [],
    winner: null,
    gameOver: false,
    // Unified priority model — replaces reactionMode / dmgState.
    // priority is null when no round is open; an object {passes: Set} when open.
    // priorityHolder is whoever currently has priority within the round.
    priority: null,
    priorityHolder: null,
    // Combat sub-state. Declared flags track whether the turn-based action
    // (declare attackers / declare blockers) has happened in the current
    // combat phase yet — priority opens after the declaration.
    attackers: [],
    blockers: new Map(),
    attackersDeclared: false,
    blockersDeclared: false,
    // Cleanup discard window.
    cleanupDiscarding: false,
    // Modal-prompt slots. Each gets PENDING_DECISIONS entry above; engine pauses while non-null.
    pendingNumberChoice: null,        // {who, source, min, max, sourceIid, callback?} — Bargain
    pendingSymmetricizeChoice: null,  // {who, source, targetIid, ..., values:{power,toughness,cost}}
    pendingEdictChoice: null,         // {who, source, sourceIid, controller, filter, pool, trailingEffects} — human forced-sacrifice (edict) prompt (GAP 2)
    pendingOptionalCost: null,        // {who, cost, source, sourceIid, item} — "you may pay {cost}" trigger (Land+Spell staple ETB)
    forcedDiscard: null,              // {who, remaining}
    pendingSearch: null,              // {who, filter, source} — tutors
    pendingTriggerBuild: null,        // {who, cardIid, options, allowKeep} — Codex etc.
    pendingTriggerTarget: null,       // {controller, sourceIid, sourceName, trig, valid}
    // Trigger queue/budget. Drained at priority-round open. Depth cap kills loops.
    pendingTriggers: [],
    triggerChainDepth: 0,
    // Delayed triggers fire at scheduled events (endStep). Otherworldly Journey etc.
    delayedTriggers: [],
    endTurnPending: false,
  };
}

// ----- Helpers -----
function log(msg, cls='') { G.log.unshift({msg, cls}); if (G.log.length > 100) G.log.pop(); }
function pname(who) { return G[who].name; }

function findCard(iid) {
  for (const who of ['you','opp']) {
    const c = G[who].battlefield.find(x => x.iid === iid);
    if (c) return { card: c, controller: who };
  }
  return null;
}

// Standard fizzle-on-missing-target preamble for EFFECTS handlers.
//   const f = resolveTarget(ctx, target);
//   if (!f) return;
function resolveTarget(ctx, target) {
  const f = findCard(target.iid);
  if (f) return f;
  log(`${ctx.sourceName} fizzles — target gone.`, 'sp');
  return null;
}

// permanent_or_spell target → {kind:'perm'|'spell', card, controller, [stackItem]} or null.
// Used by Stapler's apply_in_game_splice and Steal. Spell path verifies stack item still present.
function resolveStackOrPermanent(target) {
  if (!target) return null;
  if (target.kind === 'permanent' || target.kind === 'creature') {
    const f = findCard(target.iid);
    if (!f) return null;
    return { kind: 'perm', card: f.card, controller: f.controller };
  }
  if (target.kind === 'stack') {
    const item = target.stackItem;
    if (!item || !item.card || item.kind === 'trigger') return null;
    if (G.stack.indexOf(item) < 0) return null;
    return { kind: 'spell', card: item.card, controller: item.controller, stackItem: item };
  }
  return null;
}

// Pluck a card off its controller's battlefield. Returns null if gone.
//   const card = pluckFromBattlefield(f);
//   if (!card) return;
function pluckFromBattlefield(f) {
  const bf = G[f.controller].battlefield;
  const idx = bf.findIndex(c => c.iid === f.card.iid);
  if (idx < 0) return null;
  return bf.splice(idx, 1)[0];
}

function getStats(card) {
  // Works on real instances AND synthetic template+stickers shapes (reward UI).
  let p = (card.power || 0) + (card.tempPower || 0) + (card.permPower || 0);
  let t = (card.toughness || 0) + (card.tempTou || 0) + (card.permTou || 0);
  if (Array.isArray(card.modifiers)) {
    for (const m of card.modifiers) { p += (m.power||0); t += (m.toughness||0); }
  } else if (Array.isArray(card.stickers)) {
    for (const sId of card.stickers) {
      const s = STICKERS[sId];
      if (s && s.kind === 'stat_boost') {
        p += (s.power || 0); t += (s.toughness || 0);
      }
    }
  }

  // Static lord buffs. Lords (creatures with static_buffs) buff OTHER creatures
  // matching filter while on battlefield. Synthetic shapes (no iid) skip this.
  if (card.iid != null && typeof G !== 'undefined' && G && G.you && G.you.battlefield) {
    const owner = findCard(card.iid);
    if (owner) {
      const allCreatures = [
        ...G.you.battlefield.map(c => ({ card: c, controller: 'you' })),
        ...G.opp.battlefield.map(c => ({ card: c, controller: 'opp' })),
      ];
      for (const { card: lord, controller: lordCtrl } of allCreatures) {
        if (!lord.static_buffs || lord.iid === card.iid) continue;
        for (const buff of lord.static_buffs) {
          // filter.controller:'self' = "creatures you control" (shares lord controller).
          if (!matchFilter(card, buff.filter, owner.controller, lordCtrl)) continue;
          if (buff.subtype && !hasType(card, buff.subtype)) continue;
          p += (buff.power || 0);
          t += (buff.toughness || 0);
        }
      }
    }
  }

  return [p, t];
}
function costTotalCard(card) {
  if (!card.cost) return 0;
  let n = card.cost.C || 0;
  for (const k of ['W','U','B','R','G']) n += card.cost[k] || 0;
  return n;
}

function getCardValue(card, purpose, ctx) {
  if (!card) return 0;
  if (hasType(card, 'Sorcery')) return spellValue(card);
  if (!hasType(card, 'Creature')) return 0;

  // Auto-derive ctx for in-game instances so static-buff scoring sees real tribe counts.
  if (!ctx && card.iid != null && card.controller && typeof G !== 'undefined' && G[card.controller]) {
    ctx = { friendlyBattlefield: G[card.controller].battlefield };
  }

  const cost = costTotalCard(card);
  // Baseline: pow+tou should beat 2*cost. getStats counts permanent buffs.
  const [pow, tou] = getStats(card);
  let v = pow + tou - cost * 2;

  // Body-scaled keyword values (flat bonuses misvalue both 1/1 unblockables and 5/5 vanillas).
  const kw = card.keywords || [];
  if (kw.includes('flying'))         v += 1 + pow * 0.5;
  if (kw.includes('unblockable'))    v += 1.5 + pow * 0.75;
  if (kw.includes('reach'))          v += 1;
  if (kw.includes('menace'))         v += 1 + pow * 0.3;
  if (kw.includes('trample'))        v += pow * 0.5;
  if (kw.includes('lifelink'))       v += pow * 0.6;
  if (kw.includes('vigilance'))      v += tou * 0.4;
  if (kw.includes('haste'))          v += pow * 0.5;
  if (kw.includes('first_strike'))    v += 2 + Math.max(0, (pow - tou) * 0.5);
  if (kw.includes('deathtouch'))     v += 1 + Math.max(0, 4 - pow);   // inverse-power
  if (kw.includes('indestructible')) v += 1 + Math.max(0, 5 - tou);   // inverse-toughness
  if (kw.includes('hexproof'))       v += 3;

  // defender + cantAttack collapse (avoid double-penalty); cantBlock is lighter.
  const cantAtk = kw.includes('defender') || !!card.cantAttack;
  const cantBlk = !!card.cantBlock;
  if (cantAtk && cantBlk) v -= 5;
  else if (cantAtk) v -= 3;
  else if (cantBlk) v -= 1;

  // Trigger frequency multipliers by (condId, purpose).
  //   draft:  ETB×1, dies×1, multi×2
  //   kill:   ETB×0 (already fired), dies×1, multi×2 (denial)
  //   bounce: ETB×-1 (recast refires!), dies×0, multi×1
  function triggerFreq(arch, purpose) {
    const isOnce = arch === 'thisEnters' || arch === 'thisDies';
    if (purpose === 'kill') {
      if (arch === 'thisEnters') return 0;
      if (arch === 'thisDies')   return 1;
      return 2;
    }
    if (purpose === 'bounce') {
      if (arch === 'thisEnters') return -1;
      if (arch === 'thisDies')   return 0;
      return 1;
    }
    return isOnce ? 1 : 2;
  }
  for (const trig of (card.triggers || [])) {
    const effs = trig.effects || [];
    if (!effs.length) continue;
    const perFiring = abilityValue({ effects: effs });
    v += perFiring * triggerFreq(triggerArchetype(trig), purpose);
  }

  // Activated abilities — recurring threats while alive.
  for (const ab of (card.abilities || [])) {
    v += abilityValue(ab);
  }

  // Lord buffs = per-recipient-value × estimated-recipient-count.
  // Recipient body uses TYPICAL_RECIPIENT_POW/TOU (mid-curve estimate).
  // Count: draft=0.5×tribe + 0.1×remaining; in-game=actual on battlefield+1; else 2.
  const TYPICAL_RECIPIENT_POW = 2;
  const TYPICAL_RECIPIENT_TOU = 2;
  function keywordValueAtTypical(kwName) {
    const p = TYPICAL_RECIPIENT_POW, t = TYPICAL_RECIPIENT_TOU;
    switch (kwName) {
      case 'flying':         return 1 + p * 0.5;
      case 'unblockable':    return 1.5 + p * 0.75;
      case 'reach':          return 1;
      case 'menace':         return 1 + p * 0.3;
      case 'trample':        return p * 0.5;
      case 'lifelink':       return p * 0.6;
      case 'vigilance':      return t * 0.4;
      case 'haste':          return p * 0.5;
      case 'first_strike':    return 2;
      case 'deathtouch':     return 1 + Math.max(0, 4 - p);
      case 'indestructible': return 1 + Math.max(0, 5 - t);
      case 'hexproof':       return 3;
      default:               return 0;
    }
  }
  for (const buff of (card.static_buffs || [])) {
    let perRecipient = (buff.power || 0) + (buff.toughness || 0);
    for (const gKw of (buff.keywords || [])) {
      perRecipient += keywordValueAtTypical(gKw);
    }
    let estCount = 2.0;
    if (ctx && Array.isArray(ctx.picksSoFar)) {
      const totalPicks = ctx.totalPicks || 23;
      const remaining = Math.max(0, totalPicks - ctx.picksSoFar.length);
      let tribeSoFar = 0;
      for (const pid of ctx.picksSoFar) {
        const pc = CARDS[pid];
        if (!pc || !hasType(pc, 'Creature')) continue;
        if (buff.subtype && !hasType(pc, buff.subtype)) continue;
        tribeSoFar++;
      }
      estCount = 0.5 * tribeSoFar + 0.1 * remaining;
    } else if (ctx && Array.isArray(ctx.friendlyBattlefield)) {
      // +1.0 forward-look proxy so empty-tribe lords aren't undervalued.
      let count = 0;
      for (const bc of ctx.friendlyBattlefield) {
        if (bc.iid === card.iid) continue;
        if (!hasType(bc, 'Creature')) continue;
        if (buff.subtype && !hasType(bc, buff.subtype)) continue;
        count++;
      }
      estCount = count + 1.0;
    }
    v += perRecipient * estCount;
  }

  return v;
}

// The set of permanents a `chooses()` step (edict) may select from `who`'s
// battlefield. `filter`: 'creature' (edict) or 'permanent' (rip-edict —
// creatures/lands/artifacts). Single source of truth for the auto-pick (AI),
// the human-prompt setup, and the prompt's legal-action enumeration.
function choosesEligiblePool(who, filter) {
  return G[who].battlefield.filter(c =>
    filter === 'permanent'
      ? isPermanent(c)
      : hasType(c, 'Creature'));
}

// The ctx.chosen-shaped descriptor for a picked permanent. Snapshots
// slotIdx+controller so a trailing `rip` can strip the run-deck slot even
// after an intervening `annihilate` removed the card from the battlefield.
function choosesDescriptor(c, who) {
  return {
    kind: hasType(c, 'Creature') ? 'creature' : 'permanent',
    iid: c.iid, label: c.name,
    slotIdx: (typeof c.slotIdx === 'number') ? c.slotIdx : null,
    controller: who,
  };
}

// Sac/edict scoring — measures board-presence threat (cost sunk).
// ~75% of getCardValue coefficients.
function sacValueOnBoard(card) {
  if (!card) return 0;
  const [pow, tou] = getStats(card);
  let v = pow + tou;
  const kw = card.keywords || [];
  if (kw.includes('flying'))         v += 1 + pow * 0.4;
  if (kw.includes('unblockable'))    v += 1 + pow * 0.6;
  if (kw.includes('reach'))          v += 1;
  if (kw.includes('menace'))         v += 1 + pow * 0.2;
  if (kw.includes('trample'))        v += pow * 0.4;
  if (kw.includes('lifelink'))       v += pow * 0.5;
  if (kw.includes('vigilance'))      v += tou * 0.3;
  if (kw.includes('haste'))          v += pow * 0.4;
  if (kw.includes('first_strike'))    v += 1 + Math.max(0, (pow - tou) * 0.4);
  if (kw.includes('deathtouch'))     v += 1 + Math.max(0, 3 - pow);
  if (kw.includes('indestructible')) v += 1 + Math.max(0, 4 - tou);
  if (kw.includes('hexproof'))       v += 2;
  if (kw.includes('defender')) v -= 1;
  for (const ab of (card.abilities || [])) v += abilityValue(ab);
  // thisEnters already fired → 0.3× (residual for flicker plays).
  const FREQ_ONCE = new Set(['thisEnters', 'thisDies']);
  for (const trig of (card.triggers || [])) {
    if (!trig.effects || !trig.effects.length) continue;
    const perFiring = abilityValue({ effects: trig.effects });
    let freq;
    const arch = triggerArchetype(trig);
    if (arch === 'thisEnters') freq = 0.3;
    else if (arch === 'thisDies') freq = 1;
    else freq = 2;
    v += perFiring * freq;
  }
  return v;
}

// Score one activated ability.
function abilityValue(ab) {
  if (!ab || !ab.effects || !ab.effects.length) return 0;
  const eff = ab.effects[0];
  switch (eff.kind) {
    case 'damage':         return 6 + (eff.amount || 0);
    case 'affect_creature': {
      const sev = sevToNum(eff.severity);
      return sev === 1 ? 4 : sev === 2 ? 5 : sev === 3 ? 8 : 9;
    }
    case 'pump':           return (eff.duration === 'permanent' ? 3 : 2) + (eff.power || 0) + (eff.toughness || 0);
    case 'add_counter':     return 3 + (eff.power || 0) + (eff.toughness || 0);
    case 'add_mana':        return 3;
    case 'move_card':      // collapsed draw (library→hand); other moves parity-default
      return (eff.from_zone === 'library' && eff.to_zone === 'hand') ? 4 + (eff.amount || 1) - 1 : 2;
    case 'draw':           return 4 + (eff.amount || 1) - 1;
    case 'discard':        return 3 + (eff.amount || 1) - 1;
    case 'gain_life':       return (eff.amount || 0) < 0
                                    ? 3 + Math.abs(eff.amount) * 2   // drain (life loss) — like damage
                                    : 1 + (eff.amount || 0);          // life gain
    case 'create_tokens':   return 3 + (eff.count || 1) * 2;
    default:               return 2;
  }
}

// AI spell valuation (`spellValue` / `spellValueForEffects`) and its effect-kind
// classification (`VALUED_EFFECT_KINDS` / `UNVALUED_EFFECT_KINDS`) RELOCATED to
// ai.js (review #6 — engine/AI layering). They read no engine internals beyond
// the shared helpers (`sevToNum`, `TOKENS`, `ENGINE.getModes`) and are consumed
// only by the AI. The engine-consumed creature-body heuristics (`getCardValue`,
// `sacValueOnBoard`, `abilityValue`) stay above: `dealCombatDamage`'s blocker
// damage-assignment order and the edict `chooses()` auto-pick genuinely depend
// on them, so relocating those would force a combat-behavior change. The §7b
// coverage assertion (effectCoverageReport, below) reads the relocated sets
// lazily, the same way it reads ai.js's cast-scoring sets.

// Card-text + valuation coverage over the dispatch table. Returns lists of
// problems ({} of empty arrays = clean). `describeEffect`/`TEXT_IDIOM_ONLY`
// live in card-text.js (loaded after this module); referenced lazily so the
// late binding resolves at call time, not module-load.
function effectCoverageReport() {
  const kinds = Object.keys(EFFECTS);
  // Valuation classification lives in ai.js (relocated, review #6 — loaded after
  // this module). Read lazily, like the cast-scoring sets below; if absent
  // (engine-only test boot), skip the valuation-coverage check.
  let unclassifiedValuation = [], staleValuation = [];
  if (typeof VALUED_EFFECT_KINDS !== 'undefined' && typeof UNVALUED_EFFECT_KINDS !== 'undefined') {
    const classified = new Set([...VALUED_EFFECT_KINDS, ...UNVALUED_EFFECT_KINDS]);
    unclassifiedValuation = kinds.filter(k => !classified.has(k));
    staleValuation = [...classified].filter(k => !EFFECTS[k]);
  }
  // Card-text: probe each kind; the describeEffect default returns a "[kind]"
  // debug sentinel. A sentinel hit means no describe case — unless the kind is
  // only ever rendered inside a multi-effect idiom (TEXT_IDIOM_ONLY).
  const idiomOnly = (typeof TEXT_IDIOM_ONLY !== 'undefined') ? TEXT_IDIOM_ONLY : new Set();
  const probe = { amount: 1, power: 1, toughness: 1, count: 1, severity: 1,
    token_id: 'soldier_w_1_1', keyword: 'flying', from_zone: 'library', to_zone: 'hand' };
  const missingText = kinds.filter(k => {
    if (idiomOnly.has(k)) return false;
    let txt;
    try { txt = (describeEffect({ ...probe, kind: k }) || []).map(s => s.text).join(''); }
    catch (e) { return true; }  // a throw is also a coverage failure
    return txt === '[' + k + ']';
  });
  // AI cast-path scorer (ai.js scoreSpellTargetForMode): every kind must be
  // classified as target-scored or consciously not. This catches the silent
  // class where a targeted effect kind scores 0 and the AI never casts it
  // (the bosses' removal + mind control). Sets live in ai.js (loaded after this
  // module) — read lazily; if absent (engine-only test boot), skip the check.
  let unclassifiedCastScoring = [], staleCastScoring = [];
  if (typeof TARGET_SCORED_KINDS !== 'undefined' && typeof NOT_TARGET_SCORED_KINDS !== 'undefined') {
    const classifiedCast = new Set([...TARGET_SCORED_KINDS, ...NOT_TARGET_SCORED_KINDS]);
    unclassifiedCastScoring = kinds.filter(k => !classifiedCast.has(k));
    staleCastScoring = [...classifiedCast].filter(k => !EFFECTS[k]);
  }
  return { unclassifiedValuation, staleValuation, missingText,
           unclassifiedCastScoring, staleCastScoring };
}

// ----- Mana -----
function canPayFromPool(pool, cost) {
  if (!cost) return true;
  const m = {...pool};
  for (const c of COLORS) if ((cost[c]||0) > (m[c]||0)) return false;
  for (const c of COLORS) m[c] -= (cost[c]||0);
  return ((m.W||0)+(m.U||0)+(m.B||0)+(m.R||0)+(m.G||0)+(m.C||0)) >= (cost.C||0);
}
// Total static_cost_bump from all battlefield permanents (City Guardian etc.).
// Global/symmetric. Returns int to add to cost.C.
function totalStaticCostBump() {
  let bump = 0;
  for (const side of ['you', 'opp']) {
    for (const c of G[side].battlefield) {
      const tpl = CARDS[c.tplId];
      if (tpl && typeof tpl.static_cost_bump === 'number') {
        bump += tpl.static_cost_bump;
      }
    }
  }
  return bump;
}

// Effective cast cost = base + totalStaticCostBump. Returns a copy.
function effectiveCastCost(card) {
  if (!card.cost) return card.cost;
  const bump = totalStaticCostBump();
  if (bump === 0) return card.cost;
  const cost = {...card.cost};
  cost.C = (cost.C || 0) + bump;
  return cost;
}

// Can `who` pay `cost` from pool + untapped sources? Backtracks over dual-land choices.
function canPayPotential(who, cost) {
  if (!cost) return true;
  const pool = {...G[who].mana};
  // §3.9: lands and creature dorks are one pool of tap-for-mana abilities.
  // Single-color sources fold into the pool; multi-color (choose) sources
  // become choice points. Fixed multi-mana abilities add all their mana.
  const choices = [];
  for (const c of G[who].battlefield) {
    if (c.tapped) continue;
    if (hasType(c, 'Creature') && c.sick) continue;  // sick dork can't tap
    const ab = manaAbilityOf(c);
    if (!ab) continue;
    const eff0 = ab.effects[0];
    if (eff0.choose) {
      choices.push(manaEffectColors(eff0));
      continue;
    }
    const am = eff0.amounts;
    const ks = Object.keys(am);
    if (ks.length === 1 && am[ks[0]] === 1) {
      pool[ks[0]] = (pool[ks[0]] || 0) + 1;
    } else {
      for (const k of ks) pool[k] = (pool[k] || 0) + am[k];
    }
  }
  function tryAssign(idx, p) {
    if (idx === choices.length) return canPayFromPool(p, cost);
    for (const color of choices[idx]) {
      const next = {...p};
      next[color] = (next[color] || 0) + 1;
      if (tryAssign(idx + 1, next)) return true;
    }
    return false;
  }
  return tryAssign(0, pool);
}
// Pay from pool first; if short, auto-tap sources. Color costs first, then generic.
function payMana(who, cost) {
  if (!cost) return;
  const p = G[who];
  if (canPayFromPool(p.mana, cost)) { deductFromPool(p.mana, cost); return; }
  const need = {...cost};
  for (const c of COLORS) {
    while ((need[c]||0) > 0) {
      if ((p.mana[c]||0) > 0) { p.mana[c]--; need[c]--; continue; }
      if (!tapSourceProducing(who, c)) {
        throw new Error('Mana payment failed (color): ' + c);
      }
      p.mana[c]--; need[c]--;
    }
  }
  let generic = need.C || 0;
  while (generic > 0) {
    let used = false;
    for (const c of [...COLORS, 'C']) {
      if ((p.mana[c]||0) > 0) { p.mana[c]--; generic--; used = true; break; }
    }
    if (used) continue;
    if (!tapSourceProducing(who, null)) throw new Error('Mana payment failed (generic)');
  }
}
function deductFromPool(pool, cost) {
  for (const c of COLORS) pool[c] -= (cost[c]||0);
  let generic = cost.C || 0;
  for (const c of ['C', ...COLORS]) {
    if (!generic) break;
    const used = Math.min(generic, pool[c]||0);
    pool[c] -= used;
    generic -= used;
  }
}
// Tap an untapped source producing `color` (or any if null). §3.9: lands and
// creature dorks are one pool of mana abilities. Preference: FIXED-color sources
// before CHOOSE (flexible) ones, so a basic land is spent before City of Brass.
// Creatures gate on summoning sickness; lands don't.
function tapSourceProducing(who, color) {
  const usable = G[who].battlefield.filter(c =>
    !c.tapped && (!hasType(c, 'Creature') || !c.sick) && manaAbilityOf(c));
  const tap = (c, requested) => {
    const eff = manaAbilityOf(c).effects[0];
    c.tapped = true;
    if (eff.choose) {
      const opts = eff.choose === 'any' ? COLORS : eff.choose;
      G[who].mana[requested && opts.includes(requested) ? requested : opts[0]]++;
    } else {
      for (const k of Object.keys(eff.amounts)) G[who].mana[k] += eff.amounts[k];
    }
    return true;
  };
  const isFixed = (c) => !manaAbilityOf(c).effects[0].choose;
  const makes = (c) => manaEffectColors(manaAbilityOf(c).effects[0]);
  if (color !== null) {
    for (const c of usable) if (isFixed(c) && makes(c).includes(color)) return tap(c, color);
    for (const c of usable) if (!isFixed(c) && makes(c).includes(color)) return tap(c, color);
    return false;
  }
  for (const c of usable) if (isFixed(c)) return tap(c, null);
  for (const c of usable) return tap(c, null);
  return false;
}

// ----- Effects -----

// Damage with deathtouch/lifelink/trample. Source: ctx.sourceCard or findCard(ctx.sourceIid).
function applyDamageFrom(ctx, target, amt) {
  if (amt <= 0) return;
  let sourceCard = ctx.sourceCard || null;
  if (!sourceCard && ctx.sourceIid != null) {
    const sf = findCard(ctx.sourceIid);
    sourceCard = sf ? sf.card : null;
  }
  const hasDeathtouch = sourceCard && sourceCard.keywords && sourceCard.keywords.includes('deathtouch');
  const hasLifelink  = sourceCard && sourceCard.keywords && sourceCard.keywords.includes('lifelink');
  const hasTrample   = sourceCard && sourceCard.keywords && sourceCard.keywords.includes('trample');

  if (target.kind === 'player') {
    damagePlayer(target.who, amt, ctx.sourceName);
  } else {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    // Non-combat trample: spills (amt - lethal-needed) to controller.
    let toCreature = amt;
    let spill = 0;
    if (hasTrample) {
      const [, tou] = getStats(f.card);
      const lethalNeeded = Math.max(0, tou - f.card.damage);
      if (amt > lethalNeeded) {
        toCreature = lethalNeeded;
        spill = amt - lethalNeeded;
      }
    }
    f.card.damage += toCreature;
    if (hasDeathtouch) f.card.dealtDeathtouch = true;
    f.card.killedBy = ctx.controller;
    // damagedBySources powers Sengir-style "dealt-damage-this-turn dies" triggers.
    if (sourceCard && hasType(sourceCard, 'Creature')) {
      if (!(f.card.damagedBySources instanceof Set)) f.card.damagedBySources = new Set();
      f.card.damagedBySources.add(sourceCard.iid);
    }
    log(`${ctx.sourceName} deals ${toCreature} to ${f.card.name}.`, 'dmg');
    if (spill > 0) {
      damagePlayer(f.controller, spill, `${ctx.sourceName} (trample)`);
    }
  }
  if (hasLifelink) {
    G[ctx.controller].life += amt;
    log(`${ctx.sourceName} (lifelink) — ${pname(ctx.controller)} gains ${amt} life.`, 'sp');
    emit({type: 'life_changed', who: ctx.controller, delta: amt, source_iid: ctx.sourceIid});
  }
}

// EFFECTS TABLE — dispatch from {kind: 'foo', ...} to handler.

// Creatures matching a mass `scope` (Slice 3 step 1 / decision 2), as a
// pre-iteration snapshot of {kind, iid, controller}. all_creatures = both
// sides; all_yours = controller's; all_opps = opponent's. Groundwork for the
// single/mass unification: damage/pump/affect_creature gain a `scope` path
// alongside the legacy damageAll/pumpAllYours/removeAll handlers.
function creaturesInScope(ctx, scope) {
  let sides;
  if (scope === 'all_creatures') sides = ['you', 'opp'];
  else if (scope === 'all_yours') sides = [ctx.controller];
  else if (scope === 'all_opps') sides = [opp(ctx.controller)];
  else return [];
  const out = [];
  for (const who of sides) {
    for (const c of G[who].battlefield) {
      if (hasType(c, 'Creature')) out.push({ kind: 'creature', iid: c.iid, controller: who });
    }
  }
  return out;
}

// Apply a removal severity (1=tap, 2=bounce, 3=destroy, 4=exile) to one
// creature f={card, controller}. Single-target and mass-scope paths share this
// one severity ladder.
// Removal severity ladder. Card data carries the string names; the engine maps
// to the numeric ladder internally. Empower promotes a severity UP the ladder.
const SEVERITY_LADDER = ['tap', 'bounce', 'destroy', 'exile'];
function sevToNum(sev) {
  if (typeof sev === 'number') return Math.max(1, Math.min(4, sev));
  const i = SEVERITY_LADDER.indexOf(sev);
  return i >= 0 ? i + 1 : 3;  // default destroy
}
function numToSev(n) { return SEVERITY_LADDER[Math.max(1, Math.min(4, n)) - 1]; }
function affectOneCreature(ctx, f, sevArg) {
  if (!f || !f.card) return;
  const sev = sevToNum(sevArg);
  if (sev === 1) {
    f.card.tapped = true;
    log(`${ctx.sourceName} taps ${f.card.name}.`, 'sp');
    return;
  }
  if (sev === 2) {
    const card = pluckFromBattlefield(f);
    if (!card) return;
    // permanent_eot creatures (Elystra) keep their EOT buffs through bounce.
    leavesPlayPreservingBuffs(card);
    if (!card.isToken) {
      G[card.owner || f.controller].hand.push(card);
      log(`${ctx.sourceName} returns ${card.name} to hand.`, 'sp');
    } else {
      log(`${ctx.sourceName} returns ${card.name} — token ceases to exist.`, 'sp');
    }
    emitLeavesBattlefield(card, f.controller, 'hand');
    return;
  }
  if (sev === 3) {
    if (f.card.keywords.includes('indestructible')) {
      log(`${f.card.name} is indestructible — ${ctx.sourceName} fizzles.`, 'sp');
      return;
    }
    f.card.killedBy = ctx.controller;
    moveToGraveyard(f.card, f.controller);
    log(`${ctx.sourceName} destroys ${f.card.name}.`, 'sp');
    return;
  }
  // sev 4 exile: bypasses indestructible. Routes to exile zone.
  const card = pluckFromBattlefield(f);
  if (!card) return;
  if (hasType(card, 'Creature') && f.controller !== ctx.controller) {
    claimKeywordsFromKill(card, ctx.controller);
  }
  leavesPlayPreservingBuffs(card);
  if (!card.isToken) {
    G[card.owner || f.controller].exile.push(card);
    log(`${ctx.sourceName} exiles ${card.name}.`, 'sp');
  } else {
    log(`${ctx.sourceName} exiles ${card.name} — token ceases to exist.`, 'sp');
  }
  emitLeavesBattlefield(card, f.controller, 'exile');
}

// Place a card ARRIVING on the battlefield (move_card to_zone=battlefield).
// Mints a fresh iid (§3.7 iid-mint-on-arrival: a spell targeting the card's
// old iid now fizzles — "flicker beats removal" for free), sets summoning
// sickness unless hasted, applies post-actions, and emits the unified ETB
// zone-change. The card must already be removed from its source zone.
function placeCardOnBattlefield(ctx, card, fromZone, post) {
  post = post || {};
  card.iid = nextIid++;
  const hasHaste = card.keywords.includes('haste') || !!post.grant_haste;
  card.sick = !hasHaste;
  if (post.grant_haste && !card.keywords.includes('haste')) applyGrant(card, 'haste', ctx.sourceIid, true);
  // Arrivals return under their OWNER's control (exile-until-eot / flicker of a
  // stolen creature). owner == controller for the common cases (reanimate own
  // graveyard, fetch own library, flicker own creature).
  const ctrl = card.owner || ctx.controller;
  G[ctrl].battlefield.push(card);
  if (post.tap) card.tapped = true;
  if (post.untap_on_arrive) card.tapped = false;
  if (post.enter_via_etb !== false) {
    // No extraSources: the card is already pushed onto the battlefield above, so
    // emit()'s battlefield walk catches its own ETB. Passing it as an extraSource
    // too would double-fire the trigger (extraSources is for cards that have
    // LEFT a zone — dies/leave — not arrivals).
    emitZoneChange(card, ctrl, fromZone, 'battlefield', undefined, ctx.sourceIid);
  }
}

// Library-search filter match. Filter shape mirrors pendingSearch.filter
// ({type, sub}); empty filter matches anything.
function matchesSearchFilter(card, filter) {
  if (!filter) return true;
  if (filter.type && !hasType(card, filter.type)) return false;
  if (filter.sub && !hasType(card, filter.sub)) return false;
  return true;
}
// Search library → hand (prompt-driven, filtered): the searchCreature idiom.
// Human → pendingSearch prompt (resolved later by doSearchPick → hand); AI
// auto-picks the highest-cost match. Shared by the move_card library_search
// selector. (Was EFFECTS.searchCreature pre-collapse.)
function searchLibraryToHand(ctx, filter) {
  const lib = G[ctx.controller].library;
  const matches = lib.filter(c => matchesSearchFilter(c, filter));
  if (matches.length === 0) { log('No matching card in library.', 'sp'); shuffle(lib); return; }
  if (ctx.controller === 'you') {
    G.pendingSearch = { who: 'you', filter, source: ctx.sourceName };
    log(`${ctx.sourceName} — choose a card from your library.`, 'sp');
    return;
  }
  const card = matches.slice().sort((a, b) => costTotalCard(b) - costTotalCard(a))[0];
  const idx = lib.findIndex(c => c.iid === card.iid);
  lib.splice(idx, 1);
  G[ctx.controller].hand.push(card);
  shuffle(lib);
  log(`${pname(ctx.controller)} searches for ${card.name}.`, 'sp');
  tryBuildOnDraw(card, ctx.controller);
}
// Discard from a player's hand. Human → forcedDiscard prompt (resolved later by
// doDiscard via the discard action). AI → picks cheapest (the discarder
// optimizes for self, per MTG). Shared by the legacy `discard` kind (the
// Mercurial generator still emits it) and the move_card(hand→graveyard) collapse.
function discardFromHand(ctx, who, amount) {
  const tp = G[who];
  const n = Math.min(amount, tp.hand.length);
  if (n === 0) { log(`${pname(who)} has no cards to discard.`, 'sp'); return; }
  if (who === 'you') {
    G.forcedDiscard = { who: 'you', remaining: n, source: ctx.sourceName };
    log(`${ctx.sourceName} — choose ${n} card(s) to discard.`, 'sp');
    return;
  }
  const sorted = tp.hand.slice().sort((a, b) => costTotalCard(a) - costTotalCard(b));
  for (let i = 0; i < n; i++) {
    const idx = tp.hand.findIndex(c => c.iid === sorted[i].iid);
    if (idx >= 0) tp.graveyard.push(tp.hand.splice(idx, 1)[0]);
  }
  log(`${pname(who)} discards ${n}.`, 'sp');
}
// Resolve the discarding player for a hand→graveyard move / discard effect: an
// explicit player target (edict-style targeted discard) else the controller.
function discardWho(ctx, target) {
  return (target && target.kind === 'player' && target.who) ? target.who : ctx.controller;
}
// Fetch library → battlefield (auto, filtered): the searchLandTapped idiom.
// No human choice (any basic land is equivalent); first match, applies post
// (tap), shuffles. (Was EFFECTS.searchLandTapped pre-collapse.)
function fetchLibraryToBattlefield(ctx, filter, post) {
  const lib = G[ctx.controller].library;
  const idx = lib.findIndex(c => matchesSearchFilter(c, filter));
  if (idx < 0) { log('No matching card in library.', 'sp'); return; }
  const card = lib.splice(idx, 1)[0];
  if (post && post.tap) card.tapped = true;
  G[ctx.controller].battlefield.push(card);
  shuffle(lib);
  log(`${pname(ctx.controller)} fetches ${card.name}${post && post.tap ? ' (tapped)' : ''}.`, 'sp');
  emitZoneChange(card, ctx.controller, 'library', 'battlefield');
}

const EFFECTS = {
  damage(ctx, params, target) {
    if (params.scope) {
      const amt = params.amount || 0;
      if (amt <= 0) return;
      log(`${ctx.sourceName} deals ${amt} to each creature.`, 'sp');
      for (const st of creaturesInScope(ctx, params.scope)) {
        applyDamageFrom(ctx, { kind: 'creature', iid: st.iid }, amt);
      }
      return;
    }
    applyDamageFrom(ctx, target, params.amount);
  },
  pump(ctx, params, target) {
    // duration:'permanent' → +1/+1 counters (permPower/permTou); default EOT
    // temp (tempPower/tempTou). Lets pump absorb add_counter (decision 4).
    const perm = params.duration === 'permanent';
    const applyTo = (card, p, t) => {
      if (perm) { card.permPower += p; card.permTou += t; }
      else { card.tempPower += p; card.tempTou += t; }
    };
    if (params.scope) {
      const p = params.power || 0, t = params.toughness || 0;
      for (const st of creaturesInScope(ctx, params.scope)) {
        const f = findCard(st.iid);
        if (!f) continue;
        applyTo(f.card, p, t);
      }
      log(`${ctx.sourceName} gives +${p}/+${t}${perm ? '' : ' EOT'} to each creature in scope.`, 'sp');
      return;
    }
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const p = params.power || 0, t = params.toughness || 0;
    applyTo(f.card, p, t);
    if (perm) log(`Put +${p}/+${t} on ${f.card.name}.`, 'sp');
    else log(`${f.card.name} gets +${p}/+${t} EOT.`, 'sp');
  },
  // +1/+1 counter (permPower/permTou stat sum; resets on leave-play).
  add_counter(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const p = params.power || 0;
    const t = params.toughness || 0;
    f.card.permPower += p;
    f.card.permTou += t;
    if (p === t) {
      log(`Put a +${p}/+${t} counter on ${f.card.name}.`, 'sp');
    } else {
      log(`Put +${p}/+${t} counters on ${f.card.name}.`, 'sp');
    }
  },
  // Type-change (§5): add_type unions tag(s) onto the target's effective type
  // set; set_types replaces it. Both read live through typesOf, so the target
  // immediately is/stops-being a creature/artifact/land for every rule. See
  // applyTypeChange for duration + animate-stats handling.
  add_type(ctx, params, target) { applyTypeChange(ctx, params, target, 'add'); },
  set_types(ctx, params, target) { applyTypeChange(ctx, params, target, 'set'); },
  // Absorb a novel keyword from victim, else grow +1/+1. Persists via slot sticker.
  // Auto-picks highest-priority keyword; defender excluded (downside).
  endomorph_absorb(ctx, params, target) {
    const KEYWORD_PRIORITY = {
      flying: 4, indestructible: 4,
      lifelink: 3, deathtouch: 3, hexproof: 3, trample: 3,
      haste: 2, vigilance: 2, first_strike: 2, flash: 2,
      reach: 1, menace: 1,
    };
    const f = findCard(target.iid);
    // Endomorph may be dead this step — mutate the graveyard corpse so reward is visible.
    const sourceCard = f ? f.card : null;
    const victim = ctx.event && ctx.event.card ? ctx.event.card : null;
    if (!victim) {
      log(`${ctx.sourceName} absorb fizzles — no victim recorded.`, 'sp');
      return;
    }
    // Determine novel keywords. The victim's keyword set at death time is
    // its current `keywords` array (native + stickered + any in-game grants
    // that survived the death move). We filter out 'defender' and any
    // keywords the source already has.
    const sourceKeywords = sourceCard ? new Set(sourceCard.keywords || []) : new Set();
    // Source slot lookup. If Endomorph is alive, just read sourceCard.slotIdx.
    // If Endomorph died in the same combat-damage step, sourceCard is null —
    // BUT the dead card object still exists in a graveyard (resetInPlayState
    // doesn't touch slotIdx), so we can find it by target.iid. This is the
    // correct way to handle multi-Endomorph cases (cloned Endomorphs); a
    // tplId-based scan would always pick the same slot regardless of which
    // Endomorph actually killed the victim.
    let slotIdx = sourceCard ? sourceCard.slotIdx : null;
    let deadCard = null;
    if (slotIdx == null && sourceCard == null) {
      for (const who of ['you', 'opp']) {
        const found = G[who].graveyard.find(c => c.iid === target.iid);
        if (found) { deadCard = found; break; }
      }
      if (deadCard) {
        slotIdx = deadCard.slotIdx;
        // The dead card still has its keyword list intact (death preserves
        // .keywords). Use it to compute the source's keyword set.
        for (const kw of (deadCard.keywords || [])) sourceKeywords.add(kw);
      }
    }
    const inGameTarget = sourceCard || deadCard;   // graveyard corpse still mutable
    const novel = (victim.keywords || [])
      .filter(kw => kw !== 'defender' && !sourceKeywords.has(kw));
    let absorbed = null;
    if (novel.length > 0) {
      novel.sort((a, b) => (KEYWORD_PRIORITY[b] || 0) - (KEYWORD_PRIORITY[a] || 0));
      absorbed = novel[0];
    }
    // Persistence only when controller is player-side with a runState slot.
    const canPersist = (ctx.controller === 'you')
      && (slotIdx != null)
      && (typeof RUN !== 'undefined' && RUN.applyStickerToSlot);
    if (absorbed) {
      const sticker_id = 'kw_' + absorbed;
      if (canPersist) RUN.applyStickerToSlot(slotIdx, sticker_id);
      // Mirror onto in-game instance so the keyword is active AND the sticker badge shows now.
      if (inGameTarget) {
        if (!inGameTarget.keywords.includes(absorbed)) inGameTarget.keywords.push(absorbed);
        if (!inGameTarget.stickers.includes(sticker_id)) inGameTarget.stickers.push(sticker_id);
      }
      log(`${ctx.sourceName} absorbs ${absorbed} from ${victim.name}.`, 'sp');
    } else {
      // Fallback +1/+1 via slot sticker (persists across games, unlike counter).
      const sticker_id = 'plus1_plus1';
      if (canPersist) RUN.applyStickerToSlot(slotIdx, sticker_id);
      if (inGameTarget) {
        inGameTarget.modifiers.push({ power: 1, toughness: 1 });
        inGameTarget.stickers.push(sticker_id);
      }
      log(`${ctx.sourceName} eats ${victim.name} and grows +1/+1.`, 'sp');
    }
  },
  // Unified removal. severity: 1=tap, 2=bounce, 3=destroy (indestructible blocks), 4=exile.
  // Severity sticker escalates one tier per stack.
  affect_creature(ctx, params, target) {
    const sev = params.severity;
    if (params.scope) {
      for (const st of creaturesInScope(ctx, params.scope)) {
        affectOneCreature(ctx, findCard(st.iid), sev);
      }
      return;
    }
    const f = resolveTarget(ctx, target);
    if (!f) return;
    affectOneCreature(ctx, f, sev);
  },
  // ─── Balancer boss effects ─────────────────────────────────────────
  // Target's controller picks one of {power, toughness, cost-total}; all three
  // become that value. §3.8: the choice resolves (doSymmetricizeChoice) into an
  // additive stat_boost + cost_mod snapshot through the sticker pipeline.
  symmetricize(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (!hasType(f.card, 'Creature')) {
      log(`${ctx.sourceName} fizzles — target must be a creature.`, 'sp');
      return;
    }
    const [curPow, curTou] = getStats(f.card);
    let curCost = 0;
    if (f.card.cost) {
      curCost = f.card.cost.C || 0;
      for (const k of ['W','U','B','R','G']) curCost += f.card.cost[k] || 0;
    }
    G.pendingSymmetricizeChoice = {
      who: f.controller,
      source: ctx.sourceName,
      targetIid: f.card.iid,
      targetName: f.card.name,
      targetSlotIdx: (typeof f.card.slotIdx === 'number') ? f.card.slotIdx : null,
      targetIsYours: f.controller === 'you',
      values: { power: curPow, toughness: curTou, cost: curCost },
    };
    log(`${ctx.sourceName}: ${pname(f.controller)} must pick power, toughness, or mana cost for ${f.card.name}.`, 'sp');
  },
  // §3.8: generic persistent-modification primitive — applies an inline sticker
  // descriptor {kind,...params} to the target's owning slot (persisted via the
  // sticker pipeline) AND the runtime card (so a same-game recast reflects it).
  // Replaces the embargo (cost_mod +1) / bleach (set_color 'C') bespoke
  // applyBalancerOverrides channel — those cards now decompose to
  // [apply_sticker, move_card]. Tokens have no slot → runtime-only (then vanish).
  apply_sticker(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    // Two shapes: an inline descriptor (`sticker:{kind,...}` — embargo/bleach) or
    // a registry id (`sticker_id` — complex registered stickers like `scarified`).
    // For the registry case we persist by id so RUN.applyStickerToSlot uses the
    // STICKERS lookup + id-based dedup/storage, exactly as the old monolith did.
    const desc = params.sticker || (params.sticker_id ? STICKERS[params.sticker_id] : null);
    if (!desc || !desc.kind) return;
    const slotKey = params.sticker ? { ...desc } : params.sticker_id;
    applyOneStickerToRuntimeCard(f.card, { ...desc });
    const owner = f.card.owner || f.controller;
    const slotIdx = (typeof f.card.slotIdx === 'number') ? f.card.slotIdx : null;
    if (owner === 'you' && slotIdx != null && typeof RUN !== 'undefined' && RUN.applyStickerToSlot) {
      RUN.applyStickerToSlot(slotIdx, slotKey);
    }
    log(`${ctx.sourceName} applies a lasting change to ${f.card.name}.`, 'sp');
  },
  // Archdemon Bargains ETB. You make a bargain WITH the demon: its OPPONENT
  // (the non-controller) chooses 1-5 — that many stickers go on the demon's
  // controller now, and the chooser collects that many when they kill it (the
  // dies trigger pays opp(controller), via the stashed bargainsNum). So the
  // chooser is opp(controller): boss controls it → the human picks; the player
  // controls it (drafted/stolen) → the AI picks. (Was who:'you' — correct only
  // for the common boss-controlled case, wrong when the player controls it.)
  bargain_sticker_self(ctx, params) {
    const sourceCard = findCard(ctx.sourceIid);
    if (!sourceCard) return;
    const chooser = opp(sourceCard.controller);
    G.pendingNumberChoice = {
      who: chooser,
      source: ctx.sourceName,
      sourceIid: ctx.sourceIid,
      min: 1,
      max: 5,
      onChoose: 'bargainEtb',
    };
    log(`${ctx.sourceName} — ${pname(chooser)} chooses a number from 1 to 5.`, 'sp');
  },
  // Phase 2 (dies). The bargain pays out the SAME number chosen at ETB — read
  // bargainsNum back off the demon. Zone-change events carry the dying card as
  // `subject_card` (NOT `card`), and ctx.sourceCard (findCard scans the
  // graveyard, where the demon now sits; bargainsNum survives resetInPlayState)
  // is the fallback. The old `ctx.event.card` was always undefined, so N
  // silently defaulted to 1 — decoupling the payout from the bargain.
  bargain_sticker_other(ctx) {
    const dyingCard = (ctx.event && ctx.event.subject_card) || ctx.sourceCard;
    const n = (dyingCard && dyingCard.bargainsNum) || 1;
    const recipient = opp(ctx.controller);
    log(`${ctx.sourceName} — applying ${n} sticker(s) to ${pname(recipient)}'s permanents.`, 'sp');
    applyRandomStickersToSide(G, recipient, n, ctx.sourceName, log);
  },
  // Counter a stack spell OR take a battlefield permanent — adds slot to runState forever.
  // Spell path: removes from stack (no effects fire); spell ceases (not graveyard).
  // Slot identity preserved (tplId + stickers + rolls + permaBuffs + bonusTrigger + stapledTpls + charges).
  steal(ctx, params, target) {
    const r = resolveStackOrPermanent(target);
    if (!r) {
      log(`${ctx.sourceName} fizzles — target gone.`, 'sp');
      return;
    }
    const stolenTplId = r.card.tplId;
    const stolenCardName = r.card.name;
    const fromStack = r.kind === 'spell';
    // Prefer runState slot for player-side perms (captures mid-game absorbs etc.).
    let stolenSlot = null;
    if (r.kind === 'perm' && r.controller === 'you'
        && typeof r.card.slotIdx === 'number'
        && typeof RUN !== 'undefined' && RUN.getSlots) {
      const slots = RUN.getSlots();
      stolenSlot = slots && slots[r.card.slotIdx] ? slots[r.card.slotIdx] : null;
    }
    // ─── Remove the source ─────────────────────────────────────────────
    // Permanent: pluck from battlefield, clear restrictions sourced from it,
    // emit cardLeavesBattlefield (so leaves-play triggers fire — e.g.
    // Archdemon of Bargains' death-payout).
    // Spell: remove from G.stack, don't route to graveyard — Steal consumes
    // it. Spell effects do NOT fire (this is counterspell semantics).
    if (r.kind === 'perm') {
      pluckFromBattlefield({ card: r.card, controller: r.controller });
      clearRestrictionsFromSource(r.card.iid);
      // Steal = control change; the card stays a permanent (re-created on the
      // thief's battlefield below). Mirrors the legacy cardLeavesBattlefield
      // emission here — to_zone stays 'battlefield'.
      emitLeavesBattlefield(r.card, r.controller, 'battlefield');
    } else {
      const stIdx = G.stack.indexOf(r.stackItem);
      if (stIdx >= 0) G.stack.splice(stIdx, 1);
    }
    // ─── Build sticker list and metadata to carry into the new slot ─────
    // Player-side slot present: copy stickers + all parallel rolls + perma-
    // buffs + bonusTrigger + stapledTpls + charges. Otherwise: just the
    // stickers cached on the runtime card (typically empty for stack spells,
    // but copy what's there in case opp's deck was sticker-scaled).
    let stickers, meta;
    if (stolenSlot) {
      stickers = (stolenSlot.stickers || []).slice();
      meta = {
        empowerRolls: stolenSlot.empowerRolls,
        subtypeRolls: stolenSlot.subtypeRolls,
        permaBuffs:   stolenSlot.permaBuffs,
        bonusTrigger: stolenSlot.bonusTrigger,
        stapledTpls:  stolenSlot.stapledTpls,
        charges:      stolenSlot.charges,
      };
    } else {
      stickers = (r.card.stickers || []).slice();
      // No run slot (opponent's permanent / a stack spell), but the runtime card
      // still carries its merged identity in stapledFrom — without copying it, a
      // stolen STAPLED creature would be rebuilt from its bare base tplId and the
      // staple half (extra body / ETB spell) would be silently lost. Pull the
      // stapledTpls (and the parallel rolls cached on the instance) so the thief
      // gets the whole stapled card.
      const stapledTpls = (r.card.stapledFrom && Array.isArray(r.card.stapledFrom.stapledTpls))
        ? r.card.stapledFrom.stapledTpls.slice() : undefined;
      meta = (stapledTpls || r.card.empowerRolls || r.card.subtypeRolls)
        ? { stapledTpls, empowerRolls: r.card.empowerRolls, subtypeRolls: r.card.subtypeRolls }
        : undefined;
    }
    // ─── Append the new slot and shuffle a fresh instance into library ──
    const newSlotIdx = (typeof RUN !== 'undefined' && RUN.appendSlot)
      ? RUN.appendSlot(stolenTplId, stickers, meta)
      : null;
    // Fresh runtime card — template stats + sticker effects re-applied, no
    // residue from the original instance (counters, grants, damage, combat).
    const fresh = makeCard(stolenTplId, stickers, newSlotIdx,
      meta && meta.empowerRolls, meta && meta.permaBuffs, meta && meta.bonusTrigger,
      meta && meta.stapledTpls, meta && meta.subtypeRolls);
    fresh.owner = ctx.controller;
    G[ctx.controller].library.push(fresh);
    shuffle(G[ctx.controller].library);
    const verb = fromStack ? 'counters and shuffles' : 'shuffles';
    log(`${ctx.sourceName} ${verb} ${stolenCardName} into ${pname(ctx.controller)}'s library — yours forever.`, 'sp');
  },
  counter(ctx, params, target) {
    const idx = G.stack.indexOf(target.stackItem);
    if (idx < 0) { log(`Target spell no longer on stack.`); return; }
    if (G.stack[idx].kind === 'trigger') {
      log(`${ctx.sourceName} can't counter that.`, 'sp'); return;
    }
    const removed = G.stack.splice(idx, 1)[0];
    G[removed.controller].graveyard.push(removed.card);
    log(`${ctx.sourceName} counters ${removed.card.name}!`, 'sp');
  },
  add_mana(ctx, params) {
    // Color-choice form (§3.9): {choose:'any'} or {choose:['W','U']} adds one
    // mana of a chosen color. params.color is the resolved pick (UI/AI); else
    // default to the first option.
    if (params.choose) {
      const opts = params.choose === 'any' ? COLORS : params.choose;
      const c = (params.color && opts.includes(params.color)) ? params.color : opts[0];
      G[ctx.controller].mana[c]++;
      log(`${pname(ctx.controller)} adds {${c}}.`, 'sp');
      return;
    }
    for (const c of Object.keys(params.amounts)) G[ctx.controller].mana[c] += params.amounts[c];
    const txt = Object.entries(params.amounts).map(([c,n]) => `{${c}}`.repeat(n)).join('');
    log(`${pname(ctx.controller)} adds ${txt}.`, 'sp');
  },
  // Unified signed life-delta (DIVERGENCE D4). amount > 0 gains life and fires a
  // life_changed(delta>0) → is_life_gain; amount < 0 loses life, tracks
  // lifeLostThisTurn, and fires life_changed(delta<0) → is_life_loss; 0 = no-op.
  // Card-text renders the sign ("gain N" / "lose N"). Lifelink unchanged (fires
  // on damage, not here).
  gain_life(ctx, params, target) {
    // Priority: params.who (resolved) > target.who (player target) > ctx.controller.
    const who = params.who
      || (target && target.kind === 'player' ? target.who : null)
      || ctx.controller;
    const amount = params.amount;
    if (!amount) return;
    G[who].life += amount;
    if (amount > 0) {
      log(`${pname(who)} gains ${amount} life.`, 'sp');
    } else {
      G[who].lifeLostThisTurn = (G[who].lifeLostThisTurn || 0) + (-amount);
      log(`${pname(who)} loses ${-amount} life.`, 'sp');
    }
    emit({type: 'life_changed', who, delta: amount, source_iid: ctx.sourceIid});
  },
  draw(ctx, params) {
    for (let i=0;i<params.amount;i++) drawCard(ctx.controller);
    log(`${pname(ctx.controller)} draws ${params.amount}.`, 'sp');
  },
  // Unified card-movement primitive (effects-refactor §4.2 / decision 10).
  // move_card(from_zone, to_zone, selector, amount, post?). Supports: draw
  // (library→hand, controller_top), mill (library→graveyard), bounce/shuffle/
  // exile (battlefield→…), graveyard/exile→hand/library/battlefield (return/
  // reanimate/flicker), library search→hand (library_search, prompt-driven) and
  // library fetch→battlefield (auto land-fetch). Still deferred: the
  // target_player selector (a targeted player draws/discards).
  move_card(ctx, params, target) {
    const from = params.from_zone, to = params.to_zone;
    const sel = params.selector || 'controller_top';
    const amount = params.amount != null ? params.amount : 1;
    const post = params.post || {};
    // Library search → hand (filtered, prompt-driven): collapsed searchCreature.
    if (from === 'library' && to === 'hand' && sel === 'library_search') {
      searchLibraryToHand(ctx, params.filter || {});
      return;
    }
    // Library fetch → battlefield (filtered, auto): collapsed searchLandTapped.
    if (from === 'library' && to === 'battlefield') {
      fetchLibraryToBattlefield(ctx, params.filter || {}, post);
      return;
    }
    // Hand → graveyard: collapsed discard (controller or a targeted player).
    if (from === 'hand' && to === 'graveyard') {
      discardFromHand(ctx, discardWho(ctx, target), amount);
      return;
    }
    for (let n = 0; n < amount; n++) {
      // Draw: delegate to drawCard so deck-out / Phylactery semantics hold.
      if (from === 'library' && to === 'hand' && sel === 'controller_top') {
        drawCard(ctx.controller);
        continue;
      }
      // Mill: top of controller's library → graveyard.
      if (from === 'library' && to === 'graveyard' && sel === 'controller_top') {
        const lib = G[ctx.controller].library;
        if (!lib.length) break;
        G[ctx.controller].graveyard.push(lib.shift());
        continue;
      }
      const t = (sel === 'target') ? (target || ctx.chosen)
              : (sel === 'self') ? { kind: 'creature', iid: ctx.sourceIid }
              : null;
      if (!t) { console.warn('move_card: unsupported selector', sel, from, '->', to); break; }

      if (from === 'battlefield') {
        const f = findCard(t.iid);
        if (!f) break;
        const card = pluckFromBattlefield(f);
        if (!card) break;
        if (post.keep_buffs) leavesPlayPreservingBuffs(card);
        else { clearRestrictionsFromSource(card.iid); resetInPlayState(card); }
        const dest = card.owner || f.controller;
        if (!card.isToken) {
          if (to === 'hand') G[dest].hand.push(card);
          else if (to === 'library') { G[dest].library.push(card); if (post.shuffle) shuffle(G[dest].library); }
          else if (to === 'exile') G[dest].exile.push(card);
          else if (to === 'graveyard') G[dest].graveyard.push(card);
          else console.warn('move_card: unsupported battlefield dest', to);
        }
        emitLeavesBattlefield(card, f.controller, to);
        continue;
      }
      if (from === 'graveyard' || from === 'exile') {
        // Search the controller's zone first, then the opponent's — an
        // exile-until-eot return retrieves an opp-owned card from the opp's
        // exile (the card was routed to its owner's zone on the way out).
        let zone = G[ctx.controller][from];
        let idx = zone.findIndex(c => c.iid === t.iid);
        if (idx < 0) {
          zone = G[opp(ctx.controller)][from];
          idx = zone.findIndex(c => c.iid === t.iid);
        }
        if (idx < 0) break;
        const [card] = zone.splice(idx, 1);
        card.tapped = false; card.sick = false; card.damage = 0;
        card.tempPower = 0; card.tempTou = 0;
        if (card.damagedBySources instanceof Set) card.damagedBySources.clear();
        card.dealtDeathtouch = false;
        const dest = card.owner || ctx.controller;
        if (to === 'hand') G[dest].hand.push(card);
        else if (to === 'library') { G[dest].library.push(card); if (post.shuffle) shuffle(G[dest].library); }
        else if (to === 'battlefield') placeCardOnBattlefield(ctx, card, from, post);  // reanimate / exile-return
        else { console.warn('move_card: unsupported', from, 'dest', to); break; }
        continue;
      }
      console.warn('move_card: unsupported from_zone', from);
      break;
    }
  },
  // Legacy discard kind — still emitted by the Mercurial trigger generator
  // (discardOpp). Card data uses move_card(hand→graveyard) post-collapse.
  discard(ctx, params, target) {
    discardFromHand(ctx, discardWho(ctx, target), params.amount);
  },
  // Grant keyword. Axes: target (single), scope:'all_yours'|'all_creatures' (mass), duration:'eot'|'permanent'.
  // Permanent → grantedBy (revoked on leave-play); EOT → eotGrants (revoked at end-turn).
  // Additive: a creature can have a kw from both systems at once.
  grant_keyword(ctx, params, target) {
    const kw = params.keyword;
    if (!kw) return;
    const eot = params.duration === 'eot';
    if (params.scope) {
      const recipients = creaturesInScope(ctx, params.scope)
        .map(st => findCard(st.iid)).filter(f => f && f.card);
      if (recipients.length === 0) {
        log(`${ctx.sourceName} fizzles — no creatures.`, 'sp');
        return;
      }
      const display = (typeof KEYWORD_DISPLAY !== 'undefined' && KEYWORD_DISPLAY[kw]) || kw;
      const dur = eot ? ' until end of turn' : '';
      log(`${ctx.sourceName} — ${recipients.length} creature${recipients.length === 1 ? '' : 's'} gain${recipients.length === 1 ? 's' : ''} ${display}${dur}.`, 'sp');
      for (const f of recipients) {
        applyGrant(f.card, kw, ctx.sourceIid, eot);
      }
      return;
    }
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const alreadyHad = f.card.keywords.includes(kw);
    applyGrant(f.card, kw, ctx.sourceIid, eot);
    const display = (typeof KEYWORD_DISPLAY !== 'undefined' && KEYWORD_DISPLAY[kw]) || kw;
    if (alreadyHad && !eot) {
      log(`${ctx.sourceName} targets ${f.card.name} — already has ${display}.`, 'sp');
    } else {
      const dur = eot ? ' until end of turn' : '';
      log(`${ctx.sourceName} — ${f.card.name} gains ${display}${dur}.`, 'sp');
    }
  },
  // Mint tokens. Params: token_id (TOKENS key), count (default 1), controller ('self'|'opp').
  create_tokens(ctx, params) {
    let token_id = params.token_id;
    // Legacy save safety: older Codex outputs used bare-name ids ('goblin' etc.).
    const TOKEN_ALIAS = {
      goblin: 'goblin_r_1_1',
      soldier: 'soldier_w_1_1',
      spirit: 'spirit_w_1_1',
      bear: 'bear_g_2_2',
      saproling: 'saproling_g_1_1',
    };
    if (token_id && TOKEN_ALIAS[token_id]) token_id = TOKEN_ALIAS[token_id];
    if (!token_id || !TOKENS[token_id]) {
      log(`${ctx.sourceName} fizzles — unknown token ${token_id}.`, 'sp');
      return;
    }
    const count = params.count || 1;
    const owner = (params.controller === 'opp') ? opp(ctx.controller) : ctx.controller;
    const tpl = TOKENS[token_id];
    const made = [];
    for (let i = 0; i < count; i++) {
      const tok = makeToken(token_id, owner);
      G[owner].battlefield.push(tok);
      made.push(tok);
    }
    const plural = count === 1 ? '' : 's';
    log(`${ctx.sourceName} creates ${count} ${tpl.power}/${tpl.toughness} ${tpl.name} token${plural}.`, 'sp');
    // Per-token ETB. sourceIid lets self-cascade-guarded triggers skip own tokens.
    for (const tok of made) {
      emitZoneChange(tok, owner, 'none', 'battlefield', undefined, ctx.sourceIid);
    }
  },
  // Sacrifice as an effect (rare — usually sacs are costs). "Sacrifice a
  // creature" with scope:'self' resolves to the source itself; with no
  // target, the effect controller picks one of their own. v1: only scope:'self'
  // is wired (e.g., a creature with "When this attacks, sacrifice a creature
  // (this one) to deal 2 damage" — though we don't have such a card yet,
  // having the effect available makes that design space accessible).
  sacrifice(ctx, params, target) {
    // Falls back to ctx.chosen (the chooses() pick) for the edict chain.
    const t = target || ctx.chosen;
    if (!t) return;
    const f = findCard(t.iid);
    if (!f) return;
    sacrificeCard(f.card, f.controller);
  },
  // No-trigger removal verb (effects-refactor §4.2). The creature ceases to
  // exist: no graveyard, no death/leave triggers. Trailing step of rip-edict.
  // Falls back to ctx.chosen (the chooses() pick) when no explicit target.
  annihilate(ctx, params, target) {
    const t = target || ctx.chosen;
    if (!t) return;
    const f = findCard(t.iid);
    if (!f) return;
    annihilateCard(f.card, f.controller);
  },
  // Zone-agnostic run-layer slot strip (§13). Reads ctx.chosen (the chooses()
  // pick) — which snapshots slotIdx+controller at choose-time, so this still
  // works after a preceding `annihilate` removed the card from play — or an
  // explicit target. Player-side only: opp cards have no persistent run slot,
  // so the in-game removal (annihilate/sacrifice) is their whole effect.
  rip(ctx, params, target) {
    const t = target || ctx.chosen;
    if (!t) return;
    const slotIdx = (typeof t.slotIdx === 'number') ? t.slotIdx : null;
    if (t.controller === 'you' && slotIdx != null
        && typeof RUN !== 'undefined' && RUN.removeSlotByIdx) {
      RUN.removeSlotByIdx(slotIdx);
      log(`${t.label || 'A card'} is gone from your deck for the rest of the run.`, 'sp');
    }
  },
  // The targeted player selects one of their own creatures (§3.5). This is
  // NOT targeting — hexproof never applies. Reads the established player from
  // the preceding target(player) step (the `target` param or ctx.allTargets),
  // auto-picks the lowest sac-value creature (AI), and records ctx.chosen for
  // the following effect (sacrifice/annihilate). The human choose-your-creature
  // prompt is deferred (review GAP 2) — auto-pick covers AI players today.
  chooses(ctx, params, target) {
    const playerTgt = (target && target.kind === 'player')
      ? target
      : (ctx.allTargets || []).find(t => t && t.kind === 'player');
    const who = playerTgt ? playerTgt.who : opp(ctx.controller);
    // Honor the chooses() filter: 'creature' (edict) or 'permanent' (rip-edict —
    // creatures/lands/artifacts). Defaults to creature.
    const filter = params.filter || 'creature';
    const pool = choosesEligiblePool(who, filter);
    if (pool.length === 0) {
      const noun = filter === 'permanent' ? 'permanent' : 'creature';
      log(`${ctx.sourceName} — ${pname(who)} has no ${noun} to choose.`, 'sp');
      ctx.chosen = null;
      return;
    }
    const sorted = pool.slice().sort((a, b) => sacValueOnBoard(a) - sacValueOnBoard(b));
    const picked = sorted[0];
    ctx.chosen = choosesDescriptor(picked, who);
    log(`${pname(who)} chooses ${picked.name}.`, 'sp');
  },
  // Register a delayed trigger that applies `effects` at `when` ('end_step'),
  // operating on the same target the prior effect did (the §9.1/D9 delayed-effect
  // atom). exile_until_eot decomposes to move_card(bf→exile) + schedule_delayed
  // (move_card(exile→bf), end_step) — replacing the bespoke returnFromExile path.
  schedule_delayed(ctx, params, target) {
    if (!Array.isArray(G.delayedTriggers)) G.delayedTriggers = [];
    G.delayedTriggers.push({
      fireAt: params.when === 'end_step' ? 'endStep' : params.when,
      fireFor: 'either',
      effect: 'deferredEffects',
      effects: (params.effects || []).map(e => ({...e})),
      target: target || ctx.chosen || null,
      controller: ctx.controller,
      sourceName: ctx.sourceName,
      sourceIid: ctx.sourceIid,
    });
  },
  // Unified control-change primitive (effects-refactor §4.2 / decision 11):
  // replaces gainControl (both defs) + steal. transfer_ownership:true is the
  // steal variant (permanent run-slot transfer) — delegated to the proven
  // steal handler. Otherwise it's a control change (Mind Control / Threaten):
  // pluck from the current controller, push to the caster, with optional
  // untap_on_take / grant_haste / duration (eot). Accepts both the new
  // snake_case param names and the legacy ones during cutover. Additive —
  // gainControl/steal remain until card migration retires them.
  change_control(ctx, params, target) {
    if (params.transfer_ownership) { EFFECTS.steal(ctx, params, target); return; }
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const card = f.card, fromCtrl = f.controller, toCtrl = ctx.controller;
    if (fromCtrl === toCtrl) {
      log(`${ctx.sourceName} fizzles — ${card.name} is already under ${pname(toCtrl)}'s control.`, 'sp');
      return;
    }
    const fromBf = G[fromCtrl].battlefield;
    const idx = fromBf.findIndex(c => c.iid === card.iid);
    if (idx < 0) return;
    fromBf.splice(idx, 1);
    G[toCtrl].battlefield.push(card);
    if (params.untap_on_take || params.untap) card.tapped = false;
    if (params.grant_haste) applyGrant(card, 'haste', ctx.sourceIid, true);
    if (params.duration === 'eot') card.tempControlUntilEot = true;
    log(`${ctx.sourceName} — ${pname(toCtrl)} gains control of ${card.name}` +
        (params.duration === 'eot' ? ' until end of turn.' : '.'), 'sp');
  },
  // Fight: target opp creature; our biggest creature fights it (each deals damage = power).
  // Tap status doesn't matter (Beast's Fury post-combat).
  fight_target(ctx, params, target) {
    const ours = G[ctx.controller].battlefield
      .filter(c => hasType(c, 'Creature'));
    if (!ours.length) { log(`${ctx.sourceName} fizzles — no creature to fight.`, 'sp'); return; }
    ours.sort((a, b) => getStats(b)[0] - getStats(a)[0]);
    const ourCreature = ours[0];
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const them = f.card;
    const [ourPow] = getStats(ourCreature);
    const [theirPow] = getStats(them);
    log(`${ourCreature.name} (${ourPow}) fights ${them.name} (${theirPow}).`, 'cb');
    // Per-fighter ctx so deathtouch/lifelink apply on the fighter, not the spell.
    const ourCtx   = { controller: ctx.controller, sourceName: ourCreature.name, sourceIid: ourCreature.iid };
    const theirCtx = { controller: f.controller,   sourceName: them.name,        sourceIid: them.iid };
    applyDamageFrom(ourCtx,   {kind:'creature', iid: them.iid},        ourPow);
    applyDamageFrom(theirCtx, {kind:'creature', iid: ourCreature.iid}, theirPow);
  },
  untap(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    f.card.tapped = false;
    log(`${ctx.sourceName} untaps ${f.card.name}.`, 'sp');
  },

  // Stapler in-game splice. Merges target 1 onto target 0 using the reward-time
  // splice infra. Cross-owner: merged slot moves to caster's runState (removal/steal).
  // Targets validated: spliceable base/staple + isCompatibleStaplePair.
  apply_in_game_splice(ctx, params, target) {
    const all = ctx.allTargets;
    if (!Array.isArray(all) || all.length < 2) {
      log(`${ctx.sourceName} fizzles — needs two targets.`, 'sp');
      return;
    }
    const t0 = all[0], t1 = all[1];
    if (!t0 || !t1) { log(`${ctx.sourceName} fizzles — target missing.`, 'sp'); return; }
    const r0 = resolveStackOrPermanent(t0);
    const r1 = resolveStackOrPermanent(t1);
    if (!r0 || !r1) { log(`${ctx.sourceName} fizzles — target gone.`, 'sp'); return; }
    if (r0.card.iid === r1.card.iid) {
      log(`${ctx.sourceName} fizzles — can't staple a card to itself.`, 'sp'); return;
    }
    const [canonBaseTpl, canonStapleTpl, swapped] = canonicalSplicePair(
      r0.card.tplId, r1.card.tplId);
    const baseR = swapped ? r1 : r0;
    const stapleR = swapped ? r0 : r1;
    const baseCard = baseR.card;
    const stapleCard = stapleR.card;
    if (!isSpliceableBase(baseCard.tplId)) {
      log(`${ctx.sourceName} fizzles — ${baseCard.name} can't be a splice base.`, 'sp'); return;
    }
    // In-game staple chain lives at card.stapledFrom.stapledTpls (NOT card.stapledTpls,
    // which is slot-level). Reading the wrong field silently misses prior chains.
    const stapleStaples = (stapleCard.stapledFrom && Array.isArray(stapleCard.stapledFrom.stapledTpls))
      ? stapleCard.stapledFrom.stapledTpls
      : (Array.isArray(stapleCard.stapledTpls) ? stapleCard.stapledTpls : []);
    if (stapleStaples.length > 0) {
      log(`${ctx.sourceName} fizzles — ${stapleCard.name} is already stapled.`, 'sp'); return;
    }
    if (!isCompatibleStaplePair(baseCard.tplId, stapleCard.tplId)) {
      log(`${ctx.sourceName} fizzles — ${baseCard.name} and ${stapleCard.name} aren't compatible.`, 'sp'); return;
    }
    // Fire stack inputs' effects with their locked-in targets, then consume them
    // (no graveyard — Stapler absorbed them).
    const fireStackEffects = (r) => {
      if (r.kind !== 'spell') return;
      const item = r.stackItem;
      const spellCard = item.card;
      const spellCtx = { controller: item.controller, sourceName: spellCard.name, sourceIid: spellCard.iid, sourceCard: spellCard };
      const getTargetForSlot = makeSlotTargetGetter(Array.isArray(item.targets) ? item.targets : []);
      const activeEffects = effectsForMode(spellCard, item.modeIdx);
      for (const eff of activeEffects) {
        let tgt = null;
        let snap = null;
        if (eff.scope === 'self') {
          if (effectOperatesOnCreature(eff)) {
            tgt = {kind:'creature', iid: spellCard.iid, label: spellCard.name};
            snap = snapshotTarget(tgt);
          } else {
            tgt = {kind:'player', who: item.controller};
            snap = tgt;
          }
        } else if (effectNeedsTarget(eff)) {
          const slot = eff.target_slot || 0;
          const fetched = getTargetForSlot(slot);
          tgt = fetched.tgt;
          snap = fetched.snap;
        }
        applyEffect(spellCtx, eff, tgt, snap);
      }
      const stIdx = G.stack.indexOf(item);
      if (stIdx >= 0) G.stack.splice(stIdx, 1);
    };
    fireStackEffects(stapleR);
    if (baseR.kind === 'spell') fireStackEffects(baseR);
    // Prior in-game staple chain lives at card.stapledFrom.stapledTpls (NOT
    // card.stapledTpls, which is slot-level). Reading the wrong field silently
    // misses prior chains (same field-name trap as stapleStaples above).
    const priorStaples = (baseCard.stapledFrom && Array.isArray(baseCard.stapledFrom.stapledTpls))
      ? baseCard.stapledFrom.stapledTpls.slice()
      : (Array.isArray(baseCard.stapledTpls) ? baseCard.stapledTpls.slice() : []);
    // Merge slot data via the shared core — identical math to the reward-time
    // RUN.applySplice path (the in-game path layers the runtime-card rebuild,
    // slot mint, and combat-state transfer below on top of the same merge).
    const merged = mergeSpliceData(
      { tplId: baseCard.tplId, stickers: baseCard.stickers, empowerRolls: baseCard.empowerRolls,
        subtypeRolls: baseCard.subtypeRolls, permaBuffs: baseCard.permaBuffs,
        bonusTrigger: baseCard.bonusTrigger, priorStaples },
      { tplId: stapleCard.tplId, stickers: stapleCard.stickers, empowerRolls: stapleCard.empowerRolls,
        subtypeRolls: stapleCard.subtypeRolls, permaBuffs: stapleCard.permaBuffs,
        bonusTrigger: stapleCard.bonusTrigger });
    const newStapledTpls = merged.stapledTpls;
    const mergedStickers = merged.stickers;
    const mergedRolls = merged.empowerRolls;
    const mergedSubtypeRolls = merged.subtypeRolls;
    const mergedPermaBuffs = merged.permaBuffs;
    const mergedBonus = merged.bonusTrigger;
    // Ownership: caster owns the merge IFF they contributed an input. Pure
    // opp+opp splices are attrition only (no slot mint, stays on base's bf).
    const callerContributes = (baseCard.owner === ctx.controller) || (stapleCard.owner === ctx.controller);
    const resultOwner = callerContributes ? ctx.controller : baseCard.owner;
    const mintSlot = callerContributes;
    if (baseR.kind === 'perm') {
      if (stapleR.kind === 'perm') {
        const stapleBf = G[stapleR.controller].battlefield;
        const stapleIdx = stapleBf.findIndex(c => c.iid === stapleCard.iid);
        if (stapleIdx >= 0) stapleBf.splice(stapleIdx, 1);
        clearRestrictionsFromSource(stapleCard.iid);
      }
      if (stapleCard.owner === 'you' && typeof stapleCard.slotIdx === 'number'
          && typeof RUN !== 'undefined' && RUN.removeSlotByIdx) {
        const removedIdx = stapleCard.slotIdx;
        RUN.removeSlotByIdx(removedIdx);
        // CRITICAL: splice shifts higher indices down by 1 — fix cached slotIdx
        // pointers in every zone. Otherwise charge-accounting silently no-ops.
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile'];
        for (const zoneName of zones) {
          const zone = G.you[zoneName];
          if (!zone) continue;
          for (const c of zone) {
            if (typeof c.slotIdx === 'number' && c.slotIdx > removedIdx) {
              c.slotIdx -= 1;
            }
          }
        }
      }
      let newSlotIdx = null;
      if (mintSlot) {
        const reuseBaseSlot = (baseCard.owner === ctx.controller && typeof baseCard.slotIdx === 'number');
        newSlotIdx = reuseBaseSlot
          ? baseCard.slotIdx
          : (typeof RUN !== 'undefined' && RUN.appendSlot ? RUN.appendSlot(baseCard.tplId, mergedStickers) : null);
        if (typeof RUN !== 'undefined' && RUN.getSlots) {
          const slots = RUN.getSlots();
          const slot = (typeof newSlotIdx === 'number') ? slots[newSlotIdx] : null;
          if (slot) {
            writeMergedSpliceToSlot(slot, merged);
            if (typeof RUN.save === 'function') RUN.save();
          }
        }
      }
      // Rebuild base card's runtime fields from the merged template.
      // newSlotIdx may be null for opp-only splices — makeCard accepts
      // that (slotIdx becomes null on the rebuilt card, matching opp's
      // transient-slot convention).
      const rebuilt = makeCard(baseCard.tplId, mergedStickers, newSlotIdx,
                               mergedRolls, mergedPermaBuffs, mergedBonus, newStapledTpls, mergedSubtypeRolls);
      const preservedIid = baseCard.iid;
      const preservedTapped = baseCard.tapped;
      const preservedSick = baseCard.sick;
      const preservedDamage = baseCard.damage;
      const preservedCounters = baseCard.counters;
      for (const k of Object.keys(rebuilt)) baseCard[k] = rebuilt[k];
      baseCard.iid = preservedIid;
      baseCard.tapped = preservedTapped;
      baseCard.sick = preservedSick;
      baseCard.damage = preservedDamage;
      if (preservedCounters) baseCard.counters = preservedCounters;
      baseCard.owner = resultOwner;
      // Move the in-game card to resultOwner's battlefield if it's not
      // already there. For caster-contributes case: result goes to caster.
      // For opp-only case: result stays with the base's original owner —
      // no move needed (baseR.controller === resultOwner already).
      const baseSide = baseR.controller;
      if (baseSide !== resultOwner) {
        const baseBf = G[baseSide].battlefield;
        const baseIdx = baseBf.findIndex(c => c.iid === preservedIid);
        if (baseIdx >= 0) baseBf.splice(baseIdx, 1);
        G[resultOwner].battlefield.push(baseCard);
      }
      log(`${ctx.sourceName} staples ${stapleCard.name} onto ${baseCard.name}.`, 'sp');
      // ─── Combat-state transfer ─────────────────────────────────────
      // If the staple was in combat (attacking or blocking) when consumed,
      // the merged base inherits its combat role. Mental model: the staple
      // is physically affixed to the base, so its commitments carry over.
      // Base's existing role (if any) wins; staple's role is inherited
      // only into an empty slot.
      //
      // Three cases for G.attackers (a list of iids):
      //   - staple was attacking, base was not: replace staple's iid with
      //     base's iid in-place (preserves attack order).
      //   - staple was attacking, base was too: just drop staple's iid.
      //     The merged result is one creature; it attacks once.
      //   - staple wasn't attacking: no-op.
      //
      // G.blockers is a Map of blockerIid → attackerIid:
      //   - staple was a blocker (key): replace the key with base's iid
      //     unless base is already a key elsewhere (in which case drop
      //     the staple entry — same "one creature, one role" rule).
      //   - staple was being blocked (value): remove the entry. The
      //     "attacker" the blocker was assigned to is gone (it became
      //     part of the merged result, possibly on the other side); the
      //     block no longer applies. The blocker stays on the battlefield
      //     but is freed from the assignment.
      if (Array.isArray(G.attackers)) {
        const stapleAttIdx = G.attackers.indexOf(stapleCard.iid);
        if (stapleAttIdx >= 0) {
          const baseAttIdx = G.attackers.indexOf(preservedIid);
          if (baseAttIdx >= 0) {
            G.attackers.splice(stapleAttIdx, 1);
          } else {
            G.attackers[stapleAttIdx] = preservedIid;
          }
        }
      }
      if (G.blockers && typeof G.blockers.forEach === 'function') {
        // Snapshot entries before mutating the Map.
        const entries = Array.from(G.blockers.entries());
        for (const [bIid, aIid] of entries) {
          if (bIid === stapleCard.iid) {
            // Staple was blocking. Transfer block to base unless base is
            // already a blocker.
            G.blockers.delete(stapleCard.iid);
            const baseAlreadyBlocking = Array.from(G.blockers.keys()).includes(preservedIid);
            if (!baseAlreadyBlocking) {
              G.blockers.set(preservedIid, aIid);
            }
          } else if (aIid === stapleCard.iid) {
            // Staple was being blocked. If base inherited the attacker
            // role (the common case), rewrite the assignment to point at
            // base. If base didn't inherit (because base was already
            // attacking, so the iid was removed entirely), the block
            // assignment is stale — drop it.
            const baseStillAttacks = Array.isArray(G.attackers) && G.attackers.includes(preservedIid);
            if (baseStillAttacks) {
              G.blockers.set(bIid, preservedIid);
            } else {
              G.blockers.delete(bIid);
            }
          }
        }
      }
    } else {
      // ─── SPELL-BASE PATH (S+S) ─────────────────────────────────────
      // Both inputs were spells. Their effects already fired above.
      // If caster contributed (at least one of their spells), mint a new
      // merged slot for caster. If neither was the caster's (opp's two
      // spells consumed), no slot is minted — pure removal/dispatch.
      //
      // Like the perm-base path, every removeSlotByIdx call shifts the
      // indices of higher slots down by 1. After each removal, we fix up
      // in-game slotIdx pointers in all zones. Doing this per-removal
      // (rather than once at the end) means the second removal's call
      // uses the correctly-updated stapleCard.slotIdx (already shifted
      // if base was at a lower index — handled by the existing stIdx
      // shift on the inner removal). The general fixup is still needed
      // for OTHER cards (the Stapler itself, anything with cached idx).
      const fixupSlotIdxAfter = (removedIdx) => {
        const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile'];
        for (const zoneName of zones) {
          const zone = G.you[zoneName];
          if (!zone) continue;
          for (const c of zone) {
            if (typeof c.slotIdx === 'number' && c.slotIdx > removedIdx) {
              c.slotIdx -= 1;
            }
          }
        }
      };
      if (baseCard.owner === 'you' && typeof baseCard.slotIdx === 'number'
          && typeof RUN !== 'undefined' && RUN.removeSlotByIdx) {
        const removedIdx = baseCard.slotIdx;
        RUN.removeSlotByIdx(removedIdx);
        fixupSlotIdxAfter(removedIdx);
      }
      if (stapleCard.owner === 'you' && typeof stapleCard.slotIdx === 'number'
          && typeof RUN !== 'undefined' && RUN.removeSlotByIdx) {
        // stapleCard is a stack item, not in any zone — fixupSlotIdxAfter
        // (which walks zones) didn't update it. Apply the manual shift if
        // base's removal was at a lower index.
        let stIdx = stapleCard.slotIdx;
        if (baseCard.owner === 'you' && typeof baseCard.slotIdx === 'number' && baseCard.slotIdx < stapleCard.slotIdx) {
          stIdx -= 1;
        }
        RUN.removeSlotByIdx(stIdx);
        fixupSlotIdxAfter(stIdx);
      }
      if (mintSlot && typeof RUN !== 'undefined' && RUN.appendSlot && RUN.getSlots) {
        const newSlotIdx = RUN.appendSlot(baseCard.tplId, mergedStickers);
        const slots = RUN.getSlots();
        const slot = slots[newSlotIdx];
        if (slot) {
          writeMergedSpliceToSlot(slot, merged);
          if (typeof RUN.save === 'function') RUN.save();
        }
        log(`${ctx.sourceName} staples ${stapleCard.name} onto ${baseCard.name} — new spell added to your deck for next game.`, 'sp');
      } else {
        // Opp-only S+S: both spells resolved, nothing minted.
        log(`${ctx.sourceName} fast-resolves ${baseCard.name} and ${stapleCard.name}.`, 'sp');
      }
    }
    // ─── Charge accounting (unchanged from v1.0.51) ────────────────────
    const stapler = ctx.sourceCard;
    if (stapler && typeof stapler.slotIdx === 'number' && stapler.owner === 'you'
        && typeof RUN !== 'undefined' && RUN.getSlots) {
      const slots = RUN.getSlots();
      const stSlot = slots[stapler.slotIdx];
      if (stSlot && typeof stSlot.charges === 'number') {
        stSlot.charges -= 1;
        if (typeof RUN.save === 'function') RUN.save();
        log(`${ctx.sourceName} — ${stSlot.charges} charge(s) remaining.`, 'sp');
        // Refresh the in-game Stapler card's live charge display. The card's
        // chargesLeft + text were stamped at makePlayer time from the slot's
        // initial value; without a refresh here, the battlefield shows stale
        // "3 charges left" forever even after the slot has been decremented.
        // v1.0.62 fix.
        stapler.chargesLeft = stSlot.charges;
        if (typeof stapler.text === 'string' && /^\d+ charges?\b/.test(stapler.text)) {
          stapler.text = stapler.text.replace(/^\d+ charges?[^.]*\./,
            stSlot.charges + ' charge' + (stSlot.charges === 1 ? '' : 's') + ' left.');
        }
        if (stSlot.charges <= 0) {
          log(`${ctx.sourceName} is out of charges — ripped from the run.`, 'sp');
          const stTplId = stapler.tplId;
          for (const side of ['you', 'opp']) {
            const p = G[side];
            p.battlefield = p.battlefield.filter(c => c.tplId !== stTplId);
            p.hand = p.hand.filter(c => c.tplId !== stTplId);
            p.library = p.library.filter(c => c.tplId !== stTplId);
            p.graveyard = p.graveyard.filter(c => c.tplId !== stTplId);
            p.exile = p.exile.filter(c => c.tplId !== stTplId);
          }
          if (RUN.removeSlotByIdx) RUN.removeSlotByIdx(stapler.slotIdx);
        }
      }
    }
  },
};
// EXPRESSIONS: params can be literals or {from:'<name>'}. Targets snapshotted
// at resolution start ("last known info"). Add new exprs in resolveExpr.
function snapshotTarget(target) {
  if (!target) return null;
  if (target.kind === 'creature' && target.iid != null) {
    const f = findCard(target.iid);
    if (!f) return { kind: 'creature', iid: target.iid, missing: true };
    const [pow, tou] = getStats(f.card);
    return {
      kind: 'creature',
      iid: target.iid,
      label: target.label || f.card.name,
      power: pow,
      toughness: tou,
      controller: f.controller,
      name: f.card.name,
    };
  }
  if (target.kind === 'player') {
    return { kind: 'player', who: target.who, label: target.label };
  }
  return target;
}

// Lazy per-slot target getter. Returns {tgt, snap} for a slot index, snapshotting
// the target the first time that slot is read so multi-effect resolution sees a
// stable last-known-info snapshot (§3.6). Shared by spell / trigger / ability
// resolution — each binds its own targets array.
function makeSlotTargetGetter(targets) {
  const snapshots = new Map();
  return (slot) => {
    const tgt = targets[slot] || null;
    if (!snapshots.has(slot)) snapshots.set(slot, tgt ? snapshotTarget(tgt) : null);
    return { tgt, snap: snapshots.get(slot) };
  };
}

// Resolve {from:'<name>'} from snapshot/ctx; literals pass through.
function resolveExpr(value, ctx, targetSnap) {
  if (value == null) return value;
  if (typeof value !== 'object' || !value.from) return value;
  switch (value.from) {
    case 'target_power':
      return (targetSnap && typeof targetSnap.power === 'number') ? targetSnap.power : 0;
    case 'target_toughness':
      return (targetSnap && typeof targetSnap.toughness === 'number') ? targetSnap.toughness : 0;
    case 'target_controller':
      return (targetSnap && targetSnap.controller) ? targetSnap.controller : ctx.controller;
    case 'source_power': {
      const sc = ctx.sourceCard;
      if (!sc) return 0;
      const [pow] = getStats(sc);
      return pow;
    }
    case 'source_toughness': {
      const sc = ctx.sourceCard;
      if (!sc) return 0;
      const [, tou] = getStats(sc);
      return tou;
    }
    case 'count_creatures_you':
      return G[ctx.controller].battlefield.filter(c => hasType(c, 'Creature')).length;
    case 'count_creatures_opp':
      return G[opp(ctx.controller)].battlefield.filter(c => hasType(c, 'Creature')).length;
    default:
      console.warn('Unknown expression:', value.from);
      return 0;
  }
}

// Resolve all {from:...} fields against snapshot+ctx; return new effect.
function resolveEffectParams(effect, ctx, targetSnap) {
  const out = {};
  for (const key of Object.keys(effect)) {
    out[key] = resolveExpr(effect[key], ctx, targetSnap);
  }
  // scope:'self' is already resolved by the caller into the `target` argument
  // (the source creature for creature-effects; the controller for player
  // effects). The handlers' `if (params.scope)` branch is MASS-scope expansion,
  // and creaturesInScope() returns [] for 'self' — so a leftover scope:'self'
  // would silently drop the effect (every self-pump card, Char's self-damage).
  // Strip it so the handler operates on the resolved target.
  if (out.scope === 'self') delete out.scope;
  return out;
}

function applyEffect(ctx, effect, target, targetSnap) {
  const fn = EFFECTS[effect.kind];
  if (!fn) { console.warn('Unknown effect:', effect.kind); return; }
  const snap = (targetSnap !== undefined) ? targetSnap : snapshotTarget(target);
  const resolved = resolveEffectParams(effect, ctx, snap);
  fn(ctx, resolved, target);
}
// An effect consumes a chosen target if it carries an inline target filter
// (legacy/single shape) OR binds to a multi-target slot (`target_slot`, the
// canonical multi-target shape — the slot's filter lives in the object's
// `target_slots`). Scope/self effects carry neither and never reach here as
// targeted.
function effectNeedsTarget(eff) {
  return (!!eff.target && eff.target !== 'self') || (eff.target_slot != null);
}

// Boot-time effect validation (Slice 3 step 4). Walks every card's effects
// (on-cast — flat or modal — plus activated/triggered abilities) and flags
// any effect `kind` not in the EFFECTS dispatch table, plus any target()/
// chooses() filter outside the closed TARGET_FILTERS taxonomy. Surfaces typos
// at boot rather than at resolution. Accepts both legacy and new kind names
// (all live in EFFECTS during the cutover). Returns {unknownKinds,
// unknownFilters} for tests; warns to console for the running app.
// Per-kind required-field schema for the NEW atomic effects (Slice 3). Only
// the new kinds are checked — they aren't used by any card yet, so there's no
// false-positive risk against the legacy pool; this guards the migration's
// output. Each entry: kind → validator(effect) returning an error string or null.
const EFFECT_SCHEMA = {
  move_card: (e) => {
    const ZONES = ['library', 'hand', 'graveyard', 'battlefield', 'exile'];
    if (!ZONES.includes(e.from_zone)) return 'move_card bad/missing from_zone';
    if (!ZONES.includes(e.to_zone)) return 'move_card bad/missing to_zone';
    return null;
  },
  chooses: (e) => (e.filter ? null : 'chooses missing filter'),
  affect_creature: (e) => {
    const SEV = ['tap', 'bounce', 'destroy', 'exile'];
    if (e.severity != null && !SEV.includes(e.severity) && !(e.severity >= 1 && e.severity <= 4)) {
      return 'affect_creature bad severity (want tap|bounce|destroy|exile or 1-4)';
    }
    return null;
  },
};

function validateAllCardEffects(cards) {
  const unknownKinds = [];
  const unknownFilters = [];
  const schemaErrors = [];
  const list = Array.isArray(cards) ? cards : Object.values(cards || {});
  const checkList = (effs, cardId) => {
    for (const e of (effs || [])) {
      if (!e || typeof e !== 'object') continue;
      if (e.kind && !EFFECTS[e.kind]) unknownKinds.push(cardId + '.' + e.kind);
      if ((e.kind === 'chooses' || e.kind === 'target') && e.filter && !TARGET_FILTERS.has(e.filter)) {
        unknownFilters.push(cardId + '.' + e.kind + '(' + e.filter + ')');
      }
      const schema = EFFECT_SCHEMA[e.kind];
      if (schema) { const err = schema(e); if (err) schemaErrors.push(cardId + ': ' + err); }
    }
  };
  for (const card of list) {
    const cardId = card.tplId || card.card_id || card.name || '?';
    checkList(allCardEffects(card), cardId);
    // New top-level target() step filter.
    if (card.target && !TARGET_FILTERS.has(card.target)) {
      unknownFilters.push(cardId + '.target(' + card.target + ')');
    }
    for (const ab of (card.abilities || [])) checkList(ab.effects, cardId);
    for (const trig of (card.triggers || [])) checkList(trig.effects, cardId);
  }
  if (unknownKinds.length) console.warn('Unknown effect kind(s):', unknownKinds.join(', '));
  if (unknownFilters.length) console.warn('Unknown target/chooses filter(s):', unknownFilters.join(', '));
  if (schemaErrors.length) console.warn('Effect schema error(s):', schemaErrors.join('; '));
  return { unknownKinds, unknownFilters, schemaErrors };
}

// Effect kinds that operate on a creature (vs player) — drives scope:'self' meaning.
// Add creature-operators here; damage/gain_life/draw/discard/add_mana resolve self → controller.
const CREATURE_EFFECT_KINDS = new Set([
  'pump', 'add_counter', 'untap', 'affect_creature',
  'fight_target', 'endomorph_absorb',
  'grant_keyword',
  'sacrifice', 'gainControl',
]);
function effectOperatesOnCreature(eff) {
  return CREATURE_EFFECT_KINDS.has(eff.kind);
}

// card.effects is flat array OR {modes:[[...],...]}. getModes always returns array-of-modes.
function getModes(card) {
  const e = card.effects;
  if (!e) return [[]];
  if (Array.isArray(e)) return [e];
  if (Array.isArray(e.modes)) return e.modes;
  return [[]];
}
function isModal(card) {
  return !!(card.effects && !Array.isArray(card.effects) && Array.isArray(card.effects.modes));
}
// Active effects for (card, modeIdx). Modeless ignores modeIdx.
function effectsForMode(card, modeIdx) {
  const modes = getModes(card);
  return modes[modeIdx || 0] || [];
}
// Flatten across all modes. For "does card contain effect X anywhere" queries.
function allCardEffects(card) {
  if (!card || !card.effects) return [];
  if (Array.isArray(card.effects)) return card.effects;
  if (Array.isArray(card.effects.modes)) {
    const out = [];
    for (const mode of card.effects.modes) {
      if (Array.isArray(mode)) for (const e of mode) out.push(e);
    }
    return out;
  }
  return [];
}
// Predicate any-match across modes; avoids the intermediate flatten array.
function cardHasEffect(card, predicate) {
  if (!card || !card.effects) return false;
  if (Array.isArray(card.effects)) return card.effects.some(predicate);
  if (Array.isArray(card.effects.modes)) {
    for (const mode of card.effects.modes) {
      if (Array.isArray(mode) && mode.some(predicate)) return true;
    }
  }
  return false;
}

// EVENTS & TRIGGERS — emit() queues matched triggers in G.pendingTriggers,
// drained to stack at next priority round. Targets re-validate at resolution.
const TRIGGER_DEPTH_CAP = 100;

// Lord-grant reconciliation, called from emit() pre-trigger. Idempotent.
// Cleanup via clearRestrictionsFromSource on lord leave-play.
function applyStaticKeywordGrants() {
  if (!G || !G.you || !G.opp) return;
  const all = [
    ...G.you.battlefield.map(c => ({ card: c, controller: 'you' })),
    ...G.opp.battlefield.map(c => ({ card: c, controller: 'opp' })),
  ];
  for (const { card: lord, controller: lordCtrl } of all) {
    if (!lord.static_buffs) continue;
    for (const buff of lord.static_buffs) {
      if (!buff.keywords || !buff.keywords.length) continue;
      for (const { card: target, controller: tgtCtrl } of all) {
        if (target.iid === lord.iid) continue;
        if (!hasType(target, 'Creature')) continue;
        if (!matchFilter(target, buff.filter, tgtCtrl, lordCtrl)) continue;
        if (buff.subtype && !hasType(target, buff.subtype)) continue;
        if (!(target.grantedBy instanceof Map)) target.grantedBy = new Map();
        for (const kw of buff.keywords) {
          if (!target.grantedBy.has(kw)) target.grantedBy.set(kw, new Set());
          if (target.grantedBy.get(kw).has(lord.iid)) continue;
          target.grantedBy.get(kw).add(lord.iid);
          if (!target.keywords.includes(kw)) target.keywords.push(kw);
        }
      }
    }
  }
}

function emit(evt, extraSources) {
  if (G.gameOver) return;
  applyStaticKeywordGrants();
  // extraSources for dies-triggers etc. where source has left play. {card, controller}.
  const checkSource = (card, who) => {
    if (!card.triggers || card.triggers.length === 0) return;
    for (const trig of card.triggers) {
      if (trig.event !== evt.type) continue;
      if (!evalTriggerCondition(trig, card, evt, who)) continue;
      if (!triggerHasAnyValidTarget(trig, who)) continue;
      G.pendingTriggers.push({
        trig,
        sourceIid: card.iid,
        sourceName: card.name,
        controller: who,
        event: evt,
      });
    }
  };
  for (const who of ['you', 'opp']) {
    for (const card of G[who].battlefield) checkSource(card, who);
  }
  if (extraSources) {
    for (const src of extraSources) checkSource(src.card, src.controller);
  }
}

// Unified zone-change emission (Slice 2 / DIVERGENCE E2). The sole battlefield
// enter/leave/death event now — composable triggers (event: 'card_zone_change')
// match on this; the legacy cardEntersBattlefield / cardDies /
// cardLeavesBattlefield events were retired once card migration completed.
// extraSources lets a card that has already left a zone still see its own
// zone-change trigger (parity with the cardDies/cardLeaves extraSources).
function emitZoneChange(card, controller, fromZone, toZone, extraSources, sourceIid) {
  if (!card) return;
  emit({
    type: 'card_zone_change',
    subject_iid: card.iid,
    subject_card: card,
    controller,
    from_zone: fromZone,
    to_zone: toZone,
    // The card that CAUSED this move (e.g. the token-maker), when applicable.
    // Distinct from subject_card. Feeds the noSelfCascade guard so a generated
    // "another creature enters -> create tokens" trigger doesn't re-fire on its
    // own tokens — parity with the legacy events' sourceIid.
    source_iid: sourceIid,
  }, extraSources);
}

// Returns true if the trigger has no targeted effects (always queueable),
// OR if every targeted effect has at least one currently-valid target.
function triggerHasAnyValidTarget(trig, controller) {
  // New top-level target() step: the trigger needs a legal target of that filter.
  if (trig.target && targetsForFilter(trig.target, controller, trig.target_filter).length === 0) return false;
  for (const eff of (trig.effects || [])) {
    if (!effectNeedsTarget(eff)) continue;
    const valid = getValidTargets(eff, controller);
    if (valid.length === 0) return false;
  }
  return true;
}

// Does a player-controlled trigger need the player to CHOOSE its target? Returns
// { valid, promptEff } when there's a real choice (>1 legal target), else null.
// Covers BOTH the top-level target() step (§3.5 — migrated triggers carry the
// target on `trig.target` with bare effects) and the legacy per-effect target.
// Without the top-level branch, every migrated targeted trigger silently
// auto-picked instead of prompting (the "targets auto-selected on cast" bug).
function triggerPlayerTargetPrompt(trig, controller) {
  if (controller !== 'you') return null;
  // The target filter is the top-level step (§3.5) or the first per-effect
  // target — primaryLegalTargets resolves either shape. Implicit-target filters
  // (self/player/opp/spell) auto-pick: no choice to offer.
  const filt = trig.target || ((trig.effects || []).find(effectNeedsTarget) || {}).target;
  if (!filt || filt === 'self' || filt === 'player' || filt === 'opp' || filt === 'spell') return null;
  const valid = primaryLegalTargets(trig, controller);
  if (valid.length <= 1) return null;   // 0 → fizzle/auto; 1 → no choice to make
  // The effect used to value the choice (for the AI driver's pickBestTriggerTarget).
  const promptEff = (trig.effects || []).find(e => e.kind !== 'chooses') || (trig.effects || [])[0] || {};
  return { valid, promptEff };
}

// Drain queued triggers to stack. Active player's first, then opp. Pauses on
// pendingTriggerTarget prompt; remaining triggers drain post-prompt.
function drainTriggers() {
  if (G.gameOver) return false;
  if (G.pendingTriggerTarget) return false;
  if (G.pendingTriggers.length === 0) return false;
  const active = G.activePlayer;
  const ordered = [
    ...G.pendingTriggers.filter(p => p.controller === active),
    ...G.pendingTriggers.filter(p => p.controller !== active),
  ];
  G.pendingTriggers = [];
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    const prompt = (p.controller === 'you')
      ? triggerPlayerTargetPrompt(p.trig, p.controller)
      : null;
    if (prompt) {
      // Stop draining. Set the prompt; remaining triggers wait in queue.
      G.pendingTriggers = ordered.slice(i);   // includes the current one (its slot)
      G.pendingTriggerTarget = {
        controller: p.controller,
        sourceIid: p.sourceIid,
        sourceName: p.sourceName,
        trig: p.trig,
        promptEff: prompt.promptEff,
        valid: prompt.valid,
      };
      // Drop the in-prompt trigger from pendingTriggers — it's now in
      // pendingTriggerTarget. After resolution we re-push from there.
      G.pendingTriggers.shift();
      log(`${p.sourceName} triggered — choose a target.`, 'sp');
      return true;
    }
    pushTriggerOnStack(p);
  }
  return true;
}

function pushTriggerOnStack(p) {
  // Triggers go on the stack like spells. Target chosen now (MtG rules).
  // v1: auto-pick via AI heuristic for both sides; player UI prompt is future work.
  const targetEff = (p.trig.effects || []).find(effectNeedsTarget);
  let chosenTarget = null;
  if (p.trig.target) {
    // New top-level target() step: pick from the filter's legal set, valued by
    // the first target-operating effect. (Human prompt deferred — auto-picks
    // for both sides today, like the legacy per-effect path.)
    const valid = targetsForFilter(p.trig.target, p.controller, p.trig.target_filter);
    if (valid.length === 0) {
      log(`${p.sourceName} trigger fizzles — no legal target.`, 'sp');
      return;
    }
    const valueEff = (p.trig.effects || []).find(e => e.kind !== 'chooses') || (p.trig.effects || [])[0] || {};
    chosenTarget = pickBestTriggerTarget(valueEff, valid, p.controller);
  } else if (targetEff) {
    const valid = getValidTargets(targetEff, p.controller);
    if (valid.length === 0) {
      log(`${p.sourceName} trigger fizzles — no legal target.`, 'sp');
      return;
    }
    chosenTarget = pickBestTriggerTarget(targetEff, valid, p.controller);
  }
  G.stack.push({
    kind: 'trigger',
    trig: p.trig,
    sourceIid: p.sourceIid,
    sourceName: p.sourceName,
    controller: p.controller,
    targets: chosenTarget ? [chosenTarget] : [],
    // event → ctx.event for effects that read non-target data (Endomorph etc.).
    event: p.event || null,
  });
  log(`${p.sourceName} triggers: ${p.trig.text || p.trig.event}.`, 'sp');
  if (!G.priority) G.priority = { passes: new Set() };
  G.priority.passes.clear();
  G.priorityHolder = opp(p.controller);
}

// Auto-pick best trigger target. v1 used for both sides.
function pickBestTriggerTarget(eff, valid, controller) {
  const them = opp(controller);
  const ctrlOf = t => {
    const f = findCard(t.iid);
    return f ? f.controller : null;
  };
  if (eff.kind === 'damage') {
    const amt = eff.amount || 0;
    const oppCreatures = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === them);
    const killable = oppCreatures
      .map(t => { const f = findCard(t.iid); return {t, tou: f ? getStats(f.card)[1] - f.card.damage : 99}; })
      .filter(x => x.tou <= amt)
      .sort((a, b) => b.tou - a.tou);
    if (killable.length) return killable[0].t;
    const oppFace = valid.find(t => t.kind === 'player' && t.who === them);
    if (oppFace) return oppFace;
  }
  if (eff.kind === 'discard'
      || (eff.kind === 'move_card' && eff.from_zone === 'hand' && eff.to_zone === 'graveyard')) {
    const oppFace = valid.find(t => t.kind === 'player' && t.who === them);
    if (oppFace) return oppFace;
  }
  const harmful = ['affect_creature', 'fight_target'];
  if (harmful.includes(eff.kind)) {
    const oppC = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === them);
    if (oppC.length) {
      const sorted = oppC.slice().sort((a, b) => {
        const fa = findCard(a.iid), fb = findCard(b.iid);
        const pa = fa ? getStats(fa.card)[0] : 0;
        const pb = fb ? getStats(fb.card)[0] : 0;
        return pb - pa;
      });
      return sorted[0];
    }
  }
  if (['pump', 'add_counter', 'untap'].includes(eff.kind)) {
    const ours = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === controller);
    if (ours.length) {
      const sorted = ours.slice().sort((a, b) => {
        const fa = findCard(a.iid), fb = findCard(b.iid);
        const pa = fa ? getStats(fa.card)[0] : 0;
        const pb = fb ? getStats(fb.card)[0] : 0;
        return pb - pa;
      });
      return sorted[0];
    }
  }
  // defender = debuff (target opp's best); other keywords = buff (target our best).
  if (eff.kind === 'grant_keyword') {
    const isDebuff = (eff.keyword === 'defender');
    const wantedCtrl = isDebuff ? them : controller;
    const candidates = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === wantedCtrl);
    const usable = candidates.filter(t => {
      const f = findCard(t.iid);
      return f && !f.card.keywords.includes(eff.keyword);
    });
    if (usable.length) {
      const sorted = usable.slice().sort((a, b) => {
        const fa = findCard(a.iid), fb = findCard(b.iid);
        const pa = fa ? getStats(fa.card)[0] : 0;
        const pb = fb ? getStats(fb.card)[0] : 0;
        return pb - pa;
      });
      return sorted[0];
    }
  }
  if (eff.kind === 'returnFromGraveyard') {
    const graveCards = G[controller].graveyard;
    const scored = valid
      .filter(t => t.kind === 'graveyard_creature')
      .map(t => {
        const card = graveCards.find(c => c.iid === t.iid);
        return {t, value: card ? (cardValueOrZero(card)) : 0};
      })
      .sort((a, b) => b.value - a.value);
    if (scored.length) return scored[0].t;
  }
  if (eff.kind === 'gain_life') {
    // Signed life: negative = drain (aim at the opponent), positive = gain (self).
    const wanted = (eff.amount || 0) < 0 ? them : controller;
    const face = valid.find(t => t.kind === 'player' && t.who === wanted);
    if (face) return face;
  }
  // Last resort: first valid target.
  return valid[0];
}

// Coarse intrinsic value for in-engine picking (avoids reaching into AI module).
function cardValueOrZero(card) {
  if (!card) return 0;
  const cost = costTotalCard(card);
  if (hasType(card, 'Creature')) {
    const [pow, tou] = getStats(card);
    return pow + tou + cost * 2;
  }
  return cost * 2;
}

// Resolve a trigger from the stack.
function resolveTrigger(item) {
  G.triggerChainDepth = (G.triggerChainDepth || 0) + 1;
  if (G.triggerChainDepth > TRIGGER_DEPTH_CAP) {
    log(`Trigger chain too deep (${TRIGGER_DEPTH_CAP}) — bailing to prevent loop.`, 'imp');
    return;
  }
  // Optional paid trigger (Land+Spell staple ETB): pause and let the controller
  // choose whether to pay. Targets are already locked (chosen at queue time), so
  // the order is target → may-pay → effect. Can't-afford auto-declines (no prompt).
  if (item.trig && item.trig.optional_cost) {
    const who = item.controller;
    if (!canPayPotential(who, item.trig.optional_cost)) {
      log(`${item.sourceName}: ${pname(who)} can't pay the optional cost — declined.`, 'sp');
      afterEffectsApplied();
      return;
    }
    G.pendingOptionalCost = {
      who,
      cost: { ...item.trig.optional_cost },
      source: item.sourceName,
      sourceIid: item.sourceIid,
      item,
    };
    log(`${item.sourceName}: ${pname(who)} may pay to use the stapled effect.`, 'sp');
    return;  // doOptionalCost resumes here (runs the effects on pay)
  }
  runTriggerEffects(item);
}

// Run a trigger's effects against its already-chosen targets. Split from
// resolveTrigger so the optional-cost path can resume here after payment.
function runTriggerEffects(item) {
  const ctx = {
    sourceIid: item.sourceIid,
    sourceName: item.sourceName,
    controller: item.controller,
    // Best-effort lookup — source may have left play between queue and resolve.
    sourceCard: (() => {
      const f = item.sourceIid != null ? findCard(item.sourceIid) : null;
      return f ? f.card : null;
    })(),
    event: item.event || null,
  };
  const getTriggerTargetForSlot = makeSlotTargetGetter(Array.isArray(item.targets) ? item.targets : []);
  // New targeting model (§3.5): a top-level `target` step on the trigger means
  // it picked one target (item.targets[0]); bare effects operate on it, and
  // chooses() replaces it. Inert for legacy triggers (none set trig.target) —
  // they use the per-effect target/slot branch below, unchanged.
  const hasTargetStep = !!(item.trig && item.trig.target);
  let curTgt = null, curSnap = null;
  if (hasTargetStep) { const f0 = getTriggerTargetForSlot(0); curTgt = f0.tgt; curSnap = f0.snap; }
  for (const eff of (item.trig.effects || [])) {
    if (eff.kind === 'chooses') {
      applyEffect(ctx, eff, curTgt, curSnap);
      if (ctx.chosen) { curTgt = ctx.chosen; curSnap = snapshotTarget(ctx.chosen); }
      continue;
    }
    if (effectNeedsTarget(eff)) {
      const slot = eff.target_slot || 0;
      const { tgt, snap } = getTriggerTargetForSlot(slot);
      if (!tgt) { log(`${item.sourceName} trigger fizzles — no target.`, 'sp'); continue; }
      // No re-validation: multi-effect triggers (Exorcist [exile, gain_life]) need
      // effect 1 to read pre-effect-0 snapshot. Each effect guards live-target itself.
      applyEffect(ctx, eff, tgt, snap);
    } else if (eff.scope === 'self') {
      // Self → source creature OR source's controller depending on
      // effectOperatesOnCreature.
      let selfTarget = null, selfSnap = null;
      if (effectOperatesOnCreature(eff)) {
        selfTarget = { kind: 'creature', iid: item.sourceIid, label: item.sourceName };
        selfSnap = snapshotTarget(selfTarget);
      } else {
        selfTarget = { kind: 'player', who: item.controller };
        selfSnap = selfTarget;
      }
      applyEffect(ctx, eff, selfTarget, selfSnap);
    } else if (hasTargetStep && eff.scope == null) {
      // Bare effect after a target() step → operate on the established/chosen target.
      applyEffect(ctx, eff, curTgt, curSnap);
    } else {
      applyEffect(ctx, eff, null, null);
    }
  }
  ctx.chosen = null;
  afterEffectsApplied();
}

// Resolve an optional-cost ("you may pay {cost}") trigger after the controller
// chooses. Pay → deduct mana (auto-taps via payMana) and run the stashed
// trigger's effects; decline → nothing. Death/etc. triggers drain afterward.
function doOptionalCost(who, pay) {
  if (!G.pendingOptionalCost || G.pendingOptionalCost.who !== who) return;
  const p = G.pendingOptionalCost;
  G.pendingOptionalCost = null;
  if (!pay) {
    log(`${pname(who)} declines ${p.source}'s optional cost.`, 'sp');
    afterEffectsApplied();
    return;
  }
  // Re-check affordability at resolution (board could have changed while paused).
  if (!canPayPotential(who, p.cost)) {
    log(`${pname(who)} can no longer pay ${p.source}'s cost — declined.`, 'sp');
    afterEffectsApplied();
    return;
  }
  payMana(who, p.cost);
  log(`${pname(who)} pays for ${p.source}.`, 'sp');
  runTriggerEffects(p.item);
  drainTriggers();
}

// ----- Targeting -----
function getValidTargets(effect, controller) {
  const allCreatures = [
    ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
    ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
  ].filter(x => hasType(x.card, 'Creature'))
   .filter(x => !(x.card.keywords.includes('hexproof') && x.ctrl !== controller));
  switch (effect.target) {
    case 'creature_or_player':  // "any target" — a creature or a player
      return [
        {kind:'player', who:'you', label: G.you.name},
        {kind:'player', who:'opp', label: G.opp.name},
        ...allCreatures.map(x => ({kind:'creature', iid:x.card.iid, label:x.card.name})),
      ];
    case 'player':
      return [
        {kind:'player', who:'you', label: G.you.name},
        {kind:'player', who:'opp', label: G.opp.name},
      ];
    case 'opp':
      // Implicit single-opponent (no choice). Returns as 'player' so resolvers don't special-case.
      return [{kind:'player', who: opp(controller), label: G[opp(controller)].name}];
    case 'creature':
      return allCreatures
        .filter(x => matchFilter(x.card, effect.filter, x.ctrl, controller))
        .map(x => ({kind:'creature', iid:x.card.iid, label:x.card.name}));
    case 'permanent':
      // Creatures + Lands + Artifacts. Special-card exclusions live in caller filters.
      return [
        ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
        ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
      ]
        .filter(x => isPermanent(x.card))
        .filter(x => !(x.card.keywords && x.card.keywords.includes('hexproof') && x.ctrl !== controller))
        .filter(x => matchFilter(x.card, effect.filter, x.ctrl, controller))
        .map(x => ({kind:'permanent', iid:x.card.iid, label:x.card.name}));
    case 'graveyard_creature':
      // Caster's own graveyard; hexproof doesn't apply. Filter for tribal recursion.
      return G[controller].graveyard
        .filter(c => hasType(c, 'Creature'))
        .filter(c => matchFilter(c, effect.filter, controller, controller))
        .map(c => ({kind:'graveyard_creature', iid: c.iid, label: c.name, controller}));
    case 'spell':
      return G.stack
        .filter(s => s.kind !== 'trigger' && s.card)
        .map(s => ({kind:'stack', stackItem: s, label: s.card.name}));
    case 'permanent_or_spell': {
      // Stapler target: perm OR spell. Each half uses its own match function.
      const perms = [
        ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
        ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
      ]
        .filter(x => isPermanent(x.card))
        .filter(x => !(x.card.keywords && x.card.keywords.includes('hexproof') && x.ctrl !== controller))
        .filter(x => matchFilter(x.card, effect.filter, x.ctrl, controller))
        .map(x => ({kind:'permanent', iid:x.card.iid, label:x.card.name}));
      const spells = G.stack
        .filter(s => s.kind !== 'trigger' && s.card)
        .filter(s => matchFilterSpell(s.card, effect.filter))
        .map(s => ({kind:'stack', stackItem: s, label: s.card.name}));
      return perms.concat(spells);
    }
    default: return [];
  }
}

// The closed legal-object taxonomy for the target()/chooses() steps (§3.5 of
// plan-effects-refactor.md). Adding a filter means adding it here AND to
// targetsForFilter below — there is no open tail.
const TARGET_FILTERS = new Set([
  'creature', 'player', 'opp', 'creature_or_player', 'spell', 'permanent',
  'your_creature', 'opp_creature', 'graveyard_creature',
]);

// Legal-target set for a target() step's filter (Slice 3 step 2 / §3.5). THIS
// is the hexproof checkpoint: opp-controlled hexproof creatures are excluded,
// the caster's own hexproof creatures are allowed. Maps the new closed
// taxonomy onto the existing getValidTargets machinery. `creature_or_player`
// is the canonical spelling of proto's legacy `"any"`.
function targetsForFilter(filter, controller, restrict) {
  // `restrict` (the optional top-level `target_filter`) carries extra matchFilter
  // restrictions — not_color, has_keyword, max_tough, tapped, not_token, etc. — that
  // the closed taxonomy can't name on its own. Merge it into the getValidTargets
  // filter so the cast-time enumeration (and hexproof checkpoint) honors it.
  const merge = (f) => restrict ? Object.assign({}, f, restrict) : f;
  switch (filter) {
    case 'creature_or_player': return getValidTargets({ target: 'creature_or_player', filter: restrict || undefined }, controller);
    case 'player':             return getValidTargets({ target: 'player', filter: restrict || undefined }, controller);
    case 'opp':                return getValidTargets({ target: 'opp', filter: restrict || undefined }, controller);
    case 'creature':           return getValidTargets({ target: 'creature', filter: restrict || undefined }, controller);
    case 'permanent':          return getValidTargets({ target: 'permanent', filter: restrict || undefined }, controller);
    case 'spell':              return getValidTargets({ target: 'spell', filter: restrict || undefined }, controller);
    case 'graveyard_creature': return getValidTargets({ target: 'graveyard_creature', filter: restrict || undefined }, controller);
    case 'your_creature':      return getValidTargets({ target: 'creature', filter: merge({ controller: 'self' }) }, controller);
    case 'opp_creature':       return getValidTargets({ target: 'creature', filter: merge({ controller: 'opp' }) }, controller);
    default:
      console.warn('Unknown target() filter:', filter);
      return [];
  }
}

// Per-slot legal targets for a multi-target object's targeted effects. Groups
// effects by `target_slot`, then resolves each slot's legal set: the canonical
// card-level `target_slots[slot]` spec (§5b) when present, else the intersection
// of the per-effect filters sharing that slot (modal charm modes carry per-effect
// target). Shared by the cast-legality check (isLegalAction) and the AI action
// enumerator (getLegalActions) so the slot-spec resolution can't drift between
// them. Returns Map<slot, targets[]>.
function validTargetsBySlot(card, targetedEffs, who) {
  const slotSpecs = Array.isArray(card.target_slots) ? card.target_slots : null;
  const slotMap = new Map();
  for (const eff of targetedEffs) {
    const slot = eff.target_slot || 0;
    if (!slotMap.has(slot)) slotMap.set(slot, []);
    slotMap.get(slot).push(eff);
  }
  const out = new Map();
  for (const [slot, effs] of slotMap) {
    if (slotSpecs && slotSpecs[slot]) { out.set(slot, getValidTargets(slotSpecs[slot], who)); continue; }
    let acc = getValidTargets(effs[0], who);
    for (let i = 1; i < effs.length; i++) {
      const next = getValidTargets(effs[i], who);
      acc = acc.filter(a => next.some(n => sameTarget(a, n)));
    }
    out.set(slot, acc);
  }
  return out;
}

// ─── Canonical "does this need a target / what are its legal targets" ─────
// ONE source of truth for an object's (card / activated ability / trigger)
// targeting shape, so the question can't drift across consumers. The §3.5
// migration added the top-level target() step, and three consumers
// (clickHand, the trigger prompt, the castable-highlight) independently kept
// checking only per-effect targets and silently broke. They all route here now.
//
// Three shapes: top-level `target` (+ optional `target_filter`); ability-level
// `target_slots` (Stapler-style multi-slot); legacy per-effect `target`/`target_slot`.
function objectNeedsTarget(obj) {
  if (!obj) return false;
  if (obj.target) return true;
  if (Array.isArray(obj.target_slots) && obj.target_slots.length > 0) return true;
  return Array.isArray(obj.effects) && obj.effects.some(effectNeedsTarget);
}
// Legal targets for the object's PRIMARY slot — for "is there any legal target?"
// and the trigger >1-choice rule.
function primaryLegalTargets(obj, who) {
  if (!obj) return [];
  if (obj.target) return targetsForFilter(obj.target, who, obj.target_filter);
  if (Array.isArray(obj.target_slots) && obj.target_slots.length > 0) return getValidTargets(obj.target_slots[0], who);
  const eff = Array.isArray(obj.effects) ? obj.effects.find(effectNeedsTarget) : null;
  return eff ? getValidTargets(eff, who) : [];
}
// Build the probe/fake targets array for a legality check on `obj`, covering all
// three shapes. Returns targets[] (indexed by slot), or null if a required slot
// has no legal target (→ not castable/activatable). The legality-only stand-in
// the UI uses before entering target-picking, and the castable-highlight probe.
function probeTargetsForObject(obj, who) {
  if (!obj) return [];
  if (obj.target) {
    const valid = targetsForFilter(obj.target, who, obj.target_filter);
    return valid.length ? [valid[0]] : null;
  }
  if (Array.isArray(obj.target_slots) && obj.target_slots.length > 0) {
    const fakes = [];
    for (const spec of obj.target_slots) {
      const valid = getValidTargets(spec, who);
      if (!valid.length) return null;
      fakes.push(valid[0]);
    }
    return fakes;
  }
  return fakeTargetsForLegality(obj.effects, who);
}

// Stack-item filter (stack items aren't on bf, so no tapped/controller/hexproof).
function matchFilterSpell(card, filter) {
  if (!filter) return true;
  if (filter.spliceable_base && !isSpliceableBase(card.tplId)) return false;
  if (filter.spliceable_staple && !isSpliceableStaple(card.tplId)) return false;
  if (filter.not_token && card.isToken) return false;
  return true;
}
function matchFilter(card, filter, controller, who) {
  if (!filter) return true;
  if (filter.tapped !== undefined && card.tapped !== filter.tapped) return false;
  if (filter.not_color && card.color === filter.not_color) return false;
  if (filter.color && card.color !== filter.color) return false;
  if (filter.controller === 'self' && controller !== who) return false;
  if (filter.controller === 'opp'  && controller === who) return false;
  if (filter.max_tough !== undefined) {
    const [, t] = getStats(card);
    if (t > filter.max_tough) return false;
  }
  // Power/toughness bounds — the siblings of max_tough. Enforced so the card-text
  // (withFilter) that already renders "with toughness N or greater" / "power N or
  // less" describes a restriction the engine actually applies (no fake limits).
  if (filter.min_tough !== undefined) {
    const [, t] = getStats(card);
    if (t < filter.min_tough) return false;
  }
  if (filter.max_power !== undefined) {
    const [pw] = getStats(card);
    if (pw > filter.max_power) return false;
  }
  if (filter.min_power !== undefined) {
    const [pw] = getStats(card);
    if (pw < filter.min_power) return false;
  }
  // not_keyword: rejects creatures with the named keyword (sibling of has_keyword).
  if (filter.not_keyword && (card.keywords || []).includes(filter.not_keyword)) return false;
  // Subtype filter — used by tribal recursion (Spirit Shepherd's "return a
  // Spirit creature card") and any future "destroy target Goblin", "exile
  // target Wizard" style restrictions. Cards may have multi-subtype strings
  // ("Wizard Artificer"), so we substring-match.
  if (filter.subtype && !hasType(card, filter.subtype)) return false;
  // Keyword filter — used by green's anti-flying answers (Choking Vines,
  // Vine Strangle) to restrict targeting to flying creatures specifically.
  // Generic over keyword name so future "destroy target indestructible"
  // or "destroy target tapped creature with menace" cards can compose.
  if (filter.has_keyword && !(card.keywords || []).includes(filter.has_keyword)) return false;
  // not_token filter: rejects token permanents/spells. Used by Steal — you
  // can't put a token into your library as a trophy because tokens have no
  // CARDS template to instantiate from on later games. Mirrors how the
  // Stapler filters tokens implicitly via isSpliceableBase/Staple's
  // CARDS[tplId] guard.
  if (filter.not_token && card.isToken) return false;
  // Spliceable-base filter (Stapler's first target). Must be a card that
  // can act as a base in the existing splice infrastructure: no Lands, no
  // special creatures (Elystra/Codex/Stapler itself), no tokens, no modal
  // cards. Routes through isSpliceableBase which is the canonical check.
  if (filter.spliceable_base && !isSpliceableBase(card.tplId)) return false;
  // Spliceable-staple filter (Stapler's second target). Must be a card
  // that can act as a staple-half: spliceable AND not already stapled
  // (the stapled-as-staple constraint). Tokens fail isSpliceableStaple's
  // template lookup since they live in TOKENS, not CARDS — handled inside
  // the helper.
  if (filter.spliceable_staple) {
    if (!isSpliceableStaple(card.tplId)) return false;
    // "Already stapled" check — see the field-name note in apply_in_game_splice.
    // In-game cards carry the chain at card.stapledFrom.stapledTpls; the
    // direct card.stapledTpls field is empty (it's a slot-level concept).
    // Reject if either populated form indicates a prior chain.
    const chain = (card.stapledFrom && Array.isArray(card.stapledFrom.stapledTpls))
      ? card.stapledFrom.stapledTpls
      : (Array.isArray(card.stapledTpls) ? card.stapledTpls : []);
    if (chain.length > 0) return false;
  }
  return true;
}
function sameTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'player') return a.who === b.who;
  if (a.kind === 'creature') return a.iid === b.iid;
  if (a.kind === 'permanent') return a.iid === b.iid;
  if (a.kind === 'graveyard_creature') return a.iid === b.iid;
  if (a.kind === 'stack') return a.stackItem === b.stackItem;
  return false;
}

// ----- Low-level state mutators -----

// Reset all in-play state when a card leaves the battlefield. Called from
// death/bounce/shuffle/exile paths.
// preserveDeathState=true keeps damagedBySources and killedBy readable for
// dies-triggers (Sengir, Endomorph). Death paths set true; revival paths false.
function resetInPlayState(card, preserveDeathState) {
  card.tapped = false; card.sick = false; card.damage = 0;
  card.tempPower = 0; card.tempTou = 0;
  card.permPower = 0; card.permTou = 0;
  card.cantAttack = false; card.cantBlock = false;
  if (card.cantAttackBy instanceof Set) card.cantAttackBy.clear();
  if (card.cantBlockBy instanceof Set) card.cantBlockBy.clear();
  // Type-change grants (add_type/set_types) revert on leave-play, so a bounced/
  // recast animated land returns to its base types.
  if (Array.isArray(card.typeGrants) && card.typeGrants.length) card.typeGrants = [];
  if (!preserveDeathState) {
    if (card.damagedBySources instanceof Set) card.damagedBySources.clear();
    card.killedBy = null;
  }
  // Permanent grants (grantedBy) and EOT grants (eotGrants) both push entries
  // into card.keywords. On leave-play both are revoked; re-derive keywords
  // from template + stickers via intrinsicKeywords.
  let needsKwReset = false;
  if (card.grantedBy instanceof Map && card.grantedBy.size > 0) {
    card.grantedBy.clear();
    needsKwReset = true;
  }
  if (Array.isArray(card.eotGrants) && card.eotGrants.length > 0) {
    card.eotGrants = [];
    needsKwReset = true;
  }
  if (needsKwReset) card.keywords = intrinsicKeywords(card);
  card.dealtDeathtouch = false;
  // Re-apply permaBuffs from slot for permanent_eot creatures (Elystra). Buffs
  // accumulate across the game on slot.permaBuffs; the card's modifier was
  // stale from makeCard time. Strip and re-apply with current slot state.
  if (Array.isArray(card.modifiers)) {
    card.modifiers = card.modifiers.filter(m => m.source !== 'permaBuffs');
  }
  const tpl = CARDS[card.tplId];
  if (tpl && tpl.permanent_eot && typeof card.slotIdx === 'number'
      && typeof RUN !== 'undefined' && RUN.getSlots) {
    const slot = RUN.getSlots()[card.slotIdx];
    if (slot && slot.permaBuffs) applyPermaBuffsToCard(card, slot.permaBuffs);
  }
}

function moveToGraveyard(card, controller) {
  const bf = G[controller].battlefield;
  const idx = bf.findIndex(c => c.iid === card.iid);
  if (idx < 0) return;
  bf.splice(idx, 1);
  // Tokens cease to exist on leave-play — they don't go to the graveyard.
  // Non-tokens pile up normally for recursion (Grave Digger) and dies-triggers
  // that scan graveyards. Route to OWNER's graveyard, not current controller —
  // matters when the dying card was stolen (Threaten / Mind Control). For
  // cards that never changed controller, owner === controller and the
  // routing is a no-op. Fallback to controller if owner is unset (defensive
  // for any legacy save or test path that bypassed makePlayer's stamp).
  const dest = card.owner || controller;
  if (!card.isToken) G[dest].graveyard.push(card);
  // Keyword claim: same rule as checkDeaths. moveToGraveyard is called by
  // direct destroy effects (affect_creature destroy, mass destroy) which
  // set killedBy upstream. Skip for self-controller kills (e.g., a future
  // self-sacrifice path invoking moveToGraveyard, though sacrificeCard is
  // the canonical sac path today).
  if (card.killedBy && card.killedBy !== controller) {
    claimKeywordsFromKill(card, card.killedBy);
  }
  // Same flush as checkDeaths — capture permanent_eot buffs before
  // resetInPlayState clears them. Used for direct-destroy paths
  // (affect_creature destroy, mass destroy).
  flushPermanentEotToPermaBuffs(card);
  clearRestrictionsFromSource(card.iid);
  resetInPlayState(card, true);   // preserve damagedBySources for dies-triggers
  // Leaves-play emit covers all leave paths uniformly. Fires for any card
  // type (artifact, land, creature) — useful for future
  // "when this leaves play" mechanics on non-creature permanents. Emitted
  // AFTER cardDies so dies-listeners (Sengir, Endomorph) fire in their
  // original order; leaves-listeners (Archdemon of Bargains) fire after.
  emitLeavesBattlefield(card, controller);
}

// Sacrifice a creature. Mechanically identical to moveToGraveyard (same
// graveyard push, same dies-trigger emit) — the difference is intent: this
// is called when a player CHOOSES to sac a creature (sac costs, edicts).
// Bypasses indestructible (the creature isn't being destroyed). Also bypasses
// hexproof for edicts because no targeting happens — opp picks their own
// creature. The sole behavioral difference is the log message.
function sacrificeCard(card, controller) {
  const bf = G[controller].battlefield;
  const idx = bf.findIndex(c => c.iid === card.iid);
  if (idx < 0) return;
  bf.splice(idx, 1);
  // Owner-routed graveyard — see comment in moveToGraveyard.
  const dest = card.owner || controller;
  if (!card.isToken) G[dest].graveyard.push(card);
  // Keyword claim: same rule as moveToGraveyard. Most sacrifices are
  // self-sacs (a player choosing to sac their own creature for value or
  // to pay a cost) — those have killedBy === controller and skip the claim.
  // Edicts set killedBy to the caster, so they credit correctly.
  if (card.killedBy && card.killedBy !== controller) {
    claimKeywordsFromKill(card, card.killedBy);
  }
  // Flush permanent_eot — symmetric with checkDeaths and moveToGraveyard.
  // Sacrifice-sourced deaths shouldn't lose Elystra's accumulated buffs.
  flushPermanentEotToPermaBuffs(card);
  clearRestrictionsFromSource(card.iid);
  resetInPlayState(card, true);
  log(`${pname(controller)} sacrifices ${card.name}.`, 'dmg');
  emitLeavesBattlefield(card, controller);
}

// Annihilate: like sacrificeCard but the card CEASES TO EXIST — no graveyard
// push, no cardDies / leaves-battlefield emit, so no death/LTB triggers fire.
// Rip's no-trigger removal verb (effects-refactor §4.2 / review OBS 1). Used by
// rip-edict (target(player) → chooses(creature) → annihilate → rip).
function annihilateCard(card, controller) {
  const bf = G[controller].battlefield;
  const idx = bf.findIndex(c => c.iid === card.iid);
  if (idx < 0) return;
  bf.splice(idx, 1);
  clearRestrictionsFromSource(card.iid);
  resetInPlayState(card, true);
  log(`${card.name} is annihilated.`, 'dmg');
  // Deliberately silent: no graveyard, no emit, no triggers.
}

// Apply keyword grant. eot=false → grantedBy (revoked when source leaves
// play); eot=true → eotGrants (revoked at end-of-turn). Multi-source: keyword
// persists while any source still grants it.
function applyGrant(card, kw, sourceIid, eot) {
  if (eot) {
    if (!Array.isArray(card.eotGrants)) card.eotGrants = [];
    card.eotGrants.push(kw);
  } else {
    if (!(card.grantedBy instanceof Map)) card.grantedBy = new Map();
    if (!card.grantedBy.has(kw)) card.grantedBy.set(kw, new Set());
    card.grantedBy.get(kw).add(sourceIid);
  }
  if (!card.keywords.includes(kw)) card.keywords.push(kw);
}

// Apply a type-change grant (the type analogue of applyGrant). op:'add' unions
// tags onto the card's effective type set; op:'set' replaces it. eot=true →
// revoked in the end-of-turn cleanup; eot=false → revoked when the card leaves
// play (resetInPlayState). typesOf reads these live, so every hasType/
// governingType reader sees the change with no per-instance baking. sourceIid
// is recorded for symmetry (one-shot spells pass null — they're not on the
// battlefield to "leave").
function applyTypeGrant(card, tags, op, sourceIid, eot) {
  if (!Array.isArray(card.typeGrants)) card.typeGrants = [];
  card.typeGrants.push({
    tags: (Array.isArray(tags) ? tags : [tags]).filter(Boolean),
    op: op === 'set' ? 'set' : 'add',
    source: (sourceIid != null) ? sourceIid : null,
    eot: !!eot,
  });
}

// Shared resolver for the add_type / set_types effects. `tags` from params.types
// (array) or params.type (string). duration:'permanent' → revoked on leave-play;
// default → until end of turn. Optional power/toughness animate the target. The
// stats MUST share the type grant's lifetime: an eot animate writes the
// EOT-clearing tempPower/tempTou (stats + type revert together at cleanup); a
// PERMANENT animate writes permPower/permTou (which survive end-of-turn and only
// reset on leave-play, like the Creature tag). Using tempP/T for a permanent
// animate was a bug — the type persisted but the stats evaporated at the first
// cleanup, leaving a 0/0 creature that died to SBA. For an animated land already
// in play this is correct — it isn't summoning sick (only creatures are set sick
// at ETB).
function applyTypeChange(ctx, params, target, op) {
  const f = resolveTarget(ctx, target);
  if (!f) return;
  const tags = Array.isArray(params.types) ? params.types : (params.type ? [params.type] : []);
  if (!tags.length) return;
  const eot = params.duration !== 'permanent';
  applyTypeGrant(f.card, tags, op, null, eot);
  const p = params.power || 0, t = params.toughness || 0;
  if (p || t) {
    if (eot) { f.card.tempPower = (f.card.tempPower || 0) + p; f.card.tempTou = (f.card.tempTou || 0) + t; }
    else { f.card.permPower = (f.card.permPower || 0) + p; f.card.permTou = (f.card.permTou || 0) + t; }
  }
  const dur = eot ? ' until end of turn' : '';
  const stats = (p || t) ? ` (${p}/${t})` : '';
  if (op === 'set') log(`${f.card.name} becomes ${tags.join(' ')}${stats}${dur}.`, 'sp');
  else log(`${f.card.name} becomes ${tags.join(' ')} in addition to its other types${stats}${dur}.`, 'sp');
}

// When a card leaves the battlefield, any "until removed" restrictions it
// placed on other creatures clear. Walk every creature on either battlefield
// and remove sourceIid from their restriction sets; if a set goes empty the
// creature is no longer restricted.
function clearRestrictionsFromSource(sourceIid) {
  for (const who of ['you', 'opp']) {
    for (const c of G[who].battlefield) {
      if (c.cantAttackBy instanceof Set && c.cantAttackBy.has(sourceIid)) {
        c.cantAttackBy.delete(sourceIid);
        if (c.cantAttackBy.size === 0) c.cantAttack = false;
      }
      if (c.cantBlockBy instanceof Set && c.cantBlockBy.has(sourceIid)) {
        c.cantBlockBy.delete(sourceIid);
        if (c.cantBlockBy.size === 0) c.cantBlock = false;
      }
      // Type grants tied to this source (aura-style ongoing animators) clear too.
      // One-shot spells pass source:null, so this never touches them.
      if (Array.isArray(c.typeGrants) && c.typeGrants.length) {
        c.typeGrants = c.typeGrants.filter(g => g.source !== sourceIid);
      }
      // Granted keywords: remove this source from each keyword's grant set.
      // If the set empties AND the keyword isn't intrinsic, strip it from
      // the keywords list (e.g., Bindspeaker dies → target loses defender).
      if (c.grantedBy instanceof Map) {
        for (const [kw, sources] of [...c.grantedBy]) {
          if (!sources.has(sourceIid)) continue;
          sources.delete(sourceIid);
          if (sources.size === 0) {
            c.grantedBy.delete(kw);
            if (!intrinsicKeywords(c).includes(kw)) {
              const idx = c.keywords.indexOf(kw);
              if (idx >= 0) c.keywords.splice(idx, 1);
            }
          }
        }
      }
    }
  }
}

function drawCard(who) {
  const p = G[who];
  if (!p.library.length) {
    // Phylactery boon also covers decking out: each card you'd overdraw
    // rips a slot instead of triggering a loss. Multi-card draws (e.g.,
    // "draw 3" with only 1 left in library) call drawCard in a loop —
    // each empty-library iteration independently rips, so a "draw 3" on
    // an empty library rips 3 slots. The hand does NOT receive a card
    // on a phantom-draw — drawing from empty produces nothing.
    //
    // If all slots are eventually ripped (curse out of fuel),
    // hasPhylacteryProtection returns false and the next draw falls
    // through to the standard endGame path — death by exhaustion.
    if (hasPhylacteryProtection(who)) {
      log(`💀 Phylactery: ${p.name} would deck out — the curse rips a slot instead.`, 'dmg');
      ripSlotForPhylactery(who);
      return null;
    }
    log(`${p.name} can't draw — loses!`, 'dmg'); endGame(opp(who)); return null;
  }
  const c = p.library.shift(); p.hand.push(c);
  // build_on_draw hook fires when the card enters hand via drawing. Other
  // hand-entry paths (tutoring, opening-hand placement) call this helper
  // directly. Bouncing/recurring/flickering doesn't count — those are
  // re-entries, and `_builtThisGame` would already be set anyway.
  tryBuildOnDraw(c, who);
  return c;
}

// Open the trigger-build prompt for a build_on_draw card if eligible.
// Centralizes the prompt-setup logic so every "card moves to hand" path
// (drawCard, tutors, opening-hand scan) can call it without duplicating.
// Returns true if the prompt was opened, false if skipped (wrong player,
// not a build_on_draw card, already built this game).
function tryBuildOnDraw(card, who) {
  if (who !== 'you') return false;
  if (!card || card._builtThisGame) return false;
  const tpl = CARDS[card.tplId];
  if (!tpl || !tpl.build_on_draw) return false;
  card._builtThisGame = true;
  // Two-step build: step 1 picks the condition (when), step 2 picks the
  // effect (what), step 3 (only if there's a current ability) chooses
  // between the newly-built trigger and the existing one. The state field
  // tracks step + accumulated picks; legality and dispatch branch on step.
  G.pendingTriggerBuild = {
    who,
    cardIid: card.iid,
    slotIdx: card.slotIdx,
    step: 'condition',
    conditionOptions: generateConditionOptions(),
    chosenCondition: null,
    effectOptions: null,
    chosenEffect: null,
    assembledTrigger: null,
    // Captured at build-start so step 3 can compare new vs existing.
    // Looked up via slot at start time; slot.bonusTrigger may change
    // between build moments, so capture-now-compare-later is correct.
    currentTrigger: null,
  };
  // Snapshot the current trigger if there is one, so step 3 can compare.
  // RUN may not be initialized yet (engine standalone tests, opening-hand
  // scan before RUN setup) — getSlots can also return null when there's
  // no run state. Both nullish cases collapse to "no slot, no current trigger".
  const slots = (typeof RUN !== 'undefined' && RUN.getSlots) ? RUN.getSlots() : null;
  const slot = (slots && typeof card.slotIdx === 'number') ? slots[card.slotIdx] : null;
  if (slot && slot.bonusTrigger) {
    G.pendingTriggerBuild.currentTrigger = slot.bonusTrigger;
  }
  log(`📜 ${card.name} offers a build moment — choose a condition.`, 'sp');
  return true;
}
function endGame(winner) {
  // Flush any pending permanent_eot conversions BEFORE flipping the game-over
  // flag. The normal path is EOT cleanup, which converts tempPower/tempTou
  // and eotGrants into slot.permaBuffs. But endGame can fire mid-turn
  // (lethal attack, lethal Bolt, mill-out) — in which case EOT cleanup
  // never runs, and any spells you cast on Elystra this turn evaporate when
  // the next game starts. The flush makes "Elystra survives the win" robust
  // against any game-end timing.
  for (const who of ['you', 'opp']) {
    for (const c of G[who].battlefield) {
      flushPermanentEotToPermaBuffs(c);
    }
  }
  G.gameOver = true; G.winner = winner;
  log(`${pname(winner)} wins!`, 'imp');
}

// Apply slot.permaBuffs to a card — pushes a power/toughness modifier and
// registers keywords in grantedBy with synthetic iid -1 (immune to
// clearRestrictionsFromSource). Not idempotent for the modifier — caller
// must strip first (resetInPlayState does this).
function applyPermaBuffsToCard(card, permaBuffs) {
  if (!permaBuffs) return;
  // §3.8: symmetricize is now an additive snapshot (no symmetrizedTo sentinel),
  // so permaBuffs (Elystra's accumulated power/tou) just stack normally.
  if ((permaBuffs.power || 0) !== 0 || (permaBuffs.toughness || 0) !== 0) {
    if (!Array.isArray(card.modifiers)) card.modifiers = [];
    card.modifiers.push({
      power: permaBuffs.power || 0,
      toughness: permaBuffs.toughness || 0,
      source: 'permaBuffs',   // marker for the strip-and-reapply path
    });
  }
  if (Array.isArray(permaBuffs.keywords)) {
    if (!(card.grantedBy instanceof Map)) card.grantedBy = new Map();
    for (const kw of permaBuffs.keywords) {
      if (!card.keywords.includes(kw)) card.keywords.push(kw);
      if (!card.grantedBy.has(kw)) card.grantedBy.set(kw, new Set());
      card.grantedBy.get(kw).add(-1);
    }
  }
}

// Flush a permanent_eot creature's (Elystra) temp buffs and EOT grants into
// slot.permaBuffs. Idempotent. Caller resets temp values after.
function flushPermanentEotToPermaBuffs(card) {
  const tpl = CARDS[card.tplId];
  if (!tpl || !tpl.permanent_eot) return;
  if (typeof card.slotIdx !== 'number') return;
  const slot = (typeof RUN !== 'undefined' && RUN.getSlots) ? RUN.getSlots()[card.slotIdx] : null;
  if (!slot) return;
  if (!slot.permaBuffs) slot.permaBuffs = {power: 0, toughness: 0, keywords: []};
  slot.permaBuffs.power += (card.tempPower || 0);
  slot.permaBuffs.toughness += (card.tempTou || 0);
  if (Array.isArray(card.eotGrants)) {
    for (const kw of card.eotGrants) {
      if (!slot.permaBuffs.keywords.includes(kw)) {
        slot.permaBuffs.keywords.push(kw);
      }
    }
  }
  // Also promote to in-game perm state so the creature keeps buffs this turn.
  card.permPower = (card.permPower || 0) + (card.tempPower || 0);
  card.permTou = (card.permTou || 0) + (card.tempTou || 0);
  // EOT grants → grantedBy with synthetic source iid -1, which
  // clearRestrictionsFromSource never matches, so grants survive the rebuild.
  if (Array.isArray(card.eotGrants)) {
    if (!(card.grantedBy instanceof Map)) card.grantedBy = new Map();
    for (const kw of card.eotGrants) {
      if (!card.grantedBy.has(kw)) card.grantedBy.set(kw, new Set());
      card.grantedBy.get(kw).add(-1);
    }
  }
}

// Card leaves play, persistent buffs survive on the slot. Used by bounce,
// exile, flicker. Order matters: flush BEFORE resetInPlayState.
function leavesPlayPreservingBuffs(card) {
  flushPermanentEotToPermaBuffs(card);
  clearRestrictionsFromSource(card.iid);
  resetInPlayState(card);
}

// Emit cardLeavesBattlefield — unified event covering ALL leave-play paths:
// death (moveToGraveyard, sacrificeCard, checkDeaths), bounce, exile,
// shuffleIntoLibrary. Lets cards like Archdemon of Bargains
// use a single 'thisLeaves' trigger instead of needing one trigger per
// removal type. Caller passes the card and its controller-at-leave-time;
// downstream trigger handlers reading ctx.event.card see the card object
// in the same state it left play (slotIdx intact, bargainsNum intact, etc).
//
// For creatures that fire BOTH this AND cardDies (on death), the leaves
// event emits FIRST (before resetInPlayState/dies-emit). Cards that want
// only one of the two should declare exactly one trigger.
function emitLeavesBattlefield(card, controller, destZone, extraSources) {
  if (!card) return;
  // Tokens leaving play still emit — a future "when this token leaves
  // play" mechanic might want it. Costs nothing if no trigger listens.
  // Unified zone-change mirror. destZone defaults to 'graveyard' (the death
  // path — the most common caller); bounce/exile/shuffle/steal callers pass
  // their actual destination so composable card_moves(battlefield, X) triggers
  // distinguish dies from bounce. Explicit (not zone-detected) because a dead
  // token never reaches the graveyard array, so post-move detection would
  // mis-tag it. extraSources defaults to the single leaving card, but the
  // simultaneous-death batch path (checkDeaths) passes the whole `dying` set
  // so a migrated thisKillsCreature (card_damaged_by_this) fires on creatures
  // that died in the same SBA sweep — parity with the legacy cardDies emit,
  // which passes the same batch.
  emitZoneChange(card, controller, 'battlefield', destZone || 'graveyard',
                 extraSources || [{card, controller}]);
}

// Credit killer with the dying creature's keywords (runtime grants included).
// Skips 'defender' (never offered as sticker reward).
function claimKeywordsFromKill(card, killer) {
  if (!card || !hasType(card, 'Creature')) return;
  if (!killer || !G[killer]) return;
  if (!(G[killer].claimedKeywords instanceof Set)) {
    G[killer].claimedKeywords = new Set();
  }
  for (const kw of (card.keywords || [])) {
    if (kw === 'defender') continue;
    G[killer].claimedKeywords.add(kw);
  }
}

function checkDeaths() {
  // Loop SBAs until stable. A single pass isn't enough: when a buff source
  // (Elder of the Grove, Goblin Chieftain, etc.) dies, creatures that were
  // alive only thanks to its +X/+X buff are now lethal. MtG calls this
  // "state-based actions are checked repeatedly until none apply." The loop
  // is bounded — each iteration must remove ≥1 creature, so it terminates
  // in O(creatures on bf) iterations.
  while (true) {
    const dying = [];
    for (const who of ['you','opp']) {
      const bf = G[who].battlefield;
      for (let i = bf.length - 1; i >= 0; i--) {
        const c = bf[i];
        if (!hasType(c, 'Creature')) continue;
        const [, t] = getStats(c);
        const lethalDamage = (c.damage >= t) || (t <= 0) || c.dealtDeathtouch;
        if (!lethalDamage) continue;
        if (c.keywords.includes('indestructible')) {
          // F2: indestructible only skips the death check — it does NOT heal.
          // Keep the marked damage (and the deathtouch flag): if indestructible
          // is removed later this turn, the still-lethal damage kills it at the
          // next SBA (MTG-correct). Both clear at end of turn with everything else.
          continue;
        }
        bf.splice(i, 1);
        const dest = c.owner || who;
        if (!c.isToken) G[dest].graveyard.push(c);
        if (c.killedBy && c.killedBy !== who) {
          claimKeywordsFromKill(c, c.killedBy);
        }
        // Flush Elystra-style EOT buffs BEFORE resetInPlayState wipes them.
        flushPermanentEotToPermaBuffs(c);
        clearRestrictionsFromSource(c.iid);
        resetInPlayState(c, true);   // preserve damagedBySources for dies-triggers
        log(`${c.name} dies.`, 'dmg');
        dying.push({card: c, controller: who});
      }
    }
    if (dying.length === 0) break;
    // Leaves-play emit for each dying card, in the same batch order. Fires
    // after all cardDies emits so the standard dies-listener queue stays
    // consistent with prior versions.
    for (const entry of dying) {
      emitLeavesBattlefield(entry.card, entry.controller, 'graveyard', dying);
    }
    // Loop — buff sources just died, surviving creatures may now be lethal.
  }
}
function checkLifeTotals() {
  if (G.gameOver) return;
  // Phylactery boon: if 'you' is at or below 0 life but still has a Phylactery
  // slot in runState, the curse keeps you alive. Death is deferred until the
  // last Phylactery slot has been ripped (see damagePlayer + ripSlotForPhylactery).
  if (G.you.life <= 0 && !hasPhylacteryProtection('you')) endGame('opp');
  else if (G.opp.life <= 0) endGame('you');
}

// Phylactery boon predicate. True iff `who` is the player AND runState has
// at least one un-ripped Phylactery slot. Phylactery is special:true so opp
// can never have it; this defensively returns false for opp regardless.
function hasPhylacteryProtection(who) {
  if (who !== 'you') return false;
  if (typeof RUN === 'undefined' || !RUN.getSlots) return false;
  const slots = RUN.getSlots();
  if (!slots) return false;
  return slots.some(s => s && s.tplId === 'phylactery');
}

// Rip ONE slot from runState as Phylactery's curse-payment. Picks random
// non-Phylactery slot; rips Phylactery itself only when it's the last slot.
// Removes the in-game card instance from whatever zone holds it, then
// decrements slotIdx for cards pointing past the deletion so references
// stay valid. Silent — doesn't fire cardDies (avoids Sengir/Endomorph
// triggers from self-rip). Returns true if ripped, false if no slots left.
function ripSlotForPhylactery(who) {
  if (who !== 'you') return false;
  if (typeof RUN === 'undefined' || !RUN.getSlots || !RUN.removeSlotByIdx) return false;
  const slots = RUN.getSlots();
  if (!slots || slots.length === 0) return false;
  // Pool of candidates: non-Phylactery slots first.
  const nonPhyl = [];
  const phyl = [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].tplId === 'phylactery') phyl.push(i);
    else nonPhyl.push(i);
  }
  const pool = nonPhyl.length > 0 ? nonPhyl : phyl;
  if (pool.length === 0) return false;
  const ripIdx = pool[Math.floor(Math.random() * pool.length)];
  const ripped = RUN.removeSlotByIdx(ripIdx);
  if (!ripped) return false;
  // Remove the in-game card instance (if any) from whatever zone it's in.
  // Then decrement slotIdx for cards pointing past the deleted slot index
  // so subsequent slot-based lookups still resolve correctly.
  const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile'];
  let removedCardName = ripped.tplId;
  // Find and remove the in-game instance.
  for (const zoneName of zones) {
    const zone = G[who][zoneName];
    if (!zone) continue;
    const idx = zone.findIndex(c => c.slotIdx === ripIdx);
    if (idx >= 0) {
      const [c] = zone.splice(idx, 1);
      removedCardName = c.name || c.tplId;
      // If it was on the battlefield, also clear any restrictions it was
      // granting to other creatures (mirrors moveToGraveyard's cleanup).
      if (zoneName === 'battlefield') {
        clearRestrictionsFromSource(c.iid);
      }
      break;
    }
  }
  // Decrement slotIdx for in-game cards pointing past the removed slot.
  for (const zoneName of zones) {
    const zone = G[who][zoneName];
    if (!zone) continue;
    for (const c of zone) {
      if (typeof c.slotIdx === 'number' && c.slotIdx > ripIdx) {
        c.slotIdx -= 1;
      }
    }
  }
  log(`💀 Phylactery rips ${removedCardName} from your deck — gone forever.`, 'dmg');
  return true;
}

// Rip a slot from `who`'s deck. Phylactery (random rip) and Elystra (rip
// targeter). `you` removes from runState (durable); `opp` only in-game (no
// run-persistent slot list). Silent: does NOT fire cardDies.
function ripSlotByIdx(who, ripIdx, logPrefix) {
  if (typeof ripIdx !== 'number') return false;
  let removedCardName = null;
  if (who === 'you') {
    if (typeof RUN === 'undefined' || !RUN.removeSlotByIdx) return false;
    const ripped = RUN.removeSlotByIdx(ripIdx);
    if (!ripped) return false;
    removedCardName = ripped.tplId;
  }
  const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile'];
  for (const zoneName of zones) {
    const zone = G[who][zoneName];
    if (!zone) continue;
    const idx = zone.findIndex(c => c.slotIdx === ripIdx);
    if (idx >= 0) {
      const [c] = zone.splice(idx, 1);
      removedCardName = c.name || c.tplId;
      if (zoneName === 'battlefield') clearRestrictionsFromSource(c.iid);
      break;
    }
  }
  for (const zoneName of zones) {
    const zone = G[who][zoneName];
    if (!zone) continue;
    for (const c of zone) {
      if (typeof c.slotIdx === 'number' && c.slotIdx > ripIdx) {
        c.slotIdx -= 1;
      }
    }
  }
  const deckLabel = who === 'you' ? 'your deck' : "opponent's deck";
  const duration = who === 'you' ? 'gone forever' : 'gone for the rest of this fight';
  log(`${logPrefix || '✂'} ${removedCardName || 'card'} ripped from ${deckLabel} — ${duration}.`, 'dmg');
  return true;
}

// Damage to a player. With Phylactery: life floors at 0; overflow rips slots.
// Without: life can go negative; checkLifeTotals triggers loss at ≤0.
// Floor-at-0 keeps life-gain intuitive (gaining 3 from 0 → 3, not -X+3).
function damagePlayer(who, amount, sourceName) {
  if (amount <= 0) return;
  const lifeBefore = G[who].life;
  const lifeAbsorb = Math.max(0, lifeBefore);
  log(`${sourceName || 'damage'} deals ${amount} to ${pname(who)}.`, 'dmg');
  if (hasPhylacteryProtection(who)) {
    G[who].life = Math.max(0, lifeBefore - amount);
    const overflow = Math.max(0, amount - lifeAbsorb);
    for (let i = 0; i < overflow; i++) {
      const ok = ripSlotForPhylactery(who);
      if (!ok) break;   // out of slots; player will die on next checkLifeTotals
    }
  } else {
    G[who].life -= amount;
  }
  // Track ACTUAL life lost this turn (post-Phylactery). Bloodlust triggers
  // need damage that reached life total — fully-absorbed damage doesn't count.
  const lifeLost = lifeBefore - G[who].life;
  if (lifeLost > 0) {
    G[who].lifeLostThisTurn = (G[who].lifeLostThisTurn || 0) + lifeLost;
    // D4: damage IS life loss — fire the directional life_changed(delta<0) so
    // "whenever you lose life" (is_life_loss) triggers fire from burn/combat,
    // not only from gain_life(negative)/drain. (is_life_gain needs delta>0, so
    // a negative delta can't mis-fire it.)
    emit({type: 'life_changed', who, delta: -lifeLost});
  }
}
function afterEffectsApplied() { checkDeaths(); checkLifeTotals(); }

// =========================================================================
// Priority-round primitives. MtG-style: holders take turns acting/passing;
// adding to stack hands priority to the non-caster and resets passes; when
// both have passed since last stack change, top of stack resolves (or, if
// stack empty, round closes and phase advances).
// =========================================================================
function openPriorityRound(initialHolder) {
  G.priority = { passes: new Set() };
  G.priorityHolder = initialHolder || G.activePlayer;
  // Drain pending triggers onto the stack before priority is exercised
  // (active player first); pushTriggerOnStack resets priorityHolder.
  drainTriggers();
}
function isPriorityOpen() { return G.priority !== null; }
function closePriorityRound() {
  G.priority = null;
  G.priorityHolder = null;
}
function passPriority(who) {
  if (!isPriorityOpen() || G.priorityHolder !== who) return;
  G.priority.passes.add(who);
  if (G.priority.passes.size === 2) {
    // Both players have passed since the last stack change.
    if (G.stack.length > 0) {
      // Resolve top of stack, then reset passes; priority returns to active player.
      resolveTopOfStack();
      if (G.gameOver) return;
      if (isPriorityOpen()) {
        G.priority.passes.clear();
        G.priorityHolder = G.activePlayer;
        // Drain triggers that fired during resolution. They go on top of the
        // stack and reset the pass tracker / priority holder via push.
        drainTriggers();
      }
    } else {
      // Stack just emptied: reset chain depth (we're done with that pile).
      G.triggerChainDepth = 0;
      // Empty stack: drain any pending triggers; if there are now items on
      // the stack, the round stays open. Otherwise close and advance.
      drainTriggers();
      if (G.stack.length > 0) {
        G.priority.passes.clear();
        G.priorityHolder = G.activePlayer;
      } else {
        closePriorityRound();
        advancePhaseAfterPriority();
      }
    }
  } else {
    // One player has passed; the other now holds priority.
    G.priorityHolder = opp(who);
  }
}
// Set the current phase, emptying both mana pools on an actual change — MTG
// 106.4: unused mana empties as each step/phase ends (DIVERGENCE B2). Every
// phase progression routes through here; direct `G.phase = …` (test setup)
// intentionally bypasses it, so a pre-loaded pool survives until real play
// advances a phase.
function setPhase(p) {
  if (G.phase !== p) {
    G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  }
  G.phase = p;
}

function advancePhaseAfterPriority() {
  // Called when a priority round closes naturally (both passed, empty stack).
  // End-of-step death check: in MtG, state-based actions check continuously,
  // but at minimum they fire whenever a player would receive priority. This
  // is the equivalent point — both have just passed and we're about to move
  // to the next step.
  afterEffectsApplied();
  if (G.gameOver) return;
  switch (G.phase) {
    case 'MAIN1':
      setPhase('COMBAT_ATTACK');
      break;
    case 'COMBAT_ATTACK':
      setPhase((G.attackers.length > 0) ? 'COMBAT_BLOCK' : 'MAIN2');
      break;
    case 'COMBAT_BLOCK':
      setPhase('COMBAT_DAMAGE');
      break;
    case 'MAIN2':
      setPhase('END');
      break;
    case 'END':
      setPhase('CLEANUP');
      break;
  }
}

function pushOnStack(item) {
  G.stack.push(item);
  // pushOnStack is only reached from doCastSpell, which is gated by
  // isLegalAction → isInstantWindow / isSorceryWindow — both of which
  // require a priority round to already be open. So we can rely on it.
  G.priority.passes.clear();
  G.priorityHolder = opp(item.controller);
  if (item.card) {
    emit({type: 'spell_cast', subject_iid: item.card.iid, subject_card: item.card, controller: item.controller});
    // Drain any spellCast-triggered abilities NOW so they go on the stack
    // ABOVE the spell that just caused them. MtG rule: triggers from casting
    // a spell go on the stack on top of that spell, resolving first. Without
    // this drain, the triggers would sit in pendingTriggers and only land on
    // the stack AFTER the spell resolves — wrong order, wrong semantics.
    // Example: Soulblade Captain's "+1/+0 EOT to your creatures when you
    // cast a spell" should pump your creatures BEFORE Beast's Fury resolves,
    // so the fight uses the buffed power. Without immediate drain, the buff
    // applies AFTER the fight, missing the window entirely.
    drainTriggers();
  }
}

function resolveTopOfStack() {
  if (!G.stack.length) return;
  const item = G.stack.pop();
  // Triggered abilities use a different shape — handle them separately.
  if (item.kind === 'trigger') {
    resolveTrigger(item);
    return;
  }
  const card = item.card;
  log(`Resolving ${card.name}.`, 'sp');
  if (hasType(card, 'Creature') || hasType(card, 'Artifact')) {
    // Creatures enter sick (with intrinsic haste overriding). Artifacts
    // don't get sick (they can activate the turn they come down) — there's
    // no "summoning sick" concept for non-creature permanents in MtG, and
    // canActivate's sick check is gated on type === 'Creature' upstream
    // anyway, but set sick=false defensively so any future "sick if
    // creature" code paths see a clean value.
    card.sick = hasType(card, 'Creature');
    G[item.controller].battlefield.push(card);
    log(`${card.name} enters the battlefield.`, 'sp');
    emitZoneChange(card, item.controller, 'stack', 'battlefield');
  } else {
    const ctx = { controller: item.controller, sourceName: card.name, sourceIid: card.iid, sourceCard: card };
    // Snapshot the spell's target BEFORE any effect runs. Multi-effect spells
    // like decomposed Swords ([exile, gain_life]) need the second effect to
    // read the target's pre-resolution power/controller, even though the
    // first effect already removed the card. This implements MtG's "last
    // known information" semantics.
    const sharedTarget = item.targets ? item.targets[0] : null;
    const sharedSnap = sharedTarget ? snapshotTarget(sharedTarget) : null;
    // Pick effects by mode. For non-modal cards, this returns the flat
    // effect list. For modal cards, returns the chosen mode's effects.
    const activeEffects = effectsForMode(card, item.modeIdx);
    // Snapshot rip-on-target eligibility BEFORE effects fire. The targets
    // need to be checked while they're still on the battlefield — if the
    // spell kills Elystra (e.g., a player who chose to Doom Blade their own
    // Elystra, or opp's Doom Blade resolving on her), she'll be in the
    // graveyard by the time the post-effect rip check runs, and findCard
    // wouldn't see her. By capturing eligibility now, we correctly rip the
    // spell even if its own effect removed Elystra from play.
    //
    // Both controllers can trigger rip: player's spells get ripped from
    // runState (durable, run-persistent); opp's spells get pulled from
    // their in-game zones (gone for the rest of this fight, defends
    // against future recursion effects). ripSlotByIdx handles both modes.
    const ripEligible = (Array.isArray(item.targets) && typeof card.slotIdx === 'number') &&
      item.targets.some(t => {
        if (!t || t.kind !== 'creature' || typeof t.iid !== 'number') return false;
        const f = findCard(t.iid);
        if (!f) return false;
        const targetTpl = CARDS[f.card.tplId];
        return targetTpl && targetTpl.rip_on_target;
      });
    // Multi-target dispatch: by default, all targeted effects share
    // item.targets[0] (legacy semantics for Swords, Strength of the Pack,
    // etc.). Effects that opt into a distinct target via `target_slot: N`
    // pull from item.targets[N]. Snapshots are computed per slot lazily
    // so each unique slot only snapshots once.
    const getTargetForSlot = makeSlotTargetGetter(Array.isArray(item.targets) ? item.targets : []);
    // New targeting model (§3.5): a top-level `target` step on the card means
    // the spell collected one target (item.targets[0]); bare effects operate
    // on it by default. `chooses()` REPLACES the operative target with the
    // targeted player's pick. `currentTarget` threads this through the loop.
    // Inert for legacy cards (none set card.target) — they use the per-effect
    // `eff.target`/`target_slot` branch below, unchanged.
    const hasTargetStep = !!card.target;
    let curTgt = null, curSnap = null;
    if (hasTargetStep) { const f0 = getTargetForSlot(0); curTgt = f0.tgt; curSnap = f0.snap; }
    for (const eff of activeEffects) {
      let tgt = null;
      let snap = null;
      if (eff.kind === 'chooses') {
        // Human-facing selection (GAP 2): when the player forced to choose is
        // the human, pause and prompt instead of auto-picking. Stash the
        // chosen-dependent trailing effects (sacrifice/annihilate/rip); they
        // replay in doEdictChoice once the human picks. The AI path falls
        // through to the handler's auto-pick (selfplay/tests unchanged).
        const chooser = (curTgt && curTgt.kind === 'player') ? curTgt.who : opp(ctx.controller);
        const choosesFilter = eff.filter || 'creature';
        if (chooser === 'you') {
          const pool = choosesEligiblePool(chooser, choosesFilter);
          if (pool.length > 0) {
            const idx = activeEffects.indexOf(eff);
            G.pendingEdictChoice = {
              who: chooser,
              source: ctx.sourceName,
              sourceIid: ctx.sourceIid,
              controller: ctx.controller,
              filter: choosesFilter,
              pool: pool.map(c => choosesDescriptor(c, chooser)),
              trailingEffects: activeEffects.slice(idx + 1).map(e => ({ ...e })),
            };
            const noun = choosesFilter === 'permanent' ? 'permanent' : 'creature';
            log(`${ctx.sourceName}: ${pname(chooser)} must choose a ${noun} to lose.`, 'sp');
            break; // defer; spell still moves to graveyard. doEdictChoice resumes.
          }
          // empty pool → fall through to the handler (logs "no creature to choose").
        }
        // Reads the established player (curTgt) and records ctx.chosen; the
        // chosen permanent becomes the operative target for the next effect.
        applyEffect(ctx, eff, curTgt, curSnap);
        if (ctx.chosen) { curTgt = ctx.chosen; curSnap = snapshotTarget(ctx.chosen); }
        continue;
      }
      if (eff.scope === 'self') {
        // Mirror the trigger resolver's branching: self resolves to the
        // SOURCE CREATURE for creature-operating effects, and to the
        // SOURCE'S CONTROLLER (a player target) for player-operating
        // effects (damage, gain_life, draw, discard, add_mana). Without
        // this branch, a spell like Final Strike — "destroy creature,
        // you lose 2 life" — would route the damage to itself (the
        // sorcery card) instead of to the player, fizzling because the
        // sorcery isn't on the battlefield. Bug observed v0.99.29.
        if (effectOperatesOnCreature(eff)) {
          tgt = {kind:'creature', iid: card.iid, label: card.name};
          snap = snapshotTarget(tgt);
        } else {
          tgt = {kind:'player', who: item.controller};
          snap = tgt;
        }
      } else if (effectNeedsTarget(eff)) {
        const slot = eff.target_slot || 0;
        const fetched = getTargetForSlot(slot);
        tgt = fetched.tgt;
        snap = fetched.snap;
      } else if (hasTargetStep && eff.scope == null) {
        // Bare effect after a target() step → operate on the established/chosen target.
        tgt = curTgt;
        snap = curSnap;
      }
      applyEffect(ctx, eff, tgt, snap);
    }
    ctx.chosen = null;
    // Rip-on-target check (Elystra). Uses the eligibility snapshot taken
    // before effects fired — see comment above the snapshot for why we
    // can't re-check here (Elystra may have just died from this very
    // spell). Triggered AFTER effects so buff-then-rip semantics work:
    // the buff applies, THEN the spell vanishes from the deck.
    // Counterspelled spells never reach this code (they're removed from
    // the stack before resolution), so countering a buff-on-Elystra
    // preserves the spell.
    if (ripEligible) {
      // Push card to graveyard first so the rip-up sweep finds and removes
      // it (otherwise the spell card is in limbo). The rip helper then
      // discards that pile entry along with the slot.
      G[item.controller].graveyard.push(card);
      ripSlotByIdx(item.controller, card.slotIdx, `Elystra binds ${card.name}`);
      afterEffectsApplied();
      return;
    }
    G[item.controller].graveyard.push(card);
  }
  afterEffectsApplied();
}

// ----- Combat damage -----
function resolveCombatDamage() {
  if (!G.attackers.length) return;
  const defender = opp(G.activePlayer);
  // Block assignments are fixed at block-declaration time and persist
  // across both strike steps.
  const blocked = {};
  for (const [bIid, aIid] of G.blockers) {
    if (!blocked[aIid]) blocked[aIid] = [];
    blocked[aIid].push(bIid);
  }
  // Determine if we need a first-strike step. We do if any creature
  // involved in combat has first strike.
  const allCombatants = [];
  for (const aIid of G.attackers) {
    const fa = findCard(aIid); if (fa) allCombatants.push(fa.card);
  }
  for (const [bIid] of G.blockers) {
    const fb = findCard(bIid); if (fb) allCombatants.push(fb.card);
  }
  const hasFirstStrike = allCombatants.some(c => c.keywords.includes('first_strike'));

  if (hasFirstStrike) {
    // First-strike step: only first-strikers deal damage.
    dealCombatDamage(blocked, defender, c => c.keywords.includes('first_strike'));
    afterEffectsApplied();
    if (G.gameOver) return;
    // Normal step: anyone still alive that DOESN'T have first strike.
    dealCombatDamage(blocked, defender, c => !c.keywords.includes('first_strike'));
  } else {
    // No first strike — single pass, all combatants.
    dealCombatDamage(blocked, defender, () => true);
  }
  afterEffectsApplied();
}

// Apply combat damage for one strike step. `dealsDamage(card)` decides which
// creatures actually deal damage in this step (the others still take damage
// from those that do, if alive). Block assignments come in via `blocked`.
function dealCombatDamage(blocked, defender, dealsDamage) {
  const applyLifelink = (source, srcCtrl, amt) => {
    if (!source.keywords.includes('lifelink') || amt <= 0) return;
    G[srcCtrl].life += amt;
    log(`${source.name} (lifelink) — ${pname(srcCtrl)} gains ${amt} life.`, 'sp');
    // Combat lifelink fires lifeGained, just like spell-source lifelink and
    // the gain_life effect. Without this, Ajani's Pridemate wouldn't trigger
    // from a lifelink attacker — combat damage uses a different code path
    // than applyDamageFrom (which handles spell damage).
    emit({type: 'life_changed', who: srcCtrl, delta: amt});
  };
  G.attackers.forEach(aIid => {
    const fa = findCard(aIid); if (!fa) return;
    const atk = fa.card;
    const atkCtrl = fa.controller;
    const [aPow] = getStats(atk);
    const wasBlocked = !!blocked[aIid];
    const livingBlockers = (blocked[aIid] || []).map(b => findCard(b)).filter(Boolean);
    const atkDeals = dealsDamage(atk);

    if (!wasBlocked) {
      if (atkDeals && aPow > 0) {
        damagePlayer(defender, aPow, atk.name);
        applyLifelink(atk, atkCtrl, aPow);
      }
      return;
    }
    if (livingBlockers.length === 0) {
      if (atkDeals && atk.keywords.includes('trample') && aPow > 0) {
        damagePlayer(defender, aPow, `${atk.name} (trample)`);
        applyLifelink(atk, atkCtrl, aPow);
      }
      return;
    }
    // Multi-blocker damage assignment (attacker chooses order in MtG; we
    // approximate optimal): kill most valuable first using lethal_needed per
    // blocker (1 for deathtouch). Indestructibles can't be killed but still
    // need lethal-equivalent damage to enable trample carryover.
    const atkDeathtouch = atk.keywords.includes('deathtouch');
    // Indestructibles sort LAST — their kill-value bonus would otherwise
    // pull them ahead of killable blockers and waste damage on them.
    const ordered = livingBlockers.slice().sort((a, b) => {
      const aInd = a.card.keywords.includes('indestructible');
      const bInd = b.card.keywords.includes('indestructible');
      if (aInd !== bInd) return aInd ? 1 : -1;   // killables first
      return getCardValue(b.card, 'kill') - getCardValue(a.card, 'kill');
    });
    let remaining = atkDeals ? aPow : 0;
    let attackerDamage = 0;
    const unsatisfied = [];
    // Log actual damage in each direction (pre-v0.99.4 logged "X fights Y"
    // even on zero-damage cases — looked like a bug).
    for (const fb of ordered) {
      const blk = fb.card;
      const blkCtrl = fb.controller;
      const [bPow, bTou] = getStats(blk);
      const indestructible = blk.keywords.includes('indestructible');
      // Lethal-equivalent. Deathtouch reduces to 1 ONLY against killable
      // blockers (deathtouch can't kill indestructibles, so they need full
      // remaining toughness to satisfy the trample requirement).
      const lethalNeeded = (atkDeathtouch && !indestructible)
        ? Math.min(1, Math.max(0, bTou - blk.damage))
        : Math.max(0, bTou - blk.damage);
      let dmgToBlk = 0;
      // Try to satisfy lethal damage. Indestructibles take damage marked
      // (which doesn't kill them) but counts toward enabling trample.
      if (atkDeals && remaining >= lethalNeeded && lethalNeeded > 0) {
        blk.damage += lethalNeeded;
        dmgToBlk = lethalNeeded;
        if (atkDeathtouch && !indestructible) blk.dealtDeathtouch = true;
        if (!(blk.damagedBySources instanceof Set)) blk.damagedBySources = new Set();
        blk.damagedBySources.add(atk.iid);
        // Tag the killer for keyword-claim attribution. Last-writer-wins —
        // see card init comment. Unconditional on the damage event, since
        // we want even non-lethal damage to "stake the claim" if the
        // creature ends up dying later in combat.
        blk.killedBy = atkCtrl;
        applyLifelink(atk, atkCtrl, lethalNeeded);
        remaining -= lethalNeeded;
      } else {
        unsatisfied.push(fb);
      }
      // Blocker deals back regardless (damage is simultaneous in MtG; the
      // kill resolves at SBA after the strike step).
      let dmgToAtk = 0;
      if (dealsDamage(blk) && bPow > 0) {
        attackerDamage += bPow;
        dmgToAtk = bPow;
        if (blk.keywords.includes('deathtouch')) atk.dealtDeathtouch = true;
        if (!(atk.damagedBySources instanceof Set)) atk.damagedBySources = new Set();
        atk.damagedBySources.add(blk.iid);
        // Tag the attacker as killed by blocker's controller (mirror of
        // blocker tagging above). If the attacker dies, the blocker's
        // controller gets the keyword-claim credit.
        atk.killedBy = blkCtrl;
        applyLifelink(blk, blkCtrl, bPow);
      }
      // Honest log: show the actual exchange. "X (2) fights Y (3)" reads
      // as "X dealt 2 to Y, Y dealt 3 to X". Zero is explicit so the player
      // can tell when a blocker absorbed nothing.
      log(`${atk.name} (${dmgToAtk}) fights ${blk.name} (${dmgToBlk}).`, 'cb');
    }
    // Leftover damage:
    //   - All blockers satisfied + trample → carries to defender
    //   - Any unsatisfied blocker → all leftover dumped on highest-priority
    //     unsatisfied blocker (no trample carryover possible by rules)
    //   - All satisfied + no trample → leftover wasted
    if (atkDeals && remaining > 0) {
      if (unsatisfied.length === 0 && atk.keywords.includes('trample')) {
        damagePlayer(defender, remaining, `${atk.name} (trample)`);
        applyLifelink(atk, atkCtrl, remaining);
      } else if (unsatisfied.length > 0) {
        const dump = unsatisfied[0].card;
        dump.damage += remaining;
        if (!(dump.damagedBySources instanceof Set)) dump.damagedBySources = new Set();
        dump.damagedBySources.add(atk.iid);
        // Tag killer for keyword-claim if this damage proves lethal.
        dump.killedBy = atkCtrl;
        applyLifelink(atk, atkCtrl, remaining);
        // Also log the dump so the player sees that the attacker piled
        // leftover damage onto one blocker. Without this, the per-pair
        // logs above would each show "(0)" damage to blocker, hiding the
        // fact that one of them actually took the full leftover.
        log(`${atk.name} piles ${remaining} extra damage onto ${dump.name}.`, 'cb');
      }
    }
    atk.damage += attackerDamage;
  });
}

// =========================================================================
// Action handlers — internal. Each does the mutation for one descriptor.
// They assume the action has been validated by isLegalAction().
// =========================================================================
function doPlayLand(who, cardIid) {
  const p = G[who];
  const idx = p.hand.findIndex(c => c.iid === cardIid);
  const card = p.hand.splice(idx, 1)[0];
  p.battlefield.push(card);
  p.landPlayedThisTurn = true;
  // Record this slot as played-this-game. Used at game-end to filter the
  // sticker reward pool to cards that actually saw use. Token cards have
  // no slotIdx (or a synthetic one not in runState.slots) — guarded.
  if (typeof card.slotIdx === 'number' && p.playedSlotIdxs) {
    p.playedSlotIdxs.add(card.slotIdx);
  }
  log(`${p.name} plays ${card.name}.`);
  emitZoneChange(card, who, 'hand', 'battlefield');
}
function doTapLandForMana(who, cardIid, color, abilityIdx) {
  const f = findCard(cardIid); if (!f) return;
  const card = f.card;
  if (card.tapped) return;
  // §3.9: lands and creature dorks tap through the same mana-ability path.
  // Summoning sickness gates creature dorks only; lands have no sickness.
  if (hasType(card, 'Creature') && card.sick) return;
  let manaAb = null;
  if (typeof abilityIdx === 'number') {
    manaAb = card.abilities && card.abilities[abilityIdx];
    if (!manaAb || !manaAb.effects || !manaAb.effects[0] || manaAb.effects[0].kind !== 'add_mana') return;
  } else {
    manaAb = manaAbilityOf(card);
  }
  if (!manaAb) return;
  card.tapped = true;
  const eff0 = manaAb.effects[0];
  if (eff0.choose) {
    const opts = eff0.choose === 'any' ? COLORS : eff0.choose;
    const chosen = (color && opts.includes(color)) ? color : opts[0];
    G[who].mana[chosen]++;
    log(`${G[who].name} taps ${card.name} for {${chosen}}.`);
  } else {
    const am = eff0.amounts;
    for (const k of Object.keys(am)) G[who].mana[k] += am[k];
    const txt = Object.entries(am).map(([k, n]) => `{${k}}`.repeat(n)).join('');
    log(`${G[who].name} taps ${card.name} for ${txt}.`);
  }
}
function doCastSpell(who, cardIid, targets, modeIdx) {
  const p = G[who];
  const idx = p.hand.findIndex(c => c.iid === cardIid);
  if (idx < 0) {
    console.warn('doCastSpell: card not in hand', cardIid);
    return;
  }
  const card = p.hand[idx];
  payMana(who, effectiveCastCost(card));
  p.hand.splice(idx, 1);
  // Record this slot as played-this-game (see doPlayLand for rationale).
  // Token-cast paths don't go through doCastSpell — tokens enter via
  // create_tokens effects directly — so this naturally only records real
  // deck slots.
  if (typeof card.slotIdx === 'number' && p.playedSlotIdxs) {
    p.playedSlotIdxs.add(card.slotIdx);
  }
  // modeIdx rides along on the stack item so resolution applies the right
  // effect-set. For non-modal cards this is undefined/0, transparent to the
  // existing flow.
  pushOnStack({card, controller: who, targets: targets || [], modeIdx: modeIdx || 0});
  // Modal log message includes the chosen mode label if available, so the
  // log doesn't say just "casts X" for ambiguous modal cards.
  let modeLabel = '';
  if (isModal(card)) {
    const mode_names = card.effects.mode_names || [];
    if (mode_names[modeIdx || 0]) modeLabel = ` (${mode_names[modeIdx || 0]})`;
  }
  // Build the "on X" suffix for the log line. Single-target spells say
  // "casts Bolt on Goblin"; multi-target spells say "casts Branching Bolt
  // on Goblin and Wizard." Limit to comma-joining the labels — readable
  // for 2-3 targets, ugly for many but multi-target cards typically have 2.
  let targetSuffix = '';
  if (Array.isArray(targets) && targets.length > 0 && targets[0]) {
    const labels = targets.filter(t => t && t.label).map(t => t.label);
    if (labels.length === 1) {
      targetSuffix = ' on ' + labels[0];
    } else if (labels.length > 1) {
      targetSuffix = ' on ' + labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
    }
  }
  log(`${p.name} casts ${card.name}${modeLabel}${targetSuffix}.`, who === 'you' ? 'sp' : 'ai');
}
function doActivateAbility(who, cardIid, abilityIdx, targets, sacIid) {
  const f = findCard(cardIid); if (!f) return;
  const card = f.card;
  const ab = card.abilities[abilityIdx];
  // Pay costs.
  if (ab.cost.tap) card.tapped = true;
  if (ab.cost.mana) payMana(who, ab.cost.mana);
  // Sac cost is paid BEFORE the effect resolves. The sacrificed creature
  // dies (firing dies-triggers) before the ability does anything. This
  // matters for self-sac on creatures with dies-triggers — Carrion Feeder
  // sacing itself would resolve the +1/+1 onto a creature that no longer
  // exists, but we just no-op gracefully (scope:'self' resolves null).
  if (ab.cost && ab.cost.sacrifice && sacIid != null) {
    const sacF = findCard(sacIid);
    if (sacF) sacrificeCard(sacF.card, sacF.controller);
  }
  // Mana abilities don't go on the stack; resolve immediately.
  // Other activated abilities also resolve immediately in this prototype
  // (a simplification — real MtG would put them on the stack).
  const ctx = { controller: who, sourceName: card.name, sourceIid: card.iid, sourceCard: card, allTargets: Array.isArray(targets) ? targets : [] };
  // Multi-target dispatch (mirrors resolveTopOfStack/resolveTrigger). By
  // default, targeted effects share targets[0]. Effects can opt into a
  // distinct slot via `target_slot: N`. allTargets is also threaded onto
  // ctx so multi-target effects like apply_in_game_splice (Stapler) can read
  // both inputs directly without relying on inter-effect coordination.
  const getAbilityTargetForSlot = makeSlotTargetGetter(Array.isArray(targets) ? targets : []);
  // New targeting model (§3.5): a top-level `target` step on the ability means
  // it picked one target (targets[0]); bare effects operate on it,
  // chooses() replaces it. Inert for legacy abilities (none set ab.target).
  const abHasTargetStep = !!ab.target;
  let abCurTgt = null, abCurSnap = null;
  if (abHasTargetStep) { const f0 = getAbilityTargetForSlot(0); abCurTgt = f0.tgt; abCurSnap = f0.snap; }
  for (const e of ab.effects) {
    let tgt = null;
    let snap = null;
    if (e.kind === 'chooses') {
      applyEffect(ctx, e, abCurTgt, abCurSnap);
      if (ctx.chosen) { abCurTgt = ctx.chosen; abCurSnap = snapshotTarget(ctx.chosen); }
      continue;
    }
    if (e.scope === 'self') {
      tgt = {kind:'creature', iid: card.iid, label: card.name};
      snap = snapshotTarget(tgt);
    } else if (effectNeedsTarget(e)) {
      const slot = e.target_slot || 0;
      const fetched = getAbilityTargetForSlot(slot);
      tgt = fetched.tgt;
      snap = fetched.snap;
    } else if (abHasTargetStep && e.scope == null) {
      tgt = abCurTgt;
      snap = abCurSnap;
    }
    applyEffect(ctx, e, tgt, snap);
  }
  ctx.chosen = null;
  afterEffectsApplied();
  if (ab.effects[0].kind !== 'add_mana') {
    log(`${G[who].name} activates ${card.name}${targets && targets[0] ? ' on ' + targets[0].label : ''}.`, who === 'you' ? 'sp' : 'ai');
  }
  // Drain any triggers that fired during cost payment or effect resolution.
  // Activated abilities resolve immediately in this engine (a simplification —
  // in real MtG they'd go on the stack, where dies-triggers from sacrifice
  // costs would land on top and resolve first). Without this drain, triggers
  // from the cost (e.g., Old Guardian's dies-trigger when sacrificed to
  // Carrion Feeder) sit in pendingTriggers and only land on the stack after
  // a manual priority pass — making them invisible to the player at the
  // moment of activation. Spells handle this implicitly via pushOnStack;
  // activated abilities need an explicit drain because they bypass the stack.
  // pushTriggerOnStack (called from drainTriggers) resets the priority round
  // and gives opp priority to respond, matching the "ability goes on stack
  // and opp can respond" flow of real MtG.
  drainTriggers();
}
function doDeclareAttackers(who, cardIids) {
  G.attackers = cardIids.slice();
  cardIids.forEach(iid => {
    const f = findCard(iid); if (!f) return;
    if (!f.card.keywords.includes('vigilance')) f.card.tapped = true;
  });
  log(`${G[who].name} attacks with ${cardIids.length} creature(s).`, 'cb');
  G.attackersDeclared = true;
  // Emit "attacks" event for each declared attacker so triggers fire.
  // Done after the tap so triggers see the post-tap state.
  for (const iid of cardIids) {
    const f = findCard(iid); if (!f) continue;
    // Single emission serves both vocabularies: legacy condId triggers read
    // attacker/defender; composable triggers read subject_card/defender_key.
    emit({type: 'attacks', attacker: f.card, controller: who, defender: opp(who),
          subject_iid: f.card.iid, subject_card: f.card, defender_key: opp(who)});
  }
  // Phase advances via priority round (or skip-combat fast-path in step).
}
function doDeclareBlockers(who, blockMap) {
  G.blockers = new Map(blockMap);
  for (const [bIid, aIid] of G.blockers) {
    const fb = findCard(bIid), fa = findCard(aIid);
    if (fb && fa) log(`${fb.card.name} blocks ${fa.card.name}.`, 'cb');
  }
  G.blockersDeclared = true;
  // Phase advances via priority round.
}
function doDiscard(who, cardIid) {
  const p = G[who];
  const idx = p.hand.findIndex(c => c.iid === cardIid);
  const card = p.hand.splice(idx, 1)[0];
  p.graveyard.push(card);
  log(`${p.name} discards ${card.name}.`);
  if (G.forcedDiscard && G.forcedDiscard.who === who) {
    G.forcedDiscard.remaining--;
    // Two paths null the forced-discard prompt: hitting the requested count,
    // OR running out of cards (player can't discard more than they have, so
    // a 5-card forced discard against a 2-card hand resolves after 2). The
    // latter avoids an unresolvable prompt blocking step() forever.
    if (G.forcedDiscard.remaining <= 0 || p.hand.length === 0) {
      G.forcedDiscard = null;
    }
  }
}
function doSearchPick(who, cardIid) {
  if (!G.pendingSearch || G.pendingSearch.who !== who) return;
  const lib = G[who].library;
  const idx = lib.findIndex(c => c.iid === cardIid);
  if (idx < 0) return;
  const card = lib.splice(idx, 1)[0];
  G[who].hand.push(card);
  shuffle(lib);
  log(`${G[who].name} fetches ${card.name}.`, 'sp');
  G.pendingSearch = null;
  // Tutored cards trigger build_on_draw the same as any other hand-entry.
  // The Codex doesn't currently appear in any tutor's filter, but if a
  // future "tutor any card" effect lands, this is where it'd matter.
  tryBuildOnDraw(card, who);
}
function doTriggerTargetPick(who, target) {
  // Player submits a target for the pending trigger prompt. Push the
  // trigger onto the stack with the chosen target, then resume draining
  // any remaining queued triggers.
  if (!G.pendingTriggerTarget || G.pendingTriggerTarget.controller !== who) return;
  const p = G.pendingTriggerTarget;
  // Sanity-validate the target is in the valid list.
  if (!p.valid.some(v => sameTarget(v, target))) return;
  G.pendingTriggerTarget = null;
  // Push trigger onto stack with the chosen target.
  G.stack.push({
    kind: 'trigger',
    trig: p.trig,
    sourceIid: p.sourceIid,
    sourceName: p.sourceName,
    controller: p.controller,
    targets: [target],
  });
  log(`${p.sourceName} triggers: ${p.trig.text || p.trig.event}.`, 'sp');
  if (!G.priority) G.priority = { passes: new Set() };
  G.priority.passes.clear();
  G.priorityHolder = opp(p.controller);
  // Resume draining the remaining queued triggers (if any).
  drainTriggers();
}
// Resume a deferred edict (GAP 2) after the human picks which permanent to
// lose. The chooses() step paused resolution and stashed the chosen-dependent
// trailing effects; replay them now with ctx.chosen set, then drain any death
// triggers (the spell itself already moved to the graveyard at resolution).
// The trailing effects (sacrifice/annihilate/rip) read only ctx.chosen, so a
// minimal ctx is sufficient — no live resolution context is held across the
// pause (matches the plain-data shape of the other pending-choice modals).
function doEdictChoice(who, iid) {
  if (!G.pendingEdictChoice || G.pendingEdictChoice.who !== who) return;
  const p = G.pendingEdictChoice;
  const picked = p.pool.find(c => c.iid === iid);
  if (!picked) return; // out-of-pool — guarded by isLegalAction
  G.pendingEdictChoice = null;
  const ctx = {
    controller: p.controller, sourceName: p.source, sourceIid: p.sourceIid,
    chosen: { kind: picked.kind, iid: picked.iid, label: picked.label,
      slotIdx: picked.slotIdx, controller: who },
  };
  log(`${pname(who)} chooses ${picked.label}.`, 'sp');
  for (const eff of p.trailingEffects) applyEffect(ctx, eff, null, null);
  drainTriggers();
}
function doSymmetricizeChoice(who, which) {
  // Player picks 'power' | 'toughness' | 'cost'; all three become that value.
  // §3.8 additive snapshot: record the deltas needed to reach N *right now* as
  // stat_boost + cost_mod stickers through the normal pipeline (runtime card +
  // persisted slot) — NOT a persistent P=T=cost=N clamp. No symmetrizedTo
  // sentinel; later buffs stack normally.
  if (!G.pendingSymmetricizeChoice || G.pendingSymmetricizeChoice.who !== who) return;
  const p = G.pendingSymmetricizeChoice;
  if (!['power','toughness','cost'].includes(which)) return;
  const n = p.values[which];
  G.pendingSymmetricizeChoice = null;
  log(`${pname(who)} chooses ${which} (${n}) for ${p.targetName} via ${p.source}.`, 'sp');
  const dPow = n - (p.values.power || 0);
  const dTou = n - (p.values.toughness || 0);
  const dCost = n - (p.values.cost || 0);
  const f = findCard(p.targetIid);
  const slotIdx = (p.targetIsYours && typeof p.targetSlotIdx === 'number') ? p.targetSlotIdx : null;
  const apply = (desc) => {
    if (f) applyOneStickerToRuntimeCard(f.card, { ...desc });
    if (slotIdx != null && typeof RUN !== 'undefined' && RUN.applyStickerToSlot) {
      RUN.applyStickerToSlot(slotIdx, { ...desc });
    }
  };
  if (dPow !== 0 || dTou !== 0) apply({ kind: 'stat_boost', power: dPow, toughness: dTou, stackable: true });
  if (dCost !== 0) apply({ kind: 'cost_mod', amount: dCost, stackable: true });
  log(`${p.targetName} becomes ${n}/${n} for {${n}}.`, 'sp');
}
function doNumberChoice(who, number) {
  // Player picks an integer from a fixed range. Validates the prompt
  // belongs to this player and the number is in range; then dispatches
  // to the appropriate continuation handler. Currently only the
  // Archdemon's bargain uses this — onChoose: 'bargainEtb' applies N
  // stickers to the source's controller's permanents and stashes N on
  // the source card for the dies trigger to read.
  if (!G.pendingNumberChoice || G.pendingNumberChoice.who !== who) return;
  const p = G.pendingNumberChoice;
  if (!Number.isInteger(number) || number < p.min || number > p.max) return;
  const sourceIid = p.sourceIid;
  const sourceName = p.source;
  const onChoose = p.onChoose;
  G.pendingNumberChoice = null;
  log(`${pname(who)} chooses ${number} for ${sourceName}.`, 'sp');
  if (onChoose === 'bargainEtb') {
    // Find the source card (Archdemon) to stash the number on it. The
    // dies trigger will read it back at trigger time. Source may be on
    // battlefield, graveyard, etc. — findCard scans all zones.
    const f = findCard(sourceIid);
    if (f) {
      f.card.bargainsNum = number;
      // Apply N stickers to the source's controller's permanents (the
      // boss-side at ETB time).
      applyRandomStickersToSide(G, f.controller, number, sourceName, log);
    }
  }
}
function doTriggerBuildPick(who, choice) {
  // Multi-step build flow:
  //   step 'condition' → choice is index 0..2 of conditionOptions. Save
  //                      the chosen condition, generate compatible effect
  //                      options, advance to step 'effect'.
  //   step 'effect'    → choice is index 0..2 of effectOptions. Save the
  //                      chosen effect, assemble the trigger. If there's
  //                      no currentTrigger, finalize immediately. Else
  //                      advance to step 'compare' for the keep/replace
  //                      decision.
  //   step 'compare'   → choice is 'new' (use built) or 'keep' (keep existing).
  //                      Either way, prompt clears.
  if (!G.pendingTriggerBuild || G.pendingTriggerBuild.who !== who) return;
  const p = G.pendingTriggerBuild;
  if (p.step === 'condition') {
    if (!Number.isInteger(choice) || choice < 0 || choice >= p.conditionOptions.length) return;
    p.chosenCondition = p.conditionOptions[choice];
    p.effectOptions = generateEffectOptions(p.chosenCondition);
    p.step = 'effect';
    log(`📜 Chose condition: when ${p.chosenCondition.text}…`, 'sp');
    return;
  }
  if (p.step === 'effect') {
    if (!Number.isInteger(choice) || choice < 0 || choice >= p.effectOptions.length) return;
    p.chosenEffect = p.effectOptions[choice];
    p.assembledTrigger = assembleTrigger(p.chosenCondition, p.chosenEffect);
    if (p.currentTrigger) {
      // Step 3: compare. Player decides keep vs replace.
      p.step = 'compare';
      log(`📜 New ability built. Compare with current?`, 'sp');
      return;
    }
    // No prior trigger — finalize immediately, skipping step 3.
    finalizeBuild(p, p.assembledTrigger);
    return;
  }
  if (p.step === 'compare') {
    if (choice === 'keep') {
      G.pendingTriggerBuild = null;
      log(`📜 Kept the existing ability.`, 'sp');
      return;
    }
    if (choice === 'new') {
      finalizeBuild(p, p.assembledTrigger);
      return;
    }
    return;
  }
}

// Write the assembled trigger to the slot (durable across the run) and
// apply it live to the in-game card object (so the ability is active for
// the rest of THIS game without waiting for next game's makeCard rebuild).
// Shared by the no-current-trigger fast-path and the compare step.
function finalizeBuild(p, trigger) {
  if (typeof RUN !== 'undefined' && RUN.getSlots && typeof p.slotIdx === 'number') {
    const slot = RUN.getSlots()[p.slotIdx];
    if (slot) {
      slot.bonusTrigger = {
        ...trigger,
        effects: (trigger.effects || []).map(e => ({...e})),
      };
    }
  }
  // Find the live card across all zones — Codex prompt fires on draw,
  // so the card is in hand, not battlefield where findCard searches.
  let liveCard = null;
  for (const w of ['you', 'opp']) {
    for (const zoneName of ['hand', 'battlefield', 'library', 'graveyard', 'exile']) {
      const z = G[w][zoneName];
      if (!z) continue;
      const c = z.find(x => x.iid === p.cardIid);
      if (c) { liveCard = c; break; }
    }
    if (liveCard) break;
  }
  if (liveCard) {
    if (!Array.isArray(liveCard.triggers)) liveCard.triggers = [];
    liveCard.triggers = liveCard.triggers.filter(t => !t.generated);
    liveCard.triggers.push({
      ...trigger,
      effects: (trigger.effects || []).map(e => ({...e})),
    });
  }
  log(`📜 Built ability: ${trigger.text}`, 'sp');
  G.pendingTriggerBuild = null;
}

function doPass(who) {
  // Priority round open: just pass priority. The round handles the meaning.
  if (isPriorityOpen() && G.priorityHolder === who) {
    passPriority(who);
    return;
  }
  // Pre-declaration phases: pass acts as "empty declaration" for that player's
  // pending turn-based action (skip combat, no blocks).
  if (G.phase === 'COMBAT_ATTACK' && who === G.activePlayer && !G.attackersDeclared) {
    doDeclareAttackers(who, []);
    return;
  }
  if (G.phase === 'COMBAT_BLOCK' && who === opp(G.activePlayer) && !G.blockersDeclared) {
    doDeclareBlockers(who, new Map());
    return;
  }
  // Otherwise no-op.
}
function doEndTurn(who) {
  if (who !== G.activePlayer) return;
  // If we're mid-declaration, complete the empty declaration first.
  if (G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared) {
    doDeclareAttackers(who, []);
  }
  // Set the flag — controller will keep auto-passing on player's empty-stack
  // priority until we reach CLEANUP or something appears on the stack.
  G.endTurnPending = true;
}

// ─── Legality ────────────────────────────────────────────────────────

// Paused waiting for a mid-resolution forced action (search/discard/trigger
// target/build prompt). Routes through PENDING_DECISIONS — adding a new
// modal type to that registry automatically extends this check.
function isWaitingForForcedAction() {
  return playerOwesDecision('you');
}
function whoHasPriority(who) {
  if (G.gameOver) return false;
  if (isWaitingForForcedAction()) return false;
  if (isPriorityOpen()) return G.priorityHolder === who;
  if (G.cleanupDiscarding) return who === G.activePlayer;
  // Pre-declaration: only the player making the declaration "has priority"
  // for the purpose of taking actions. (They can also tap mana sources etc.)
  if (G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared) return who === G.activePlayer;
  if (G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared && G.attackers.length > 0) {
    return who === opp(G.activePlayer);
  }
  return false;
}
function isInstantWindow(who) {
  // Casting instants requires holding priority during an open priority round.
  // Pre-declaration phases (waiting on attackers/blockers) don't allow
  // instants — the player must complete the declaration first; the priority
  // round that opens immediately after gives them the interaction window.
  if (G.gameOver) return false;
  if (isWaitingForForcedAction()) return false;
  if (isPriorityOpen()) return G.priorityHolder === who;
  return false;
}
function isSorceryWindow(who) {
  // Sorcery speed: active player's main phase, empty stack, no priority round
  // currently open with stack items pending (an open round on empty stack is
  // fine — that's normal main-phase priority).
  if (G.gameOver) return false;
  if (isWaitingForForcedAction()) return false;
  if (who !== G.activePlayer) return false;
  if (G.phase !== 'MAIN1' && G.phase !== 'MAIN2') return false;
  if (G.stack.length > 0) return false;
  if (G.cleanupDiscarding) return false;
  // Must hold priority during a main phase — otherwise we're between rounds.
  if (!isPriorityOpen() || G.priorityHolder !== who) return false;
  return true;
}

function isLegalAction(who, action) {
  if (G.gameOver) return false;
  switch (action.type) {
    case 'playLand': {
      const card = G[who].hand.find(c => c.iid === action.cardIid);
      if (!card || !hasType(card, 'Land')) return false;
      if (G.activePlayer !== who) return false;
      if (G.phase !== 'MAIN1' && G.phase !== 'MAIN2') return false;
      if (G.stack.length > 0) return false;
      if (G[who].landPlayedThisTurn) return false;
      return true;
    }
    case 'tapLandForMana': {
      const f = findCard(action.cardIid);
      if (!f || f.controller !== who) return false;
      if (f.card.tapped) return false;
      if (hasType(f.card, 'Land')) return whoHasPriority(who) || isInstantWindow(who);
      // Mana ability — scan all abilities (v1.0.64: was abilities[0] only,
      // which missed stapled creature+land merges where the mana ability is
      // appended at index >= 1).
      const abIdx = (typeof action.abilityIdx === 'number') ? action.abilityIdx : -1;
      if (!Array.isArray(f.card.abilities)) return false;
      let manaAb = null;
      if (abIdx >= 0) {
        manaAb = f.card.abilities[abIdx];
        if (!manaAb || !manaAb.effects || manaAb.effects[0].kind !== 'add_mana') return false;
      } else {
        // Backwards-compat: caller didn't specify, find the first mana ability.
        manaAb = f.card.abilities.find(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana');
        if (!manaAb) return false;
      }
      if (f.card.sick) return false;
      return whoHasPriority(who) || isInstantWindow(who);
    }
    case 'castSpell': {
      const card = G[who].hand.find(c => c.iid === action.cardIid);
      if (!card || hasType(card, 'Land')) return false;
      if (!canPayPotential(who, effectiveCastCost(card))) return false;
      // Legendary uniqueness (rule 1a): you can't cast a legendary if you
      // already control one with the same tplId. This is a hard prohibition
      // at cast time — not the classic "both die" legend rule (1b) or the
      // modern "choose one to keep" (1c). The intent is that the boss's
      // double-City-Guardian is limited by exposing them serially: kill
      // the first to make room for the second. Per-controller (each side
      // can have one independently).
      if (hasType(card, 'Legendary') && G[who].battlefield.some(c => c.tplId === card.tplId)) {
        return false;
      }
      if (card.keywords && card.keywords.includes('flash')) {
        // Flash (incl. retired-Instant spells): cast at instant speed.
        if (!isInstantWindow(who)) return false;
      } else {
        if (!isSorceryWindow(who)) return false;
      }
      // Validate targets if needed. By default, multi-effect spells share
      // a single target slot (targets[0]) — preserves the legacy behavior
      // for Swords, Strength of the Pack, Predator's Speed, etc. Effects
      // can opt into a distinct slot via `target_slot: N` (0-indexed); a
      // multi-target spell like Branching Bolt has two effects, the second
      // marked `target_slot: 1`, so it pulls action.targets[1] instead of
      // sharing targets[0]. The required targets-array length is one more
      // than the highest target_slot referenced.
      const modes = getModes(card);
      const modeIdx = action.modeIdx || 0;
      if (modeIdx < 0 || modeIdx >= modes.length) return false;
      const activeEffects = modes[modeIdx];
      const targetedEffs = (activeEffects || []).filter(effectNeedsTarget);
      if (targetedEffs.length > 0) {
        const maxSlot = targetedEffs.reduce((m, e) => Math.max(m, e.target_slot || 0), 0);
        if (!action.targets || action.targets.length < maxSlot + 1) return false;
        const bySlot = validTargetsBySlot(card, targetedEffs, who);
        for (const eff of targetedEffs) {
          const slot = eff.target_slot || 0;
          const tgt = action.targets[slot];
          if (!tgt) return false;
          if (!(bySlot.get(slot) || []).some(v => sameTarget(v, tgt))) return false;
        }
      }
      // New targeting model (§3.5): a top-level `target` step is the cast-time
      // hexproof checkpoint. The spell needs one legal target of that filter;
      // action.targets[0] must be among them (so an opp hexproof creature is
      // not a legal target). Inert for legacy cards (none set card.target).
      if (card.target) {
        const valid = targetsForFilter(card.target, who, card.target_filter);
        if (!valid.length) return false;
        if (!action.targets || !action.targets[0]) return false;
        if (!valid.some(v => sameTarget(v, action.targets[0]))) return false;
      }
      return true;
    }
    case 'activateAbility': {
      const f = findCard(action.cardIid);
      if (!f || f.controller !== who) return false;
      const ab = (f.card.abilities || [])[action.abilityIdx];
      if (!ab) return false;
      if (ab.cost && ab.cost.tap) {
        if (f.card.tapped) return false;
        if (f.card.sick && !f.card.keywords.includes('haste') && hasType(f.card, 'Creature')) return false;
      }
      if (ab.cost && ab.cost.mana) {
        if (!canPayPotential(who, ab.cost.mana)) return false;
      }
      // Sac cost: action must include sacIid pointing to one of the
      // controller's own creatures. Self-sac (sourcing the ability) is legal.
      if (ab.cost && ab.cost.sacrifice) {
        if (action.sacIid == null) return false;
        const sacF = findCard(action.sacIid);
        if (!sacF || sacF.controller !== who) return false;
        if (!hasType(sacF.card, 'Creature')) return false;
      }
      const isMana = ab.effects[0].kind === 'add_mana';
      if (isMana) {
        // Mana abilities are always available when source can be tapped, regardless of priority.
        // (Matches MtG: mana abilities don't require priority and don't use the stack.)
        return true;
      }
      // Non-mana ability: timing depends on sorcery_speed flag.
      if (ab.sorcery_speed) {
        if (!isSorceryWindow(who)) return false;
      } else {
        if (!isInstantWindow(who)) return false;
      }
      // Ability-level multi-target slots (Stapler): one pick per `target_slots`
      // entry, each validated against its own {target, filter} spec. Replaces
      // the old `noop` slot-marker effect — target specs belong on the ability,
      // not masquerading as an empty-body effect kind.
      if (Array.isArray(ab.target_slots) && ab.target_slots.length > 0) {
        if (!action.targets || action.targets.length < ab.target_slots.length) return false;
        for (let s = 0; s < ab.target_slots.length; s++) {
          const tgt = action.targets[s];
          if (!tgt) return false;
          const valid = getValidTargets(ab.target_slots[s], who);
          if (!valid.some(v => sameTarget(v, tgt))) return false;
        }
      }
      const targetedEffs = ab.effects.filter(effectNeedsTarget);
      if (targetedEffs.length > 0) {
        // Multi-target ability validation: each effect's target_slot picks
        // its target from action.targets[slot].
        const maxSlot = targetedEffs.reduce((m, e) => Math.max(m, e.target_slot || 0), 0);
        if (!action.targets || action.targets.length < maxSlot + 1) return false;
        for (const eff of targetedEffs) {
          const slot = eff.target_slot || 0;
          const tgt = action.targets[slot];
          if (!tgt) return false;
          const valid = getValidTargets(eff, who);
          if (!valid.some(v => sameTarget(v, tgt))) return false;
        }
      }
      // New targeting model (§3.5): a top-level `target` step on the ability is
      // the cast-time hexproof checkpoint. Inert for legacy abilities.
      if (ab.target) {
        const valid = targetsForFilter(ab.target, who, ab.target_filter);
        if (!valid.length) return false;
        if (!action.targets || !action.targets[0]) return false;
        if (!valid.some(v => sameTarget(v, action.targets[0]))) return false;
      }
      return true;
    }
    case 'declareAttackers': {
      if (G.phase !== 'COMBAT_ATTACK' || who !== G.activePlayer) return false;
      if (G.attackersDeclared) return false;
      for (const iid of action.cardIids) {
        const f = findCard(iid);
        if (!f || f.controller !== who) return false;
        if (!canCreatureAttack(f.card)) return false;
      }
      return true;
    }
    case 'declareBlockers': {
      if (G.phase !== 'COMBAT_BLOCK' || who !== opp(G.activePlayer)) return false;
      if (G.blockersDeclared) return false;
      const usedBlockers = new Set();
      // Per-attacker blocker count for menace check.
      const blockerCount = {};
      for (const [bIid, aIid] of action.blockMap) {
        if (usedBlockers.has(bIid)) return false;
        usedBlockers.add(bIid);
        blockerCount[aIid] = (blockerCount[aIid] || 0) + 1;
        const fb = findCard(bIid), fa = findCard(aIid);
        if (!fb || fb.controller !== who) return false;
        if (!fa || !G.attackers.includes(aIid)) return false;
        if (!canCreatureBlock(fb.card, fa.card)) return false;
      }
      // Menace: any attacker with menace must be blocked by 2+ creatures, or 0.
      // blockerCount is keyed by iid; Object.entries returns string keys, so
      // we coerce back to Number before findCard (which strict-compares card
      // iids as numbers). Without this coercion `findCard("35")` returns
      // null even when card 35 exists, and the menace check silently
      // short-circuits — letting single-blocker-on-menace through.
      for (const [aIidStr, count] of Object.entries(blockerCount)) {
        const fa = findCard(Number(aIidStr));
        if (fa && fa.card.keywords.includes('menace') && count === 1) return false;
      }
      return true;
    }
    case 'discard': {
      if (G.cleanupDiscarding && who === G.activePlayer) {
        return G[who].hand.some(c => c.iid === action.cardIid);
      }
      if (G.forcedDiscard && G.forcedDiscard.who === who && G.forcedDiscard.remaining > 0) {
        return G[who].hand.some(c => c.iid === action.cardIid);
      }
      return false;
    }
    case 'searchPick': {
      if (!G.pendingSearch || G.pendingSearch.who !== who) return false;
      const card = G[who].library.find(c => c.iid === action.cardIid);
      if (!card) return false;
      if (G.pendingSearch.filter && G.pendingSearch.filter.type
          && !hasType(card, G.pendingSearch.filter.type)) return false;
      return true;
    }
    case 'triggerTargetPick': {
      if (!G.pendingTriggerTarget || G.pendingTriggerTarget.controller !== who) return false;
      if (!action.target) return false;
      return G.pendingTriggerTarget.valid.some(v => sameTarget(v, action.target));
    }
    case 'numberChoice': {
      // Legal only when a number-choice prompt is open for this player
      // and the number is in the prompt's [min, max] range.
      if (!G.pendingNumberChoice || G.pendingNumberChoice.who !== who) return false;
      if (!Number.isInteger(action.number)) return false;
      return action.number >= G.pendingNumberChoice.min
          && action.number <= G.pendingNumberChoice.max;
    }
    case 'symmetricizeChoice': {
      // Legal only when a Symmetricize prompt is open for this player.
      // action.which ∈ {'power', 'toughness', 'cost'}.
      if (!G.pendingSymmetricizeChoice || G.pendingSymmetricizeChoice.who !== who) return false;
      return ['power','toughness','cost'].includes(action.which);
    }
    case 'edictChoice': {
      // Legal only when an edict selection prompt (GAP 2) is open for this
      // player, and the chosen iid is one of the eligible permanents.
      if (!G.pendingEdictChoice || G.pendingEdictChoice.who !== who) return false;
      return G.pendingEdictChoice.pool.some(c => c.iid === action.iid);
    }
    case 'optionalCost': {
      // Legal only when a "you may pay {cost}" trigger prompt is open for this
      // player. `pay` is a boolean (true = pay, false = decline).
      if (!G.pendingOptionalCost || G.pendingOptionalCost.who !== who) return false;
      return typeof action.pay === 'boolean';
    }
    case 'triggerBuildPick': {
      if (!G.pendingTriggerBuild || G.pendingTriggerBuild.who !== who) return false;
      const ptb = G.pendingTriggerBuild;
      const c = action.choice;
      // Three steps in the build flow, each with different valid input shapes:
      //   'condition' — integer 0..conditionOptions.length-1
      //   'effect'    — integer 0..effectOptions.length-1
      //   'compare'   — 'new' or 'keep'
      if (ptb.step === 'condition') {
        return Number.isInteger(c) && c >= 0 && c < ptb.conditionOptions.length;
      }
      if (ptb.step === 'effect') {
        return Number.isInteger(c) && c >= 0 && Array.isArray(ptb.effectOptions) && c < ptb.effectOptions.length;
      }
      if (ptb.step === 'compare') {
        return c === 'new' || c === 'keep';
      }
      return false;
    }
    case 'pass':
      // Pass is contextual at the doPass level, but we explicitly reject
      // it while a forced-action prompt is open. Without this guard, a
      // player can "pass past" a build/search/discard prompt — the engine
      // would no-op the pass (since whoHasPriority returns false during
      // forced action) but the action returns success, confusing callers.
      if (isWaitingForForcedAction()) return false;
      return true;
    case 'endTurn':
      return who === G.activePlayer && G.stack.length === 0 && !G.cleanupDiscarding;
    default: return false;
  }
}

// =========================================================================
// Legal action enumeration
// =========================================================================
function getLegalActions(who) {
  const actions = [];

  // Land plays
  if (who === G.activePlayer && (G.phase === 'MAIN1' || G.phase === 'MAIN2')
      && G.stack.length === 0 && !G[who].landPlayedThisTurn && !G.gameOver) {
    for (const card of G[who].hand) {
      if (hasType(card, 'Land')) actions.push({type:'playLand', cardIid: card.iid});
    }
  }

  // Tap lands & mana dorks
  if (whoHasPriority(who) || isInstantWindow(who)) {
    for (const card of G[who].battlefield) {
      if (card.tapped) continue;
      if (hasType(card, 'Land')) {
        // For dual-typed lands (stickered duals), expose one action per
        // producible color so the AI can choose which to tap for.
        const colors = landProducibleColors(card);
        for (const color of colors) {
          actions.push({type:'tapLandForMana', cardIid: card.iid, color});
        }
      } else if (card.abilities && !card.sick) {
        // v1.0.64: scan all abilities for mana, not just [0]. For creature+
        // land stapled merges the mana ability is at index >= 1. If we find
        // one, emit a tapLandForMana action with the abilityIdx so the
        // engine knows which ability to use.
        const manaAbIdx = card.abilities.findIndex(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana');
        if (manaAbIdx >= 0) {
          actions.push({type:'tapLandForMana', cardIid: card.iid, abilityIdx: manaAbIdx});
        }
      }
    }
  }

  // Spells (one entry per (card, target) combination)
  for (const card of G[who].hand) {
    if (hasType(card, 'Land')) continue;
    if (!canPayPotential(who, effectiveCastCost(card))) continue;
    // Timing: flash spells (incl. retired-Instant cards) and flash creatures
    // use the instant window. Other permanents/sorceries need sorcery window.
    const hasFlash = card.keywords && card.keywords.includes('flash');
    if (hasFlash) {
      if (!isInstantWindow(who)) continue;
    } else {
      if (!isSorceryWindow(who)) continue;
    }
    // Enumerate one action per (mode, target combination). Non-modal
    // single-target cards collapse to the simple "one action per target"
    // case. Modal cards branch per mode. Multi-target cards generate one
    // action per cross-product of their target slots.
    const modes = getModes(card);
    for (let mIdx = 0; mIdx < modes.length; mIdx++) {
      const modeEffects = modes[mIdx];
      const targetedEffs = (modeEffects || []).filter(effectNeedsTarget);
      if (targetedEffs.length === 0) {
        // New targeting model (§3.5): a top-level `target` step means one
        // action per legal target of that filter (hexproof-excluded via
        // targetsForFilter). No valid target → spell not castable.
        if (card.target) {
          for (const t of targetsForFilter(card.target, who, card.target_filter)) {
            const a = { type: 'castSpell', cardIid: card.iid, targets: [t] };
            if (modes.length > 1) a.modeIdx = mIdx;
            actions.push(a);
          }
          continue;
        }
        // Untargeted (or untargeted mode of a modal card).
        const a = {type:'castSpell', cardIid: card.iid};
        if (modes.length > 1) a.modeIdx = mIdx;
        actions.push(a);
        continue;
      }
      // Per-slot legal targets (slot grouping + spec resolution shared with
      // isLegalAction via validTargetsBySlot). Each unique slot needs one target;
      // effects sharing a slot share that target (e.g. Strength of the Pack).
      const bySlot = validTargetsBySlot(card, targetedEffs, who);
      const slotKeys = [...bySlot.keys()].sort((a, b) => a - b);
      const validBySlot = slotKeys.map(slot => bySlot.get(slot));
      // Bail if any slot has no valid targets — spell is uncastable.
      if (validBySlot.some(arr => arr.length === 0)) continue;
      // Build the cross-product of slot targets. For single-target spells
      // (one slot) this is just the target list. For multi-target spells
      // it grows multiplicatively, bounded by per-slot validity counts.
      // Cap at 200 combos defensively — beyond that the AI cost outweighs
      // the benefit of exhaustive search and we'd want a smarter sampler.
      const combos = [[]];
      const COMBO_CAP = 200;
      for (const validList of validBySlot) {
        const next = [];
        for (const partial of combos) {
          for (const t of validList) {
            next.push([...partial, t]);
            if (next.length >= COMBO_CAP) break;
          }
          if (next.length >= COMBO_CAP) break;
        }
        combos.length = 0;
        combos.push(...next);
        if (combos.length >= COMBO_CAP) break;
      }
      // Assemble one action per combo. action.targets is indexed by slot
      // value (slot 0 → targets[0], slot 1 → targets[1]); since we sorted
      // slotKeys ascending and slots are typically dense (0, 1, 2...),
      // combo[i] aligns with slotKeys[i] which equals i in the common case.
      // Defensive: if a card uses sparse slots (0, 2 — skipping 1), fill
      // gaps so action.targets[N] is always present for the highest slot.
      for (const combo of combos) {
        const targets = [];
        for (let i = 0; i < slotKeys.length; i++) {
          targets[slotKeys[i]] = combo[i];
        }
        // Fill any sparse holes with a placeholder copy of slot 0 — the
        // validator will reject these unless they happen to be valid for
        // the higher-slot effect, which means the engine is effectively
        // robust to either dense or sparse slot numbering.
        for (let i = 0; i < targets.length; i++) {
          if (!targets[i]) targets[i] = combo[0];
        }
        const a = {type:'castSpell', cardIid: card.iid, targets};
        if (modes.length > 1) a.modeIdx = mIdx;
        actions.push(a);
      }
    }
  }

  // Activated abilities (one entry per (card, ability, target, sacTarget))
  for (const card of G[who].battlefield) {
    if (!card.abilities) continue;
    for (let i=0; i<card.abilities.length; i++) {
      const ab = card.abilities[i];
      const isMana = ab.effects[0].kind === 'add_mana';
      if (isMana) continue;   // surfaced as tapLandForMana
      // Multi-target abilities (Stapler) are player-UI-driven; the AI doesn't
      // enumerate the 2-target cross-product. Skip so we don't emit always-
      // illegal single-target actions.
      if (Array.isArray(ab.target_slots) && ab.target_slots.length > 1) continue;
      // Tap cost requirements.
      if (ab.cost && ab.cost.tap) {
        if (card.tapped) continue;
        if (card.sick && !card.keywords.includes('haste') && hasType(card, 'Creature')) continue;
      }
      // Mana cost requirements.
      if (ab.cost && ab.cost.mana && !canPayPotential(who, ab.cost.mana)) continue;
      // Sacrifice cost: enumerate one entry per legal sac target. 'creature'
      // means any of your own creatures. Note: in MtG you CAN sacrifice the
      // source itself if it's a creature and the cost says "sacrifice a
      // creature." Carrion Feeder sacing itself is wasted but legal.
      let sacOptions = null;  // null = no sac cost; [] = required but none available; [a,b,...] = choices
      if (ab.cost && ab.cost.sacrifice) {
        sacOptions = G[who].battlefield
          .filter(c => hasType(c, 'Creature'))
          .map(c => c.iid);
        if (sacOptions.length === 0) continue;  // can't pay sac cost
      }
      if (ab.sorcery_speed ? !isSorceryWindow(who) : !isInstantWindow(who)) continue;
      const targetedEff = ab.effects.find(effectNeedsTarget);
      // Cross-product: (effect targets) × (sac options). A top-level `target`
      // step (§3.5) enumerates from targetsForFilter (hexproof-excluded); empty
      // → no actions (ability not activatable). Legacy per-effect targets fall
      // back to getValidTargets; untargeted → [null].
      const effectTargets = ab.target ? targetsForFilter(ab.target, who, ab.target_filter)
        : (targetedEff ? getValidTargets(targetedEff, who) : [null]);
      const sacChoices = sacOptions || [null];
      for (const t of effectTargets) {
        for (const sacIid of sacChoices) {
          const action = {type:'activateAbility', cardIid: card.iid, abilityIdx: i};
          if (t) action.targets = [t];
          if (sacIid != null) action.sacIid = sacIid;
          actions.push(action);
        }
      }
    }
  }

  // Combat declarations (one entry; AI fills in subset)
  if (G.phase === 'COMBAT_ATTACK' && who === G.activePlayer && !G.attackersDeclared) {
    actions.push({type:'declareAttackers', cardIids: []});      // no-attack option
    const canAttack = G[who].battlefield
      .filter(canCreatureAttack)
      .map(c => c.iid);
    if (canAttack.length) {
      actions.push({type:'declareAttackers', cardIids: canAttack});
    }
  }
  if (G.phase === 'COMBAT_BLOCK' && who !== G.activePlayer && !G.blockersDeclared) {
    actions.push({type:'declareBlockers', blockMap: new Map()});  // no-block option
  }

  // Cleanup discard or forced discard
  if ((G.cleanupDiscarding && who === G.activePlayer) ||
      (G.forcedDiscard && G.forcedDiscard.who === who && G.forcedDiscard.remaining > 0)) {
    for (const card of G[who].hand) {
      actions.push({type:'discard', cardIid: card.iid});
    }
  }
  // Library search picks
  if (G.pendingSearch && G.pendingSearch.who === who) {
    const filter = G.pendingSearch.filter || {};
    for (const card of G[who].library) {
      if (filter.type && !hasType(card, filter.type)) continue;
      actions.push({type:'searchPick', cardIid: card.iid});
    }
  }

  // Number-choice picks — when this player owes a "pick a number from
  // [min, max]" decision (Archdemon of Bargains). One action per integer
  // in the range.
  if (G.pendingNumberChoice && G.pendingNumberChoice.who === who) {
    const p = G.pendingNumberChoice;
    for (let n = p.min; n <= p.max; n++) {
      actions.push({type:'numberChoice', number: n});
    }
  }

  // Symmetricize choice — three options always.
  if (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === who) {
    actions.push({type:'symmetricizeChoice', which: 'power'});
    actions.push({type:'symmetricizeChoice', which: 'toughness'});
    actions.push({type:'symmetricizeChoice', which: 'cost'});
  }

  // Edict choice (GAP 2) — one action per eligible permanent the choosing
  // player controls (the forced-sacrifice selection).
  if (G.pendingEdictChoice && G.pendingEdictChoice.who === who) {
    for (const c of G.pendingEdictChoice.pool) {
      actions.push({type:'edictChoice', iid: c.iid});
    }
  }

  // Optional-cost ("you may pay {cost}") trigger — pay or decline.
  if (G.pendingOptionalCost && G.pendingOptionalCost.who === who) {
    actions.push({type:'optionalCost', pay: true});
    actions.push({type:'optionalCost', pay: false});
  }

  // Pass (always legal as a generic "I'm done")
  actions.push({type:'pass'});

  // End turn
  if (who === G.activePlayer && G.stack.length === 0 && !G.cleanupDiscarding) {
    actions.push({type:'endTurn'});
  }

  return actions;
}

// True iff the player has nothing productive to do right now — no spell to
// cast, no ability to activate, no land to play. Pass / endTurn / mana-tap
// don't count as productive (mana-tap on its own is dead motion;
// canPayPotential already folds tappable sources into spell legality, so
// any meaningful tap is implicit in a castSpell entry being present).
//
// Used to auto-pass a player's slot in any priority round when they
// genuinely can't act. Spares the click-fatigue without changing the rules.
function hasNoAction(who) {
  return !getLegalActions(who).some(a =>
    a.type === 'castSpell' || a.type === 'activateAbility' || a.type === 'playLand');
}

// step() — advance state machine to next decision point. Phase categories:
//   automatic: UNTAP, DRAW, COMBAT_DAMAGE, CLEANUP
//   declaration-then-priority: COMBAT_ATTACK, COMBAT_BLOCK
//   pure priority: MAIN1, MAIN2, END
function step() {
  while (true) {
    if (G.gameOver) return;
    // Pause for any open modal (player or AI). Routes through PENDING_DECISIONS
    // so adding modal types doesn't require updating step() (the omission of
    // pendingTriggerBuild here was the original Codex MAIN1-skip bug).
    if (anyoneOwesDecision()) return;
    // Put any pending triggered abilities on the stack BEFORE anyone exercises
    // priority (MTG 603.3b: triggers go on the stack the next time a player would
    // receive priority). A special action like playing a land doesn't pass
    // priority, so a trigger it queued (e.g. a Land+Spell staple ETB) used to sit
    // in the queue until the player's NEXT pass — making the ETB appear to "fire
    // the next time you do something" and never visibly hit the stack. Draining
    // here surfaces it immediately. (drainTriggers no-ops on an empty queue and
    // returns early if a target prompt is already open, so this can't loop.)
    if (isPriorityOpen() && G.pendingTriggers.length > 0 && !G.pendingTriggerTarget) {
      drainTriggers();
      continue;
    }
    // Auto-pass dead priority rounds. Skip AP's empty-stack END priority
    // (they had M2 for sorcery-speed plays).
    if (isPriorityOpen()) {
      const skipApEndStep = G.phase === 'END'
        && G.priorityHolder === G.activePlayer
        && G.stack.length === 0;
      if (skipApEndStep || hasNoAction(G.priorityHolder)) {
        passPriority(G.priorityHolder);
        continue;
      }
      return;
    }
    // Declaration pending — wait on declarer unless endTurnPending forces empty.
    if (G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared) {
      if (G.endTurnPending) { doDeclareAttackers(G.activePlayer, []); continue; }
      // Auto-skip when there are no eligible attackers — nothing to decide.
      const canAttack = G[G.activePlayer].battlefield.some(canCreatureAttack);
      if (!canAttack) { doDeclareAttackers(G.activePlayer, []); continue; }
      return;
    }
    if (G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared && G.attackers.length > 0) {
      // Auto-skip when no creature could legally block any of the attackers.
      // For each attacker, count legal blockers; menace requires 2+. We need
      // at least one attacker that could be legally blocked.
      const defender = opp(G.activePlayer);
      const eligibleBlockers = G[defender].battlefield.filter(c => canCreatureBlock(c));
      const canBlock = G.attackers.some(aIid => {
        const fa = findCard(aIid); if (!fa) return false;
        const atk = fa.card;
        const validForThis = eligibleBlockers.filter(blk => canCreatureBlock(blk, atk));
        // Menace requires 2+ valid blockers.
        const minNeeded = atk.keywords.includes('menace') ? 2 : 1;
        return validForThis.length >= minNeeded;
      });
      if (!canBlock) { doDeclareBlockers(defender, new Map()); continue; }
      return;
    }
    if (G.cleanupDiscarding) {
      // If the player has discarded enough, clear the flag and let CLEANUP finish.
      if (G[G.activePlayer].hand.length <= 7) G.cleanupDiscarding = false;
      else return;
    }
    // Note: a previous version had per-modal pause guards at this point in
    // the loop (forcedDiscard / pendingSearch / pendingTriggerTarget). Those
    // are now redundant — the top-of-loop anyoneOwesDecision() check covers
    // all of them, and the hand-empty cleanup that lived alongside the
    // forcedDiscard guard moved into doDiscard where it logically belongs.

    const ap = G.activePlayer;
    switch (G.phase) {
      case 'UNTAP':
        G[ap].battlefield.forEach(c => { c.tapped = false; c.sick = false; });
        G[ap].landPlayedThisTurn = false;
        // Reset both players' "life lost this turn" trackers — "this turn"
        // begins now, so prior life loss no longer counts for any
        // bloodlust-style triggers that fire later.
        G.you.lifeLostThisTurn = 0;
        G.opp.lifeLostThisTurn = 0;
        log(`--- ${G[ap].name} Turn ${G.turn} ---`, 'imp');
        setPhase('DRAW');
        continue;

      case 'DRAW':
        // First player skips their first-turn draw step (standard play/draw
        // rule — compensates the going-first tempo advantage with a card).
        if (G.turn === 1 && ap === G.firstPlayer) {
          log(`${G[ap].name} skips draw (going first).`);
        } else {
          drawCard(ap);
          log(`${G[ap].name} draws.`);
        }
        setPhase('MAIN1');
        continue;

      case 'MAIN1':
      case 'MAIN2':
      case 'END':
        // Pure priority phase — open a round; loop will check auto-pass.
        openPriorityRound();
        continue;

      case 'COMBAT_ATTACK':
        // Attackers have been declared (we'd have returned otherwise).
        // Skip-combat fast path: no attackers committed.
        if (G.attackers.length === 0) {
          G.attackersDeclared = false;
          setPhase('MAIN2');
          continue;
        }
        // Open the post-attackers priority round (the new (a.ii) window).
        openPriorityRound();
        continue;

      case 'COMBAT_BLOCK':
        if (G.attackers.length === 0) {
          setPhase('COMBAT_DAMAGE');
          continue;
        }
        // Blockers have been declared.
        openPriorityRound();
        continue;

      case 'COMBAT_DAMAGE':
        // Auto-resolve. Priority window for damage already happened in COMBAT_BLOCK.
        resolveCombatDamage();
        G.attackers = []; G.blockers = new Map();
        G.attackersDeclared = false;
        G.blockersDeclared = false;
        setPhase('MAIN2');
        continue;

      case 'CLEANUP':
        if (G[ap].hand.length > 7) {
          if (ap === 'you') {
            G.cleanupDiscarding = true;
            return;
          }
          // AI auto-discard.
          while (G[ap].hand.length > 7) doDiscard(ap, G[ap].hand[0].iid);
        }
        // Process delayed triggers scheduled for end of turn. Fire each
        // one's effect (currently only 'returnFromExile' for Otherworldly
        // Journey-style cards). This happens BEFORE EOT cleanup so any
        // returning creature appears on the battlefield with fresh state.
        // ETB triggers for returning creatures fire normally and will
        // resolve via pendingTriggers in the next priority round.
        if (Array.isArray(G.delayedTriggers) && G.delayedTriggers.length > 0) {
          const stillPending = [];
          for (const dt of G.delayedTriggers) {
            // 'fireFor' is whose end step the trigger fires on: 'either',
            // 'you', or 'opp'. Default to 'either' for v1 simplicity.
            const matchesPlayer = !dt.fireFor || dt.fireFor === 'either' || dt.fireFor === ap;
            if (dt.fireAt === 'endStep' && matchesPlayer) {
              if (dt.effect === 'deferredEffects' && Array.isArray(dt.effects)) {
                // Apply the scheduled effects on the captured target (e.g.
                // exile_until_eot's move_card(exile→battlefield)). Tokens that
                // left play aren't in any zone, so the move_card no-ops and the
                // token stays gone — matching "ceases to exist".
                const dctx = { controller: dt.controller, sourceName: dt.sourceName, sourceIid: dt.sourceIid };
                for (const eff of dt.effects) {
                  applyEffect(dctx, eff, dt.target, snapshotTarget(dt.target));
                }
              }
              // fired, don't keep
            } else {
              stillPending.push(dt);
            }
          }
          G.delayedTriggers = stillPending;
        }
        // End-of-turn cleanup. Damage, temp P/T, and EOT keyword grants all
        // clear simultaneously for ALL creatures (per MtG cleanup rules) —
        // doing them together lets a pumped creature that was damaged within
        // its temporary toughness survive: the damage clears the same instant
        // the temp P/T does, so the death check that follows sees a clean board.
        [...G.you.battlefield, ...G.opp.battlefield].forEach(c => {
          // permanent_eot creatures (Elystra) — convert temp buffs and EOT
          // grants to slot.permaBuffs before they get cleared. Helper is
          // shared with endGame, which also needs to flush pending buffs
          // when the game ends mid-turn (before EOT cleanup would fire).
          flushPermanentEotToPermaBuffs(c);
          c.tempPower = 0; c.tempTou = 0; c.damage = 0;
          c.dealtDeathtouch = false;
          // Revoke until-end-of-turn type grants (add_type/set_types) — the
          // animate's stats (tempPower/tempTou) clear in the same sweep, so an
          // animated land reverts to a plain land cleanly.
          if (Array.isArray(c.typeGrants) && c.typeGrants.length) {
            c.typeGrants = c.typeGrants.filter(g => !g.eot);
          }
          if (c.damagedBySources instanceof Set) c.damagedBySources.clear();
          // Revoke EOT keyword grants. Re-derive keywords from intrinsics +
          // permanent grants (grantedBy) so the EOT-granted ones drop off
          // while permanent grants from lords/auras stay.
          if (Array.isArray(c.eotGrants) && c.eotGrants.length > 0) {
            c.eotGrants = [];
            // Rebuild keywords: start from intrinsic (template + stickers),
            // then re-add anything still in grantedBy. This is the same
            // shape as how Sky Champion's grants work — grantedBy is the
            // canonical source of truth for ongoing grants.
            const kw = intrinsicKeywords(c);
            if (c.grantedBy instanceof Map) {
              for (const [grantedKw, sources] of c.grantedBy) {
                if (sources.size > 0 && !kw.includes(grantedKw)) kw.push(grantedKw);
              }
            }
            c.keywords = kw;
          }
        });
        // Temporary control revert. Any creature with tempControlUntilEot
        // moves back to its owner's battlefield. Runs AFTER the temp-grant
        // cleanup so the eotGrants:['haste'] from a Threaten-shape spell is
        // already cleared before we move the creature — clean slate going
        // home. Tap status is preserved: a stolen creature that attacked
        // during the steal turn comes home tapped. Tokens that were
        // temp-stolen also revert (back to original minter's battlefield)
        // unless they died during the steal turn.
        for (const who of ['you', 'opp']) {
          const bf = G[who].battlefield;
          for (let i = bf.length - 1; i >= 0; i--) {
            const c = bf[i];
            if (!c.tempControlUntilEot) continue;
            if (c.owner === who) {
              // Already with owner somehow — flag is stale. Clear it.
              c.tempControlUntilEot = false;
              continue;
            }
            // Move card back. No ETB emit — control reversion isn't an
            // entering-the-battlefield event in MtG (the card never left
            // the battlefield zone, only changed controllers).
            bf.splice(i, 1);
            c.tempControlUntilEot = false;
            // Reset sickness for the owner's perspective: the creature is
            // back under its original owner, who has had it since the
            // original turn it was cast (or longer). Owner getting their
            // own creature back shouldn't make it sick. Same rationale
            // applies whether it's the owner's turn or not.
            c.sick = false;
            G[c.owner].battlefield.push(c);
            log(`${c.name} returns to ${pname(c.owner)}'s control.`, 'sp');
          }
        }
        afterEffectsApplied();
        // (Mana pools are emptied by setPhase on every phase transition — B2.)
        G.activePlayer = opp(ap);
        // Turn counter increments when we cycle back to the first player
        // (i.e., a full round has completed). Hard-coding 'you' here would
        // mean the second player's first turn shows as Turn 2, which is
        // confusing when opp goes first.
        if (G.activePlayer === G.firstPlayer) G.turn++;
        G.attackers = []; G.blockers = new Map();
        G.attackersDeclared = false;
        G.blockersDeclared = false;
        G.endTurnPending = false;   // new turn — clear the auto-pass flag
        setPhase('UNTAP');
        continue;
    }
  }
}

// =========================================================================
// expectedActor — who is the engine waiting on?
// =========================================================================
function expectedActor() {
  // Defensive: if init failed, G is null. Returning null lets callers (UI,
  // onStateChange) skip whatever they were about to do without crashing.
  if (!G || G.gameOver) return null;
  // Modal/forced-action prompts: the player owes a decision before anything
  // else can happen. Reads from PENDING_DECISIONS so adding a new modal
  // type doesn't require updating this function. (Previously, a hand-rolled
  // list here missed pendingTriggerBuild — expectedActor returned null when
  // a build modal was the only thing blocking, breaking AI dispatch checks
  // and pass-button labeling.)
  if (playerOwesDecision('you')) return 'you';
  if (isPriorityOpen()) return G.priorityHolder;
  if (G.cleanupDiscarding) return G.activePlayer;
  if (G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared) return G.activePlayer;
  if (G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared && G.attackers.length > 0) {
    return opp(G.activePlayer);
  }
  return null;
}

// =========================================================================
// executeAction — public mutation entry point
// =========================================================================
function executeAction(who, action) {
  if (!isLegalAction(who, action)) {
    console.warn('Illegal action rejected:', who, JSON.stringify(action),
      '| phase:', G.phase, '| activePlayer:', G.activePlayer,
      '| priorityHolder:', G.priorityHolder, '| stack:', G.stack.length);
    return false;
  }
  // Any explicit action other than pass/endTurn means the player is re-engaging;
  // cancel the auto-pass-to-end-of-turn shortcut.
  if (who === G.activePlayer && action.type !== 'pass' && action.type !== 'endTurn') {
    G.endTurnPending = false;
  }
  switch (action.type) {
    case 'playLand':         doPlayLand(who, action.cardIid); break;
    case 'tapLandForMana':   doTapLandForMana(who, action.cardIid, action.color, action.abilityIdx); break;
    case 'castSpell':        doCastSpell(who, action.cardIid, action.targets, action.modeIdx); break;
    case 'activateAbility':  doActivateAbility(who, action.cardIid, action.abilityIdx, action.targets, action.sacIid); break;
    case 'declareAttackers': doDeclareAttackers(who, action.cardIids); break;
    case 'declareBlockers':  doDeclareBlockers(who, action.blockMap); break;
    case 'discard':          doDiscard(who, action.cardIid); break;
    case 'searchPick':        doSearchPick(who, action.cardIid); break;
    case 'triggerTargetPick': doTriggerTargetPick(who, action.target); break;
    case 'triggerBuildPick':  doTriggerBuildPick(who, action.choice); break;
    case 'numberChoice':      doNumberChoice(who, action.number); break;
    case 'symmetricizeChoice': doSymmetricizeChoice(who, action.which); break;
    case 'edictChoice':       doEdictChoice(who, action.iid); break;
    case 'optionalCost':      doOptionalCost(who, action.pay); break;
    case 'pass':             doPass(who); break;
    case 'endTurn':          doEndTurn(who); break;
  }
  step();
  notify();
  return true;
}

function notify() { for (const fn of listeners) fn(); }
function subscribe(fn) { listeners.push(fn); }

function init(playerDeck, oppDeck) {
  nextIid = 1;
  G = makeState(playerDeck, oppDeck);
  // Coin flip — true 50/50 first player. The chosen player skips their
  // first draw step (handled in DRAW phase). We don't currently offer the
  // winner a choice of play/draw; if added later, it'd happen here before
  // setting activePlayer.
  const first = Math.random() < 0.5 ? 'you' : 'opp';
  G.firstPlayer = first;
  G.activePlayer = first;
  log(`🪙 Coin flip — ${G[first].name} ${first === 'you' ? 'go' : 'goes'} first.`, 'imp');
  log(`Magiclike ${VERSION}. You face ${G.opp.name}.`, 'imp');
  // Announce any mulligans that fired during opening-hand draw. The rule
  // triggers on hands with 0, 1, 6, or 7 lands — too screwed or too
  // flooded to play out fairly. Both sides use the same rule; opp's
  // mulligan is announced too so the player sees they were treated
  // symmetrically. (Knowing opp mulliganed is a small information leak
  // — it implies their initial hand had extreme land count — but it
  // doesn't reveal specific cards and the symmetry-fairness signal
  // is worth more than the leak.)
  if (G.you.mulliganed) log(`${G.you.name} mulliganed (opening hand had too few or too many lands).`, 'sp');
  if (G.opp.mulliganed) log(`${G.opp.name} mulliganed (opening hand had too few or too many lands).`, 'sp');
  // Opening-hand build_on_draw scan. Cards in the opening hand bypass drawCard
  // (they're placed directly during makePlayer), so the per-draw build hook
  // doesn't fire for them. Walk the player's hand once at game-start;
  // tryBuildOnDraw handles eligibility and the prompt setup. find() returns
  // the first match — only one prompt at a time, since pendingTriggerBuild
  // is a single field. If a future feature needs multiple build prompts
  // queued, this becomes a queue rather than a single setter.
  const handBuilder = G.you.hand.find(c => {
    const tpl = CARDS[c.tplId];
    return tpl && tpl.build_on_draw && !c._builtThisGame;
  });
  if (handBuilder) tryBuildOnDraw(handBuilder, 'you');
  step();
  notify();
}

return {
  init, state: () => G, expectedActor, getLegalActions, executeAction, isLegalAction,
  playerOwesDecision,
  subscribe, findCard, getStats, getCardValue, sacValueOnBoard, cardCost: costTotalCard,
  landProducibleColors, payMana,
  canCreatureAttack, canCreatureBlock,
  effectNeedsTarget, getValidTargets,
  effectiveCastCost,
  makeCard,
  synthesizeStapledTemplate,
  makeToken,
  getModes,
  isModal,
  effectsForMode,
  cardHasEffect,
  pickBestTriggerTarget,
  matchFilter,
  // Effects seam exposed for tests (Slice 3).
  applyEffect, creaturesInScope, sevToNum, numToSev,
  targetsForFilter, TARGET_FILTERS, validateAllCardEffects,
  // Canonical targeting-shape API (single source of truth across UI consumers).
  objectNeedsTarget, primaryLegalTargets, probeTargetsForObject,
  // §7b coverage seam: the dispatch table + the coverage report. The valuation
  // classification sets (VALUED/UNVALUED_EFFECT_KINDS) now live on AI (review #6).
  EFFECTS, effectCoverageReport,
  concede() {
    if (!G || G.gameOver) return;
    log('You concede.', 'imp');
    G.gameOver = true; G.winner = 'opp';
    notify();
  },
};
})();

