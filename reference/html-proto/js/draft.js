// DRAFT — color-biased pack rolls, auto-lands, opponent deck construction.
// API: startDraft, getPlayerPack, getProgress, pickPlayer, isComplete, getPlayerDeck, buildOpponentDeck.
const DRAFT = (function() {

const TOTAL_PICKS = 23;
const TOTAL_LANDS = 17;
const TOTAL_DECK_SIZE = TOTAL_PICKS + TOTAL_LANDS;
const PACK_SIZE = 3;
const COLORS = ['W','U','B','R','G'];
const COLOR_TO_LAND = { W:'plains', U:'island', B:'swamp', R:'mountain', G:'forest' };
const DESERT_CUBE_LAND_PROB = 1 / 3;

// Lazy-cached because CARDS is populated async by loadCards() (v1.0.134).
// oppPool() kept separate for future archetype divergence.
let _draftPoolCache = null;
function draftPool() {
  if (_draftPoolCache === null) {
    // Exclude BASIC lands (they're auto-allocated after the draft) and `special`
    // cards (boss/run-only — including run-boon lands like City of Brass, which
    // arrive via the "Polychrome Pact" modifier, not packs). Everything else —
    // spells, creatures, and every other nonbasic land (artifact lands, utility
    // lands like Deepseam Quarry) — drafts like any other pick, matching MtG
    // where nonbasic lands appear in packs. `Basic` is a land-only supertype, so
    // excluding it (plus the special carve-out) is the whole land rule.
    _draftPoolCache = Object.keys(CARDS).filter(id => {
      const c = CARDS[id];
      if (c.special) return false;
      return !hasType(c, 'Basic');
    });
  }
  return _draftPoolCache;
}
function oppPool() { return draftPool(); }

let state = null;

function rollPackForMode(pool, picksSoFar, mode) {
  const pack = rollPack(pool, picksSoFar);
  if (mode !== 'desertCube') return pack;
  // Substitute lands post-rollPack so color-aware sampling still works for spells.
  // Dedup substituted lands so packs don't show two identical basics.
  for (let i = 0; i < pack.length; i++) {
    if (Math.random() < DESERT_CUBE_LAND_PROB) {
      const usedLandTplIds = new Set();
      for (let j = 0; j < pack.length; j++) {
        if (j === i) continue;
        const tpl = CARDS[pack[j]];
        if (tpl && hasType(tpl, 'Land') && tpl.mana) usedLandTplIds.add(pack[j]);
      }
      const availableColors = COLORS.filter(c => !usedLandTplIds.has(COLOR_TO_LAND[c]));
      if (availableColors.length === 0) continue;
      const colorIdx = Math.floor(Math.random() * availableColors.length);
      pack[i] = COLOR_TO_LAND[availableColors[colorIdx]];
    }
  }
  return pack;
}

function startDraft(mode) {
  state = {
    youPicks: [],
    mode: mode || 'classic',
    complete: false,
  };
  state.currentPack = rollPackForMode(draftPool(), [], state.mode);
  PICKLOG.startDraft();
}

// Hand-curated constructed decks for 'constructed' map nodes.
// 23 tplIds; lands auto-allocated. Opp scaling layers on top.
const CONSTRUCTED_DECKS = {
  goblinAggro: {
    name: 'Goblin Aggro',
    colors: ['R'],
    description: 'Cheap goblins, burn finishers',
    cards: [
      'goblin_piercer', 'goblin_piercer', 'raging_goblin', 'raging_goblin',
      'goblin_raider', 'goblin_raider', 'goblin_duelist', 'goblin_duelist',
      'goblin_slinger', 'goblin_slinger', 'goblin_war_drummer', 'goblin_war_drummer',
      'goblin_chieftain', 'bloodlust_berserker', 'bloodlust_berserker',
      'lightning_bolt', 'lightning_bolt', 'shock', 'shock',
      'char', 'volcanic_hammer', 'goblin_rabble', 'pyroclasm',
    ],
  },
  spiritTribal: {
    name: 'Spirit Tribal',
    colors: ['W'],
    description: 'Spirits, removal, evasion',
    cards: [
      'savannah_lions', 'white_knight', 'white_knight',
      'devoted_watcher', 'devoted_watcher', 'phantom_warrior', 'phantom_warrior',
      'vengeful_spirit', 'vengeful_spirit', 'echo_spirit', 'echo_spirit',
      'spirit_shepherd', 'spirit_shepherd', 'cloud_pegasus', 'serra_angel',
      'healing_salve', 'pacifism', 'pacifism', 'swords_to_plowshares', 'swords_to_plowshares',
      'divine_favor', 'divine_favor', 'day_of_reckoning',
    ],
  },
  aristocrats: {
    name: 'Aristocrats',
    colors: ['B', 'R'],
    description: 'Sacrifice synergies, drain effects',
    cards: [
      'goblin_piercer', 'goblin_raider', 'vampire_bat', 'vampire_bat',
      'rakdos_cadet', 'rakdos_cadet', 'cult_priest', 'cult_priest',
      'blood_priest', 'blood_priest', 'blood_artist', 'blood_artist',
      'carrion_feeder', 'carrion_feeder', 'bloodthirster',
      'lightning_bolt', 'shock', 'doom_blade', 'doom_blade',
      'drain_life', 'drain_life', 'mind_rot', 'consume_spirit',
    ],
  },
  archdemonBoss: {
    name: 'Archdemon of Bargains',
    icon: '👹',
    colors: ['B'],
    description: 'Mono-black demonic toolbox: removal, drain, recursion',
    isBoss: true,
    cards: [
      'archdemon_of_bargains',
      'vampire_bat', 'rakdos_cadet', 'rakdos_cadet',
      'cult_priest', 'cult_priest', 'blood_priest', 'blood_priest',
      'blood_artist', 'blood_artist', 'hypnotic_specter', 'hypnotic_specter',
      'sengir_vampire', 'bloodthirster',
      'vile_edict', 'vile_edict',
      'scarification', 'scarification',
      'doom_blade', 'doom_blade', 'murder', 'murder',
      'drain_life',
    ],
  },
  balancerBoss: {
    name: 'The Balancer',
    icon: '⚖',
    colors: ['W'],
    description: 'Mono-white control: taxation, exile, equalization',
    isBoss: true,
    cards: [
      'city_guardian', 'city_guardian',
      'symmetricize', 'symmetricize',
      'embargo', 'embargo',
      'bleach',
      'savannah_lions', 'white_knight', 'devoted_watcher', 'devoted_watcher',
      'benalish_hero', 'squire_of_oaths', 'paladin_of_valor',
      'serra_angel', 'dawn_sentinel',
      'swords_to_plowshares', 'swords_to_plowshares',
      'pacifism', 'pacifism',
      'oblation',
      'day_of_reckoning',
      'healing_salve',
    ],
  },
  equatorialArtificerBoss: {
    name: 'Equatorial Artificer',
    icon: 'C',
    colors: [],
    description: 'Colorless artifact boss: fast artifact mana unlocks demanding colored spells',
    isBoss: true,
    cards: [
      'ingenuity_unbounded',
      'artifice_triumphant', 'artifice_triumphant', 'artifice_triumphant',
      'clockwork_beetle', 'clockwork_beetle',
      'scrap_hound', 'scrap_hound',
      'alloy_construct', 'alloy_construct',
      'counterspell', 'counterspell',
      'anger_of_the_gods', 'anger_of_the_gods',
      'mind_control', 'mind_control',
      'day_of_reckoning',
      'spectral_procession', 'spectral_procession',
      'vile_edict', 'vile_edict',
      'overrun',
      'shivan_dragon',
    ],
    lands: [
      'equatorial_engine', 'equatorial_engine', 'equatorial_engine', 'equatorial_engine',
      'equatorial_engine', 'equatorial_engine', 'equatorial_engine', 'equatorial_engine',
      'equatorial_engine', 'equatorial_engine',
    ],
  },
};

function getConstructedDeck(id) {
  if (!id) return null;
  return CONSTRUCTED_DECKS[id] || null;
}

// Build opp deck (23 spells + lands). constructedId → curated list; else heuristic draft.
function buildOpponentDeck(numStickers, numStaples, numClones, colorAffinity, constructedId) {
  const constructed = getConstructedDeck(constructedId);
  let picks;
  if (constructed) {
    picks = constructed.cards.slice(0, TOTAL_PICKS);
    if (picks.length < TOTAL_PICKS) {
      console.warn(`Constructed deck "${constructedId}" has ${picks.length} cards; padding to ${TOTAL_PICKS}.`);
      for (let i = picks.length; i < TOTAL_PICKS; i++) {
        const pack = rollPack(oppPool(), picks);
        if (!pack.length) break;
        picks.push(pickFromPack(pack, picks));
      }
    }
  } else {
    picks = [];
    // colorAffinity forces pick 1 same-color → biases via pickFromPack's commitment logic.
    if (colorAffinity) {
      const sameColorPool = oppPool().filter(id => {
        const c = CARDS[id];
        return c && c.color === colorAffinity;
      });
      const used = new Set();
      const firstPack = [];
      const sampleCount = Math.min(PACK_SIZE, sameColorPool.length);
      while (firstPack.length < sampleCount) {
        const id = sameColorPool[Math.floor(Math.random() * sameColorPool.length)];
        if (!used.has(id)) { used.add(id); firstPack.push(id); }
      }
      if (firstPack.length > 0) {
        const chosen = pickFromPack(firstPack, picks);
        picks.push(chosen);
      }
    }
    for (let i = picks.length; i < TOTAL_PICKS; i++) {
      const pack = rollPack(oppPool(), picks);
      if (!pack.length) break;
      const chosen = pickFromPack(pack, picks);
      picks.push(chosen);
    }
  }
  // A8-4: the opp deck's "colors" output was UI-dead — no production code read it
  // (the boss-banner consumer reads only name/icon; the drafter reads colors off
  // the constructed spec, not here), and its two branches returned inconsistent
  // shapes (constructed 0–1, heuristic always padded to 2). Removed rather than
  // documented; color identity, where needed, lives on the constructed spec.
  const pips = countPips(picks);
  const lands = (constructed && Array.isArray(constructed.lands))
    ? constructed.lands.slice()
    : allocLands(pips);
  const slots = [...picks, ...lands].map(tplId => ({ tplId, stickers: [] }));
  // Order: staples first (consume slots), then stickers, then clones (photocopy modified slots).
  if (numStaples > 0)  applyOpponentStaples(slots, numStaples);
  if (numStickers > 0) applyOpponentStickers(slots, numStickers);
  if (numClones > 0)   applyOpponentClones(slots, numClones);
  return { cards: slots };
}

function applyOpponentStaples(slots, n) {
  const deckColors = new Set();
  for (const slot of slots) {
    const tpl = CARDS[slot.tplId];
    if (tpl && hasType(tpl, 'Land') && tpl.mana) deckColors.add(tpl.mana);
  }
  const COLOR_KEYS = ['W','U','B','R','G'];
  const isCastable = (baseTplId, stapleTplId) => {
    // Cheap castability check: every color in merged cost must be in deck
    // colors. Doesn't build the merged template — just sums the two costs.
    const baseTpl = CARDS[baseTplId];
    const stapleTpl = CARDS[stapleTplId];
    for (const c of COLOR_KEYS) {
      const need = (baseTpl.cost && baseTpl.cost[c] || 0) +
                   (stapleTpl.cost && stapleTpl.cost[c] || 0);
      if (need > 0 && !deckColors.has(c)) return false;
    }
    return true;
  };
  for (let round = 0; round < n; round++) {
    const pairs = [];
    // v1.0.56: enumerate UNORDERED pairs (i < j) and canonicalize. The
    // type-priority rule decides base vs staple; iterating ordered pairs
    // would double-count and require dedup downstream. Mirrors the
    // reward-time candidate generator change.
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const [, , swapped] = canonicalSplicePair(slots[i].tplId, slots[j].tplId);
        const bi = swapped ? j : i;
        const si = swapped ? i : j;
        if (!isSpliceableBase(slots[bi].tplId)) continue;
        const stapleSlot = slots[si];
        if (Array.isArray(stapleSlot.stapledTpls) && stapleSlot.stapledTpls.length > 0) continue;
        if (!isCompatibleStaplePair(slots[bi].tplId, stapleSlot.tplId)) continue;
        const baseTpl = CARDS[slots[bi].tplId];
        const stapleTpl = CARDS[slots[si].tplId];
        const ccPair = (hasType(baseTpl, 'Creature') && hasType(stapleTpl, 'Creature'));
        let weight = ccPair ? 3 : 1;
        if (!isCastable(slots[bi].tplId, slots[si].tplId)) weight *= 0.1;
        pairs.push({bi, si, weight});
      }
    }
    if (pairs.length === 0) break;
    const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = pairs[0];
    for (const p of pairs) {
      roll -= p.weight;
      if (roll <= 0) { chosen = p; break; }
    }
    absorbStapledSlot(slots, chosen.bi, chosen.si);
  }
}

