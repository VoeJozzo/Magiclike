// STICKERS — runtime application + deck-construction helpers (extracted from engine.js).
// Late-binds ENGINE.synthesizeStapledTemplate and tplForSlot (both resolve at call time).

// Display metadata: which type tags on this card came from stickers. The
// types[] array itself can't distinguish base from sticker-added (addType
// writes both), so the apply paths below keep this parallel record and the
// render layer (typeLineHtml) paints these tags gold. Rebuilt on every
// makeCard / stickersForSlot pass — never persisted.
function recordStickerType(card, tag) {
  if (!card || !tag) return;
  if (!Array.isArray(card.stickerTypes)) card.stickerTypes = [];
  if (!card.stickerTypes.includes(tag)) card.stickerTypes.push(tag);
}

// A sticker entry on a slot/card is either a registry id (string) or an inline
// parameterized descriptor {kind, ...params} (§3.8) — the latter is produced by
// the apply_sticker effect for the Balancer family (cost_mod / set_color /
// stat_boost snapshots), which carry per-application values no fixed registry
// entry can hold. Normalize either form to a descriptor with a `.kind`.
function resolveSticker(entry) {
  if (typeof entry === 'string') return STICKERS[entry] || null;
  if (entry && typeof entry === 'object' && entry.kind) return entry;
  return null;
}
// A6-3: inline set-semantics descriptors (set_color / set_types) are idempotent
// in EFFECT — a second identical application changes nothing — yet the apply
// paths appended a duplicate entry on every application, growing the stored
// list without bound (e.g. Bleaching the same run slot across N games stacks N
// identical {kind:'set_color',color:'C'} descriptors). Detect an equivalent
// inline descriptor already present so the push can be skipped (the idempotent
// effect is still re-applied). Scoped to set-semantics ONLY: cost_mod is
// deliberately stackable (embargo taxes accumulate by design).
function inlineSetSemanticsDup(list, desc) {
  if (!desc || (desc.kind !== 'set_color' && desc.kind !== 'set_types')) return false;
  return (list || []).some(e => e && typeof e === 'object' && e.kind === desc.kind
    && (desc.kind === 'set_color'
        ? e.color === desc.color
        : JSON.stringify(e.types || [e.type]) === JSON.stringify(desc.types || [desc.type])));
}
// A6-6: deep-clone a granted ability/trigger before stamping it onto a card.
// resolveSticker returns the shared STICKERS[id] singleton for registry
// stickers, so a one-level copy would alias a nested array/object (an effect's
// types[], a cost's mana sub-object) across every card built from one entry —
// the shared-ref class the stickersForSlot deep-copy discipline guards against.
// Latent today (only inline descriptors use these kinds), cheap to do now.
function deepCloneStickerShape(o) {
  return (typeof structuredClone === 'function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}
// Apply one sticker's kind-effect to a card (no push/dedup — callers handle that).
// Shared by the batch (applyStickersToCard) and incremental
// (applyOneStickerToRuntimeCard) paths for the non-roll kinds.
function applyStickerKindEffect(card, s) {
  if (s.kind === 'stat_boost') {
    if (!Array.isArray(card.modifiers)) card.modifiers = [];
    card.modifiers.push({ power: s.power || 0, toughness: s.toughness || 0 });
  } else if (s.kind === 'keyword') {
    if (!Array.isArray(card.keywords)) card.keywords = [];
    if (!card.keywords.includes(s.keyword)) card.keywords.push(s.keyword);
  } else if (s.kind === 'remove_keyword') {
    // Inverse of 'keyword': strip a keyword the card has natively (today only
    // 'defender' — the lone pure-downside keyword worth removing). Everything
    // downstream reads card.keywords, so dropping it here is sufficient (e.g.
    // canCreatureAttack stops gating, the badge stops showing it).
    if (Array.isArray(card.keywords)) {
      card.keywords = card.keywords.filter(k => k !== s.keyword);
    }
  } else if (s.kind === 'grant_mana_ability') {
    grantManaAbility(card, s.color);
  } else if (s.kind === 'cost_mod') {
    // Signed additive cost change (§3.8): +N for embargo, −1 for the reduction
    // reward (unified from costReduction). Generic floored at 0.
    // A6-7: stickers apply in card.stickers (= acquisition) order, so a cost_mod
    // floor vs a later set_color('C') pip-fold can yield a different generic cost
    // by order. That acquisition-order is canonical (canon is silent; the both-
    // -sticker case is rare). test_a6_7_cost_order.js pins it.
    if (card.cost) card.cost.C = Math.max(0, (card.cost.C || 0) + (s.amount || 0));
    // A Land+Spell staple's REAL cost is the ETB trigger's optional_cost (the
    // land's own cast cost is free/vestigial), so a cost sticker must adjust it
    // too — otherwise "−1 cost" on the spell left the "you may pay" cost unchanged.
    for (const t of (card.triggers || [])) {
      if (t.optional_cost) t.optional_cost.C = Math.max(0, (t.optional_cost.C || 0) + (s.amount || 0));
    }
  } else if (s.kind === 'set_color') {
    card.color = s.color;
    // Colorless (Bleach) also bleaches the COST: colored pips fold into generic
    // {C}, so the card becomes castable off any mana.
    if (s.color === 'C' && card.cost) {
      let colored = 0;
      for (const k of ['W', 'U', 'B', 'R', 'G']) { colored += card.cost[k] || 0; card.cost[k] = 0; }
      if (colored) card.cost.C = (card.cost.C || 0) + colored;
    }
  } else if (s.kind === 'add_type') {
    // Add one type tag (land-color stickers add a basic-land subtype). For land
    // subtypes the §305.6 autogrant then yields the matching mana ability.
    recordStickerType(card, s.type);
    addType(card, s.type);
    grantBasicLandMana(card);
  } else if (s.kind === 'set_types') {
    card.types = (Array.isArray(s.types) ? s.types : [s.type]).filter(Boolean);
  } else if (s.kind === 'grant_activated_ability') {
    if (!s.ability) return;
    if (!Array.isArray(card.abilities)) card.abilities = [];
    if (s.ability_id && card.abilities.some(ab => ab && ab._sticker_ability_id === s.ability_id)) return;
    // A6-6: deep-copy the whole granted ability (was a one-level cost/effects copy).
    const granted = deepCloneStickerShape(s.ability);
    granted._sticker_ability_id = s.ability_id || null;
    card.abilities.push(granted);
  } else if (s.kind === 'trigger') {
    if (!Array.isArray(card.triggers)) card.triggers = [];
    // _from_sticker lets the card-text layer color this granted line distinctly
    // (it's reset every makeCard, so it's display metadata, not persisted state).
    // A6-6: deep-copy (same latent shared-ref shape as the ability arm above).
    const granted = s.trigger ? deepCloneStickerShape(s.trigger) : {};
    granted._from_sticker = true;
    card.triggers.push(granted);
  }
}

function pickWeightedSticker(stickers) {
  let total = 0;
  for (const s of stickers) total += (s.weight || 3);
  if (total <= 0) return stickers[Math.floor(Math.random() * stickers.length)];
  let roll = Math.random() * total;
  for (const s of stickers) {
    roll -= (s.weight || 3);
    if (roll < 0) return s;
  }
  return stickers[stickers.length - 1];
}

// Apply run-persistent stickers to a card. Called from makeCard and stickersForSlot.
// Empower/subtype rolls consumed in order (Nth occurrence uses Nth roll);
// missing rolls (legacy saves) fall back to a fresh uniform roll.
function applyStickersToCard(card) {
  let empowerCursor = 0;
  let subtypeCursor = 0;
  for (const sId of card.stickers) {
    const s = resolveSticker(sId);
    if (!s) continue;
    if (s.kind === 'empower') {
      const rolls = Array.isArray(card.empowerRolls) ? card.empowerRolls : (card.empowerRolls = []);
      let roll = rolls[empowerCursor];
      // A6-2: distinguish a stored BLANK (null — "rolled, nothing to empower")
      // from NEVER-rolled (undefined — a legacy save). Only undefined falls back
      // to a fresh roll; a stored null is respected and stays null. The old code
      // re-rolled on either (truthy test), so a slot whose base had nothing to
      // empower would, once a staple added empowerable fields, get a FRESH random
      // target on every makeCard — non-deterministic across saves/staples. Joe:
      // "the empower stays pointing at the same number when stapled."
      if (roll === undefined) {
        // Stapled fallback: use merged tpl so roll can land on staple half's effects.
        const tpl = card.stapledFrom
          ? ENGINE.synthesizeStapledTemplate(card.stapledFrom.baseTplId,
                                              card.stapledFrom.stapledTpls)
          : CARDS[card.tplId];
        roll = (tpl ? rollEmpowerTarget(tpl) : null) || null;
        // Record the result on this card so a stored null reads as "blank" rather
        // than "never rolled". NOTE: card.empowerRolls is a .slice() copy of the
        // slot (makeCard), so this stabilizes only THIS in-memory card — the
        // DURABLE per-slot persistence for the legacy/undefined case is the
        // slot-side backfill in run.js (loaded player slots arrive pre-filled,
        // null included, so this branch is reached only for transient/opp cards).
        rolls[empowerCursor] = roll;
      }
      empowerCursor++;
      if (roll) applyEmpowerRoll(card, roll, s.amount || 1);
    } else if (s.kind === 'subtype') {
      // Specific subtype stored on card.subtypeRolls (parallel to occurrences). Legacy
      // saves missing a roll skip — rolling needs deck context, deferred to next save.
      const rolled = (card.subtypeRolls || [])[subtypeCursor];
      subtypeCursor++;
      if (!rolled) continue;
      // Append the rolled subtype to types[] via the accessor layer — the sole
      // type identity. Lord buffs that match on it read via hasType/subtypesOf.
      recordStickerType(card, rolled);
      addType(card, rolled);
    } else {
      applyStickerKindEffect(card, s);
    }
  }
}

// Apply a SINGLE sticker to a runtime card incrementally — Archdemon of Bargains
// (registry id) and the apply_sticker effect (inline {kind,...} descriptor).
// Skips empower/subtype (they need rolls); callers don't pass those.
function applyOneStickerToRuntimeCard(card, sticker) {
  if (!card) return;
  const s = resolveSticker(sticker);
  if (!s) return;
  if (!Array.isArray(card.stickers)) card.stickers = [];
  const isInline = typeof sticker === 'object';
  if (!s.stackable && !isInline && card.stickers.includes(sticker)) return;
  // A6-3: don't store a duplicate idempotent set_color/set_types descriptor, but
  // still re-apply the (idempotent) effect so the card reflects it either way.
  if (isInline && inlineSetSemanticsDup(card.stickers, sticker)) { applyStickerKindEffect(card, s); return; }
  card.stickers.push(sticker);
  applyStickerKindEffect(card, s);
}

// One pick's candidate pool for the bargain reward below: every eligible
// sticker paired with the permanents it can currently land on. The pool is
// the BROAD registry set — stat boosts, keyword grants, Innate, the five
// land-color (add_type) stickers, the −1-cost (cost_mod) sticker, and
// lose_defender — excluding only scarified (boss-only, weight 0) and the
// roll-needing subtype/empower. lose_defender IS eligible here: on an
// opponent's wall it hands them an attacker, which is exactly Archdemon's
// intended downside (the "bargain" stickers both sides). Each sticker's own
// appliesTo still constrains placement.
function bargainStickerCandidates(perms) {
  const out = [];
  for (const id of Object.keys(STICKERS)) {
    if (id === 'scarified' || id === 'subtype' || id === 'empower') continue;
    const s = STICKERS[id];
    if (!s) continue;
    // weight 0 = excluded from random pools (boss-only / dedicated paths).
    if (!s.weight) continue;
    const eligible = perms.filter(p => !s.appliesTo || s.appliesTo(p));
    if (eligible.length > 0) out.push({ sticker: s, perms: eligible });
  }
  return out;
}

// Apply N random stickers to permanents controlled by `side` (Archdemon of
// Bargains). Player-side: persists via RUN.applyStickerToSlot AND applies to
// the runtime card. Opp-side: runtime card only (opp slots regenerate each
// game). `state` is G; `logFn` is the engine's internal log.
//
// Selection (A6-1 option C — Joe, PR #98 round 3, 2026-06-10: "Keep the pool
// broad, but make it factor weights in appropriately"): each pick draws the
// STICKER by rarity weight via pickWeightedSticker — the same machinery as
// normal reward offers, so Indestructible/Hexproof/Unblockable/Costs-1-Less
// stay rare here too — then a target permanent uniformly among that sticker's
// eligible permanents. Candidates re-derive between picks, so eligibility
// updates as stickers land (a creature given flying can't be given it again).
function applyRandomStickersToSide(state, side, n, sourceName, logFn) {
  if (n <= 0) return;
  const perms = state[side].battlefield;
  if (perms.length === 0) {
    if (logFn) logFn(`${sourceName} — no permanents to sticker.`, 'sp');
    return;
  }
  let applied = 0;
  for (let i = 0; i < n; i++) {
    const candidates = bargainStickerCandidates(perms);
    if (candidates.length === 0) break;
    const s = pickWeightedSticker(candidates.map(c => c.sticker));
    const entry = candidates.find(c => c.sticker === s);
    const perm = entry.perms[Math.floor(Math.random() * entry.perms.length)];
    applyOneStickerToRuntimeCard(perm, s.id);
    if (side === 'you' && typeof perm.slotIdx === 'number'
        && typeof RUN !== 'undefined' && RUN.applyStickerToSlot) {
      RUN.applyStickerToSlot(perm.slotIdx, s.id);
    }
    if (logFn) logFn(`${perm.name} gains "${s.name}" sticker.`, 'sp');
    applied++;
  }
  if (applied === 0 && logFn) {
    logFn(`${sourceName} — no eligible permanents.`, 'sp');
  }
}

// Player-friendly label for a rolled empower target. The roll stores a
// `field` like 'amount' / 'power' / 'severity', but 'amount' is shared by
// many effect kinds (damage, draw, discard, gain_life, etc.) — so when the
// field is generic, we use the effect's KIND as the label instead. Faithless
// Looting empowering "amount" on draw or discard shows up as "Empower (draw)"
// or "Empower (discard)" rather than the ambiguous "Empower (amount)".
// Falls back to the raw field name if we can't resolve the effect.
function empowerRollLabel(card, roll) {
  if (!roll) return '';
  // Resolve the effect this roll points at on the given card/template.
  let effs = null;
  if (roll.location === 'effects') {
    if (roll.modeIdx == null) {
      effs = Array.isArray(card.effects) ? card.effects : null;
    } else {
      effs = (card.effects && Array.isArray(card.effects.modes))
        ? card.effects.modes[roll.modeIdx] : null;
    }
  } else if (roll.location === 'triggers') {
    effs = (Array.isArray(card.triggers) && card.triggers[roll.subIdx])
      ? card.triggers[roll.subIdx].effects : null;
  } else if (roll.location === 'abilities') {
    effs = (Array.isArray(card.abilities) && card.abilities[roll.subIdx])
      ? card.abilities[roll.subIdx].effects : null;
  }
  const eff = effs && effs[roll.effIdx];
  let fieldLabel;
  if (roll.field === 'amount' && eff && eff.kind) {
    // Disambiguate damage direction so self-recoil reads distinctly from spell payload.
    if (eff.kind === 'damage') {
      const t = eff.target;
      fieldLabel = eff.scope    ? 'damage to all'
                 : t === 'self'   ? 'self damage'
                 : t === 'player' ? 'damage to opponent'
                 : 'damage';
    } else if (eff.kind === 'gain_life') {
      // gain_life with a negative amount IS life loss (Spiteful Imp, Blood
      // Priest, …) — the label must track the sign, not assume the positive.
      fieldLabel = (eff.amount < 0) ? 'life loss' : 'life gain';
    } else if (eff.kind === 'move_card' && eff.from_zone === 'library' && eff.to_zone === 'hand') {
      fieldLabel = 'cards drawn';
    } else {
      fieldLabel = eff.kind;
    }
  } else {
    fieldLabel = roll.field;
  }
  const modeSuffix = (roll.modeIdx != null) ? `, mode ${roll.modeIdx + 1}` : '';
  return `${fieldLabel}${modeSuffix}`;
}

// Apply a rolled empower target to a card. Effect lists must already be deep-copied
// (makeCard / stickersForSlot) so mutating the field doesn't leak to other instances.
function applyEmpowerRoll(card, roll, amount) {
  if (!roll) return;
  const {location, subIdx, effIdx, modeIdx, field} = roll;
  let effs;
  if (location === 'effects') {
    if (modeIdx == null) {
      effs = Array.isArray(card.effects) ? card.effects : null;
    } else {
      effs = (card.effects && Array.isArray(card.effects.modes))
        ? card.effects.modes[modeIdx]
        : null;
    }
  } else if (location === 'triggers') {
    effs = (Array.isArray(card.triggers) && card.triggers[subIdx])
      ? card.triggers[subIdx].effects : null;
  } else if (location === 'abilities') {
    effs = (Array.isArray(card.abilities) && card.abilities[subIdx])
      ? card.abilities[subIdx].effects : null;
  }
  if (!effs || !effs[effIdx]) return;
  const e = effs[effIdx];
  const v = e[field];
  if (typeof v === 'object' && v !== null && 'from' in v) return;
  if (e.kind === 'affect_creature' && field === 'severity') {
    // Promote up the string ladder (tap→bounce→destroy→exile), capped at exile.
    e[field] = ENGINE.numToSev(ENGINE.sevToNum(e.severity) + amount);
    return;
  }
  const cur = (typeof v === 'number') ? v : 0;
  // Empower amplifies the field's MAGNITUDE in its existing direction: a +2 pump
  // goes to +3, but a -2 debuff (Sicken) or a negative drain goes to -3, not -1.
  // A flat `+= amount` would weaken every negative-valued field.
  e[field] = cur + (cur < 0 ? -amount : amount);
}

// Roll a creature subtype for targetSlotIdx, weighted by deck token frequency.
// Excludes subtypes the target already has. Null if nothing eligible.
function rollSubtypeFromDeck(slots, targetSlotIdx) {
  if (!Array.isArray(slots)) return null;
  const target_slot = slots[targetSlotIdx];
  if (!target_slot) return null;
  const targetTpl = tplForSlot(target_slot);
  if (!targetTpl) return null;
  const targetTokens = new Set(subtypesOf(targetTpl));
  for (const r of (target_slot.subtypeRolls || [])) {
    if (r) targetTokens.add(r);
  }
  // Each (slot, token) pair contributes one count — Goblin Wizard adds 1 weight
  // each to Goblin and Wizard. Stapled subs flow through tplForSlot.
  const tokenCount = {};
  for (const slot of slots) {
    const tpl = tplForSlot(slot);
    if (!tpl || !hasType(tpl, 'Creature')) continue;
    const tokens = subtypesOf(tpl);
    for (const tok of tokens) {
      if (targetTokens.has(tok)) continue;
      tokenCount[tok] = (tokenCount[tok] || 0) + 1;
    }
  }
  const entries = Object.entries(tokenCount);
  if (entries.length === 0) return null;
  let total = 0;
  for (const [_, c] of entries) total += c;
  let r = Math.random() * total;
  for (const [tok, c] of entries) {
    r -= c;
    if (r <= 0) return tok;
  }
  return entries[entries.length - 1][0];
}

// Push a sticker onto a slot, recording an empower/subtype roll if needed.
// `slotsForRoll` is the deck context for subtype rolling.
function pushStickerWithRoll(slot, sticker_id, slotsForRoll) {
  slot.stickers.push(sticker_id);
  if (sticker_id === 'empower') {
    const tpl = tplForSlot(slot);
    const roll = tpl ? rollEmpowerTarget(tpl) : null;
    if (!Array.isArray(slot.empowerRolls)) slot.empowerRolls = [];
    slot.empowerRolls.push(roll);
  }
  if (sticker_id === 'subtype') {
    let roll = null;
    if (Array.isArray(slotsForRoll)) {
      const idx = slotsForRoll.indexOf(slot);
      if (idx >= 0) roll = rollSubtypeFromDeck(slotsForRoll, idx);
    }
    if (!Array.isArray(slot.subtypeRolls)) slot.subtypeRolls = [];
    slot.subtypeRolls.push(roll);
  }
}

// Filter STICKERS to those legal for a slot. Builds a synthetic view reflecting
// applied stickers so appliesTo doesn't re-offer dupes.
// Effects/triggers/abilities deep-copied — shared refs have bitten before.
function stickersForSlot(slot, deckColors) {
  const tpl = tplForSlot(slot);
  if (!tpl) return [];
  const copyEffs = (effs) => Array.isArray(effs) ? effs.map(e => ({...e})) : [];
  const copyTopEffects = (effs) => {
    if (Array.isArray(effs)) return effs.map(e => ({...e}));
    if (effs && Array.isArray(effs.modes)) {
      // Modal (charms): preserve shape.
      return {
        mode_names: effs.mode_names ? effs.mode_names.slice() : undefined,
        modes: effs.modes.map(modeEffs => modeEffs.map(e => ({...e}))),
      };
    }
    return [];
  };
  const view = {
    types: Array.isArray(tpl.types) ? tpl.types.slice() : [],
    keywords: (tpl.keywords || []).slice(),
    stickers: slot.stickers.slice(),
    mana: tpl.mana,
    deckColors: deckColors || [],
    cost: tpl.cost ? {...tpl.cost} : undefined,
    effects: copyTopEffects(tpl.effects),
    triggers: (tpl.triggers || []).map(t => ({...t, effects: copyEffs(t.effects)})),
    abilities: (tpl.abilities || []).map(a => ({...a, effects: copyEffs(a.effects)})),
  };
  // Subtype-implied keywords (Wall→defender, Dragon→flying, …) are derived, not
  // printed, so eligibility (e.g. lose_defender on a Wall) must see them. Derive
  // BEFORE the sticker loop so a remove_keyword sticker can still strip one.
  ENGINE.applySubtypeKeywords(view);
  let subtypeCursor = 0;
  for (const sId of slot.stickers) {
    const s = resolveSticker(sId);
    if (!s) continue;
    if (s.kind === 'keyword' && !view.keywords.includes(s.keyword)) {
      view.keywords.push(s.keyword);
    }
    if (s.kind === 'remove_keyword') {
      view.keywords = view.keywords.filter(k => k !== s.keyword);  // so lose_defender isn't re-offered
    }
    if (s.kind === 'subtype') {
      const rolled = (slot.subtypeRolls || [])[subtypeCursor];
      subtypeCursor++;
      if (rolled) addType(view, rolled);
    }
    if (s.kind === 'grant_mana_ability') {
      grantManaAbility(view, s.color);  // §3.9: reflect on the view's tap-ability
    }
    if (s.kind === 'add_type') {
      addType(view, s.type);
      grantBasicLandMana(view);  // reflect §305.6 mana so landProducibleColors re-offer dedup sees it
    }
    // §3.8 cost_mod (unified costReduction −1 / embargo +1) — reflect on the
    // view so re-offer eligibility sees the modified cost.
    if (s.kind === 'cost_mod' && view.cost) {
      view.cost.C = Math.max(0, (view.cost.C || 0) + (s.amount || 0));
    }
    if (s.kind === 'set_color') {
      view.color = s.color;
      if (s.color === 'C' && view.cost) {
        let colored = 0;
        for (const k of ['W', 'U', 'B', 'R', 'G']) { colored += view.cost[k] || 0; view.cost[k] = 0; }
        if (colored) view.cost.C = (view.cost.C || 0) + colored;
      }
    }
    if (s.kind === 'stat_boost') {
      view.power = (view.power || 0) + (s.power || 0);
      view.toughness = (view.toughness || 0) + (s.toughness || 0);
    }
  }
  return Object.values(STICKERS).filter(s => {
    // weight 0 = excluded from random offers (boss-only or specific application paths).
    if (!s.weight) return false;
    if (!s.appliesTo(view)) return false;
    if (!s.stackable && slot.stickers.includes(s.id)) return false;
    return true;
  });
}
