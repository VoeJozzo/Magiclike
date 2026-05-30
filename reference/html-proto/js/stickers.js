// STICKERS — runtime application + deck-construction helpers (extracted from engine.js).
// Late-binds ENGINE.synthesizeStapledTemplate and tplForSlot (both resolve at call time).

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
  } else if (s.kind === 'innate') {
    card.innate = true;
  } else if (s.kind === 'grant_mana_ability') {
    grantManaAbility(card, s.color);
  } else if (s.kind === 'cost_mod') {
    // Signed additive cost change (§3.8): +N for embargo, −1 for the reduction
    // reward (unified from costReduction). Generic floored at 0.
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
  } else if (s.kind === 'trigger') {
    if (!Array.isArray(card.triggers)) card.triggers = [];
    card.triggers.push({ ...s.trigger });
  }
}

function weightedPick(stickers) {
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
      let roll = (card.empowerRolls || [])[empowerCursor];
      if (!roll) {
        // Stapled fallback: use merged tpl so roll can land on staple half's effects.
        const tpl = card.stapledFrom
          ? ENGINE.synthesizeStapledTemplate(card.stapledFrom.baseTplId,
                                              card.stapledFrom.stapledTpls)
          : CARDS[card.tplId];
        roll = tpl ? rollEmpowerTarget(tpl) : null;
      }
      empowerCursor++;
      if (roll) applyEmpowerRoll(card, roll, s.amount || 1);
    } else if (s.kind === 'subtype') {
      // Specific subtype stored on card.subtypeRolls (parallel to occurrences). Legacy
      // saves missing a roll skip — rolling needs deck context, deferred to next save.
      const rolled = (card.subtypeRolls || [])[subtypeCursor];
      subtypeCursor++;
      if (!rolled) continue;
      const tokens = (card.sub || '').split(/\s+/).filter(Boolean);
      if (!tokens.includes(rolled)) {
        tokens.push(rolled);
        card.sub = tokens.join(' ');
        // If the card carries an explicit types[] (multi-type cards, and now all
        // cards post-id-normalization), typesOf reads it and IGNORES card.sub —
        // so the rolled subtype must be pushed onto types[] too, or the lord
        // buffs that match on it (hasType) never see it.
        if (Array.isArray(card.types) && !card.types.includes(rolled)) {
          card.types.push(rolled);
        }
      }
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
  card.stickers.push(sticker);
  applyStickerKindEffect(card, s);
}

// Apply N random stickers to permanents controlled by `side` (Archdemon of
// Bargains). Player-side: persists via RUN.applyStickerToSlot AND applies to
// the runtime card. Opp-side: runtime card only (opp slots regenerate each
// game). `state` is G; `logFn` is the engine's internal log.
function applyRandomStickersToSide(state, side, n, sourceName, logFn) {
  if (n <= 0) return;
  // Exclude scarified (boss-only), subtype/empower (need rolls). Yields a mix of
  // statBoost and keyword stickers from the normal reward pool.
  const eligibleStickerIds = Object.keys(STICKERS).filter(id => {
    if (id === 'scarified' || id === 'subtype' || id === 'empower') return false;
    const s = STICKERS[id];
    if (!s) return false;
    if (s.weight === 0) return false;
    return true;
  });
  const perms = state[side].battlefield;
  if (perms.length === 0) {
    if (logFn) logFn(`${sourceName} — no permanents to sticker.`, 'sp');
    return;
  }
  let applied = 0;
  for (let i = 0; i < n; i++) {
    const tries = [];
    for (const p of perms) {
      for (const sid of eligibleStickerIds) {
        const s = STICKERS[sid];
        if (!s.appliesTo || s.appliesTo(p)) tries.push({perm: p, sid});
      }
    }
    if (tries.length === 0) break;
    const pick = tries[Math.floor(Math.random() * tries.length)];
    applyOneStickerToRuntimeCard(pick.perm, pick.sid);
    if (side === 'you' && typeof pick.perm.slotIdx === 'number'
        && typeof RUN !== 'undefined' && RUN.applyStickerToSlot) {
      RUN.applyStickerToSlot(pick.perm.slotIdx, pick.sid);
    }
    const s = STICKERS[pick.sid];
    if (logFn) logFn(`${pick.perm.name} gains "${s.name}" sticker.`, 'sp');
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
      fieldLabel = 'life gain';
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
  const targetTokens = new Set((targetTpl.sub || '').split(/\s+/).filter(Boolean));
  for (const r of (target_slot.subtypeRolls || [])) {
    if (r) targetTokens.add(r);
  }
  // Each (slot, token) pair contributes one count — Goblin Wizard adds 1 weight
  // each to Goblin and Wizard. Stapled subs flow through tplForSlot.
  const tokenCount = {};
  for (const slot of slots) {
    const tpl = tplForSlot(slot);
    if (!tpl || !hasType(tpl, 'Creature')) continue;
    const tokens = (tpl.sub || '').split(/\s+/).filter(Boolean);
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
    type: tpl.type,
    sub: tpl.sub || '',
    keywords: (tpl.keywords || []).slice(),
    stickers: slot.stickers.slice(),
    mana: tpl.mana,
    deckColors: deckColors || [],
    cost: tpl.cost ? {...tpl.cost} : undefined,
    effects: copyTopEffects(tpl.effects),
    triggers: (tpl.triggers || []).map(t => ({...t, effects: copyEffs(t.effects)})),
    abilities: (tpl.abilities || []).map(a => ({...a, effects: copyEffs(a.effects)})),
  };
  let subtypeCursor = 0;
  for (const sId of slot.stickers) {
    const s = resolveSticker(sId);
    if (!s) continue;
    if (s.kind === 'keyword' && !view.keywords.includes(s.keyword)) {
      view.keywords.push(s.keyword);
    }
    if (s.kind === 'subtype') {
      const rolled = (slot.subtypeRolls || [])[subtypeCursor];
      subtypeCursor++;
      if (rolled) {
        const tokens = (view.sub || '').split(/\s+/).filter(Boolean);
        if (!tokens.includes(rolled)) {
          tokens.push(rolled);
          view.sub = tokens.join(' ');
        }
      }
    }
    if (s.kind === 'grant_mana_ability') {
      grantManaAbility(view, s.color);  // §3.9: reflect on the view's tap-ability
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