// Append staple slot `si` into base slot `bi`, propagating the staple's own
// chain. Result: baseSlot.stapledTpls = [...prior, staple.tplId, ...staple.stapledTpls].
// Order matters — synthesis walks stapledTpls sequentially and slot-remaps
// each entry, so [B, A] vs [A, B] produces different effect arrangements.
function absorbStapledSlot(slots, bi, si) {
  const baseSlot = slots[bi];
  const stapleSlot = slots[si];
  if (!Array.isArray(baseSlot.stapledTpls)) baseSlot.stapledTpls = [];
  baseSlot.stapledTpls.push(stapleSlot.tplId);
  if (Array.isArray(stapleSlot.stapledTpls)) {
    for (const t of stapleSlot.stapledTpls) baseSlot.stapledTpls.push(t);
  }
  slots.splice(si, 1);
}

// Apply N clones to opp's deck. Each clone picks the highest-value non-land
// slot not yet cloned, then inserts a literal photocopy (stickers, staples,
// empower rolls, bonusTrigger, charges) after the original.
//
// Mirrors player's clone semantics — photocopy, not re-roll. Tracking by
// tplId (not index) prevents 3 copies of the same card from one budget and
// stays stable across the mid-loop splice.
function applyOpponentClones(slots, n) {
  const clonedTplIds = new Set();
  for (let round = 0; round < n; round++) {
    // Find the highest-value non-land slot whose tplId we haven't cloned.
    let bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (clonedTplIds.has(slots[i].tplId)) continue;
      const tpl = tplForSlot(slots[i]);
      if (!tpl || hasType(tpl, 'Land')) continue;
      const score = intrinsicCardValue(tpl);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx < 0) break;   // no more cloneable slots
    const orig = slots[bestIdx];
    const clone = {
      tplId: orig.tplId,
      stickers: (orig.stickers || []).slice(),
    };
    if (Array.isArray(orig.stapledTpls) && orig.stapledTpls.length > 0) {
      clone.stapledTpls = orig.stapledTpls.slice();
    }
    if (Array.isArray(orig.empowerRolls) && orig.empowerRolls.length > 0) {
      // A6-2: preserve a stored-blank (null) roll as null (not a laundered `{}`).
      clone.empowerRolls = orig.empowerRolls.map(r => r ? {...r} : r);
    }
    if (Array.isArray(orig.subtypeRolls) && orig.subtypeRolls.length > 0) {
      clone.subtypeRolls = orig.subtypeRolls.slice();
    }
    if (orig.bonusTrigger) {
      clone.bonusTrigger = {
        ...orig.bonusTrigger,
        effects: (orig.bonusTrigger.effects || []).map(e => ({...e})),
      };
    }
    if (typeof orig.charges === 'number') {
      clone.charges = orig.charges;   // A5-5 parity: photocopy remaining charges
    }
    slots.splice(bestIdx + 1, 0, clone);
    clonedTplIds.add(orig.tplId);
  }
}

