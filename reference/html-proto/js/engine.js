// Mercurial Adept's trigger pool. makeCard rolls one fresh per game from
// this pool, so the same slot has a different personality each fight.
// `label` is shown in the card popup repertoire — but only for LEGACY saves:
// the repertoire gates on slot.triggerPool (controller.js), which post-cutover
// slots (trigger_pool_seed) never carry, so in current saves the card's
// authored face text is the player's only description of this pool — keep
// card.json's text in sync with these entries (audit A10-2).
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
// pickWeightedSticker, applyStickersToCard, applyOneStickerToRuntimeCard,
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
// The in-game staple chain on a card INSTANCE. In-game cards carry it at
// card.stapledFrom.stapledTpls; bare card.stapledTpls is slot-level and
// normally empty on instances — read whichever is populated. The ONE
// definition, shared by the target filters (matchFilter / matchFilterSpell)
// and the apply_in_game_splice handler, so a wrong-field read can't silently
// miss a prior chain (the bug class the handler's field-name note warns about).
function stapleChainOf(card) {
  if (card && card.stapledFrom && Array.isArray(card.stapledFrom.stapledTpls)) {
    return card.stapledFrom.stapledTpls;
  }
  return (card && Array.isArray(card.stapledTpls)) ? card.stapledTpls : [];
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
  // tap-ability uses the add_mana choose form (§3.9), so a multi-color land is a
  // valid staple onto any base. (City of Brass, the only such land today, is
  // `special` — run-boon only — so it's excluded above; the capability stands
  // for any future non-special multi-color land.)
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
// A7-1: a mana ability is auto-payable ONLY if its cost is trivial — {T} and/or
// mana, nothing else. Any extra cost (sacrifice, remove_counters, a future
// field) would have to be SILENTLY auto-paid by the tap-for-mana fast lane, so
// it's excluded from every automatic mana path (enumeration, legality,
// doTapLandForMana, the solver) per Joe's guard: the autotapper must never
// sacrifice / pay-down without an explicit player choice. Trivial-cost mana
// abilities still auto-pay.
function manaAbilityCostIsTrivial(ab) {
  if (!ab || !ab.cost) return true;
  for (const k of Object.keys(ab.cost)) { if (k !== 'tap' && k !== 'mana') return false; }
  return true;
}
// True iff `ab` is an add_mana ability the auto-payer / tap lane may use.
function isAutoUsableManaAbility(ab) {
  return !!(ab && ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana' && manaAbilityCostIsTrivial(ab));
}

// The tap-for-mana ability on a permanent (cost.tap + add_mana, trivial cost), or null.
function manaAbilityOf(card) {
  if (!card || !Array.isArray(card.abilities)) return null;
  return card.abilities.find(ab => ab && ab.cost && ab.cost.tap
    && ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana'
    && manaAbilityCostIsTrivial(ab)) || null;
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

// Registry of "player owes a decision" modal types.
//
// ADD-A-MODAL CHECKLIST — the registry entry alone is NOT enough. While a
// modal is open, isLegalAction rejects everything except that modal's answer
// action, so missing any site below produces a hard soft-lock (engine paused,
// getLegalActions returns [], every answer illegal). A new modal needs ALL of:
//   1. G.<field> initialized in makeState.
//   2. A registry entry here (note pendingTriggerTarget uses .controller,
//      not .who).
//   3. An isForcedActionResponse branch mapping the answer action type to
//      the open field.
//   4. An isLegalAction case validating the answer action.
//   5. A getLegalActions block enumerating the legal answers while the
//      modal is open.
//   6. An executeAction dispatch case routing to the do* handler (which
//      must clear the field).
//   7. AI handling (ai.js decide path) and/or controller/UI handling
//      (controller.js) so both kinds of player can actually answer.
// Reference examples: pendingEdictChoice and pendingOptionalCost touch every
// site on this list.
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

function pendingDecisionActor() {
  for (const d of PENDING_DECISIONS) {
    const obj = G[d.field];
    if (obj && d.active(obj)) return d.who(obj);
  }
  return null;
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
    if (involved.some(t => hasType(t, co))) addType(merged, co);
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
      addType(merged, st);
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
    // Carry the spell's distinct-targets rule onto the ETB. Now that the trigger
    // path enforces cross-slot constraints (tsAutoPick / advanceTriggerTargetPrompt),
    // a stapled Roots and Branches / Sword and Sorcery keeps its "another target
    // creature" semantics instead of silently going permissive.
    if (stapleTpl.distinct_targets) trig.distinct_targets = true;
    // Land base → the ETB is OPTIONAL and costs the spell's mana cost. A land is
    // free to play, so a free stapled spell is pure value; making it a "you may
    // pay {cost}" trigger restores the bargain. Creature/artifact bases stay
    // free — you already paid the base's full cost.
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

// Keywords implied by creature subtype — card data need not repeat these.
const SUBTYPE_KEYWORDS = { Angel: ['flying'], Dragon: ['flying'], Treefolk: ['reach'], Wall: ['defender'] };

// Append the subtype-implied keywords for `subtypes` onto `kw` in place (deduped).
// Shared by makeCard's eager injection AND intrinsicKeywords' re-derivation, so
// every keyword-build path applies the rule identically — a Dragon that bounces,
// dies-and-returns, or sheds an until-EOT grant keeps its flying.
function addSubtypeKeywords(subtypes, kw) {
  for (const st of subtypes) {
    for (const k of (SUBTYPE_KEYWORDS[st] || [])) {
      if (!kw.includes(k)) kw.push(k);
    }
  }
  return kw;
}

function applySubtypeKeywords(card) {
  addSubtypeKeywords(subtypesOf(card), card.keywords);
}

// Runtime instance-state keys owned by the engine — the copy-by-default loop
// below must never let a template inject these. A template declaring one is a
// card-data error (warned at instantiation, the field is ignored).
// MAINTENANCE: this denylist is the one list the copy-by-default inversion
// still requires by hand — when adding a NEW runtime field to card instances
// (in makeCard or anywhere downstream), add it here too, or a template
// declaring that key would be deep-copied straight onto the instance.
const MAKECARD_INSTANCE_KEYS = new Set([
  'iid', 'slotIdx', 'controller', 'owner', 'isToken',
  'tapped', 'sick', 'damage', 'tempPower', 'tempTou', 'permPower', 'permTou',
  // NB: dealtDeathtouch is a victim-side lethality mark — set on the creature
  // that RECEIVED deathtouch damage, not on the dealer (the name reads
  // backwards). The Godot port calls this concept lethal_marked. See audit
  // A2-10.
  'counters', 'dealtDeathtouch', 'killedBy', 'cantAttack', 'cantBlock',
  'cantAttackBy', 'cantBlockBy', 'damagedBySources', 'grantedBy',
  'eotGrants', 'typeGrants', 'modifiers', 'stickers', 'empowerRolls', 'subtypeRolls',
  // Assigned outside makeCard at runtime (steal / copy / bargain / charge /
  // build-on-draw systems) — a truthy template copyOf would trip
  // resetInPlayState's copy-revert, a template chargesLeft would shadow the
  // slot-derived charge count, etc.
  'tempControlUntilEot', 'copyOf', 'copySourceIid', 'bargainsNum',
  'chargesLeft', '_builtThisGame',
  // Assigned DURING makeCard but additively (recordStickerType never resets
  // the array), so a template-declared value wouldn't be rebuilt away — the
  // criterion for this list is "not unconditionally rebuilt at
  // instantiation," not just "assigned outside makeCard."
  'stickerTypes',
]);

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
    // Cross-slot distinctness (Roots and Branches / Sword and Sorcery — "another
    // target creature"). MUST be carried alongside target_slots, or cast legality
    // (tsIsLegalSet / isLegalAction) and the render highlight-drop read it off the
    // instance as undefined and silently skip the check — the same-target cast the
    // card forbids gets through. The stapled ETB path is unaffected (the flag rides
    // the synthesized trigger via mergeStapleInto, not this whitelist).
    distinct_targets: !!tpl.distinct_targets,
    // Legendary uniqueness enforced at cast time only (no SBA); the Legendary
    // supertype tag derives from this boolean via typesOf.
    legendary: !!tpl.legendary,
    // Deep-copy mutable fields for per-instance isolation (costReduction,
    // Severity, etc.). Mana production lives on the tap-ability (abilities),
    // which is deep-copied below — `mana` is just the primary-color label.
    cost: tpl.cost ? {...tpl.cost} : undefined,
    mana: tpl.mana, color: tpl.color,
    colors: Array.isArray(tpl.colors) ? tpl.colors.slice() : [],
    spend_mana_as_any_color: !!tpl.spend_mana_as_any_color,
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
    counters: {},                // named counters (verse, etc.) — bare resource, reset on leave-play
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
    // Comes-into-play-tapped lands (Deepseam Quarry). Honored in doPlayLand.
    enters_tapped: !!tpl.enters_tapped,
    triggers: (tpl.triggers || []).map(t => ({
      ...t,
      effects: (t.effects || []).map(e => ({...e})),
    })),
    // Stapled metadata for empower-target enumeration, sticker eligibility, etc.
    stapledFrom: tpl.stapledFrom,
  };
  // Copy-by-default for every other card-level field (the inverted whitelist).
  // The literal above carries only the fields needing bespoke copy semantics
  // (deep copies, default fills, slot handling); everything else the template
  // declares lands on the instance automatically as a JSON deep copy —
  // templates are pure JSON, the same rationale as staple synthesis (§3.10).
  // A new card-level flag is now a one-place change (card JSON + its reader);
  // forgetting makeCard can no longer silently drop it on the real game path.
  for (const k of Object.keys(tpl)) {
    if (k === 'tplId') continue; // instance identity comes from the argument
    if (MAKECARD_INSTANCE_KEYS.has(k)) {
      console.warn('makeCard: template "' + tplId + '" declares runtime-only field "' + k + '" — ignored');
      continue;
    }
    if (k in card) continue; // bespoke-copied above
    const v = tpl[k];
    card[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  }
  // Order: subtype-implied → stickers → permaBuffs → bonusTrigger.
  applySubtypeKeywords(card);
  applyStickersToCard(card);
  // permaBuffs: slot-persistent buffs from permanent_eot creatures (Elystra).
  // Shared with resetInPlayState (bounce/flicker recast).
  if (permaBuffs) applyPermaBuffsToCard(card, permaBuffs);
  // bonusTrigger: slot-persistent trigger (today written by the Architect's
  // Codex ability finalize — see finalizeBuild; boon extras can also seed
  // one). Stored as data so it survives save/load; condId form is required
  // (not closure).
  if (bonusTrigger && typeof bonusTrigger === 'object') {
    if (!Array.isArray(card.triggers)) card.triggers = [];
    card.triggers.push(cloneTriggerData(bonusTrigger));
  }
  // Regenerate text from effects/triggers/abilities (post-empower mutation).
  // custom_text:true cards keep hand-authored text (Endomorph, Codex, Elystra, Steal).
  card.text = describeCardText(card);
  return card;
}

// Copy a trigger object for attachment to a card or run slot. Audit A3-13
// (Joe's ruling, PR #98 round 4): attached triggers are EXACT copies at
// copy-time that then diverge independently — so `condition` (an array, or a
// nested {op, terms} tree) must be deep-copied, not shared by reference.
// Pre-fix the consumer-side spreads cloned `effects` per element but aliased
// `condition`: every game's Mercurial card pointed INTO the module-level
// MERCURIAL_TRIGGER_POOL, one in-place mutation away from contaminating the
// pool for every later game (normalizeCardEffects already rewrites the
// adjacent `effects` field in place — the exact pattern that would bite).
function cloneTriggerData(trig) {
  const cond = trig.condition;
  return {
    ...trig,
    condition: (cond && typeof cond === 'object') ? JSON.parse(JSON.stringify(cond)) : cond,
    effects: (trig.effects || []).map(e => ({...e})),
  };
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
    counters: {},
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
    triggers: undefined,
  };
  return card;
}

// Intrinsic = template + stickers (NOT runtime grants). Used by
// clearRestrictionsFromSource. Stapled-aware so Knight+Spirit retains both halves' keywords.
// Copy-aware (audit A4-5): while card.copyOf is set (become_copy_of), the
// copied template's printed keywords ARE the card's intrinsic identity — so
// every re-derive path (the CLEANUP eotGrants rebuild, grant strips, trophy
// claimableKeywords) preserves a copy's flying instead of resurrecting the
// base template's flash. resetInPlayState clears copyOf before its own
// re-derive, so the leave-play revert still lands on the base identity.
function intrinsicKeywords(card) {
  if (card.isToken) {
    const tpl = TOKENS[card.tplId];
    return (tpl && tpl.keywords) ? tpl.keywords.slice() : [];
  }
  const tpl = (card.copyOf && CARDS[card.copyOf])
    ? CARDS[card.copyOf]
    : card.stapledFrom
    ? synthesizeStapledTemplate(card.stapledFrom.baseTplId,
                                 card.stapledFrom.stapledTpls)
    : CARDS[card.tplId];
  const kw = (tpl && tpl.keywords) ? tpl.keywords.slice() : [];
  for (const sId of (card.stickers || [])) {
    const s = STICKERS[sId];
    if (s && s.kind === 'keyword' && !kw.includes(s.keyword)) kw.push(s.keyword);
  }
  // Subtype-implied keywords are part of the intrinsic set, so every re-derive
  // path (resetInPlayState on leave-play, the EOT eotGrants cleanup) preserves
  // them rather than silently dropping a Dragon's flying / a Wall's defender.
  addSubtypeKeywords(subtypesOf(card), kw);
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
      // cloneTriggerData (audit A3-13): the pick must not alias the global
      // pool entry's condition array.
      bonus = cloneTriggerData(pick);
    }
    if (bonus) {
      // Audit A3-5 stale-save guard: a persisted bonusTrigger (or embedded
      // slot triggerPool pick) predating an id rename would silently no-op
      // for the whole run. Warn loudly; still attach (behavior-neutral).
      const refs = { unknownKinds: [], unknownTokens: [], unknownAtomics: [], unknownEvents: [] };
      collectUnknownTriggerRefs(bonus, 'bonusTrigger(' + entry.tplId + ')', refs);
      const bad = refs.unknownKinds.concat(refs.unknownTokens, refs.unknownAtomics, refs.unknownEvents);
      if (bad.length) console.warn('makePlayer: slot bonusTrigger references unknown ids:', bad.join(', '));
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
  // `innate` is a keyword (native or sticker-granted) — applyStickersToCard
  // has already populated card.keywords by now, so read it from there.
  const isInnate = c => (c.keywords || []).includes('innate');
  const innate = [];
  const rest = [];
  for (const c of cards) (isInnate(c) ? innate : rest).push(c);
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
    const drawnPortion = hand.filter(c => !isInnate(c));
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
    // Trigger queue/budget. Drained at priority-round open. triggerChainDepth
    // is (despite the name) a per-stack-episode trigger BUDGET — it counts
    // every trigger resolution since the stack last emptied, not nesting
    // depth — and kills loops at TRIGGER_DEPTH_CAP (audit A3-3; see the cap
    // const's comment for why width is the deliberate choice).
    pendingTriggers: [],
    triggerChainDepth: 0,
    // Delayed triggers fire at scheduled events (endStep). Otherworldly Journey etc.
    delayedTriggers: [],
    // Temporary permissions to cast cards from public zones (Seal-Thief Courier).
    // Shape: {controller, cardIid, from_zone, duration, spend_as_any_color}.
    castPermissions: [],
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

// Like findCard but searches every zone (battlefield/exile/graveyard/hand) —
// needed by the copy primitive, whose target has just been moved to exile.
function findCardAnyZone(iid) {
  for (const who of ['you','opp']) {
    for (const z of ['battlefield','exile','graveyard','hand','library']) {
      const arr = G[who][z];
      const c = Array.isArray(arr) ? arr.find(x => x.iid === iid) : null;
      if (c) return { card: c, controller: who, zone: z };
    }
  }
  return null;
}

// The creature this source (The False Witness) is/was copying — its
// `copySourceIid` link. On leave-play the witness has left the battlefield, so
// read the link off the zone-change event's subject_card (the leaving witness,
// which retains the link through resetInPlayState); fall back to a live lookup.
function copySourceRef(ctx) {
  const w = (ctx.event && ctx.event.subject_card)
    || ctx.sourceCard
    || (ctx.sourceIid != null ? (findCard(ctx.sourceIid) || {}).card : null);
  const iid = w && w.copySourceIid;
  return (iid != null) ? { kind: 'creature', iid } : null;
}

// Standard fizzle-on-missing-target preamble for EFFECTS handlers.
//   const f = resolveTarget(ctx, target);
//   if (!f) return;
function resolveTarget(ctx, target) {
  // Missing/iid-less target → the SAME logged fizzle as a stale target
  // (audit A4-17). Before this guard a misauthored no-target effect threw a
  // raw TypeError out of executeAction mid-resolution, stranding the spell
  // in NO zone (popped from hand and stack, never reaching the graveyard).
  if (!target || target.iid == null) {
    log(`${ctx.sourceName} fizzles — no target.`, 'sp');
    return null;
  }
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
    if (!item || !item.card || item.kind === 'trigger' || item.kind === 'ability') return null;
    if (G.stack.indexOf(item) < 0) return null;
    return { kind: 'spell', card: item.card, controller: item.controller, stackItem: item };
  }
  return null;
}

// Resolve + validate a Stapler splice pair from a targets[] array. Returns
// { reason } (human-readable invalidity) or the resolved pair
// { baseR, stapleR, baseCard, stapleCard, canonBaseTpl, canonStapleTpl }.
// The ONE definition of "can these two be stapled", shared by:
//   - isLegalAction's activateAbility case — pair validity is an ACTIVATION
//     check, so an invalid pair is rejected BEFORE any cost is paid (MtG
//     601.2h via 602.2b: costs are paid as the last part of activation; an
//     illegal activation rewinds with nothing spent);
//   - resolveAbilityEntry + the apply_in_game_splice handler at resolution —
//     where, per MtG resolution-fizzle semantics (608.2b-adjacent), costs
//     STAY paid. Since A3-2 (abilities take stack entries) a response window
//     exists between activation and resolution, so the pair CAN decay in
//     between — the resolution-time re-check is load-bearing, not just
//     drift insurance.
function resolveSplicePair(allTargets) {
  if (!Array.isArray(allTargets) || allTargets.length < 2) return { reason: 'needs two targets.' };
  const t0 = allTargets[0], t1 = allTargets[1];
  if (!t0 || !t1) return { reason: 'target missing.' };
  const r0 = resolveStackOrPermanent(t0);
  const r1 = resolveStackOrPermanent(t1);
  if (!r0 || !r1) return { reason: 'target gone.' };
  if (r0.card.iid === r1.card.iid) return { reason: "can't staple a card to itself." };
  const [canonBaseTpl, canonStapleTpl, swapped] = canonicalSplicePair(
    r0.card.tplId, r1.card.tplId);
  const baseR = swapped ? r1 : r0;
  const stapleR = swapped ? r0 : r1;
  const baseCard = baseR.card;
  const stapleCard = stapleR.card;
  if (!isSpliceableBase(baseCard.tplId)) {
    return { reason: `${baseCard.name} can't be a splice base.` };
  }
  if (stapleChainOf(stapleCard).length > 0) {
    return { reason: `${stapleCard.name} is already stapled.` };
  }
  if (!isCompatibleStaplePair(baseCard.tplId, stapleCard.tplId)) {
    return { reason: `${baseCard.name} and ${stapleCard.name} aren't compatible.` };
  }
  return { baseR, stapleR, baseCard, stapleCard, canonBaseTpl, canonStapleTpl };
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

// ONE shared "does this lord's static buff apply to this target?" predicate —
// the single answer for BOTH halves of a static_buff: the live stat half
// (getStats) and the reconciled keyword half (applyStaticKeywordGrants).
// Audit A4-2 / A2-9: these gates used to live as two hand-synced copies with
// divergent guards — the stat copy lacked the Creature check (so a
// subtype-free lord buffed lands), and the keyword copy never re-asked the
// question after granting (so grants went stale on steal/type change).
// filter.controller:'self' = "creatures you control" (shares lord controller).
//
// A4-14: lord-buff filters evaluate through matchFilterNoStats — the
// stats-free view. The four stat-bound axes (max/min power/toughness) call
// getStats, which walks the lord loop, which lands back here: a stat-bounded
// static_buff filter would recurse getStats ↔ matchFilter to a RangeError on
// every stats read (AI scoring, SBAs, render, combat). This predicate is the
// one funnel through which BOTH halves (stat + keyword) reach matchFilter,
// so the guard lives here; boot validation additionally REJECTS stat bounds
// inside static_buffs until that semantics is properly designed
// (validateAllCardEffects, loud).
function lordBuffApplies(lord, lordCtrl, buff, target, tgtCtrl) {
  if (lord.iid === target.iid) return false;   // lords buff OTHER creatures
  if (!hasType(target, 'Creature')) return false;
  if (!matchFilterNoStats(target, buff.filter, tgtCtrl, lordCtrl)) return false;
  if (buff.subtype && !hasType(target, buff.subtype)) return false;
  return true;
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
      const allPermanents = [   // every permanent, lands included (A2-9 rename)
        ...G.you.battlefield.map(c => ({ card: c, controller: 'you' })),
        ...G.opp.battlefield.map(c => ({ card: c, controller: 'opp' })),
      ];
      for (const { card: lord, controller: lordCtrl } of allPermanents) {
        if (!lord.static_buffs) continue;
        for (const buff of lord.static_buffs) {
          if (!lordBuffApplies(lord, lordCtrl, buff, card, owner.controller)) continue;
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
  // Derive subtype-implied keywords: raw templates (draft scoring) don't carry
  // them, and in-play instances already do — so this is idempotent for both.
  const kw = addSubtypeKeywords(subtypesOf(card), (card.keywords || []).slice());
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
  return G[who].battlefield.filter(c => {
    if (filter === 'permanent') return isPermanent(c);   // cross-type alias
    // Otherwise the filter names a card type — 'creature' → Creature, 'land' →
    // Land. A chooses() filter IS a type, so every type narrows identically
    // (no per-type special-casing): capitalize the tag and match via hasType.
    const tag = filter ? filter[0].toUpperCase() + filter.slice(1) : 'Creature';
    return hasType(c, tag);
  });
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

// Human-facing `chooses()` gate (GAP 2 / audit A4-7): when the player forced
// to choose is the HUMAN, pause resolution and prompt instead of auto-picking
// — the choice is the chooser's by the card's own text. ONE shared gate for
// all three resolution loops (spell / trigger / activated ability); before
// A4-7 only the spell resolver had it, so a trigger-sourced edict (Heir to
// the Burnt House dying under the AI) silently sacrificed a permanent of the
// engine's choosing. Stashes the chosen-dependent trailing effects
// (sacrifice/annihilate/rip) on pendingEdictChoice; doEdictChoice replays
// them once the human picks. Returns true → the caller BREAKS out of its
// effect loop (resolution defers); false → fall through to the handler's
// auto-pick (AI chooser, or an empty pool which the handler logs).
// Chooser derivation matches the handler exactly: the established player
// target (curTgt from a target() step), else a player in ctx.allTargets,
// else the controller's opponent.
function maybeDeferHumanChooses(ctx, eff, effList, curTgt) {
  const playerTgt = (curTgt && curTgt.kind === 'player') ? curTgt
    : (ctx.allTargets || []).find(t => t && t.kind === 'player');
  const chooser = playerTgt ? playerTgt.who : opp(ctx.controller);
  if (chooser !== 'you') return false;
  const choosesFilter = eff.filter || 'creature';
  const pool = choosesEligiblePool(chooser, choosesFilter);
  if (pool.length === 0) return false;  // handler logs "no <noun> to choose"
  const idx = effList.indexOf(eff);
  G.pendingEdictChoice = {
    who: chooser,
    source: ctx.sourceName,
    sourceIid: ctx.sourceIid,
    controller: ctx.controller,
    filter: choosesFilter,
    pool: pool.map(c => choosesDescriptor(c, chooser)),
    trailingEffects: effList.slice(idx + 1).map(e => ({ ...e })),
  };
  const noun = choosesFilter;   // 'creature' | 'permanent' | 'land'
  log(`${ctx.sourceName}: ${pname(chooser)} must choose a ${noun} to lose.`, 'sp');
  return true;
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
  // The False Witness doppelganger ETB (exile + become a copy) is a two-for-one:
  // it removes an opponent's creature AND turns this 0/1 into a copy of it (a
  // real body, at flash speed). Value the whole package strongly — scanning all
  // effects, not just effects[0] — so the AI actually casts and drafts it.
  if (ab.effects.some(e => e && e.kind === 'become_copy_of')) return 16;
  if (ab.effects.some(e => e && e.kind === 'grant_cast_permission')) return 6;
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
  let unclassifiedValuation = [], staleValuation = [], unscoredValuation = [];
  if (typeof VALUED_EFFECT_KINDS !== 'undefined' && typeof UNVALUED_EFFECT_KINDS !== 'undefined') {
    const classified = new Set([...VALUED_EFFECT_KINDS, ...UNVALUED_EFFECT_KINDS]);
    unclassifiedValuation = kinds.filter(k => !classified.has(k));
    staleValuation = [...classified].filter(k => !EFFECTS[k]);
  }
  // A7-2: being ON the VALUED checklist does not prove the AI's cast scorer
  // actually has a branch for the kind. Probe each VALUED kind through
  // spellValueForEffects (the untargeted-cast valuer — it has NO default
  // fallthrough, so an unbranched kind scores exactly 0): it must score > 0,
  // EXCEPT kinds that price 0 there on purpose because their value rides a
  // sibling effect (`sacrifice` rides the edict `chooses`). This catches the
  // silent class the set-algebra above cannot — VALUED-claimed but cast-scored
  // 0, so the AI never casts an untargeted spell of that kind (the add_counter
  // hole). spellValueForEffects lives in ai.js (loaded after) — read lazily.
  if (typeof VALUED_EFFECT_KINDS !== 'undefined' && typeof spellValueForEffects === 'function') {
    const ZERO_PRICE_VALUED = new Set(['sacrifice']);
    const vprobe = { amount: 1, power: 1, toughness: 1, count: 1, severity: 1,
      token_id: 'soldier_w_1_1', keyword: 'flying', from_zone: 'library', to_zone: 'hand' };
    unscoredValuation = [...VALUED_EFFECT_KINDS].filter(k => {
      if (ZERO_PRICE_VALUED.has(k)) return false;
      let v = 0;
      try { v = spellValueForEffects([{ ...vprobe, kind: k }]) || 0; } catch (_) { v = 0; }
      return v <= 0;
    });
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
  return { unclassifiedValuation, staleValuation, unscoredValuation, missingText,
           unclassifiedCastScoring, staleCastScoring };
}

// ----- Mana -----
function canPayFromPool(pool, cost) {
  if (!cost) return true;
  const m = {...pool};
  if (cost.spend_as_any_color) {
    let needed = cost.C || 0;
    for (const c of COLORS) needed += cost[c] || 0;
    const available = (m.W||0)+(m.U||0)+(m.B||0)+(m.R||0)+(m.G||0)+(m.C||0);
    return available >= needed;
  }
  for (const c of COLORS) if ((cost[c]||0) > (m[c]||0)) return false;
  for (const c of COLORS) m[c] -= (cost[c]||0);
  return ((m.W||0)+(m.U||0)+(m.B||0)+(m.R||0)+(m.G||0)+(m.C||0)) >= (cost.C||0);
}
function hasSpendManaAsAnyColor(who) {
  return G[who].battlefield.some(c => c.spend_mana_as_any_color);
}
function colorsOfCard(card) {
  if (!card) return [];
  if (Array.isArray(card.colors)) return card.colors.filter(c => COLORS.includes(c));
  const colors = [];
  if (card.cost) {
    for (const c of COLORS) if ((card.cost[c] || 0) > 0) colors.push(c);
  }
  // Cost-less cards (tokens) carry only the single printed `color` — fall
  // back to it so their color identity isn't empty (audit A4-6: matchFilter's
  // color/not_color checks route through this full-identity list).
  if (!colors.length && card.color && COLORS.includes(card.color)) colors.push(card.color);
  return colors;
}
function resolvedManaCost(rawCost, sourceCard, who) {
  if (!rawCost) return rawCost;
  const cost = {...rawCost};
  if (cost.colors_of_source) {
    if (!sourceCard) {
      throw new Error('colors_of_source mana cost must be resolved against a source card');
    }
    delete cost.colors_of_source;
    for (const c of colorsOfCard(sourceCard)) cost[c] = (cost[c] || 0) + 1;
  }
  if (who && hasSpendManaAsAnyColor(who)) cost.spend_as_any_color = true;
  return cost;
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

function effectiveCastCostWithPermission(card, permission) {
  const cost = effectiveCastCost(card);
  if (!cost || !permission || !permission.spend_as_any_color) return cost;
  return Object.assign({}, cost, { spend_as_any_color: true });
}

function findCastableSpell(who, cardIid) {
  const handIdx = G[who].hand.findIndex(c => c.iid === cardIid);
  if (handIdx >= 0) {
    return { card: G[who].hand[handIdx], zone: 'hand', zoneOwner: who, index: handIdx, permission: null };
  }
  for (const perm of (G.castPermissions || [])) {
    if (perm.controller !== who || perm.cardIid !== cardIid) continue;
    const zoneName = perm.from_zone || 'exile';
    for (const owner of ['you', 'opp']) {
      const zone = G[owner][zoneName];
      if (!Array.isArray(zone)) continue;
      const idx = zone.findIndex(c => c.iid === cardIid);
      if (idx >= 0) {
        return { card: zone[idx], zone: zoneName, zoneOwner: owner, index: idx, permission: perm };
      }
    }
  }
  return null;
}

function castableSpellEntries(who) {
  const out = G[who].hand.map((card, index) =>
    ({ card, zone: 'hand', zoneOwner: who, index, permission: null }));
  const seen = new Set(out.map(e => e.card.iid));
  for (const perm of (G.castPermissions || [])) {
    if (perm.controller !== who || seen.has(perm.cardIid)) continue;
    const found = findCastableSpell(who, perm.cardIid);
    if (found) {
      out.push(found);
      seen.add(found.card.iid);
    }
  }
  return out;
}

// ----- Mana payment (audit A1-2: ONE solver for legality AND payment) -----
// solveManaPayment is the single mana brain. It computes a concrete payment
// plan — which untapped sources to tap, and which color each choose-source
// produces — such that pool + production covers `cost`. canPayPotential
// ("can you afford this?") asks whether a plan exists; payMana executes the
// plan verbatim. Pre-fix these were two ALGORITHMS — a backtracking checker
// and a greedy payer (tapSourceProducing, fixed W,U,B,R,G order) — that
// could disagree on partially-overlapping choose-sources: the checker
// approved the cast, the payer spent the wrong dual first, hit a dead end
// mid-payment and threw out of executeAction, leaving half-applied state
// (a land wrongly tapped, its mana consumed, the spell still in hand). Now
// the full solution is found BEFORE any mutation, so payment is atomic by
// construction: it fully happens or nothing changes.
//
// Returns {cost, taps: [{card, color, amounts}]} or null if unpayable.
// `cost` in the plan is the resolvedManaCost form; `color` is the chosen
// color for a choose-source (null for fixed sources, which add `amounts`
// wholesale). Taps hold live card references — execute the plan immediately
// (it doesn't survive intervening state changes).
function solveManaPayment(who, cost, excludeIid) {
  if (!cost) return { cost: null, taps: [] };
  // Invariant: colors_of_source costs must already be source-resolved by the caller.
  cost = resolvedManaCost(cost, null, who);
  const pool = {...G[who].mana};
  // §3.9: lands and creature dorks are one pool of tap-for-mana abilities.
  // Fixed sources add their amounts wholesale; multi-color (choose) sources
  // are the solver's choice points.
  const fixed = [];
  const chooses = [];
  for (const c of G[who].battlefield) {
    if (c.tapped) continue;
    // A source tapped as the ability's own {T} cost can't also pay its mana cost
    // (Deepseam Quarry's reanimate ability taps itself, so it doesn't fund {2}).
    if (excludeIid != null && c.iid === excludeIid) continue;
    if (hasType(c, 'Creature') && c.sick) continue;  // sick dork can't tap
    const ab = manaAbilityOf(c);
    if (!ab) continue;
    const eff0 = ab.effects[0];
    if (eff0.choose) chooses.push({ card: c, colors: manaEffectColors(eff0) });
    else fixed.push({ card: c, amounts: eff0.amounts });
  }
  // Feasibility: fold every fixed source into the pool and backtrack over
  // choose-source color assignments (the search the old canPayPotential ran
  // — now the single authority), recording the winning assignment.
  const base = {...pool};
  for (const f of fixed) {
    for (const k of Object.keys(f.amounts)) base[k] = (base[k] || 0) + f.amounts[k];
  }
  const assignment = new Array(chooses.length);
  const tryAssign = (idx, p) => {
    if (idx === chooses.length) return canPayFromPool(p, cost);
    for (const color of chooses[idx].colors) {
      const next = {...p};
      next[color] = (next[color] || 0) + 1;
      if (tryAssign(idx + 1, next)) { assignment[idx] = color; return true; }
    }
    return false;
  };
  if (!tryAssign(0, base)) return null;
  // The fold proved payability with EVERY source tapped; trim the taps the
  // payment doesn't need. Trim order encodes the old payer's observable
  // preferences: drop CHOOSE sources first (keep flexible sources untapped —
  // a basic is spent before City of Brass) and drop later battlefield slots
  // before earlier ones (the payer taps front-to-back). Pool mana is never
  // "tapped", so maximal trimming also preserves pay-from-pool-first.
  const taps = fixed.map(f => ({ card: f.card, color: null, amounts: f.amounts }));
  for (let i = 0; i < chooses.length; i++) {
    taps.push({ card: chooses[i].card, color: assignment[i], amounts: null });
  }
  const covers = (skip) => {
    const p = {...pool};
    for (let i = 0; i < taps.length; i++) {
      if (skip.has(i)) continue;
      const t = taps[i];
      if (t.color) p[t.color] = (p[t.color] || 0) + 1;
      else for (const k of Object.keys(t.amounts)) p[k] = (p[k] || 0) + t.amounts[k];
    }
    return canPayFromPool(p, cost);
  };
  const dropped = new Set();
  // chooses sit after fixed in `taps`, so a single back-to-front walk tries
  // dropping chooses first (reversed), then fixed (reversed).
  for (let i = taps.length - 1; i >= 0; i--) {
    dropped.add(i);
    if (!covers(dropped)) dropped.delete(i);
  }
  return { cost, taps: taps.filter((_, i) => !dropped.has(i)) };
}
// Can `who` pay `cost` from pool + untapped sources? Thin wrapper over the
// solver — legality and payment share one brain and cannot disagree (A1-2).
function canPayPotential(who, cost, excludeIid) {
  return solveManaPayment(who, cost, excludeIid) !== null;
}
// Pay `cost`: solve, then execute the plan — tap exactly the planned sources
// (each choose-source produces its assigned color), then deduct the resolved
// cost from the pool. Throws WITHOUT mutating anything when no plan exists
// (callers gate on canPayPotential via isLegalAction, so a throw here means
// the caller skipped validation — and the board is still intact).
function payMana(who, cost) {
  if (!cost) return;
  const plan = solveManaPayment(who, cost, null);
  if (!plan) {
    throw new Error('Mana payment failed (unaffordable): ' + JSON.stringify(cost));
  }
  const pool = G[who].mana;
  for (const t of plan.taps) {
    t.card.tapped = true;
    if (t.color) pool[t.color] = (pool[t.color] || 0) + 1;
    else for (const k of Object.keys(t.amounts)) pool[k] = (pool[k] || 0) + t.amounts[k];
  }
  if (plan.cost) deductFromPool(pool, plan.cost);
}
function deductFromPool(pool, cost) {
  if (cost && cost.spend_as_any_color) {
    let needed = cost.C || 0;
    for (const c of COLORS) needed += cost[c] || 0;
    for (const c of ['C', ...COLORS]) {
      if (!needed) break;
      const used = Math.min(needed, pool[c] || 0);
      pool[c] -= used;
      needed -= used;
    }
    return;
  }
  for (const c of COLORS) pool[c] -= (cost[c]||0);
  let generic = cost.C || 0;
  for (const c of ['C', ...COLORS]) {
    if (!generic) break;
    const used = Math.min(generic, pool[c]||0);
    pool[c] -= used;
    generic -= used;
  }
}
// (tapSourceProducing — the greedy auto-tapper — was deleted with the A1-2
// payer unification: payMana now executes solveManaPayment's plan instead.)

// ----- Effects -----

// Damage with deathtouch/lifelink/trample. Source: ctx.sourceCard or findCard(ctx.sourceIid).
function applyDamageFrom(ctx, target, amt) {
  // `!(amt > 0)` (not `amt <= 0`) also rejects undefined/NaN: a damage effect
  // authored without `amount` used to slip past `undefined <= 0` and write
  // `damage = NaN`, making the creature immune to ALL damage until cleanup
  // (audit A4-17). Missing target → the standard logged fizzle, not a
  // TypeError out of executeAction.
  if (!(amt > 0)) return;
  if (!target) {
    log(`${ctx.sourceName} fizzles — no target.`, 'sp');
    return;
  }
  let sourceCard = ctx.sourceCard || null;
  if (!sourceCard && ctx.sourceIid != null) {
    const sf = findCard(ctx.sourceIid);
    sourceCard = sf ? sf.card : null;
  }
  const hasDeathtouch = sourceCard && sourceCard.keywords && sourceCard.keywords.includes('deathtouch');
  const hasLifelink  = sourceCard && sourceCard.keywords && sourceCard.keywords.includes('lifelink');
  // Trample spill applies to effect damage (deliberate design — trample
  // stickers on damaging sorceries work via this branch) but NOT to fight
  // damage (audit A4-9, design ruling): a fight is two creatures dealing
  // power damage to each other — canon §902.2 scopes trample to combat, the
  // fight cards' text promises only mutual damage, and the fight handler's
  // own intent rider list (deathtouch/lifelink) omits trample. The fight
  // handler sets ctx.fightDamage on its per-combatant contexts.
  const hasTrample   = !ctx.fightDamage
    && sourceCard && sourceCard.keywords && sourceCard.keywords.includes('trample');

  if (target.kind === 'player') {
    damagePlayer(target.who, amt, ctx.sourceName, ctx.sourceIid);
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
    // dealtDeathtouch = victim-side mark: this creature RECEIVED deathtouch
    // damage (despite the name; Godot calls it lethal_marked). See audit A2-10.
    if (hasDeathtouch) f.card.dealtDeathtouch = true;
    recordDamage(f.card, sourceCard, ctx.controller);
    log(`${ctx.sourceName} deals ${toCreature} to ${f.card.name}.`, 'dmg');
    if (spill > 0) {
      damagePlayer(f.controller, spill, `${ctx.sourceName} (trample)`, ctx.sourceIid);
    }
  }
  if (hasLifelink) {
    G[ctx.controller].life += amt;
    log(`${ctx.sourceName} (lifelink) — ${pname(ctx.controller)} gains ${amt} life.`, 'sp');
    emit({type: 'life_changed', who: ctx.controller, delta: amt, source_iid: ctx.sourceIid});
  }
}

// Resolve the two combatants of a `fight` from its `operands`. Each operand is a
// {slot:N} reference (the creature chosen for that target slot, read from
// ctx.allTargets like apply_in_game_splice) or {select:'highest_power_yours'} (a
// computed pick — our biggest creature, the auto-pick the one-sided fight cards
// use). Slot operands resolve first so a {select} avoids picking the other
// combatant. Returns an array of {card, controller} (or null) aligned to operands.
function resolveFightOperands(ctx, operands) {
  const ops = Array.isArray(operands) ? operands : [];
  const out = new Array(ops.length).fill(null);
  const used = new Set();
  ops.forEach((op, i) => {
    if (op && op.slot != null && Array.isArray(ctx.allTargets)) {
      const r = resolveTarget(ctx, ctx.allTargets[op.slot]);
      out[i] = r;
      if (r) used.add(r.card.iid);
    }
  });
  ops.forEach((op, i) => {
    if (out[i]) return;
    // The auto-fill exists for {select} computed operands ONLY. A {slot}
    // operand whose chosen creature is gone at resolution stays null so the
    // fight handler's !a||!b guard fizzles it (audit A4-3 — this pass used to
    // fill failed slot references too, conscripting the caster's next-biggest
    // creature as the replacement combatant: friendly fire instead of fizzle).
    if (op && op.slot != null) return;
    const ours = G[ctx.controller].battlefield
      .filter(c => hasType(c, 'Creature') && !used.has(c.iid));
    if (!ours.length) return;
    ours.sort((a, b) => getStats(b)[0] - getStats(a)[0]);
    out[i] = { card: ours[0], controller: ctx.controller };
    used.add(ours[0].iid);
  });
  return out;
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
// Leave-play emit, optionally DEFERRED into a batch (A4-4). The mass-scope
// affect_creature path collects all leavers first (pass 1) and emits them
// together afterwards with the whole batch as extraSources (pass 2) —
// checkDeaths' simultaneity contract. Single-target callers pass no batch
// and emit immediately, exactly as before. sourceIid follows the A3-11
// attribution rule per-arm: undefined for destroy (causality is killedBy),
// the effect's source for bounce/exile.
function deferOrEmitLeave(batch, card, controller, destZone, sourceIid) {
  if (batch) {
    batch.push({ card, controller, dest: destZone, sourceIid });
    return;
  }
  emitLeavesBattlefield(card, controller, destZone, undefined, sourceIid);
}
function affectOneCreature(ctx, f, sevArg, batch) {
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
    deferOrEmitLeave(batch, card, f.controller, 'hand', ctx.sourceIid);
    return;
  }
  if (sev === 3) {
    if (f.card.keywords.includes('indestructible')) {
      log(`${f.card.name} is indestructible — ${ctx.sourceName} fizzles.`, 'sp');
      return;
    }
    f.card.killedBy = ctx.controller;
    moveToGraveyard(f.card, f.controller, batch);
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
  deferOrEmitLeave(batch, card, f.controller, 'exile', ctx.sourceIid);
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
  // `take_control` (Deepseam Quarry): the reanimator takes control even when the
  // card's owner is the opponent. Control ≠ ownership — owner is preserved, so the
  // card still returns to the opp's graveyard when it next leaves play.
  const ctrl = post.take_control ? ctx.controller : (card.owner || ctx.controller);
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

// Library-search filter match. Shorthands emit string filters ('creature',
// 'land') while hand-authored effects may carry object filters ({type, sub}).
// Normalize both shapes so engine, UI, and legal-action enumeration agree.
function normalizeSearchFilter(filter) {
  if (!filter) return {};
  if (typeof filter === 'string') {
    return { type: filter[0].toUpperCase() + filter.slice(1).toLowerCase() };
  }
  return filter;
}
function matchesSearchFilter(card, filter) {
  filter = normalizeSearchFilter(filter);
  if (filter.type && !hasType(card, filter.type)) return false;
  if (filter.sub && !hasType(card, filter.sub)) return false;
  if (filter.subtype && !hasType(card, filter.subtype)) return false;
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
    // sourceIid rides along so doSearchPick can attribute its zone-change
    // emit to the searching card (audit A3-6).
    G.pendingSearch = { who: 'you', filter, source: ctx.sourceName, sourceIid: ctx.sourceIid };
    log(`${ctx.sourceName} — choose a card from your library.`, 'sp');
    return;
  }
  const card = matches.slice().sort((a, b) => costTotalCard(b) - costTotalCard(a))[0];
  const idx = lib.findIndex(c => c.iid === card.iid);
  lib.splice(idx, 1);
  G[ctx.controller].hand.push(card);
  shuffle(lib);
  log(`${pname(ctx.controller)} searches for ${card.name}.`, 'sp');
  // A3-6: a tutor is a library→hand move like any other.
  emitZoneChange(card, ctx.controller, 'library', 'hand', undefined, ctx.sourceIid);
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
    // sourceIid rides along so doDiscard can attribute its zone-change emit
    // to the card that forced the discard (audit A3-6).
    G.forcedDiscard = { who: 'you', remaining: n, source: ctx.sourceName, sourceIid: ctx.sourceIid };
    log(`${ctx.sourceName} — choose ${n} card(s) to discard.`, 'sp');
    return;
  }
  const sorted = tp.hand.slice().sort((a, b) => costTotalCard(a) - costTotalCard(b));
  for (let i = 0; i < n; i++) {
    const idx = tp.hand.findIndex(c => c.iid === sorted[i].iid);
    if (idx < 0) continue;
    const discarded = tp.hand.splice(idx, 1)[0];
    tp.graveyard.push(discarded);
    // A3-6: discards are announced — card_moves(hand, graveyard) fires.
    emitZoneChange(discarded, who, 'hand', 'graveyard', undefined, ctx.sourceIid);
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
  shuffle(lib);
  log(`${pname(ctx.controller)} fetches ${card.name}${post && post.tap ? ' (tapped)' : ''}.`, 'sp');
  // The arrival goes through the ONE battlefield door (audit A4-20):
  // placeCardOnBattlefield mints the §3.7 fresh iid, sets summoning sickness
  // unless hasted, applies post (tap), and emits the sourced ETB zone-change.
  // The old bespoke push skipped all of that — harmless for the five
  // land-only users, but a creature fetch would have arrived attack-ready
  // with its mint-time iid preserved.
  placeCardOnBattlefield(ctx, card, 'library', post);
  // Mirror the spell resolver's defensive sick=false for non-creatures
  // (lands/artifacts have no summoning-sickness concept).
  if (!hasType(card, 'Creature')) card.sick = false;
}

// Endomorph's trophy table — which absorbable keyword to take when a kill
// offers several. Higher = juicier. Unlisted keywords rank 0: still
// absorbable, picked last (ties keep the victim's intrinsic keyword order).
const ABSORB_KEYWORD_PRIORITY = {
  flying: 4, indestructible: 4,
  lifelink: 3, deathtouch: 3, hexproof: 3, trample: 3,
  haste: 2, vigilance: 2, first_strike: 2, flash: 2,
  reach: 1, menace: 1,
};

// Legacy save safety: older Codex outputs used bare-name token ids ('goblin'
// etc.). Module-scope (not inside create_tokens) so the EFFECT_SCHEMA
// create_tokens validator accepts the same aliases the handler resolves.
const TOKEN_ALIAS = {
  goblin: 'goblin_r_1_1',
  soldier: 'soldier_w_1_1',
  spirit: 'spirit_w_1_1',
  bear: 'bear_g_2_2',
  saproling: 'saproling_g_1_1',
};

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
      let n = 0;
      for (const st of creaturesInScope(ctx, params.scope)) {
        const f = findCard(st.iid);
        if (!f) continue;
        applyTo(f.card, p, t);
        n++;
      }
      // Count-based mass log (matches grant_keyword's mass arm) — emitted
      // after the recipient list is known, so it's scope-truthful.
      log(`${ctx.sourceName} gives +${p}/+${t}${perm ? '' : ' EOT'} to ${n} creature${n === 1 ? '' : 's'}.`, 'sp');
      return;
    }
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const p = params.power || 0, t = params.toughness || 0;
    applyTo(f.card, p, t);
    if (perm) log(`Put +${p}/+${t} on ${f.card.name}.`, 'sp');
    else log(`${f.card.name} gets +${p}/+${t} EOT.`, 'sp');
  },
  // Counters. A named `counter` (e.g. "verse") is a bare resource stored in
  // card.counters; it does NOT change P/T. Otherwise power/toughness add a
  // +1/+1 counter (permPower/permTou stat sum). Both reset on leave-play.
  add_counter(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (params.counter) {
      const n = params.amount || 1;
      if (!f.card.counters) f.card.counters = {};
      f.card.counters[params.counter] = (f.card.counters[params.counter] || 0) + n;
      const noun = n === 1 ? `a ${params.counter} counter` : `${n} ${params.counter} counters`;
      log(`Put ${noun} on ${f.card.name}.`, 'sp');
      return;
    }
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
    // Zone-change events carry the dying card as `subject_card` (NOT `card`) —
    // same payload rename that broke bargain_sticker_other after the E1
    // migration. Reading the dead `event.card` made EVERY absorb fizzle.
    const victim = ctx.event && ctx.event.subject_card ? ctx.event.subject_card : null;
    if (!victim) {
      log(`${ctx.sourceName} absorb fizzles — no victim recorded.`, 'sp');
      return;
    }
    // Resolve the absorber: the live battlefield card, or its graveyard
    // corpse when Endomorph died in the same exchange (mutual combat kill —
    // resetInPlayState preserves slotIdx, and the corpse object is still
    // mutable, so the reward persists to the right run slot AND shows on the
    // dead card). iid scan, not tplId: each cloned Endomorph credits its own
    // slot.
    const live = findCard(target.iid);
    let absorber = live ? live.card : null;
    if (!absorber) {
      for (const who of ['you', 'opp']) {
        const corpse = G[who].graveyard.find(c => c.iid === target.iid);
        if (corpse) { absorber = corpse; break; }
      }
    }
    if (!absorber) {
      // Endomorph left play some other way between trigger queue and resolve
      // (bounced, exiled) — no battlefield card, no corpse, nowhere for the
      // reward to land. (Previously this logged a successful absorb while
      // applying nothing.)
      log(`${ctx.sourceName} absorb fades — it left play before feeding.`, 'sp');
      return;
    }
    // Novelty is judged intrinsics-vs-intrinsics via the shared trophy rule
    // (claimableKeywords): the victim offers only what it intrinsically OWNED,
    // and a keyword Endomorph merely borrows (lord aura, until-EOT grant)
    // doesn't block absorbing it permanently from a kill.
    const have = new Set(intrinsicKeywords(absorber));
    const novel = claimableKeywords(victim).filter(kw => !have.has(kw));
    let absorbed = null;
    if (novel.length > 0) {
      novel.sort((a, b) => (ABSORB_KEYWORD_PRIORITY[b] || 0) - (ABSORB_KEYWORD_PRIORITY[a] || 0));
      absorbed = novel[0];
    }
    // Persistence only when controller is player-side with a runState slot.
    const canPersist = (ctx.controller === 'you')
      && (absorber.slotIdx != null)
      && (typeof RUN !== 'undefined' && RUN.applyStickerToSlot);
    if (absorbed) {
      const sticker_id = 'kw_' + absorbed;
      if (canPersist) RUN.applyStickerToSlot(absorber.slotIdx, sticker_id);
      // Mirror onto the instance so the keyword is active AND the sticker
      // badge shows now (the sticker also makes it intrinsic from here on).
      if (!absorber.keywords.includes(absorbed)) absorber.keywords.push(absorbed);
      if (!absorber.stickers.includes(sticker_id)) absorber.stickers.push(sticker_id);
      log(`${ctx.sourceName} absorbs ${absorbed} from ${victim.name}.`, 'sp');
    } else {
      // Fallback +1/+1 via slot sticker (persists across games, unlike counter).
      const sticker_id = 'plus1_plus1';
      if (canPersist) RUN.applyStickerToSlot(absorber.slotIdx, sticker_id);
      absorber.modifiers.push({ power: 1, toughness: 1 });
      absorber.stickers.push(sticker_id);
      log(`${ctx.sourceName} eats ${victim.name} and grows +1/+1.`, 'sp');
    }
  },
  // Unified removal. severity: 1=tap, 2=bounce, 3=destroy (indestructible blocks), 4=exile.
  // Severity sticker escalates one tier per stack.
  affect_creature(ctx, params, target) {
    const sev = params.severity;
    if (params.scope) {
      // A4-4: mass removal is SIMULTANEOUS. Two-pass batch mirroring
      // checkDeaths: pass 1 plucks every in-scope creature off the
      // battlefield (the severity ladder + indestructible validation live
      // in affectOneCreature, which defers each leave emit into `batch`);
      // pass 2 emits every leave with the FULL batch as extraSources, so
      // simultaneous departures see each other — a dies-listener swept by
      // the same wipe still hears every death, independent of battlefield
      // array order. Tap (sev 1) never leaves play; its batch stays empty.
      const batch = [];
      for (const st of creaturesInScope(ctx, params.scope)) {
        affectOneCreature(ctx, findCard(st.iid), sev, batch);
      }
      for (const e of batch) {
        emitLeavesBattlefield(e.card, e.controller, e.dest, batch, e.sourceIid);
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
    f.card.text = describeCardText(f.card);
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
      emitLeavesBattlefield(r.card, r.controller, 'battlefield', undefined, ctx.sourceIid);
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
    // RUN-state writes are HUMAN-side only (audit A4-15): there is exactly
    // one persisted run deck — the player's — and every sibling RUN-writing
    // handler (endomorph_absorb, apply_sticker, rip) gates on the
    // controller; this appendSlot was the lone ungated write. An
    // opp-controlled Steal used to append the stolen slot to the VICTIM's
    // saved run (a duplicate of their own card, persisted). An opp thief now
    // keeps the theft in-game only: fresh instance into its in-game library
    // below, slotIdx null (the opp transient-slot convention), and the
    // victim's slot deliberately untouched.
    const newSlotIdx = (ctx.controller === 'you' && typeof RUN !== 'undefined' && RUN.appendSlot)
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
    // A3-6: the fresh instance materializes in the thief's library — a mint,
    // not a move, so from_zone is the synthetic 'none' (same convention as
    // token minting). The CONSUMED original is deliberately silent: the
    // stolen permanent's leave already emitted above, and a stolen stack
    // spell ceases to exist (counterspell-consume semantics — no arrival,
    // no event; the plain `counter` handler is the one that emits
    // stack→graveyard).
    emitZoneChange(fresh, ctx.controller, 'none', 'library', undefined, ctx.sourceIid);
    const verb = fromStack ? 'counters and shuffles' : 'shuffles';
    log(`${ctx.sourceName} ${verb} ${stolenCardName} into ${pname(ctx.controller)}'s library — yours forever.`, 'sp');
  },
  counter(ctx, params, target) {
    if (!target || !target.stackItem) {
      log(`${ctx.sourceName} fizzles — no target.`, 'sp');
      return;
    }
    const idx = G.stack.indexOf(target.stackItem);
    if (idx < 0) { log(`Target spell no longer on stack.`); return; }
    // §1004.6 parity: trigger AND activated-ability stack entries can't be
    // countered — they aren't spells (canon §706; A3-2 added the ability arm).
    if (G.stack[idx].kind === 'trigger' || G.stack[idx].kind === 'ability') {
      log(`${ctx.sourceName} can't counter that.`, 'sp'); return;
    }
    const removed = G.stack.splice(idx, 1)[0];
    // OWNER's graveyard (§706 / §400) — audit A4-19: this was the engine's
    // ONE controller-routed graveyard site (every sibling — resolution,
    // moveToGraveyard, sacrifice, checkDeaths, both move_card branches — is
    // owner-routed). Live via Seal-Thief Courier's cast-permission flow:
    // countering an opp-owned card you cast filed THEIR card in YOUR
    // graveyard for the rest of the game.
    G[removed.card.owner || removed.controller].graveyard.push(removed.card);
    log(`${ctx.sourceName} counters ${removed.card.name}!`, 'sp');
    // A3-6: a countered spell genuinely moves stack→graveyard — announce it.
    // `controller` stays the caster (the card was theirs on the stack), even
    // though the graveyard it lands in is owner-routed.
    emitZoneChange(removed.card, removed.controller, 'stack', 'graveyard', undefined, ctx.sourceIid);
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
    if (amount > 0) {
      G[who].life += amount;
      log(`${pname(who)} gains ${amount} life.`, 'sp');
      emit({type: 'life_changed', who, delta: amount, source_iid: ctx.sourceIid});
      return;
    }
    // Life LOSS routes through the shared floor/rip helper (audit A4-12,
    // design ruling option A): under Phylactery, life floors at 0 and each
    // point past 0 rips a slot — ONE price for losing life whether it came
    // from damage or a drain. The raw `life += amount` here used to bypass
    // the boon entirely, leaving the protected player at negative life (and
    // the next damagePlayer's max(0, …) then RESET them up to 0).
    // losePlayerLife tracks lifeLostThisTurn and emits life_changed for the
    // ACTUAL loss (identical to the full amount when unprotected).
    log(`${pname(who)} loses ${-amount} life.`, 'sp');
    losePlayerLife(who, -amount, ctx.sourceIid);
  },
  draw(ctx, params) {
    for (let i=0;i<params.amount;i++) drawCard(ctx.controller, ctx.sourceIid);
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
    // The selector names the DISCARDER (§5.2 shorthand semantics, audit
    // A4-21): 'controller_chosen' ("you discard") is always the controller;
    // 'target_player_chosen' ("target player discards") requires a player
    // target and fizzles without one. Before this, both shorthands executed
    // identically — the discarder decided by whatever player target happened
    // to be in scope. Selector-less legacy effects keep the discardWho
    // fallback (player target in scope, else controller).
    if (from === 'hand' && to === 'graveyard') {
      let discarder;
      if (params.selector === 'controller_chosen') {
        discarder = ctx.controller;
      } else if (params.selector === 'target_player_chosen') {
        const pt = (target && target.kind === 'player') ? target
          : (ctx.allTargets || []).find(t => t && t.kind === 'player');
        if (!pt) {
          log(`${ctx.sourceName} fizzles — no player target to discard.`, 'sp');
          return;
        }
        discarder = pt.who;
      } else {
        discarder = discardWho(ctx, target);
      }
      discardFromHand(ctx, discarder, amount);
      return;
    }
    for (let n = 0; n < amount; n++) {
      // Draw: delegate to drawCard so deck-out / Phylactery semantics hold
      // (drawCard emits the library→hand zone change — audit A3-6).
      if (from === 'library' && to === 'hand' && sel === 'controller_top') {
        drawCard(ctx.controller, ctx.sourceIid);
        continue;
      }
      // Mill: top of controller's library → graveyard.
      if (from === 'library' && to === 'graveyard' && sel === 'controller_top') {
        const lib = G[ctx.controller].library;
        if (!lib.length) break;
        const milled = lib.shift();
        G[ctx.controller].graveyard.push(milled);
        // A3-6: mills are announced — card_moves(library, graveyard) fires.
        emitZoneChange(milled, ctx.controller, 'library', 'graveyard', undefined, ctx.sourceIid);
        continue;
      }
      const t = (sel === 'target') ? (target || ctx.chosen)
              : (sel === 'self') ? { kind: 'creature', iid: ctx.sourceIid }
              : (sel === 'copy_source') ? copySourceRef(ctx)
              : null;
      if (!t) {
        // copy_source legitimately resolves to nothing when a False Witness left
        // without ever copying (entered with no creature to copy) — a quiet no-op.
        if (sel !== 'copy_source') console.warn('move_card: unsupported selector', sel, from, '->', to);
        break;
      }

      if (from === 'battlefield') {
        const f = findCard(t.iid);
        if (!f) break;
        const card = pluckFromBattlefield(f);
        if (!card) break;
        // EVERY battlefield-leave flushes pending permanent_eot buffs before
        // the in-play reset (audit A4-16): flushPermanentEotToPermaBuffs
        // self-gates on tpl.permanent_eot, so this is a no-op for every card
        // but Elystra — whose printed text ("End-of-turn effects on Elystra
        // last forever") the old path violated. The `post.keep_buffs` fork
        // that used to gate this was DEAD: the refactor plan specified the
        // flag for flicker, no card ever carried it, so Cloudshift/
        // Otherworldly Journey/Oblation silently discarded her pending
        // buffs while every other leave path (death, sacrifice, the
        // affect_creature bounce/exile arms, cleanup) flushed.
        leavesPlayPreservingBuffs(card);
        const dest = card.owner || f.controller;
        if (!card.isToken) {
          if (to === 'hand') G[dest].hand.push(card);
          else if (to === 'library') { G[dest].library.push(card); if (post.shuffle) shuffle(G[dest].library); }
          else if (to === 'exile') G[dest].exile.push(card);
          else if (to === 'graveyard') G[dest].graveyard.push(card);
          else console.warn('move_card: unsupported battlefield dest', to);
        }
        emitLeavesBattlefield(card, f.controller, to, undefined, ctx.sourceIid);
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
        // Revival reset = the FULL resetInPlayState contract (audit A4-22),
        // not a hand-rolled field list: the old 6-field list missed killedBy,
        // so a reanimated creature carried its original killer's trophy
        // credit into its next death. preserveDeathState=false is exactly
        // the documented revival case ("Death paths set true; revival paths
        // false") — and calling the one reset function closes the whole
        // forgot-a-field class, not just this field.
        resetInPlayState(card);
        const dest = card.owner || ctx.controller;
        if (to === 'hand') G[dest].hand.push(card);
        else if (to === 'library') { G[dest].library.push(card); if (post.shuffle) shuffle(G[dest].library); }
        else if (to === 'battlefield') { placeCardOnBattlefield(ctx, card, from, post); continue; }  // reanimate / exile-return (emits its own ETB)
        else if (to === 'exile' && from === 'graveyard') G[dest].exile.push(card);
        else { console.warn('move_card: unsupported', from, 'dest', to); break; }
        // A3-6: non-battlefield arrivals from graveyard/exile are announced
        // here (battlefield arrivals emit inside placeCardOnBattlefield).
        // `controller` = the owner whose zone it lands in — graveyard/exile
        // cards have no separate controller.
        emitZoneChange(card, dest, from, to, undefined, ctx.sourceIid);
        continue;
      }
      console.warn('move_card: unsupported from_zone', from);
      break;
    }
  },
  grant_cast_permission(ctx, params, target) {
    const t = target || ctx.chosen;
    if (!t || t.iid == null) {
      console.warn('grant_cast_permission: missing target');
      return;
    }
    const from = params.from_zone || 'exile';
    const f = findCardAnyZone(t.iid);
    if (!f || f.zone !== from) {
      log(`${ctx.sourceName} fizzles - card is no longer in ${from}.`, 'sp');
      return;
    }
    if (!Array.isArray(G.castPermissions)) G.castPermissions = [];
    G.castPermissions = G.castPermissions.filter(p =>
      !(p.controller === ctx.controller && p.cardIid === t.iid && p.from_zone === from));
    G.castPermissions.push({
      controller: ctx.controller,
      cardIid: t.iid,
      from_zone: from,
      duration: params.duration || 'eot',
      spend_as_any_color: !!params.spend_as_any_color,
      sourceIid: ctx.sourceIid,
    });
    log(`${pname(ctx.controller)} may cast ${f.card.name} from ${from} this turn.`, 'sp');
  },
  // Legacy discard kind — still emitted by the trigger generator's
  // GENERATOR_EFFECTS (discardOpp — Architect's Codex build flow only; the
  // Mercurial pool contains no discard). Card data uses
  // move_card(hand→graveyard) post-collapse.
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
      // Route through ripSlotByIdx so the slotIdx caller-contract is honored
      // (decrement cached pointers + remap playedSlotIdxs via the shared fixup)
      // instead of stripping the slot raw (audit A9-2/A9-3). The victim is
      // already off the battlefield (the preceding annihilate ran), so the
      // in-game instance find harmlessly finds nothing and still does the RUN
      // removal + fixup.
      ripSlotByIdx(t.controller, slotIdx);
    }
  },
  // The targeted player selects one of their own creatures (§3.5). This is
  // NOT targeting — hexproof never applies. Reads the established player from
  // the preceding target(player) step (the `target` param or ctx.allTargets),
  // auto-picks the lowest sac-value creature (AI), and records ctx.chosen for
  // the following effect (sacrifice/annihilate). When the chooser is the
  // HUMAN, all three resolution loops pause BEFORE this handler runs
  // (maybeDeferHumanChooses → pendingEdictChoice, GAP 2 / audit A4-7) — this
  // auto-pick is the AI path plus the empty-pool log.
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
      const noun = filter;   // 'creature' | 'permanent' | 'land' — the type chosen
      log(`${ctx.sourceName} — ${pname(who)} has no ${noun} to choose.`, 'sp');
      ctx.chosen = null;
      return;
    }
    const sorted = pool.slice().sort((a, b) => sacValueOnBoard(a) - sacValueOnBoard(b));
    const picked = sorted[0];
    ctx.chosen = choosesDescriptor(picked, who);
    log(`${pname(who)} chooses ${picked.name}.`, 'sp');
  },
  // The False Witness doppelganger. The witness (this trigger's source) becomes
  // a copy of the chosen creature, taking its copiable (printed) characteristics
  // — name, stats, types, keywords, abilities, triggers — plus the kept subtypes
  // (Insect, Shapeshifter). Implemented exactly like the keyword/type grant
  // layers: the copied values are MATERIALIZED onto the instance, and
  // resetInPlayState re-derives the false_witness base on leave-play. So the
  // copy reverts for free, and the witness's own leave trigger (which lives on
  // the base identity) is never clobbered by the copied creature's triggers.
  become_copy_of(ctx, params, target) {
    const witness = ctx.sourceCard
      || (ctx.sourceIid != null ? (findCard(ctx.sourceIid) || {}).card : null);
    if (!witness) return;
    const pick = target || ctx.chosen;
    const found = (pick && pick.iid != null) ? findCardAnyZone(pick.iid) : null;
    const srcTpl = found ? CARDS[found.card.tplId] : null;
    if (!srcTpl) { log(`${ctx.sourceName} finds nothing to copy.`, 'sp'); return; }

    // The link the leave trigger reads to return the exiled original, and the
    // revert flag resetInPlayState keys on.
    witness.copyOf = found.card.tplId;
    witness.copySourceIid = pick.iid;
    // Copiable printed characteristics (the base template — not modified runtime
    // stats/damage), materialized onto the instance fields the engine reads.
    witness.name = srcTpl.name;
    witness.power = srcTpl.power;
    witness.toughness = srcTpl.toughness;
    witness.keywords = (srcTpl.keywords || []).slice();
    witness.abilities = srcTpl.abilities
      ? srcTpl.abilities.map(ab => ({ ...ab, cost: ab.cost ? { ...ab.cost } : undefined,
          effects: (ab.effects || []).map(e => ({ ...e })) }))
      : undefined;
    witness.static_buffs = srcTpl.static_buffs
      ? srcTpl.static_buffs.map(b => ({ ...b, filter: b.filter ? { ...b.filter } : undefined,
          keywords: b.keywords ? b.keywords.slice() : undefined }))
      : undefined;
    // Triggers: the witness keeps its OWN triggers (its base ETB + leave-return)
    // and ADDS the copied creature's — so the un-exile leave trigger survives.
    const baseTpl = CARDS[witness.tplId] || {};
    const cloneTrig = t => ({ ...t, effects: (t.effects || []).map(e => ({ ...e })) });
    witness.triggers = [
      ...(baseTpl.triggers || []).map(cloneTrig),
      ...(srcTpl.triggers || []).map(cloneTrig),
    ];
    // Types: set to the copied creature's types plus the kept subtypes — rides
    // the auto-reverting typeGrants layer (cleared on leave like every grant).
    const keep = Array.isArray(params.keep_subtypes) ? params.keep_subtypes : [];
    applyTypeGrant(witness, [...(srcTpl.types || []), ...keep], 'set', null, false);
    witness.text = describeCardText(witness);
    log(`${ctx.sourceName} becomes a copy of ${srcTpl.name}.`, 'sp');
  },
  // Register a delayed trigger that applies `effects` at `when` ('end_step'),
  // operating on the same target the prior effect did (the §9.1/D9 delayed-effect
  // atom). exile_until_eot decomposes to move_card(bf→exile) + schedule_delayed
  // (move_card(exile→bf), end_step) — replacing the bespoke returnFromExile path.
  //
  // NAMING CAVEAT: despite the name, fireAt:'endStep' entries execute during
  // CLEANUP (step()'s 'CLEANUP' case), NOT the §509 END step — there is no
  // priority window when they fire. Correct for "until end of turn" durations;
  // do NOT use this queue for a genuine "at the beginning of the end step"
  // trigger (it would fire unrespondably in the wrong window). See the drain
  // site in step() and the `when:'end_step'` caveat in docs/PROTOCOL.md.
  schedule_delayed(ctx, params, target) {
    // Audit A3-14: an unknown `when` used to pass through verbatim and sit
    // in delayedTriggers FOREVER — re-checked and re-kept on every cleanup
    // (the drain only fires 'endStep'), an immortal zombie entry that
    // accumulates when triggered repeatedly. Refuse loudly instead; the
    // EFFECT_SCHEMA entry catches the same typo at boot for card-authored
    // effects. (Sibling leak: unknown effect KINDS silently dropped in the
    // drain — A1-6.)
    if (params.when !== 'end_step') {
      console.warn('schedule_delayed: unknown when "' + params.when + '" from '
        + ctx.sourceName + ' — refusing to enqueue (supported: end_step)');
      return;
    }
    if (!Array.isArray(G.delayedTriggers)) G.delayedTriggers = [];
    G.delayedTriggers.push({
      fireAt: 'endStep',
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
  // snake_case param names and the legacy ones during cutover. The card
  // migration is done — gainControl is retired (no handler; effect_migration_test
  // pins it GONE). steal remains permanently BY DESIGN as the runtime-internal
  // transfer_ownership delegate (it is not in card data).
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
    // A2-5: a permanent whose controller changes is removed from combat
    // (CR 506.4c; canon §801). Without this, the stale G.attackers /
    // G.blockers entries still findCard-resolve (both battlefields are
    // searched), so a mid-combat stolen attacker dealt its combat damage
    // TO ITS OWN NEW CONTROLLER (defender is fixed at start of combat but
    // the damage credit reads the live controller), and a stolen untapped
    // attacker could legally be assigned to block itself. Shares the A2-3
    // helper: one "leaves combat" concept.
    removeFromCombat(card.iid);
    if (params.untap_on_take || params.untap) card.tapped = false;
    if (params.grant_haste) applyGrant(card, 'haste', ctx.sourceIid, true);
    if (params.duration === 'eot') card.tempControlUntilEot = true;
    log(`${ctx.sourceName} — ${pname(toCtrl)} gains control of ${card.name}` +
        (params.duration === 'eot' ? ' until end of turn.' : '.'), 'sp');
  },
  // `fight`: two creatures named by `operands` ({slot:N} | {select:...}) each deal
  // damage equal to their LIVE power to the other, simultaneously — so a pump
  // applied earlier in the same resolution counts (the D1 live-read; see
  // DIVERGENCE §3.6). Per-combatant ctx so deathtouch/lifelink ride the fighting
  // creature, not the spell. Tap status doesn't matter (Beast's Fury post-combat).
  fight(ctx, params, _target) {
    const [a, b] = resolveFightOperands(ctx, params.operands);
    if (!a || !b || a.card.iid === b.card.iid) {
      log(`${ctx.sourceName} fizzles — needs two creatures to fight.`, 'sp');
      return;
    }
    const [aPow] = getStats(a.card);
    const [bPow] = getStats(b.card);
    log(`${a.card.name} (${aPow}) fights ${b.card.name} (${bPow}).`, 'cb');
    // fightDamage: trample never spills from a fight (audit A4-9, design
    // ruling) — see applyDamageFrom. Deathtouch/lifelink still ride.
    const aCtx = { controller: a.controller, sourceName: a.card.name, sourceIid: a.card.iid, fightDamage: true };
    const bCtx = { controller: b.controller, sourceName: b.card.name, sourceIid: b.card.iid, fightDamage: true };
    applyDamageFrom(aCtx, {kind:'creature', iid: b.card.iid}, aPow);
    applyDamageFrom(bCtx, {kind:'creature', iid: a.card.iid}, bPow);
  },
  untap(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    f.card.tapped = false;
    log(`${ctx.sourceName} untaps ${f.card.name}.`, 'sp');
  },

  // Stapler in-game splice. Merges target 1 onto target 0 using the reward-time
  // splice infra. Cross-owner: merged slot moves to caster's runState (removal/steal).
  // Pair validity lives in resolveSplicePair, which isLegalAction ALREADY ran
  // before any cost was paid (MtG 601.2h: costs are the last part of
  // activation — an invalid pair never pays). Re-checked here only as
  // defense-in-depth: a fizzle at this point means legality/handler drift,
  // and per MtG resolution-fizzle semantics the costs stay paid. Charges are
  // safe regardless: a fizzle returns before the charge accounting at the
  // bottom.
  apply_in_game_splice(ctx, params, target) {
    const pair = resolveSplicePair(ctx.allTargets);
    if (pair.reason) {
      log(`${ctx.sourceName} fizzles — ${pair.reason}`, 'sp');
      return;
    }
    const { baseR, stapleR, baseCard, stapleCard } = pair;
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
        // Splice shifts higher indices down by 1 — fix cached slotIdx pointers
        // AND remap playedSlotIdxs via the shared contract fixup (audit A9-3:
        // splicing a played card must not leave the win-reward filter stale).
        fixupSlotPointersAfterRemoval('you', removedIdx);
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
      // Per-removal fixup: decrement cached slotIdx pointers AND remap
      // playedSlotIdxs (audit A9-3 — via the shared contract helper).
      const fixupSlotIdxAfter = (removedIdx) => fixupSlotPointersAfterRemoval('you', removedIdx);
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

// D1 hybrid (DIVERGENCE §3.6): a {from:'target_*'} expression reads LIVE state
// while the target is still on the battlefield — so a +X/+X applied earlier in
// the same resolution counts (Predate's pump-then-fight) — and falls back to the
// last-known-info snapshot once the target has left its zone (Swords-to-
// Plowshares: exile, THEN gain life equal to its power). findCard is
// battlefield-only, which is exactly "still in its expected zone" for a creature.
function liveTargetView(targetSnap) {
  if (targetSnap && targetSnap.kind === 'creature' && targetSnap.iid != null) {
    const f = findCard(targetSnap.iid);
    if (f) {
      const [power, toughness] = getStats(f.card);
      return { power, toughness, controller: f.controller };
    }
  }
  return targetSnap || {};
}
// Resolve {from:'<name>'} from live-or-snapshot/ctx; literals pass through.
function resolveExpr(value, ctx, targetSnap) {
  if (value == null) return value;
  if (typeof value !== 'object' || !value.from) return value;
  switch (value.from) {
    case 'target_power': {
      const v = liveTargetView(targetSnap);
      return (typeof v.power === 'number') ? v.power : 0;
    }
    case 'target_toughness': {
      const v = liveTargetView(targetSnap);
      return (typeof v.toughness === 'number') ? v.toughness : 0;
    }
    case 'target_controller': {
      const v = liveTargetView(targetSnap);
      return v.controller ? v.controller : ctx.controller;
    }
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
function isSupportedMoveCardPair(from, to) {
  if (from === 'library') return to === 'hand' || to === 'graveyard' || to === 'battlefield';
  if (from === 'hand') return to === 'graveyard';
  if (from === 'battlefield') return to === 'hand' || to === 'library' || to === 'exile' || to === 'graveyard';
  if (from === 'graveyard') return to === 'hand' || to === 'library' || to === 'battlefield' || to === 'exile';
  if (from === 'exile') return to === 'hand' || to === 'library' || to === 'battlefield';
  return false;
}

// Per-(from,to) allowed move_card selectors — ONE fact, derived from the
// handler's real dispatch (audit A4-21: the schema used to validate zone
// PAIRS while the handler dispatches on (from,to,selector) TRIPLES, so a
// schema-clean combo could warn-and-no-op at runtime). `null` in a list =
// the selector may be omitted (the arm defaults or ignores it).
const MOVE_CARD_SELECTORS = {
  'library->hand':        [null, 'controller_top', 'library_search'],
  'library->graveyard':   [null, 'controller_top'],
  'library->battlefield': [null, 'library_search'],   // filtered auto-fetch; selector unused
  'hand->graveyard':      [null, 'controller_chosen', 'target_player_chosen'],
  'battlefield->hand':    ['target', 'self', 'copy_source'],
  'battlefield->library': ['target', 'self', 'copy_source'],
  'battlefield->exile':   ['target', 'self', 'copy_source'],
  'battlefield->graveyard': ['target', 'self', 'copy_source'],
  'graveyard->hand':        ['target', 'self', 'copy_source'],
  'graveyard->library':     ['target', 'self', 'copy_source'],
  'graveyard->battlefield': ['target', 'self', 'copy_source'],
  'graveyard->exile':       ['target', 'self', 'copy_source'],
  'exile->hand':            ['target', 'self', 'copy_source'],
  'exile->library':         ['target', 'self', 'copy_source'],
  'exile->battlefield':     ['target', 'self', 'copy_source'],
};

// Schema helper: a required magnitude is a number or a {from:'...'} expression
// (resolved at apply time by resolveEffectParams).
function isAmountParam(v) {
  return typeof v === 'number' || (v != null && typeof v === 'object' && v.from);
}

const EFFECT_SCHEMA = {
  move_card: (e) => {
    const ZONES = ['library', 'hand', 'graveyard', 'battlefield', 'exile'];
    if (!ZONES.includes(e.from_zone)) return 'move_card bad/missing from_zone';
    if (!ZONES.includes(e.to_zone)) return 'move_card bad/missing to_zone';
    if (!isSupportedMoveCardPair(e.from_zone, e.to_zone)) return 'move_card unsupported zone pair';
    const allowed = MOVE_CARD_SELECTORS[e.from_zone + '->' + e.to_zone];
    if (allowed && !allowed.includes(e.selector != null ? e.selector : null)) {
      return 'move_card selector "' + e.selector + '" unsupported for '
        + e.from_zone + '->' + e.to_zone + ' (want ' + allowed.filter(s => s).join('|') + ')';
    }
    return null;
  },
  // Required-param entries (audit A4-17): a missing amount used to boot
  // clean and corrupt at resolution (damage → NaN = unkillable creature;
  // add_mana → raw TypeError mid-action).
  damage:    (e) => (isAmountParam(e.amount) ? null : 'damage missing numeric amount'),
  gain_life: (e) => (isAmountParam(e.amount) ? null : 'gain_life missing numeric amount'),
  draw:      (e) => (isAmountParam(e.amount) ? null : 'draw missing numeric amount'),
  discard:   (e) => (isAmountParam(e.amount) ? null : 'discard missing numeric amount'),
  add_mana:  (e) => ((e.amounts && typeof e.amounts === 'object') || e.choose
    ? null : 'add_mana missing amounts/choose'),
  grant_keyword: (e) => (e.keyword ? null : 'grant_keyword missing keyword'),
  create_tokens: (e) => {
    const id = e.token_id && TOKEN_ALIAS[e.token_id] ? TOKEN_ALIAS[e.token_id] : e.token_id;
    return (id && TOKENS[id]) ? null : 'create_tokens unknown token_id "' + e.token_id + '"';
  },
  grant_cast_permission: (e) => {
    const ZONES = ['exile'];
    if (!ZONES.includes(e.from_zone)) return 'grant_cast_permission bad/missing from_zone';
    if (e.duration !== 'eot') return 'grant_cast_permission bad/missing duration';
    return null;
  },
  chooses: (e) => (e.filter ? null : 'chooses missing filter'),
  // Audit A3-14: 'end_step' is the only fire time the cleanup drain executes;
  // anything else would sit in delayedTriggers forever. Keep in lockstep with
  // the schedule_delayed handler's guard and the drain in step()'s CLEANUP arm.
  schedule_delayed: (e) => {
    if (e.when !== 'end_step') return 'schedule_delayed bad/missing when (want end_step)';
    if (!Array.isArray(e.effects)) return 'schedule_delayed missing effects array';
    return null;
  },
  affect_creature: (e) => {
    const SEV = ['tap', 'bounce', 'destroy', 'exile'];
    if (e.severity != null && !SEV.includes(e.severity) && !(e.severity >= 1 && e.severity <= 4)) {
      return 'affect_creature bad severity (want tap|bounce|destroy|exile or 1-4)';
    }
    return null;
  },
};

// The CLOSED restriction-key vocabulary (audit A4-11): the union of every
// key consumed by matchFilter, matchFilterSpell, the graveyard_card search
// axes (getValidTargets), and the library-search filter (matchesSearchFilter
// — move_card filters route there). matchFilter silently ignores unknown
// keys, so a typo'd or camelCase key used to make a card target MORE than
// its designer intended with zero signal — even the procedural card text
// dropped the same unknown key. Keep in lockstep with those four consumers.
const MATCH_FILTER_KEYS = new Set([
  // matchFilter axes
  'tapped', 'not_color', 'color', 'controller',
  'max_tough', 'min_tough', 'max_power', 'min_power',
  'not_keyword', 'has_keyword', 'subtype', 'type', 'not_type',
  'not_token', 'spliceable_base', 'spliceable_staple',
  // graveyard_card search axes (consumed in getValidTargets, not matchFilter)
  'graveyards', 'select',
  // library-search axis (matchesSearchFilter's `sub` shorthand)
  'sub',
]);

// Effect kinds that DEREFERENCE a target and have no targetless fallback
// (audit A4-17): authored without any way to receive one (effect-level
// target/target_slot/scope, or a card/ability/trigger-level target step)
// they fizzle — or, pre-guards, crashed — at resolution. Kinds with a
// non-target fallback (gain_life/draw/discard → controller; sacrifice/
// annihilate/rip/move_card/become_copy_of/grant_cast_permission →
// ctx.chosen; fight → operands) are deliberately absent.
const TARGET_REQUIRED_KINDS = new Set([
  'damage', 'pump', 'add_counter', 'untap', 'affect_creature',
  'grant_keyword', 'apply_sticker', 'symmetricize', 'add_type', 'set_types',
  'counter',
]);

function validateAllCardEffects(cards) {
  const unknownKinds = [];
  const unknownFilters = [];
  const schemaErrors = [];
  const unknownFilterKeys = [];
  const targetErrors = [];
  const list = Array.isArray(cards) ? cards : Object.values(cards || {});
  // Restriction-key sweep (audit A4-11). Only OBJECT filters carry the
  // matchFilter vocabulary — string filters (target()/chooses() taxonomy
  // names) are checked against TARGET_FILTERS instead.
  const checkFilterKeys = (filter, where) => {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return;
    for (const k of Object.keys(filter)) {
      if (!MATCH_FILTER_KEYS.has(k)) unknownFilterKeys.push(where + '(' + k + ')');
    }
  };
  const checkList = (effs, cardId, hasOwnerTarget) => {
    for (const e of (effs || [])) {
      if (!e || typeof e !== 'object') continue;
      if (e.kind && !EFFECTS[e.kind]) unknownKinds.push(cardId + '.' + e.kind);
      if ((e.kind === 'chooses' || e.kind === 'target') && e.filter && !TARGET_FILTERS.has(e.filter)) {
        unknownFilters.push(cardId + '.' + e.kind + '(' + e.filter + ')');
      }
      if (e.filter && typeof e.filter === 'object') {
        checkFilterKeys(e.filter, cardId + '.' + e.kind + '.filter');
      }
      // target_filter on a player/opp target is nonsensical (matchFilter's
      // vocabulary is card axes) and was silently dropped — reject loudly
      // (audit A4-8's player/opp leg).
      if ((e.target === 'player' || e.target === 'opp') && e.filter) {
        schemaErrors.push(cardId + ': filter on a ' + e.target
          + ' target is unsupported (card-axis filters never apply to players)');
      }
      // Targeted kinds need SOME target source (audit A4-17).
      if (TARGET_REQUIRED_KINDS.has(e.kind) && !e.scope && !e.target
          && e.target_slot == null && !hasOwnerTarget) {
        targetErrors.push(cardId + ': ' + e.kind
          + ' has no target source (no target/target_slot/scope and no owner-level target step)');
      }
      // Effect-level target strings resolve through getValidTargets, whose
      // default arm returns [] — a typo boots clean and the card is silently
      // uncastable forever (audit A11-1).
      if (typeof e.target === 'string' && !GETVALIDTARGETS_TARGETS.has(e.target)) {
        targetErrors.push(cardId + ': effect-level target "' + e.target
          + '" is not a name getValidTargets resolves');
      }
      const schema = EFFECT_SCHEMA[e.kind];
      if (schema) { const err = schema(e); if (err) schemaErrors.push(cardId + ': ' + err); }
    }
  };
  // Slot-level target strings (target_slots[i].target) also resolve through
  // getValidTargets — same silent-uncastable failure mode as the effect-level
  // check in checkList (audit A11-1). Swept on card-, ability-, and
  // trigger-level slot arrays.
  const checkSlotTargets = (slots, where) => {
    for (const spec of (Array.isArray(slots) ? slots : [])) {
      if (!spec || typeof spec.target !== 'string') continue;
      if (!GETVALIDTARGETS_TARGETS.has(spec.target)) {
        targetErrors.push(where + ': slot-level target "' + spec.target
          + '" is not a name getValidTargets resolves');
      }
    }
  };
  for (const card of list) {
    const cardId = card.tplId || card.card_id || card.name || '?';
    const cardHasTarget = !!(card.target
      || (Array.isArray(card.target_slots) && card.target_slots.length));
    checkList(allCardEffects(card), cardId, cardHasTarget);
    // New top-level target() step filter.
    if (card.target && !TARGET_FILTERS.has(card.target)) {
      unknownFilters.push(cardId + '.target(' + card.target + ')');
    }
    checkFilterKeys(card.target_filter, cardId + '.target_filter');
    if ((card.target === 'player' || card.target === 'opp') && card.target_filter) {
      schemaErrors.push(cardId + ': target_filter on a ' + card.target
        + ' target is unsupported (card-axis filters never apply to players)');
    }
    if (Array.isArray(card.target_slots)) {
      for (const spec of card.target_slots) {
        if (spec) checkFilterKeys(spec.filter, cardId + '.target_slots.filter');
      }
    }
    checkSlotTargets(card.target_slots, cardId);
    for (const ab of (card.abilities || [])) {
      checkFilterKeys(ab.target_filter, cardId + '.ability.target_filter');
      checkSlotTargets(ab.target_slots, cardId + '.ability');
      // A3-2: `stackable` is an optional BOOLEAN (absent → true). A present
      // non-boolean would silently truthy/falsy its way into the wrong
      // resolution path — reject it loudly at boot.
      if (ab && 'stackable' in ab && typeof ab.stackable !== 'boolean') {
        schemaErrors.push(cardId + ': ability stackable must be a boolean (got '
          + (typeof ab.stackable) + ')');
      }
      // A7-1: a mana ability whose cost includes ANYTHING beyond {T}/mana is
      // unsupported until an explicit-cost mana pipeline exists — the auto-payer
      // can only pay {T}/mana, so an extra cost (sacrifice, remove_counters, ...)
      // would be silently dodged. Flag the shape loudly at boot.
      if (ab && ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana'
          && ab.cost && Object.keys(ab.cost).some(k => k !== 'tap' && k !== 'mana')) {
        schemaErrors.push(cardId + ': mana ability has a non-tap/mana cost ('
          + Object.keys(ab.cost).filter(k => k !== 'tap' && k !== 'mana').join(',')
          + ') -- extra-cost mana abilities are unsupported (A7-1)');
      }
      checkList(ab.effects, cardId,
        !!(ab.target || (Array.isArray(ab.target_slots) && ab.target_slots.length)));
    }
    for (const trig of (card.triggers || [])) {
      checkFilterKeys(trig.target_filter, cardId + '.trigger.target_filter');
      checkSlotTargets(trig.target_slots, cardId + '.trigger');
      // A3-2: same boolean-only rule for triggers.
      if (trig && 'stackable' in trig && typeof trig.stackable !== 'boolean') {
        schemaErrors.push(cardId + ': trigger stackable must be a boolean (got '
          + (typeof trig.stackable) + ')');
      }
      checkList(trig.effects, cardId,
        !!(trig.target || (Array.isArray(trig.target_slots) && trig.target_slots.length)));
    }
    // static_buff filters: same key sweep, PLUS stat bounds are rejected
    // outright (audit A4-14) — a stat-bounded lord filter closes the
    // getStats ↔ matchFilter recursion; lordBuffApplies evaluates stat-free
    // (matchFilterNoStats) until that semantics is properly designed, so a
    // stat bound here would be silently ignored at best.
    for (const buff of (card.static_buffs || [])) {
      if (!buff) continue;
      checkFilterKeys(buff.filter, cardId + '.static_buff.filter');
      if (buff.filter && STAT_BOUND_FILTER_KEYS.some(k => buff.filter[k] !== undefined)) {
        schemaErrors.push(cardId + ': static_buff filter uses a stat bound ('
          + STAT_BOUND_FILTER_KEYS.filter(k => buff.filter[k] !== undefined).join(',')
          + ') — unsupported until stat-bounded lord buffs are designed (audit A4-14)');
      }
    }
  }
  if (unknownKinds.length) console.warn('Unknown effect kind(s):', unknownKinds.join(', '));
  if (unknownFilters.length) console.warn('Unknown target/chooses filter(s):', unknownFilters.join(', '));
  if (schemaErrors.length) console.warn('Effect schema error(s):', schemaErrors.join('; '));
  if (unknownFilterKeys.length) console.warn('Unknown filter key(s):', unknownFilterKeys.join(', '));
  if (targetErrors.length) console.warn('Effect target error(s):', targetErrors.join('; '));
  return { unknownKinds, unknownFilters, schemaErrors, unknownFilterKeys, targetErrors };
}

// Audit A3-5 — shared shape check for a generated/persisted trigger: event ∈
// VALID_TRIGGER_EVENTS, every atomic predicate registered, every effect kind
// in EFFECTS (+ token_id in TOKENS for create_tokens). Pushes findings into
// the `out` lists, each entry prefixed by `id`.
function collectUnknownTriggerRefs(trig, id, out) {
  if (!trig || typeof trig !== 'object') return;
  if (trig.event && !VALID_TRIGGER_EVENTS.has(trig.event)) {
    out.unknownEvents.push(id + '.' + trig.event);
  }
  // A3-2: `stackable` must be boolean when present (absent → true). Guarded
  // on the list existing so older callers with the pre-A3-2 `out` shape
  // don't crash.
  if ('stackable' in trig && typeof trig.stackable !== 'boolean' && out.badStackable) {
    out.badStackable.push(id);
  }
  if (trig.condition != null && typeof trig.condition !== 'function') {
    _collectUnknownAtomics(trig.condition, out.unknownAtomics, id);
  }
  for (const e of (trig.effects || [])) {
    if (!e || typeof e !== 'object') continue;
    if (e.kind && !EFFECTS[e.kind]) out.unknownKinds.push(id + '.' + e.kind);
    if (e.kind === 'create_tokens' && e.token_id && !TOKENS[e.token_id]) {
      out.unknownTokens.push(id + '.' + e.token_id);
    }
  }
}

// Audit A3-5 — boot-time validation for the three generated-trigger data
// tables, which sit OUTSIDE both card validators (those walk only the CARDS
// collection passed in): GENERATOR_EFFECTS / GENERATOR_CONDITIONS
// (trigger-generator.js) and MERCURIAL_TRIGGER_POOL (this file). A typo'd
// effect kind, token id, predicate, or event in one of them boots clean and
// silently no-ops a player's whole-run boon — PROTOCOL §3.4 promises boot
// validation for every referenced id, and the pool's triggers ARE
// card-attached at runtime. Called from main.js boot alongside the card
// validators; warns to console, returns the lists for tests.
function validateGeneratedTriggerTables() {
  const out = { unknownKinds: [], unknownTokens: [], unknownAtomics: [], unknownEvents: [], badStackable: [] };
  for (const ge of GENERATOR_EFFECTS) {
    // Entries are roll() factories — roll a sample; amounts vary per roll,
    // kinds/token ids don't.
    collectUnknownTriggerRefs({ effects: ge.roll() }, 'GENERATOR_EFFECTS.' + ge.id, out);
  }
  for (const gc of GENERATOR_CONDITIONS) {
    collectUnknownTriggerRefs({ event: gc.event, condition: gc.condition },
      'GENERATOR_CONDITIONS.' + gc.id, out);
  }
  for (const t of MERCURIAL_TRIGGER_POOL) {
    collectUnknownTriggerRefs(t, 'MERCURIAL_TRIGGER_POOL.' + t.label, out);
  }
  if (out.unknownKinds.length) console.warn('Generated-trigger tables: unknown effect kind(s):', out.unknownKinds.join(', '));
  if (out.unknownTokens.length) console.warn('Generated-trigger tables: unknown token id(s):', out.unknownTokens.join(', '));
  if (out.unknownAtomics.length) console.warn('Generated-trigger tables: unknown atomic predicate(s):', out.unknownAtomics.join(', '));
  if (out.unknownEvents.length) console.warn('Generated-trigger tables: unknown event kind(s):', out.unknownEvents.join(', '));
  if (out.badStackable.length) console.warn('Generated-trigger tables: non-boolean stackable on:', out.badStackable.join(', '));
  return out;
}

// Effect kinds that operate on a creature (vs player) — drives scope:'self' meaning.
// Add creature-operators here; damage/gain_life/draw/discard/add_mana resolve self → controller.
// add_type/set_types operate on the permanent (audit A4-13's fix-design trap:
// artifice_triumphant grants an `add_type scope:'self'` ability that must be
// creature-routed).
const CREATURE_EFFECT_KINDS = new Set([
  'pump', 'add_counter', 'untap', 'affect_creature',
  'fight', 'endomorph_absorb',
  'grant_keyword',
  'sacrifice',
  'add_type', 'set_types',
]);
function effectOperatesOnCreature(eff) {
  return CREATURE_EFFECT_KINDS.has(eff.kind);
}

// scope:'self' resolution — the creature-vs-player fork, ONE helper for all
// three resolution loops (audit A4-13). 'self' means the SOURCE CREATURE for
// creature-operating effects (CREATURE_EFFECT_KINDS) and the SOURCE'S
// CONTROLLER for player-operating ones (damage = "you lose N", gain_life,
// draw, discard, add_mana). The v0.99.29 Final Strike bug was a missing fork
// in the spell loop; the ability loop shipped as the divergent third
// hand-synced copy (it routed EVERY self to the creature, so a "T: deal 1 to
// you" ability would have burned the creature instead). For a spell, the
// "creature" descriptor is the spell card itself — not on the battlefield,
// so creature-operating self effects fizzle gracefully there.
function resolveSelfTarget(eff, sourceIid, sourceName, controller) {
  if (effectOperatesOnCreature(eff)) {
    const tgt = { kind: 'creature', iid: sourceIid, label: sourceName };
    return { tgt, snap: snapshotTarget(tgt) };
  }
  const tgt = { kind: 'player', who: controller };
  return { tgt, snap: tgt };
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
// drained to stack at next priority round. Queueing is on event/condition
// match only (§1004); target legality is checked twice: at stack-push
// (tsAutoPick / prompt, §1005 — no legal target → logged fizzle), and again
// at resolution (resolveTrigger → tsRevalidateTargets, §1006.1): slots that
// became illegal on the stack are dropped; if none survive, the trigger
// fizzles whole. (Audit A3-10 removed a third, emit-time legality gate that
// silently ate no-target triggers before they could queue.)
//
// TRIGGER_DEPTH_CAP is a per-stack-episode trigger BUDGET, not a nesting
// depth: resolveTrigger counts every trigger resolution since the stack last
// emptied (reset in the settle loop when both players pass on an empty
// stack). Deliberate (audit A3-3, Joe's ruling PR #98, 2026-06-10: keep the
// counter) — the width count also bounds mutual A→B→A trigger loops that a
// true nesting-depth counter would never catch (each round of such a loop
// resolves at depth 1–2).
const TRIGGER_DEPTH_CAP = 100;

// Lord-grant reconciliation, called from emit() pre-trigger. Idempotent.
// TRUE diff-reconcile (audit A4-2): an add pass for every (lord buff, target)
// pair the shared lordBuffApplies predicate accepts, then a revoke pass for
// lord-sourced grants it no longer accepts (the creature was stolen, changed
// type, ...). Before the revoke pass this was add-only, so a grant went stale
// FOREVER unless the lord left play (leave-play cleanup stays with
// clearRestrictionsFromSource).
function applyStaticKeywordGrants() {
  if (!G || !G.you || !G.opp) return;
  const all = [
    ...G.you.battlefield.map(c => ({ card: c, controller: 'you' })),
    ...G.opp.battlefield.map(c => ({ card: c, controller: 'opp' })),
  ];
  const lords = all.filter(e => e.card.static_buffs);
  for (const { card: lord, controller: lordCtrl } of lords) {
    for (const buff of lord.static_buffs) {
      if (!buff.keywords || !buff.keywords.length) continue;
      for (const { card: target, controller: tgtCtrl } of all) {
        if (!lordBuffApplies(lord, lordCtrl, buff, target, tgtCtrl)) continue;
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
  // Revoke pass: walk each card's grant entries whose source resolves to a
  // battlefield lord whose static_buffs CLAIM the keyword; if no buff of that
  // lord still accepts the (buff, target) pair, the grant is stale — strip it.
  // Grants whose source is anything else (one-shot spells, abilities, a lord
  // keyword granted by its TRIGGER rather than its static_buff) keep their
  // existing leave-play contract untouched.
  const lordByIid = new Map(lords.map(e => [e.card.iid, e]));
  for (const { card: target, controller: tgtCtrl } of all) {
    if (!(target.grantedBy instanceof Map)) continue;
    for (const [kw, sources] of [...target.grantedBy]) {
      for (const srcIid of [...sources]) {
        const entry = lordByIid.get(srcIid);
        if (!entry) continue;
        const claiming = entry.card.static_buffs
          .filter(b => b.keywords && b.keywords.includes(kw));
        if (!claiming.length) continue;
        const still = claiming.some(b =>
          lordBuffApplies(entry.card, entry.controller, b, target, tgtCtrl));
        if (!still) stripGrantedKeyword(target, kw, srcIid);
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
      // No target-legality gate here (audit A3-10): a matched trigger always
      // queues (§1004). Targets are chosen — and legality enforced, with a
      // logged fizzle — when it goes on the stack (pushTriggerOnStack, §1005).
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

// Unified zone-change emission (Slice 2 / DIVERGENCE E2). The single
// card-movement event — composable triggers (event: 'card_zone_change') match
// on this; the legacy cardEntersBattlefield / cardDies / cardLeavesBattlefield
// events were retired once card migration completed. Since the A3-6 build-out
// (v2.1.40) EVERY genuine card move between zones routes through here, not
// just battlefield-touching ones — draws, tutors, discards, mills, casts,
// counters, resolutions, graveyard/exile recursion, and 'none'-sourced mints.
// The supported pairs and the deliberate NON-events (game setup, rips/
// annihilation, staple merges, control changes, shuffles) live in canon
// §1002.2 / PROTOCOL §3.3 — when adding or removing an emission site, update
// those two docs together with the code.
// extraSources lets a card that has already left a zone still see its own
// zone-change trigger (parity with the cardDies/cardLeaves extraSources).
// Listeners are unchanged: emit() walks the two battlefields (+ extraSources)
// — only permanents hear events; the new pairs widen what is announced, not
// who can listen.
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

// Does a player-controlled trigger need the player to CHOOSE its target? Returns
// { valid, promptEff } when there's a real choice (>1 legal target), else null.
// ── Trigger target selection ───────────────────────────────────────────────
// Targets are chosen as a trigger goes on the stack (MtG rules). All paths route
// through TargetSelection, so they handle every shape including multi-slot
// target_slots: pushTriggerOnStack AUTO-picks (AI / opponent, and any human
// trigger with no genuine choice); the human gets a step-through PROMPT for the
// slots that are a real choice — forced (one legal target) and implicit
// (opp/player/self/spell) slots auto-fill.

// ── A3-2 stackable infrastructure ──────────────────────────────────────────
// Per-definition `stackable` boolean on trigger AND activated-ability
// definitions. ABSENT → TRUE (Joe's ruling, PR #98 round 5: the default
// posture is "players can respond", and the default must work gracefully
// with no field written on any card — no card carries it yet). Boot
// validation rejects present-but-non-boolean values (validateAllCardEffects
// + collectUnknownTriggerRefs), so `!== false` is exact. Mana abilities
// never consult this — they are hardcoded off-stack (canon §705).
function isStackable(def) { return !def || def.stackable !== false; }

// stackable:false drain-time-immediate arm for TRIGGERS — provisional
// semantics per plan-stackable.md §6 Q1 (drain-time-immediate recommended);
// subject to Joe's design pass; DORMANT — nothing is unstackable yet (every
// shipped trigger defaults stackable). The trigger is player-atomic with its
// event: targets were just chosen at drain, and it resolves HERE — before
// any stack push and before any player exercises priority — so there is no
// response window ("split second", Joe's provisional player-facing name).
// It still logs, still counts against the per-episode trigger budget
// (resolveTrigger increments it), and its downstream events still emit and
// queue normally, draining at the next window.
function resolveTriggerImmediate(p, targets) {
  // formatTriggerText: ~ → source name; strip the authored/generated text's
  // own trailing period before this template appends one (audit A10-3 —
  // every trigger log line used to end "..").
  const trigDesc = formatTriggerText(triggerLogText(p.trig), p.sourceName).replace(/\.$/, '');
  log(`${p.sourceName} triggers (split second): ${trigDesc}.`, 'sp');
  resolveTrigger({
    kind: 'trigger', trig: p.trig, sourceIid: p.sourceIid, sourceName: p.sourceName,
    controller: p.controller, targets, event: p.event || null,
  });
  // The board just mutated with no stack push: wipe any stale passes so a
  // pre-event pass can't close the round over the new board (same rationale
  // as the A1-1 leg 2 reset on inline ability resolution).
  if (G.priority) G.priority.passes.clear();
}

// Shared stack-push for a resolved trigger entry. (Also resets the priority round
// so the opponent can respond, like a spell going on the stack.)
function pushTriggerEntry(p, targets) {
  G.stack.push({
    kind: 'trigger',
    trig: p.trig,
    sourceIid: p.sourceIid,
    sourceName: p.sourceName,
    controller: p.controller,
    targets,
    // event → ctx.event for effects that read non-target data (Endomorph etc.).
    event: p.event || null,
  });
  // Same ~-substitution + trailing-period dedupe as resolveTriggerImmediate
  // (audit A10-3).
  const trigDesc = formatTriggerText(triggerLogText(p.trig), p.sourceName).replace(/\.$/, '');
  log(`${p.sourceName} triggers: ${trigDesc}.`, 'sp');
  // A1-1 leg 3: drainTriggers refuses to run while priority is closed, so a
  // round is guaranteed open here. Never synthesize one — a conjured round
  // gets auto-passed by both players and advancePhaseAfterPriority then
  // marches the phase PAST whatever declaration the engine was parked on
  // (combat/blocks silently skipped). If this ever throws on a null
  // G.priority, some new call path is draining from a closed window — gate
  // that path, don't re-add the synthesis.
  G.priority.passes.clear();
  G.priorityHolder = opp(p.controller);
}

// Auto-pick path: one legal target per slot via tsAutoPick (handles top-level
// target(), per-effect, AND multi-slot target_slots — the old single-pick logic
// had no slot branch, so stapled multi-target ETBs fizzled entirely).
// This is where rule 603.3c lives: a targeted trigger only goes on the stack
// if every slot it needs has a legal target — tsAutoPick returns null
// otherwise (including no-distinct-set for distinct_targets) and the fizzle
// is LOGGED. (Audit A3-10: this is the sole pre-stack gate; emit() queues on
// event/condition match alone.)
function pushTriggerOnStack(p) {
  let targets = [];
  if (objectNeedsTarget(p.trig)) {
    const picked = tsAutoPick(p.trig, p.controller);
    if (!picked) {
      log(`${p.sourceName} trigger fizzles — no legal target.`, 'sp');
      return;
    }
    targets = picked;
  }
  // A3-2: an unstackable trigger resolves at drain instead of stacking.
  if (!isStackable(p.trig)) { resolveTriggerImmediate(p, targets); return; }
  pushTriggerEntry(p, targets);
}

// Step a human-controlled trigger's pending prompt: auto-fill forced (single
// legal target) and implicit (opp/player/self/spell) slots, stopping at the
// first slot that's a genuine choice. Returns 'prompt' (pause for the human),
// 'done' (every slot assigned → finalize), or 'fizzle' (a slot lost its target).
// Steps the human trigger prompt slot-by-slot, committing each pick before the
// next. GREEDY, no backtracking: for a distinct_targets trigger with asymmetric
// per-slot legal sets, an early pick could strand a later slot ('fizzle') even
// though a different early pick would have yielded a legal full set. Correct only
// because every current distinct card is 2-slot with the SAME filter on both slots
// (so with ≥2 creatures there's always an escape; with exactly 2 the second slot
// auto-fills). Revisit for the first 3+-slot or asymmetric-per-slot distinct card.
function advanceTriggerTargetPrompt(pt) {
  const bySlot = tsLegalBySlot(pt.trig, pt.controller);
  for (const slot of pt.slotKeys) {
    if (pt.pickedSlots[slot] != null) continue;
    const valid = tsExcludePicked(pt.trig, bySlot.get(slot) || [], pt.pickedSlots);
    if (!valid.length) return 'fizzle';
    if (tsIsImplicitTargetType(tsSlotTargetType(pt.trig, slot)) || valid.length === 1) {
      pt.pickedSlots[slot] = valid.length === 1 ? valid[0]
        : pickBestTriggerTarget(tsSlotValueEff(pt.trig, slot), valid, pt.controller);
      continue;
    }
    pt.currentSlot = slot;
    pt.valid = valid;
    pt.promptEff = tsSlotValueEff(pt.trig, slot);
    return 'prompt';
  }
  return 'done';
}

// Build the human step-through prompt for a queued trigger, or null when there's
// no genuine choice (every slot auto-fills → pushTriggerOnStack handles it).
function triggerPlayerTargetPrompt(p) {
  if (p.controller !== 'you' || !objectNeedsTarget(p.trig)) return null;
  const pt = {
    controller: p.controller, sourceIid: p.sourceIid, sourceName: p.sourceName,
    trig: p.trig, event: p.event || null,
    slotKeys: tsSlotKeys(p.trig, p.controller),
    pickedSlots: [], currentSlot: -1, valid: null, promptEff: null,
  };
  return advanceTriggerTargetPrompt(pt) === 'prompt' ? pt : null;
}

// Finalize a fully-picked human prompt: assemble the slot-indexed targets and
// push. (Auto-pick uses pushTriggerOnStack; this preserves the human's choices.)
function finalizeTriggerTarget(pt) {
  const targets = [];
  for (const slot of pt.slotKeys) targets[slot] = pt.pickedSlots[slot];
  fillSparseHoles(targets, pt.slotKeys[0]);
  // A3-2: a human-prompted unstackable trigger also resolves immediately
  // once its targets are picked (same dormant arm as pushTriggerOnStack).
  if (!isStackable(pt.trig)) { resolveTriggerImmediate(pt, targets); return; }
  pushTriggerEntry(pt, targets);
}

// Drain queued triggers to the stack. Active player's first, then opp. Pauses on
// a human prompt; remaining triggers drain post-prompt.
function drainTriggers() {
  if (G.gameOver) return false;
  if (G.pendingTriggerTarget) return false;
  if (G.pendingTriggers.length === 0) return false;
  // A1-1 leg 3 (Joe-approved fix, PR #98): never drain while priority is
  // CLOSED (§605 windows — pending attack/block declarations, combat damage,
  // cleanup). Canon §1004.4: triggers queued while priority is closed WAIT;
  // they drain at the next openPriorityRound (which calls this function).
  // Pre-fix, pushTriggerEntry conjured a synthetic round here, which both
  // players auto-passed, advancing the phase out from under a pending
  // declaration — combat (or blocks) silently skipped. Reachable via mana
  // abilities (legal at any time) whose costs/effects fire triggers, e.g. a
  // "Sacrifice a creature: add mana" card.
  if (!isPriorityOpen()) return false;
  const active = G.activePlayer;
  const ordered = [
    ...G.pendingTriggers.filter(p => p.controller === active),
    ...G.pendingTriggers.filter(p => p.controller !== active),
  ];
  G.pendingTriggers = [];
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    const pt = triggerPlayerTargetPrompt(p);
    if (pt) {
      // A human choice remains — pause. The remaining triggers wait in queue.
      G.pendingTriggers = ordered.slice(i + 1);
      G.pendingTriggerTarget = pt;
      log(`${p.sourceName} triggered — choose a target.`, 'sp');
      return true;
    }
    pushTriggerOnStack(p);
  }
  return true;
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
  // The False Witness: copy (and exile) the opponent's biggest board threat —
  // both their best body removed and the best body we gain. Rank by
  // sacValueOnBoard (board presence, NOT cost-adjusted getCardValue — we don't
  // pay the copy's cost, so a fat 4/4 flyer beats an efficient 2/2).
  if (eff.kind === 'become_copy_of') {
    const oppC = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === them);
    if (oppC.length) {
      const sorted = oppC.slice().sort((a, b) => {
        const fa = findCard(a.iid), fb = findCard(b.iid);
        return (fb ? sacValueOnBoard(fb.card) : 0) - (fa ? sacValueOnBoard(fa.card) : 0);
      });
      return sorted[0];
    }
  }
  const harmful = ['affect_creature', 'fight'];
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
  // Grave-return pick: the migrated shape is move_card graveyard->hand
  // (tools/migrate-effects.js collapsed the retired `returnFromGraveyard` kind
  // into it); grant_cast_permission still recalls from a yard too. Value-pick
  // the best returnable card, deriving WHICH graveyard each candidate sits in
  // from its own stamped `controller` tag (getValidTargets stamps it per yard),
  // NOT a single binary yard — so cross-/multi-yard filters value correctly.
  // (findCard can't see graveyard cards, so look up by iid in the stamped
  // yard.) (audit A7-3)
  const isGraveReturn =
    eff.kind === 'grant_cast_permission' ||
    (eff.kind === 'move_card' && eff.from_zone === 'graveyard' && eff.to_zone === 'hand');
  if (isGraveReturn) {
    const scored = valid
      .filter(t => t.kind === 'graveyard_card')
      .map(t => {
        const yard = t.controller && G[t.controller] ? G[t.controller].graveyard : [];
        const card = yard.find(c => c.iid === t.iid);
        return {t, value: card ? cardValueOrZero(card) : 0};
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
  // Per-stack-episode trigger budget, NOT nesting depth (audit A3-3, kept
  // deliberately): increments on every resolution, resets only when the
  // stack empties with both players passing.
  G.triggerChainDepth = (G.triggerChainDepth || 0) + 1;
  if (G.triggerChainDepth > TRIGGER_DEPTH_CAP) {
    log(`Trigger budget exhausted (${TRIGGER_DEPTH_CAP} triggers this stack episode) — bailing to prevent a loop.`, 'imp');
    return;
  }
  // §1006.1 resolution-time re-validation: target legality was checked when
  // the trigger queued and again as it went on the stack — re-check NOW that
  // responses have had their window (hexproof gained in response, target left
  // play, filter no longer matched). Illegal slots are dropped; if no slot
  // survives, the whole trigger fizzles — rider effects included (§704.1).
  if (item.trig && !tsRevalidateTargets(item.trig, item.controller, item.targets)) {
    log(`${item.sourceName} trigger fizzles — no legal target.`, 'sp');
    afterEffectsApplied();
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
    allTargets: Array.isArray(item.targets) ? item.targets : [],
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
      // Human chooser → pause with the edict prompt (audit A4-7; the shared
      // gate the spell resolver always had). Trailing effects replay in
      // doEdictChoice; the AI path falls through to the handler's auto-pick.
      if (maybeDeferHumanChooses(ctx, eff, item.trig.effects || [], curTgt)) break;
      applyEffect(ctx, eff, curTgt, curSnap);
      if (ctx.chosen) { curTgt = ctx.chosen; curSnap = snapshotTarget(ctx.chosen); }
      continue;
    }
    if (effectNeedsTarget(eff)) {
      const slot = eff.target_slot || 0;
      const { tgt, snap } = getTriggerTargetForSlot(slot);
      if (!tgt) { log(`${item.sourceName} trigger fizzles — no target.`, 'sp'); continue; }
      // Legality was re-validated ONCE at resolution start (resolveTrigger →
      // tsRevalidateTargets); a null slot here was dropped as illegal. No
      // per-effect re-validation beyond the handlers' liveness guards:
      // multi-effect triggers (Exorcist [exile, gain_life]) need effect 1 to
      // read the pre-effect-0 snapshot. Each effect guards live-target itself.
      applyEffect(ctx, eff, tgt, snap);
    } else if (eff.scope === 'self') {
      // Self → source creature OR source's controller (shared fork, A4-13).
      const self = resolveSelfTarget(eff, item.sourceIid, item.sourceName, item.controller);
      applyEffect(ctx, eff, self.tgt, self.snap);
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
// Set-relative superlative selection (the targeting `select` step). Given
// graveyard candidates [{c, k}], returns those tied for the extreme of a stat.
// Distinct from a matchFilter threshold (a per-card test) — a superlative needs
// the whole candidate set, so it runs after filtering.
function selectStat(card, by) {
  switch (by) {
    case 'total_mana_cost': return costTotalCard(card);
    // extend here: 'power' / 'toughness' via getStats, etc.
    default: console.warn('select: unknown stat', by); return 0;
  }
}
function applySelect(cands, select) {
  const vals = cands.map(x => selectStat(x.c, select && select.by));
  const want = (select && select.extreme === 'least') ? Math.min(...vals) : Math.max(...vals);
  return cands.filter((_, i) => vals[i] === want);
}
function getValidTargets(effect, controller) {
  const allCreatures = [
    ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
    ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
  ].filter(x => hasType(x.card, 'Creature'))
   .filter(x => !(x.card.keywords.includes('hexproof') && x.ctrl !== controller));
  switch (effect.target) {
    case 'creature_or_player':  // "any target" — a creature or a player
      // The optional restriction (effect.filter / target_filter) applies to
      // the CREATURE half only (audit A4-8 — it used to be silently dropped
      // for this kind, so "deal 3 to any target with flying" would have
      // shipped unrestricted). matchFilter's vocabulary is card axes, so
      // players are always legal; a filter meant to exclude players is a
      // different (unsupported) concept and boot-rejected on player/opp.
      return [
        {kind:'player', who:'you', label: G.you.name},
        {kind:'player', who:'opp', label: G.opp.name},
        ...allCreatures
          .filter(x => matchFilter(x.card, effect.filter, x.ctrl, controller))
          .map(x => ({kind:'creature', iid:x.card.iid, label:x.card.name})),
      ];
    case 'player':
      // Card-axis filters never apply to players — a player/opp target
      // paired with a target_filter is rejected at boot (A4-8;
      // validateAllCardEffects).
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
    case 'graveyard_card': {
      // Cards in one or more graveyards, via composable filter axes:
      //   graveyards: which yards to search, as controller-relative tokens
      //     'self' / 'opp'. Default ['self'] — own yard (Grave Digger recursion).
      //   type / not_type / color / …: per-card restrictions via matchFilter
      //     (omit type = any card; Seal-Thief Courier uses not_type:'Land').
      //   select: an optional superlative pick (greatest/least by a stat),
      //     applied AFTER filtering (Deepseam Quarry: greatest total mana cost).
      // Hexproof doesn't apply to cards in a graveyard.
      const gf = effect.filter || {};
      const yardKey = { self: controller, opp: opp(controller) };
      const tokens = (Array.isArray(gf.graveyards) && gf.graveyards.length) ? gf.graveyards : ['self'];
      const keys = tokens.map(t => yardKey[t] || t);
      let cands = [];
      for (const k of keys) {
        for (const c of G[k].graveyard) {
          if (!matchFilter(c, gf, k, controller)) continue;
          cands.push({c, k});
        }
      }
      // `select` is a set-relative superlative, so it runs AFTER matchFilter
      // narrows the set ("the greatest" can't be a per-card test). Ties stay
      // legal so the chooser picks among equals.
      if (gf.select && cands.length) cands = applySelect(cands, gf.select);
      // controller tags which yard each card sits in (so the UI routes the pick);
      // move_card locates it by iid across both yards.
      return cands.map(x => ({kind:'graveyard_card', iid: x.c.iid, label: x.c.name, controller: x.k}));
    }
    case 'spell':
      // The restriction goes through matchFilterSpell (audit A4-8 — it was
      // silently dropped here while permanent_or_spell's stack half
      // enforced it). matchFilterSpell's axes are spliceable_*/not_token
      // today; type/color counterspell filters need an axis extension (a
      // separate design decision) and stay unsupported.
      // Trigger and kind:'ability' entries are excluded — "target spell"
      // never sees them (§1004.6; the `s.card` guard would already drop
      // them, but the kinds are named so the rule is explicit).
      return G.stack
        .filter(s => s.kind !== 'trigger' && s.kind !== 'ability' && s.card)
        .filter(s => matchFilterSpell(s.card, effect.filter))
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
        .filter(s => s.kind !== 'trigger' && s.kind !== 'ability' && s.card)
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
  'creature', 'player', 'opp', 'creature_or_player', 'spell', 'permanent', 'land',
  'your_creature', 'opp_creature', 'graveyard_card',
]);

// The target names getValidTargets' switch actually resolves (audit A11-1).
// Slot-level (`target_slots[i].target`) and effect-level (`e.target`) strings
// are served by getValidTargets DIRECTLY — not via targetsForFilter, which
// maps the TARGET_FILTERS taxonomy (your_creature / opp_creature / land) onto
// getValidTargets shapes before calling in. A name outside this set falls
// into getValidTargets' default arm at runtime (console.warn + []): the card
// boots clean and is silently uncastable forever. Boot validation
// (validateAllCardEffects) sweeps slot- and effect-level targets against this
// set. KEEP IN SYNC with both runtime paths: the getValidTargets switch above
// and targetsForFilter's case map below.
const GETVALIDTARGETS_TARGETS = new Set([
  'creature_or_player', 'player', 'opp', 'creature', 'permanent',
  'graveyard_card', 'spell', 'permanent_or_spell',
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
  // Per-kind scope (audit A4-8): card-object kinds (creature/permanent/land/
  // your_creature/opp_creature/graveyard_card) enforce the full matchFilter
  // vocabulary; creature_or_player enforces it on the creature half (players
  // are always legal); 'spell' enforces the matchFilterSpell axes only
  // (spliceable_*/not_token). player/opp accept NO restriction — the pairing
  // is rejected at boot (validateAllCardEffects).
  const merge = (f) => restrict ? Object.assign({}, f, restrict) : f;
  switch (filter) {
    case 'creature_or_player': return getValidTargets({ target: 'creature_or_player', filter: restrict || undefined }, controller);
    case 'player':             return getValidTargets({ target: 'player', filter: restrict || undefined }, controller);
    case 'opp':                return getValidTargets({ target: 'opp', filter: restrict || undefined }, controller);
    case 'creature':           return getValidTargets({ target: 'creature', filter: restrict || undefined }, controller);
    case 'permanent':          return getValidTargets({ target: 'permanent', filter: restrict || undefined }, controller);
    case 'land':               return getValidTargets({ target: 'permanent', filter: merge({ type: 'Land' }) }, controller);
    case 'spell':              return getValidTargets({ target: 'spell', filter: restrict || undefined }, controller);
    case 'graveyard_card':     return getValidTargets({ target: 'graveyard_card', filter: restrict || undefined }, controller);
    case 'your_creature':      return getValidTargets({ target: 'creature', filter: merge({ controller: 'self' }) }, controller);
    case 'opp_creature':       return getValidTargets({ target: 'creature', filter: merge({ controller: 'opp' }) }, controller);
    default:
      console.warn('Unknown target() filter:', filter);
      return [];
  }
}

// Per-slot legal targets for a multi-target object's targeted effects. When the
// object declares card-level `target_slots` (§5b) that array is AUTHORITATIVE:
// every declared slot is enumerated, whether or not a specific effect carries
// its `target_slot` — so one effect (e.g. `fight`) can reference multiple slots
// via operands without each needing its own scalar `target_slot`. This matches
// what probeTargetsForObject/objectNeedsTarget already read. Modal charms (no
// card-level slots) fall back to per-effect grouping: the intersection of the
// filters of the effects sharing each slot. Shared by the cast-legality check
// (isLegalAction) and the AI action enumerator (getLegalActions) so the slot
// resolution can't drift between them. Returns Map<slot, targets[]>.
function validTargetsBySlot(card, targetedEffs, who) {
  const slotSpecs = Array.isArray(card.target_slots) ? card.target_slots : null;
  const out = new Map();
  if (slotSpecs) {
    for (let slot = 0; slot < slotSpecs.length; slot++) {
      out.set(slot, getValidTargets(slotSpecs[slot], who));
    }
    return out;
  }
  const slotMap = new Map();
  for (const eff of targetedEffs) {
    const slot = eff.target_slot || 0;
    if (!slotMap.has(slot)) slotMap.set(slot, []);
    slotMap.get(slot).push(eff);
  }
  for (const [slot, effs] of slotMap) {
    let acc = getValidTargets(effs[0], who);
    for (let i = 1; i < effs.length; i++) {
      const next = getValidTargets(effs[i], who);
      acc = acc.filter(a => next.some(n => sameTarget(a, n)));
    }
    out.set(slot, acc);
  }
  return out;
}

// `distinct_targets` cards (Roots and Branches, Sword and Sorcery) require their
// slots to name DIFFERENT objects — the text reads "...another target creature",
// which is only honest if one creature can't fill both slots. True iff the chosen
// per-slot targets are pairwise distinct. Only the present entries are compared
// (sparse-fill placeholders are skipped by the callers, which pass the real picks).
function slotTargetsAreDistinct(targetsArr) {
  const seen = [];
  for (const t of targetsArr) {
    if (!t) continue;
    if (seen.some(s => sameTarget(s, t))) return false;
    seen.push(t);
  }
  return true;
}

// ─── Multi-slot target SELECTION component ─────────────────────────────────
// ONE place for "pick one legal target per slot, honoring cross-slot rules"
// (distinct_targets today). The legality ATOM (getValidTargets / targetsForFilter
// / validTargetsBySlot — hexproof enforced once) and the resolution-time fetch
// (makeSlotTargetGetter) are already shared; this is the selection layer that sat
// triplicated across the spell-cast, activated-ability, and trigger callers.
// `obj` is any target-bearing thing
// — a card, an activated ability, or a trigger — all carrying the same shape:
// top-level `target`(+`target_filter`), canonical `target_slots`, or legacy
// per-effect `target_slot` on `effects`.
const TS_COMBO_CAP = 200;

// Per-mode view of a card. Modal cards declare their targets via the chosen
// mode's effects; `target_slots` / top-level `target` stay card-level. Non-modal
// callers pass the card's own effects.
function tsModeObj(card, effects) {
  return {
    target: card.target, target_filter: card.target_filter,
    target_slots: card.target_slots, distinct_targets: card.distinct_targets,
    effects,
  };
}

// True when the object targets via the top-level target() step (the §3.5 hexproof
// checkpoint) rather than multi-slot target_slots — i.e. one canonical slot 0.
function tsHasTopLevelTarget(obj) {
  return !!obj.target && !(Array.isArray(obj.target_slots) && obj.target_slots.length > 0);
}

// Map<slotIdx, legalTargets[]> across all three target shapes.
function tsLegalBySlot(obj, who) {
  if (tsHasTopLevelTarget(obj)) {
    return new Map([[0, targetsForFilter(obj.target, who, obj.target_filter)]]);
  }
  const targetedEffs = (obj.effects || []).filter(effectNeedsTarget);
  return validTargetsBySlot(obj, targetedEffs, who);
}

// Cross-slot exclusion: drop targets already chosen for earlier slots when the
// object requires distinct picks. THE single home for the distinct_targets rule —
// every selection path (enumerate / auto-pick / human prompt / castable probe)
// filters through here, so "another target creature" can't drift between them.
// Operates on an already-fetched list so callers keep their one tsLegalBySlot call.
function tsExcludePicked(obj, list, picksSoFar) {
  if (!obj.distinct_targets || !Array.isArray(picksSoFar) || !picksSoFar.length) return list;
  return list.filter(t => !picksSoFar.some(p => p && sameTarget(p, t)));
}

// Sorted slot indices this object needs a target for.
function tsSlotKeys(obj, who) {
  return [...tsLegalBySlot(obj, who).keys()].sort((a, b) => a - b);
}

// Fill sparse holes in a slot-indexed targets[] with the first slot's pick, so
// resolution (makeSlotTargetGetter) always finds an entry. Defensive for the
// theoretical sparse-slot case (target_slots are dense 0..n-1 today → a no-op).
// CAUTION for distinct_targets: a future SPARSE-slot card (e.g. slots [0,2]) would
// have index 1 written with slot 0's pick, bypassing the per-slot distinct filter
// and injecting a DUPLICATE into a set that was meant to be distinct. Harmless
// today (all cards dense [0,1]); guard this if a sparse distinct card is added.
function fillSparseHoles(targets, firstSlotKey) {
  for (let i = 0; i < targets.length; i++) if (!targets[i]) targets[i] = targets[firstSlotKey];
}

// Dense per-slotKey combo → a slot-INDEXED targets[] (sparse holes filled with
// slot 0's pick, matching the legacy resolution indexing makeSlotTargetGetter uses).
function tsComboToTargets(combo, slotKeys) {
  const targets = [];
  for (let i = 0; i < slotKeys.length; i++) targets[slotKeys[i]] = combo[i];
  fillSparseHoles(targets, slotKeys[0]);
  return targets;
}

// Every legal full target set (each a slot-indexed targets[]). Replaces the
// bespoke cross-product in getLegalActions; honors distinct + the combo cap.
// Empty → a required slot has no legal target (uncastable) OR the object is
// untargeted (callers gate on objectNeedsTarget to tell those apart).
function tsEnumerate(obj, who) {
  const bySlot = tsLegalBySlot(obj, who);
  const slotKeys = [...bySlot.keys()].sort((a, b) => a - b);
  if (!slotKeys.length) return [];
  const validBySlot = slotKeys.map(s => bySlot.get(s));
  if (validBySlot.some(arr => !arr.length)) return [];
  let combos = [[]];
  for (const validList of validBySlot) {
    const next = [];
    for (const partial of combos) {
      for (const t of tsExcludePicked(obj, validList, partial)) {
        next.push(partial.concat([t]));
        if (next.length >= TS_COMBO_CAP) break;
      }
      if (next.length >= TS_COMBO_CAP) break;
    }
    combos = next;
    if (combos.length >= TS_COMBO_CAP) break;
  }
  return combos.map(combo => tsComboToTargets(combo, slotKeys));
}

// Validate a fully chosen target set: every slot legal + cross-slot constraint.
function tsIsLegalSet(obj, who, targets) {
  const bySlot = tsLegalBySlot(obj, who);
  const slotKeys = [...bySlot.keys()];
  for (const slot of slotKeys) {
    const tgt = targets && targets[slot];
    if (!tgt) return false;
    if (!(bySlot.get(slot) || []).some(v => sameTarget(v, tgt))) return false;
  }
  if (obj.distinct_targets && !slotTargetsAreDistinct(slotKeys.map(s => targets[s]))) return false;
  return true;
}

// §704.1 / §1006.1 — resolution-time target re-validation. Re-checks each
// locked target against the same per-slot legal sets used at cast/queue time
// (tsLegalBySlot → getValidTargets / targetsForFilter, so hexproof, filters,
// and zone changes all re-apply). Slots whose target is no longer legal are
// nulled IN PLACE — the per-slot resolvers already treat a null slot as
// "target gone" and skip just that effect, so a multi-target entry proceeds
// against its remaining legal targets (partial fizzle). Returns false when
// EVERY targeted slot is illegal: the caller fizzles the whole entry — no
// effects run, untargeted riders included (§704.1 whole-object fizzle), and
// costs stay paid. Untargeted objects pass trivially. Runs ONCE, before the
// effect loop, so the within-resolution snapshot/LKI semantics (multi-effect
// entries reading pre-effect-0 state) are untouched.
function tsRevalidateTargets(obj, who, targets) {
  if (!objectNeedsTarget(obj)) return true;
  const bySlot = tsLegalBySlot(obj, who);
  let anyLegal = false;
  for (const slot of bySlot.keys()) {
    const tgt = Array.isArray(targets) ? targets[slot] : null;
    if (tgt && (bySlot.get(slot) || []).some(v => sameTarget(v, tgt))) {
      anyLegal = true;
    } else if (Array.isArray(targets) && targets[slot]) {
      targets[slot] = null;
    }
  }
  return anyLegal;
}

// The effect that VALUES a slot's pick (for the AI / auto-picker). Multi-slot:
// the slot's own effect. A top-level target() trigger has bare effects (not
// individually targeted), so fall back to the trigger's intent-defining effect
// (become_copy_of → grant_cast_permission → first non-chooses).
function tsSlotValueEff(obj, slot) {
  const allEffs = obj.effects || [];
  return allEffs.filter(effectNeedsTarget).find(e => (e.target_slot || 0) === slot)
    || allEffs.find(e => e.kind === 'become_copy_of')
    || allEffs.find(e => e.kind === 'grant_cast_permission')
    || allEffs.find(e => e.kind !== 'chooses')
    || allEffs[0] || {};
}

// The target filter TYPE for a slot (creature / opp / player / spell / …).
function tsSlotTargetType(obj, slot) {
  if (tsHasTopLevelTarget(obj)) return obj.target;
  if (Array.isArray(obj.target_slots) && obj.target_slots[slot]) return obj.target_slots[slot].target;
  const eff = (obj.effects || []).filter(effectNeedsTarget).find(e => (e.target_slot || 0) === slot);
  return eff ? eff.target : null;
}

// Implicit target types resolve automatically — no human choice to offer: the
// lone opponent, a free player choice, the source itself, a stack spell.
function tsIsImplicitTargetType(type) {
  return !type || type === 'self' || type === 'player' || type === 'opp' || type === 'spell';
}

// AI / auto pick: a full slot-indexed target set, one legal target per slot,
// valued by pickBestTriggerTarget and honoring distinct. Generalizes the
// single-target trigger auto-pick to N slots. Returns null if any slot has no
// legal target (→ the caller fizzles the trigger).
function tsAutoPick(obj, who) {
  const bySlot = tsLegalBySlot(obj, who);
  const slotKeys = [...bySlot.keys()].sort((a, b) => a - b);
  const picks = [];
  for (const slot of slotKeys) {
    const valid = tsExcludePicked(obj, bySlot.get(slot) || [], picks);
    if (!valid.length) return null;
    picks[slot] = pickBestTriggerTarget(tsSlotValueEff(obj, slot), valid, who);
  }
  fillSparseHoles(picks, slotKeys[0]);
  return picks;
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
      // distinct_targets: each slot's stand-in must differ from earlier picks (via
      // tsExcludePicked, the shared cross-slot rule), so the castable-glow greys the
      // spell out unless two distinct targets exist.
      const pick = tsExcludePicked(obj, getValidTargets(spec, who), fakes)[0];
      if (!pick) return null;
      fakes.push(pick);
    }
    return fakes;
  }
  return fakeTargetsForLegality(obj.effects, who);
}

// Stack-item filter (stack items aren't on bf, so no tapped/controller/hexproof).
function matchFilterSpell(card, filter) {
  if (!filter) return true;
  if (filter.spliceable_base && !isSpliceableBase(card.tplId)) return false;
  // Same staple eligibility as matchFilter's permanent branch: template
  // spliceable AND no prior chain (stapleChainOf). Before this, a stapled
  // spell on the STACK passed legality and only fizzled at resolution.
  if (filter.spliceable_staple
      && (!isSpliceableStaple(card.tplId) || stapleChainOf(card).length > 0)) {
    return false;
  }
  if (filter.not_token && card.isToken) return false;
  return true;
}
function matchFilter(card, filter, controller, who) {
  if (!filter) return true;
  if (filter.tapped !== undefined && card.tapped !== filter.tapped) return false;
  // Color checks test the FULL color identity (audit A4-6): card.color is
  // just colors[0], so first-pip equality let "non-Black" Doom Blade destroy
  // the {U}{B} Seal-Thief Courier and would make {color:'U'} reject a W/U card.
  if (filter.not_color && colorsOfCard(card).includes(filter.not_color)) return false;
  if (filter.color && !colorsOfCard(card).includes(filter.color)) return false;
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
  // Card-type filter — narrows "target <type>" spells (e.g. Living Lands'
  // "target land") to the named card type. Sibling of the subtype filter;
  // reads through hasType so animate / type-change effects are respected.
  // Without this, a target_filter:{type:'Land'} silently accepts any permanent.
  if (filter.type && !hasType(card, filter.type)) return false;
  if (filter.not_type && hasType(card, filter.not_type)) return false;
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
  // can act as a base in the existing splice infrastructure: no special
  // cards (Elystra/Codex/Stapler itself), no tokens, no modal cards. Lands
  // ARE valid bases — designed and tiebreak-prioritized (canonicalSplicePair
  // ranks Land above Spell for the base). Routes through isSpliceableBase
  // which is the canonical check.
  if (filter.spliceable_base && !isSpliceableBase(card.tplId)) return false;
  // Spliceable-staple filter (Stapler's second target). Must be a card
  // that can act as a staple-half: spliceable AND not already stapled
  // (the stapled-as-staple constraint). Tokens fail isSpliceableStaple's
  // template lookup since they live in TOKENS, not CARDS — handled inside
  // the helper.
  if (filter.spliceable_staple) {
    if (!isSpliceableStaple(card.tplId)) return false;
    // "Already stapled" check — stapleChainOf reads whichever chain field is
    // populated (the one shared definition; see its header).
    if (stapleChainOf(card).length > 0) return false;
  }
  return true;
}

// The four matchFilter axes that read getStats. Lord-buff evaluation must
// not use them (getStats walks the lord loop → recursion, audit A4-14);
// boot validation rejects them inside static_buffs (validateAllCardEffects).
const STAT_BOUND_FILTER_KEYS = ['max_tough', 'min_tough', 'max_power', 'min_power'];

// matchFilter through a STATS-FREE view: the four stat-bound axes are
// skipped (treated as matching). Sole consumer today is lordBuffApplies —
// the one funnel through which both static_buff halves (stat + keyword)
// evaluate their filters — so a stat-bounded lord filter can no longer
// close the getStats ↔ matchFilter cycle into a RangeError (audit A4-14).
// If stat-bounded lord buffs are ever designed for real, the non-circular
// semantics is thresholding on PRE-lord stats; until then they're
// boot-rejected and skipped here.
function matchFilterNoStats(card, filter, controller, who) {
  if (filter && STAT_BOUND_FILTER_KEYS.some(k => filter[k] !== undefined)) {
    const f = { ...filter };
    for (const k of STAT_BOUND_FILTER_KEYS) delete f[k];
    return matchFilter(card, f, controller, who);
  }
  return matchFilter(card, filter, controller, who);
}

function sameTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'player') return a.who === b.who;
  if (a.kind === 'creature') return a.iid === b.iid;
  if (a.kind === 'permanent') return a.iid === b.iid;
  if (a.kind === 'graveyard_card') return a.iid === b.iid;
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
  card.counters = {};   // named counters vanish when the permanent leaves play (MTG 122.1g)
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
  // Copy revert (The False Witness): a card that became a copy re-derives its
  // printed identity from its base template on leave-play — the same
  // materialize-then-re-derive pattern keywords/type-grants use. typeGrants are
  // already cleared above, so types revert too. copySourceIid is deliberately
  // RETAINED: the leave trigger fired by this very departure still needs it to
  // return the exiled original (read off the event's subject_card).
  if (card.copyOf) {
    // Clear the flag FIRST: intrinsicKeywords is copy-aware (audit A4-5), and
    // this branch wants the BASE identity back — re-deriving with copyOf
    // still set would rebuild the copied keywords we're reverting.
    card.copyOf = null;
    const baseTpl = CARDS[card.tplId];
    if (baseTpl) {
      card.name = baseTpl.name;
      card.power = baseTpl.power;
      card.toughness = baseTpl.toughness;
      card.abilities = baseTpl.abilities
        ? baseTpl.abilities.map(ab => ({ ...ab, cost: ab.cost ? { ...ab.cost } : undefined,
            effects: (ab.effects || []).map(e => ({ ...e })) }))
        : undefined;
      card.static_buffs = baseTpl.static_buffs
        ? baseTpl.static_buffs.map(b => ({ ...b, filter: b.filter ? { ...b.filter } : undefined,
            keywords: b.keywords ? b.keywords.slice() : undefined }))
        : undefined;
      card.triggers = (baseTpl.triggers || []).map(t => ({ ...t,
        effects: (t.effects || []).map(e => ({ ...e })) }));
      card.keywords = intrinsicKeywords(card);
      card.text = describeCardText(card);
    }
  }
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

function moveToGraveyard(card, controller, batch) {
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
  // A4-4: mass-scope destroy defers this emit into `batch` (see
  // deferOrEmitLeave) so simultaneous deaths see each other; single-target
  // callers pass no batch and emit immediately, as always.
  deferOrEmitLeave(batch, card, controller, 'graveyard', undefined);
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
      // Granted keywords: remove this source from each keyword's grant set
      // (e.g., Bindspeaker dies → target loses defender). Strip logic shared
      // with applyStaticKeywordGrants' revoke pass (audit A4-2).
      if (c.grantedBy instanceof Map) {
        for (const kw of [...c.grantedBy.keys()]) stripGrantedKeyword(c, kw, sourceIid);
      }
    }
  }
}

// Remove sourceIid from `card`'s grant set for `kw`. If the set empties, the
// keyword is stripped from card.keywords UNLESS it's intrinsic (template /
// sticker / subtype-implied) or still carried by a live EOT grant (Threaten's
// grant_haste must survive a lord-grant revocation). Shared by
// clearRestrictionsFromSource (leave-play) and applyStaticKeywordGrants'
// revoke pass (filter falsification, audit A4-2).
function stripGrantedKeyword(card, kw, sourceIid) {
  if (!(card.grantedBy instanceof Map)) return;
  const sources = card.grantedBy.get(kw);
  if (!sources || !sources.has(sourceIid)) return;
  sources.delete(sourceIid);
  if (sources.size === 0) {
    card.grantedBy.delete(kw);
    if (!intrinsicKeywords(card).includes(kw)
        && !(Array.isArray(card.eotGrants) && card.eotGrants.includes(kw))) {
      const idx = card.keywords.indexOf(kw);
      if (idx >= 0) card.keywords.splice(idx, 1);
    }
  }
}

// Draw the top card of `who`'s library into their hand. `sourceIid` names the
// card that CAUSED the draw (a "draw(2)" spell, a triggered draw) when one is
// in scope — it rides the card_zone_change emit so noSelfCascade can
// self-suppress; the turn-draw passes none.
//
// Zone-event note (audit A3-6): this is the ONE library→hand draw seam, so the
// emit below announces every in-game draw. Opening hands deliberately bypass
// it — makePlayer constructs hand/library by array ops before the game starts,
// and Magiclike's rule is that zone-movement events DO NOT EXIST before the
// game begins (canon §1002.2): setup placement and the forced mulligan are not
// "moves", and abilities have no battlefield to listen from yet anyway.
function drawCard(who, sourceIid) {
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
  // A3-6: announce the draw. Listeners are battlefield permanents (emit()'s
  // walk is unchanged); a `card_moves(library, hand)` trigger now fires.
  emitZoneChange(c, who, 'library', 'hand', undefined, sourceIid);
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

// Card leaves play, persistent buffs survive on the slot. Used by the
// affect_creature bounce/exile arms AND every move_card battlefield-leave
// (bounce/flicker/exile/shuffle — audit A4-16; the move_card path used to
// skip the flush behind a dead `post.keep_buffs` flag no card carried).
// Order matters: flush BEFORE resetInPlayState.
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
// downstream trigger handlers read the leaving card as ctx.event.subject_card
// (NOT event.card — that legacy field is gone; reading it broke Archdemon's
// bargain payout and Endomorph's absorb post-E1). The object arrives in the
// same state it left play (slotIdx intact, bargainsNum intact, etc).
//
// For creatures that fire BOTH this AND cardDies (on death), the leaves
// event emits FIRST (before resetInPlayState/dies-emit). Cards that want
// only one of the two should declare exactly one trigger.
// A2-3 / A2-5: ONE "leaves combat" concept. A creature that leaves the
// battlefield (or changes controller — CR 506.4c) is removed from combat:
//   - G.attackers: its iid is pruned. Cast arrivals do NOT re-mint iids
//     (only the move_card/flicker path does), so without this prune a
//     declared attacker bounced to hand and flash-re-cast re-matched its
//     stale entry and dealt combat damage while sick, untapped, and never
//     re-declared (the A2-3 ghost attacker).
//   - G.blockers entries whose VALUE (the attacker being blocked) is the
//     leaving iid: deleted — the assignment's target is gone; the blocker
//     stays on the battlefield but is freed (the staple-remap rule).
//   - G.blockers entries whose KEY (the blocker) is the leaving iid: the
//     key is retired to a 'gone:<iid>' tombstone that no live card can
//     findCard-match, but the ENTRY survives — an attacker that was blocked
//     STAYS blocked when its blocker leaves combat (MTG 509/510.1c; the
//     pre-existing engine behavior, which dealCombatDamage realizes as
//     wasBlocked=true with zero living blockers). Deleting the entry would
//     wrongly flip the attacker to unblocked; keeping the live key would
//     let a bounced-and-re-cast blocker re-inherit its block (the A2-3
//     symmetric hole).
function removeFromCombat(iid) {
  if (Array.isArray(G.attackers)) {
    const ai = G.attackers.indexOf(iid);
    if (ai >= 0) G.attackers.splice(ai, 1);
  }
  if (G.blockers && typeof G.blockers.forEach === 'function') {
    // Snapshot entries before mutating the Map.
    const entries = Array.from(G.blockers.entries());
    for (const [bIid, aIid] of entries) {
      if (aIid === iid) {
        G.blockers.delete(bIid);
      } else if (bIid === iid) {
        G.blockers.delete(bIid);
        G.blockers.set('gone:' + bIid, aIid);
      }
    }
  }
}
function emitLeavesBattlefield(card, controller, destZone, extraSources, sourceIid) {
  if (!card) return;
  // Cross the card off the combat bookkeeping the moment it leaves play —
  // BEFORE the zone-change emit, so triggers observe consistent combat
  // state. See removeFromCombat above (A2-3).
  removeFromCombat(card.iid);
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
  // A3-11: sourceIid names the card that CAUSED the departure (PROTOCOL §3.3
  // source_iid; feeds the noSelfCascade guard). Effect-driven callers thread
  // ctx.sourceIid; the death/sacrifice paths (checkDeaths, moveToGraveyard,
  // sacrificeCard) pass nothing — there causality is a player key (killedBy)
  // or a multi-iid Set (damagedBySources), not a single causing card.
  emitZoneChange(card, controller, 'battlefield', destZone || 'graveyard',
                 extraSources || [{card, controller}], sourceIid);
}

// Record a damage event's attribution on the victim. ONE writer for the two
// views every damage site used to hand-sync:
//   damagedBySources — Set of source iids that damaged this card this turn
//     (cleared in the EOT cleanup sweep); powers Sengir-style "a creature
//     dealt damage by this card this turn dies" triggers
//     (card_damaged_by_this). ANY iid-bearing source records — creature,
//     artifact, spell — so future non-creature damage sources ("whenever
//     this kills something, …") aren't pre-foreclosed. Today only
//     battlefield permanents can LISTEN for the predicate, so non-creature
//     entries are inert evidence; the original creature-source gate bought
//     nothing but a smaller Set and contradicted its own design note
//     ("populated by combat & spell damage").
//   killedBy — player key, last-writer-wins; if the creature ends up dying,
//     this is who gets keyword-claim credit (claimKeywordsFromKill). Written
//     unconditionally — spells DO claim kills for the reward screen.
// DAMAGE only — destroy/edict paths set killedBy directly (destroying isn't
// dealing damage, so they must never stamp damagedBySources).
function recordDamage(victim, sourceCard, controller) {
  if (!victim) return;
  victim.killedBy = controller;
  if (sourceCard && sourceCard.iid != null) {
    if (!(victim.damagedBySources instanceof Set)) victim.damagedBySources = new Set();
    victim.damagedBySources.add(sourceCard.iid);
  }
}

// The shared trophy rule — what may be claimed from a slain creature, used by
// BOTH keyword-claim systems (Endomorph's absorb and the end-of-game reward
// claims): the keywords the creature intrinsically OWNED — printed + sticker-
// granted + subtype-implied (intrinsicKeywords) — never borrowed magic (lord
// auras, until-EOT grants), and never defender (not a trophy, never offered
// as a sticker reward). Reading intrinsics rather than the live keywords
// array makes the rule independent of death-pipeline ordering: today
// resetInPlayState happens to strip grants before the dies-event emits, but
// no claim path should rely on that.
function claimableKeywords(corpse) {
  return intrinsicKeywords(corpse).filter(kw => kw !== 'defender');
}

// Credit killer with the dying creature's claimable keywords (see
// claimableKeywords — intrinsics only; borrowed lord/EOT grants are NOT
// claimable, matching Endomorph's absorb rule).
function claimKeywordsFromKill(card, killer) {
  if (!card || !hasType(card, 'Creature')) return;
  if (!killer || !G[killer]) return;
  if (!(G[killer].claimedKeywords instanceof Set)) {
    G[killer].claimedKeywords = new Set();
  }
  for (const kw of claimableKeywords(card)) {
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
        if (c.keywords.includes('indestructible') && t > 0) {
          // F2: indestructible only skips the death check — it does NOT heal.
          // Keep the marked damage (and the deathtouch flag): if indestructible
          // is removed later this turn, the still-lethal damage kills it at the
          // next SBA (MTG-correct). Both clear at end of turn with everything else.
          //
          // A1-3: the exemption covers only the damage/deathtouch death causes.
          // A creature at toughness <= 0 dies regardless of indestructible —
          // 0-toughness death isn't destruction (MTG 704.5f; canon
          // docs/wiki/rules/1100-state-based-actions.md), hence the `t > 0`.
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
    // Leaves-play emit for each dying card, in the same batch order. Emitted
    // after the whole batch is spliced off the battlefield, with the batch as
    // extraSources, so simultaneous deaths see each other's card_zone_change.
    // (The legacy cardDies event is retired — E1; this is the only death emit.)
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

// Shared slot-pointer fixup for ANY run-slot removal (audit A9-2/A9-3). The
// removeSlotByIdx caller contract has two invariants, and this is the shared
// place both live (used by every rip site AND both splice slot-removal paths;
// the Stapler out-of-charges rip still inlines (1) only — deferred under the
// A5-4 ballot): (1) every in-game card whose cached slotIdx sits ABOVE the
// removed index must decrement (so slot-based lookups stay valid); (2) the
// player's playedSlotIdxs Set — read by the win-reward filter (filterByPlayed)
// — must be remapped the SAME way (DROP the removed index, DECREMENT every
// index above it). The Set was never named by the old contract, so every
// contract-honoring removal site left it stale, mis-aiming sticker rewards (A9-3).
function fixupSlotPointersAfterRemoval(who, removedIdx) {
  const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile'];
  for (const zoneName of zones) {
    const zone = G[who][zoneName];
    if (!zone) continue;
    for (const c of zone) {
      if (typeof c.slotIdx === 'number' && c.slotIdx > removedIdx) c.slotIdx -= 1;
    }
  }
  const played = G[who] && G[who].playedSlotIdxs;
  if (played instanceof Set && played.size > 0) {
    const remapped = new Set();
    for (const i of played) {
      if (i === removedIdx) continue;            // drop-at: the slot is gone
      remapped.add(i > removedIdx ? i - 1 : i);  // decrement-above
    }
    G[who].playedSlotIdxs = remapped;
  }
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
  // Decrement slotIdx for cards past the removed slot AND remap playedSlotIdxs
  // (audit A9-2/A9-3 — the shared contract fixup).
  fixupSlotPointersAfterRemoval(who, ripIdx);
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
  fixupSlotPointersAfterRemoval(who, ripIdx);  // slotIdx decrement + playedSlotIdxs remap (audit A9-2/A9-3)
  const deckLabel = who === 'you' ? 'your deck' : "opponent's deck";
  const duration = who === 'you' ? 'gone forever' : 'gone for the rest of this fight';
  log(`${logPrefix || '✂'} ${removedCardName || 'card'} ripped from ${deckLabel} — ${duration}.`, 'dmg');
  return true;
}

// Lose `n` life (n > 0) — the ONE writer for life LOSS, shared by
// damagePlayer (burn/combat) and gain_life's negative branch (drains).
// Audit A4-12: drains used to subtract raw, bypassing Phylactery entirely —
// the protected player sat at negative life and the next damagePlayer's
// max(0, …) then RESET them up to 0. Design ruling (option A): ONE price
// for losing life — under Phylactery, life floors at 0 and each would-be
// point below 0 rips a slot, whether the loss came from damage or a drain
// (Phylactery's text reads "Life lost past 0").
function losePlayerLife(who, n, sourceIid) {
  if (!(n > 0)) return;
  const lifeBefore = G[who].life;
  const lifeAbsorb = Math.max(0, lifeBefore);
  if (hasPhylacteryProtection(who)) {
    G[who].life = Math.max(0, lifeBefore - n);
    const overflow = Math.max(0, n - lifeAbsorb);
    for (let i = 0; i < overflow; i++) {
      const ok = ripSlotForPhylactery(who);
      if (!ok) break;   // out of slots; player will die on next checkLifeTotals
    }
  } else {
    G[who].life -= n;
  }
  // Track ACTUAL life lost this turn (post-Phylactery). Bloodlust triggers
  // need loss that reached the life total — fully-absorbed loss doesn't count.
  const lifeLost = lifeBefore - G[who].life;
  if (lifeLost > 0) {
    G[who].lifeLostThisTurn = (G[who].lifeLostThisTurn || 0) + lifeLost;
    // D4: damage IS life loss — fire the directional life_changed(delta<0) so
    // "whenever you lose life" (is_life_loss) triggers fire from burn/combat,
    // not only from gain_life(negative)/drain. (is_life_gain needs delta>0, so
    // a negative delta can't mis-fire it.)
    // A3-11: source_iid names the damage source (spell callers thread
    // ctx.sourceIid, combat threads atk.iid) — PROTOCOL §3.3 payload parity
    // with the other life_changed emitters; feeds the noSelfCascade guard.
    emit({type: 'life_changed', who, delta: -lifeLost, source_iid: sourceIid});
  }
}

// Damage to a player. With Phylactery: life floors at 0; overflow rips slots.
// Without: life can go negative; checkLifeTotals triggers loss at ≤0.
// Floor-at-0 keeps life-gain intuitive (gaining 3 from 0 → 3, not -X+3).
function damagePlayer(who, amount, sourceName, sourceIid) {
  if (!(amount > 0)) return;
  log(`${sourceName || 'damage'} deals ${amount} to ${pname(who)}.`, 'dmg');
  losePlayerLife(who, amount, sourceIid);
}
function emitCombatDamageToPlayer(source, controller, who, amount) {
  if (!source || amount <= 0) return;
  emit({
    type: 'combat_damage',
    who,
    amount,
    subject_iid: source.iid,
    subject_card: source,
    controller,
  });
}
function afterEffectsApplied() { checkDeaths(); checkLifeTotals(); }

// =========================================================================
// Priority-round primitives. MtG-style: holders take turns acting/passing;
// adding to stack hands priority to the non-caster and resets passes; when
// both have passed since last stack change, top of stack resolves (or, if
// stack empty, round closes and phase advances).
// =========================================================================
function openPriorityRound() {
  G.priority = { passes: new Set() };
  // Priority always opens with the active player (MTG 117.3b). A caller-
  // supplied initial holder would be unreliable anyway: drainTriggers →
  // pushTriggerEntry overwrites priorityHolder when triggers are pending.
  G.priorityHolder = G.activePlayer;
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
      // Stack just emptied: reset the per-episode trigger budget (we're
      // done with that pile).
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
  // isLegalAction → isInstantWindow / isMainPhaseWindow — both of which
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
  // Activated-ability entries (A3-2 stackable infrastructure) likewise.
  if (item.kind === 'ability') {
    resolveAbilityEntry(item);
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
    const ctx = { controller: item.controller, sourceName: card.name, sourceIid: card.iid, sourceCard: card,
                  allTargets: Array.isArray(item.targets) ? item.targets : [] };
    // Pick effects by mode. For non-modal cards, this returns the flat
    // effect list. For modal cards, returns the chosen mode's effects.
    const activeEffects = effectsForMode(card, item.modeIdx);
    // §704.1 resolution-time target re-validation (the spell-side twin of
    // resolveTrigger's gate): targets were legal at cast time — re-check NOW
    // that responses have had their window. Illegal slots are dropped (the
    // per-slot resolvers skip them); if EVERY targeted slot is illegal the
    // spell fizzles whole — no effects run (riders included), it goes to the
    // graveyard, and costs stay paid. Untargeted spells pass trivially.
    if (!tsRevalidateTargets(tsModeObj(card, activeEffects), item.controller, item.targets)) {
      log(`${card.name} fizzles — no legal target.`, 'sp');
      G[card.owner || item.controller].graveyard.push(card);
      // A3-6: a fizzled spell still moves stack→graveyard — announce it.
      emitZoneChange(card, item.controller, 'stack', 'graveyard');
      afterEffectsApplied();
      return;
    }
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
    // pull from item.targets[N]. Snapshots are computed per slot lazily —
    // the FIRST read of a slot freezes its last-known-information snapshot
    // (§3.6), so a multi-effect spell like decomposed Swords ([exile,
    // gain_life]) reads the target's pre-removal power/controller even
    // after an earlier effect removed the card.
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
        // Human-facing selection (GAP 2 / audit A4-7): when the player
        // forced to choose is the human, pause and prompt instead of
        // auto-picking — via the shared gate all three resolution loops use.
        // Trailing effects (sacrifice/annihilate/rip) replay in
        // doEdictChoice once the human picks. The AI path (and an empty
        // pool) falls through to the handler's auto-pick.
        if (maybeDeferHumanChooses(ctx, eff, activeEffects, curTgt)) {
          break; // defer; spell still moves to graveyard. doEdictChoice resumes.
        }
        // Reads the established player (curTgt) and records ctx.chosen; the
        // chosen permanent becomes the operative target for the next effect.
        applyEffect(ctx, eff, curTgt, curSnap);
        if (ctx.chosen) { curTgt = ctx.chosen; curSnap = snapshotTarget(ctx.chosen); }
        continue;
      }
      if (eff.scope === 'self') {
        // Self → source creature OR source's controller (the shared A4-13
        // fork). For a spell the "creature" is the sorcery card itself —
        // not on the battlefield, so creature-operating self effects fizzle
        // gracefully while player-operating ones (Final Strike's "you lose
        // 2 life") hit the controller. Bug observed v0.99.29.
        const self = resolveSelfTarget(eff, card.iid, card.name, item.controller);
        tgt = self.tgt;
        snap = self.snap;
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
      // A3-6: deliberately NO stack→graveyard emit here — the graveyard push
      // is transient bookkeeping for the rip sweep, and rip is the engine's
      // no-trigger removal verb (the card never durably arrives anywhere).
      G[card.owner || item.controller].graveyard.push(card);
      ripSlotByIdx(item.controller, card.slotIdx, `Elystra binds ${card.name}`);
      afterEffectsApplied();
      return;
    }
    G[card.owner || item.controller].graveyard.push(card);
    // A3-6: a resolved sorcery moving stack→graveyard is announced. As with
    // `counter`, `controller` is the caster; the pile is owner-routed.
    emitZoneChange(card, item.controller, 'stack', 'graveyard');
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
  // A2-1: first-strike membership is SNAPSHOTTED here, once, before any
  // damage — both strike steps consult this set, never live keywords.
  // Deaths are swept BETWEEN the passes (afterEffectsApplied), and a dying
  // lord revokes its granted keywords (clearRestrictionsFromSource) — under
  // a live read, a creature whose first-strike grant died with its lord
  // re-qualified for the pass-2 `!first_strike` filter and dealt damage
  // TWICE (and a creature gaining first strike between passes dealt zero).
  // Each combatant deals damage in exactly the wave the snapshot assigns:
  // pass 1 if it had first strike when damage started, pass 2 otherwise —
  // never both (no accidental double-strike semantics). Design ruling,
  // PR #98, 2026-06-11 (audit A2-1): per MTG — step 507 has no priority
  // window between the strike steps, so nothing can respond to the
  // revocation; canon §803.
  const fsIids = new Set(
    allCombatants.filter(c => c.keywords.includes('first_strike')).map(c => c.iid)
  );

  if (fsIids.size > 0) {
    // First-strike step: only snapshot first-strikers deal damage.
    dealCombatDamage(blocked, defender, c => fsIids.has(c.iid));
    afterEffectsApplied();
    if (G.gameOver) return;
    // Normal step: everyone who did NOT have first strike at damage start.
    dealCombatDamage(blocked, defender, c => !fsIids.has(c.iid));
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
    // A2-8: source_iid matches the sibling emitters (applyDamageFrom,
    // gain_life) per PROTOCOL §3.3 — without it a noSelfCascade "you gain
    // life" trigger couldn't recognize its own combat-lifelink gain.
    emit({type: 'life_changed', who: srcCtrl, delta: amt, source_iid: source.iid});
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
        damagePlayer(defender, aPow, atk.name, atk.iid);
        emitCombatDamageToPlayer(atk, atkCtrl, defender, aPow);
        applyLifelink(atk, atkCtrl, aPow);
      }
      return;
    }
    if (livingBlockers.length === 0) {
      if (atkDeals && atk.keywords.includes('trample') && aPow > 0) {
        damagePlayer(defender, aPow, `${atk.name} (trample)`, atk.iid);
        emitCombatDamageToPlayer(atk, atkCtrl, defender, aPow);
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
      // Lethal-equivalent. Deathtouch: 1 point of deathtouch damage is a
      // lethal dose vs EVERY blocker, indestructible included — the
      // indestructible creature is lethal-marked but survives (immunity
      // lives in checkDeaths, not here). Design ruling, PR #98, 2026-06-10
      // (audit A2-7); matches §902.3/§803, which state the rule unqualified.
      const lethalNeeded = atkDeathtouch
        ? Math.min(1, Math.max(0, bTou - blk.damage))
        : Math.max(0, bTou - blk.damage);
      let dmgToBlk = 0;
      // Try to satisfy lethal damage. Indestructibles take damage marked
      // (which doesn't kill them) but counts toward enabling trample.
      // A2-2: a blocker that needs 0 more (a fully-marked indestructible —
      // F2 retains its marked damage) is already SATISFIED — it takes no
      // damage and must not suppress trample carryover (§803: assign each
      // blocker's REMAINING toughness; 0 remaining ⇒ satisfied with 0).
      if (atkDeals && remaining >= lethalNeeded) {
        // Inner guard: a zero-need blocker gets no 0-damage recordDamage
        // falsely staking a kill claim (and no zero lifelink/log noise).
        if (lethalNeeded > 0) {
          blk.damage += lethalNeeded;
          dmgToBlk = lethalNeeded;
          // dealtDeathtouch = victim-side mark: the BLOCKER received deathtouch
          // damage (despite the name; Godot calls it lethal_marked). See audit
          // A2-10. Indestructibles are marked too (A2-7): checkDeaths skips
          // them while indestructible, but if the keyword is removed later
          // this turn the still-lethal mark kills them at the next SBA —
          // same F2 semantics as retained marked damage.
          if (atkDeathtouch) blk.dealtDeathtouch = true;
          // Even non-lethal damage "stakes the claim" if the creature ends up
          // dying later in combat (recordDamage: last-writer-wins killedBy).
          recordDamage(blk, atk, atkCtrl);
          applyLifelink(atk, atkCtrl, lethalNeeded);
          remaining -= lethalNeeded;
        }
      } else {
        unsatisfied.push(fb);
      }
      // Blocker deals back regardless (damage is simultaneous in MtG; the
      // kill resolves at SBA after the strike step).
      let dmgToAtk = 0;
      if (dealsDamage(blk) && bPow > 0) {
        attackerDamage += bPow;
        dmgToAtk = bPow;
        // dealtDeathtouch = victim-side mark: the BLOCKER has deathtouch and
        // the ATTACKER — its victim — gets the flag (despite the name; Godot
        // calls it lethal_marked). See audit A2-10.
        if (blk.keywords.includes('deathtouch')) atk.dealtDeathtouch = true;
        // Mirror of the blocker tagging above.
        recordDamage(atk, blk, blkCtrl);
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
    //   - All satisfied + no trample → leftover wasted, but lifelink still
    //     gains it (full power, even when the damage is overkill — design
    //     ruling, PR #98, 2026-06-10; audit A2-7)
    if (atkDeals && remaining > 0) {
      if (unsatisfied.length === 0 && atk.keywords.includes('trample')) {
        damagePlayer(defender, remaining, `${atk.name} (trample)`, atk.iid);
        emitCombatDamageToPlayer(atk, atkCtrl, defender, remaining);
        applyLifelink(atk, atkCtrl, remaining);
      } else if (unsatisfied.length > 0) {
        const dump = unsatisfied[0].card;
        dump.damage += remaining;
        recordDamage(dump, atk, atkCtrl);
        applyLifelink(atk, atkCtrl, remaining);
        // Also log the dump so the player sees that the attacker piled
        // leftover damage onto one blocker. Without this, the per-pair
        // logs above would each show "(0)" damage to blocker, hiding the
        // fact that one of them actually took the full leftover.
        log(`${atk.name} piles ${remaining} extra damage onto ${dump.name}.`, 'cb');
      } else {
        // All blockers satisfied, no trample: the leftover damage goes
        // nowhere — but lifelink still gains it. Design ruling, PR #98,
        // 2026-06-10 (audit A2-7): lifelink always gains the attacker's
        // full power, even when that damage is overkill.
        applyLifelink(atk, atkCtrl, remaining);
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
  // Comes-into-play tapped (Deepseam Quarry): unavailable for mana this turn;
  // untaps on the controller's next untap step like any tapland.
  if (card.enters_tapped) card.tapped = true;
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
  // A7-1: the tap lane pays ONLY the tap; an extra-cost mana ability must never
  // resolve here (its sacrifice/remove_counters would be silently skipped, and a
  // tapless one would be wrongly tapped). Refuse — it routes through
  // activateAbility, which pays the full cost.
  if (!manaAbilityCostIsTrivial(manaAb)) return;
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
  const castable = findCastableSpell(who, cardIid);
  if (!castable) {
    console.warn('doCastSpell: card not castable', cardIid);
    return;
  }
  const card = castable.card;
  payMana(who, effectiveCastCostWithPermission(card, castable.permission));
  G[castable.zoneOwner][castable.zone].splice(castable.index, 1);
  if (castable.permission) {
    G.castPermissions = (G.castPermissions || []).filter(perm =>
      !(perm.controller === who && perm.cardIid === card.iid && perm.from_zone === castable.zone));
  }
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
  // A3-6: casting moves the card to the stack — from its actual source zone
  // ('hand' normally; 'graveyard'/'exile' under a cast permission). Emitted
  // AFTER pushOnStack so the card is genuinely on the stack (and after the
  // spell_cast emit, which keeps the existing trigger order untouched).
  emitZoneChange(card, who, castable.zone, 'stack');
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
  // Pay costs. Anything that could make the activation ILLEGAL — slot filters,
  // distinct_targets, the Stapler pair check — was already validated in
  // isLegalAction (executeAction gates on it), so per MtG 601.2h the costs
  // paid here are the LAST part of activation: an illegal activation never
  // reaches this line, and nothing needs refunding.
  if (ab.cost.tap) card.tapped = true;
  if (ab.cost.mana) payMana(who, resolvedManaCost(ab.cost.mana, card, who));
  // Sac cost is paid BEFORE the effect resolves. The sacrificed creature
  // dies (firing dies-triggers) before the ability does anything. This
  // matters for self-sac on creatures with dies-triggers — Carrion Feeder
  // sacing itself would resolve the +1/+1 onto a creature that no longer
  // exists, but we just no-op gracefully (scope:'self' resolves null).
  if (ab.cost && ab.cost.sacrifice && sacIid != null) {
    const sacF = findCard(sacIid);
    if (sacF) sacrificeCard(sacF.card, sacF.controller);
  }
  // Counter-removal cost (e.g. "Remove three verse counters"). Decrement the
  // named counters on the source; legality already guaranteed sufficiency.
  if (ab.cost && ab.cost.remove_counters) {
    if (!card.counters) card.counters = {};
    for (const name in ab.cost.remove_counters) {
      card.counters[name] = (card.counters[name] || 0) - ab.cost.remove_counters[name];
    }
  }
  // Costs are paid; route by stackability (A3-2 stackable infrastructure).
  // Mana abilities NEVER stack — hardcoded fast path (canon §705), they
  // resolve inline below regardless of any `stackable` field.
  const isMana = ab.effects[0].kind === 'add_mana';
  const entry = {
    kind: 'ability', ab,
    sourceIid: card.iid, sourceName: card.name,
    // The source card object, captured at activation. Resolution reads it as
    // last-known information (§3.6 spirit): the source may leave play between
    // activation and resolution (it may even have paid itself as the
    // sacrifice cost just above) and the ability still resolves.
    sourceCard: card,
    controller: who,
    targets: Array.isArray(targets) ? targets : [],
  };
  if (!isMana && isStackable(ab)) {
    // Stackable path (the default — `stackable` absent → true): the ability
    // takes a real kind:'ability' stack entry, exactly like a trigger.
    // Costs were paid and targets locked above; effects run at resolution
    // (resolveAbilityEntry) with §1006.1/§704.1 target re-validation.
    G.stack.push(entry);
    log(`${G[who].name} activates ${card.name}${targets && targets[0] ? ' on ' + targets[0].label : ''}.`, who === 'you' ? 'sp' : 'ai');
    // §603 handoff, same as a spell cast (pushOnStack) or a trigger push:
    // reset the response round and hand priority to the activator's
    // opponent. Non-mana activation is gated on isInstantWindow /
    // isMainPhaseWindow (both require an open round), so G.priority is
    // reliable here — same contract pushOnStack relies on.
    G.priority.passes.clear();
    G.priorityHolder = opp(who);
    // Triggers fired by COST payment (a sacrifice's dies-trigger) drain on
    // top of the ability entry — LIFO: they resolve before the ability,
    // matching where they'd land in MtG.
    drainTriggers();
    return;
  }
  // Inline arm: mana abilities (always), PLUS the stackable:false arm for
  // non-mana abilities — provisional semantics per plan-stackable.md §6 Q1
  // (drain-time-immediate recommended); subject to Joe's design pass;
  // DORMANT — nothing is unstackable yet (every shipped ability defaults
  // stackable). This is byte-for-byte today's pre-A3-2 inline resolution.
  runAbilityEffects(entry);
  if (!isMana) {
    log(`${G[who].name} activates ${card.name}${targets && targets[0] ? ' on ' + targets[0].label : ''}.`, who === 'you' ? 'sp' : 'ai');
    // A1-1 leg 2 (Joe-approved fix, PR #98): a non-mana ability just mutated
    // the board — wipe the pass tracker so a pre-activation pass no longer
    // counts toward closing the round (§603's both-pass close means "both
    // passed in succession since the last action"; spells and trigger pushes
    // both already reset it). Pre-fix this was the only board-mutating
    // action without a reset: the opponent's stale pass let the activation
    // plus the activator's own (auto-)pass close the phase — or resolve
    // combat damage — with no response window on the new board. The
    // activator keeps priority (nothing went on the stack). Mana abilities
    // stay exempt, matching the tapLandForMana path.
    if (G.priority) G.priority.passes.clear();
  }
  // Drain any triggers that fired during cost payment or effect resolution.
  // The inline arms bypass the stack, so without this drain, triggers from
  // the cost (e.g., Old Guardian's dies-trigger when sacrificed to Carrion
  // Feeder) would sit in pendingTriggers and only land on the stack after a
  // manual priority pass. Spells and stackable abilities handle this at
  // their push sites.
  drainTriggers();
}

// Run an ability's effects against its locked targets. Shared by the inline
// arm of doActivateAbility (mana abilities + the dormant stackable:false
// path) and kind:'ability' stack-entry resolution (resolveAbilityEntry).
// `item` is the entry shape doActivateAbility builds: {ab, sourceIid,
// sourceName, sourceCard, controller, targets}.
function runAbilityEffects(item) {
  const ab = item.ab;
  const who = item.controller;
  const targets = Array.isArray(item.targets) ? item.targets : [];
  // sourceCard is the activation-time object (last-known information) — see
  // the entry-construction comment in doActivateAbility.
  const ctx = { controller: who, sourceName: item.sourceName, sourceIid: item.sourceIid,
                sourceCard: item.sourceCard || null, allTargets: targets };
  // Multi-target dispatch (mirrors resolveTopOfStack/resolveTrigger). By
  // default, targeted effects share targets[0]. Effects can opt into a
  // distinct slot via `target_slot: N`. allTargets is also threaded onto
  // ctx so multi-target effects like apply_in_game_splice (Stapler) can read
  // both inputs directly without relying on inter-effect coordination.
  const getAbilityTargetForSlot = makeSlotTargetGetter(targets);
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
      // Human chooser → pause with the edict prompt (audit A4-7; shared
      // gate). Latent today (no pool ability uses chooses) but the third
      // resolution loop gets the same contract preemptively.
      if (maybeDeferHumanChooses(ctx, e, ab.effects, abCurTgt)) break;
      applyEffect(ctx, e, abCurTgt, abCurSnap);
      if (ctx.chosen) { abCurTgt = ctx.chosen; abCurSnap = snapshotTarget(ctx.chosen); }
      continue;
    }
    if (e.scope === 'self') {
      // Self → source creature OR source's controller (audit A4-13: this
      // loop was the divergent third hand-synced copy of the v0.99.29 fork
      // — it routed EVERY self to the creature, so a "T: deal 1 to you"
      // ability damaged the creature instead of the player. The live
      // self-abilities all survive: pump/add_type are creature-routed by
      // CREATURE_EFFECT_KINDS; gain_life/move_card route to the controller,
      // which their handlers' ctx.controller fallbacks already produced).
      const self = resolveSelfTarget(e, item.sourceIid, item.sourceName, who);
      tgt = self.tgt;
      snap = self.snap;
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
}

// kind:'ability' stack-entry resolution (A3-2 stackable infrastructure) —
// the §1006.1/§704.1 framework applied to activated abilities: targets were
// legal at activation; re-judge NOW that responses have had their window.
// Illegal slots are dropped by the per-slot resolvers; if EVERY targeted
// slot is illegal the ability fizzles whole — rider effects included — with
// a log. Costs stay paid (they were the last part of activation, §601.2h).
function resolveAbilityEntry(item) {
  if (!tsRevalidateTargets(item.ab, item.controller, item.targets)) {
    log(`${item.sourceName}'s ability fizzles — no legal target.`, 'sp');
    afterEffectsApplied();
    return;
  }
  // Stapler pair validity was an ACTIVATION check (isLegalAction) — now that
  // a response window exists between activation and resolution, the pair can
  // decay (half of it removed in response). Re-judge it here; an invalid
  // pair fizzles the ability like a dead target.
  if ((item.ab.effects || []).some(e => e.kind === 'apply_in_game_splice')) {
    const pair = resolveSplicePair(item.targets);
    if (pair.reason) {
      log(`${item.sourceName}'s ability fizzles — ${pair.reason}.`, 'sp');
      afterEffectsApplied();
      return;
    }
  }
  runAbilityEffects(item);
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
    // attacker/defender are DEAD legacy payload fields — the condId vocabulary
    // is fully retired (DIVERGENCE E2) and grep finds zero consumers of either.
    // Composable triggers read subject_card/defender_key. Removing the dead
    // pair was suite-green but is a payload change — staged, not shipped here.
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
  // A3-6: announce the discard. Attribute it to the card that forced it
  // (threaded onto forcedDiscard by discardFromHand) when one is in scope.
  const discardSourceIid = (G.forcedDiscard && G.forcedDiscard.who === who)
    ? G.forcedDiscard.sourceIid : undefined;
  emitZoneChange(card, who, 'hand', 'graveyard', undefined, discardSourceIid);
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
  if (!matchesSearchFilter(lib[idx], G.pendingSearch.filter)) return;
  const card = lib.splice(idx, 1)[0];
  G[who].hand.push(card);
  shuffle(lib);
  log(`${G[who].name} fetches ${card.name}.`, 'sp');
  // A3-6: a tutor is a library→hand move; attribute it to the searching card.
  emitZoneChange(card, who, 'library', 'hand', undefined, G.pendingSearch.sourceIid);
  G.pendingSearch = null;
  // Tutored cards trigger build_on_draw the same as any other hand-entry.
  // The Codex doesn't currently appear in any tutor's filter, but if a
  // future "tutor any card" effect lands, this is where it'd matter.
  tryBuildOnDraw(card, who);
}
function doTriggerTargetPick(who, target) {
  // Player submits a target for the CURRENT slot of the pending trigger prompt.
  // Record it, then advance: if more slots need a choice, stay paused for the
  // next; once every slot is assigned, push the trigger and resume draining.
  if (!G.pendingTriggerTarget || G.pendingTriggerTarget.controller !== who) return;
  const pt = G.pendingTriggerTarget;
  // Sanity-validate the target is in the current slot's valid list.
  if (!pt.valid.some(v => sameTarget(v, target))) return;
  pt.pickedSlots[pt.currentSlot] = target;
  const r = advanceTriggerTargetPrompt(pt);
  if (r === 'prompt') return;   // more slots to choose — stay paused; UI re-renders
  G.pendingTriggerTarget = null;
  if (r === 'done') finalizeTriggerTarget(pt);
  // r === 'fizzle' → a later slot lost its only legal target; drop the trigger.
  // A3-12: say so — the sibling fizzle paths (pushTriggerOnStack's auto-pick,
  // resolveTrigger's dead-target arm) both log; this one silently evaporated
  // a trigger the player was mid-prompt on.
  if (r === 'fizzle') log(`${pt.sourceName} trigger fizzles — no legal target.`, 'sp');
  drainTriggers();   // resume the remaining queued triggers
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
      // cloneTriggerData (audit A3-13): slot and live card each get their
      // own condition array — exact copies now, free to diverge.
      slot.bonusTrigger = cloneTriggerData(trigger);
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
    liveCard.triggers.push(cloneTriggerData(trigger));
  }
  // ~ → card name (audit A10-3). If the live card wasn't found, '~' → '~'
  // is an identity substitution — better an honest placeholder than ''.
  log(`📜 Built ability: ${formatTriggerText(triggerLogText(trigger), liveCard ? liveCard.name : '~')}`, 'sp');
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
  return anyoneOwesDecision();
}
function isForcedActionResponse(action) {
  if (!action) return false;
  if (G.forcedDiscard && G.forcedDiscard.remaining > 0) return action.type === 'discard';
  if (G.pendingSearch) return action.type === 'searchPick';
  if (G.pendingTriggerTarget) return action.type === 'triggerTargetPick';
  if (G.pendingTriggerBuild) return action.type === 'triggerBuildPick';
  if (G.pendingNumberChoice) return action.type === 'numberChoice';
  if (G.pendingSymmetricizeChoice) return action.type === 'symmetricizeChoice';
  if (G.pendingEdictChoice) return action.type === 'edictChoice';
  if (G.pendingOptionalCost) return action.type === 'optionalCost';
  return false;
}
function whoHasPriority(who) {
  if (G.gameOver) return false;
  if (isWaitingForForcedAction()) return false;
  if (isPriorityOpen()) return G.priorityHolder === who;
  // A1-10: the cleanup discard does NOT grant priority. This function's only
  // consumers are the tapLandForMana legality checks and the tap enumeration
  // in getLegalActions — and canon §605 closes the cleanup-discard window
  // (nothing is castable, setPhase('UNTAP') zeroes the pool, and the land
  // would stay tapped through the opponent's whole turn). The discard itself
  // doesn't route through here: its legality (isLegalAction 'discard'),
  // enumeration (getLegalActions), and expectedActor all carry their own
  // cleanupDiscarding clauses.
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
function isMainPhaseWindow(who) {
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
  if (isWaitingForForcedAction() && !isForcedActionResponse(action)) return false;
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
        // A7-1: the tap lane only legalizes TRIVIAL-cost mana abilities; an
        // extra-cost one must go through activateAbility (which pays full cost).
        if (!isAutoUsableManaAbility(manaAb)) return false;
      } else {
        // Backwards-compat: caller didn't specify, find the first trivial mana ability.
        manaAb = f.card.abilities.find(ab => isAutoUsableManaAbility(ab));
        if (!manaAb) return false;
      }
      if (f.card.sick) return false;
      return whoHasPriority(who) || isInstantWindow(who);
    }
    case 'castSpell': {
      const castable = findCastableSpell(who, action.cardIid);
      const card = castable && castable.card;
      if (!card || hasType(card, 'Land')) return false;
      if (!canPayPotential(who, effectiveCastCostWithPermission(card, castable.permission))) return false;
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
        if (!isMainPhaseWindow(who)) return false;
      }
      // Validate the chosen targets through TargetSelection: every declared slot
      // must hold a legal target and any cross-slot rule (distinct) must hold. The
      // top-level target() step is the cast-time hexproof checkpoint — folded in
      // (tsLegalBySlot resolves it to slot 0). Untargeted spells pass trivially.
      const modes = getModes(card);
      const modeIdx = action.modeIdx || 0;
      if (modeIdx < 0 || modeIdx >= modes.length) return false;
      if (!tsIsLegalSet(tsModeObj(card, modes[modeIdx]), who, action.targets)) return false;
      return true;
    }
    case 'activateAbility': {
      const f = findCard(action.cardIid);
      if (!f || f.controller !== who) return false;
      const ab = (f.card.abilities || [])[action.abilityIdx];
      if (!ab) return false;
      if (ab.cost && ab.cost.tap) {
        if (f.card.tapped) return false;
        if (f.card.sick && !(f.card.keywords && f.card.keywords.includes('haste')) && hasType(f.card, 'Creature')) return false;
      }
      if (ab.cost && ab.cost.mana) {
        // Exclude the source from the payable mana when {T} is also a cost — it
        // can't tap for both the cost and the mana.
        if (!canPayPotential(who, resolvedManaCost(ab.cost.mana, f.card, who), ab.cost.tap ? f.card.iid : null)) return false;
      }
      // Sac cost: action must include sacIid pointing to one of the controller's
      // own permanents. `sacrifice:'self'` sacrifices the ability's own source
      // (Deepseam Quarry sacs itself — a Land, not a creature), so it skips the
      // creature gate and the source is the only legal sacIid.
      if (ab.cost && ab.cost.sacrifice) {
        if (action.sacIid == null) return false;
        const sacF = findCard(action.sacIid);
        if (!sacF || sacF.controller !== who) return false;
        if (ab.cost.sacrifice === 'self') {
          if (action.sacIid !== f.card.iid) return false;
        } else if (!hasType(sacF.card, 'Creature')) {
          return false;
        }
      }
      // Counter-removal cost: the source must carry enough of each named counter.
      if (ab.cost && ab.cost.remove_counters) {
        for (const name in ab.cost.remove_counters) {
          if (((f.card.counters && f.card.counters[name]) || 0) < ab.cost.remove_counters[name]) return false;
        }
      }
      const isMana = ab.effects[0].kind === 'add_mana';
      if (isMana) {
        // Mana abilities are always available when source can be tapped, regardless of priority.
        // (Matches MtG: mana abilities don't require priority and don't use the stack.)
        // A7-1 note: this priority-free status is correct even for an extra-cost
        // mana ability (e.g. "Sacrifice a creature: add B" — still a mana ability
        // per the engine's model). The A7-1 guard lives in the AUTO paths only
        // (solver/tap lane), so the autotapper never silently pays the extra
        // cost; a MANUAL activateAbility still pays the full cost explicitly.
        return true;
      }
      // Non-mana ability: timing depends on main_phase_only flag.
      if (ab.main_phase_only) {
        if (!isMainPhaseWindow(who)) return false;
      } else {
        if (!isInstantWindow(who)) return false;
      }
      // Validate the chosen targets through TargetSelection (the same component
      // the cast path uses): ability-level target_slots (Stapler), per-effect
      // targets, and the top-level target() hexproof checkpoint all resolve
      // through one path. Untargeted abilities pass trivially.
      if (!tsIsLegalSet(ab, who, action.targets)) return false;
      // Cross-target pair validity (Stapler) is an ACTIVATION check, so it
      // runs here — before executeAction dispatches and any cost is paid
      // (MtG 601.2h via 602.2b: costs are the last part of activation; an
      // illegal activation rewinds with nothing spent). Per-slot filters
      // can't see the PAIR, so this is the one place that can.
      if (ab.effects.some(e => e.kind === 'apply_in_game_splice')
          && resolveSplicePair(action.targets).reason) {
        return false;
      }
      return true;
    }
    case 'declareAttackers': {
      if (G.phase !== 'COMBAT_ATTACK' || who !== G.activePlayer) return false;
      if (G.attackersDeclared) return false;
      // A2-4: mirror declareBlockers' usedBlockers guard — one attack role
      // per creature (§801 step 505: set membership). A repeated iid would
      // otherwise deal N× combat damage and emit N× 'attacks' triggers
      // downstream (doDeclareAttackers stores the list verbatim). Reject,
      // don't dedupe, matching the sibling's semantics.
      const usedAttackers = new Set();
      for (const iid of action.cardIids) {
        if (usedAttackers.has(iid)) return false;
        usedAttackers.add(iid);
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
      return matchesSearchFilter(card, G.pendingSearch.filter);
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
      if (isWaitingForForcedAction()) return false;
      return who === G.activePlayer && G.stack.length === 0 && !G.cleanupDiscarding;
    default: return false;
  }
}

// =========================================================================
// Legal action enumeration
// =========================================================================
function getLegalActions(who) {
  const actions = [];
  const waitingForForcedAction = isWaitingForForcedAction();

  // Land plays
  if (!waitingForForcedAction
      && who === G.activePlayer && (G.phase === 'MAIN1' || G.phase === 'MAIN2')
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
        // A7-1: only TRIVIAL-cost mana abilities ({T}/mana) belong in the tap
        // lane; an extra-cost (or tapless extra-cost) add_mana ability is
        // excluded (the tap lane pays only the tap, skipping its real cost).
        const manaAbIdx = card.abilities.findIndex(ab => isAutoUsableManaAbility(ab));
        if (manaAbIdx >= 0) {
          actions.push({type:'tapLandForMana', cardIid: card.iid, abilityIdx: manaAbIdx});
        }
      }
    }
  }

  // Spells (one entry per (card, target) combination)
  for (const castable of castableSpellEntries(who)) {
    const card = castable.card;
    if (hasType(card, 'Land')) continue;
    if (!canPayPotential(who, effectiveCastCostWithPermission(card, castable.permission))) continue;
    // Timing: flash spells (incl. retired-Instant cards) and flash creatures
    // use the instant window. Other permanents/sorceries need sorcery window.
    const hasFlash = card.keywords && card.keywords.includes('flash');
    if (hasFlash) {
      if (!isInstantWindow(who)) continue;
    } else {
      if (!isMainPhaseWindow(who)) continue;
    }
    // One castSpell action per (mode, legal target set). TargetSelection
    // enumerates the per-slot cross-product (distinct-aware, capped); an
    // untargeted mode emits a single targetless action. Non-modal cards are the
    // single-mode case; a modal card branches per mode (each mode's targets live
    // on its effects, so build a per-mode view).
    const modes = getModes(card);
    for (let mIdx = 0; mIdx < modes.length; mIdx++) {
      const modeObj = tsModeObj(card, modes[mIdx]);
      if (!objectNeedsTarget(modeObj)) {
        const a = { type: 'castSpell', cardIid: card.iid };
        if (modes.length > 1) a.modeIdx = mIdx;
        actions.push(a);
        continue;
      }
      for (const targets of tsEnumerate(modeObj, who)) {
        const a = { type: 'castSpell', cardIid: card.iid, targets };
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
      // Tap cost requirements.
      if (ab.cost && ab.cost.tap) {
        if (card.tapped) continue;
        if (card.sick && !card.keywords.includes('haste') && hasType(card, 'Creature')) continue;
      }
      // Mana cost requirements. Exclude the source when {T} is also a cost (it
      // can't tap for both the cost and the mana).
      if (ab.cost && ab.cost.mana && !canPayPotential(who, resolvedManaCost(ab.cost.mana, card, who), ab.cost.tap ? card.iid : null)) continue;
      // Sacrifice cost: enumerate one entry per legal sac target. 'creature'
      // means any of your own creatures. Note: in MtG you CAN sacrifice the
      // source itself if it's a creature and the cost says "sacrifice a
      // creature." Carrion Feeder sacing itself is wasted but legal.
      let sacOptions = null;  // null = no sac cost; [] = required but none available; [a,b,...] = choices
      if (ab.cost && ab.cost.sacrifice) {
        if (ab.cost.sacrifice === 'self') {
          sacOptions = [card.iid];  // the ability's own source is the sacrifice
        } else {
          sacOptions = G[who].battlefield
            .filter(c => hasType(c, 'Creature'))
            .map(c => c.iid);
          if (sacOptions.length === 0) continue;  // can't pay sac cost
        }
      }
      // Counter-removal cost: skip if the source lacks enough of any named counter.
      if (ab.cost && ab.cost.remove_counters) {
        let canPay = true;
        for (const name in ab.cost.remove_counters) {
          if (((card.counters && card.counters[name]) || 0) < ab.cost.remove_counters[name]) { canPay = false; break; }
        }
        if (!canPay) continue;
      }
      if (ab.main_phase_only ? !isMainPhaseWindow(who) : !isInstantWindow(who)) continue;
      // Cross-product: (legal target sets) × (sac options). TargetSelection
      // enumerates the target sets — single-target abilities yield one-element
      // sets; multi-slot abilities (Stapler) yield the per-slot cross-product
      // (previously skipped for the AI). Untargeted → [null]; a targeted ability
      // with no legal set → no actions (not activatable).
      const targetSets = objectNeedsTarget(ab) ? tsEnumerate(ab, who) : [null];
      const sacChoices = sacOptions || [null];
      for (const targets of targetSets) {
        for (const sacIid of sacChoices) {
          const action = {type:'activateAbility', cardIid: card.iid, abilityIdx: i};
          if (targets) action.targets = targets;
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
    for (const card of G[who].library) {
      if (!matchesSearchFilter(card, G.pendingSearch.filter)) continue;
      actions.push({type:'searchPick', cardIid: card.iid});
    }
  }

  // Trigger-target picks — one action per valid target in the prompt.
  // Production human UI clicks directly through the controller, but sim/selfplay
  // uses this list to avoid stalling on a forced trigger-target prompt.
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who
      && Array.isArray(G.pendingTriggerTarget.valid)) {
    for (const target of G.pendingTriggerTarget.valid) {
      actions.push({type:'triggerTargetPick', target});
    }
  }

  // Trigger-build picks — Architect's Codex build moments are human-facing in
  // production, but AI-vs-AI/selfplay can drive the human seat. Enumerate each
  // current-step choice so AI.decide can answer the forced prompt.
  if (G.pendingTriggerBuild && G.pendingTriggerBuild.who === who) {
    const p = G.pendingTriggerBuild;
    if (p.step === 'condition' && Array.isArray(p.conditionOptions)) {
      for (let i = 0; i < p.conditionOptions.length; i++) {
        actions.push({type:'triggerBuildPick', choice: i});
      }
    } else if (p.step === 'effect' && Array.isArray(p.effectOptions)) {
      for (let i = 0; i < p.effectOptions.length; i++) {
        actions.push({type:'triggerBuildPick', choice: i});
      }
    } else if (p.step === 'compare') {
      actions.push({type:'triggerBuildPick', choice: 'new'});
      actions.push({type:'triggerBuildPick', choice: 'keep'});
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

  // Pass / End Turn are priority actions, not answers to forced prompts.
  if (!waitingForForcedAction) actions.push({type:'pass'});

  // End turn
  if (!waitingForForcedAction
      && who === G.activePlayer && G.stack.length === 0 && !G.cleanupDiscarding) {
    actions.push({type:'endTurn'});
  }

  return waitingForForcedAction
    ? actions.filter(a => isLegalAction(who, a))
    : actions;
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
    if (isPriorityOpen() && G.pendingTriggers.length > 0) {
      drainTriggers();
      continue;
    }
    // Auto-pass dead priority rounds. skipApEndStep suppresses the active
    // player's empty-stack END window ENTIRELY — including instant-speed
    // options, not just sorcery-speed ones (END never allowed sorcery speed;
    // see isMainPhaseWindow). The trade: anything the AP could cast at their
    // own empty-stack END was equally available in MAIN2, and the AP regains
    // a window whenever the stack is non-empty. The non-active player still
    // gets their END window (load-bearing for flash responses). Deliberate —
    // see DIVERGENCE.md B6 and rules §606's sanctioned-skip list.
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
          // A1-9: drawCard returns null on both empty-library paths (deck-out
          // loss and Phylactery slot-rip) — only log "draws." when a card
          // actually moved to hand, so the log never claims a phantom draw.
          const drawn = drawCard(ap);
          if (drawn) log(`${G[ap].name} draws.`);
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
        //
        // NAMING CAVEAT: fireAt:'endStep' is a misnomer — this drain runs
        // during CLEANUP, not the §509 END step. END is a real priority
        // phase the engine already has; CLEANUP has NO priority window, so
        // nothing fired here can be responded to. That timing is correct
        // for the sole current consumer ("until end of turn" durations end
        // in cleanup), but this queue is NOT the home for a genuine
        // "at the beginning of the end step" trigger — wiring one to this
        // field would fire it silently in the wrong, unrespondable window.
        // Same caveat at the producer (schedule_delayed) and on the
        // `when:'end_step'` wire name in docs/PROTOCOL.md.
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
        if (Array.isArray(G.castPermissions)) {
          G.castPermissions = G.castPermissions.filter(p => p.duration !== 'eot');
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
  const pendingActor = pendingDecisionActor();
  if (pendingActor) return pendingActor;
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
  // Any explicit action other than pass/endTurn disarms the auto-pass-to-end-
  // of-turn shortcut — INCLUDING forced responses (cleanup discard, trigger-
  // target picks): if you're compelled to make a choice mid-fast-forward, the
  // turn intentionally pauses and waits for a fresh End Turn rather than
  // resuming on its own (design ruling, PR #98, 2026-06-10 — audit A1-11).
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
  // Resolve a castable card by iid — hand first, then a public zone the
  // controller has cast permission for (Seal-Thief Courier). Single source of
  // truth for the human cast UI's zone-agnostic card lookup.
  findCastableSpell,
  // Enumerate everything `who` may cast right now: hand + cast-permission
  // zones. renderHand uses the non-hand entries to show stolen/exiled cards
  // inline at the end of the hand row.
  castableSpellEntries,
  makeCard,
  // Re-derive seam (template + stickers + subtype-implied), exposed for tests.
  intrinsicKeywords,
  // Subtype-implied keyword injection (Wall→defender, Dragon→flying, …). Exposed so
  // the sticker-eligibility view and tests mirror makeCard's derivation.
  applySubtypeKeywords,
  // The one cross-slot distinct_targets rule, exposed so the render layer's cast
  // highlight drops already-picked creatures through the SAME filter the trigger
  // pick-loop uses (no second copy of the rule in the UI).
  tsExcludePicked,
  synthesizeStapledTemplate,
  makeToken,
  getModes,
  isModal,
  effectsForMode,
  cardHasEffect,
  pickBestTriggerTarget,
  matchFilter,
  matchesSearchFilter,
  // Effects seam exposed for tests (Slice 3).
  applyEffect, creaturesInScope, sevToNum, numToSev,
  // Static-lord keyword-grant seam + its leave-play cleanup, exposed for tests.
  applyStaticKeywordGrants, clearRestrictionsFromSource,
  targetsForFilter, TARGET_FILTERS, validateAllCardEffects,
  // Audit A3-5 — boot validation for the generated-trigger data tables.
  validateGeneratedTriggerTables,
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
