// Mercurial Adept's trigger pool. Six abilities, each rolled into the slot's
// triggerPool field at boon-application time. makeCard rolls one fresh per
// game when materializing the card, so the same Adept slot has a different
// personality each fight. Each entry carries:
//   - All standard trigger fields (event, condId, effects, text)
//   - label: short human-readable name shown in the card popup repertoire
// The label is what makes the modularity visible to the player — they see
// the full pool on the card popup with the active one indicated.
const MERCURIAL_TRIGGER_POOL = [
  {
    label: 'Striker',
    event: 'attacks',
    condId: 'thisAttacks',
    text: '~ attacked — opp loses 1 life.',
    effects: [{kind: 'damage', target: 'player', amount: 1}],
  },
  {
    label: 'Spellsworn',
    event: 'spellCast',
    condId: 'youCastSpell',
    text: 'Spell cast — ~ gets +1/+0 EOT.',
    effects: [{kind: 'pump', target: 'self', power: 1, toughness: 0}],
  },
  {
    label: 'Standard-bearer',
    event: 'cardEntersBattlefield',
    condId: 'anotherCreatureYouEntersStrict',
    text: 'Ally entered — ~ gets a +1/+1 counter.',
    effects: [{kind: 'addCounter', target: 'self', power: 1, toughness: 1}],
  },
  {
    label: 'Bloodscholar',
    event: 'lifeGained',
    condId: 'youGainLife',
    text: 'Life gained — draw a card.',
    effects: [{kind: 'draw', target: 'self', amount: 1}],
  },
  {
    label: 'Reaper',
    event: 'cardDies',
    condId: 'anotherCreatureDies',
    text: 'Creature died — ~ gets +1/+0 EOT.',
    effects: [{kind: 'pump', target: 'self', power: 1, toughness: 0}],
  },
  {
    label: 'Hexweaver',
    event: 'cardEntersBattlefield',
    condId: 'thisEnters',
    text: '~ entered — gain 2 life.',
    effects: [{kind: 'gainLife', target: 'self', amount: 2}],
  },
];

// Note: Mercurial Adept previously had a Neow boon entry that injected her
// into the deck with a triggerPool. As of v1.0.0 she's promoted to the
// regular draft pool — the variance is fun-card territory, not run-defining
// boon territory. The triggerPool now seeds from the template via
// triggerPoolSeed:'mercurial' (see makePlayer). Keeping this comment as
// migration breadcrumb in case a save from the boon era is ever loaded:
// such a save would have the slot already populated with an embedded
// triggerPool, which still works via the slot-level path.


RUN_MODIFIERS['architectsCodex'] = {
  id: 'architectsCodex',
  name: "The Architect's Codex",
  text: "Begin your run with The Architect's Codex — a 4-mana 2/3. The first time you draw it each game, choose one of three procedurally-generated abilities (or keep the current one).",
  // No `art:` field — derived from CARDS.architectsCodex.art at render
  // time. See the comment block above RUN_MODIFIERS['cityOfBrass'] in
  // cards.js. TODO: this boon really belongs in cards.js with the
  // others; defining it in engine.js makes it easy to miss in
  // cross-cutting changes (e.g. the v1.0.134.13 boon-art dedup).
  apply: () => ({
    extras: [{ tplId: 'architectsCodex', stickers: [] }],
  }),
};

// ENGINE — game rules, state, phase machine.
// Public API: init, state, expectedActor, getLegalActions, executeAction,
// subscribe, findCard, getStats.

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

// Splice eligibility — module-level so both ENGINE (synthesis) and RUN
// (reward roll/apply) can use them. v1.0.55: Lands are now spliceable on
// both sides. The compatibility matrix in isCompatibleStaplePair enforces
// which (base, staple) pairings are actually legal — lands-as-base reject
// creature-staples (no clean interpretation, would require type-changing).
function isSpliceableBase(tplId) {
  const tpl = CARDS[tplId];
  if (!tpl) return false;
  if (tpl.special) return false;
  if (tpl.stapleable === false) return false;
  // Modal-as-base would require synthesizing modes — punt for v1.
  if (tpl.effects && tpl.effects.modes) return false;
  return true;
}
// Generic staple eligibility: any non-special non-modal card. Whether a
// SPECIFIC staple is compatible with a SPECIFIC base depends on their
// types — see isCompatibleStaplePair.
function isSpliceableStaple(tplId) {
  const tpl = CARDS[tplId];
  if (!tpl) return false;
  if (tpl.special) return false;
  if (tpl.stapleable === false) return false;
  if (tpl.effects && tpl.effects.modes) return false;
  return true;
}
// Compatibility check between a specific base and staple.
//   Base \ Staple    Creature    Spell    Land
//   Creature           OK (1)    OK (3)   OK (2)
//   Spell              NO       OK (7)    OK (6)
//   Land               NO       OK (5)    OK (4)
// Cases:
//   1. Creature + Creature: full body+ability merge.
//   2. Creature + Land: land's tap-for-mana ability appended to creature.
//   3. Creature + Spell: spell becomes ETB trigger on creature.
//   4. Land + Land: mana production merges.
//   5. Land + Spell: spell becomes ETB trigger on land.
//   6. Spell + Land: spell gains an addMana effect.
//   7. Spell + Spell: effects concat.
// Both halves must individually pass isSpliceableBase / isSpliceableStaple.

// Canonical base/staple ordering by type priority:
// Creature(0) > Artifact(1) > Land(2) > Spell(3) — lower becomes base.
// Returns [baseTplId, stapleTplId, swapped] so callers can fix parallel arrays.
function canonicalSplicePair(tplA, tplB) {
  const priority = (tplId) => {
    const tpl = CARDS[tplId];
    if (!tpl) return 4;
    if (tpl.type === 'Creature') return 0;
    if (tpl.type === 'Artifact') return 1;
    if (tpl.type === 'Land') return 2;
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
  const baseTpl = CARDS[baseTplId];
  const stapleTpl = CARDS[stapleTplId];
  // v1.0.56: previously rejected spell-base+creature-staple and land-base+
  // creature-staple as "no clean interpretation." Replaced with upstream
  // canonicalization (canonicalSplicePair reorders by type priority so
  // creature is always the base when paired with land or spell). Callers
  // canonicalize first; this function now just enforces multi-color-land
  // restrictions, which are direction-sensitive (the addMana-as-ability
  // and addMana-on-resolve shapes don't have "tap, pick one" semantics).
  //
  // Multi-color land restriction: creature+land and spell+land require a
  // single-color staple. City of Brass (extraManaColors populated) only
  // works as a land+land staple. The synthesis would otherwise generate
  // an addMana ability/effect that produces all WUBRG simultaneously,
  // which is much stronger than MtG's "tap, choose one." Until modal
  // addMana is implemented, exclude multi-color lands from those pairings.
  if (baseTpl.type === 'Creature' && stapleTpl.type === 'Land'
      && Array.isArray(stapleTpl.extraManaColors) && stapleTpl.extraManaColors.length > 0) {
    return false;
  }
  if (baseTpl.type !== 'Creature' && baseTpl.type !== 'Land' && stapleTpl.type === 'Land'
      && Array.isArray(stapleTpl.extraManaColors) && stapleTpl.extraManaColors.length > 0) {
    return false;
  }
  return true;
}

// Splice merge math — pure helpers used by both the reward-time path
// (RUN.applySplice) and the in-game path (ENGINE.EFFECTS.applyInGameSplice).
// Moved to module scope so both IIFEs can reach them. Original copies
// inside the RUN IIFE were forwarded to these to avoid duplication.
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

// Resolve a slot to its effective template — synthesized merged template if
// the slot has staples, otherwise the base CARDS entry. Centralizes the
// "is this a stapled slot? get the merged tpl" decision so callers don't
// each re-implement it. Called at offer time, apply time, and various
// scoring/eligibility paths that need the slot's effective effects/triggers/
// abilities/cost/keywords.
function tplForSlot(slot) {
  if (!slot) return null;
  if (Array.isArray(slot.stapledTpls) && slot.stapledTpls.length > 0) {
    return ENGINE.synthesizeStapledTemplate(slot.tplId, slot.stapledTpls);
  }
  return CARDS[slot.tplId] || null;
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

// Compute deck color set from a list of slot objects. Pure helper for
// gating land-color stickers, evaluating splice color compatibility, etc.
function deckColorsFromSlots(slots) {
  const set = new Set();
  for (const slot of slots) {
    const tpl = tplForSlot(slot);
    if (!tpl) continue;
    if (tpl.type === 'Land' && tpl.mana) set.add(tpl.mana);
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
// unique targetSlot.
function fakeTargetsForLegality(effects, who) {
  const targetedEffs = (effects || []).filter(ENGINE.effectNeedsTarget);
  if (targetedEffs.length === 0) return [];
  const bySlot = new Map();
  for (const eff of targetedEffs) {
    const slot = eff.targetSlot || 0;
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


// CARD TEXT GENERATION — describeCardText walks effects/triggers/abilities.
// Called by makeCard after stickers, so reflects empower-bumped values.
// Opt-out: tpl.customText: true (Endomorph, Codex, Elystra).

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const NUM_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

// targetPhrase: eff.target → noun phrase. target:'player' reads as "target
// opponent" for damage/discard (offensive context) but "target player" for
// gainLife (either-direction). target:'self' resolves at call site.
function targetPhrase(eff) {
  const t = eff.target;
  if (t === 'self')     return 'you';
  if (t === 'player') {
    if (eff.kind === 'gainLife') return 'target player';
    if (eff.kind === 'discard')  return 'target player';
    return 'target opponent';
  }
  if (t === 'creature') return 'target creature';
  if (t === 'graveyardCreature') return 'target creature card';
  if (t === 'permanent')return 'target permanent';
  if (t === 'spell')    return 'target spell';
  if (t === 'any')      return 'any target';
  if (t === 'card')     return 'target card';
  return t || '';
}

// withFilter: apply eff.filter to a noun phrase. Filters add adjectives
// before the noun ("tapped creature", "non-Black creature") or modifying
// clauses after ("creature with flying", "creature you control").
// Pre-modifiers are stat/color-style; post-modifiers are relational.
function withFilter(noun, eff) {
  if (!eff.filter) return noun;
  const f = eff.filter;
  const pre = [];
  const post = [];
  if (f.tapped === true)  pre.push('tapped');
  if (f.tapped === false) pre.push('untapped');
  if (f.color)            pre.push(COLOR_NAMES[f.color] || f.color);
  if (f.notColor)         pre.push('non-' + (COLOR_NAMES[f.notColor] || f.notColor));
  // Subtype: "Spirit creature card", "Goblin creature", etc. The subtype
  // is a literal string from the card data — we trust it to be properly
  // capitalized at the source (e.g., 'Spirit', 'Goblin', 'Wizard Artificer').
  if (f.subtype)          pre.push(f.subtype);
  if (f.hasKeyword)       post.push('with ' + f.hasKeyword);
  if (f.notKeyword)       post.push('without ' + f.notKeyword);
  if (f.controller === 'you' || f.controller === 'self') post.push('you control');
  if (f.controller === 'opp') post.push('an opponent controls');
  // Stat filters: "with toughness N or less", "with power N or greater".
  if (typeof f.maxTough === 'number') post.push('with toughness ' + f.maxTough + ' or less');
  if (typeof f.minTough === 'number') post.push('with toughness ' + f.minTough + ' or greater');
  if (typeof f.maxPower === 'number') post.push('with power ' + f.maxPower + ' or less');
  if (typeof f.minPower === 'number') post.push('with power ' + f.minPower + ' or greater');
  let out = noun;
  if (pre.length) {
    out = out.replace('creature', pre.join(' ') + ' creature')
             .replace('permanent', pre.join(' ') + ' permanent');
  }
  if (post.length) out += ' ' + post.join(' ');
  return out;
}

// describeAmount: numeric values pass through; dynamic-value objects like
// {from:'targetPower'} get a player-readable phrase. Used for damage,
// gainLife, and any other field that might reference resolve-time values.
function describeAmount(amount) {
  if (typeof amount === 'number') return String(amount);
  if (amount && typeof amount === 'object' && amount.from) {
    const dynMap = {
      targetPower:    "the target's power",
      targetTough:    "the target's toughness",
      sourcePower:    "this creature's power",
      sourceToughness:"this creature's toughness",
      manaSpent:      'mana spent on it',
    };
    return dynMap[amount.from] || ('X (' + amount.from + ')');
  }
  return String(amount);
}

// Segment-tagged value: emit a numeric (or otherwise comparable) field as a
// segment, marking it `highlight: true` if the live value differs from the
// template baseline. This is how empower-bumped values get visual emphasis
// in the rendered card text. tplEff may be undefined (no baseline available
// → no highlights). The non-tpl callsites pass undefined, the bumped check
// silently skips.
function bumpedSeg(field, eff, tplEff, fallback) {
  const v = eff[field] !== undefined ? eff[field] : fallback;
  const tplV = tplEff ? (tplEff[field] !== undefined ? tplEff[field] : fallback) : undefined;
  const bumped = tplEff != null
    && typeof v === 'number' && typeof tplV === 'number'
    && v !== tplV;
  return { text: String(v), highlight: bumped };
}

// Like bumpedSeg but takes a precomputed display string (e.g. severity tier
// name "destroy" / "exile" derived from numeric severity). Highlights when
// the underlying numeric source differs from the template baseline.
function bumpedDerived(displayText, sourceField, eff, tplEff) {
  const v = eff[sourceField];
  const tplV = tplEff ? tplEff[sourceField] : undefined;
  const bumped = tplEff != null
    && typeof v === 'number' && typeof tplV === 'number'
    && v !== tplV;
  return { text: displayText, highlight: bumped };
}

// Plain non-highlighted segment.
function plainSeg(text) {
  return { text, highlight: false };
}

// describeEffect: render a single effect as an array of {text, highlight}
// segments. Lowercase-leading so the caller can decide capitalization.
// `tplEff` (optional) is the corresponding template effect for diff
// comparison — values that differ from the baseline get marked for visual
// highlighting in the renderer. Without tplEff, no highlights are emitted.
function describeEffect(eff, tplEff) {
  const t = withFilter(targetPhrase(eff), eff);
  const amtSeg = (() => {
    // Dynamic amounts (e.g., {from:'targetPower'}) are non-numeric; render
    // their phrase string and never highlight (empower can't bump them).
    if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
      return plainSeg(describeAmount(eff.amount));
    }
    return bumpedSeg('amount', eff, tplEff);
  })();
  switch (eff.kind) {
    case 'damage':
      if (eff.target === 'self') return [plainSeg('you take '), amtSeg, plainSeg(' damage')];
      return [plainSeg('deal '), amtSeg, plainSeg(' damage to ' + t)];
    case 'damageAll':
      return [plainSeg('deal '), amtSeg, plainSeg(' damage to each creature')];
    case 'gainLife':
      // Dynamic-value gainLife (Swords to Plowshares) — non-bumpable.
      if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
        const owner = (eff.who && eff.who.from === 'targetController') ? "its controller" : 'you';
        return [plainSeg(owner + ' gains life equal to ' + describeAmount(eff.amount))];
      }
      if (eff.target === 'self')   return [plainSeg('you gain '), amtSeg, plainSeg(' life')];
      if (eff.target === 'player') return [plainSeg(t + ' gains '), amtSeg, plainSeg(' life')];
      return [plainSeg('gain '), amtSeg, plainSeg(' life')];
    case 'draw':
      if (eff.target === 'player') {
        if (eff.amount === 1) return [plainSeg(t + ' draws a card')];
        return [plainSeg(t + ' draws '), amtSeg, plainSeg(' cards')];
      }
      if (eff.amount === 1) return [plainSeg('draw a card')];
      return [plainSeg('draw '), amtSeg, plainSeg(' cards')];
    case 'discard':
      if (eff.target === 'player') {
        if (eff.amount === 1) return [plainSeg(t + ' discards a card')];
        return [plainSeg(t + ' discards '), amtSeg, plainSeg(' cards')];
      }
      if (eff.amount === 1) return [plainSeg('discard a card')];
      return [plainSeg('discard '), amtSeg, plainSeg(' cards')];
    case 'pump': {
      // Power and toughness are independently bumpable.
      const pSeg = bumpedSeg('power', eff, tplEff, 0);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 0);
      const subj = eff.target === 'self' ? 'this creature' : t;
      return [plainSeg(subj + ' gets +'), pSeg, plainSeg('/+'), tSeg, plainSeg(' until end of turn')];
    }
    case 'pumpAllYours': {
      const pSeg = bumpedSeg('power', eff, tplEff, 0);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 0);
      return [plainSeg('creatures you control get +'), pSeg, plainSeg('/+'), tSeg, plainSeg(' until end of turn')];
    }
    case 'addCounter': {
      const pSeg = bumpedSeg('power', eff, tplEff, 1);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 1);
      const tail = eff.target === 'self' ? ' counter on this' : ' counter on ' + t;
      return [plainSeg('put a +'), pSeg, plainSeg('/+'), tSeg, plainSeg(tail)];
    }
    case 'grantKeyword': {
      // Duration text. Three cases:
      //   - 'eot': until end of turn (combat tricks, Overrun-style)
      //   - absent + target is a creature: persistent grant that ends when
      //     the source leaves the battlefield (engine clears via
      //     clearRestrictionsFromSource). Surface that — otherwise the
      //     reader has no way to know the grant isn't truly permanent.
      //   - absent + target is self/no target (none in current pool, but
      //     defensively): omit duration text.
      let dur;
      if (eff.duration === 'eot') {
        dur = ' until end of turn';
      } else if (eff.target === 'creature' || eff.whose === 'allYours' || eff.whose === 'all') {
        dur = ' as long as this is on the battlefield';
      } else {
        dur = '';
      }
      if (eff.whose === 'allYours') {
        return [plainSeg('creatures you control gain ' + eff.keyword + dur)];
      }
      if (eff.target === 'self') return [plainSeg('this creature gains ' + eff.keyword + dur)];
      return [plainSeg(t + ' gains ' + eff.keyword + dur)];
    }
    case 'removeCreature': {
      // Severity ladder: 1=tap, 2=return, 3=destroy, 4=exile. The displayed
      // verb is derived from severity, so highlight the verb when severity
      // differs from baseline (empower can promote tier).
      const sev = eff.severity || 1;
      const verb = sev >= 4 ? 'exile' : sev >= 3 ? 'destroy'
                 : sev >= 2 ? 'return' : 'tap';
      const verbSeg = bumpedDerived(verb, 'severity', eff, tplEff);
      if (sev >= 2 && sev < 3) return [verbSeg, plainSeg(' ' + t + " to its owner's hand")];
      return [verbSeg, plainSeg(' ' + t)];
    }
    case 'removeAll': {
      const sev = eff.severity || 1;
      const scope = eff.whose === 'opp' ? "all creatures an opponent controls"
                  : eff.whose === 'self' || eff.whose === 'you' ? "all creatures you control"
                  : 'all creatures';
      const verb = sev >= 4 ? 'exile' : sev >= 3 ? 'destroy'
                 : sev >= 2 ? 'return' : 'tap';
      const verbSeg = bumpedDerived(verb, 'severity', eff, tplEff);
      if (sev >= 2 && sev < 3) return [verbSeg, plainSeg(' ' + scope + " to their owners' hands")];
      return [verbSeg, plainSeg(' ' + scope)];
    }
    case 'counter':
      return [plainSeg('counter ' + t)];
    case 'createTokens': {
      const tok = eff.tokenId || 'creature';
      const tokTpl = (typeof TOKENS !== 'undefined' && TOKENS[tok]) || null;
      const niceName = tokTpl ? tokTpl.name : tok.replace(/_.*/, '').replace(/^./, c => c.toUpperCase());
      const colorWord = tokTpl && tokTpl.color
        ? (COLOR_NAMES[tokTpl.color] || '').toLowerCase() + ' ' : '';
      const stats = tokTpl ? (tokTpl.power + '/' + tokTpl.toughness) : '1/1';
      const kwSuffix = tokTpl && tokTpl.keywords && tokTpl.keywords.length
        ? ' with ' + tokTpl.keywords.join(', ') : '';
      // count is bumpable; render as word ("two" / "three") and highlight
      // the word when count differs from baseline.
      if (eff.count === 1) {
        return [plainSeg('create a ' + colorWord + stats + ' ' + niceName + ' token' + kwSuffix)];
      }
      const wordCount = NUM_WORDS[eff.count] || String(eff.count);
      const countSeg = bumpedDerived(wordCount, 'count', eff, tplEff);
      return [plainSeg('create '), countSeg, plainSeg(' ' + colorWord + stats + ' ' + niceName + ' tokens' + kwSuffix)];
    }
    case 'searchCreature':
      return [plainSeg('search your library for a creature card and put it into your hand')];
    case 'searchLandTapped':
      return [plainSeg('search your library for a basic land and put it onto the battlefield tapped')];
    case 'returnFromGraveyard':
      return [plainSeg('return ' + t + ' from your graveyard to your hand')];
    case 'shuffleIntoLibrary':
      return [plainSeg('shuffle ' + t + " into its owner's library")];
    case 'untap': {
      if (eff.target === 'self') return [plainSeg('untap this creature')];
      const filterMinusTapped = eff.filter ? Object.assign({}, eff.filter, {tapped: undefined}) : null;
      const tNoTap = withFilter(targetPhrase(eff), filterMinusTapped ? Object.assign({}, eff, {filter: filterMinusTapped}) : eff);
      return [plainSeg('untap ' + tNoTap)];
    }
    case 'applyInGameSplice':
      // Stapler's effect. The card has hand-authored text describing the
      // two-target shape; auto-gen falls back to a minimal description
      // for diagnostic surfaces (deck-viewer fallback, error rendering).
      return [plainSeg('staple the second target permanent onto the first')];
    case 'noop':
      // Marker effect used to force a second target in the validation
      // harness — has no described behavior. Render as empty so it doesn't
      // appear in any sentence.
      return [plainSeg('')];
    case 'fightTarget':
      return [plainSeg('your strongest creature fights ' + t)];
    case 'restrict':
      return [plainSeg(t + " can't attack or block")];
    case 'flicker':
      return [plainSeg('exile ' + t + ', then return it to the battlefield')];
    case 'exileUntilEOT':
      return [plainSeg('exile ' + t + ' until end of turn')];
    case 'gainControl': {
      // Mind Control / Threaten. Text composition mirrors MtG: "gain
      // control of X" with optional duration and rider clauses.
      const parts = ['gain control of ' + t];
      if (eff.duration === 'eot') parts.push(' until end of turn');
      // Riders read as a separate sentence ("Untap it. It gains haste
      // until end of turn.") rather than chained — matches Threaten's
      // template better than a comma-stitched run-on.
      const segs = [plainSeg(parts.join(''))];
      const riders = [];
      if (eff.untap) riders.push('untap it');
      if (eff.grantHaste) riders.push('it gains haste until end of turn');
      if (riders.length > 0) {
        // Capitalize each rider clause for sentence-y feel.
        const cap = riders.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join('. ');
        segs.push(plainSeg('. ' + cap));
      }
      return segs;
    }
    case 'addMana': {
      if (eff.amounts) {
        let symbols = '';
        for (const [color, n] of Object.entries(eff.amounts)) {
          for (let i = 0; i < n; i++) symbols += '{' + color + '}';
        }
        return [plainSeg('add ' + (symbols || '{C}'))];
      }
      return [plainSeg('add ' + (eff.mana || '{C}'))];
    }
    case 'edict':
      return [plainSeg(t + ' sacrifices a creature')];
    case 'weaken': {
      const pSeg = bumpedSeg('power', eff, tplEff, 1);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 1);
      return [plainSeg(t + ' gets -'), pSeg, plainSeg('/-'), tSeg, plainSeg(' until end of turn')];
    }
    case 'steal':
      return [plainSeg('shuffle ' + t + ' into your library')];
    case 'endomorphAbsorb':
      return [plainSeg('gain a keyword from the slain creature, or +1/+1 if none')];
    case 'ripPermanent':
      // Vile Edict: the target player chooses one of their permanents to
      // rip. Cards have their hand-authored text on the template; this is
      // a fallback for any path that auto-describes the effect.
      return [plainSeg(t + ' rips a permanent they control')];
    case 'destroyAndStickerSlot':
      // Scarification: card text is hand-authored. This fallback gives
      // something readable if a non-template path tries to describe it.
      return [plainSeg('destroy ' + t + ' and scar it')];
    case 'symmetricize':
      return [plainSeg(t + "'s controller equalizes its power, toughness, or cost")];
    case 'embargo':
      return [plainSeg('return ' + t + ' to hand; it costs {1} more forever')];
    case 'bleach':
      return [plainSeg('exile ' + t + '; it is colorless forever')];
  }
  return [plainSeg('[' + eff.kind + ']')];
}

// Convenience: flatten a segment array to a plain string.
function segsToText(segs) {
  return segs.map(s => s.text).join('');
}

// describeEffectList: join multiple effect clauses into a sentence/paragraph.
// Special-case for damage-only multi-target spells (Branching Bolt, Char,
// Drain Life): use shared-subject "X deals A damage to T1 and B damage to T2"
// phrasing which reads naturally with empower bumps. Otherwise, separate
// sentences.
//
// Returns an array of {text, highlight} segments. tplEffects is the parallel
// template effects array — passed through to describeEffect for the diff.
function describeEffectList(effects, cardName, tplEffects) {
  if (!Array.isArray(effects) || effects.length === 0) return [];
  const tplOf = i => (Array.isArray(tplEffects) ? tplEffects[i] : undefined);
  const parts = effects.map((e, i) => describeEffect(e, tplOf(i)));
  if (parts.length === 1) {
    return capitalizeSegs(parts[0]).concat(plainSeg('.'));
  }
  // Damage-only 2-effect: shared-subject style. Re-render directly so we can
  // intersperse the shared-subject prefix and the "and" connector around the
  // bumpable amounts.
  const allDamage = effects.every(e => e.kind === 'damage');
  if (allDamage && effects.length === 2) {
    const e0 = effects[0], e1 = effects[1];
    const tpl0 = tplOf(0), tpl1 = tplOf(1);
    const t0 = withFilter(targetPhrase(e0), e0);
    const t1 = withFilter(targetPhrase(e1), e1);
    const prefix = cardName ? cardName : 'This';
    const seg0 = (typeof e0.amount === 'object' && e0.amount && e0.amount.from)
      ? plainSeg(describeAmount(e0.amount))
      : bumpedSeg('amount', e0, tpl0);
    const seg1 = (typeof e1.amount === 'object' && e1.amount && e1.amount.from)
      ? plainSeg(describeAmount(e1.amount))
      : bumpedSeg('amount', e1, tpl1);
    if (e1.target === 'self') {
      return [
        plainSeg(prefix + ' deals '), seg0, plainSeg(' damage to ' + t0 + ' and '),
        seg1, plainSeg(' damage to you.'),
      ];
    }
    return [
      plainSeg(prefix + ' deals '), seg0, plainSeg(' damage to ' + t0 + ' and '),
      seg1, plainSeg(' damage to ' + t1 + '.'),
    ];
  }
  // Rummage / loot pattern: "draw N, then discard M".
  if (effects.length === 2
      && effects[0].kind === 'draw'
      && effects[1].kind === 'discard'
      && effects[1].target === 'self') {
    return capitalizeSegs(parts[0]).concat(plainSeg(', then ')).concat(parts[1]).concat(plainSeg('.'));
  }
  // Default: separate sentences. Capitalize the first segment of each part
  // and join with periods.
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out.push(plainSeg('. '));
    out.push(...capitalizeSegs(parts[i]));
  }
  out.push(plainSeg('.'));
  return out;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// capitalizeSegs: capitalize the very first character of the first
// non-empty segment. Used at sentence boundaries.
function capitalizeSegs(segs) {
  if (!segs || segs.length === 0) return segs;
  const out = segs.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i].text && out[i].text.length > 0) {
      out[i] = { text: capitalize(out[i].text), highlight: out[i].highlight };
      break;
    }
  }
  return out;
}

// triggerPreamble: render the "When/Whenever ..." prefix for a trigger.
// Branches on event + condId; falls back to generic phrasing if condId is
// unrecognized so we still emit something sensible.
function triggerPreamble(trig) {
  const ev = trig.event;
  const cid = trig.condId;
  const params = trig.params || {};
  // "this" triggers — singular, usually "When this <event>, ..."
  if (cid === 'thisEnters')  return 'When this enters the battlefield,';
  if (cid === 'thisDies')    return 'When this dies,';
  if (cid === 'thisAttacks') return 'When this attacks,';
  if (cid === 'thisKillsCreature') return 'Whenever a creature dealt damage by this dies,';
  if (cid === 'thisAttacksAfterOppLifeLoss') {
    return 'When this attacks, if an opponent has lost life this turn,';
  }
  // "another" triggers — plural-event, "Whenever another ..."
  if (cid === 'anotherCreatureYouEntersOfSubtype') {
    return 'Whenever another ' + (params.sub || 'creature') + ' enters under your control,';
  }
  if (cid === 'anotherCreatureYouEntersStrict') {
    return 'Whenever another creature enters under your control,';
  }
  if (cid === 'anotherCreatureDies') {
    return 'Whenever another creature dies,';
  }
  if (cid === 'creatureYouAttacksOfSubtype') {
    return 'Whenever a ' + (params.sub || 'creature') + ' you control attacks,';
  }
  if (cid === 'anyCardDies')    return 'Whenever a creature dies,';
  if (cid === 'youCastSpell')   return 'Whenever you cast a spell,';
  if (cid === 'youCastCounterspell') return 'Whenever you counter a spell,';
  if (cid === 'youGainLife')    return 'Whenever you gain life,';
  // Fallbacks by event alone.
  if (ev === 'cardEntersBattlefield') return 'When this enters the battlefield,';
  if (ev === 'cardDies')              return 'When this dies,';
  if (ev === 'attacks')               return 'When this attacks,';
  return 'Whenever a relevant event occurs,';
}