// Distribute N stickers across opp's deck. Bursts of 1/2/3 mirror the
// player's sticker/twoStickers/threeStickersBlind reward weights (12:3:2)
// so distribution shapes match.
function applyOpponentStickers(slots, n) {
  const oppColors = deckColorsFromSlots(slots);
  // Bursts concentrate stickers on a single slot — produces polarized threats
  // (a 4/4 with 3 keywords) instead of spreading thin (six 2/2s with one buff
  // each). Total power level is the same; distribution shape changes.
  let remaining = n;
  while (remaining > 0) {
    // Find slots with at least one applicable sticker.
    const eligibleIdx = slots
      .map((_, i) => i)
      .filter(i => stickersForSlot(slots[i], oppColors).length > 0);
    if (eligibleIdx.length === 0) break;   // no legal targets, stop early
    // Pick 3 random eligible slots — mirroring the player's offer.
    const cardOffer = [];
    const cardPool = eligibleIdx.slice();
    while (cardOffer.length < 3 && cardPool.length > 0) {
      const idx = Math.floor(Math.random() * cardPool.length);
      cardOffer.push(cardPool.splice(idx, 1)[0]);
    }
    // Score each offered slot — prefer high-intrinsic-value cards.
    let bestSlotIdx = cardOffer[0], bestSlotScore = -Infinity;
    for (const i of cardOffer) {
      // Stapled-aware scoring: a stapled slot is worth more than its base
      // alone (extra triggers, P/T, keywords). Without this, opp would
      // weight stapled slots the same as their base — undervaluing them
      // for sticker placement.
      const tpl = tplForSlot(slots[i]);
      // Slight bonus for slots that already have stickers (clustering creates
      // bigger threats than spreading thin).
      const stickerBonus = slots[i].stickers.length * 5;
      const score = intrinsicCardValue(tpl) + stickerBonus;
      if (score > bestSlotScore) { bestSlotScore = score; bestSlotIdx = i; }
    }
    // Roll a burst size mirroring player reward weights: 12:3:2 for
    // single/double/triple → 70.6%/17.6%/11.8%. Cap at remaining budget so
    // the last burst doesn't overspend.
    const burstRoll = Math.random() * 17;
    let burstSize = (burstRoll < 12) ? 1 : (burstRoll < 15) ? 2 : 3;
    burstSize = Math.min(burstSize, remaining);
    // Apply `burstSize` stickers to the chosen slot. Each sticker re-rolls
    // the candidate offer (since prior stickers may make the slot eligible
    // for new ones, or saturate non-stackable slots), and we re-check
    // eligibility after each application.
    for (let k = 0; k < burstSize; k++) {
      const stickerCandidates = stickersForSlot(slots[bestSlotIdx], oppColors);
      if (stickerCandidates.length === 0) break;   // slot saturated mid-burst
      // Roll 3 random sticker options for this slot. Use weighted sampling
      // (matching the player's offer mechanism) so weights apply consistently
      // across both players.
      const stickerOffer = [];
      const stickerPool = stickerCandidates.slice();
      while (stickerOffer.length < 3 && stickerPool.length > 0) {
        const picked = pickWeightedSticker(stickerPool);
        const idx = stickerPool.indexOf(picked);
        stickerOffer.push(stickerPool.splice(idx, 1)[0]);
      }
      // Pick the highest-value sticker for this card.
      let bestSticker = stickerOffer[0], bestStickerScore = -Infinity;
      for (const s of stickerOffer) {
        const score = scoreOpponentSticker(s, slots[bestSlotIdx]);
        if (score > bestStickerScore) { bestStickerScore = score; bestSticker = s; }
      }
      pushStickerWithRoll(slots[bestSlotIdx], bestSticker.id, slots);
      remaining--;
    }
  }
}

