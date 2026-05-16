// =========================================================================
// STICKERS — runtime sticker application and deck-construction helpers.
// Extracted from engine.js in v1.0.136. References two engine.js globals
// as late-bound calls: ENGINE.synthesizeStapledTemplate (used when applying
// an empower sticker to a stapled card — the merged template is the
// baseline for the roll) and tplForSlot (used in eligibility checks).
// Both resolve at function-call time, after engine.js has loaded.
// deckColorsFromSlots stays in engine.js but is passed INTO stickers via
// the `deckColors` parameter on stickersForSlot — not late-bound here.
//
// Two logical groupings, in original engine.js order:
//   1. Runtime sticker application: weightedPick, applyStickersToCard,
//      applyOneStickerToRuntimeCard, applyRandomStickersToSide,
//      empowerRollLabel, applyEmpowerRoll.
//   2. Deck-construction sticker helpers: rollSubtypeFromDeck,
//      pushStickerWithRoll, stickersForSlot.
// =========================================================================
// Weighted-random pick from a sticker list (default weight 3).
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

// Apply run-persistent stickers to a card. Called from makeCard and from
// stickersForSlot's eligibility view.
function applyStickersToCard(card) {
  // Empower rolls are consumed in order — Nth 'empower' sticker uses Nth roll.
  // If a roll is missing (legacy save, or the slot was created before we
  // started recording rolls), we fall back to a fresh uniform roll on the
  // template at apply time. This is non-deterministic but only happens for
  // legacy data; new applications always have a recorded roll.
  let empowerCursor = 0;
  let subtypeCursor = 0;
  for (const sId of card.stickers) {
    const s = STICKERS[sId];
    if (!s) continue;
    if (s.kind === 'statBoost') {
      // Symmetricize beats stat-boost stickers — the card has been
      // numerically flattened to N/N for {N}, and the boss's "all values
      // become the same" promise overrides earned +1/+1 buffs. Keyword
      // stickers, innate, landColor, costReduction, trigger, and subtype
      // all continue to apply normally.
      if (typeof card.symmetrizedTo === 'number') continue;
      card.modifiers.push({ power: s.power || 0, toughness: s.toughness || 0 });
    } else if (s.kind === 'keyword') {
      if (!card.keywords.includes(s.keyword)) card.keywords.push(s.keyword);
    } else if (s.kind === 'innate') {
      card.innate = true;
    } else if (s.kind === 'landColor') {
      if (!Array.isArray(card.extraManaColors)) card.extraManaColors = [];
      if (!card.extraManaColors.includes(s.color) && card.mana !== s.color) {
        card.extraManaColors.push(s.color);
      }
    } else if (s.kind === 'costReduction') {
      if (card.cost) {
        const generic = card.cost.C || 0;
        card.cost.C = Math.max(0, generic - (s.amount || 1));
      }
    } else if (s.kind === 'empower') {
      let roll = (card.empowerRolls || [])[empowerCursor];
      if (!roll) {
        // Stapled-aware fallback: if the card was synthesized from a staple
        // chain, use the merged template so the fresh roll can land on the
        // staple half's effects. Otherwise we'd silently constrain the empower
        // target to base-only fields.
        // applyStickersToCard lives at module scope (so DRAFT and RUN can both
        // call it before the ENGINE IIFE has constructed); synthesizeStapledTemplate
        // is inside ENGINE's IIFE. Use the exposed ENGINE.synthesizeStapledTemplate
        // which is in scope at call time (when ENGINE has been built).
        const tpl = card.stapledFrom
          ? ENGINE.synthesizeStapledTemplate(card.stapledFrom.baseTplId,
                                              card.stapledFrom.stapledTpls)
          : CARDS[card.tplId];
        roll = tpl ? rollEmpowerTarget(tpl) : null;
      }
      empowerCursor++;
      if (roll) applyEmpowerRoll(card, roll, s.amount || 1);
    } else if (s.kind === 'trigger') {
      card.triggers.push({...s.trigger});
    } else if (s.kind === 'subtype') {
      // The specific subtype is stored on card.subtypeRolls (parallel to
      // occurrences of 'subtype' in card.stickers). Mirrors the Empower
      // cursor pattern. If a roll is missing (legacy save), skip — we
      // can't deterministically pick a subtype without runtime context
      // (the rolling needs the full deck), so we defer to the next save.
      const rolled = (card.subtypeRolls || [])[subtypeCursor];
      subtypeCursor++;
      if (!rolled) continue;
      const tokens = (card.sub || '').split(/\s+/).filter(Boolean);
      if (!tokens.includes(rolled)) {
        tokens.push(rolled);
        card.sub = tokens.join(' ');
      }
    }
  }
}