// describeTrigger: render a full trigger clause as segments. Returns
// segments so empower-bumped values inside trigger effects (e.g., a stapled
// Bolt's ETB damage) get highlighted along with the body. tplTrig is the
// corresponding template trigger for diff comparison.
function describeTrigger(trig, tplTrig) {
  const preamble = triggerPreamble(trig);
  const tplEffs = tplTrig ? tplTrig.effects : undefined;
  const body = describeEffectList(trig.effects || [], null, tplEffs);
  // body's first segment was capitalized for sentence-start; we want
  // sentence-mid since preamble ends in a comma. Lowercase the first letter
  // of the first non-empty segment.
  const bodyLower = body.slice();
  for (let i = 0; i < bodyLower.length; i++) {
    if (bodyLower[i].text && bodyLower[i].text.length > 0) {
      bodyLower[i] = {
        text: bodyLower[i].text[0].toLowerCase() + bodyLower[i].text.slice(1),
        highlight: bodyLower[i].highlight,
      };
      break;
    }
  }
  return [plainSeg(preamble + ' ')].concat(bodyLower);
}

// abilityCostPhrase: convert an ability's cost into a player-readable prefix
// like "{T}: " or "{R}: " or "Sacrifice this: ".
function abilityCostPhrase(cost) {
  if (!cost) return '';
  const parts = [];
  if (cost.tap) parts.push('{T}');
  if (cost.mana) {
    let s = '';
    for (const [color, n] of Object.entries(cost.mana)) {
      for (let i = 0; i < n; i++) s += '{' + color + '}';
    }
    if (s) parts.push(s);
  }
  if (cost.sacrifice) {
    parts.push('Sacrifice ' + (cost.sacrifice === 'self' ? 'this' : 'a ' + cost.sacrifice));
  }
  return parts.join(', ');
}

// describeAbility: "<cost>: <effect>." — activated ability format. Returns
// segments; the body's bumpable fields propagate through. tplAb is the
// corresponding template ability.
function describeAbility(ab, tplAb) {
  const cost = abilityCostPhrase(ab.cost);
  const tplEffs = tplAb ? tplAb.effects : undefined;
  let body = describeEffectList(ab.effects || [], null, tplEffs);
  // Strip the trailing period segment — caller adds it.
  if (body.length > 0 && body[body.length - 1].text === '.') {
    body = body.slice(0, -1);
  }
  if (!cost) return body;
  // Lowercase the first character of body since it follows a colon.
  if (body.length > 0) {
    for (let i = 0; i < body.length; i++) {
      if (body[i].text && body[i].text.length > 0) {
        body[i] = {
          text: body[i].text[0].toLowerCase() + body[i].text.slice(1),
          highlight: body[i].highlight,
        };
        break;
      }
    }
  }
  return [plainSeg(cost + ': ')].concat(body);
}

// describeStaticBuff: render a lord-style continuous ability.
// Shape: { filter, subtype, power, toughness, keywords }
//   "Other <subtype>s you control get +P/+T and have <kw1>, <kw2>."
// The subtype + filter combination determines the noun phrase. Most lords
// use filter:{controller:'self'} which means "you control". We always use
// "Other" since a creature can't buff itself via staticBuffs (self is
// excluded by the engine's lord logic).
function describeStaticBuff(buff) {
  const sub = buff.subtype ? buff.subtype + 's' : 'creatures';
  let scope;
  if (buff.filter && (buff.filter.controller === 'self' || buff.filter.controller === 'you')) {
    scope = 'Other ' + sub + ' you control';
  } else if (buff.filter && buff.filter.controller === 'opp') {
    scope = 'Other ' + sub + ' an opponent controls';
  } else {
    scope = 'Other ' + sub;
  }
  const stats = (buff.power || buff.toughness)
    ? 'get +' + (buff.power || 0) + '/+' + (buff.toughness || 0)
    : '';
  // Lookup display names so "firstStrike" → "first strike", etc.
  const kwDisplay = {
    flying: 'flying', vigilance: 'vigilance', trample: 'trample', haste: 'haste',
    firstStrike: 'first strike', doubleStrike: 'double strike', deathtouch: 'deathtouch',
    lifelink: 'lifelink', reach: 'reach', menace: 'menace', defender: 'defender',
    flash: 'flash', hexproof: 'hexproof', indestructible: 'indestructible',
  };
  const kwList = (buff.keywords && buff.keywords.length)
    ? buff.keywords.map(k => 'have ' + (kwDisplay[k] || k)).join(' and ')
    : '';
  let body;
  if (stats && kwList) body = scope + ' ' + stats + ' and ' + kwList;
  else if (stats)      body = scope + ' ' + stats;
  else if (kwList)     body = scope + ' ' + kwList;
  else                 return '';
  return body + '.';
}

// keywordPreamble: list intrinsic keywords as a leading sentence.
// "Flying. Vigilance. <rest of text>".
function keywordPreamble(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return '';
  // Map internal keyword IDs to display names (matches KEYWORD_DISPLAY).
  const display = {
    flying: 'Flying', vigilance: 'Vigilance', trample: 'Trample', haste: 'Haste',
    firstStrike: 'First strike', doubleStrike: 'Double strike', deathtouch: 'Deathtouch',
    lifelink: 'Lifelink', reach: 'Reach', menace: 'Menace', defender: 'Defender',
    flash: 'Flash', hexproof: 'Hexproof', indestructible: 'Indestructible',
  };
  return keywords.map(k => display[k] || (k[0].toUpperCase() + k.slice(1))).join(', ');
}

// describeCardText: top-level card text generator. Returns a flat string
// (suitable for storage in card.text and for logging/console output).
// Visual highlighting of empower-bumped values is the renderer's concern —
// it calls describeCardSegments instead.
function describeCardText(card) {
  return segsToText(describeCardSegments(card));
}

// describeCardSegments: like describeCardText but returns segments with
// `highlight` flags on values that differ from the template baseline.
// opts.skipKeywords skips the leading "Flying, Lifelink." preamble (for UI
// that shows keywords as badges).
function describeCardSegments(card, opts) {
  opts = opts || {};
  const tpl = CARDS[card.tplId] || card;
  if (tpl.customText === true || tpl.special === true) {
    return [plainSeg(card.text || tpl.text || '')];
  }
  // Resolve the template baseline used for empower diffing. Stapled cards
  // need the synthesized template (so the staple half's effects exist in
  // the baseline) — otherwise we'd be diffing against just the base and
  // bumped values on the staple side would silently fail to highlight.
  let tplBaseline = tpl;
  if (card.stapledFrom && typeof ENGINE !== 'undefined' && ENGINE.synthesizeStapledTemplate) {
    try {
      tplBaseline = ENGINE.synthesizeStapledTemplate(
        card.stapledFrom.baseTplId, card.stapledFrom.stapledTpls);
    } catch (e) {
      tplBaseline = tpl;
    }
  }
  // Each "section" emits a segment list; we join sections with a single
  // space segment.
  const sections = [];
  // Keyword preamble — skipped for renderers that show keywords as badges.
  if (!opts.skipKeywords && (card.type === 'Creature' || tpl.type === 'Creature')) {
    const kw = keywordPreamble(card.keywords || tpl.keywords || []);
    if (kw) sections.push([plainSeg(kw + '.')]);
  }
  // Modal vs top-level effects (mutually exclusive in current pool).
  if (card.effects && card.effects.modes) {
    sections.push(describeModalSegs(card.effects.modes, tplBaseline.effects && tplBaseline.effects.modes));
  } else if (Array.isArray(card.effects) && card.effects.length > 0) {
    const tplEffs = Array.isArray(tplBaseline.effects) ? tplBaseline.effects : undefined;
    sections.push(describeEffectList(card.effects, card.name || tpl.name, tplEffs));
  }
  // Static buffs (lords) — render before triggers.
  if (Array.isArray(card.staticBuffs)) {
    for (const buff of card.staticBuffs) {
      const phrase = describeStaticBuff(buff);
      if (phrase) sections.push([plainSeg(phrase)]);
    }
  }
  // Triggers — each is a self-contained sentence.
  if (Array.isArray(card.triggers)) {
    const tplTriggers = Array.isArray(tplBaseline.triggers) ? tplBaseline.triggers : [];
    for (let i = 0; i < card.triggers.length; i++) {
      const trig = card.triggers[i];
      const tplTrig = tplTriggers[i];
      sections.push(describeTrigger(trig, tplTrig));
    }
  }
  // Abilities.
  if (Array.isArray(card.abilities)) {
    const tplAbilities = Array.isArray(tplBaseline.abilities) ? tplBaseline.abilities : [];
    for (let i = 0; i < card.abilities.length; i++) {
      const ab = card.abilities[i];
      const tplAb = tplAbilities[i];
      const abSegs = describeAbility(ab, tplAb);
      sections.push(abSegs.concat(plainSeg('.')));
    }
  }
  // Drop empty sections; join with single-space separators.
  const nonEmpty = sections.filter(s => s && s.length > 0);
  if (nonEmpty.length === 0) {
    // No rules content. For non-skip-keywords callers, fall back to flavor
    // text (vanilla creatures whose only rules content is intrinsic keywords
    // would otherwise render blank). For skip-keywords callers, the flavor
    // text IS just the keyword preamble (e.g., "Flying" for Cloud Pegasus),
    // which is redundant with the badges they're showing — skip the fallback
    // and return empty.
    if (opts.skipKeywords) return [];
    const flavor = tpl.text || '';
    return flavor ? [plainSeg(flavor)] : [];
  }
  const out = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    if (i > 0) out.push(plainSeg(' '));
    out.push(...nonEmpty[i]);
  }
  return out;
}

// describeModalSegs: render a "Choose one — A; or B; or C." block as
// segments. tplModes is the parallel template modes array; per-mode tpl
// effects are passed through to describeEffectList for the empower diff.
function describeModalSegs(modes, tplModes) {
  const out = [plainSeg('Choose one — ')];
  for (let i = 0; i < modes.length; i++) {
    if (i > 0) out.push(plainSeg('; or '));
    const tplMode = Array.isArray(tplModes) ? tplModes[i] : undefined;
    let modeSegs = describeEffectList(modes[i], null, tplMode);
    // Strip trailing period (the final period is added at the end).
    if (modeSegs.length > 0 && modeSegs[modeSegs.length - 1].text === '.') {
      modeSegs = modeSegs.slice(0, -1);
    }
    // Lowercase the first character for "; or" continuation. The first mode
    // gets a sentence-start capital from the "Choose one — " prefix's
    // emphatic dash; all subsequent modes follow a "; or" connector and
    // should be lowercase.
    if (i > 0 && modeSegs.length > 0) {
      for (let j = 0; j < modeSegs.length; j++) {
        if (modeSegs[j].text && modeSegs[j].text.length > 0) {
          modeSegs[j] = {
            text: modeSegs[j].text[0].toLowerCase() + modeSegs[j].text.slice(1),
            highlight: modeSegs[j].highlight,
          };
          break;
        }
      }
    }
    out.push(...modeSegs);
  }
  out.push(plainSeg('.'));
  return out;
}