// Heuristic sticker value per slot. Evasion keywords beat stat boosts;
// land/cost/empower stickers vary with slot context.
function scoreOpponentSticker(sticker, slot) {
  if (sticker.kind === 'stat_boost') {
    return 8 + (sticker.power || 0) * 2 + (sticker.toughness || 0) * 2;
  }
  if (sticker.kind === 'keyword') {
    const tier = {
      flying: 14, indestructible: 14, hexproof: 11, lifelink: 10, deathtouch: 10,
      first_strike: 8, vigilance: 7, haste: 7, trample: 6, menace: 5, reach: 4, flash: 3,
      innate: 6,   // free opening-hand land
    }[sticker.keyword] || 5;
    return tier;
  }
  // (innate is now a keyword — valued via the keyword tier map above.)
  // Land-color fixing: old grant_mana_ability + the new add_type land stickers.
  if (sticker.kind === 'grant_mana_ability' || sticker.kind === 'add_type') return 7;
  if (sticker.kind === 'cost_mod') {
    // Bigger cards benefit more. For stapled slots, the merged cost is
    // higher than the base alone — a costMinus1 on a Lions+Bolt at WR
    // is worth slightly more than on Lions alone.
    const tpl = tplForSlot(slot);
    const totalCost = tpl && tpl.cost
      ? (tpl.cost.C || 0) + ['W','U','B','R','G'].reduce((s,k) => s + (tpl.cost[k]||0), 0)
      : 0;
    return 4 + totalCost;
  }
  // Unreachable in offers: no trigger-kind sticker is ever offered by
  // stickersForSlot — scarified (weight 0, applied only by its dedicated
  // in-game effect) is the one trigger-kind sticker.
  if (sticker.kind === 'trigger') return 10;
  if (sticker.kind === 'subtype') {
    // Opp's decks aren't tribal-themed, so a stickered subtype is usually
    // inert. Score 1 — not zero (opp can still pick one if nothing else is
    // available, which is fine), but lower than everything else above.
    return 1;
  }
  if (sticker.kind === 'empower') {
    // Single-field Empower (v0.99.80+): exactly ONE eligible field is rolled
    // and bumped per stack. Score is the expected value across the uniform
    // pool of eligible (location, effect, mode?, field) targets — i.e., the
    // average per-field value over enumerateEmpowerTargets. Charms have ~3-6
    // eligible fields spread across modes, so an Empower on a charm is worth
    // ~one-mode's-worth in expectation. For stapled slots the merged template
    // adds the staple's empowerable fields to the pool.
    const tpl = tplForSlot(slot);
    if (!tpl) return 4;
    const FIELD_VALUE_BY_KIND = {
      damage: 4, pump: 2, gain_life: 1, affect_creature: 6, create_tokens: 3,
      move_card: 3,   // draw shape (the only empowerable move_card)
    };
    const targets = enumerateEmpowerTargets(tpl);
    if (targets.length === 0) return 4;
    // Each target contributes its kind's per-field value. For pump, the
    // value table is per-effect, not per-field; split it across power and
    // toughness slots (so a Giant Growth target doesn't double-count).
    let total = 0;
    for (const t of targets) {
      // Look up the actual effect kind via the location.
      let eff;
      if (t.location === 'effects') {
        eff = (t.modeIdx == null)
          ? (Array.isArray(tpl.effects) ? tpl.effects[t.effIdx] : null)
          : (tpl.effects && tpl.effects.modes ? tpl.effects.modes[t.modeIdx][t.effIdx] : null);
      } else if (t.location === 'triggers') {
        eff = tpl.triggers && tpl.triggers[t.subIdx] ? tpl.triggers[t.subIdx].effects[t.effIdx] : null;
      } else if (t.location === 'abilities') {
        eff = tpl.abilities && tpl.abilities[t.subIdx] ? tpl.abilities[t.subIdx].effects[t.effIdx] : null;
      }
      if (!eff) continue;
      const baseVal = FIELD_VALUE_BY_KIND[eff.kind] || 0;
      // Pump-shaped effects have two fields (power, toughness); each field's
      // expected value is half the kind's value.
      const fieldsForKind = EMPOWER_FIELDS[eff.kind] || [];
      const perField = fieldsForKind.length > 0 ? baseVal / fieldsForKind.length : baseVal;
      total += perField;
    }
    const expected = total / targets.length;
    return Math.max(4, Math.round(expected));
  }
  return 0;
}