// Apply a SINGLE sticker to a runtime card incrementally. Mirrors the
// per-sticker logic in applyStickersToCard (for one sticker only). Used
// when a sticker is added mid-game (Archdemon of Bargains) and the
// runtime card already has its other stickers' effects baked in — we
// only want to apply the NEW one, not re-apply everything. Modifies
// the card in place; also pushes the stickerId into card.stickers so a
// later full rebuild stays consistent.
//
// Skips empower/subtype paths — they require rolls that we don't generate
// here. The bargain effect only picks from statBoost/keyword/innate/
// landColor/costReduction/trigger stickers (filtered at call site).
function applyOneStickerToRuntimeCard(card, stickerId) {
  if (!card) return;
  const s = STICKERS[stickerId];
  if (!s) return;
  if (!Array.isArray(card.stickers)) card.stickers = [];
  if (!s.stackable && card.stickers.includes(stickerId)) return;
  card.stickers.push(stickerId);
  if (s.kind === 'statBoost') {
    if (!Array.isArray(card.modifiers)) card.modifiers = [];
    card.modifiers.push({ power: s.power || 0, toughness: s.toughness || 0 });
  } else if (s.kind === 'keyword') {
    if (!Array.isArray(card.keywords)) card.keywords = [];
    if (!card.keywords.includes(s.keyword)) card.keywords.push(s.keyword);
  } else if (s.kind === 'innate') {
    card.innate = true;
  } else if (s.kind === 'landColor') {
    if (!Array.isArray(card.extraManaColors)) card.extraManaColors = [];
    if (!card.extraManaColors.includes(s.color) && card.mana !== s.color) {
      card.extraManaColors.push(s.color);
    }
  } else if (s.kind === 'costReduction') {
    if (card.cost) {
      const generic = card.cost.C || 0;
      card.cost.C = Math.max(0, generic - (s.amount || 1));
    }
  } else if (s.kind === 'trigger') {
    if (!Array.isArray(card.triggers)) card.triggers = [];
    card.triggers.push({...s.trigger});
  }
}