const ENGINE = (function() {

const COLORS = ['W','U','B','R','G'];

let G = null;
let nextIid = 1;
let listeners = [];

// PENDING_DECISIONS — registry of "player owes a decision" modal types.
// To add: add G.<field> to makeState, then add an entry here. whoHasPriority
// and step() pick it up automatically. `who` extractor handles the
// pendingTriggerTarget exception (uses .controller, not .who).
const PENDING_DECISIONS = [
  { field: 'forcedDiscard',        who: d => d.who,        active: d => d.remaining > 0 },
  { field: 'pendingSearch',        who: d => d.who,        active: () => true },
  { field: 'pendingTriggerTarget', who: d => d.controller, active: () => true },
  { field: 'pendingTriggerBuild',  who: d => d.who,        active: () => true },
  { field: 'pendingRipSelect',     who: d => d.who,        active: () => true },
  { field: 'pendingNumberChoice',  who: d => d.who,        active: () => true },
  { field: 'pendingSymmetricizeChoice', who: d => d.who,   active: () => true },
];

// True if `who` (typically 'you') is owed a decision by any open modal.
// Use this from any code that gates a specific player's action availability:
// priority checks, expected-actor queries, end-turn autopilot abort.
function playerOwesDecision(who) {
  for (const d of PENDING_DECISIONS) {
    const obj = G[d.field];
    if (obj && d.active(obj) && d.who(obj) === who) return true;
  }
  return false;
}

// True if any modal is open for any player. Use this from the phase machine
// (step) to pause the engine while a decision is outstanding — regardless of
// whether it's the player's or the AI's. The AI resolves its prompts via
// executeAction, which restarts step on completion.
function anyoneOwesDecision() {
  for (const d of PENDING_DECISIONS) {
    const obj = G[d.field];
    if (obj && d.active(obj)) return true;
  }
  return false;
}

// ----- Construction -----
// Deck entries are either a tplId string (opp, no stickers) or
// {tplId, stickers:[...]} (player, RUN-owned stickered slots).
// Deep-copy a card template's effects field. Handles both shapes:
//   - flat array (most cards): copy each effect object.
//   - modal {modeNames, modes}: copy modeNames array and deep-copy each mode.
// Used by makeCard at instance creation; per-instance isolation matters
// because Severity sticker mutates effect amounts in place.
function copyCardEffects(effects) {
  if (!effects) return undefined;
  if (Array.isArray(effects)) return effects.map(e => ({...e}));
  // Modal shape.
  return {
    modeNames: effects.modeNames ? effects.modeNames.slice() : undefined,
    modes: (effects.modes || []).map(m => m.map(e => ({...e}))),
  };
}

// Stapling: combine cards into one slot via stapledTpls. Engine sees the
// synthesized merged template and doesn't need to know about stapling. See
// canonicalSplicePair for the type-pair compatibility matrix.
//
// Multi-target slot remap: each staple's targeted effects get targetSlot +=
// (next-free-slot above base), preserving intra-staple slot sharing.
function synthesizeStapledTemplate(baseTplId, stapledTpls) {
  const baseTpl = CARDS[baseTplId];
  if (!baseTpl) throw new Error('Unknown card: ' + baseTplId);
  if (!stapledTpls || stapledTpls.length === 0) return baseTpl;
  // Walk the staples and merge step by step. We mutate a working copy.
  const merged = {
    name: baseTpl.name,
    type: baseTpl.type,
    sub: baseTpl.sub,
    art: baseTpl.art,
    text: baseTpl.text,
    cost: baseTpl.cost ? {...baseTpl.cost} : {},
    color: baseTpl.color,
    extraManaColors: (baseTpl.extraManaColors || []).slice(),
    keywords: (baseTpl.keywords || []).slice(),
    power: baseTpl.power,
    toughness: baseTpl.toughness,
    mana: baseTpl.mana,
    effects: copyCardEffects(baseTpl.effects),
    abilities: baseTpl.abilities ? baseTpl.abilities.map(ab => ({
      ...ab,
      cost: ab.cost ? {...ab.cost} : undefined,
      effects: (ab.effects || []).map(e => ({...e})),
    })) : undefined,
    triggers: (baseTpl.triggers || []).map(t => ({
      ...t,
      effects: (t.effects || []).map(e => ({...e})),
    })),
    staticBuffs: baseTpl.staticBuffs ? baseTpl.staticBuffs.map(b => ({...b})) : undefined,
    permanentEot: baseTpl.permanentEot,
    triggerPoolSeed: baseTpl.triggerPoolSeed,
    innate: baseTpl.innate,
    special: baseTpl.special,
    multiTarget: baseTpl.multiTarget,
    stapleable: baseTpl.stapleable,
    // Synthesized — marker that this template is a runtime synthesis, not
    // a CARDS entry. Used by makeCard to thread metadata to in-flight cards
    // (which preserve it as card.stapledFrom for downstream callers that
    // need to recover the merged baseline — empower target enumeration,
    // sticker eligibility checks, etc.).
    stapledFrom: { baseTplId, stapledTpls: stapledTpls.slice() },
  };
  for (const stapleTplId of stapledTpls) {
    const stapleTpl = CARDS[stapleTplId];
    if (!stapleTpl) continue;
    mergeStapleInto(merged, stapleTpl);
  }
  // Re-derive merged.color (primary, first in WUBRG order) and merged.colors
  // (full set in WUBRG order) from the now-merged cost. The primary color
  // matches the canonical convention used by annotateColors() — picked for
  // single-color CSS classes (col-W, col-U, etc.). The full set is what the
  // splice-picker tile uses to draw multi-color tiles.
  if (merged.cost) {
    const present = ['W','U','B','R','G'].filter(k => (merged.cost[k] || 0) > 0);
    merged.color = present[0] || baseTpl.color || null;
    merged.colors = present;
  }
  return merged;
}

// Append a clause to merged.text with a separating space.
function appendMergedText(merged, addition) {
  merged.text = (merged.text ? merged.text + ' ' : '') + (addition || '');
}

// Mutate `merged` in place to add the staple's costs, effects, and (for
// creature bases) ETB trigger. Helper — only called by
// synthesizeStapledTemplate.
function mergeStapleInto(merged, stapleTpl) {
  // Cost sum (per color including C).
  if (stapleTpl.cost) {
    for (const [k, v] of Object.entries(stapleTpl.cost)) {
      merged.cost[k] = (merged.cost[k] || 0) + v;
    }
  }
  // Merge cases by (base type, staple type). The check order matters
  // because earlier branches handle subsets:
  //   1. Creature + Creature: full body+ability merge.
  //   2. Creature + Land: land's mana production becomes a {tap}: addMana
  //      activated ability on the creature (Llanowar Elves shape).
  //   3. Creature + Spell: spell becomes ETB trigger on the creature.
  //   4. Land + Land: mana production merges (primary + extras).
  //   5. Land + Spell: spell becomes ETB trigger on the land.
  //   6. Spell + Land: spell gains an addMana effect for the land's color.
  //   7. Spell + Spell: effects concat with slot remap.
  // Forbidden (rejected by isCompatibleStaplePair, never reach here):
  //   - Spell + Creature (no clean interpretation)
  //   - Land + Creature (would need type-changing — out of scope)
  if (merged.type === 'Creature' && stapleTpl.type === 'Creature') {
    // Case 1: creature + creature.
    merged.power = (merged.power || 0) + (stapleTpl.power || 0);
    merged.toughness = (merged.toughness || 0) + (stapleTpl.toughness || 0);
    // Keywords: union with dedup.
    const stapleKws = stapleTpl.keywords || [];
    for (const kw of stapleKws) {
      if (!merged.keywords.includes(kw)) merged.keywords.push(kw);
    }
    // Subtype concat with dedup-by-token. Existing lord checks use substring
    // match on card.sub (e.g. card.sub.indexOf('Goblin') !== -1), so a
    // space-joined string covers the lookup. Dedup by splitting on whitespace
    // so 'Goblin' + 'Goblin' doesn't become 'Goblin Goblin'.
    const baseTokens = (merged.sub || '').split(/\s+/).filter(Boolean);
    const stapleTokens = (stapleTpl.sub || '').split(/\s+/).filter(Boolean);
    const mergedTokens = baseTokens.slice();
    for (const t of stapleTokens) {
      if (!mergedTokens.includes(t)) mergedTokens.push(t);
    }
    merged.sub = mergedTokens.join(' ');
    // Triggers, abilities, staticBuffs: concat with deep copy. Trigger
    // ordering preserved (base's first, then staple's) — matters for any
    // ordering-sensitive trigger logic, though there's no current example
    // where order changes outcomes.
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
    if (stapleTpl.staticBuffs) {
      if (!Array.isArray(merged.staticBuffs)) merged.staticBuffs = [];
      for (const b of stapleTpl.staticBuffs) {
        merged.staticBuffs.push({
          ...b,
          filter: b.filter ? {...b.filter} : undefined,
          keywords: b.keywords ? b.keywords.slice() : undefined,
        });
      }
    }
    // permanentEot: if either half has it, the merged creature does too.
    // (No current creature has permanentEot besides Elystra, who is
    // special and excluded — but be defensive for future cards.)
    if (stapleTpl.permanentEot) merged.permanentEot = true;
    // Synthesized text — concatenate base text and staple text.
    appendMergedText(merged, stapleTpl.text);
  } else if (merged.type === 'Creature' && stapleTpl.type === 'Land') {
    // Case 2: creature + land. Add a {tap}: addMana ability matching the
    // land's mana production. The creature can then be tapped for mana
    // like a Llanowar Elves. Tap-cost means it can't also attack the
    // same turn (one tap, one effect — engine enforces via card.tapped).
    if (!Array.isArray(merged.abilities)) merged.abilities = [];
    const colors = [stapleTpl.mana].concat(stapleTpl.extraManaColors || []).filter(Boolean);
    // The new ability mirrors the basic-land mana shape. If the land has
    // a single color, the ability adds that one color. If it has extras
    // (City of Brass), we encode each as a separate amounts entry — but
    // addMana takes one amounts object, not a list. For single-color
    // simplicity in v1, we add one ability with all colors in the same
    // amounts dict (which the engine reads as "produces all of these
    // simultaneously"). That's stronger than MtG's "pick one," but for
    // now the only multi-color land is City of Brass (special, never
    // a staple). Single-color lands are the common case.
    const amounts = {};
    for (const c of colors) amounts[c] = (amounts[c] || 0) + 1;
    merged.abilities.push({
      cost: { tap: true },
      effects: [{ kind: 'addMana', amounts }],
    });
    appendMergedText(merged, '{T}: Add {' + colors.join('}{') + '}.');
  } else if (merged.type === 'Creature') {
    // Case 3: creature + spell. The spell becomes an ETB trigger.
    const nextFreeSlot = computeNextFreeSlot(merged);
    const remapped = remapEffectSlots(stapleTpl.effects, nextFreeSlot);
    merged.triggers.push({
      event: 'cardEntersBattlefield',
      condId: 'thisEnters',
      text: 'ETB: ' + (stapleTpl.text || stapleTpl.name),
      effects: Array.isArray(remapped) ? remapped : [],
    });
    appendMergedText(merged, 'When this enters, ' + (stapleTpl.text || stapleTpl.name) + '.');
  } else if (merged.type === 'Land' && stapleTpl.type === 'Land') {
    // Case 4: land + land. Mana production merges. The base's primary
    // color stays; the staple's primary + extras get appended to extras.
    // Dedup so stapling Plains + Plains stays Plains (the staple is
    // wasted, but doesn't break anything).
    const staplerColors = [stapleTpl.mana].concat(stapleTpl.extraManaColors || []).filter(Boolean);
    for (const c of staplerColors) {
      if (c !== merged.mana && !merged.extraManaColors.includes(c)) {
        merged.extraManaColors.push(c);
      }
    }
    // Synthesized text reflects the new color set.
    const allColors = [merged.mana].concat(merged.extraManaColors);
    merged.text = '{T}: Add one of {' + allColors.join('}{') + '}.';
  } else if (merged.type === 'Land') {
    // Case 5: land + spell. Spell becomes ETB trigger on the land.
    // Same shape as creature + spell. Lands emit cardEntersBattlefield
    // when played (see line ~5593), so the trigger fires.
    const nextFreeSlot = computeNextFreeSlot(merged);
    const remapped = remapEffectSlots(stapleTpl.effects, nextFreeSlot);
    if (!Array.isArray(merged.triggers)) merged.triggers = [];
    merged.triggers.push({
      event: 'cardEntersBattlefield',
      condId: 'thisEnters',
      text: 'ETB: ' + (stapleTpl.text || stapleTpl.name),
      effects: Array.isArray(remapped) ? remapped : [],
    });
    appendMergedText(merged, 'When this enters, ' + (stapleTpl.text || stapleTpl.name) + '.');
  } else if (stapleTpl.type === 'Land') {
    // Case 6: spell + land. The spell gains an addMana effect — when it
    // resolves, you get one mana of the land's color (in addition to
    // whatever the spell normally does). The mana is added to the
    // caster's pool at resolution time, so it can be used by spells
    // resolving later in the same priority window.
    const colors = [stapleTpl.mana].concat(stapleTpl.extraManaColors || []).filter(Boolean);
    const amounts = {};
    for (const c of colors) amounts[c] = (amounts[c] || 0) + 1;
    if (!Array.isArray(merged.effects)) merged.effects = [];
    merged.effects.push({ kind: 'addMana', amounts, target: 'self' });
    appendMergedText(merged, 'Add {' + colors.join('}{') + '} to your mana pool.');
  } else {
    // Case 7: spell + spell. Effects concat with slot remap.
    const nextFreeSlot = computeNextFreeSlot(merged);
    const remapped = remapEffectSlots(stapleTpl.effects, nextFreeSlot);
    if (!Array.isArray(merged.effects)) merged.effects = [];
    if (Array.isArray(remapped)) {
      merged.effects = merged.effects.concat(remapped);
    }
    appendMergedText(merged, stapleTpl.text);
    merged.multiTarget = true;
  }
  // Synthesize name as the joined names. Keep simple; could be cuter later.
  merged.name = merged.name + ' + ' + stapleTpl.name;
  // Mark as multiTarget if any effects use targetSlot > 0.
  if (computeNextFreeSlot(merged) > 1) merged.multiTarget = true;
}

// Walk a card-shape (effects + triggers + abilities) and find the highest
// targetSlot in use. Returns max + 1 (the next free slot to assign).
// Defaults to 1 when no targeted effects exist (so the first staple's
// effects start at slot 1, leaving slot 0 to the base if it had targeted
// effects; harmless for non-targeted bases).
function computeNextFreeSlot(merged) {
  let maxSlot = -1;
  function visit(eff) {
    if (!eff) return;
    if (eff.target && eff.target !== 'self') {
      maxSlot = Math.max(maxSlot, eff.targetSlot || 0);
    }
  }
  if (Array.isArray(merged.effects)) merged.effects.forEach(visit);
  // Modal effects: walk all modes.
  if (merged.effects && merged.effects.modes) {
    merged.effects.modes.forEach(m => m.forEach(visit));
  }
  for (const t of (merged.triggers || [])) (t.effects || []).forEach(visit);
  for (const ab of (merged.abilities || [])) (ab.effects || []).forEach(visit);
  return maxSlot + 1;
}

// Deep-copy an effects array and rewrite each targeted effect's
// targetSlot by adding `offset`. Same-slot effects within the input
// stay grouped (their original slot value + offset preserves the
// grouping). Modal effects (object shape) are not supported as a
// staple half in v1 — this helper returns the input unchanged for
// modal shapes so the caller can detect and skip.
function remapEffectSlots(effects, offset) {
  if (!effects) return [];
  if (!Array.isArray(effects)) return effects;   // modal — caller handles
  return effects.map(e => {
    const copy = {...e};
    if (copy.target && copy.target !== 'self') {
      copy.targetSlot = (e.targetSlot || 0) + offset;
    }
    return copy;
  });
}

function makeCard(tplId, stickers, slotIdx, empowerRolls, permaBuffs, bonusTrigger, stapledTpls, subtypeRolls, slotMeta) {
  // Synthesize the template if the slot has staples. Otherwise look up the
  // base CARDS entry directly. stapledTpls is an array of tplIds to merge
  // into the base; absent/empty means a normal single-card slot.
  const tpl = (stapledTpls && stapledTpls.length > 0)
    ? synthesizeStapledTemplate(tplId, stapledTpls)
    : CARDS[tplId];
  if (!tpl) throw new Error('Unknown card: ' + tplId);
  const card = {
    iid: nextIid++,
    tplId,
    // Index into the owning player's deck array. For player, == runState.slots
    // index — used by run-persistent effects. For opp, transient.
    slotIdx: (typeof slotIdx === 'number') ? slotIdx : null,
    name: tpl.name, type: tpl.type, sub: tpl.sub, art: tpl.art, text: tpl.text,
    // Legendary: copied from template. Used for the cast-time uniqueness
    // check (you may not cast a legendary if you already control one
    // with the same tplId). No "legend rule" SBA — uniqueness is enforced
    // at cast time only.
    legendary: !!tpl.legendary,
    // cost: deep-copy — costReduction sticker mutates per-instance.
    cost: tpl.cost ? {...tpl.cost} : undefined,
    mana: tpl.mana, color: tpl.color,
    // extraManaColors: copy needed for City of Brass (template has 4 extras).
    // Was a long-standing bug pre-v0.99.44 — not copying made City of Brass
    // tap only for its primary color.
    extraManaColors: (tpl.extraManaColors || []).slice(),
    // keywords: copy so sticker keywords can be appended without leaking.
    keywords: (tpl.keywords || []).slice(),
    power: tpl.power, toughness: tpl.toughness,
    // effects/abilities/triggers/staticBuffs: deep-copy for per-instance
    // isolation (Severity sticker mutates effect amounts; future "loses all
    // abilities" effects might mutate ability lists). Modal cards have
    // effects shaped {modeNames, modes: [[...], [...]]} rather than a flat
    // array — handle both shapes.
    effects: copyCardEffects(tpl.effects),
    abilities: tpl.abilities ? tpl.abilities.map(ab => ({
      ...ab,
      cost: ab.cost ? {...ab.cost} : undefined,
      effects: (ab.effects || []).map(e => ({...e})),
    })) : undefined,
    staticBuffs: tpl.staticBuffs ? tpl.staticBuffs.map(b => ({
      ...b,
      filter: b.filter ? {...b.filter} : undefined,
      keywords: b.keywords ? b.keywords.slice() : undefined,
    })) : undefined,
    tapped: false, sick: false, damage: 0,
    tempPower: 0, tempTou: 0,    // EOT buffs — cleared at end of turn
    permPower: 0, permTou: 0,    // counters — reset on leave-play (death,
                                 // bounce, exile, library shuffle). Distinct
                                 // from run-persistent stickers (modifiers).
    dealtDeathtouch: false,
    // killedBy: player ('you'/'opp') whose action caused this card to die or
    // be exiled. Set by combat damage, damage effects, removeCreature
    // (destroy/exile), removeAll, edict, fightTarget. Read at death-emit
    // time to credit the killer for keyword claims (G[killer].claimedKeywords).
    // Last writer wins — approximation of "killer" since Magic has no such
    // concept. resetInPlayState clears this when a card returns to play
    // fresh (bounce, exile-until-EOT return).
    killedBy: null,
    cantAttack: false, cantBlock: false,
    // Source-iid sets for various restrictions/grants. Each granting source's
    // iid is added; clearRestrictionsFromSource walks these on leave-play.
    cantAttackBy: new Set(),
    cantBlockBy: new Set(),
    damagedBySources: new Set(),  // damage-this-turn — e.g. Sengir's trigger
    grantedBy: new Map(),         // kw → Set of source iids granting it
    eotGrants: [],                 // keywords granted until end of turn
                                   // (cleared in EOT cleanup pass)
    modifiers: [],
    stickers: (stickers || []).slice(),  // run-persistent
    // Empower rolls — parallel to occurrences of the 'empower' sticker in
    // `stickers`. The Nth 'empower' entry consumes the Nth roll. Each roll
    // is {location, subIdx, effIdx, modeIdx, field} as produced by
    // rollEmpowerTarget. Rolled at sticker-apply time (RUN.applyStickerToSlot)
    // so the bumped field is fixed for the run's duration. Saved/loaded.
    empowerRolls: (empowerRolls || []).slice(),
    // Subtype rolls — parallel to occurrences of the 'subtype' sticker in
    // `stickers`. The Nth 'subtype' entry consumes the Nth roll. Each
    // roll is a string like 'Goblin' or 'Wizard'. Rolled at sticker-apply
    // time so the granted subtype is fixed for the run's duration.
    subtypeRolls: (subtypeRolls || []).slice(),
    innate: false,                       // set by 'innate' sticker
    // triggers: deep-copy effects so per-effect mutations don't leak.
    triggers: (tpl.triggers || []).map(t => ({
      ...t,
      effects: (t.effects || []).map(e => ({...e})),
    })),
    // If this card was built from a stapled slot, preserve the synth metadata
    // so downstream code (empower target enumeration, sticker eligibility,
    // diagnostic dumps) can recover the full merged template baseline.
    // Set only when actually stapled — undefined for normal cards keeps the
    // field absent in JSON dumps.
    stapledFrom: tpl.stapledFrom,
  };
  // Balancer-boss persistent overrides: symmetricize (set p=t=cost.C=N),
  // colorOverride (set card.color), extraCost (+N to cost.C). Applied
  // BEFORE stickers/permaBuffs so those modifiers stack on the new baseline.
  applyBalancerOverrides(card, slotMeta);
  applyStickersToCard(card);
  // permaBuffs: slot-persistent buffs accumulated by permanentEot creatures
  // (Elystra). Applied via the shared helper so the same logic runs from
  // makeCard (game-init) AND from resetInPlayState (bounce/flicker recast,
  // where the existing card object needs permaBuffs re-applied after its
  // in-play state is stripped). Power/toughness flow into modifiers;
  // keywords get registered in grantedBy with synthetic source -1.
  if (permaBuffs) applyPermaBuffsToCard(card, permaBuffs);
  // bonusTrigger: a slot-persistent triggered ability appended to the card's
  // intrinsic triggers. Used by The Watcher's Gift boon (and any future
  // boon that attaches a trigger to an existing card). The trigger object
  // is stored as data — same shape as triggers in CARDS — so it survives
  // save/load and the LLM gamestate serializer can read it. The condId
  // form is required (closure form would not roundtrip through localStorage).
  // Applied AFTER the template's own triggers so any combat/trigger ordering
  // logic that walks card.triggers in order sees them in a stable position.
  if (bonusTrigger && typeof bonusTrigger === 'object') {
    if (!Array.isArray(card.triggers)) card.triggers = [];
    // Defensive deep-copy of effects (matches the template trigger copy
    // pattern above) — prevents accidental mutation of the slot-stored
    // trigger from in-game mutation of the card-bound copy.
    card.triggers.push({
      ...bonusTrigger,
      effects: (bonusTrigger.effects || []).map(e => ({...e})),
    });
  }
  // Regenerate card.text from effects/triggers/abilities. Empower stickers
  // have already mutated effect values (damage amounts, pump P/T, etc.) at
  // applyStickersToCard time, so the generated text reflects current state.
  // Cards with customText:true keep their hand-authored text — used for
  // Endomorph, Codex, Elystra, Steal where hand-tuned prose is needed.
  // Lands (no .effects, no .triggers, no .abilities) don't go through makeCard
  // for casting, but tokens and special cards do — describeCardText falls back
  // to the template text for empty results.
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
    name: tpl.name, type: tpl.type, sub: tpl.sub, art: tpl.art, text: tpl.text,
    cost: undefined,
    mana: undefined, color: tpl.color,
    extraManaColors: [],
    keywords: (tpl.keywords || []).slice(),
    power: tpl.power, toughness: tpl.toughness,
    effects: undefined,
    abilities: undefined,
    staticBuffs: undefined,
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

// "Intrinsic" keywords = template + stickers (NOT runtime grants). Used by
// clearRestrictionsFromSource to decide if a granted keyword survives the
// source leaving play.
function intrinsicKeywords(card) {
  if (card.isToken) {
    const tpl = TOKENS[card.tplId];
    return (tpl && tpl.keywords) ? tpl.keywords.slice() : [];
  }
  // Stapled-aware: a creature+creature staple may have keywords from BOTH
  // halves (e.g., Knight+Spirit gets first strike AND flying). Reading from
  // CARDS[card.tplId] would only see the base's keywords, leading
  // clearRestrictionsFromSource to incorrectly remove a granted keyword
  // that the staple half actually provides natively.
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


// Colors a land can produce when tapped. Returns [primary, ...extras] for
// stickered duals; just [primary] for normal lands. Used by canPayPotential,
// the tap action, and the AI's pickBestLand color-fixing.
function landProducibleColors(card) {
  if (card.type !== 'Land' || !card.mana) return [];
  const out = [card.mana];
  for (const c of (card.extraManaColors || [])) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

// Single source of truth for attack eligibility. Used by getLegalActions
// (engine), the UI's attacker click handler, and the AI's attacker chooser
// — anything that asks "can this creature attack right now?" goes through
// here. New attack restrictions (e.g., a future "Snow creatures can't
// attack" sticker) get added here once and propagate to all three.
function canCreatureAttack(card) {
  if (!card || card.type !== 'Creature') return false;
  if (card.tapped) return false;
  if (card.cantAttack) return false;                              // runtime restriction
  if ((card.keywords || []).includes('defender')) return false;   // keyword restriction
  if (card.sick && !(card.keywords || []).includes('haste')) return false;
  return true;
}
// Single source of truth for block eligibility (mirror of canCreatureAttack).
// `attacker` is optional — when provided, also checks attacker-vs-blocker
// constraints like flying/reach. Without it, just checks whether the
// creature is eligible to block at all.
function canCreatureBlock(card, attacker) {
  if (!card || card.type !== 'Creature') return false;
  if (card.tapped) return false;
  if (card.cantBlock) return false;
  if (!attacker) return true;
  // Unblockable: nothing blocks this attacker, period.
  if ((attacker.keywords || []).includes('unblockable')) return false;
  if ((attacker.keywords || []).includes('flying')
      && !(card.keywords || []).includes('flying')
      && !(card.keywords || []).includes('reach')) return false;
  return true;
}
function makePlayer(name, deck, ownerSide) {
  // ownerSide: 'you' or 'opp'. Stamped onto every spawned card as card.owner
  // so zone-routing (graveyard/hand/exile) can return cards to their owner
  // rather than their current controller. Matters when a card changes
  // controller mid-game (steal effects); for cards that never change
  // controller, owner === controller throughout the game and the routing
  // is a no-op. See moveToGraveyard / sacrificeCard / checkDeaths / bounce
  // / exile / flicker for the owner-routed sites.
  // deck: array of (string tplId) OR ({tplId, stickers}). Normalize.
  // We thread the deck-array index into each card as `slotIdx`. For the
  // player, this maps directly to runState.slots[i] — letting effects like
  // Endomorph's keyword-absorb apply persistent stickers to the right slot.
  // For the opponent, slotIdx points into a transient per-game array (opp's
  // deck is regenerated each game), so it's not useful for persistence. The
  // controller-side check happens in the effect handler, not here.
  const cards = deck.map((entry, i) => {
    if (typeof entry === 'string') return makeCard(entry, undefined, i, undefined, undefined);
    // Bonus trigger resolution: a slot can carry a fixed bonusTrigger
    // (Watcher's-Gift-style: locked at run-start), OR a triggerPool
    // (Mercurial-Adept-style: roll one fresh per game). Fixed bonus wins
    // if both are present (defensive — no current path produces both,
    // but if a future feature adds a "lock the trigger" mechanic, the
    // fixed value should override the rolling pool). When rolling from
    // the pool, deep-copy the chosen entry so per-game mutations don't
    // bleed back into slot.triggerPool.
    let bonus = entry.bonusTrigger;
    // Slot-level triggerPool (boon-injected, like the original Mercurial
    // Adept boon), OR template-level pool indicated by triggerPoolSeed
    // (drafted card with a built-in pool, like the regular-pool Adept).
    // Slot-level wins if both are present — boons are more specific than
    // templates.
    let pool = Array.isArray(entry.triggerPool) ? entry.triggerPool : null;
    if (!pool && !bonus) {
      const tpl = CARDS[entry.tplId];
      if (tpl && tpl.triggerPoolSeed === 'mercurial') {
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
    // Slot meta (Balancer-boss overrides): symmetricized/colorOverride/
    // extraCost. Carried as named fields on the slot entry so they
    // survive save/load alongside other slot meta.
    const slotMeta = {
      symmetricized: entry.symmetricized,
      colorOverride: entry.colorOverride,
      extraCost:     entry.extraCost,
    };
    return makeCard(entry.tplId, entry.stickers, i, entry.empowerRolls, entry.permaBuffs, bonus, entry.stapledTpls, entry.subtypeRolls, slotMeta);
  });
  // Stamp owner onto every card. makeCard doesn't know which side it's
  // spawning for (it's called from both deck construction paths plus reward
  // flows like clone), so we attach owner here at the deck-construction
  // boundary where the side is known.
  for (const c of cards) c.owner = ownerSide;
  // Stamp live charges from slot data, and rewrite hand-authored text to
  // surface remaining count (Stapler v1.0.54+). Template carries the
  // declarative "chargesAtRunStart" marker; the slot's actual count
  // (decremented on each use, persisted on slot.charges) is what we want
  // to show. Cards without chargesAtRunStart skip this entirely.
  for (let i = 0; i < deck.length; i++) {
    const entry = deck[i];
    const tplId = (typeof entry === 'string') ? entry : entry.tplId;
    const tpl = CARDS[tplId];
    if (!tpl || typeof tpl.chargesAtRunStart !== 'number') continue;
    const slotCharges = (typeof entry === 'object' && typeof entry.charges === 'number')
      ? entry.charges
      : tpl.chargesAtRunStart;
    const card = cards[i];
    card.chargesLeft = slotCharges;
    // Replace the static "3 charges (persist across runs)" prefix with a
    // live "N charges left." version. Heuristic: match the first sentence
    // ending with a period. If the template text doesn't follow this
    // pattern, leave it alone (defensive — future cards might use a
    // different text shape).
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
  // Forced-mulligan rule. If the opening hand has 0, 1, 6, or 7 lands, the
  // player is "mana-screwed" or "mana-flooded" badly enough that the game
  // is likely over before it starts. Reshuffle the drawn (non-innate)
  // portion into the library and redraw once. Innates stay in hand (they
  // bypass shuffling by design). Single mulligan only — if the redraw is
  // also 0/1/6/7 lands, the player keeps it. With 17 lands of 40 cards,
  // ~14% of opening hands trigger this; a second-tier bad-hand on the
  // redraw is ~2% and we accept it as variance.
  const isLand = c => {
    const tpl = CARDS[c.tplId];
    return tpl && tpl.type === 'Land';
  };
  const landCount = h => h.filter(isLand).length;
  const lc = landCount(hand);
  let mulliganed = false;
  if (lc <= 1 || lc >= 6) {
    // Put the drawn portion (non-innates) back into rest, reshuffle, redraw.
    const drawnPortion = hand.filter(c => !c.innate);
    rest.push(...drawnPortion);
    shuffle(rest);
    hand = innate.concat(rest.splice(0, drawNeeded));
    mulliganed = true;
  }
  return { name, life: 20, mana:{W:0,U:0,B:0,R:0,G:0,C:0},
           library: rest, hand, battlefield: [], graveyard: [], exile: [],
           landPlayedThisTurn: false,
           // Set to true if the opening-hand mulligan rule fired for this
           // player. Consumed by init() once to log the event, then ignored.
           // Doesn't persist past the init log line.
           mulliganed,
           // Slot indexes of cards this player actually played this game.
           // Populated in doPlayLand and doCastSpell. Snapshotted at game-end
           // into runState.lastPlayedSlotIdxs and consumed by the sticker-
           // reward filter — sticker rewards target only cards you played
           // (with a fallback to all slots when the set is empty, e.g.,
           // immediate concede). Slot indexes survive shuffles, bounces,
           // and recasts; a card played twice still counts once. Opponent's
           // set is populated for symmetry but not currently consumed —
           // useful for future "stickers based on what opp threatened"
           // mechanics if those ever land.
           playedSlotIdxs: new Set(),
           // Keywords claimed by killing/exiling opp's creatures this game.
           // Populated in checkDeaths and exile-effect paths when the dying
           // creature was opp's and was killed by player action. Snapshotted
           // at game-end as runState.lastClaimedKeywords; consumed by the
           // sticker-reward filter to restrict keyword stickers to keywords
           // the player actually fought against. The thematic intent: "you
           // claim the wings of the flying creature you killed." Non-keyword
           // stickers (stat boosts, cost reductions, empower) are unaffected
           // — those reward different design axes.
           claimedKeywords: new Set(),
           // Tracks total life lost this turn (resets at UNTAP). Used by
           // bloodlust-style triggers. Counts ACTUAL life decreases — if
           // Phylactery absorbs damage as slot rips, that doesn't count
           // as life loss here. Sum of decreases, not net (life gain
           // doesn't decrement this counter).
           lifeLostThisTurn: 0 };
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function makeState(playerDeck, oppDeck) {
  // Hard fail rather than silently fall back to a default deck. Earlier
  // versions had `playerDeck || DECK_PLAYER` here; that fallback was dead
  // code under normal play (every legitimate path goes through
  // RUN.startNextGame which always passes runState.slots), but it had
  // teeth: any future call to ENGINE.init() with no args would silently
  // boot a phantom default game. We caught a stale-cache bug that LOOKED
  // like the fallback was firing; replacing it with a throw means any
  // future regression is loud rather than mysterious.
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
    // Pending rip-select prompt — set when a "rip a permanent" effect
    // (Vile Edict and similar) targets a player. That player chooses one
    // of their own permanents to be ripped (destroyed + slot removed
    // from runState if the card has a persistent slot). {who, source}.
    // Player clicks a permanent → engine validates ownership → rip.
    pendingRipSelect: null,
    // Pending number-choice prompt — set when an effect needs the player
    // to pick a number from a fixed range (Archdemon of Bargains). State:
    // {who, source, min, max, sourceIid, callback?}. UI displays a number-
    // picker; AI auto-selects via decideNumberChoice. The source can read
    // the chosen number via its own continuation logic — currently bargain
    // resolution reads it directly from a field set by doNumberChoice.
    pendingNumberChoice: null,
    // Pending Symmetricize choice — the target creature's controller must
    // pick power/toughness/cost as the value that all three become.
    // {who, source, targetIid, targetName, targetSlotIdx, targetIsYours,
    //  values: {power, toughness, cost}}. The player clicks one of the
    //  three labeled buttons; engine applies the trio update.
    pendingSymmetricizeChoice: null,
    // Pending forced-discard prompt — set when an opponent's effect targets the player
    // for discard. {who:'you'|'opp', remaining:N}. Player chooses what to lose
    // (matches MtG: discarding player picks). For AI we still auto-pick.
    forcedDiscard: null,
    // Pending library search — set when a tutor-style effect needs the
    // player to pick a card from their library.
    // {who, filter:{type:'Creature'|...}, source}.
    pendingSearch: null,
    // Pending procedural-trigger build prompt — set when a card with the
    // buildOnDraw flag is drawn into the player's hand. The Codex (or any
    // future card with similar mechanics) generates 3 candidate triggers
    // and pauses the game until the player picks one (or "keep current").
    // {who, cardIid, options: [trigger,trigger,trigger], allowKeep: bool}.
    pendingTriggerBuild: null,
    // Pending trigger-target prompt — set when a player-controlled triggered
    // ability needs a target choice. {controller, sourceIid, sourceName,
    // trig, valid: [...targets]}. Player clicks a valid target → trigger
    // goes onto the stack with that target chosen.
    pendingTriggerTarget: null,
    // Triggered abilities waiting to go on the stack. Each entry:
    // {trigger, sourceIid, sourceName, controller, event, params}.
    // Drained at the next priority-round opening (see drainTriggers).
    pendingTriggers: [],
    // Sanity cap: how many trigger resolutions we allow in a single chain
    // before bailing. Protects against runaway loops from buggy cards.
    triggerChainDepth: 0,
    // Delayed triggers — scheduled to fire at a future event (currently
    // only 'endStep'). Each entry: {fireAt, fireFor, effect, controller,
    // sourceName, sourceIid, ...payload}. Processed during EOT cleanup.
    // Used by Otherworldly Journey-style "exile target, return EOT" effects.
    delayedTriggers: [],
    // End-turn auto-pass flag (controller-driven shortcut).
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

// Resolve a permanentOrSpell target into a uniform shape. Used by effects
// that accept either a battlefield permanent or a stack spell as their
// target (currently Stapler's applyInGameSplice and Steal). Returns:
//   { kind: 'perm', card, controller }                       — permanent
//   { kind: 'spell', card, controller, stackItem }           — spell on stack
//   null                                                      — target gone
//
// Permanent path looks up the card via findCard (any zone, but in practice
// the targeting layer only offers battlefield perms for this target type).
// Spell path verifies the stack item is still present — could have resolved
// or been countered between target lock-in and this effect's resolution.
// Stack triggers (item.kind === 'trigger') return null too: their target
// shape has no .card to operate on.
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
  // Defensive: called on real instances AND synthetic card-shaped objects
  // (template + stickers from reward UI). Templates lack runtime fields, and
  // synthetic shapes have stickers but no modifiers — honor both.
  let p = (card.power || 0) + (card.tempPower || 0) + (card.permPower || 0);
  let t = (card.toughness || 0) + (card.tempTou || 0) + (card.permTou || 0);
  if (Array.isArray(card.modifiers)) {
    for (const m of card.modifiers) { p += (m.power||0); t += (m.toughness||0); }
  } else if (Array.isArray(card.stickers)) {
    // Synthetic card-shaped object: derive stat bonuses from stickers directly.
    for (const sId of card.stickers) {
      const s = STICKERS[sId];
      if (s && s.kind === 'statBoost') {
        p += (s.power || 0); t += (s.toughness || 0);
      }
    }
  }

  // Static lord effects (continuous-effect layer, narrow scope).
  // A "lord" is any creature with a `staticBuffs` field — an array of
  // {filter, power, toughness} entries describing what OTHER creatures
  // it buffs while it's on the battlefield. Lords never buff themselves;
  // the iid !== card.iid check handles that. Mutual-tribe buffs work
  // naturally because each lord scans the other's buff list independently.
  //
  // Synthetic card objects (templates) skip this — they aren't on the
  // battlefield, so no lord can apply to them. We detect synthetic by
  // absence of an iid (real instances always have one assigned).
  if (card.iid != null && typeof G !== 'undefined' && G && G.you && G.you.battlefield) {
    const owner = findCard(card.iid);
    if (owner) {
      const allCreatures = [
        ...G.you.battlefield.map(c => ({ card: c, controller: 'you' })),
        ...G.opp.battlefield.map(c => ({ card: c, controller: 'opp' })),
      ];
      for (const { card: lord, controller: lordCtrl } of allCreatures) {
        if (!lord.staticBuffs || lord.iid === card.iid) continue;
        for (const buff of lord.staticBuffs) {
          // Filter is matched against the buffed card. controller:'self' on
          // the filter means "shares controller with the lord" — the
          // standard MTG "creatures you control" pattern.
          if (!matchFilter(card, buff.filter, owner.controller, lordCtrl)) continue;
          if (buff.subtype) {
            // Tribal lord: only buff cards whose sub field includes the
            // named subtype. Multi-word subs like "Cleric Wall" match
            // both "Cleric" and "Wall" via indexOf word-boundary.
            const sub = card.sub || '';
            const re = new RegExp('\\b' + buff.subtype + '\\b');
            if (!re.test(sub)) continue;
          }
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
  // Spells (sorcery / instant): purpose doesn't really matter — we score
  // by effects. Reuse the existing draft-style scoring.
  if (card.type === 'Sorcery' || card.type === 'Instant') {
    return spellValue(card);
  }
  if (card.type !== 'Creature') return 0;

  // Auto-derive in-game ctx if not supplied: when scoring an instance card
  // (has iid + controller, i.e. on the battlefield), look up its controller's
  // battlefield. This lets static-buff scoring use real tribe counts during
  // kill/bounce/sac targeting without every caller having to pass a ctx.
  // Note: in-game branch uses count+1.0 to forward-look — see staticBuffs loop.
  if (!ctx && card.iid != null && card.controller && typeof G !== 'undefined' && G[card.controller]) {
    ctx = { friendlyBattlefield: G[card.controller].battlefield };
  }

  const cost = costTotalCard(card);
  // Baseline efficiency: pow + tou should beat 2 * cost for "good" creatures.
  // Use getStats so permanent buffs (Sengir +1/+1, sticker modifiers) are
  // counted — a grown Sengir really is more valuable to kill than a fresh
  // one. getStats is defensive against both templates and instances.
  const [pow, tou] = getStats(card);
  let v = pow + tou - cost * 2;

  // Persistent keywords — same value regardless of purpose. These traits
  // matter as long as the creature is in play.
  const kw = card.keywords || [];
  // Body-scaled keyword values. Each keyword's bonus depends on what the
  // body brings to the table — flat bonuses misvalue 1/1 unblockables (clock
  // is small) and 5/5 vanilla finishers (no keyword love). See design doc.
  if (kw.includes('flying'))         v += 1 + pow * 0.5;          // floor + power-scaled damage delivery
  if (kw.includes('unblockable'))    v += 1.5 + pow * 0.75;       // strictly better evasion, ~1.5× flying
  if (kw.includes('reach'))          v += 1;                       // defensive utility, body-independent
  if (kw.includes('menace'))         v += 1 + pow * 0.3;          // half-evasion, scales w/ power
  if (kw.includes('trample'))        v += pow * 0.5;               // overkill carries with power
  if (kw.includes('lifelink'))       v += pow * 0.6;               // life gained = damage dealt
  if (kw.includes('vigilance'))      v += tou * 0.4;               // toughness-scaled defensive carryover
  if (kw.includes('haste'))          v += pow * 0.5;               // one extra turn of attacks ≈ power damage
  if (kw.includes('firstStrike'))    v += 2 + Math.max(0, (pow - tou) * 0.5);   // saves fragile attackers; floor +2
  if (kw.includes('deathtouch'))     v += 1 + Math.max(0, 4 - pow);             // inverse-power; 1/1 trades up, 5/5 doesn't care
  if (kw.includes('indestructible')) v += 1 + Math.max(0, 5 - tou);             // inverse-toughness; small bodies benefit most
  if (kw.includes('hexproof'))       v += 3;                       // categorical: priced in by opp's desire to remove

  // "Can't attack" — defender keyword OR runtime restriction (Bonds of
  // Faith, Bindspeaker ETB, etc). Both mean the same thing in practice;
  // unifying here avoids double-penalizing a defender with cantAttack on
  // top, AND ensures Bindspeaker'd creatures correctly drop in kill-value
  // (so the AI doesn't waste removal on a creature already neutered).
  // "Can't block" only comes from runtime restrictions; smaller penalty
  // because the creature still threatens us offensively.
  const cantAtk = kw.includes('defender') || !!card.cantAttack;
  const cantBlk = !!card.cantBlock;
  if (cantAtk && cantBlk) v -= 5;     // pacified — minimal threat
  else if (cantAtk) v -= 3;            // can still block but no offense
  else if (cantBlk) v -= 1;            // still attacks, just no defense

  // Triggered abilities — scored via the same effect-kind dispatch as
  // activated abilities (abilityValue), times a frequency multiplier that
  // depends on both the trigger's condId AND the scoring purpose:
  //
  // For 'draft' (acquiring the card — every trigger is future value):
  //   thisEnters:  ×1   (fires when you play it)
  //   thisDies:    ×1   (fires when it dies, ≤ 1 per copy)
  //   multiple:    ×2   (event-driven, fires repeatedly)
  //
  // For 'kill' (deciding what to destroy — value of denying future firings):
  //   thisEnters:  ×0   (already fired by the time it's on board)
  //   thisDies:    ×1   (still pending — killing it triggers, so denial=0;
  //                       BUT for kill purpose this is still a reason to be
  //                       wary, so keep ×1 to reflect "I'll have to deal
  //                       with this when it dies anyway")
  //   multiple:    ×2   (each future trigger is a real denial)
  //
  // For 'bounce' (returning to hand — opp gets to recast):
  //   thisEnters:  ×-1  (recasting RE-FIRES the ETB; bouncing is actively
  //                       bad on creatures with strong ETB triggers)
  //   thisDies:    ×0   (delays without denying)
  //   multiple:    ×1   (one fewer cycle of firings; net positive)
  function triggerFreq(condId, purpose) {
    const isOnce = condId === 'thisEnters' || condId === 'thisDies';
    if (purpose === 'kill') {
      if (condId === 'thisEnters') return 0;   // already fired
      if (condId === 'thisDies')   return 1;   // pending denial
      return 2;
    }
    if (purpose === 'bounce') {
      if (condId === 'thisEnters') return -1;  // recasting refires!
      if (condId === 'thisDies')   return 0;   // just a delay
      return 1;                                 // one cycle deferred
    }
    // draft (and any other purpose) — all future firings count
    return isOnce ? 1 : 2;
  }
  for (const trig of (card.triggers || [])) {
    const effs = trig.effects || [];
    if (!effs.length) continue;
    const perFiring = abilityValue({ effects: effs });
    v += perFiring * triggerFreq(trig.condId, purpose);
  }

  // Activated abilities — recurring threats. Same in both purposes (an
  // activated removal ability stays a threat as long as the creature lives,
  // and you DON'T want it to keep firing). Mana abilities are utility, less
  // urgent to remove.
  for (const ab of (card.abilities || [])) {
    v += abilityValue(ab);
  }

  // Static lord buffs — buffs to N other creatures. Value = (per-recipient
  // value) × (estimated recipient count).
  //
  // Per-recipient value reuses the body-scaled keyword formula at "typical
  // recipient power" (we use power=2 as a reasonable mid-curve estimate;
  // tribal lord recipients average around 2-power in this card pool). Stat
  // pumps add (p+t) directly per recipient.
  //
  // Estimated recipient count:
  //   - Draft ctx with picksSoFar: 0.5 × tribe_already_drafted + 0.1 × remaining_picks
  //     This rewards lord cards more once tribe density is high, while keeping
  //     them attractive early via the remaining_picks term.
  //   - In-game ctx with friendlyBattlefield: actual count of matching creatures
  //     on the battlefield under our control (excluding self).
  //   - No ctx: fall back to 2.0 (conservative mid-game baseline).
  //
  // typical recipient power for keyword-value math
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
      case 'firstStrike':    return 2;
      case 'deathtouch':     return 1 + Math.max(0, 4 - p);
      case 'indestructible': return 1 + Math.max(0, 5 - t);
      case 'hexproof':       return 3;
      default:               return 0;
    }
  }
  for (const buff of (card.staticBuffs || [])) {
    // Per-recipient value: stat pump (p+t) + each granted keyword's value
    // at the typical recipient body. Recipient body value is already on
    // the recipient itself; we're scoring only the buff's contribution.
    let perRecipient = (buff.power || 0) + (buff.toughness || 0);
    for (const gKw of (buff.keywords || [])) {
      perRecipient += keywordValueAtTypical(gKw);
    }
    // Estimated recipient count.
    let estCount = 2.0;   // fallback when no ctx provided
    if (ctx && Array.isArray(ctx.picksSoFar)) {
      // Draft context. Count tribe matches in picksSoFar (or all creatures
      // if the buff has no subtype filter). Future picks contribute 0.1 each.
      const totalPicks = ctx.totalPicks || 23;
      const remaining = Math.max(0, totalPicks - ctx.picksSoFar.length);
      let tribeSoFar = 0;
      for (const pid of ctx.picksSoFar) {
        const pc = CARDS[pid];
        if (!pc || pc.type !== 'Creature') continue;
        if (buff.subtype) {
          if (!pc.sub || pc.sub.indexOf(buff.subtype) === -1) continue;
        }
        tribeSoFar++;
      }
      estCount = 0.5 * tribeSoFar + 0.1 * remaining;
    } else if (ctx && Array.isArray(ctx.friendlyBattlefield)) {
      // In-game context. Count actual matching creatures on the battlefield
      // (excluding self — buffs target "other" creatures), plus a small
      // forward-looking term for creatures opp may play later. Without
      // knowing hand/library composition, +1.0 is a rough proxy for
      // "you'll see at least one more tribe member if you live a few turns."
      // This prevents the AI from underestimating a lord's value when its
      // tribe is currently empty on the board.
      let count = 0;
      for (const bc of ctx.friendlyBattlefield) {
        if (bc.iid === card.iid) continue;
        if (bc.type !== 'Creature') continue;
        if (buff.subtype) {
          if (!bc.sub || bc.sub.indexOf(buff.subtype) === -1) continue;
        }
        count++;
      }
      estCount = count + 1.0;
    }
    v += perRecipient * estCount;
  }

  return v;
}

// Value of a creature on board for sac decisions. Doesn't subtract cost
// (sunk) — measures threat presence. Used by edict and AI sac-cost scorer.
function sacValueOnBoard(card) {
  if (!card) return 0;
  const [pow, tou] = getStats(card);
  let v = pow + tou;
  const kw = card.keywords || [];
  // Body-scaled keyword values, ~75% of getCardValue's coefficients —
  // sacValueOnBoard measures board-presence threat (cost is sunk), not
  // card-acquisition value. Same shapes, smaller magnitudes.
  if (kw.includes('flying'))         v += 1 + pow * 0.4;
  if (kw.includes('unblockable'))    v += 1 + pow * 0.6;
  if (kw.includes('reach'))          v += 1;
  if (kw.includes('menace'))         v += 1 + pow * 0.2;
  if (kw.includes('trample'))        v += pow * 0.4;
  if (kw.includes('lifelink'))       v += pow * 0.5;
  if (kw.includes('vigilance'))      v += tou * 0.3;
  if (kw.includes('haste'))          v += pow * 0.4;
  if (kw.includes('firstStrike'))    v += 1 + Math.max(0, (pow - tou) * 0.4);
  if (kw.includes('deathtouch'))     v += 1 + Math.max(0, 3 - pow);   // smaller bodies trade up
  if (kw.includes('indestructible')) v += 1 + Math.max(0, 4 - tou);
  if (kw.includes('hexproof'))       v += 2;
  // Defender means the body can block but never attack — still has value
  // as a wall, but lower than a normal creature. The historical edict
  // helper went further and made defender a *negative* (encouraging the
  // chooser to gladly dump walls) but for sac-cost decisions a wall is
  // still worth keeping if it's holding back a threat. Tone down to 0.
  if (kw.includes('defender')) v -= 1;
  // Activated and triggered abilities matter — sacing your Lore Seeker to
  // pump a 1/1 Carrion Feeder by +1/+1 is bad. Reuse the same scoring as
  // getCardValue so the comparison is consistent across decision paths.
  for (const ab of (card.abilities || [])) v += abilityValue(ab);
  // Trigger value uses the same once/multiple frequency model as
  // getCardValue. Note: sacValueOnBoard runs in-game on existing
  // battlefield creatures, so "once" triggers (thisEnters) won't fire
  // again — we still credit a small value because losing the body
  // forfeits any in-flight triggers and forecloses re-flicker plays.
  const FREQ_ONCE = new Set(['thisEnters', 'thisDies']);
  for (const trig of (card.triggers || [])) {
    if (!trig.effects || !trig.effects.length) continue;
    const perFiring = abilityValue({ effects: trig.effects });
    // On board, thisEnters has already fired — score it at 0.3× as a
    // residual (flicker/re-enter plays). thisDies still pending — 1×.
    // Multiple-firing triggers continue to fire — 3×.
    let freq;
    if (trig.condId === 'thisEnters') freq = 0.3;
    else if (trig.condId === 'thisDies') freq = 1;
    else freq = 2;
    v += perFiring * freq;
  }
  return v;
}

// Score one activated ability on its own. Used by getCardValue and as a
// shared helper.
function abilityValue(ab) {
  if (!ab || !ab.effects || !ab.effects.length) return 0;
  const eff = ab.effects[0];
  switch (eff.kind) {
    case 'damage':         return 6 + (eff.amount || 0);   // burn ability scales with damage
    case 'removeCreature': {
      // Severity-graded value: tap is mild lockdown, exile is strict removal.
      const sev = eff.severity || 1;
      return sev === 1 ? 4 : sev === 2 ? 5 : sev === 3 ? 8 : 9;
    }
    case 'pump':           return 2 + (eff.power || 0) + (eff.toughness || 0);
    case 'addCounter':     return 3 + (eff.power || 0) + (eff.toughness || 0);   // permanent
    case 'addMana':        return 3;   // mana dork — utility, not a threat
    case 'draw':           return 4 + (eff.amount || 1) - 1;
    case 'discard':        return 3 + (eff.amount || 1) - 1;  // hand attack; per-card valuation matches draw
    case 'gainLife':       return 1 + (eff.amount || 0);
    case 'createTokens':   return 3 + (eff.count || 1) * 2;  // baseline; spellValue does full body-aware scoring
    default:               return 2;
  }
}

// Score a spell card (sorcery/instant) by its effects. Hoisted out of the
// old intrinsicCardValue so getCardValue can delegate cleanly.
function spellValue(card) {
  // For modal cards, return the MAX value across modes — the AI gets to
  // choose which mode to cast, so the card's value is whichever mode is best
  // in the current state. Non-modal cards are a single mode, so this just
  // scores the flat effect list.
  const modes = ENGINE.getModes ? ENGINE.getModes(card) : [card.effects || []];
  let bestModeValue = 0;
  for (const modeEffects of modes) {
    const v = spellValueForEffects(modeEffects);
    if (v > bestModeValue) bestModeValue = v;
  }
  if (card.type === 'Instant') bestModeValue += 1;   // flexibility premium
  return bestModeValue;
}
function spellValueForEffects(effects) {
  let v = 0;
  for (const e of (effects || [])) {
    if (e.kind === 'removeCreature') {
      // Severity grades the value: tap < bounce < destroy < exile.
      const sev = e.severity || 1;
      v += sev === 1 ? 3 : sev === 2 ? 4 : sev === 3 ? 12 : 12;
    }
    else if (e.kind === 'damage') v += 6 + (e.amount || 0);
    else if (e.kind === 'damageAll') v += 8 + (e.amount || 0) * 2;  // hits every creature; scales with damage
    else if (e.kind === 'removeAll') {
      // Unified mass removal — severity grades the value, whose:'opp'
      // bumps it (asymmetric blowouts are stronger than symmetric).
      const sev = e.severity || 3;
      const sevVal = sev === 1 ? 4 : sev === 2 ? 8 : sev === 3 ? 10 : 14;
      v += sevVal + ((e.whose === 'opp') ? 4 : 0);
    }
    else if (e.kind === 'edict') v += 7;     // forced-sac removal that bypasses hexproof; less than destroy because chooser picks lowest
    else if (e.kind === 'sacrifice') v += 0;  // depends on context — usually paired as a cost or part of a larger combo, not standalone
    else if (e.kind === 'counter') v += 8;
    else if (e.kind === 'steal') v += 16;        // destroy + permanent gain to caster, with cross-game slot retention. Strictly better than removal.
    else if (e.kind === 'gainControl') {
      // Mind Control shape (no duration): in-game destroy + caster gains
      // the creature for this game. Slot reverts cross-game (unlike steal).
      // ~destroy × 1.5. Threaten shape (duration:'eot') is "1 turn of swings
      // using their best creature" — modest tempo bump above pump.
      if (e.duration === 'eot') v += 6;
      else v += 14;
    }
    else if (e.kind === 'applyInGameSplice') v += 18;  // 2-for-1 cross-owner: opponent loses BOTH inputs to caster's pool, with cross-game retention. Dominates steal (16) because it consumes a second input.
    else if (e.kind === 'noop') v += 0;  // marker effect, no value
    else if (e.kind === 'shuffleIntoLibrary') v += 5;  // between bounce (4) and destroy (12); harder to recover than bounce, easier than destroy
    else if (e.kind === 'weaken') v += 3 + (e.toughness || 0);  // small if -1/-1, real removal if -3/-3 etc; scales like a conditional destroy
    else if (e.kind === 'returnFromGraveyard') v += 4;  // value depends on what's in graveyard at cast time; baseline ≈ a card draw, scales via target scoring
    else if (e.kind === 'ripPermanent') v += 14;  // edict-shape (target picks low value), but RIPS the slot — destroys AND removes from run permanently. Worse than steal for caster (caster gains nothing) but devastating for victim. Score above edict (7), below steal (16) — closer to destroy+exile combined.
    else if (e.kind === 'destroyAndStickerSlot') v += 13;  // destroy (12) + persistent sticker that haunts the creature's slot forever. Slightly above bare destroy. Real value swings on the sticker — for 'scarified' it's 1 life per recast which compounds.
    else if (e.kind === 'symmetricize') v += 8;  // controller picks favorable value → typically modest in-game impact; but locks the slot's stats/cost forever. Symmetrical (player picks, so often beneficial to player); slightly above bounce, well below destroy.
    else if (e.kind === 'embargo') v += 6;  // bounce (4) + cost+1 forever — closer to a hard removal once the cost-stacking matters, but the creature returns immediately, so tempo is positive for the victim
    else if (e.kind === 'bleach') v += 8;  // exile (>destroy) + colorless forever. Colorless is mostly aesthetic in current game state (few color-matters effects), so scored close to bare exile.
    else if (e.kind === 'draw') v += (e.amount || 1) * 3;
    else if (e.kind === 'discard') v += 4;
    else if (e.kind === 'gainLife') v += 1;
    else if (e.kind === 'flicker') v += 4;  // re-fires ETB (card-draw value), dodges removal, resets damage; effective value depends on target — base 4 covers the "re-trigger Wall of Omens" line
    else if (e.kind === 'exileUntilEOT') v += 5;  // tempo removal — one turn off the board, dodges combat. Slightly better than flicker because it can hit opp creatures.
    else if (e.kind === 'pump') v += 2;
    else if (e.kind === 'pumpAllYours') v += 8;
    else if (e.kind === 'grantKeyword') {
      // Single-target permanent grant (Sky Champion-shape on a spell): ~3.
      // Single-target EOT: ~2 (combat trick, situational).
      // Mass yours EOT (Overrun-shape): ~6 — explosive when paired with pump,
      // smaller standalone since you only get the alpha-strike turn.
      // Mass symmetric: 0 (rarely useful — both sides benefit).
      const eot = e.duration === 'eot';
      const mass = e.whose === 'allYours' || e.whose === 'all';
      if (e.whose === 'all') v += 0;
      else if (mass) v += eot ? 6 : 8;  // mass permanent grant is rare but powerful
      else v += eot ? 2 : 3;
    }
    else if (e.kind === 'createTokens') {
      // Token value scales with count × stats × keyword weight. A 1/1 vanilla
      // is worth ~2 (chump blocker, slot of damage). Flying or haste roughly
      // doubles it. Three 1/1 spirits with flying = 3 × 4 = 12, putting
      // Spectral Procession in destroyAll territory — accurate, that card
      // wins games.
      const tpl = TOKENS[e.tokenId];
      if (tpl) {
        const stat = (tpl.power || 0) + (tpl.toughness || 0);
        const kwBonus = (tpl.keywords || []).reduce((s, k) => s +
          ({flying: 2, haste: 2, lifelink: 2, deathtouch: 2, trample: 1, vigilance: 1, menace: 1, reach: 1}[k] || 0), 0);
        const perToken = stat + kwBonus;
        v += (e.count || 1) * perToken;
      }
    }
    else if (e.kind === 'addMana') v += 3;
    else if (e.kind === 'searchCreature' || e.kind === 'searchLandTapped') v += 4;
    else if (e.kind === 'restrict') v += 6;
    else if (e.kind === 'fightTarget') v += 5;
  }
  return v;
}

// ----- Mana -----
function canPayFromPool(pool, cost) {
  if (!cost) return true;
  const m = {...pool};
  for (const c of COLORS) if ((cost[c]||0) > (m[c]||0)) return false;
  for (const c of COLORS) m[c] -= (cost[c]||0);
  return ((m.W||0)+(m.U||0)+(m.B||0)+(m.R||0)+(m.G||0)+(m.C||0)) >= (cost.C||0);
}
// Compute total static cost bump from all battlefield permanents with a
// staticCostBump field on their template (City Guardian: +1 per copy,
// global — affects both players). Symmetric: each copy of City Guardian
// bumps EVERY spell's cost by its declared amount, regardless of which
// side cast it. Lands are excluded automatically (you don't "cast" a
// land — it doesn't route through this code).
//
// Returns an integer amount to add to the cost's generic (C) component.
// Most spells have a "1 more" aura but the API is N-flexible.
function totalStaticCostBump() {
  let bump = 0;
  for (const side of ['you', 'opp']) {
    for (const c of G[side].battlefield) {
      const tpl = CARDS[c.tplId];
      if (tpl && typeof tpl.staticCostBump === 'number') {
        bump += tpl.staticCostBump;
      }
    }
  }
  return bump;
}

// Return the effective cost for casting `card` — base cost + global static
// bumps (City Guardian). The returned object is a copy; mutations don't
// leak back into the card. Lands have cost = 0/undefined so the bump is
// effectively a no-op for them (they don't go through this path anyway).
function effectiveCastCost(card) {
  if (!card.cost) return card.cost;
  const bump = totalStaticCostBump();
  if (bump === 0) return card.cost;
  const cost = {...card.cost};
  cost.C = (cost.C || 0) + bump;
  return cost;
}

// True iff `who` can pay `cost` from current pool + untapped mana sources,
// considering that dual-typed lands can be tapped for one of their colors.
// Uses backtracking over dual-land color choices; mono lands fold directly
// into the pool. For typical games (≤3 duals), the search is trivial.
function canPayPotential(who, cost) {
  if (!cost) return true;
  // Start from current pool.
  const pool = {...G[who].mana};
  // Build source list: each entry is a list of colors the source can produce.
  // Mono sources fold directly into the pool (no choice). Multi-color sources
  // (stickered duals) become choice points.
  const choices = [];
  for (const c of G[who].battlefield) {
    if (c.tapped) continue;
    let producible = null;
    if (c.type === 'Land') {
      producible = landProducibleColors(c);
    } else if (c.abilities && !c.sick) {
      // Scan all abilities for the first mana ability (v1.0.64). Stapled
      // creature+land merges put the addMana ability at index >= 1 since
      // the base creature's abilities come first in the array.
      const manaAb = c.abilities.find(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana');
      if (!manaAb) continue;
      const am = manaAb.effects[0].amounts;
      const ks = Object.keys(am);
      // For mana dorks producing a single color with amount 1 we can model as
      // a choice; multi-color or amount>1 dorks fold into pool directly.
      if (ks.length === 1 && am[ks[0]] === 1) {
        producible = [ks[0]];
      } else {
        for (const k of ks) pool[k] = (pool[k] || 0) + am[k];
        continue;
      }
    } else continue;
    if (producible.length === 1) {
      pool[producible[0]] = (pool[producible[0]] || 0) + 1;
    } else {
      choices.push(producible);
    }
  }
  // Backtrack over multi-choice sources.
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
function payMana(who, cost) {
  // Auto-tap-as-fallback: pay from pool first; if short, tap untapped sources to cover.
  if (!cost) return;
  const p = G[who];
  // If pool already covers it, just deduct.
  if (canPayFromPool(p.mana, cost)) { deductFromPool(p.mana, cost); return; }
  // Else tap sources. Prefer color sources for color costs.
  const need = {...cost};
  // First satisfy colored costs
  for (const c of COLORS) {
    while ((need[c]||0) > 0) {
      if ((p.mana[c]||0) > 0) { p.mana[c]--; need[c]--; continue; }
      if (!tapSourceProducing(who, c)) {
        throw new Error('Mana payment failed (color): ' + c);
      }
      // After tap, that color went up by 1; deduct.
      p.mana[c]--; need[c]--;
    }
  }
  // Then satisfy generic
  let generic = need.C || 0;
  while (generic > 0) {
    // Use any colored mana left
    let used = false;
    for (const c of [...COLORS, 'C']) {
      if ((p.mana[c]||0) > 0) { p.mana[c]--; generic--; used = true; break; }
    }
    if (used) continue;
    // Need to tap something
    if (!tapSourceProducing(who, null)) throw new Error('Mana payment failed (generic)');
    // After tap, some color went up; loop will use it.
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
function tapSourceProducing(who, color) {
  // Find untapped source that produces `color`. If color is null, any source.
  // Preference order:
  //   1. Mono-color lands (no opportunity cost, no flexibility loss)
  //   2. Dual-typed lands that produce this color
  //   3. Creature mana abilities (creatures could attack/block instead)
  // Among duals, prefer one whose extra colors are LEAST useful elsewhere
  // (heuristic: fewer extra colors = less flex sacrifice). Currently all
  // duals have exactly one extra color, so this is a simple loop.
  const lands = G[who].battlefield.filter(c => c.type === 'Land' && !c.tapped);
  // Pass 1: mono lands matching exactly.
  for (const c of lands) {
    if ((c.extraManaColors || []).length === 0
        && (color === null || c.mana === color)) {
      c.tapped = true; G[who].mana[c.mana]++;
      return true;
    }
  }
  // Pass 2: dual lands that produce the target color.
  if (color !== null) {
    for (const c of lands) {
      if ((c.extraManaColors || []).length > 0
          && landProducibleColors(c).includes(color)) {
        c.tapped = true; G[who].mana[color]++;
        return true;
      }
    }
  } else {
    // Color-agnostic fallback for generic mana — pick the dual's primary.
    for (const c of lands) {
      if ((c.extraManaColors || []).length > 0) {
        c.tapped = true; G[who].mana[c.mana]++;
        return true;
      }
    }
  }
  // Pass 3: creature mana abilities. v1.0.64: scan all abilities (was [0] only).
  for (const c of G[who].battlefield) {
    if (c.tapped) continue;
    if (c.sick || !Array.isArray(c.abilities)) continue;
    const manaAb = c.abilities.find(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana');
    if (!manaAb) continue;
    const am = manaAb.effects[0].amounts;
    const produces = Object.keys(am)[0];
    if (color === null || produces === color) {
      c.tapped = true;
      for (const k of Object.keys(am)) G[who].mana[k] += am[k];
      return true;
    }
  }
  return false;
}

// ----- Effects -----

// Apply `amt` damage from source to target. Respects deathtouch (flag for
// checkDeaths), lifelink (source controller gains life), trample. Source from
// ctx.sourceCard (stack) or findCard(ctx.sourceIid) (battlefield).
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
    // Trample on non-combat damage: lethal-damage-needed for this creature
    // is (toughness − damage already marked). Excess damage spills to that
    // creature's controller. Indestructibles still absorb up to lethal so
    // overkill carries — same model as combat trample (v0.66).
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
    // Tag killer for keyword-claim attribution.
    f.card.killedBy = ctx.controller;
    // Track which source dealt damage — used by Sengir-style triggers
    // ("whenever a creature dealt damage by ~ this turn dies"). Only
    // meaningful when the source is a creature on the battlefield.
    if (sourceCard && sourceCard.type === 'Creature') {
      if (!(f.card.damagedBySources instanceof Set)) f.card.damagedBySources = new Set();
      f.card.damagedBySources.add(sourceCard.iid);
    }
    log(`${ctx.sourceName} deals ${toCreature} to ${f.card.name}.`, 'dmg');
    if (spill > 0) {
      // Spill to the creature's controller via damagePlayer so Phylactery
      // can intercept overflow. The "tramples" log is preserved for flavor;
      // damagePlayer adds its own deals-damage line as well.
      damagePlayer(f.controller, spill, `${ctx.sourceName} (trample)`);
    }
  }
  if (hasLifelink) {
    G[ctx.controller].life += amt;
    log(`${ctx.sourceName} (lifelink) — ${pname(ctx.controller)} gains ${amt} life.`, 'sp');
    // Lifelink life gain fires lifeGained, just like the gainLife effect.
    // Ajani's Pridemate-style triggers care about ANY life gain, regardless
    // of whether it came from a spell, lifelink combat damage, or other.
    // sourceIid identifies which card produced the life gain — used by
    // triggers that opt out of firing on their own effects (Codex-style
    // self-cascade prevention).
    emit({type: 'lifeGained', who: ctx.controller, amount: amt, sourceIid: ctx.sourceIid});
  }
}

// =========================================================================
// EFFECTS TABLE — dispatch from {kind: 'foo', ...} to handler.
// TODO (impact/cost order): flicker (immediate), modal spells, cycling,
// EOT-flicker (Restoration Angel), proliferate (real counter objects).
// Lower: protection, full reanimate, storm/cascade, damage prevention.
// =========================================================================
const EFFECTS = {
  damage(ctx, params, target) {
    applyDamageFrom(ctx, target, params.amount);
  },
  pump(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    f.card.tempPower += (params.power||0);
    f.card.tempTou += (params.toughness||0);
    log(`${f.card.name} gets +${params.power}/+${params.toughness} EOT.`, 'sp');
  },
  // Black's debuff. Negative tempPower/tempTou — cleared at EOT. If toughness
  // hits 0, SBA kills the creature regardless of damage; indestructible saves.
  weaken(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    f.card.tempPower -= (params.power||0);
    f.card.tempTou -= (params.toughness||0);
    log(`${f.card.name} gets -${params.power}/-${params.toughness} EOT.`, 'sp');
  },
  // +1/+1 counter on target. Persists while card is on battlefield; resets
  // on leave-play (death/bounce/exile/library). Stored as permPower/permTou
  // (a stat sum, not discrete counter objects) — simple but sufficient for
  // current cards. If proliferate/remove-counter ever ships, replace with
  // a real counter list without changing card definitions.
  addCounter(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const p = params.power || 0;
    const t = params.toughness || 0;
    f.card.permPower += p;
    f.card.permTou += t;
    // MtG convention: "+X/+X counter" (equal P/T); fall back to "counters"
    // for the rare unequal case.
    if (p === t) {
      log(`Put a +${p}/+${t} counter on ${f.card.name}.`, 'sp');
    } else {
      log(`Put +${p}/+${t} counters on ${f.card.name}.`, 'sp');
    }
  },
  // Endomorph: absorb a keyword from a slain victim, OR grow +1/+1 if no
  // novel keyword exists. Persists across games via slot sticker.
  // Reads target.iid (Endomorph) and ctx.event.card (victim).
  // "Novel" excludes keywords Endomorph has + 'defender' (downside).
  // Auto-picks highest KEYWORD_PRIORITY when multiple novel — v2 will prompt.
  endomorphAbsorb(ctx, params, target) {
    const KEYWORD_PRIORITY = {
      flying: 4, indestructible: 4,
      lifelink: 3, deathtouch: 3, hexproof: 3, trample: 3,
      haste: 2, vigilance: 2, firstStrike: 2, flash: 2,
      reach: 1, menace: 1,
      // defender intentionally absent.
    };
    const f = findCard(target.iid);
    // Endomorph might have died in the same combat damage step that triggered
    // this effect. The source instance is gone from the battlefield, but the
    // dead card object still lives in a graveyard — and we can mutate it so
    // the player sees the absorbed reward on the corpse.
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
    // Whichever instance we found (live on battlefield or dead in graveyard)
    // is the one to mutate for in-game visibility. Live: badges show on the
    // battlefield card. Dead: badges show on the graveyard corpse so the
    // player sees their reward was earned, even if Endomorph died killing it.
    const inGameTarget = sourceCard || deadCard;
    const novel = (victim.keywords || [])
      .filter(kw => kw !== 'defender' && !sourceKeywords.has(kw));
    // Pick: 0 → fallback +1/+1; ≥1 → highest priority keyword (auto-pick v1).
    let absorbed = null;
    if (novel.length > 0) {
      novel.sort((a, b) => (KEYWORD_PRIORITY[b] || 0) - (KEYWORD_PRIORITY[a] || 0));
      absorbed = novel[0];
    }
    // Apply persistence (slot sticker) — only meaningful when the source has
    // a slot in runState (player-controlled, runState exists).
    const canPersist = (ctx.controller === 'you')
      && (slotIdx != null)
      && (typeof RUN !== 'undefined' && RUN.applyStickerToSlot);
    if (absorbed) {
      const stickerId = 'kw_' + absorbed;
      if (canPersist) RUN.applyStickerToSlot(slotIdx, stickerId);
      // In-game updates so the absorb is visible AND usable RIGHT NOW
      // (without these the player would have to wait until next game):
      //   - keywords array: makes the keyword mechanically active.
      //   - stickers array: makes the gold sticker badge appear on the card.
      // RUN.applyStickerToSlot persists this across games via runState; we
      // mirror those changes onto the in-game instance here. Whether the
      // card is alive or in the graveyard, the player sees the trophy.
      if (inGameTarget) {
        if (!inGameTarget.keywords.includes(absorbed)) inGameTarget.keywords.push(absorbed);
        if (!inGameTarget.stickers.includes(stickerId)) inGameTarget.stickers.push(stickerId);
      }
      log(`${ctx.sourceName} absorbs ${absorbed} from ${victim.name}.`, 'sp');
    } else {
      // Fallback: no novel keyword. Grow +1/+1 permanently via slot sticker
      // — distinct from addCounter (counters reset on leave-play; this
      // persists across games via the slot sticker).
      const stickerId = 'plus1plus1';
      if (canPersist) RUN.applyStickerToSlot(slotIdx, stickerId);
      // In-game updates: push a modifier (so getStats reflects the buff)
      // AND push the sticker id (so the badge appears). Stackable sticker —
      // each absorb adds another instance. Applied to live OR dead instance
      // so a 2/2 Endomorph that mutual-killed a 2/2 visibly shows the +1/+1
      // earned, even sitting in the graveyard.
      if (inGameTarget) {
        inGameTarget.modifiers.push({ power: 1, toughness: 1 });
        inGameTarget.stickers.push(stickerId);
      }
      log(`${ctx.sourceName} eats ${victim.name} and grows +1/+1.`, 'sp');
    }
  },
  // Unified creature-removal effect. `severity` controls the depth of removal:
  //   1 = tap         (creature taps; recovers next untap)
  //   2 = bounce      (returns to owner's hand; resets state)
  //   3 = destroy     (graveyard; blocked by indestructible)
  //   4 = exile       (out of play; bypasses indestructible)
  // Composed this way so the Severity sticker can escalate one tier per stack.
  removeCreature(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const sev = Math.max(1, Math.min(4, params.severity || 1));

    if (sev === 1) {
      f.card.tapped = true;
      log(`${ctx.sourceName} taps ${f.card.name}.`, 'sp');
      return;
    }

    if (sev === 2) {
      // Bounce. Pull from battlefield, reset all in-play state, send to hand.
      // Tokens cease to exist instead of going to hand (they have no library
      // to be cast from again).
      const card = pluckFromBattlefield(f);
      if (!card) return;
      // Flush permanentEot buffs (Elystra) before resetInPlayState clears
      // tempPower/tempTou/eotGrants. Standard MtG would lose the EOT pump
      // on bounce, but Elystra's flavor is "EOT effects last forever" — and
      // letting bounce strip her accumulated buffs would make bounce a hard
      // counter to her core mechanic. The buffs were earned this turn;
      // they belong on the slot regardless of whether she stays on the
      // battlefield. Non-Elystra creatures bounce normally (the helper
      // no-ops without the permanentEot template flag).
      leavesPlayPreservingBuffs(card);
      if (!card.isToken) {
        // Owner-routed — stolen creature bounced returns to original
        // owner's hand, not the thief's. See moveToGraveyard for the
        // routing pattern.
        G[card.owner || f.controller].hand.push(card);
        log(`${ctx.sourceName} returns ${card.name} to hand.`, 'sp');
      } else {
        log(`${ctx.sourceName} returns ${card.name} — token ceases to exist.`, 'sp');
      }
      emitLeavesBattlefield(card, f.controller);
      return;
    }

    if (sev === 3) {
      // Destroy. Indestructible blocks at this tier specifically.
      if (f.card.keywords.includes('indestructible')) {
        log(`${f.card.name} is indestructible — ${ctx.sourceName} fizzles.`, 'sp');
        return;
      }
      // Tag killer before moveToGraveyard so the dies-emit carries the credit.
      f.card.killedBy = ctx.controller;
      moveToGraveyard(f.card, f.controller);
      log(`${ctx.sourceName} destroys ${f.card.name}.`, 'sp');
      return;
    }

    // sev === 4: exile. Bypasses indestructible. Card lands in the
    // controller's exile zone — preserved (rather than dropped on the
    // floor) so the UI can display it and so future "return from exile"
    // mechanics have a real source to draw from. We reset in-play state
    // on the way out so any future exile-recursion mechanic gets a clean
    // card, not one stuck with stale counters/grants. Tokens cease to
    // exist instead of going to exile (they have no template-bound future).
    const card = pluckFromBattlefield(f);
    if (!card) return;
    // Claim keywords for the exiling player BEFORE resetInPlayState wipes
    // the keyword grants. Exile doesn't fire cardDies, so the dies-listener
    // path doesn't credit it — we tag here directly. Only credit when the
    // exiled card was a creature owned by the OTHER player (you don't
    // "claim" your own creatures).
    if (card.type === 'Creature' && f.controller !== ctx.controller) {
      claimKeywordsFromKill(card, ctx.controller);
    }
    // Flush permanentEot before resetInPlayState. Same rationale as
    // checkDeaths — Elystra's accumulated buffs shouldn't vanish if she
    // gets exiled (e.g., Path to Exile shape). Buffs persist through the
    // exile zone — when she re-enters from exile (currently no path
    // exists, but if one is added later) she'll already have them via
    // slot.permaBuffs.
    leavesPlayPreservingBuffs(card);
    if (!card.isToken) {
      // Owner-routed exile — see moveToGraveyard.
      G[card.owner || f.controller].exile.push(card);
      log(`${ctx.sourceName} exiles ${card.name}.`, 'sp');
    } else {
      log(`${ctx.sourceName} exiles ${card.name} — token ceases to exist.`, 'sp');
    }
    emitLeavesBattlefield(card, f.controller);
  },
  // Scarification shape: destroy the target creature AND apply a sticker
  // to its slot. The sticker persists across games via runState, so a
  // scarred creature will haunt the player on every future cast.
  //
  // Symmetry note: only player-side cards have persistent slots. Opp cards
  // are regenerated each game, so applying a sticker to an opp slot is a
  // no-op — the destroy still resolves, but no persistent effect. That's
  // fine for boss play (boss is opp, casts on you), and for the rare
  // mirror case (you somehow control Scarification and cast on opp) you
  // still get the destroy. params.stickerId names the sticker to apply.
  destroyAndStickerSlot(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (f.card.type !== 'Creature') {
      log(`${ctx.sourceName} fizzles — target must be a creature.`, 'sp');
      return;
    }
    // Indestructible blocks both halves — if we can't destroy it, the
    // sticker doesn't land either. (Thematically: you can't scar what
    // you can't break.)
    if ((f.card.keywords || []).includes('indestructible')) {
      log(`${f.card.name} is indestructible — ${ctx.sourceName} fizzles.`, 'sp');
      return;
    }
    // Capture slot before destruction — pluck/moveToGraveyard preserve
    // slotIdx on the card, but the card object will be in graveyard
    // afterward and we want to be unambiguous about the slot we're
    // stickering.
    const slotIdx = f.card.slotIdx;
    const slotController = f.controller;
    // Destroy — route through the normal kill path so dies-triggers and
    // SBAs all fire.
    f.card.killedBy = ctx.controller;
    moveToGraveyard(f.card, f.controller);
    log(`${ctx.sourceName} destroys ${f.card.name}.`, 'sp');
    // Apply sticker. Only player-side slots persist; opp gets in-game
    // destroy only.
    const stickerId = params.stickerId;
    if (!stickerId) return;
    if (slotController === 'you' && typeof slotIdx === 'number'
        && typeof RUN !== 'undefined' && RUN.applyStickerToSlot) {
      const applied = RUN.applyStickerToSlot(slotIdx, stickerId);
      if (applied) {
        const stk = STICKERS[stickerId];
        log(`${f.card.name} is scarred — gains "${stk ? stk.text : stickerId}" for the rest of the run.`, 'sp');
      }
    }
  },
  // ─── Balancer boss effects ─────────────────────────────────────────
  // Symmetricize: target creature's CONTROLLER chooses one of three values
  // (power, toughness, mana cost-total). All three become that value. The
  // chosen value persists across games via slot.symmetricized (replacing
  // the baseline at instantiation). Opp-side: no slot exists, so the
  // change is in-game only.
  //
  // Resolution: open a pendingSymmetricizeChoice prompt for the target's
  // controller. They click one of [power, toughness, cost]; the engine
  // reads that value from the card and applies the trio update.
  symmetricize(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (f.card.type !== 'Creature') {
      log(`${ctx.sourceName} fizzles — target must be a creature.`, 'sp');
      return;
    }
    // Compute the three current values. Power and toughness from getStats
    // (includes modifiers). Cost from cost-pip total.
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
  // Embargo: bounce target creature to its owner's hand AND add +1 to its
  // cost forever (slot.extraCost++). Stacks: multiple Embargos accumulate.
  // The in-game bounce mutates the runtime card too (so even THIS game's
  // recast is more expensive); next-game instantiation reads slot.extraCost.
  embargo(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (f.card.type !== 'Creature') {
      log(`${ctx.sourceName} fizzles — target must be a creature.`, 'sp');
      return;
    }
    // Capture before bounce.
    const owner = f.card.owner || f.controller;
    const slotIdx = (typeof f.card.slotIdx === 'number') ? f.card.slotIdx : null;
    // Bounce: pluck from battlefield, route to owner's hand. Emit
    // cardLeavesBattlefield so leaves-play triggers fire normally.
    pluckFromBattlefield(f);
    clearRestrictionsFromSource(f.card.iid);
    if (!f.card.isToken) {
      resetInPlayState(f.card);
      G[owner].hand.push(f.card);
    }
    emitLeavesBattlefield(f.card, f.controller);
    log(`${ctx.sourceName} returns ${f.card.name} to ${pname(owner)}'s hand.`, 'sp');
    // Add +1 to slot.extraCost (player-side only). Also bump the runtime
    // card's cost so a same-game recast costs the extra mana.
    if (!f.card.isToken) {
      if (f.card.cost) f.card.cost.C = (f.card.cost.C || 0) + 1;
    }
    if (owner === 'you' && typeof slotIdx === 'number'
        && typeof RUN !== 'undefined' && RUN.getSlots) {
      const slot = RUN.getSlots()[slotIdx];
      if (slot) {
        slot.extraCost = (slot.extraCost || 0) + 1;
        if (typeof RUN.save === 'function') RUN.save();
        log(`${f.card.name} costs {1} more for the rest of the run.`, 'sp');
      }
    }
  },
  // Bleach: exile target creature AND make it colorless forever (slot.
  // colorOverride='C'). The exile is in-game; the color change is the
  // run-persistent effect. Indestructible doesn't block exile.
  bleach(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (f.card.type !== 'Creature') {
      log(`${ctx.sourceName} fizzles — target must be a creature.`, 'sp');
      return;
    }
    const owner = f.card.owner || f.controller;
    const slotIdx = (typeof f.card.slotIdx === 'number') ? f.card.slotIdx : null;
    // Exile: pluck from battlefield, route to exile zone. Emit leaves-play.
    pluckFromBattlefield(f);
    clearRestrictionsFromSource(f.card.iid);
    if (!f.card.isToken) {
      resetInPlayState(f.card);
      G[owner].exile.push(f.card);
    }
    emitLeavesBattlefield(f.card, f.controller);
    log(`${ctx.sourceName} exiles ${f.card.name}.`, 'sp');
    // Run-persistent color erasure (player-side only).
    if (owner === 'you' && typeof slotIdx === 'number'
        && typeof RUN !== 'undefined' && RUN.getSlots) {
      const slot = RUN.getSlots()[slotIdx];
      if (slot) {
        slot.colorOverride = 'C';
        if (typeof RUN.save === 'function') RUN.save();
        log(`${f.card.name} is colorless for the rest of the run.`, 'sp');
      }
    }
  },
  // Archdemon of Bargains — phase 1 (ETB). Prompt the player to choose
  // a number 1-5. The chosen number is stashed on the demon card so the
  // dies trigger can read it later. Then apply N random stickers to
  // permanents the BOSS (source controller) controls. The player gets
  // hurt at ETB (boss buffs up), gets compensated only if they kill the
  // demon. params.side: 'self' = boss-side stickering at ETB.
  bargainStickerSelf(ctx, params) {
    // Always prompts the human side — even when the boss casts, the
    // player chooses the bargain number. (That's the design: the player
    // is the dealmaker.)
    const sourceCard = findCard(ctx.sourceIid);
    if (!sourceCard) return;
    G.pendingNumberChoice = {
      who: 'you',
      source: ctx.sourceName,
      sourceIid: ctx.sourceIid,
      min: 1,
      max: 5,
      // Continuation: when the player picks N, apply N stickers to the
      // source's controller's permanents and stash N on the source card.
      onChoose: 'bargainEtb',
    };
    log(`${ctx.sourceName} — choose a number from 1 to 5.`, 'sp');
  },
  // Archdemon of Bargains — phase 2 (dies). Read the chosen number from
  // the source card (set during ETB). Apply that many random stickers to
  // permanents the OPP-of-source-controller controls.
  bargainStickerOther(ctx) {
    // ctx.sourceIid is the demon; ctx.event.card is the dying card. They
    // should be the same for a "this dies" trigger. Read bargainsNum from
    // ctx.event.card (the trigger source as it left play) — that's where
    // ETB stashed it. Fallback: 1 if nothing was recorded (shouldn't
    // happen but defensive).
    const dyingCard = ctx.event && ctx.event.card;
    const n = (dyingCard && dyingCard.bargainsNum) || 1;
    // The dying card was opp's (boss's), so its controller was opp at
    // ETB time. The "compensation" stickering goes to the OTHER side.
    const recipient = opp(ctx.controller);
    log(`${ctx.sourceName} — applying ${n} sticker(s) to ${pname(recipient)}'s permanents.`, 'sp');
    applyRandomStickersToSide(G, recipient, n, ctx.sourceName, log);
  },
  // White Oblation-style removal — slower than exile but doesn't bypass
  // indestructible. Resets in-play state so card returns "fresh." Routes
  // to owner's library: a stolen creature shuffled into a library returns
  // to its original owner's, not the thief's.
  shuffleIntoLibrary(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const card = pluckFromBattlefield(f);
    if (!card) return;
    clearRestrictionsFromSource(card.iid);
    resetInPlayState(card);
    if (!card.isToken) {
      const dest = card.owner || f.controller;
      G[dest].library.push(card);
      shuffle(G[dest].library);
      log(`${ctx.sourceName} shuffles ${card.name} into ${pname(dest)}'s library.`, 'sp');
    } else {
      // Tokens have no library home — they cease to exist on leave-play.
      log(`${ctx.sourceName} targets ${card.name} — token ceases to exist.`, 'sp');
    }
    emitLeavesBattlefield(card, f.controller);
  },
  // Steal: counter a spell on the stack OR take a permanent off the
  // battlefield. Either way, the card becomes yours forever — a new slot
  // is appended to runState (tplId + stickers + metadata), and a fresh
  // instance is shuffled into your library.
  //
  // Spell target: the stack item is removed from G.stack (countered). The
  // spell's effects DO NOT fire — you intercepted it before resolution.
  // Mirrors counterspell semantics. The spell card is not routed to its
  // owner's graveyard — it ceases to exist as a spell (same disposition
  // as Stapler's spell-consumption path).
  //
  // Permanent target: pluck from battlefield, emit cardLeavesBattlefield
  // (so leaves-play triggers fire — Archdemon's bargain death-payout etc.).
  //
  // Old runtime state (counters, grants, damage, combat role) is discarded.
  // Slot identity (tplId + stickers + empower/subtype rolls + permaBuffs +
  // bonusTrigger + stapledTpls + charges) is preserved.
  steal(ctx, params, target) {
    const r = resolveStackOrPermanent(target);
    if (!r) {
      log(`${ctx.sourceName} fizzles — target gone.`, 'sp');
      return;
    }
    const stolenTplId = r.card.tplId;
    const stolenCardName = r.card.name;
    const fromStack = r.kind === 'spell';
    // ─── Capture source slot (player-side perms only) ──────────────────
    // Source-of-truth: prefer the runState slot when stealing a player-side
    // permanent (catches mid-game additions like Endomorph absorbs that
    // haven't been synced back to card.stickers). Opp-side perms and stack
    // items have no persistent slot — opp slots are transient per-game.
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
      emitLeavesBattlefield(r.card, r.controller);
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
        symmetricized: stolenSlot.symmetricized,
        colorOverride: stolenSlot.colorOverride,
        extraCost:     stolenSlot.extraCost,
      };
    } else {
      stickers = (r.card.stickers || []).slice();
      meta = undefined;
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
  // Black's signature recursion: pull a creature card from the caster's
  // graveyard back to hand. Mandatory in our engine (no "may" optional
  // triggers yet) — if the graveyard has no creatures, the trigger doesn't
  // queue (triggerHasAnyValidTarget filters it out). Resets card state
  // defensively, though graveyard cards should already be reset from
  // their last bf→grave transition.
  returnFromGraveyard(ctx, params, target) {
    const grave = G[ctx.controller].graveyard;
    const idx = grave.findIndex(c => c.iid === target.iid);
    if (idx < 0) { log(`${ctx.sourceName} fizzles — target gone.`, 'sp'); return; }
    const [card] = grave.splice(idx, 1);
    // Defensive reset (graveyard cards should already be clean from death,
    // but this keeps the pipeline tidy even if some other path put a
    // mid-state card there).
    card.tapped = false; card.sick = false; card.damage = 0;
    card.tempPower = 0; card.tempTou = 0;
    if (card.damagedBySources instanceof Set) card.damagedBySources.clear();
    card.dealtDeathtouch = false;
    // Pull from caster's graveyard back to caster's hand. (Current
    // engine only allows targeting your own graveyard, so owner-routing
    // is a no-op here, but use owner for principled correctness in case
    // a "return target creature from any graveyard to its owner's hand"
    // shape is added later.)
    G[card.owner || ctx.controller].hand.push(card);
    log(`${ctx.sourceName} returns ${card.name} from graveyard to ${pname(card.owner || ctx.controller)}'s hand.`, 'sp');
  },
  counter(ctx, params, target) {
    const idx = G.stack.indexOf(target.stackItem);
    if (idx < 0) { log(`Target spell no longer on stack.`); return; }
    if (G.stack[idx].kind === 'trigger') {
      // Defensive: should be excluded by getValidTargets already.
      log(`${ctx.sourceName} can't counter that.`, 'sp'); return;
    }
    const removed = G.stack.splice(idx, 1)[0];
    G[removed.controller].graveyard.push(removed.card);
    log(`${ctx.sourceName} counters ${removed.card.name}!`, 'sp');
  },
  addMana(ctx, params) {
    for (const c of Object.keys(params.amounts)) G[ctx.controller].mana[c] += params.amounts[c];
    const txt = Object.entries(params.amounts).map(([c,n]) => `{${c}}`.repeat(n)).join('');
    log(`${pname(ctx.controller)} adds ${txt}.`, 'sp');
  },
  gainLife(ctx, params, target) {
    // Who gains life, in priority order:
    //   1. params.who if explicitly resolved (e.g., from {from:'targetController'}
    //      for Swords-style "target's controller gains life").
    //   2. target.who if target is a player.
    //   3. ctx.controller as fallback (Drain Life's gainLife with target:'self').
    const who = params.who
      || (target && target.kind === 'player' ? target.who : null)
      || ctx.controller;
    const amount = params.amount;
    G[who].life += amount;
    log(`${pname(who)} gains ${amount} life.`, 'sp');
    // Emit lifeGained event so triggers can fire (Ajani's Pridemate puts
    // a +1/+1 counter, Soul Warden-style scaling, etc). The event captures
    // the gainer and amount; trigger conditions filter on those.
    if (amount > 0) {
      // sourceIid: see comment on lifelink emit above. Lets self-cascade-guarded
      // triggers (e.g., Codex's generated abilities) skip their own life gain.
      emit({type: 'lifeGained', who, amount, sourceIid: ctx.sourceIid});
    }
  },
  draw(ctx, params) {
    for (let i=0;i<params.amount;i++) drawCard(ctx.controller);
    log(`${pname(ctx.controller)} draws ${params.amount}.`, 'sp');
  },
  discard(ctx, params, target) {
    // target may be {kind:'player', who} (forced discard, e.g. Mind Rot),
    // {kind:'creature', ...} (spell self-target — fallback to controller),
    // or null. In any non-player case, default to the caster discarding.
    const who = (target && target.kind === 'player' && target.who)
      ? target.who : ctx.controller;
    const tp = G[who];
    const n = Math.min(params.amount, tp.hand.length);
    if (n === 0) {
      log(`${pname(who)} has no cards to discard.`, 'sp');
      return;
    }
    if (who === 'you') {
      // Player chooses. Set the prompt; UI handles the rest. step() will pause.
      G.forcedDiscard = { who: 'you', remaining: n, source: ctx.sourceName };
      log(`${ctx.sourceName} — choose ${n} card(s) to discard.`, 'sp');
    } else {
      // AI is discarding from its OWN hand. Always pick cheapest — AI wants
      // to keep its best cards regardless of who triggered the discard. (The
      // caster of a Mind Rot doesn't choose what the target discards; the
      // discarding player does. Pre-v0.98 this branch flipped sort order
      // when the caster was a different player — that was wrong: opp would
      // deliberately discard its OWN expensive cards when player cast Mind
      // Rot at it. Now consistent: the discarder optimizes for itself.)
      const sorted = tp.hand.slice().sort((a, b) => costTotalCard(a) - costTotalCard(b));
      for (let i = 0; i < n; i++) {
        const card = sorted[i];
        const idx = tp.hand.findIndex(c => c.iid === card.iid);
        if (idx >= 0) tp.graveyard.push(tp.hand.splice(idx, 1)[0]);
      }
      log(`${pname(who)} discards ${n}.`, 'sp');
    }
  },
  searchLandTapped(ctx) {
    const lib = G[ctx.controller].library;
    const idx = lib.findIndex(c => c.type === 'Land');
    if (idx < 0) { log('No basic land in library.'); return; }
    const land = lib.splice(idx, 1)[0];
    land.tapped = true;
    G[ctx.controller].battlefield.push(land);
    shuffle(G[ctx.controller].library);
    log(`${pname(ctx.controller)} fetches ${land.name} (tapped).`, 'sp');
    emit({type: 'cardEntersBattlefield', card: land, controller: ctx.controller});
  },
  searchCreature(ctx) {
    const lib = G[ctx.controller].library;
    const candidates = lib.filter(c => c.type === 'Creature');
    if (candidates.length === 0) {
      log(`No creature in library.`, 'sp');
      shuffle(lib);
      return;
    }
    if (ctx.controller === 'you') {
      G.pendingSearch = { who: 'you', filter: {type: 'Creature'}, source: ctx.sourceName };
      log(`${ctx.sourceName} — choose a creature from your library.`, 'sp');
    } else {
      // AI picks the highest-cost creature it can plausibly cast soon.
      const sorted = candidates.slice().sort((a, b) => costTotalCard(b) - costTotalCard(a));
      const card = sorted[0];
      const idx = lib.findIndex(c => c.iid === card.iid);
      lib.splice(idx, 1);
      G[ctx.controller].hand.push(card);
      shuffle(lib);
      log(`${pname(ctx.controller)} searches for ${card.name}.`, 'sp');
      // AI-tutored buildOnDraw cards: the helper no-ops for opp (the AI
      // can't interact with a modal). Defensive call — safe if buildOnDraw
      // ever opens up to opp's pool, otherwise harmless.
      tryBuildOnDraw(card, ctx.controller);
    }
  },
  restrict(ctx, params, target) {
    // Persistent: target creature can't attack and/or can't block until the
    // source leaves the battlefield. Tracked as a Set of source iids per
    // restriction kind — the creature is restricted iff its set is non-empty.
    // When sources die or leave play, their iid is cleared from each set
    // (see clearRestrictionsFromSource, called from moveToGraveyard etc).
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (params.cantAttack) {
      if (!(f.card.cantAttackBy instanceof Set)) f.card.cantAttackBy = new Set();
      f.card.cantAttackBy.add(ctx.sourceIid);
      f.card.cantAttack = true;
    }
    if (params.cantBlock) {
      if (!(f.card.cantBlockBy instanceof Set)) f.card.cantBlockBy = new Set();
      f.card.cantBlockBy.add(ctx.sourceIid);
      f.card.cantBlock = true;
    }
    const parts = [];
    if (params.cantAttack) parts.push("can't attack");
    if (params.cantBlock) parts.push("can't block");
    log(`${ctx.sourceName} binds ${f.card.name} (${parts.join(', ')}).`, 'sp');
  },
  // Grant a keyword to target creature. Tied to source's lifetime — when
  // the source leaves play, clearRestrictionsFromSource walks all granted
  // keywords and removes this source's contribution. If a keyword has no
  // remaining sources granting it AND it isn't intrinsic, it comes off the
  // target's keywords list. Mirrors cantAttackBy / cantBlockBy bookkeeping.
  // Grant a keyword to a creature. Three axes:
  //   target: 'creature' (single target chosen at cast time) — default
  //           or omitted for the mass form below.
  //   whose:  'allYours' | 'all'  — mass form, ignores target. Iterates
  //           the relevant battlefield(s).
  //   duration: 'eot' | 'permanent' (default permanent for backwards compat
  //           with existing static-grant cards like Sky Champion).
  //
  // Permanent grants flow through grantedBy (revoked when source leaves play).
  // EOT grants flow through eotGrants (revoked at end of turn cleanup).
  // The two systems are separate but additive — a creature can have a kw
  // from both at once; either source alone keeps it on.
  grantKeyword(ctx, params, target) {
    const kw = params.keyword;
    if (!kw) return;
    const eot = params.duration === 'eot';
    // Mass form. `whose: 'allYours'` is the Overrun shape; 'all' is symmetric
    // (rare). Ignores target.
    if (params.whose === 'allYours' || params.whose === 'all') {
      const sides = params.whose === 'all' ? ['you', 'opp'] : [ctx.controller];
      const recipients = [];
      for (const who of sides) {
        for (const c of G[who].battlefield) {
          if (c.type !== 'Creature') continue;
          recipients.push(c);
        }
      }
      if (recipients.length === 0) {
        log(`${ctx.sourceName} fizzles — no creatures.`, 'sp');
        return;
      }
      const display = (typeof KEYWORD_DISPLAY !== 'undefined' && KEYWORD_DISPLAY[kw]) || kw;
      const dur = eot ? ' until end of turn' : '';
      log(`${ctx.sourceName} — ${recipients.length} creature${recipients.length === 1 ? '' : 's'} gain${recipients.length === 1 ? 's' : ''} ${display}${dur}.`, 'sp');
      for (const c of recipients) {
        applyGrant(c, kw, ctx.sourceIid, eot);
      }
      return;
    }
    // Single-target form (today's behavior, plus optional EOT).
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const alreadyHad = f.card.keywords.includes(kw);
    applyGrant(f.card, kw, ctx.sourceIid, eot);
    const display = (typeof KEYWORD_DISPLAY !== 'undefined' && KEYWORD_DISPLAY[kw]) || kw;
    if (alreadyHad && !eot) {
      // Already had it via another source — log informatively. (For EOT
      // grants this is less interesting; just skip the special-case log.)
      log(`${ctx.sourceName} targets ${f.card.name} — already has ${display}.`, 'sp');
    } else {
      const dur = eot ? ' until end of turn' : '';
      log(`${ctx.sourceName} — ${f.card.name} gains ${display}${dur}.`, 'sp');
    }
  },
  // Mint creature tokens onto the controller's battlefield. Each token
  // gets a fresh iid, ETB triggers fire normally (so future "when a creature
  // ETBs" payoffs see the tokens). Tokens are flagged isToken — every
  // leave-play path checks this and vanishes instead of routing the token
  // to graveyard/hand/library/exile.
  //
  // Params:
  //   tokenId: key into TOKENS (e.g., 'soldier_w_1_1')
  //   count:   how many tokens to create (default 1)
  //   controller: 'self' (default) | 'opp' — who controls the new tokens
  createTokens(ctx, params) {
    let tokenId = params.tokenId;
    // Defensive: older saves may have bare-name tokenIds ('goblin', 'soldier')
    // from a bug where the Codex's procedural trigger generator emitted
    // shortnames instead of TOKENS keys. Normalize to the full key so
    // legacy saves don't fizzle. Fixed at the source in v1.0.37 — this
    // alias remap is the safety net.
    const TOKEN_ALIAS = {
      goblin: 'goblin_r_1_1',
      soldier: 'soldier_w_1_1',
      spirit: 'spirit_w_1_1',
      bear: 'bear_g_2_2',
      saproling: 'saproling_g_1_1',
    };
    if (tokenId && TOKEN_ALIAS[tokenId]) tokenId = TOKEN_ALIAS[tokenId];
    if (!tokenId || !TOKENS[tokenId]) {
      log(`${ctx.sourceName} fizzles — unknown token ${tokenId}.`, 'sp');
      return;
    }
    const count = params.count || 1;
    const owner = (params.controller === 'opp') ? opp(ctx.controller) : ctx.controller;
    const tpl = TOKENS[tokenId];
    const made = [];
    for (let i = 0; i < count; i++) {
      const tok = makeToken(tokenId, owner);
      G[owner].battlefield.push(tok);
      made.push(tok);
    }
    const plural = count === 1 ? '' : 's';
    log(`${ctx.sourceName} creates ${count} ${tpl.power}/${tpl.toughness} ${tpl.name} token${plural}.`, 'sp');
    // Fire ETB triggers per minted token. Mirrors the ETB-emit pattern
    // used by playLand and the spell-resolution path. sourceIid identifies
    // the card that minted these tokens — used by self-cascade-guarded
    // triggers (Codex's generated abilities) to skip their own creations
    // and avoid cascading token-spam loops.
    for (const tok of made) {
      emit({type:'cardEntersBattlefield', card: tok, controller: owner, sourceIid: ctx.sourceIid});
    }
  },
  // Edict: force the spell's controller's opponent to sacrifice a creature.
  // No targeting (the opponent picks from their own creatures), so hexproof
  // doesn't protect. If opp has no creatures, fizzles cleanly.
  //
  // v1 limitation: only auto-resolves when the chooser is AI. If a player
  // is forced to sacrifice (opp casts edict at us), we'd need a forced-pick
  // UI similar to forcedDiscard. Punted to a follow-up — no opp-side edicts
  // in v1 cards anyway, so this branch never triggers in real play.
  edict(ctx) {
    const them = opp(ctx.controller);
    const targets = G[them].battlefield.filter(c => c.type === 'Creature');
    if (targets.length === 0) {
      log(`${ctx.sourceName} fizzles — ${pname(them)} has no creatures.`, 'sp');
      return;
    }
    // Chooser = opp of caster — picks the creature they want to lose.
    if (them === 'you') {
      // TODO: forced-sacrifice UI for player-side edicts. Auto-picks for now.
      log(`${ctx.sourceName} — auto-selecting (forced-sac UI not implemented).`, 'sp');
    }
    targets.sort((a, b) => sacValueOnBoard(a) - sacValueOnBoard(b));
    const victim = targets[0];
    // Credit caster for keyword-claim, not the victim's controller.
    victim.killedBy = ctx.controller;
    sacrificeCard(victim, them);
  },
  // Vile Edict shape: "Target player chooses a permanent they control to
  // rip up." Differs from edict in three ways:
  //   1. Target is a player (caster targets you/opp; edict always hits opp)
  //   2. Targets ANY permanent (creature/artifact/enchantment/land), not
  //      just creatures
  //   3. The picked permanent is RIPPED — destroyed AND its slot is removed
  //      from runState, so it's gone from the deck for the rest of the run.
  //      A persistent loss, much more punishing than a destroy.
  // Resolution: set a pendingRipSelect prompt for the targeted player. The
  // target chooses via UI (you) or AI (opp). Step machine waits.
  ripPermanent(ctx, params, target) {
    // Target should be a {kind:'player'} from the existing player-target
    // resolution. Defensive: if no target, fizzle.
    if (!target || target.kind !== 'player') {
      log(`${ctx.sourceName} fizzles — no valid player target.`, 'sp');
      return;
    }
    const who = target.who;
    const permanents = G[who].battlefield;
    if (permanents.length === 0) {
      log(`${ctx.sourceName} fizzles — ${pname(who)} has no permanents.`, 'sp');
      return;
    }
    // Open the rip-select prompt. The target player picks; engine validates
    // and rips on selection.
    G.pendingRipSelect = { who, source: ctx.sourceName, ripBy: ctx.controller };
    log(`${ctx.sourceName} — ${pname(who)} must choose a permanent to rip.`, 'sp');
  },
  // Sacrifice as an effect (rare — usually sacs are costs). "Sacrifice a
  // creature" with target:'self' resolves to the source itself; with no
  // target, the effect controller picks one of their own. v1: only target:'self'
  // is wired (e.g., a creature with "When this attacks, sacrifice a creature
  // (this one) to deal 2 damage" — though we don't have such a card yet,
  // having the effect available makes that design space accessible).
  sacrifice(ctx, params, target) {
    if (!target) return;
    const f = findCard(target.iid);
    if (!f) return;
    sacrificeCard(f.card, f.controller);
  },
  // Iconic red AOE: deal N damage to every creature on both battlefields.
  // Asymmetric — hits your own creatures too. Indestructible takes the damage
  // but doesn't die (handled by SBA). Hexproof doesn't protect (this isn't
  // a targeted effect). Damage routes through applyDamageFrom so the dying
  // creatures' damagedBySources sets are populated correctly — but since
  // the source is a spell on the stack (not a permanent), no lifelink/
  // deathtouch interactions apply (those need a creature source).
  damageAll(ctx, params) {
    const amt = params.amount || 0;
    if (amt <= 0) return;
    log(`${ctx.sourceName} deals ${amt} to each creature.`, 'sp');
    // Snapshot the target list before iterating — applyDamageFrom doesn't
    // mutate battlefield arrays (deaths happen at SBA time), but we'd want
    // stable behavior even if a future change introduces mid-loop mutation.
    const targets = [];
    for (const who of ['you','opp']) {
      for (const c of G[who].battlefield) {
        if (c.type !== 'Creature') continue;
        targets.push({iid: c.iid});
      }
    }
    for (const t of targets) {
      applyDamageFrom(ctx, {kind: 'creature', iid: t.iid}, amt);
    }
  },
  // Unified mass-removal: applies the single-target removeCreature semantics
  // to every creature in scope. severity 1-4 maps to tap/bounce/destroy/exile,
  // matching single-target. whose: 'all' (both sides) or 'opp' (asymmetric).
  // Empower bumps severity (capped at 4) just like single-target.
  // - sev 1 (tap):     creatures tap; any already-tapped are skipped silently
  // - sev 2 (bounce):  to owners' hands; tokens cease; ignores indestructible
  // - sev 3 (destroy): to graveyard; indestructible survives
  // - sev 4 (exile):   removed from game; indestructible does NOT save
  removeAll(ctx, params) {
    const sev = Math.max(1, Math.min(4, params.severity || 3));
    const whose = params.whose || 'all';
    const sides = whose === 'opp' ? [opp(ctx.controller)] : ['you', 'opp'];
    // Snapshot targets up front — sev 2/3/4 mutate battlefield arrays
    // (splice / moveToGraveyard) and would break iteration otherwise.
    const targets = [];
    for (const who of sides) {
      for (const c of G[who].battlefield) {
        if (c.type !== 'Creature') continue;
        targets.push({iid: c.iid, controller: who});
      }
    }
    if (targets.length === 0) {
      log(`${ctx.sourceName} fizzles — no creatures.`, 'sp');
      return;
    }
    const verb = sev === 1 ? 'taps' : sev === 2 ? 'bounces' : sev === 3 ? 'sweeps' : 'exiles';
    log(`${ctx.sourceName} ${verb} the board.`, 'sp');
    for (const t of targets) {
      const f = findCard(t.iid);
      if (!f) continue;
      const card = f.card;
      const ctrl = f.controller;
      if (sev === 1) {
        // Tap. Already-tapped is a no-op. Doesn't trigger anything beyond
        // what single-target tap would (no destroy/leave-play emits).
        if (!card.tapped) card.tapped = true;
      } else if (sev === 2) {
        // Bounce: same as single-target severity-2 path. Tokens cease.
        const bf = G[ctrl].battlefield;
        const idx = bf.findIndex(c => c.iid === t.iid);
        if (idx < 0) continue;
        const removed = bf.splice(idx, 1)[0];
        // Flush permanentEot — same rationale as single-target bounce.
        leavesPlayPreservingBuffs(removed);
        if (!removed.isToken) G[removed.owner || ctrl].hand.push(removed);
        emitLeavesBattlefield(removed, ctrl);
      } else if (sev === 3) {
        // Destroy. Indestructible saves. Mirrors destroyAll's prior behavior.
        if (card.keywords.includes('indestructible')) continue;
        // Tag killer for keyword-claim (only opp's creatures dying to your
        // Wrath count — the kill-claim listener filters that side).
        card.killedBy = ctx.controller;
        moveToGraveyard(card, ctrl);
        log(`${card.name} dies.`, 'dmg');
      } else if (sev === 4) {
        // Exile. Bypasses indestructible. Tokens cease.
        const bf = G[ctrl].battlefield;
        const idx = bf.findIndex(c => c.iid === t.iid);
        if (idx < 0) continue;
        const removed = bf.splice(idx, 1)[0];
        // Claim keywords from the exiled creature if it was opp's. Mirrors
        // the single-target exile path; do this BEFORE resetInPlayState
        // clears the keyword grants.
        if (removed.type === 'Creature' && ctrl !== ctx.controller) {
          claimKeywordsFromKill(removed, ctx.controller);
        }
        // Flush permanentEot — same rationale as the single-target exile.
        leavesPlayPreservingBuffs(removed);
        if (!removed.isToken) G[removed.owner || ctrl].exile.push(removed);
        log(`${removed.name} is exiled.`, 'dmg');
        emitLeavesBattlefield(removed, ctrl);
      }
    }
  },
  // Flicker (Cloudshift-style): exile target creature, then immediately
  // return it to the battlefield under owner's control. Re-fires ETB
  // triggers (the main use), resets damage marks, clears counters, revokes
  // permanent grants, but preserves stickers (those live on the slot, not
  // the runtime card object). Static-grant lords still in play will re-grant
  // on the return — applyStaticKeywordGrants runs as part of the emit pre-pass.
  //
  // Tokens flicker → cease to exist (existing token leave-play rule). They
  // don't return because there's no "owner's library/hand" home for them.
  // This matches MtG canon (tokens that exile cease to exist).
  //
  // v1: immediate flicker only (Cloudshift). EOT-flicker (Restoration Angel)
  // requires a delayed-trigger system to schedule the return — deferred.
  flicker(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const card = pluckFromBattlefield(f);
    if (!card) return;
    clearRestrictionsFromSource(card.iid);
    resetInPlayState(card);
    if (card.isToken) {
      log(`${ctx.sourceName} flickers ${card.name} — token ceases to exist.`, 'sp');
      return;
    }
    log(`${ctx.sourceName} flickers ${card.name}.`, 'sp');
    // Assign a new iid before returning to battlefield. Per MtG rules, a
    // flickered creature returns as a "new object," which means anything
    // tracking it by identity loses its reference. The mechanically
    // observable consequence: spells and triggers on the stack that
    // targeted the old iid (Bolt, Flame Wisp's deal-2-to-target trigger,
    // etc.) fizzle when they resolve, because findCard(oldIid) returns
    // null. This is the central reason flicker exists as a defensive
    // play — without the iid change, flicker is mechanically equivalent
    // to a "redraw your ETB triggers" effect that doesn't dodge removal.
    //
    // Side effects of the iid swap that we accept:
    //   - damagedBySources sets on OTHER creatures may still hold the
    //     old iid; harmless (those are read by Sengir-shape triggers
    //     which check membership against their own iid).
    //   - The card's own damagedBySources was cleared by resetInPlayState.
    //   - Slot tracking via slotIdx is unchanged — that's the persistent
    //     identity for run-state purposes.
    card.iid = nextIid++;
    // Return to battlefield with sickness reset (ETB sick, except for haste).
    // resetInPlayState already cleared sick; intrinsic haste re-derived from
    // intrinsicKeywords if applicable. Push back, then emit ETB so triggers
    // fire (Wall of Omens re-draws, Grave Digger re-recurs, etc).
    card.sick = !card.keywords.includes('haste');
    // Owner-routed return — a stolen creature flickered returns to its
    // original owner's battlefield, not the thief's. The ETB event carries
    // the new controller (owner) so triggers see the correct side.
    const returnTo = card.owner || f.controller;
    G[returnTo].battlefield.push(card);
    emit({type: 'cardEntersBattlefield', card, controller: returnTo, sourceIid: ctx.sourceIid});
  },
  // Exile target creature until end of turn (Otherworldly Journey-shape).
  // Splice the card off the battlefield, hold it on a delayed trigger that
  // fires at end of turn and returns it. Differs from flicker (which is
  // immediate exile-and-return) — this one is removal-as-tempo, taking a
  // creature out of the game for one turn.
  //
  // Key uses:
  //   - Removal answer (one turn off the board, dodging your block step)
  //   - Saving your own creature from removal on the stack
  //   - Re-firing your own ETB triggers at end of turn (Wall of Omens
  //     re-draws when the spell wears off)
  //   - Resetting damage/counters on a creature
  //
  // Tokens that exile cease to exist; their delayed return entry processes
  // but logs the disappearance instead of returning.
  // Take control of target creature (Threaten / Mind Control shape). Moves
  // the card from its current controller's battlefield to the caster's.
  // Two variants by params.duration:
  //   - omitted: permanent steal (Mind Control). Card stays with caster
  //     until it leaves the battlefield by other means.
  //   - 'eot': temporary steal (Threaten). card.tempControlUntilEot = true;
  //     the EOT cleanup pass reverts it to owner's battlefield.
  // Other knobs:
  //   - params.haste: if true, gives the stolen creature haste for the rest
  //     of the turn (Threaten gives haste so you can attack with what you
  //     stole — without this, sickness rules apply).
  //   - params.untap: if true, untaps the stolen creature so it can attack
  //     even if it was tapped (Threaten does this too).
  // Owner field on the card is NOT modified — the original owner is
  // preserved so death/bounce/exile/EOT all route the card home correctly.
  // Token consideration: stealing a token works mechanically (it moves to
  // your battlefield) but if the temporary-steal expires while the token
  // is still on board, the EOT revert pushes it back to owner. If the
  // token dies while stolen, it ceases to exist (tokens never reach a
  // graveyard) and there's nothing to revert.
  gainControl(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    if (f.controller === ctx.controller) {
      // Defensive: shouldn't get here (targeting filters out your own
      // creatures for gainControl), but if it does, no-op.
      log(`${ctx.sourceName} fizzles — already controlled.`, 'sp');
      return;
    }
    const card = f.card;
    const fromBf = G[f.controller].battlefield;
    const idx = fromBf.findIndex(c => c.iid === card.iid);
    if (idx < 0) return;
    fromBf.splice(idx, 1);
    G[ctx.controller].battlefield.push(card);
    // Mark for EOT revert if temporary. Both flags help the cleanup pass:
    // tempControlUntilEot says "revert me at EOT," and tempControlSource
    // (informational, for log) names what stole it. A creature stolen
    // permanently has neither flag and never reverts.
    if (params && params.duration === 'eot') {
      card.tempControlUntilEot = true;
    }
    // Haste / untap riders (Threaten pattern).
    if (params && params.haste) {
      // EOT-granted haste — uses the same eotGrants pipeline as combat-trick
      // grants. Cleared at EOT cleanup; works alongside the control revert.
      if (!Array.isArray(card.eotGrants)) card.eotGrants = [];
      card.eotGrants.push('haste');
      if (!card.keywords.includes('haste')) card.keywords.push('haste');
      // Override sickness since the haste grant makes it moot. Without
      // this, a sick creature given haste-for-EOT still can't attack
      // because canCreatureAttack checks sick BEFORE haste.
      card.sick = false;
    } else {
      // No haste rider: stolen creature is "sick under new controller."
      // MtG: sickness applies if hasn't been under your control since
      // your most recent turn began. A permanent steal needs to set sick
      // so the thief can't attack with it immediately on the steal turn.
      // (A natural Threaten without haste would be near-useless — that's
      // why MtG's Threaten template always includes haste.)
      card.sick = true;
    }
    if (params && params.untap) {
      card.tapped = false;
    }
    log(`${ctx.sourceName} — ${pname(ctx.controller)} takes control of ${card.name}${params && params.duration === 'eot' ? ' until end of turn' : ''}.`, 'sp');
  },
  exileUntilEOT(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const card = pluckFromBattlefield(f);
    if (!card) return;
    // Flush permanentEot before resetInPlayState — same rationale as bounce.
    // Flicker is a temporary exile, but the creature returns as a "new
    // instance" with buffs cleared per standard MtG. Elystra's flavor wants
    // those buffs to persist on the slot regardless of leave-play form.
    leavesPlayPreservingBuffs(card);
    log(`${ctx.sourceName} exiles ${card.name} until end of turn.`, 'sp');
    emitLeavesBattlefield(card, f.controller);
    // Schedule the return. Hold the card on the delayed trigger so we
    // don't have to reconcile with the exile zone (which today is also
    // used by permanent-exile cards and recursion-from-exile). Using a
    // separate holding location keeps the two domains independent.
    G.delayedTriggers.push({
      fireAt: 'endStep',
      fireFor: 'either',          // any player's end step (typically same turn)
      effect: 'returnFromExile',
      controller: ctx.controller,
      sourceName: ctx.sourceName,
      sourceIid: ctx.sourceIid,
      exiledCard: card,
      // Return to OWNER's battlefield. For a stolen creature exiled-til-EOT,
      // the temporary-control spell would have already been temp, but the
      // exile-til-EOT effect itself is independent — it should always return
      // the card to where it belongs. Falls back to f.controller if owner
      // somehow unset.
      exiledFrom: card.owner || f.controller,
    });
  },
  // Take control of target creature. Two flavors via duration param:
  //   - omitted: permanent (Mind Control shape). Creature stays under the
  //     caster's control until it leaves play. Survives across turns. If it
  //     dies, it goes to its OWNER's graveyard (owner-routed). If it
  //     bounces, it goes to its OWNER's hand. Etc.
  //   - 'eot': temporary (Threaten shape). Reverts at end of turn — the EOT
  //     cleanup pass walks both battlefields for cards with
  //     tempControlUntilEot and pushes them back to card.owner's battlefield.
  // Optional flags:
  //   - untap: also untap the stolen creature (Threaten). Without this, a
  //     tapped creature stays tapped — it's still yours but it can't attack
  //     this turn for any reason of its own.
  //   - grantHaste: grant haste until end of turn (Threaten). Without this,
  //     summoning sickness is unchanged. If the creature was sick on opp's
  //     side, it's still sick on yours. Threaten gives haste specifically so
  //     the steal-and-attack play works on the same turn.
  // Static lord grants:
  //   - When the creature moves to your battlefield, applyStaticKeywordGrants
  //     (called every emit pre-pass) picks up your lords' grants automatically.
  //   - The opp's lord grants on the creature persist as stale entries in
  //     card.grantedBy. Cosmetic bug for v1: the creature appears to have
  //     keywords from opp's lord still. Accepted because the bug favors the
  //     stealing player and is rare in practice. Fix: full rebuild of the
  //     static-grant map in applyStaticKeywordGrants. Defer.
  gainControl(ctx, params, target) {
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const card = f.card;
    const fromCtrl = f.controller;
    const toCtrl = ctx.controller;
    // No-op if caster targeting their own creature. Targeting filters should
    // prevent this (steal targets are opp creatures), but defensive guard.
    if (fromCtrl === toCtrl) {
      log(`${ctx.sourceName} fizzles — ${card.name} is already under ${pname(toCtrl)}'s control.`, 'sp');
      return;
    }
    // Move the card. splice from fromCtrl's battlefield, push to toCtrl's.
    const fromBf = G[fromCtrl].battlefield;
    const idx = fromBf.findIndex(c => c.iid === card.iid);
    if (idx < 0) return;
    fromBf.splice(idx, 1);
    G[toCtrl].battlefield.push(card);
    // Untap (Threaten) — runs before haste so a tapped creature is unblocked
    // for the haste check. (Haste alone doesn't untap; the two riders are
    // separate and Threaten specifies both.)
    if (params && params.untap) card.tapped = false;
    // Haste grant (Threaten). Use applyGrant with eot=true so the cleanup
    // path handles revocation via clearEotState. ctx.sourceIid is the steal
    // spell — when the spell's grants are cleared at EOT, haste vanishes.
    if (params && params.grantHaste) {
      applyGrant(card, 'haste', ctx.sourceIid, true);
    }
    // Temporary control: tag for EOT revert. The EOT pass (clearEotState)
    // checks this flag and pushes the card back to card.owner's battlefield.
    if (params && params.duration === 'eot') {
      card.tempControlUntilEot = true;
    }
    log(`${ctx.sourceName} — ${pname(toCtrl)} gains control of ${card.name}` +
        (params && params.duration === 'eot' ? ' until end of turn.' : '.'), 'sp');
  },
  pumpAllYours(ctx, params) {
    let n = 0;
    for (const c of G[ctx.controller].battlefield) {
      if (c.type !== 'Creature') continue;
      c.tempPower += (params.power || 0);
      c.tempTou += (params.toughness || 0);
      n++;
    }
    log(`${pname(ctx.controller)}'s ${n} creature(s) get +${params.power}/+${params.toughness} EOT.`, 'sp');
  },
  // Fight: target creature you control and target opp's creature each deal
  // damage to each other equal to their power. Encoded as a single-target
  // spell where the target is the opponent's creature; the source's
  // creature comes from ctx (the spell card itself doesn't fight, but on
  // a creature with a "fight" activated ability, ctx.sourceIid is the
  // attacker). For the simpler form here, the spell version, we pump the
  // controller's strongest creature into a fight — this is intentionally
  // a small-scoped implementation. See cards using kind:'fightTarget'.
  fightTarget(ctx, params, target) {
    // Pick the controller's biggest creature as the fighter. Tap status
    // doesn't matter — in MtG fight is just "each deals damage equal to
    // its power", which works whether the fighter has attacked this turn
    // or not. Earlier versions of this engine excluded tapped creatures
    // here, but that caused Beast's Fury cast post-combat to fizzle
    // surprisingly when the player still had creatures on the field, just
    // ones that had attacked.
    const ours = G[ctx.controller].battlefield
      .filter(c => c.type === 'Creature');
    if (!ours.length) { log(`${ctx.sourceName} fizzles — no creature to fight.`, 'sp'); return; }
    ours.sort((a, b) => getStats(b)[0] - getStats(a)[0]);
    const ourCreature = ours[0];
    const f = resolveTarget(ctx, target);
    if (!f) return;
    const them = f.card;
    const [ourPow] = getStats(ourCreature);
    const [theirPow] = getStats(them);
    log(`${ourCreature.name} (${ourPow}) fights ${them.name} (${theirPow}).`, 'cb');
    // Each fighter deals damage AS THEMSELVES — so deathtouch/lifelink on
    // the fighter applies even though fightTarget was triggered by ctx.
    // Build per-fighter ctx objects so applyDamageFrom looks them up.
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

  // Pure no-op. Exists so multi-target spells/abilities can have a "marker"
  // effect at a target slot whose only purpose is forcing the validation
  // harness to require a target at that slot. Used by Stapler: the real
  // merge work lives in applyInGameSplice (which reads both targets via
  // ctx.allTargets); the second target is requested via this marker.
  noop() {},

  // In-game splice (Stapler v1.0.51). Reads two permanent targets from
  // ctx.allTargets and merges the second onto the first using the same
  // splice infrastructure that powers the reward-time splice path. The
  // merged result is owned by the caster — when inputs cross owners, the
  // merged slot moves into the caster's runState, functioning as
  // removal/steal for opp-owned inputs.
  //
  // Pre-conditions (re-validated defensively; the target eligibility
  // filter already enforces these at cast time):
  //   - both targets must be on a battlefield
  //   - target 0 must be a spliceable base (no Lands, no special, no
  //     tokens, no modal-card bases)
  //   - target 1 must be a spliceable staple (the above, plus not
  //     already-stapled)
  //   - the (base, staple) pair must satisfy isCompatibleStaplePair
  //     (spell-base can't take creature-staple)
  //
  // The base card stays on the battlefield with its identity rebuilt as
  // the merged template. The staple card is removed from its battlefield
  // and its slot (if it has a persistent slot) is removed from its
  // owner's runState. The merged card's slot becomes the caster's.
  //
  // v1.0.51 limitation: only permanent + permanent. Spell-on-stack as
  // either input is deferred to v1.0.52+ (needs stack-merging infra).
  applyInGameSplice(ctx, params, target) {
    // Both targets come from ctx.allTargets (not the per-effect target).
    // Defensive: the activation path threads allTargets in; if missing
    // (e.g., called from a trigger path that hasn't been updated), abort.
    const all = ctx.allTargets;
    if (!Array.isArray(all) || all.length < 2) {
      log(`${ctx.sourceName} fizzles — needs two targets.`, 'sp');
      return;
    }
    const t0 = all[0], t1 = all[1];
    if (!t0 || !t1) { log(`${ctx.sourceName} fizzles — target missing.`, 'sp'); return; }
    // ─── Resolve each target into a uniform shape ──────────────────────
    // resolveStackOrPermanent (module helper) handles both target.kind
    // values that Stapler's permanentOrSpell target accepts. Returns
    // { kind: 'perm'|'spell', card, controller, stackItem? } or null on
    // fizzle (target gone from battlefield, or no-longer-on-stack spell).
    const r0 = resolveStackOrPermanent(t0);
    const r1 = resolveStackOrPermanent(t1);
    if (!r0 || !r1) { log(`${ctx.sourceName} fizzles — target gone.`, 'sp'); return; }
    if (r0.card.iid === r1.card.iid) {
      log(`${ctx.sourceName} fizzles — can't staple a card to itself.`, 'sp'); return;
    }
    // ─── Auto-determine base ───────────────────────────────────────────
    // Delegates to canonicalSplicePair (module-scope helper) so the
    // type-priority rule lives in one place and the reward-time path
    // and Stapler stay in sync. Returns swap=true if t0 and t1 should
    // be reordered to make t0 the base.
    const [canonBaseTpl, canonStapleTpl, swapped] = canonicalSplicePair(
      r0.card.tplId, r1.card.tplId);
    const baseR = swapped ? r1 : r0;
    const stapleR = swapped ? r0 : r1;
    const baseCard = baseR.card;
    const stapleCard = stapleR.card;
    // ─── Eligibility ──────────────────────────────────────────────────
    if (!isSpliceableBase(baseCard.tplId)) {
      log(`${ctx.sourceName} fizzles — ${baseCard.name} can't be a splice base.`, 'sp'); return;
    }
    // Reject already-stapled cards as staples (stapled-as-staple is forbidden
    // in v1 for the same reason it's forbidden in the reward path: the synth
    // path needs the staple to be a single unmerged template). Note: on
    // IN-GAME cards the staple chain lives at card.stapledFrom.stapledTpls
    // (set by makeCard via synthesizeStapledTemplate), NOT card.stapledTpls
    // (which is a slot-level field). Previous code read the wrong field and
    // the guard never fired — leading to silent data loss when the base's
    // prior chain was also misread. v1.0.60 — fixed by reading via the
    // stapledFrom path.
    const stapleStaples = (stapleCard.stapledFrom && Array.isArray(stapleCard.stapledFrom.stapledTpls))
      ? stapleCard.stapledFrom.stapledTpls
      : (Array.isArray(stapleCard.stapledTpls) ? stapleCard.stapledTpls : []);
    if (stapleStaples.length > 0) {
      log(`${ctx.sourceName} fizzles — ${stapleCard.name} is already stapled.`, 'sp'); return;
    }
    if (!isCompatibleStaplePair(baseCard.tplId, stapleCard.tplId)) {
      log(`${ctx.sourceName} fizzles — ${baseCard.name} and ${stapleCard.name} aren't compatible.`, 'sp'); return;
    }
    // ─── Fire any stack-input's effects against their original targets ─
    // For each input on the stack (spell), resolve its effects now using
    // its locked-in targets. After firing, remove the spell from the stack
    // — it's consumed by Stapler (does NOT go to the original caster's
    // graveyard like a normal spell resolution; it ceases to exist).
    // Snapshotted "last known information" target semantics handled by
    // applyEffect's existing snapshot path.
    const fireStackEffects = (r) => {
      if (r.kind !== 'spell') return;
      const item = r.stackItem;
      const spellCard = item.card;
      const spellCtx = { controller: item.controller, sourceName: spellCard.name, sourceIid: spellCard.iid, sourceCard: spellCard };
      // Mirror resolveTopOfStack's effect loop. Use the spell's locked-in
      // targets via item.targets; targetSlot dispatch via getTargetForSlot.
      const slotSnapshots = new Map();
      const itemTargets = Array.isArray(item.targets) ? item.targets : [];
      const getTargetForSlot = (slot) => {
        const tgt = itemTargets[slot] || null;
        if (!slotSnapshots.has(slot)) {
          slotSnapshots.set(slot, tgt ? snapshotTarget(tgt) : null);
        }
        return { tgt, snap: slotSnapshots.get(slot) };
      };
      const activeEffects = effectsForMode(spellCard, item.modeIdx);
      for (const eff of activeEffects) {
        let tgt = null;
        let snap = null;
        if (eff.target === 'self') {
          if (effectOperatesOnCreature(eff)) {
            tgt = {kind:'creature', iid: spellCard.iid, label: spellCard.name};
            snap = snapshotTarget(tgt);
          } else {
            tgt = {kind:'player', who: item.controller};
            snap = tgt;
          }
        } else if (effectNeedsTarget(eff)) {
          const slot = eff.targetSlot || 0;
          const fetched = getTargetForSlot(slot);
          tgt = fetched.tgt;
          snap = fetched.snap;
        }
        applyEffect(spellCtx, eff, tgt, snap);
      }
      // Remove the spell from the stack. NOT routed to graveyard — Stapler
      // consumed it. The spell's resolution-time effects fired above; the
      // card itself ceases to exist as a spell (it gets absorbed into the
      // merged template via the slot mutation below).
      const stIdx = G.stack.indexOf(item);
      if (stIdx >= 0) G.stack.splice(stIdx, 1);
    };
    // Fire staple first (the one being absorbed), then base if it was a
    // spell. Order matters: if both are spells, firing staple first
    // matches the typical mental model "staple resolves into base"; but
    // honestly with no shared state between them it doesn't change
    // outcomes. Consistent ordering for predictability.
    fireStackEffects(stapleR);
    if (baseR.kind === 'spell') fireStackEffects(baseR);
    // ─── Merge math ─────────────────────────────────────────────────────
    const baseTpl = CARDS[baseCard.tplId];
    const baseEffectCount = countEffects(baseTpl);
    const baseTriggerCount = (baseTpl.triggers || []).length;
    const baseAbilityCount = (baseTpl.abilities || []).length;
    const baseIsCreature = baseTpl.type === 'Creature';
    const stapleIsCreature = CARDS[stapleCard.tplId] && CARDS[stapleCard.tplId].type === 'Creature';
    // Read base's existing staple chain. Same field-name trap as in the
    // stapleStaples check above: in-game cards carry the chain at
    // card.stapledFrom.stapledTpls (set by synthesizeStapledTemplate via
    // makeCard), NOT at card.stapledTpls. Previous code read the wrong
    // field, returning [] for cards that had been stapled at game-start
    // OR via earlier Stapler activations — which meant the merge math
    // forgot the prior chain and produced a "regressed" merged card.
    const priorStaples = (baseCard.stapledFrom && Array.isArray(baseCard.stapledFrom.stapledTpls))
      ? baseCard.stapledFrom.stapledTpls.slice()
      : (Array.isArray(baseCard.stapledTpls) ? baseCard.stapledTpls.slice() : []);
    let priorMergedEffectCount = baseEffectCount;
    let priorMergedTriggerCount = baseTriggerCount;
    let priorMergedAbilityCount = baseAbilityCount;
    for (const priorTplId of priorStaples) {
      const priorTpl = CARDS[priorTplId];
      if (!priorTpl) continue;
      if (baseIsCreature && priorTpl.type === 'Creature') {
        priorMergedTriggerCount += (priorTpl.triggers || []).length;
        priorMergedAbilityCount += (priorTpl.abilities || []).length;
      } else if (baseIsCreature) {
        priorMergedTriggerCount += 1;
      } else {
        priorMergedEffectCount += countEffects(priorTpl);
      }
    }
    const newStapledTpls = priorStaples.concat([stapleCard.tplId]);
    const mergedStickers = (baseCard.stickers || []).concat(stapleCard.stickers || []);
    const stapleRolls = (stapleCard.empowerRolls || []).slice();
    const remappedRolls = stapleRolls.map(roll =>
      remapEmpowerRollForStaple(roll, baseIsCreature, stapleIsCreature,
                                priorMergedEffectCount, priorMergedTriggerCount, priorMergedAbilityCount));
    const mergedRolls = (baseCard.empowerRolls || []).concat(remappedRolls);
    // Subtype rolls — simple concat. The Nth 'subtype' sticker in the merged
    // stickers list consumes the Nth roll; since stickers are concatenated
    // base-then-staple, the rolls follow the same order. No remap needed —
    // subtypes are tokens, not target-indexed effects.
    const mergedSubtypeRolls = (baseCard.subtypeRolls || []).concat(stapleCard.subtypeRolls || []);
    const mergedPermaBuffs = (Array.isArray(baseCard.permaBuffs) ? baseCard.permaBuffs.slice() : [])
      .concat(Array.isArray(stapleCard.permaBuffs) ? stapleCard.permaBuffs : []);
    const baseBonus = baseCard.bonusTrigger;
    const stapleBonus = stapleCard.bonusTrigger;
    const mergedBonus = baseBonus || stapleBonus || null;
    // ─── Determine ownership of the merged result ──────────────────────
    // Rule (v1.0.54): if AT LEAST ONE input is the caster's, the caster
    // owns the merged result (slot lives in caster's runState, in-game
    // card moves to caster's battlefield). If NEITHER input is the
    // caster's, the splice is pure removal — the merged result stays
    // with its base's owner (typically opp), no slot is minted anywhere
    // (opp's slots are transient per-game), and the in-game card stays
    // on the base's battlefield.
    //
    // This is principled: contributing one of your cards earns you the
    // upgrade; messing with only opp's stuff is just attrition.
    const callerContributes = (baseCard.owner === ctx.controller) || (stapleCard.owner === ctx.controller);
    const resultOwner = callerContributes ? ctx.controller : baseCard.owner;
    const mintSlot = callerContributes;   // only mint a persistent slot when caster contributes
    // ─── Branch: base is permanent vs base is spell ────────────────────
    if (baseR.kind === 'perm') {
      // ─── PERM-BASE PATH (P+P, P+S, S+P) ────────────────────────────
      if (stapleR.kind === 'perm') {
        const stapleBf = G[stapleR.controller].battlefield;
        const stapleIdx = stapleBf.findIndex(c => c.iid === stapleCard.iid);
        if (stapleIdx >= 0) stapleBf.splice(stapleIdx, 1);
        clearRestrictionsFromSource(stapleCard.iid);
      }
      // Remove staple's persistent slot if it's the caster's. For opp's
      // slots, slotIdx is transient per-game — no removal needed.
      if (stapleCard.owner === 'you' && typeof stapleCard.slotIdx === 'number'
          && typeof RUN !== 'undefined' && RUN.removeSlotByIdx) {
        const removedIdx = stapleCard.slotIdx;
        RUN.removeSlotByIdx(removedIdx);
        // CRITICAL: removeSlotByIdx splices out the slot, shifting every
        // higher index down by 1. In-game cards (Stapler itself, any other
        // card in any zone) hold cached slotIdx pointers that are now
        // stale for indices > removedIdx. Without this fixup, the next
        // charge-accounting block reads slots[stapler.slotIdx] which is
        // either undefined or the wrong slot — silently no-op'ing the
        // charge decrement. Mirrors the pattern in ripSlotByIdx (line ~8290).
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
      // Determine the slot home for the merged result. Only mint when the
      // caster contributed; opp-only splices leave no persistent slot.
      let newSlotIdx = null;
      if (mintSlot) {
        const reuseBaseSlot = (baseCard.owner === ctx.controller && typeof baseCard.slotIdx === 'number');
        newSlotIdx = reuseBaseSlot
          ? baseCard.slotIdx
          : (typeof RUN !== 'undefined' && RUN.appendSlot ? RUN.appendSlot(baseCard.tplId, mergedStickers) : null);
        // Populate the slot's merged state.
        if (typeof RUN !== 'undefined' && RUN.getSlots) {
          const slots = RUN.getSlots();
          const slot = (typeof newSlotIdx === 'number') ? slots[newSlotIdx] : null;
          if (slot) {
            slot.stapledTpls = newStapledTpls;
            slot.stickers = mergedStickers;
            slot.empowerRolls = mergedRolls;
            if (mergedSubtypeRolls.length > 0) slot.subtypeRolls = mergedSubtypeRolls;
            if (mergedPermaBuffs.length > 0) slot.permaBuffs = mergedPermaBuffs;
            if (mergedBonus) slot.bonusTrigger = mergedBonus;
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
          slot.stapledTpls = newStapledTpls;
          slot.stickers = mergedStickers;
          slot.empowerRolls = mergedRolls;
          if (mergedSubtypeRolls.length > 0) slot.subtypeRolls = mergedSubtypeRolls;
          if (mergedPermaBuffs.length > 0) slot.permaBuffs = mergedPermaBuffs;
          if (mergedBonus) slot.bonusTrigger = mergedBonus;
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
// EXPRESSIONS — effect params can be literals or {from:'<name>'} resolved at
// apply time. Targets snapshotted at resolution start ("last known info")
// so later effects read pre-resolution state. To add: case in resolveExpr.

// Snapshot a target into a stable record, immune to destroy/exile mid-resolution.
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
  // Other kinds (stack, etc.) pass through; expressions don't currently use them.
  return target;
}

// Resolve an expression value. Literals pass through; {from:'<name>'} reads
// from snapshot/ctx. See switch cases below for the vocabulary.
function resolveExpr(value, ctx, targetSnap) {
  if (value == null) return value;
  if (typeof value !== 'object' || !value.from) return value;
  switch (value.from) {
    case 'targetPower':
      return (targetSnap && typeof targetSnap.power === 'number') ? targetSnap.power : 0;
    case 'targetToughness':
      return (targetSnap && typeof targetSnap.toughness === 'number') ? targetSnap.toughness : 0;
    case 'targetController':
      return (targetSnap && targetSnap.controller) ? targetSnap.controller : ctx.controller;
    case 'sourcePower': {
      const sc = ctx.sourceCard;
      if (!sc) return 0;
      const [pow] = getStats(sc);
      return pow;
    }
    case 'sourceToughness': {
      const sc = ctx.sourceCard;
      if (!sc) return 0;
      const [, tou] = getStats(sc);
      return tou;
    }
    case 'countCreaturesYou':
      return G[ctx.controller].battlefield.filter(c => c.type === 'Creature').length;
    case 'countCreaturesOpp':
      return G[opp(ctx.controller)].battlefield.filter(c => c.type === 'Creature').length;
    default:
      console.warn('Unknown expression:', value.from);
      return 0;
  }
}

// Walk an effect's top-level fields and resolve any {from:...} expressions
// against the target snapshot + ctx. Returns a new effect object with
// resolved values. Non-expression fields (kind, target, etc.) pass through.
function resolveEffectParams(effect, ctx, targetSnap) {
  const out = {};
  for (const key of Object.keys(effect)) {
    out[key] = resolveExpr(effect[key], ctx, targetSnap);
  }
  return out;
}

function applyEffect(ctx, effect, target, targetSnap) {
  const fn = EFFECTS[effect.kind];
  if (!fn) { console.warn('Unknown effect:', effect.kind); return; }
  // Resolve dynamic params before handing off. Effects always see static
  // values — the {from:...} machinery is invisible to them.
  // If the caller passed a snapshot (multi-effect spell needing pre-resolution
  // state), use it. Otherwise snapshot the live target now.
  const snap = (targetSnap !== undefined) ? targetSnap : snapshotTarget(target);
  const resolved = resolveEffectParams(effect, ctx, snap);
  fn(ctx, resolved, target);
}
function effectNeedsTarget(eff) { return !!eff.target && eff.target !== 'self'; }

// Single source of truth for "does this effect kind operate on a creature
// (vs a player)?" Used by both the spell resolver and the trigger resolver
// to decide what target:'self' means: the source creature for creature-
// effects, the source's controller for player-effects.
//
// Add new creature-operating effects here when introducing them. Player-
// operating effects (damage, gainLife, draw, discard, addMana) do NOT go
// here — they correctly resolve self → source's controller.
const CREATURE_EFFECT_KINDS = new Set([
  'pump', 'weaken', 'addCounter', 'untap', 'removeCreature',
  'fightTarget', 'endomorphAbsorb', 'flicker', 'exileUntilEOT',
  'restrict', 'grantKeyword', 'shuffleIntoLibrary', 'steal',
  'sacrifice', 'gainControl',
]);
function effectOperatesOnCreature(eff) {
  return CREATURE_EFFECT_KINDS.has(eff.kind);
}

// Modal: card.effects is either flat list (single-mode) or {modes:[[...],...]}.
// getModes normalizes — always returns an array of modes. Iterate via
// getModes(card)[modeIdx || 0], never card.effects directly.
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
// Pull the active effect list given a (card, modeIdx). Modeless cards
// ignore modeIdx and return their flat effects.
function effectsForMode(card, modeIdx) {
  const modes = getModes(card);
  return modes[modeIdx || 0] || [];
}
// Flatten card.effects across all modes. Use for "does card contain effect
// X anywhere?" queries (counterspell detection, sticker eligibility). For
// resolution with a locked-in mode, use effectsForMode instead.
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
// Sugar for the common "does this card have an effect matching X" pattern.
// Equivalent to allCardEffects(card).some(predicate) but reads more clearly
// at call sites and avoids allocating the intermediate array.
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

// =========================================================================
// EVENTS & TRIGGERS — every state change emits {type, ...payload}. emit()
// walks battlefields, calls each trigger's condition(self, evt), queues
// matches in G.pendingTriggers (drained to stack at next priority round).
// Card trigger shape: {event, condition, effects, text}. At resolution,
// targeted effects re-validate per MtG-modern fizzle rule.
// =========================================================================
const TRIGGER_DEPTH_CAP = 100;

// Apply lord-granted keywords to applicable creatures. Called from emit()
// before triggers fire so any battlefield change reconciles before triggers
// see post-state. Idempotent (one entry per (target, lord, kw) in grantedBy).
// Lord-leave cleanup goes through clearRestrictionsFromSource. One-way apply
// is sufficient: a creature only stops matching by leaving play, which also
// clears grantedBy.
function applyStaticKeywordGrants() {
  if (!G || !G.you || !G.opp) return;
  const all = [
    ...G.you.battlefield.map(c => ({ card: c, controller: 'you' })),
    ...G.opp.battlefield.map(c => ({ card: c, controller: 'opp' })),
  ];
  for (const { card: lord, controller: lordCtrl } of all) {
    if (!lord.staticBuffs) continue;
    for (const buff of lord.staticBuffs) {
      if (!buff.keywords || !buff.keywords.length) continue;
      for (const { card: target, controller: tgtCtrl } of all) {
        if (target.iid === lord.iid) continue;     // lords don't grant to themselves
        if (target.type !== 'Creature') continue;  // walls of a different type? — skip non-creatures defensively
        if (!matchFilter(target, buff.filter, tgtCtrl, lordCtrl)) continue;
        if (buff.subtype) {
          const sub = target.sub || '';
          const re = new RegExp('\\b' + buff.subtype + '\\b');
          if (!re.test(sub)) continue;
        }
        // Apply each keyword via the existing grantedBy infrastructure,
        // mirroring what the grantKeyword effect handler does. Source
        // iid is the lord's, so when the lord leaves play
        // clearRestrictionsFromSource finds and revokes these grants.
        if (!(target.grantedBy instanceof Map)) target.grantedBy = new Map();
        for (const kw of buff.keywords) {
          if (!target.grantedBy.has(kw)) target.grantedBy.set(kw, new Set());
          if (target.grantedBy.get(kw).has(lord.iid)) continue;  // already applied
          target.grantedBy.get(kw).add(lord.iid);
          if (!target.keywords.includes(kw)) target.keywords.push(kw);
        }
      }
    }
  }
}

function emit(evt, extraSources) {
  if (G.gameOver) return;
  // Reconcile static lord keyword grants before any trigger fires. This
  // catches the cases where (a) a lord just ETB'd (its grants need to
  // propagate), and (b) a tribe member just ETB'd (existing lords need
  // to grant to the newcomer). Idempotent — see applyStaticKeywordGrants.
  applyStaticKeywordGrants();
  // Walk every card on every battlefield, plus any extraSources passed in.
  // extraSources is used for events where the source has just left play
  // (e.g., dies-triggers — the dying card is no longer on the battlefield
  // by the time we emit, but its trigger should still fire from a snapshot
  // of the card "as it left play"). Each source: {card, controller}.
  const checkSource = (card, who) => {
    if (!card.triggers || card.triggers.length === 0) return;
    for (const trig of card.triggers) {
      if (trig.event !== evt.type) continue;
      // Bilingual condition resolver — handles both new condId form and
      // legacy closure form. See evalTriggerCondition for resolution rules.
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

// Returns true if the trigger has no targeted effects (always queueable),
// OR if every targeted effect has at least one currently-valid target.
function triggerHasAnyValidTarget(trig, controller) {
  for (const eff of (trig.effects || [])) {
    if (!effectNeedsTarget(eff)) continue;
    const valid = getValidTargets(eff, controller);
    if (valid.length === 0) return false;
  }
  return true;
}

// True if a trigger's effect requires a real player choice.
// Auto-pick (no prompt): no target, target='self'|'player'|'spell'.
// Prompt: target='creature'|'any' with >1 valid option.
function triggerNeedsPlayerChoice(eff, controller) {
  if (!effectNeedsTarget(eff)) return false;
  const tgt = eff.target;
  // 'opp' = implicit single opponent target, no choice. Same exemption as
  // 'self' (caster), 'player' (auto-resolved to opp by pickBestTriggerTarget),
  // and 'spell' (resolved against top of stack).
  if (tgt === 'self' || tgt === 'player' || tgt === 'spell' || tgt === 'opp') return false;
  // 'creature' or 'any' — real choice possible. Only prompt if there's
  // more than one valid target (one valid = forced choice = auto-pick fine).
  const valid = getValidTargets(eff, controller);
  return valid.length > 1;
}

// Move queued triggers onto the stack. Active player's triggers go first,
// then non-active player's. Within a controller's triggers, they're queued
// in firing order.
//
// If a player-controlled trigger requires a meaningful target choice, we
// stop draining and set G.pendingTriggerTarget — the engine then waits for
// the player to pick. The remaining un-drained triggers stay in
// pendingTriggers and will drain after the prompt is resolved.
function drainTriggers() {
  if (G.gameOver) return false;
  if (G.pendingTriggerTarget) return false;   // already waiting on a prompt
  if (G.pendingTriggers.length === 0) return false;
  const active = G.activePlayer;
  // Stable partition: active player's triggers, then opponent's.
  const ordered = [
    ...G.pendingTriggers.filter(p => p.controller === active),
    ...G.pendingTriggers.filter(p => p.controller !== active),
  ];
  G.pendingTriggers = [];
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    // Find the first targeted effect that needs a player prompt.
    const promptEff = (p.controller === 'you')
      ? (p.trig.effects || []).find(e => triggerNeedsPlayerChoice(e, p.controller))
      : null;
    if (promptEff) {
      // Stop draining. Set the prompt; remaining triggers wait in queue.
      G.pendingTriggers = ordered.slice(i);   // includes the current one (its slot)
      // Replace the current with itself + a marker that we're prompting on it.
      const valid = getValidTargets(promptEff, p.controller);
      G.pendingTriggerTarget = {
        controller: p.controller,
        sourceIid: p.sourceIid,
        sourceName: p.sourceName,
        trig: p.trig,
        promptEff,
        valid,
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
  // Triggers go on the stack like spells. We construct a stack item that
  // resolveTopOfStack() understands as a trigger. AI/player can interact
  // (counter, respond) just like with spells.
  // For targeted triggers, target is chosen NOW (when going on stack),
  // matching MtG rules. AI auto-picks; player would need a UI prompt —
  // for v1 we auto-pick the AI heuristic for the player too on triggers
  // they don't directly cause (acceptable since trigger targets are
  // usually obvious / forced). NOTE: future improvement = full UI prompt.
  const targetEff = (p.trig.effects || []).find(effectNeedsTarget);
  let chosenTarget = null;
  if (targetEff) {
    const valid = getValidTargets(targetEff, p.controller);
    if (valid.length === 0) {
      // Shouldn't happen — pre-queue check should have prevented this,
      // but if state changed between queue and drain, fizzle silently.
      log(`${p.sourceName} trigger fizzles — no legal target.`, 'sp');
      return;
    }
    // Auto-pick: best target via the AI heuristic shape (works for both).
    // We pick the highest-scoring target. For player-controlled triggers,
    // this is a v1 simplification — proper UI prompt is future work.
    chosenTarget = pickBestTriggerTarget(targetEff, valid, p.controller);
  }
  G.stack.push({
    kind: 'trigger',
    trig: p.trig,
    sourceIid: p.sourceIid,
    sourceName: p.sourceName,
    controller: p.controller,
    targets: chosenTarget ? [chosenTarget] : [],
    // Carry the original triggering event onto the stack item so the
    // resolver can expose it via ctx.event. Most effects don't need this;
    // ones that operate on a non-target reference (e.g., Endomorph reading
    // the dying creature's keywords from the cardDies event) do.
    event: p.event || null,
  });
  log(`${p.sourceName} triggers: ${p.trig.text || p.trig.event}.`, 'sp');
  // Putting something on the stack opens (or restarts) a priority round.
  if (!G.priority) G.priority = { passes: new Set() };
  G.priority.passes.clear();
  G.priorityHolder = opp(p.controller);
}

// Pick best target for a trigger. Auto-picks for both AI and player in v1.
function pickBestTriggerTarget(eff, valid, controller) {
  const them = opp(controller);
  // Resolve creature target's controller (getValidTargets doesn't populate it).
  const ctrlOf = t => {
    const f = findCard(t.iid);
    return f ? f.controller : null;
  };
  // Damage to "any target" — try to kill an opp creature, else hit face.
  if (eff.kind === 'damage') {
    const amt = eff.amount || 0;
    const oppCreatures = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === them);
    // Prefer killing the highest-toughness creature we can lethal.
    const killable = oppCreatures
      .map(t => { const f = findCard(t.iid); return {t, tou: f ? getStats(f.card)[1] - f.card.damage : 99}; })
      .filter(x => x.tou <= amt)
      .sort((a, b) => b.tou - a.tou);
    if (killable.length) return killable[0].t;
    // Otherwise pick opp face if available.
    const oppFace = valid.find(t => t.kind === 'player' && t.who === them);
    if (oppFace) return oppFace;
  }
  // Discard / hand attack — always opp.
  if (eff.kind === 'discard') {
    const oppFace = valid.find(t => t.kind === 'player' && t.who === them);
    if (oppFace) return oppFace;
  }
  // Removal-y stuff — pick opp's biggest creature.
  const harmful = ['removeCreature', 'restrict', 'fightTarget'];
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
  // Buff-y stuff — prefer our biggest creature.
  if (['pump', 'addCounter', 'untap'].includes(eff.kind)) {
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
  // grantKeyword: behavior depends on whether the keyword is a buff or a
  // debuff. Defender is the only current debuff (locks creatures down) —
  // we want it on opp's best creature. Everything else (flying, haste,
  // etc.) is a buff — we want it on our best.
  if (eff.kind === 'grantKeyword') {
    const isDebuff = (eff.keyword === 'defender');
    const wantedCtrl = isDebuff ? them : controller;
    const candidates = valid.filter(t => t.kind === 'creature' && ctrlOf(t) === wantedCtrl);
    // Skip targets that already have this keyword (the grant would be a no-op).
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
  // tap: similar to removal in spirit (locks down opp creatures), but our own
  // tapped creature is wasted. Prefer untapped opp creatures.
  // (removeCreature with severity 1 is handled in the harmful branch above.)
  // Graveyard recursion: pick the highest-value creature in our graveyard.
  // Targets here are kind:'graveyardCreature' so we look up the card in
  // the controller's graveyard rather than via findCard (battlefield only).
  if (eff.kind === 'returnFromGraveyard') {
    const graveCards = G[controller].graveyard;
    const scored = valid
      .filter(t => t.kind === 'graveyardCreature')
      .map(t => {
        const card = graveCards.find(c => c.iid === t.iid);
        return {t, value: card ? (cardValueOrZero(card)) : 0};
      })
      .sort((a, b) => b.value - a.value);
    if (scored.length) return scored[0].t;
  }
  // Last resort: first valid target.
  return valid[0];
}

// Lightweight intrinsic-value helper for in-engine target picking — avoids
// reaching into the AI module (which itself imports ENGINE). Mirrors the
// AI's getCardValue intent at a coarser grain. Used by graveyard recursion
// pickers since the AI's full scorer isn't available here.
function cardValueOrZero(card) {
  if (!card) return 0;
  const cost = costTotalCard(card);
  if (card.type === 'Creature') {
    const [pow, tou] = getStats(card);
    return pow + tou + cost * 2;       // bigger + costlier = more worth recurring
  }
  return cost * 2;
}

// Resolve a trigger from the stack. Called by resolveTopOfStack when
// item.kind === 'trigger'. Re-validates targets per modern MtG rules.
function resolveTrigger(item) {
  G.triggerChainDepth = (G.triggerChainDepth || 0) + 1;
  if (G.triggerChainDepth > TRIGGER_DEPTH_CAP) {
    log(`Trigger chain too deep (${TRIGGER_DEPTH_CAP}) — bailing to prevent loop.`, 'imp');
    return;
  }
  const ctx = {
    sourceIid: item.sourceIid,
    sourceName: item.sourceName,
    controller: item.controller,
    // Best-effort sourceCard lookup — the source may have left play between
    // queueing and resolution. Used by `from: sourcePower` etc.
    sourceCard: (() => {
      const f = item.sourceIid != null ? findCard(item.sourceIid) : null;
      return f ? f.card : null;
    })(),
    // Original triggering event, for effects that read off-target data
    // (e.g., Endomorph reading the dying creature's keywords). null for
    // non-trigger resolves.
    event: item.event || null,
  };
  // Multi-target dispatch (mirrors resolveTopOfStack). By default, all
  // targeted effects share item.targets[0]. Effects can opt into a distinct
  // slot via `targetSlot: N`. Triggers today are mostly single-target;
  // multi-target support exists for symmetry with spells.
  const triggerSlotSnapshots = new Map();
  const triggerTargets = Array.isArray(item.targets) ? item.targets : [];
  const getTriggerTargetForSlot = (slot) => {
    const tgt = triggerTargets[slot] || null;
    if (!triggerSlotSnapshots.has(slot)) {
      triggerSlotSnapshots.set(slot, tgt ? snapshotTarget(tgt) : null);
    }
    return { tgt, snap: triggerSlotSnapshots.get(slot) };
  };
  for (const eff of (item.trig.effects || [])) {
    if (effectNeedsTarget(eff)) {
      const slot = eff.targetSlot || 0;
      const { tgt, snap } = getTriggerTargetForSlot(slot);
      if (!tgt) { log(`${item.sourceName} trigger fizzles — no target.`, 'sp'); continue; }
      // Note: we deliberately don't re-validate the target here. Multi-effect
      // triggers (Exorcist's [exile, gainLife]) need effect 1 to operate on
      // the SNAPSHOT taken before effect 0 ran — re-validating after exile
      // would make findCard return null and falsely fizzle the lifegain.
      // Each effect that needs a LIVE target (removeCreature, damage-to-
      // creature, etc.) handles missing-target via its own findCard guard.
      // Effects that read only from the snapshot (gainLife with from-exprs)
      // resolve correctly even when the live target is gone. Matches the
      // spell resolver's behavior.
      applyEffect(ctx, eff, tgt, snap);
    } else {
      // Untargeted, OR target:'self'. For self, what we pass depends on
      // what the effect operates on:
      //   - Creature-operating effects (pump, tap, untap, bounce, destroy,
      //     exile) treat 'self' as the source creature.
      //   - Player-operating effects (gainLife, damage, discard, draw)
      //     treat 'self' as the source's controller.
      let selfTarget = null;
      let selfSnap = null;
      if (eff.target === 'self') {
        if (effectOperatesOnCreature(eff)) {
          selfTarget = { kind: 'creature', iid: item.sourceIid, label: item.sourceName };
          selfSnap = snapshotTarget(selfTarget);
        } else {
          selfTarget = { kind: 'player', who: item.controller };
          selfSnap = selfTarget;
        }
      }
      applyEffect(ctx, eff, selfTarget, selfSnap);
    }
  }
  afterEffectsApplied();
}

// ----- Targeting -----
function getValidTargets(effect, controller) {
  const allCreatures = [
    ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
    ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
  ].filter(x => x.card.type === 'Creature')
   // Hexproof: creature can't be targeted by spells/abilities controlled by
   // its opponent. Excluded from target lists when source's controller != ctrl.
   .filter(x => !(x.card.keywords.includes('hexproof') && x.ctrl !== controller));
  switch (effect.target) {
    case 'any':
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
      // Implicit-opponent target — no player choice involved. Used by the
      // Architect's Codex generator for effects like "opponent discards a
      // card" where there's no targeting decision (effect always lands on
      // controller's opponent). Returns the opponent as a single 'player'
      // target so downstream resolvers (discard, damage, etc.) that branch
      // on target.kind === 'player' work without special-casing.
      return [{kind:'player', who: opp(controller), label: G[opp(controller)].name}];
    case 'creature':
      return allCreatures
        .filter(x => matchFilter(x.card, effect.filter, x.ctrl, controller))
        .map(x => ({kind:'creature', iid:x.card.iid, label:x.card.name}));
    case 'permanent':
      // Any permanent on either battlefield — Creatures + Lands + Artifacts.
      // Artifacts (Stapler is the first) get included here so Stapler-style
      // effects could target other artifacts. Stapler's eligibility filter
      // (spliceableBase / spliceableStaple) then excludes Stapler-itself
      // and other special cards via isSpliceableBase/isSpliceableStaple.
      // Hexproof still applies to creatures (can't target opp's hexproof
      // creatures). Lands are never hexproof.
      return [
        ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
        ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
      ]
        .filter(x => x.card.type === 'Creature' || x.card.type === 'Land' || x.card.type === 'Artifact')
        .filter(x => !(x.card.keywords && x.card.keywords.includes('hexproof') && x.ctrl !== controller))
        .filter(x => matchFilter(x.card, effect.filter, x.ctrl, controller))
        .map(x => ({kind:'permanent', iid:x.card.iid, label:x.card.name}));
    case 'graveyardCreature':
      // Creature cards in the casting controller's graveyard. Hexproof
      // doesn't apply (graveyard is your own private pile; nothing in
      // there is "protected from you"). Used by recursion effects like
      // Grave Digger that pull a creature back to hand. Filters apply —
      // e.g., Spirit Shepherd uses filter:{subtype:'Spirit'} to restrict
      // to its own tribe.
      return G[controller].graveyard
        .filter(c => c.type === 'Creature')
        .filter(c => matchFilter(c, effect.filter, controller, controller))
        .map(c => ({kind:'graveyardCreature', iid: c.iid, label: c.name, controller}));
    case 'spell':
      return G.stack
        .filter(s => s.kind !== 'trigger' && s.card)
        .map(s => ({kind:'stack', stackItem: s, label: s.card.name}));
    case 'permanentOrSpell': {
      // Union of 'permanent' and 'spell' target kinds — used by Stapler
      // (v1.0.53+) to let a single target slot accept either a battlefield
      // permanent or a spell on the stack. Eligibility filters apply
      // separately to each half: a permanent passes if it's a spliceable
      // base/staple (matchFilter), a spell passes if its card template is
      // spliceable (matchFilterSpell — separate path, since stack items
      // are not card instances on the battlefield and matchFilter's
      // hexproof / controller checks don't make sense for stack items).
      const perms = [
        ...G.you.battlefield.map(c => ({card: c, ctrl: 'you'})),
        ...G.opp.battlefield.map(c => ({card: c, ctrl: 'opp'})),
      ]
        .filter(x => x.card.type === 'Creature' || x.card.type === 'Land' || x.card.type === 'Artifact')
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

// Stack-item filter for splice eligibility. Stack items are spells (not on
// the battlefield), so the matchFilter checks for tapped/controller/hexproof
// don't apply. The only filter axes that matter for v1's Stapler use case:
// the spliceableBase/spliceableStaple keys. Extensible — add filter axes
// here as needed (e.g., spell color, type).
function matchFilterSpell(card, filter) {
  if (!filter) return true;
  if (filter.spliceableBase && !isSpliceableBase(card.tplId)) return false;
  if (filter.spliceableStaple && !isSpliceableStaple(card.tplId)) return false;
  // Defensive: tokens currently can't appear on the stack as spells (they're
  // minted directly onto battlefields), but if a future mechanic puts one
  // there, Steal still shouldn't try to add it to the player's deck.
  if (filter.notToken && card.isToken) return false;
  return true;
}
function matchFilter(card, filter, controller, who) {
  if (!filter) return true;
  if (filter.tapped !== undefined && card.tapped !== filter.tapped) return false;
  if (filter.notColor && card.color === filter.notColor) return false;
  if (filter.color && card.color !== filter.color) return false;
  if (filter.controller === 'self' && controller !== who) return false;
  if (filter.controller === 'opp'  && controller === who) return false;
  if (filter.maxTough !== undefined) {
    const [, t] = getStats(card);
    if (t > filter.maxTough) return false;
  }
  // Subtype filter — used by tribal recursion (Spirit Shepherd's "return a
  // Spirit creature card") and any future "destroy target Goblin", "exile
  // target Wizard" style restrictions. Cards may have multi-subtype strings
  // ("Wizard Artificer"), so we substring-match.
  if (filter.subtype && (!card.sub || card.sub.indexOf(filter.subtype) === -1)) return false;
  // Keyword filter — used by green's anti-flying answers (Choking Vines,
  // Vine Strangle) to restrict targeting to flying creatures specifically.
  // Generic over keyword name so future "destroy target indestructible"
  // or "destroy target tapped creature with menace" cards can compose.
  if (filter.hasKeyword && !(card.keywords || []).includes(filter.hasKeyword)) return false;
  // notToken filter: rejects token permanents/spells. Used by Steal — you
  // can't put a token into your library as a trophy because tokens have no
  // CARDS template to instantiate from on later games. Mirrors how the
  // Stapler filters tokens implicitly via isSpliceableBase/Staple's
  // CARDS[tplId] guard.
  if (filter.notToken && card.isToken) return false;
  // Spliceable-base filter (Stapler's first target). Must be a card that
  // can act as a base in the existing splice infrastructure: no Lands, no
  // special creatures (Elystra/Codex/Stapler itself), no tokens, no modal
  // cards. Routes through isSpliceableBase which is the canonical check.
  if (filter.spliceableBase && !isSpliceableBase(card.tplId)) return false;
  // Spliceable-staple filter (Stapler's second target). Must be a card
  // that can act as a staple-half: spliceable AND not already stapled
  // (the stapled-as-staple constraint). Tokens fail isSpliceableStaple's
  // template lookup since they live in TOKENS, not CARDS — handled inside
  // the helper.
  if (filter.spliceableStaple) {
    if (!isSpliceableStaple(card.tplId)) return false;
    // "Already stapled" check — see the field-name note in applyInGameSplice.
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
  if (a.kind === 'graveyardCreature') return a.iid === b.iid;
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
  // Re-apply permaBuffs from slot for permanentEot creatures (Elystra). Buffs
  // accumulate across the game on slot.permaBuffs; the card's modifier was
  // stale from makeCard time. Strip and re-apply with current slot state.
  if (Array.isArray(card.modifiers)) {
    card.modifiers = card.modifiers.filter(m => m.source !== 'permaBuffs');
  }
  const tpl = CARDS[card.tplId];
  if (tpl && tpl.permanentEot && typeof card.slotIdx === 'number'
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
  // direct destroy effects (removeCreature sev 3, removeAll sev 3) which
  // set killedBy upstream. Skip for self-controller kills (e.g., a future
  // self-sacrifice path invoking moveToGraveyard, though sacrificeCard is
  // the canonical sac path today).
  if (card.killedBy && card.killedBy !== controller) {
    claimKeywordsFromKill(card, card.killedBy);
  }
  // Same flush as checkDeaths — capture permanentEot buffs before
  // resetInPlayState clears them. Used for direct-destroy paths
  // (removeCreature sev 3, removeAll sev 3).
  flushPermanentEotToPermaBuffs(card);
  clearRestrictionsFromSource(card.iid);
  resetInPlayState(card, true);   // preserve damagedBySources for dies-triggers
  if (card.type === 'Creature') {
    // Pass the dying card as an extra source so its own dies-trigger fires.
    // Tokens fire dies-triggers normally — Sengir grows from killing tokens,
    // Endomorph absorbs from killing tokens (though Endomorph itself can't be
    // a token in v1).
    emit({type: 'cardDies', card, controller}, [{card, controller}]);
  }
  // Leaves-play emit covers all leave paths uniformly. Fires for any card
  // type (artifact, enchantment, land, creature) — useful for future
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
  // Flush permanentEot — symmetric with checkDeaths and moveToGraveyard.
  // Sacrifice-sourced deaths shouldn't lose Elystra's accumulated buffs.
  flushPermanentEotToPermaBuffs(card);
  clearRestrictionsFromSource(card.iid);
  resetInPlayState(card, true);
  log(`${pname(controller)} sacrifices ${card.name}.`, 'dmg');
  if (card.type === 'Creature') {
    emit({type: 'cardDies', card, controller}, [{card, controller}]);
  }
  emitLeavesBattlefield(card, controller);
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
  // buildOnDraw hook fires when the card enters hand via drawing. Other
  // hand-entry paths (tutoring, opening-hand placement) call this helper
  // directly. Bouncing/recurring/flickering doesn't count — those are
  // re-entries, and `_builtThisGame` would already be set anyway.
  tryBuildOnDraw(c, who);
  return c;
}

// Open the trigger-build prompt for a buildOnDraw card if eligible.
// Centralizes the prompt-setup logic so every "card moves to hand" path
// (drawCard, tutors, opening-hand scan) can call it without duplicating.
// Returns true if the prompt was opened, false if skipped (wrong player,
// not a buildOnDraw card, already built this game).
function tryBuildOnDraw(card, who) {
  if (who !== 'you') return false;
  if (!card || card._builtThisGame) return false;
  const tpl = CARDS[card.tplId];
  if (!tpl || !tpl.buildOnDraw) return false;
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
  // Flush any pending permanentEot conversions BEFORE flipping the game-over
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
  // Symmetricize beats stat permaBuffs (Elystra's accumulated power/tou),
  // matching the +1/+1 sticker treatment. Keyword permaBuffs still apply.
  const symmetrized = typeof card.symmetrizedTo === 'number';
  if (!symmetrized && ((permaBuffs.power || 0) !== 0 || (permaBuffs.toughness || 0) !== 0)) {
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

// Apply Balancer-boss-flavored run-persistent overrides to a card at
// instantiation time. Three independent slot fields, each set by one
// of the Balancer's spells:
//
//   - slot.symmetricized: integer N → power = N, toughness = N,
//     cost = {C: N}. Set by Symmetricize. Replaces the BASELINE; other
//     modifiers (stickers, permaBuffs, +1/+1 counters) stack on top.
//     Order matters: apply symmetricized BEFORE permaBuffs/stickers
//     so the baseline is replaced first, then buffs add on.
//   - slot.colorOverride: 'C' (or any color string) → card.color = that
//     value. Set by Bleach (always 'C'). Future spells could set other
//     colors. Note: doesn't affect the cost's colored pips — only the
//     card's intrinsic color identity (used by "is white" matchers,
//     color-matters synergies).
//   - slot.extraCost: integer N → card.cost.C += N. Set by Embargo.
//     Stacks across multiple Embargos. Inverse of the 'costMinus1'
//     sticker. Applied AFTER symmetricized so the bonus stays additive
//     even if the cost was reset by symmetricize.
//
// Called from makeCard after the template is instantiated and before
// permaBuffs/stickers run. Slot fields are passed in via the slot lookup
// at the deck-construction boundary (instantiate path) and serialized
// like other slot meta.
function applyBalancerOverrides(card, slotMeta) {
  if (!slotMeta) return;
  // Symmetricize: replace power, toughness, and cost baseline. Sets a
  // sentinel flag so applyStickersToCard / applyPermaBuffsToCard / the
  // counters system skip stat-modifying additions (the +1/+1 sticker,
  // Elystra's permaBuffs, +1/+1 counters from triggered abilities).
  // Keyword stickers, costReduction, innate, landColor, trigger, and
  // subtype stickers all continue to apply normally — symmetricize is
  // ONLY about the three numeric values (power, toughness, cost).
  if (typeof slotMeta.symmetricized === 'number') {
    const n = slotMeta.symmetricized;
    card.power = n;
    card.toughness = n;
    card.cost = { C: n };
    card.symmetrizedTo = n;   // sentinel for downstream skip-stats
  }
  // Color override: set the card's intrinsic color. 'C' = colorless.
  if (typeof slotMeta.colorOverride === 'string') {
    card.color = slotMeta.colorOverride;
  }
  // Extra cost: add to generic. Applied AFTER symmetricize so it stacks
  // on the new baseline. If symmetricize set cost = {C: 3} and extraCost
  // is 2, final cost is {C: 5}.
  if (typeof slotMeta.extraCost === 'number' && slotMeta.extraCost > 0) {
    if (!card.cost) card.cost = {};
    card.cost.C = (card.cost.C || 0) + slotMeta.extraCost;
  }
}

// Flush a permanentEot creature's (Elystra) temp buffs and EOT grants into
// slot.permaBuffs. Idempotent. Caller resets temp values after.
function flushPermanentEotToPermaBuffs(card) {
  const tpl = CARDS[card.tplId];
  if (!tpl || !tpl.permanentEot) return;
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
// shuffleIntoLibrary, exileUntilEOT. Lets cards like Archdemon of Bargains
// use a single 'thisLeaves' trigger instead of needing one trigger per
// removal type. Caller passes the card and its controller-at-leave-time;
// downstream trigger handlers reading ctx.event.card see the card object
// in the same state it left play (slotIdx intact, bargainsNum intact, etc).
//
// For creatures that fire BOTH this AND cardDies (on death), the leaves
// event emits FIRST (before resetInPlayState/dies-emit). Cards that want
// only one of the two should declare exactly one trigger.
function emitLeavesBattlefield(card, controller) {
  if (!card) return;
  // Tokens leaving play still emit — a future "when this token leaves
  // play" mechanic might want it. Costs nothing if no trigger listens.
  emit({type: 'cardLeavesBattlefield', card, controller}, [{card, controller}]);
}

// Credit killer with the dying creature's keywords (runtime grants included).
// Skips 'defender' (never offered as sticker reward).
function claimKeywordsFromKill(card, killer) {
  if (!card || card.type !== 'Creature') return;
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
        if (c.type !== 'Creature') continue;
        const [, t] = getStats(c);
        const lethalDamage = (c.damage >= t) || (t <= 0) || c.dealtDeathtouch;
        if (!lethalDamage) continue;
        if (c.keywords.includes('indestructible')) {
          c.damage = 0;
          c.dealtDeathtouch = false;
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
    // Emit cardDies for this batch; pass the full dying list as extraSources
    // so mutual-kill dies-triggers (Sengir, Endomorph) fire on creatures that
    // died in the same batch but aren't on bf anymore.
    for (const entry of dying) {
      emit({type: 'cardDies', card: entry.card, controller: entry.controller}, dying);
    }
    // Leaves-play emit for each dying card, in the same batch order. Fires
    // after all cardDies emits so the standard dies-listener queue stays
    // consistent with prior versions.
    for (const entry of dying) {
      emitLeavesBattlefield(entry.card, entry.controller);
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
      G.phase = 'COMBAT_ATTACK';
      break;
    case 'COMBAT_ATTACK':
      G.phase = (G.attackers.length > 0) ? 'COMBAT_BLOCK' : 'MAIN2';
      break;
    case 'COMBAT_BLOCK':
      G.phase = 'COMBAT_DAMAGE';
      break;
    case 'MAIN2':
      G.phase = 'END';
      break;
    case 'END':
      G.phase = 'CLEANUP';
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
    emit({type: 'spellCast', card: item.card, controller: item.controller});
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
  if (card.type === 'Creature' || card.type === 'Artifact') {
    // Creatures enter sick (with intrinsic haste overriding). Artifacts
    // don't get sick (they can activate the turn they come down) — there's
    // no "summoning sick" concept for non-creature permanents in MtG, and
    // canActivate's sick check is gated on type === 'Creature' upstream
    // anyway, but set sick=false defensively so any future "sick if
    // creature" code paths see a clean value.
    card.sick = (card.type === 'Creature');
    G[item.controller].battlefield.push(card);
    log(`${card.name} enters the battlefield.`, 'sp');
    emit({type: 'cardEntersBattlefield', card, controller: item.controller});
  } else {
    const ctx = { controller: item.controller, sourceName: card.name, sourceIid: card.iid, sourceCard: card };
    // Snapshot the spell's target BEFORE any effect runs. Multi-effect spells
    // like decomposed Swords ([exile, gainLife]) need the second effect to
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
        return targetTpl && targetTpl.ripOnTarget;
      });
    // Multi-target dispatch: by default, all targeted effects share
    // item.targets[0] (legacy semantics for Swords, Strength of the Pack,
    // etc.). Effects that opt into a distinct target via `targetSlot: N`
    // pull from item.targets[N]. Snapshots are computed per slot lazily
    // so each unique slot only snapshots once.
    const slotSnapshots = new Map();
    const itemTargets = Array.isArray(item.targets) ? item.targets : [];
    const getTargetForSlot = (slot) => {
      const tgt = itemTargets[slot] || null;
      if (!slotSnapshots.has(slot)) {
        slotSnapshots.set(slot, tgt ? snapshotTarget(tgt) : null);
      }
      return { tgt, snap: slotSnapshots.get(slot) };
    };
    for (const eff of activeEffects) {
      let tgt = null;
      let snap = null;
      if (eff.target === 'self') {
        // Mirror the trigger resolver's branching: self resolves to the
        // SOURCE CREATURE for creature-operating effects, and to the
        // SOURCE'S CONTROLLER (a player target) for player-operating
        // effects (damage, gainLife, draw, discard, addMana). Without
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
        const slot = eff.targetSlot || 0;
        const fetched = getTargetForSlot(slot);
        tgt = fetched.tgt;
        snap = fetched.snap;
      }
      applyEffect(ctx, eff, tgt, snap);
    }
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
  // involved in combat has first strike. (Double strike would also count,
  // but we don't have it implemented.)
  const allCombatants = [];
  for (const aIid of G.attackers) {
    const fa = findCard(aIid); if (fa) allCombatants.push(fa.card);
  }
  for (const [bIid] of G.blockers) {
    const fb = findCard(bIid); if (fb) allCombatants.push(fb.card);
  }
  const hasFirstStrike = allCombatants.some(c => c.keywords.includes('firstStrike'));

  if (hasFirstStrike) {
    // First-strike step: only first-strikers deal damage.
    dealCombatDamage(blocked, defender, c => c.keywords.includes('firstStrike'));
    afterEffectsApplied();
    if (G.gameOver) return;
    // Normal step: anyone still alive that DOESN'T have first strike.
    dealCombatDamage(blocked, defender, c => !c.keywords.includes('firstStrike'));
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
    // the gainLife effect. Without this, Ajani's Pridemate wouldn't trigger
    // from a lifelink attacker — combat damage uses a different code path
    // than applyDamageFrom (which handles spell damage).
    emit({type: 'lifeGained', who: srcCtrl, amount: amt});
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
  emit({type: 'cardEntersBattlefield', card, controller: who});
}
function doTapLandForMana(who, cardIid, color, abilityIdx) {
  const f = findCard(cardIid); if (!f) return;
  const card = f.card;
  if (card.tapped) return;
  if (card.type === 'Land') {
    // Choose a producible color. If caller passed one and it's legal, use
    // it. Otherwise default to primary (mono-color lands always end up here).
    const producible = landProducibleColors(card);
    const chosen = (color && producible.includes(color)) ? color : card.mana;
    card.tapped = true;
    G[who].mana[chosen]++;
    log(`${G[who].name} taps ${card.name} for {${chosen}}.`);
    return;
  }
  // Mana ability on a non-land (creature dork, or creature+land merge).
  // v1.0.64: scan all abilities, not just [0]. Caller can specify which
  // mana ability via abilityIdx; otherwise pick the first.
  if (!Array.isArray(card.abilities)) return;
  let manaAb = null;
  if (typeof abilityIdx === 'number') {
    manaAb = card.abilities[abilityIdx];
    if (!manaAb || !manaAb.effects || manaAb.effects[0].kind !== 'addMana') return;
  } else {
    manaAb = card.abilities.find(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana');
  }
  if (!manaAb) return;
  if (card.sick) return;
  card.tapped = true;
  const am = manaAb.effects[0].amounts;
  for (const k of Object.keys(am)) G[who].mana[k] += am[k];
  log(`${card.name} taps for mana.`, 'sp');
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
  // createTokens effects directly — so this naturally only records real
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
    const modeNames = card.effects.modeNames || [];
    if (modeNames[modeIdx || 0]) modeLabel = ` (${modeNames[modeIdx || 0]})`;
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
  // exists, but we just no-op gracefully (target:'self' resolves null).
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
  // distinct slot via `targetSlot: N`. allTargets is also threaded onto
  // ctx so multi-target effects like applyInGameSplice (Stapler) can read
  // both inputs directly without relying on inter-effect coordination.
  const abilitySlotSnapshots = new Map();
  const abilityTargets = Array.isArray(targets) ? targets : [];
  const getAbilityTargetForSlot = (slot) => {
    const tgt = abilityTargets[slot] || null;
    if (!abilitySlotSnapshots.has(slot)) {
      abilitySlotSnapshots.set(slot, tgt ? snapshotTarget(tgt) : null);
    }
    return { tgt, snap: abilitySlotSnapshots.get(slot) };
  };
  for (const e of ab.effects) {
    let tgt = null;
    let snap = null;
    if (e.target === 'self') {
      tgt = {kind:'creature', iid: card.iid, label: card.name};
      snap = snapshotTarget(tgt);
    } else if (effectNeedsTarget(e)) {
      const slot = e.targetSlot || 0;
      const fetched = getAbilityTargetForSlot(slot);
      tgt = fetched.tgt;
      snap = fetched.snap;
    }
    applyEffect(ctx, e, tgt, snap);
  }
  afterEffectsApplied();
  if (ab.effects[0].kind !== 'addMana') {
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
    emit({type: 'attacks', attacker: f.card, controller: who, defender: opp(who)});
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
  // Tutored cards trigger buildOnDraw the same as any other hand-entry.
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
function doRipSelect(who, target) {
  // Player submits a permanent to rip from the pendingRipSelect prompt.
  // Validates: prompt is open for this player, target is a permanent
  // they control. On valid select: destroy + rip the slot if persistent.
  if (!G.pendingRipSelect || G.pendingRipSelect.who !== who) return;
  if (!target || !target.iid) return;
  const f = findCard(target.iid);
  if (!f) return;
  if (f.controller !== who) return;   // can only rip your own permanents
  // Identify the slotIdx for run-state removal (only player-side cards
  // have this — opp cards are regenerated each game, so opp rip has no
  // run-state effect, only the in-game destroy).
  const card = f.card;
  const slotIdx = card.slotIdx;
  const ripBy = G.pendingRipSelect.ripBy;
  const sourceName = G.pendingRipSelect.source;
  G.pendingRipSelect = null;
  log(`${pname(who)} rips ${card.name} from the deck (${sourceName}).`, 'sp');
  // Destroy in-game (route through sacrificeCard so death triggers and
  // SBAs all fire normally). Credit the rip-caster for any kill credit.
  card.killedBy = ripBy;
  sacrificeCard(card, who);
  // Persistent removal: only applies to player-side cards with a slot.
  // Opp cards have no persistent slot — the in-game destroy IS the
  // entire effect for them. For the player, removing the slot means the
  // card is gone from the run permanently.
  if (who === 'you' && typeof slotIdx === 'number'
      && typeof RUN !== 'undefined' && RUN.removeSlotByIdx) {
    RUN.removeSlotByIdx(slotIdx);
    log(`${card.name} is gone from your deck for the rest of the run.`, 'sp');
  }
}
function doSymmetricizeChoice(who, which) {
  // Player picks 'power' | 'toughness' | 'cost'. All three values become
  // the picked one's value. Persists to slot.symmetricized for the target's
  // owning side (only player-side has runState slots; opp-side is in-game
  // only — opp's permanents regenerate from their constructed deck next
  // game without the symmetricize effect).
  if (!G.pendingSymmetricizeChoice || G.pendingSymmetricizeChoice.who !== who) return;
  const p = G.pendingSymmetricizeChoice;
  if (!['power','toughness','cost'].includes(which)) return;
  const n = p.values[which];
  G.pendingSymmetricizeChoice = null;
  log(`${pname(who)} chooses ${which} (${n}) for ${p.targetName} via ${p.source}.`, 'sp');
  // Apply to the in-game card so this game reflects the change.
  const f = findCard(p.targetIid);
  if (f) {
    // Symmetricize beats existing stat modifiers — wipe the slate so the
    // chosen value really IS the card's stats. Stat-modifying sources we
    // clear: card.modifiers (stat-boost stickers + permaBuffs entries),
    // permPower/permTou (+1/+1 counters from triggered abilities and
    // similar). Keyword stickers and grants remain. Sets the symmetrizedTo
    // sentinel so future sticker re-applications (e.g., re-stickered slot
    // on next game) also skip stat additions for this card.
    f.card.power = n;
    f.card.toughness = n;
    f.card.cost = { C: n };
    f.card.symmetrizedTo = n;
    if (Array.isArray(f.card.modifiers)) {
      f.card.modifiers = f.card.modifiers.filter(m => {
        // Keep only zero-stat modifiers (defensive — none exist today,
        // but if a future sticker is added that's stat-neutral, we
        // shouldn't blow it away).
        return (m.power || 0) === 0 && (m.toughness || 0) === 0;
      });
    }
    f.card.permPower = 0;
    f.card.permTou = 0;
    // tempPower/tempTou (end-of-turn buffs) also fall under "stat changes."
    // Wipe them too — the symmetrize is "now," and EOT buffs feel like
    // stats to the player.
    f.card.tempPower = 0;
    f.card.tempTou = 0;
  }
  // Persist to slot.symmetricized for cross-game (player-side only).
  if (p.targetIsYours && typeof p.targetSlotIdx === 'number'
      && typeof RUN !== 'undefined' && RUN.getSlots) {
    const slot = RUN.getSlots()[p.targetSlotIdx];
    if (slot) {
      slot.symmetricized = n;
      if (typeof RUN.save === 'function') RUN.save();
      log(`${p.targetName} is symmetricized at ${n}/${n} for {${n}} for the rest of the run.`, 'sp');
    }
  }
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
      if (!card || card.type !== 'Land') return false;
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
      if (f.card.type === 'Land') return whoHasPriority(who) || isInstantWindow(who);
      // Mana ability — scan all abilities (v1.0.64: was abilities[0] only,
      // which missed stapled creature+land merges where the mana ability is
      // appended at index >= 1).
      const abIdx = (typeof action.abilityIdx === 'number') ? action.abilityIdx : -1;
      if (!Array.isArray(f.card.abilities)) return false;
      let manaAb = null;
      if (abIdx >= 0) {
        manaAb = f.card.abilities[abIdx];
        if (!manaAb || !manaAb.effects || manaAb.effects[0].kind !== 'addMana') return false;
      } else {
        // Backwards-compat: caller didn't specify, find the first mana ability.
        manaAb = f.card.abilities.find(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana');
        if (!manaAb) return false;
      }
      if (f.card.sick) return false;
      return whoHasPriority(who) || isInstantWindow(who);
    }
    case 'castSpell': {
      const card = G[who].hand.find(c => c.iid === action.cardIid);
      if (!card || card.type === 'Land') return false;
      if (!canPayPotential(who, effectiveCastCost(card))) return false;
      // Legendary uniqueness (rule 1a): you can't cast a legendary if you
      // already control one with the same tplId. This is a hard prohibition
      // at cast time — not the classic "both die" legend rule (1b) or the
      // modern "choose one to keep" (1c). The intent is that the boss's
      // double-City-Guardian is limited by exposing them serially: kill
      // the first to make room for the second. Per-controller (each side
      // can have one independently).
      if (card.legendary && G[who].battlefield.some(c => c.tplId === card.tplId)) {
        return false;
      }
      if (card.type === 'Instant') {
        if (!isInstantWindow(who)) return false;
      } else if (card.keywords && card.keywords.includes('flash')) {
        // Flash: cast at instant speed.
        if (!isInstantWindow(who)) return false;
      } else {
        if (!isSorceryWindow(who)) return false;
      }
      // Validate targets if needed. By default, multi-effect spells share
      // a single target slot (targets[0]) — preserves the legacy behavior
      // for Swords, Strength of the Pack, Predator's Speed, etc. Effects
      // can opt into a distinct slot via `targetSlot: N` (0-indexed); a
      // multi-target spell like Branching Bolt has two effects, the second
      // marked `targetSlot: 1`, so it pulls action.targets[1] instead of
      // sharing targets[0]. The required targets-array length is one more
      // than the highest targetSlot referenced.
      const modes = getModes(card);
      const modeIdx = action.modeIdx || 0;
      if (modeIdx < 0 || modeIdx >= modes.length) return false;
      const activeEffects = modes[modeIdx];
      const targetedEffs = (activeEffects || []).filter(effectNeedsTarget);
      if (targetedEffs.length > 0) {
        const maxSlot = targetedEffs.reduce((m, e) => Math.max(m, e.targetSlot || 0), 0);
        if (!action.targets || action.targets.length < maxSlot + 1) return false;
        for (const eff of targetedEffs) {
          const slot = eff.targetSlot || 0;
          const tgt = action.targets[slot];
          if (!tgt) return false;
          const valid = getValidTargets(eff, who);
          if (!valid.some(v => sameTarget(v, tgt))) return false;
        }
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
        if (f.card.sick && !f.card.keywords.includes('haste') && f.card.type === 'Creature') return false;
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
        if (sacF.card.type !== 'Creature') return false;
      }
      const isMana = ab.effects[0].kind === 'addMana';
      if (isMana) {
        // Mana abilities are always available when source can be tapped, regardless of priority.
        // (Matches MtG: mana abilities don't require priority and don't use the stack.)
        return true;
      }
      // Non-mana ability: timing depends on sorcerySpeed flag.
      if (ab.sorcerySpeed) {
        if (!isSorceryWindow(who)) return false;
      } else {
        if (!isInstantWindow(who)) return false;
      }
      const targetedEffs = ab.effects.filter(effectNeedsTarget);
      if (targetedEffs.length > 0) {
        // Multi-target ability validation: each effect's targetSlot picks
        // its target from action.targets[slot]. Stapler uses slot 0 (base)
        // and slot 1 (staple) with different eligibility filters; the
        // single-target shared path used to mis-validate both filters
        // against targets[0]. v1.0.60 fix.
        const maxSlot = targetedEffs.reduce((m, e) => Math.max(m, e.targetSlot || 0), 0);
        if (!action.targets || action.targets.length < maxSlot + 1) return false;
        for (const eff of targetedEffs) {
          const slot = eff.targetSlot || 0;
          const tgt = action.targets[slot];
          if (!tgt) return false;
          const valid = getValidTargets(eff, who);
          if (!valid.some(v => sameTarget(v, tgt))) return false;
        }
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
          && card.type !== G.pendingSearch.filter.type) return false;
      return true;
    }
    case 'triggerTargetPick': {
      if (!G.pendingTriggerTarget || G.pendingTriggerTarget.controller !== who) return false;
      if (!action.target) return false;
      return G.pendingTriggerTarget.valid.some(v => sameTarget(v, action.target));
    }
    case 'ripSelect': {
      // Legal only when a rip prompt is open for this player and the
      // target is a permanent they control.
      if (!G.pendingRipSelect || G.pendingRipSelect.who !== who) return false;
      if (!action.target || !action.target.iid) return false;
      const f = findCard(action.target.iid);
      if (!f || f.controller !== who) return false;
      return true;
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
      if (card.type === 'Land') actions.push({type:'playLand', cardIid: card.iid});
    }
  }

  // Tap lands & mana dorks
  if (whoHasPriority(who) || isInstantWindow(who)) {
    for (const card of G[who].battlefield) {
      if (card.tapped) continue;
      if (card.type === 'Land') {
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
        const manaAbIdx = card.abilities.findIndex(ab => ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana');
        if (manaAbIdx >= 0) {
          actions.push({type:'tapLandForMana', cardIid: card.iid, abilityIdx: manaAbIdx});
        }
      }
    }
  }

  // Spells (one entry per (card, target) combination)
  for (const card of G[who].hand) {
    if (card.type === 'Land') continue;
    if (!canPayPotential(who, effectiveCastCost(card))) continue;
    // Timing: Instants and flash creatures use instant window. Other
    // permanents/sorceries need sorcery window.
    const hasFlash = card.keywords && card.keywords.includes('flash');
    if (card.type === 'Instant' || hasFlash) {
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
        // Untargeted (or untargeted mode of a modal card).
        const a = {type:'castSpell', cardIid: card.iid};
        if (modes.length > 1) a.modeIdx = mIdx;
        actions.push(a);
        continue;
      }
      // Group targeted effects by targetSlot. Each unique slot needs one
      // target. Effects with the same slot share that target — same
      // legacy behavior as Strength of the Pack (both effects target slot 0).
      const slotMap = new Map();
      for (const eff of targetedEffs) {
        const slot = eff.targetSlot || 0;
        if (!slotMap.has(slot)) slotMap.set(slot, []);
        slotMap.get(slot).push(eff);
      }
      const slotKeys = [...slotMap.keys()].sort((a, b) => a - b);
      // For each slot, collect valid targets. The valid set is the
      // intersection of valid-targets across effects sharing the slot
      // (a slot-0 target must satisfy every slot-0 effect's filter).
      const validBySlot = slotKeys.map(slot => {
        const effs = slotMap.get(slot);
        if (effs.length === 1) return getValidTargets(effs[0], who);
        // Multiple effects on same slot: intersect.
        let acc = getValidTargets(effs[0], who);
        for (let i = 1; i < effs.length; i++) {
          const next = getValidTargets(effs[i], who);
          acc = acc.filter(a => next.some(n => sameTarget(a, n)));
        }
        return acc;
      });
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
      const isMana = ab.effects[0].kind === 'addMana';
      if (isMana) continue;   // surfaced as tapLandForMana
      // Tap cost requirements.
      if (ab.cost && ab.cost.tap) {
        if (card.tapped) continue;
        if (card.sick && !card.keywords.includes('haste') && card.type === 'Creature') continue;
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
          .filter(c => c.type === 'Creature')
          .map(c => c.iid);
        if (sacOptions.length === 0) continue;  // can't pay sac cost
      }
      if (ab.sorcerySpeed ? !isSorceryWindow(who) : !isInstantWindow(who)) continue;
      const targetedEff = ab.effects.find(effectNeedsTarget);
      // Cross-product: (effect targets) × (sac options).
      const effectTargets = targetedEff ? getValidTargets(targetedEff, who) : [null];
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
      if (filter.type && card.type !== filter.type) continue;
      actions.push({type:'searchPick', cardIid: card.iid});
    }
  }

  // Rip-select picks — when this player owes a "choose a permanent of yours
  // to rip" decision (Vile Edict and similar). One action per permanent on
  // the player's battlefield. The player picks; engine validates ownership
  // again at executeAction time.
  if (G.pendingRipSelect && G.pendingRipSelect.who === who) {
    for (const card of G[who].battlefield) {
      actions.push({type:'ripSelect', target: {kind:'permanent', iid: card.iid}});
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
        G.phase = 'DRAW';
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
        G.phase = 'MAIN1';
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
          G.phase = 'MAIN2';
          continue;
        }
        // Open the post-attackers priority round (the new (a.ii) window).
        openPriorityRound();
        continue;

      case 'COMBAT_BLOCK':
        if (G.attackers.length === 0) {
          G.phase = 'COMBAT_DAMAGE';
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
        G.phase = 'MAIN2';
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
              if (dt.effect === 'returnFromExile' && dt.exiledCard) {
                // Tokens that exiled cease to exist — they don't return.
                if (dt.exiledCard.isToken) {
                  log(`${dt.exiledCard.name} ceases to exist.`, 'sp');
                } else {
                  // Return to battlefield. Sickness reset (haste keyword
                  // overrides). resetInPlayState already cleared in-play
                  // state when the card was exiled, so it returns clean.
                  dt.exiledCard.sick = !dt.exiledCard.keywords.includes('haste');
                  G[dt.exiledFrom].battlefield.push(dt.exiledCard);
                  log(`${dt.exiledCard.name} returns to the battlefield.`, 'sp');
                  emit({type: 'cardEntersBattlefield', card: dt.exiledCard, controller: dt.exiledFrom});
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
          // permanentEot creatures (Elystra) — convert temp buffs and EOT
          // grants to slot.permaBuffs before they get cleared. Helper is
          // shared with endGame, which also needs to flush pending buffs
          // when the game ends mid-turn (before EOT cleanup would fire).
          flushPermanentEotToPermaBuffs(c);
          c.tempPower = 0; c.tempTou = 0; c.damage = 0;
          c.dealtDeathtouch = false;
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
        G.you.mana = {W:0,U:0,B:0,R:0,G:0,C:0};
        G.opp.mana = {W:0,U:0,B:0,R:0,G:0,C:0};
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
        G.phase = 'UNTAP';
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
    case 'ripSelect':         doRipSelect(who, action.target); break;
    case 'numberChoice':      doNumberChoice(who, action.number); break;
    case 'symmetricizeChoice': doSymmetricizeChoice(who, action.which); break;
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
  // Opening-hand buildOnDraw scan. Cards in the opening hand bypass drawCard
  // (they're placed directly during makePlayer), so the per-draw build hook
  // doesn't fire for them. Walk the player's hand once at game-start;
  // tryBuildOnDraw handles eligibility and the prompt setup. find() returns
  // the first match — only one prompt at a time, since pendingTriggerBuild
  // is a single field. If a future feature needs multiple build prompts
  // queued, this becomes a queue rather than a single setter.
  const handBuilder = G.you.hand.find(c => {
    const tpl = CARDS[c.tplId];
    return tpl && tpl.buildOnDraw && !c._builtThisGame;
  });
  if (handBuilder) tryBuildOnDraw(handBuilder, 'you');
  step();
  notify();
}

return {
  init, state: () => G, expectedActor, getLegalActions, executeAction, isLegalAction,
  playerOwesDecision,
  subscribe, findCard, getStats, getCardValue, sacValueOnBoard, cardCost: costTotalCard,
  landProducibleColors,
  canCreatureAttack, canCreatureBlock,
  effectNeedsTarget, getValidTargets,
  effectiveCastCost,
  makeCard,
  synthesizeStapledTemplate,
  makeToken,
  getModes,
  isModal,
  effectsForMode,
  allCardEffects,
  cardHasEffect,
  spellValueForEffects,
  pickBestTriggerTarget,
  matchFilter,
  concede() {
    if (!G || G.gameOver) return;
    log('You concede.', 'imp');
    G.gameOver = true; G.winner = 'opp';
    notify();
  },
};
})();