// Pick the highest-scoring card in a pack given what's been drafted so far.
// Scoring philosophy:
//   - Commit to two colors as picks accumulate.
//   - Maintain a healthy curve (lots of 2s and 3s, fewer 5+).
//   - Maintain creature density (~14-17 of 23 picks should be creatures).
//   - Reward intrinsically strong cards (stats, evasion, removal).
//   - Penalize stacking too many copies of one card.
function pickFromPack(pack, picksSoFar) {
  let best = pack[0], bestScore = -Infinity;
  for (const id of pack) {
    const sc = scoreDraftCard(id, picksSoFar);
    if (sc > bestScore) { bestScore = sc; best = id; }
  }
  return best;
}

// Heuristic card score for drafting. Returns a number; higher = better pick.
function scoreDraftCard(id, picksSoFar) {
  const card = CARDS[id];
  if (!card) return -1000;
  let score = 0;

  // ----- 1. Color commitment -----
  // Early picks: color-agnostic. As picks accumulate, prefer cards in our
  // emerging colors. After ~5 picks we should be locked in.
  const myColorPips = countPips(picksSoFar);
  const myColors = COLORS.filter(k => myColorPips[k] > 0)
    .sort((a, b) => myColorPips[b] - myColorPips[a]);
  const topTwo = myColors.slice(0, 2);
  if (card.color) {
    if (topTwo.includes(card.color)) {
      // In one of our two colors — strong bonus that grows with commitment.
      score += 30 + Math.min(picksSoFar.length, 10);
    } else if (myColors.length === 0) {
      // First pick or no colors yet — neutral.
      score += 10;
    } else if (myColors.length === 1) {
      // Picking a second color — fine if early, expensive if late.
      score += picksSoFar.length < 5 ? 5 : -25;
    } else {
      // Splash into a third color. Tolerated early, punished later.
      // Curve: -5 at pick 2, -15 at pick 5, -30 at pick 10+.
      score -= Math.min(30, 5 + picksSoFar.length * 2.5);
    }
  }

  // ----- 2. Curve needs -----
  // Count how many cards of each cost we have. Score bonus for filling gaps.
  const curve = [0, 0, 0, 0, 0, 0, 0, 0]; // index = cost (0..7+)
  for (const pid of picksSoFar) {
    const c = CARDS[pid];
    if (!c.cost) continue;
    const cost = ENGINE.cardCost(c);
    curve[Math.min(cost, 7)]++;
  }
  const cardCost = card.cost ? Math.min(ENGINE.cardCost(card), 7) : 0;
  // Target distribution (rough): plenty of 2s and 3s, moderate 4s, few 5+s.
  const target = [0, 4, 6, 5, 4, 2, 1, 1];
  const gap = target[cardCost] - curve[cardCost];
  if (gap > 0) score += gap * 3;
  else if (gap < -1) score -= 5;     // already over-supplied at this cost

  // ----- 3. Creature density -----
  const creatureCount = picksSoFar.filter(pid => hasType(CARDS[pid], 'Creature')).length;
  const expectedCreatures = picksSoFar.length * (15 / 23);
  if (hasType(card, 'Creature')) {
    if (creatureCount < expectedCreatures) score += 8;
  } else {
    if (creatureCount < expectedCreatures - 2) score -= 8;
  }

  // ----- 4. Intrinsic card value -----
  score += intrinsicCardValue(card, picksSoFar);

  // ----- 5. Duplication penalty -----
  const copies = picksSoFar.filter(pid => pid === id).length;
  if (copies >= 1) score -= copies * 8;
  if (copies >= 4) score -= 1000;    // hard cap at 4 (never play 5+)

  return score;
}