// Apply N random stickers to permanents controlled by `side`. Used by
// Archdemon of Bargains. For each of the N rolls: pick a random eligible
// (permanent, sticker) pair where the sticker's appliesTo predicate
// accepts the card. Skip if no eligible pair exists (defensive — happens
// when side has no permanents at all).
//
// PLAYER-SIDE: applies via RUN.applyStickerToSlot for persistence across
// games. The runtime card on the battlefield also gets the sticker
// applied this game via applyOneStickerToRuntimeCard, so the buff is
// visible immediately.
//
// OPP-SIDE: only applies to the runtime card. Opp slots are regenerated
// each game so persistence isn't possible (and isn't desired — the
// boss's deck shouldn't accumulate stickers across encounters).
// Apply N random stickers to permanents controlled by `side`. Used by
// Archdemon of Bargains. For each of the N rolls: pick a random eligible
// (permanent, sticker) pair where the sticker's appliesTo predicate
// accepts the card. Skip if no eligible pair exists (defensive — happens
// when side has no permanents at all).
//
// PLAYER-SIDE: applies via RUN.applyStickerToSlot for persistence across
// games. The runtime card on the battlefield also gets the sticker
// applied this game via applyOneStickerToRuntimeCard, so the buff is
// visible immediately.
//
// OPP-SIDE: only applies to the runtime card. Opp slots are regenerated
// each game so persistence isn't possible (and isn't desired — the
// boss's deck shouldn't accumulate stickers across encounters).
//
// `state` is the engine's G state (passed in since this helper lives
// at module scope, outside the ENGINE IIFE). `logFn` is the engine's
// internal log function, also passed in.
function applyRandomStickersToSide(state, side, n, sourceName, logFn) {
  if (n <= 0) return;
  // Pool of sticker IDs eligible to be applied via bargain. Excludes:
  //  - scarified (boss-only, would be cruel to give to player)
  //  - subtype (needs deck-context roll; thematically odd as a buff)
  //  - empower (needs effect-target roll; complex)
  // Yields a mix of statBoost (+1/+1) and keyword stickers (the ones that
  // exist in the STICKERS pool — flying, lifelink, etc.).
  const eligibleStickerIds = Object.keys(STICKERS).filter(id => {
    if (id === 'scarified' || id === 'subtype' || id === 'empower') return false;
    const s = STICKERS[id];
    if (!s) return false;
    if (s.weight === 0) return false;       // not in normal reward pools
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
// many effect kinds (damage, draw, discard, gainLife, etc.) — so when the
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
  // 'amount' is generic — many effect kinds share it (damage, gainLife,
  // draw, discard, etc.). Use kind+target to produce a player-readable
  // phrase rather than the internal field name.
  // Other field names ('power', 'toughness', 'severity', 'count') are
  // already self-explanatory.
  let fieldLabel;
  if (roll.field === 'amount' && eff && eff.kind) {
    // Target-aware labels: a `damage target:'self'` effect is the recoil/
    // drawback half of cards like Char or Final Strike — calling it "damage"
    // reads the same as the spell's main payload, so we tag it "self damage"
    // to distinguish. `damage target:'player'` is opp-side damage (Grave
    // Charm mode 3, Lava Spike) — labeled "damage to opponent" so the
    // direction is unambiguous from the badge alone.
    if (eff.kind === 'damage') {
      const t = eff.target;
      fieldLabel = t === 'self'   ? 'self damage'
                 : t === 'player' ? 'damage to opponent'
                 : 'damage';
    } else if (eff.kind === 'gainLife') {
      fieldLabel = 'life gain';
    } else if (eff.kind === 'damageAll') {
      fieldLabel = 'damage to all';
    } else if (eff.kind === 'removeAll') {
      fieldLabel = 'severity';
    } else {
      // draw / discard / etc. — kind name is already player-readable.
      fieldLabel = eff.kind;
    }
  } else {
    fieldLabel = roll.field;
  }
  const modeSuffix = (roll.modeIdx != null) ? `, mode ${roll.modeIdx + 1}` : '';
  return `${fieldLabel}${modeSuffix}`;
}

// Apply a single rolled empower target to a card (or card-view). The card's
// effect lists must already have the same shape as the template's (deep-copied
// at makeCard / stickersForSlot time) so mutating the field doesn't leak.
// Pure function of its inputs.
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
  const cur = (typeof v === 'number') ? v : 0;
  if ((e.kind === 'removeCreature' || e.kind === 'removeAll') && field === 'severity') {
    e[field] = Math.min(4, cur + amount);
  } else {
    e[field] = cur + amount;
  }
}

// Roll a creature subtype for the slot at targetSlotIdx, weighted by token
// frequency in slots. Excludes subtypes the target already has. Returns
// null if nothing eligible.
function rollSubtypeFromDeck(slots, targetSlotIdx) {
  if (!Array.isArray(slots)) return null;
  const targetSlot = slots[targetSlotIdx];
  if (!targetSlot) return null;
  const targetTpl = tplForSlot(targetSlot);
  if (!targetTpl) return null;
  const targetTokens = new Set((targetTpl.sub || '').split(/\s+/).filter(Boolean));
  for (const r of (targetSlot.subtypeRolls || [])) {
    if (r) targetTokens.add(r);
  }
  // Weight tokens across all creature slots in the deck. Each (slot, token)
  // pair contributes one count — so a Goblin Wizard contributes one Goblin
  // weight and one Wizard weight. Stapled creatures' merged subs flow
  // through tplForSlot's synthesis.
  const tokenCount = {};
  for (const slot of slots) {
    const tpl = tplForSlot(slot);
    if (!tpl || tpl.type !== 'Creature') continue;
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

// Push a sticker onto a slot, recording an empower or subtype roll if
// the kind needs one. `slotsForRoll` is the deck context for subtype
// rolling — pass the slots array the slot lives in (opp's transient list
// or runState.slots).
function pushStickerWithRoll(slot, stickerId, slotsForRoll) {
  slot.stickers.push(stickerId);
  if (stickerId === 'empower') {
    // tplForSlot is stapled-aware, so empower can target the staple half's
    // effects/triggers as well as the base.
    const tpl = tplForSlot(slot);
    const roll = tpl ? rollEmpowerTarget(tpl) : null;
    if (!Array.isArray(slot.empowerRolls)) slot.empowerRolls = [];
    slot.empowerRolls.push(roll);
  }
  if (stickerId === 'subtype') {
    let roll = null;
    if (Array.isArray(slotsForRoll)) {
      const idx = slotsForRoll.indexOf(slot);
      if (idx >= 0) roll = rollSubtypeFromDeck(slotsForRoll, idx);
    }
    if (!Array.isArray(slot.subtypeRolls)) slot.subtypeRolls = [];
    slot.subtypeRolls.push(roll);
  }
}

// Filter STICKERS to those legal for a slot. Builds a synthetic "view" of
// the card with current stickers reflected so appliesTo doesn't re-offer
// dupes. Used by opp-AI (direct) and player path (RUN.stickersFor wraps).
//
// Effects/triggers/abilities are deep-copied for template isolation —
// sharing refs has bitten before (City of Brass extraManaColors pre-
// v0.99.44). Cost is trivial at offer-generation time.
function stickersForSlot(slot, deckColors) {
  const tpl = tplForSlot(slot);
  if (!tpl) return [];
  const copyEffs = (effs) => Array.isArray(effs) ? effs.map(e => ({...e})) : [];
  const copyTopEffects = (effs) => {
    if (Array.isArray(effs)) return effs.map(e => ({...e}));
    if (effs && Array.isArray(effs.modes)) {
      // Modal (charms): preserve {modeNames, modes:[[...]]} shape.
      return {
        modeNames: effs.modeNames ? effs.modeNames.slice() : undefined,
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
    extraManaColors: [],
    deckColors: deckColors || [],
    cost: tpl.cost ? {...tpl.cost} : undefined,
    // hasEmpowerableEffect walks effects/triggers/abilities — all three
    // needed for creatures whose empowerable field lives in an ability
    // or trigger (Spitfire Bastion, War Drummer).
    effects: copyTopEffects(tpl.effects),
    triggers: (tpl.triggers || []).map(t => ({...t, effects: copyEffs(t.effects)})),
    abilities: (tpl.abilities || []).map(a => ({...a, effects: copyEffs(a.effects)})),
  };
  // Reflect applied stickers so we don't re-offer invalid ones.
  let subtypeCursor = 0;
  for (const sId of slot.stickers) {
    const s = STICKERS[sId];
    if (!s) continue;
    if (s.kind === 'keyword' && !view.keywords.includes(s.keyword)) {
      view.keywords.push(s.keyword);
    }
    if (s.kind === 'subtype') {
      // Cursor-walk slot.subtypeRolls in occurrence order.
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
    if (s.kind === 'landColor' && !view.extraManaColors.includes(s.color)) {
      view.extraManaColors.push(s.color);
    }
    if (s.kind === 'costReduction' && view.cost) {
      const generic = view.cost.C || 0;
      view.cost.C = Math.max(0, generic - (s.amount || 1));
    }
  }
  return Object.values(STICKERS).filter(s => {
    // weight: 0 stickers are excluded from random offers — they're
    // boss-only or otherwise restricted to specific application paths
    // (e.g., 'scarified' applied by Scarification spell, never as a
    // reward).
    if (!s.weight) return false;
    if (!s.appliesTo(view)) return false;
    if (!s.stackable && slot.stickers.includes(s.id)) return false;
    return true;
  });
}