// Intrinsic value: how good is this card on its own merits?
// Stats matter for creatures; effect type matters for spells.
// picksSoFar (optional): when present, lord/static-buff cards see how much
// tribe they've already enabled, so their value scales with deck density
// rather than using the conservative flat baseline.
function intrinsicCardValue(card, picksSoFar) {
  const ctx = Array.isArray(picksSoFar) ? { picksSoFar, totalPicks: TOTAL_PICKS } : undefined;
  return ENGINE.getCardValue(card, 'draft', ctx);
}

// Pack color policy: each slot rolls a color from a shrinking table. An
// off-deck color (no picks of it yet) drops from the table after one
// appearance in the pack; in-deck colors stay and may repeat. Colorless
// cards are eligible in every slot. There is no slot-index bias — see the
// inner comments in rollPack for the full mechanism.

function rollPack(pool, picksSoFar) {
  // Color-aware pack: roll a color per slot, sample a card from that color's
  // bucket. Off-deck colors (no picks of that color yet) appear at most once
  // per pack; in-deck colors can repeat. "In-deck" = ≥1 prior pick of that
  // color (looser than the UI's ≥2 threshold — we honor any signal).
  //
  // Sampling is weighted by `card.draftWeight`. Default is 1 — cards
  // without an explicit draftWeight appear at the baseline rate. Setting
  // weight 0 explicitly excludes a card; positive weights bias sampling
  // proportionally. Useful for stress-testing a specific mechanic by
  // boosting one card's weight while leaving others at default.
  const weightOf = (id) => {
    const c = CARDS[id];
    if (!c) return 0;
    const w = c.draftWeight;
    return (typeof w === 'number' && w >= 0) ? w : 1;
  };
  const pickWeightedDraftCard = (ids) => {
    if (ids.length === 0) return null;
    const total = ids.reduce((s, id) => s + weightOf(id), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const id of ids) {
      r -= weightOf(id);
      if (r <= 0) return id;
    }
    return ids[ids.length - 1];   // float drift fallback
  };

  // Which colors does the player already have in their deck? In Desert
  // Cube the player picks lands directly, so a Plains pick should signal
  // "I want white" just as much as a White Knight pick does. Read both
  // c.color (set for spells with colored cost) and c.mana (set for basic
  // lands) — either signal commits the deck to that color.
  const inDeckColors = new Set();
  for (const id of (picksSoFar || [])) {
    const c = CARDS[id];
    if (!c) continue;
    if (c.color) inDeckColors.add(c.color);
    else if (hasType(c, 'Land') && c.mana) inDeckColors.add(c.mana);
  }

  // Bucket the pool by color once; each slot pick is a uniform sample.
  const byColor = {W:[], U:[], B:[], R:[], G:[]};
  // Colorless cards (no color identity — robots, colorless artifacts, artifact
  // lands) fit ANY deck, so they're not "a color the player isn't" and aren't
  // subject to the off-color once-per-pack cap. They're eligible in EVERY slot:
  // a slot's candidates are its rolled color's bucket PLUS the colorless pool.
  // Without this they'd land in no bucket and (pre-2.0.60) were never offered.
  const colorless = [];
  for (const id of pool) {
    const c = CARDS[id];
    if (c && c.color && byColor[c.color]) byColor[c.color].push(id);
    else if (c && !c.color) colorless.push(id);
  }

  const out = [];
  const used = new Set();
  // Color table starts as all 5; we drop off-colors as they appear in earlier slots.
  let colorTable = COLORS.slice();

  for (let slot = 0; slot < PACK_SIZE; slot++) {
    // If somehow the color table was emptied (shouldn't happen with 5 colors
    // and 3 slots), fall back to the full color list.
    if (colorTable.length === 0) colorTable = COLORS.slice();

    // Roll a color uniformly from the current table.
    const color = colorTable[Math.floor(Math.random() * colorTable.length)];

    // Pick a card of that color, avoiding duplicates already in the pack.
    // pickWeightedDraftCard returns null when no candidate has positive weight; in
    // that case we fall through to "any unused card with positive weight"
    // from the full pool. This matters for the modal-stress-test config
    // where most cards have weight 0 — color-rolled slots whose color has
    // no positive-weight cards would otherwise emit nothing.
    // Candidates = the rolled color's bucket + the always-eligible colorless
    // pool (colorless fits any deck, so it competes for every slot).
    const sub = byColor[color] || [];
    const candidates = sub.concat(colorless).filter(id => !used.has(id));
    let id = candidates.length > 0 ? pickWeightedDraftCard(candidates) : null;
    if (!id) {
      const anyUnused = pool.filter(id => !used.has(id) && weightOf(id) > 0);
      if (anyUnused.length === 0) break;
      id = pickWeightedDraftCard(anyUnused);
      if (!id) break;
    }
    used.add(id);
    out.push(id);

    // If this color is OFF-deck, drop it from the table for future slots so it
    // appears at most once. Only when we actually picked a card OF that color —
    // a colorless pick in this slot doesn't "consume" the rolled color. In-deck
    // colors stay on the table and can repeat (rewards committed drafters).
    if (CARDS[id] && CARDS[id].color === color && !inDeckColors.has(color)) {
      colorTable = colorTable.filter(c => c !== color);
    }
  }

  return out;
}

function getPlayerPack() { return state ? state.currentPack.slice() : []; }
function getProgress() {
  if (!state) return {picked:0, total:TOTAL_PICKS};
  // In Desert Cube the player picks the full deck (40 cards including lands)
  // in a single draft phase; in classic they pick only the 23 spells.
  const total = state.mode === 'desertCube' ? TOTAL_DECK_SIZE : TOTAL_PICKS;
  return {picked: state.youPicks.length, total};
}
function isComplete()    { return state ? state.complete : false; }

function pickPlayer(tplId) {
  if (!state || state.complete) return;
  if (!state.currentPack.includes(tplId)) return;
  // Log the pick before mutating state — capture the pack as it was offered.
  PICKLOG.logPick(tplId, state.currentPack);
  state.youPicks.push(tplId);
  // Pick limit varies by mode: classic ends after 23 spell picks (lands are
  // auto-allocated downstream); desertCube ends after a full 40-card deck
  // (lands picked alongside spells from the packs).
  const limit = state.mode === 'desertCube' ? TOTAL_DECK_SIZE : TOTAL_PICKS;
  if (state.youPicks.length >= limit) {
    state.complete = true;
    state.currentPack = [];
    return;
  }
  state.currentPack = rollPackForMode(draftPool(), state.youPicks, state.mode);
}

// Count colored mana symbols across a card list. Each pip = 1. The land
// branch is not mode-gated: any land with a colored `mana` field counts as
// one pip of that color. Basic lands only appear in picks in Desert Cube
// (a Plains contributes a "W pip"), but a drafted colored-mana nonbasic
// land (e.g. the artifact lands) signals its color in either mode — a
// deliberate commitment signal. Feeds allocLands and scoreDraftCard's
// color-commitment read; rollPack reads land colors via its own separate
// inDeckColors scan, not through here.
function countPips(tplIds) {
  const pips = {W:0, U:0, B:0, R:0, G:0};
  for (const id of tplIds) {
    const c = CARDS[id];
    if (!c) continue;
    if (c.cost) {
      for (const k of COLORS) pips[k] += (c.cost[k] || 0);
    } else if (hasType(c, 'Land') && c.mana && pips[c.mana] !== undefined) {
      pips[c.mana] += 1;
    }
  }
  return pips;
}

// Allocate TOTAL_LANDS basic lands proportional to colored pips.
// Largest-remainder method to handle rounding cleanly.
function allocLands(pips) {
  const totalPips = COLORS.reduce((s, k) => s + pips[k], 0);
  if (totalPips === 0) {
    // Edge case: no colored pips. Default to all forests.
    return Array(TOTAL_LANDS).fill('forest');
  }
  const exact = {};
  const floor = {};
  let allocated = 0;
  for (const k of COLORS) {
    exact[k] = (pips[k] / totalPips) * TOTAL_LANDS;
    floor[k] = Math.floor(exact[k]);
    allocated += floor[k];
  }
  // Distribute remaining lands by largest fractional remainder.
  let remaining = TOTAL_LANDS - allocated;
  const remainders = COLORS
    .map(k => ({ k, frac: exact[k] - floor[k], pips: pips[k] }))
    .sort((a, b) => (b.frac - a.frac) || (b.pips - a.pips));
  for (let i = 0; i < remaining; i++) {
    floor[remainders[i % remainders.length].k]++;
  }
  // Build list.
  const out = [];
  for (const k of COLORS) {
    for (let i = 0; i < floor[k]; i++) out.push(COLOR_TO_LAND[k]);
  }
  return out;
}

function getPlayerDeck() {
  if (!state) return null;
  const pips = countPips(state.youPicks);
  const colors = summarizeColors(pips);
  // Finalize the picklog entry for this draft. Idempotent — if called
  // multiple times only the first finishes (currentDraft is null after).
  PICKLOG.finishDraft(colors);
  // Classic mode: 23 spell picks + 17 auto-allocated lands (proportional to
  // colored pips). Desert Cube: the youPicks list already includes lands
  // since the player drafted them directly — no extra allocation.
  const cards = state.mode === 'desertCube'
    ? state.youPicks.slice()
    : [...state.youPicks, ...allocLands(pips)];
  return {
    cards,
    colors,
    picks: state.youPicks.slice(),
  };
}

function summarizeColors(pips) {
  return COLORS.filter(k => pips[k] > 0);
}

return {
  startDraft, getPlayerPack, getProgress, pickPlayer, isComplete,
  getPlayerDeck, buildOpponentDeck,
  // Heuristic card picker. Exposed for the self-play harness (heuristic-drafted
  // player mode) and any other consumer that wants to drive a programmatic
  // draft with the same scorer opp uses.
  pickFromPack,
  // Roll a fresh pack against the standard draft pool, biased toward the
  // colors implied by `picksSoFar` (a list of tplIds). The sole caller —
  // RUN's Transform reward — passes ALL deck slots, lands included; land
  // entries feed the in-deck color signal correctly via inDeckColors.
  rollTransformPack: (picksSoFar) => rollPack(draftPool(), picksSoFar || []),
  // Constructed deck registry — read-only access for UI (map tooltips need
  // deck names) and map generation (needs the ID list to pick a deck).
  getConstructedDeck,
  getConstructedDeckIds: () => Object.keys(CONSTRUCTED_DECKS),
  // for debugging:
  _state: () => state,
};
})();
