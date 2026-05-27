// SAVE_VERSION bumps on schema change; MIGRATIONS walks old saves forward.
// Hoisted out of the RUN IIFE so the test harness can exercise them via EXPOSED.
const SAVE_KEY = 'magiclike_run_v1';
const SAVE_VERSION = 2;

// tplId renames — old → new. Used by run-save migration AND picklog translation.
// v1.0.134.16: four cards' tplIds didn't match display names from earlier renames.
const TPLID_RENAMES = {
  archmage: 'archmageOfVeils',
  fireImp:  'cinderSprite',
  zealot:   'holyZealot',
  merfolk:  'merfolkLooter',
};
function renameTplId(id) { return TPLID_RENAMES[id] || id; }

const MIGRATIONS = {
  1: (blob) => {
    // Apply rename map to every place a tplId persists:
    // slots[].tplId, slots[].stapledTpls[], pendingNeowModifier, currentPack[], youPicks[], oppDecks[][]
    const rs = blob.runState || {};
    if (Array.isArray(rs.slots)) {
      for (const slot of rs.slots) {
        if (slot && slot.tplId) slot.tplId = renameTplId(slot.tplId);
        if (slot && Array.isArray(slot.stapledTpls)) {
          slot.stapledTpls = slot.stapledTpls.map(renameTplId);
        }
      }
    }
    if (rs.pendingNeowModifier) rs.pendingNeowModifier = renameTplId(rs.pendingNeowModifier);
    if (Array.isArray(rs.currentPack)) rs.currentPack = rs.currentPack.map(renameTplId);
    if (Array.isArray(rs.youPicks))    rs.youPicks    = rs.youPicks.map(renameTplId);
    if (Array.isArray(rs.oppDecks)) {
      for (const deck of rs.oppDecks) {
        if (Array.isArray(deck)) {
          for (let i = 0; i < deck.length; i++) deck[i] = renameTplId(deck[i]);
        }
      }
    }
    blob.version = 2;
    return blob;
  },
};

// RUN — drafted deck across games. Public API: start, startNextGame, recordResult, getStats, isActive.
const RUN = (function() {

let runState = null;

function save() {
  if (!runState) return;
  try {
    const blob = { version: SAVE_VERSION, runState };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

// §3.8 snake_case rename map for sticker IDs stored in saved slots.
const STICKER_ID_RENAMES = {
  plus1plus1: 'plus1_plus1',
  costMinus1: 'cost_minus_1',
  landColor_W: 'land_color_w', landColor_U: 'land_color_u', landColor_B: 'land_color_b',
  landColor_R: 'land_color_r', landColor_G: 'land_color_g',
};

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    let blob = JSON.parse(raw);
    while (blob.version < SAVE_VERSION) {
      const migrate = MIGRATIONS[blob.version];
      if (!migrate) {
        console.warn(`No migration from save v${blob.version}; discarding save.`);
        clearSave();
        return false;
      }
      blob = migrate(blob);
    }
    if (!blob.runState || !blob.runState.slots || !Array.isArray(blob.runState.slots)) {
      console.warn('Save shape unrecognized; discarding.');
      clearSave();
      return false;
    }
    runState = blob.runState;
    // Strip unknown sticker IDs (legacy saves), migrate legacy formats, backfill empowerRolls.
    // `dirty` tracks any normalization that mutated runState — it MUST be
    // persisted, or the (random) backfills re-roll on every load and a buffed
    // stat flickers between sessions.
    let dirty = false;
    let stalePruned = 0;
    let rollsBackfilled = 0;
    let subtypeMigrated = 0;
    if (Array.isArray(runState.slots)) {
      for (const slot of runState.slots) {
        if (!Array.isArray(slot.stickers)) continue;
        if (!Array.isArray(slot.subtypeRolls)) slot.subtypeRolls = [];
        slot.stickers = slot.stickers.map(id => {
          if (typeof id === 'string' && id.startsWith('subtype_') && id !== 'subtype') {
            const sub = id.slice('subtype_'.length);
            const cap = sub.charAt(0).toUpperCase() + sub.slice(1);
            slot.subtypeRolls.push(cap);
            subtypeMigrated++;
            return 'subtype';
          }
          // §3.8 snake_case sticker-id renames.
          if (STICKER_ID_RENAMES[id]) { dirty = true; return STICKER_ID_RENAMES[id]; }
          return id;
        });
        const before = slot.stickers.length;
        // Keep registry-id stickers AND inline {kind,...} descriptors (§3.8
        // apply_sticker products: cost_mod / set_color / stat_boost snapshots).
        slot.stickers = slot.stickers.filter(s =>
          (s && typeof s === 'object' && s.kind) || STICKERS[s]);
        stalePruned += before - slot.stickers.length;
        // Backfill empowerRolls for empower stickers without recorded rolls.
        const empowerCount = slot.stickers.filter(id => id === 'empower').length;
        if (!Array.isArray(slot.empowerRolls)) slot.empowerRolls = [];
        while (slot.empowerRolls.length < empowerCount) {
          const tpl = tplForSlot(slot);
          slot.empowerRolls.push(tpl ? rollEmpowerTarget(tpl) : null);
          rollsBackfilled++;
        }
        if (slot.empowerRolls.length > empowerCount) {
          slot.empowerRolls.length = empowerCount;
        }
      }
      if (stalePruned > 0) {
        console.log(`Pruned ${stalePruned} stale sticker reference(s) from save.`);
      }
      if (rollsBackfilled > 0) {
        console.log(`Backfilled ${rollsBackfilled} empower roll(s) on legacy save.`);
      }
      if (subtypeMigrated > 0) {
        console.log(`Migrated ${subtypeMigrated} legacy subtype sticker(s) to unified format.`);
      }
      if (stalePruned > 0 || rollsBackfilled > 0 || subtypeMigrated > 0) dirty = true;
    }
    // Reroll pendingReward if it's not a current shape (legacy splice pre-rolls).
    if (runState.pendingReward) {
      const ph = runState.pendingReward.phase;
      if (ph !== 'mixed' && ph !== 'transformPick' && ph !== 'twoStickersReveal') {
        runState.pendingReward = generateRewardOffer();
        dirty = true;
      }
    }
    // Map migrations: color/constructedId/boss-type backfill for legacy saves.
    if (runState.map && Array.isArray(runState.map.nodes)) {
      const COLOR_KEYS = ['W','U','B','R','G'];
      const maxLevel = runState.map.nodes.reduce((m, n) => Math.max(m, n.level), 0);
      const bossIds = (typeof DRAFT !== 'undefined' && DRAFT.getConstructedDeckIds)
        ? DRAFT.getConstructedDeckIds().filter(id => {
            const spec = DRAFT.getConstructedDeck(id);
            return spec && spec.isBoss;
          })
        : [];
      for (const n of runState.map.nodes) {
        if (!('constructedId' in n)) { n.constructedId = null; dirty = true; }
        const isExit = (n.level === maxLevel);
        if (isExit && n.type !== 'boss' && bossIds.length > 0) {
          n.type = 'boss';
          n.constructedId = bossIds[Math.floor(Math.random() * bossIds.length)];
          dirty = true;
        }
        if ('color' in n) continue;
        const isEnd = (n.level === 0 || n.level === maxLevel);
        if (isEnd) { n.color = null; dirty = true; continue; }
        n.color = Math.random() < 0.6
          ? COLOR_KEYS[Math.floor(Math.random() * 5)]
          : null;
        dirty = true;
      }
    }
    if (dirty) save();
    return true;
  } catch (e) {
    console.warn('Load failed:', e);
    clearSave();
    return false;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function start(playerDeck, modifierId) {
  // Deck → slots {tplId, stickers}. Lands are slots too (need innate sticker support).
  // chargesAtRunStart templates (Stapler) get a charges counter.
  const slots = playerDeck.cards.map(tplId => {
    const slot = { tplId, stickers: [] };
    const tpl = CARDS[tplId];
    if (tpl && typeof tpl.chargesAtRunStart === 'number') {
      slot.charges = tpl.chargesAtRunStart;
    }
    return slot;
  });
  // Apply Neow-style run modifier if one was chosen. Modifiers can return
  // `extras` — additional slots to append (e.g., City of Brass with innate).
  // Future-proof: modifiers can also return other run-state mutations; we
  // just consume `extras` for now.
  if (modifierId && RUN_MODIFIERS[modifierId]) {
    // Pass the in-progress slots into apply() so boons can reflect on the
    // deck — e.g., to pick a random creature slot to anoint, or to skip
    // application if no eligible slots exist. apply() can:
    //   - return {extras: [...]} to APPEND new slots (City of Brass, Elystra)
    //   - mutate the slots array IN PLACE to modify existing slots (Watcher's
    //     Gift attaches a bonusTrigger to a chosen creature slot)
    // Both shapes are valid; mutation is the right choice when the boon is
    // modifying existing cards rather than adding new ones.
    const result = RUN_MODIFIERS[modifierId].apply(slots) || {};
    if (Array.isArray(result.extras)) {
      for (const e of result.extras) {
        // Pass through optional slot-level fields. Most boon-extras only
        // need tplId + stickers (City of Brass, Elystra, Phylactery), but
        // The Mercurial Adept passes a triggerPool that gets rolled at
        // each game-start, and future boons may want to seed permaBuffs,
        // empowerRolls, or bonusTriggers directly. The extras slot is the
        // right place for these — they're how the boon shapes the slot
        // it's adding.
        const slot = { tplId: e.tplId, stickers: (e.stickers || []).slice() };
        if (e.triggerPool) slot.triggerPool = e.triggerPool;
        if (e.bonusTrigger) slot.bonusTrigger = e.bonusTrigger;
        if (e.permaBuffs) slot.permaBuffs = e.permaBuffs;
        if (e.empowerRolls) slot.empowerRolls = e.empowerRolls.slice();
        if (e.subtypeRolls) slot.subtypeRolls = e.subtypeRolls.slice();
        const extraTpl = CARDS[e.tplId];
        if (extraTpl && typeof extraTpl.chargesAtRunStart === 'number') {
          slot.charges = (typeof e.charges === 'number') ? e.charges : extraTpl.chargesAtRunStart;
        }
        slots.push(slot);
      }
    }
  }
  runState = {
    slots,
    colors: playerDeck.colors,
    modifier: modifierId || null,
    gameNum: 0,
    wins: 0,
    active: true,
    lastResult: null,
    lastPlayedSlotIdxs: [],
    lastClaimedKeywords: [],
    pendingReward: null,
    sectorNum: 1,
    map: generateMap(),
    pendingMapChoice: null,
    pendingPostDraftOffer: null,
  };
  runState.map.currentNodeId = runState.map.rootId;
  // Post-draft Innate offer: up to 3 most-drafted basic types.
  const BASIC_TPL_IDS = new Set(['plains','island','swamp','mountain','forest']);
  const basicCounts = {};
  for (const slot of runState.slots) {
    if (BASIC_TPL_IDS.has(slot.tplId)) {
      basicCounts[slot.tplId] = (basicCounts[slot.tplId] || 0) + 1;
    }
  }
  const distinctBasics = Object.keys(basicCounts)
    .sort((a, b) => basicCounts[b] - basicCounts[a])
    .slice(0, 3);
  if (distinctBasics.length > 0) {
    runState.pendingPostDraftOffer = { kind: 'innate', basics: distinctBasics };
  }
  save();
}

// STS-style branching: DEPTH levels × WIDTH nodes (root/exit single).
// Mid nodes: 15% constructed, else ~60% colored. Boss decks gate to the exit.
const MAP_DEPTH = 5;
const MAP_WIDTH = 3;
function generateMap() {
  const nodes = [];
  const edges = [];
  const idForLevelCol = (level, col) => `n_${level}_${col}`;

  const COLOR_KEYS = ['W','U','B','R','G'];
  const COLOR_PROB = 0.6;
  const CONSTRUCTED_PROB = 0.15;
  const allConstructedIds = (typeof DRAFT !== 'undefined' && DRAFT.getConstructedDeckIds)
    ? DRAFT.getConstructedDeckIds() : [];
  const regularConstructedIds = allConstructedIds.filter(id => {
    const spec = DRAFT.getConstructedDeck(id);
    return spec && !spec.isBoss;
  });
  const bossConstructedIds = allConstructedIds.filter(id => {
    const spec = DRAFT.getConstructedDeck(id);
    return spec && spec.isBoss;
  });
  for (let level = 0; level < MAP_DEPTH; level++) {
    const isRoot = (level === 0);
    const isExit = (level === MAP_DEPTH - 1);
    const isEnd = isRoot || isExit;
    const cols = isEnd ? 1 : MAP_WIDTH;
    for (let col = 0; col < cols; col++) {
      let color = null;
      let constructedId = null;
      let type = 'combat';
      if (isExit && bossConstructedIds.length > 0) {
        type = 'boss';
        constructedId = bossConstructedIds[Math.floor(Math.random() * bossConstructedIds.length)];
      } else if (!isEnd) {
        const roll = Math.random();
        if (roll < CONSTRUCTED_PROB && regularConstructedIds.length > 0) {
          constructedId = regularConstructedIds[Math.floor(Math.random() * regularConstructedIds.length)];
        } else if (roll < CONSTRUCTED_PROB + COLOR_PROB * (1 - CONSTRUCTED_PROB)) {
          color = COLOR_KEYS[Math.floor(Math.random() * 5)];
        }
      }
      nodes.push({
        id: idForLevelCol(level, col),
        level, col, type, color, constructedId, cols,
      });
    }
  }

  // Edges: each non-final node → 1-2 successors in nearby next-level cols.
  for (let level = 0; level < MAP_DEPTH - 1; level++) {
    const nextLevel = level + 1;
    const isCurEnd = (level === 0 || level === MAP_DEPTH - 1);
    const isNextEnd = (nextLevel === 0 || nextLevel === MAP_DEPTH - 1);
    const curCols = isCurEnd ? 1 : MAP_WIDTH;
    const nextCols = isNextEnd ? 1 : MAP_WIDTH;
    for (let col = 0; col < curCols; col++) {
      const fromId = idForLevelCol(level, col);
      const ratio = (col + 0.5) / curCols;
      const targetCol = Math.floor(ratio * nextCols);
      const candidates = new Set();
      candidates.add(targetCol);
      if (nextCols > 1 && Math.random() < 0.6) {
        const offset = Math.random() < 0.5 ? -1 : 1;
        const altCol = targetCol + offset;
        if (altCol >= 0 && altCol < nextCols) candidates.add(altCol);
      }
      for (const c of candidates) {
        edges.push({ from: fromId, to: idForLevelCol(nextLevel, c) });
      }
    }
  }

  // Reachability: every non-root node gets ≥1 incoming edge.
  for (let level = 1; level < MAP_DEPTH; level++) {
    const isEnd = (level === 0 || level === MAP_DEPTH - 1);
    const cols = isEnd ? 1 : MAP_WIDTH;
    for (let col = 0; col < cols; col++) {
      const id = idForLevelCol(level, col);
      if (edges.some(e => e.to === id)) continue;
      const prevLevel = level - 1;
      const isPrevEnd = (prevLevel === 0 || prevLevel === MAP_DEPTH - 1);
      const prevCols = isPrevEnd ? 1 : MAP_WIDTH;
      const prevCol = Math.min(prevCols - 1, Math.max(0,
        Math.round(col * prevCols / cols)));
      edges.push({ from: idForLevelCol(prevLevel, prevCol), to: id });
    }
  }

  const rootId = idForLevelCol(0, 0);
  return {
    nodes, edges,
    rootId,
    currentNodeId: null,
    visitedNodeIds: [],
  };
}

function getMapSuccessors(nodeId) {
  if (!runState || !runState.map) return [];
  return runState.map.edges
    .filter(e => e.from === nodeId)
    .map(e => e.to);
}

function startNextGame() {
  if (!runState || !runState.active) return null;
  // Advance map. Single-successor → auto. Multi → pickMapNode resolved first.
  if (runState.gameNum > 0 && runState.map && runState.map.currentNodeId) {
    const cur = runState.map.currentNodeId;
    const completedVisited = runState.map.visitedNodeIds.includes(cur);
    if (completedVisited) {
      const succ = getMapSuccessors(cur);
      if (succ.length === 1) {
        runState.map.currentNodeId = succ[0];
      } else if (succ.length >= 2) {
        console.warn('startNextGame: pending map choice not resolved; using current node');
      }
    }
  }
  runState.gameNum++;
  runState.lastResult = null;
  runState.pendingReward = null;
  // Snapshot slots for crash-restore. Cleared on clean win/loss.
  runState.midGameSlotsSnapshot = JSON.parse(JSON.stringify(runState.slots));
  const numStickers = Math.max(0, runState.gameNum - 1);
  const numStaples = Math.max(0, Math.floor((runState.gameNum - 1) / 3));
  const numClones = Math.max(0, Math.floor((runState.gameNum - 1) / 5));
  // constructedId takes precedence over colorAffinity for drafter.
  const curNode = runState.map && runState.map.nodes
    ? runState.map.nodes.find(n => n.id === runState.map.currentNodeId)
    : null;
  const colorAffinity = curNode ? curNode.color : null;
  const constructedId = curNode ? curNode.constructedId : null;
  const opp = DRAFT.buildOpponentDeck(numStickers, numStaples, numClones, colorAffinity, constructedId);
  ENGINE.init(runState.slots, opp.cards);
  save();
  PICKLOG.recordGamePlayed();
  let bossName = null;
  let bossIcon = null;
  if (curNode && curNode.type === 'boss' && constructedId) {
    const spec = getConstructedDeck(constructedId);
    if (spec && spec.name) bossName = spec.name;
    if (spec && spec.icon) bossIcon = spec.icon;
  }
  return { gameNum: runState.gameNum, oppColors: opp.colors, bossName, bossIcon };
}

// Commit fork choice; validates against pendingMapChoice options.
function pickMapNode(nodeId) {
  if (!runState || !runState.pendingMapChoice) return false;
  if (!runState.pendingMapChoice.options.includes(nodeId)) return false;
  runState.map.currentNodeId = nodeId;
  runState.pendingMapChoice = null;
  save();
  return true;
}

// Apply Innate sticker to the first slot of the chosen basic tplId.
function pickPostDraftOffer(tplId) {
  if (!runState || !runState.pendingPostDraftOffer) return false;
  const offer = runState.pendingPostDraftOffer;
  if (offer.kind !== 'innate') return false;
  if (!offer.basics.includes(tplId)) return false;
  const targetSlotIdx = runState.slots.findIndex(s => s.tplId === tplId);
  if (targetSlotIdx < 0) return false;
  applyStickerToSlot(targetSlotIdx, 'innate');
  runState.pendingPostDraftOffer = null;
  save();
  return true;
}

function getPostDraftOffer() {
  return (runState && runState.pendingPostDraftOffer) ? runState.pendingPostDraftOffer : null;
}

function getMapState() {
  if (!runState || !runState.map) return null;
  return {
    nodes: runState.map.nodes,
    edges: runState.map.edges,
    currentNodeId: runState.map.currentNodeId,
    visitedNodeIds: runState.map.visitedNodeIds,
    pendingChoice: runState.pendingMapChoice,
    sectorNum: runState.sectorNum || 1,
  };
}

function recordResult(winner, playedSlotIdxs, claimedKeywords) {
  if (!runState) return;
  // Clear snapshot — game completed, mutations are earned.
  runState.midGameSlotsSnapshot = null;
  // Set→array since JSON doesn't carry Set type. Reset each game.
  runState.lastPlayedSlotIdxs = Array.isArray(playedSlotIdxs)
    ? playedSlotIdxs.slice()
    : (playedSlotIdxs instanceof Set ? [...playedSlotIdxs] : []);
  runState.lastClaimedKeywords = Array.isArray(claimedKeywords)
    ? claimedKeywords.slice()
    : (claimedKeywords instanceof Set ? [...claimedKeywords] : []);
  if (winner === 'you') {
    runState.wins++;
    runState.lastResult = 'won';
    runState.pendingReward = generateRewardOffer();
    if (runState.map && runState.map.currentNodeId) {
      const cur = runState.map.currentNodeId;
      if (!runState.map.visitedNodeIds.includes(cur)) {
        runState.map.visitedNodeIds.push(cur);
      }
      const successors = getMapSuccessors(cur);
      if (successors.length === 0) {
        // Sector clear → new map. Slots/wins/gameNum carry forward.
        runState.sectorNum = (runState.sectorNum || 1) + 1;
        runState.map = generateMap();
        runState.map.currentNodeId = runState.map.rootId;
        runState.pendingMapChoice = null;
      } else if (successors.length >= 2) {
        runState.pendingMapChoice = { options: successors };
      }
      // 1 successor: pendingMapChoice stays null; startNextGame auto-advances.
    }
    save();
  } else {
    runState.lastResult = 'lost';
    runState.active = false;
    PICKLOG.recordRunResult('lost');
    // Run is over — no need to keep the save around.
    clearSave();
  }
}

// Per-candidate reward type weighting. Each of the 3 offer slots rolls
// independently from this distribution. If the rolled type can't be
// fulfilled (e.g., ripUp when deck is too small), that type is dropped from
// this slot's roll and we re-pick.
const REWARD_TYPE_WEIGHTS = {
  sticker:      12,   // baseline — most rewards are sticker pairs
  twoStickers:   3,   // common — applies two random weighted stickers to a slot
  transform:     2,   // uncommon — opens a draft-style replacement pack
  clone:         2,   // uncommon — duplicate a slot (fresh, no stickers carry)
  threeStickersBlind: 1,  // rare — three stickers on a random creature slot,
                          // identity not revealed at offer time. Lowered from
                          // 2 → 1 (v1.0.46) because three stickers on a single
                          // creature reliably produces a centerpiece threat,
                          // and at weight 2 it was showing up often enough to
                          // distort the run's power curve.
  ripUp:         1,   // rare — permanently removes a slot
  splice:        2,   // uncommon — combines two of the player's cards into
                      // one slot (Bolt + Giant Growth → 2-cost spell that
                      // bolts a creature AND pumps another). Cost-additive,
                      // deck-size-reducing. Player picks the base, then
                      // picks the staple from remaining slots.
};

// Roll the type of one reward candidate by weight. Allows excluded types so
// we can fall back when a type can't be fulfilled.
function pickRewardType(excluded) {
  const exc = excluded || new Set();
  let total = 0;
  for (const [t, w] of Object.entries(REWARD_TYPE_WEIGHTS)) {
    if (!exc.has(t)) total += w;
  }
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const [t, w] of Object.entries(REWARD_TYPE_WEIGHTS)) {
    if (exc.has(t)) continue;
    roll -= w;
    if (roll < 0) return t;
  }
  return null;
}

// Build one reward candidate. Returns null if not materializable (caller falls back).
function rollOneCandidate(type, alreadyOffered) {
  if (type === 'sticker') {
    const allIdx = runState.slots.map((_, i) => i);
    const eligibleSlots = filterByPlayed(allIdx.filter(i => stickersFor(i).length > 0));
    if (eligibleSlots.length === 0) return null;
    for (let tries = 0; tries < 30; tries++) {
      const slotIdx = eligibleSlots[Math.floor(Math.random() * eligibleSlots.length)];
      const stickerOpts = stickersFor(slotIdx);
      if (stickerOpts.length === 0) continue;
      const sticker = weightedPick(stickerOpts);
      const dupKey = `sticker:${slotIdx}:${sticker.id}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      const cand = { kind: 'sticker', slotIdx, stickerId: sticker.id };
      // Pre-roll empower/subtype at offer time so the preview matches the commit.
      if (sticker.id === 'empower') {
        const tpl = tplForSlot(runState.slots[slotIdx]);
        cand.empowerRoll = tpl ? rollEmpowerTarget(tpl) : null;
      }
      if (sticker.id === 'subtype') {
        cand.subtypeRoll = rollSubtypeFromDeck(runState.slots, slotIdx);
        if (!cand.subtypeRoll) {
          alreadyOffered.delete(dupKey);
          continue;
        }
      }
      return cand;
    }
    return null;
  }
  if (type === 'transform') {
    // Lands included — manabase modification is intentional.
    const eligibleSlots = runState.slots.map((_, i) => i);
    if (eligibleSlots.length === 0) return null;
    // Pre-roll pack so options stay stable across save/load.
    const deckTplIds = runState.slots.map(s => s.tplId);
    for (let tries = 0; tries < 30; tries++) {
      const slotIdx = eligibleSlots[Math.floor(Math.random() * eligibleSlots.length)];
      const dupKey = `transform:${slotIdx}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      const pack = DRAFT.rollTransformPack(deckTplIds);
      if (!pack || pack.length === 0) return null;
      return { kind: 'transform', slotIdx, replacementPack: pack };
    }
    return null;
  }
  if (type === 'ripUp') {
    if (runState.slots.length === 0) return null;
    for (let tries = 0; tries < 30; tries++) {
      const idx = Math.floor(Math.random() * runState.slots.length);
      const dupKey = `ripUp:${idx}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      return { kind: 'ripUp', slotIdx: idx };
    }
    return null;
  }
  if (type === 'splice') {
    // Unordered pair enum (i<j); canonicalSplicePair handles type-priority.
    if (runState.slots.length < 2) return null;
    const pairs = [];
    for (let i = 0; i < runState.slots.length; i++) {
      for (let j = i + 1; j < runState.slots.length; j++) {
        const tplI = runState.slots[i].tplId;
        const tplJ = runState.slots[j].tplId;
        const [canonBaseTpl, , swapped] = canonicalSplicePair(tplI, tplJ);
        const baseIdx = swapped ? j : i;
        const stapleIdx = swapped ? i : j;
        if (!isSpliceableBase(runState.slots[baseIdx].tplId)) continue;
        const stapleSlot = runState.slots[stapleIdx];
        if (Array.isArray(stapleSlot.stapledTpls) && stapleSlot.stapledTpls.length > 0) continue;
        if (!isCompatibleStaplePair(runState.slots[baseIdx].tplId, stapleSlot.tplId)) continue;
        pairs.push({ baseSlotIdx: baseIdx, stapleSlotIdx: stapleIdx });
      }
    }
    if (pairs.length === 0) return null;
    const dupKey = 'splice';
    if (alreadyOffered.has(dupKey)) return null;
    alreadyOffered.add(dupKey);
    const pick = pairs[Math.floor(Math.random() * pairs.length)];
    return { kind: 'splice', baseSlotIdx: pick.baseSlotIdx, stapleSlotIdx: pick.stapleSlotIdx };
  }
  if (type === 'clone') {
    if (runState.slots.length === 0) return null;
    for (let tries = 0; tries < 30; tries++) {
      const idx = Math.floor(Math.random() * runState.slots.length);
      const dupKey = `clone:${idx}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      return { kind: 'clone', slotIdx: idx };
    }
    return null;
  }
  if (type === 'twoStickers') {
    const allIdx = runState.slots.map((_, i) => i);
    const eligibleSlots = filterByPlayed(allIdx.filter(i => stickersFor(i).length > 0));
    if (eligibleSlots.length === 0) return null;
    for (let tries = 0; tries < 30; tries++) {
      const slotIdx = eligibleSlots[Math.floor(Math.random() * eligibleSlots.length)];
      const dupKey = `twoStickers:${slotIdx}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      // Stickers rolled at pick time, not offer — random feels at click.
      return { kind: 'twoStickers', slotIdx };
    }
    return null;
  }
  if (type === 'threeStickersBlind') {
    // Mystery creature reward — slot rolled at pick time. Creature-only
    // because they take the widest sticker range, feel emotionally fitting.
    if (alreadyOffered.has('threeStickersBlind')) return null;
    const eligibleSlots = runState.slots
      .map((s, i) => ({s, i}))
      .filter(({s, i}) => {
        const tpl = CARDS[s.tplId];
        if (!tpl || tpl.type !== 'Creature') return false;
        return stickersFor(i).length > 0;
      });
    const playedEligible = filterByPlayed(eligibleSlots.map(e => e.i));
    if (playedEligible.length === 0) return null;
    alreadyOffered.add('threeStickersBlind');
    return { kind: 'threeStickersBlind' };
  }
  return null;
}

// Up to 3 mixed-type reward candidates (REWARD_TYPE_WEIGHTS).
function generateRewardOffer() {
  const candidates = [];
  const alreadyOffered = new Set();
  for (let i = 0; i < 3; i++) {
    const excluded = new Set();
    let cand = null;
    while (!cand) {
      const type = pickRewardType(excluded);
      if (!type) break;     // every type exhausted
      cand = rollOneCandidate(type, alreadyOffered);
      if (!cand) excluded.add(type);
    }
    if (cand) candidates.push(cand);
  }
  if (candidates.length === 0) return null;
  return { phase: 'mixed', candidates };
}

// Restrict offers to slots played this game. Fallback to unrestricted if intersection empty.
function filterByPlayed(slotIdxs) {
  const played = runState && runState.lastPlayedSlotIdxs;
  if (!Array.isArray(played) || played.length === 0) return slotIdxs;
  const playedSet = new Set(played);
  const filtered = slotIdxs.filter(i => playedSet.has(i));
  return filtered.length > 0 ? filtered : slotIdxs;
}

// Player-side wraps stickersForSlot with the keyword-claim gate (only claimed kws offerable).
function stickersFor(slotIdx) {
  const slot = runState && runState.slots && runState.slots[slotIdx];
  if (!slot) return [];
  const base = stickersForSlot(slot, deckColors());
  const claimed = runState && runState.lastClaimedKeywords;
  if (claimed === undefined || !Array.isArray(claimed)) return base;
  return base.filter(s => s.kind !== 'keyword' || claimed.includes(s.keyword));
}

function deckColors() {
  if (!runState) return [];
  return deckColorsFromSlots(runState.slots);
}

// Sticker/ripUp commit; transform → transformPick phase.
function pickRewardCandidate(idx) {
  if (!runState || !runState.pendingReward) return;
  if (runState.pendingReward.phase !== 'mixed') return;
  const cand = runState.pendingReward.candidates[idx];
  if (!cand) return;
  if (cand.kind === 'sticker') {
    const slot = runState.slots[cand.slotIdx];
    slot.stickers.push(cand.stickerId);
    // Consume pre-rolled empower/subtype; fallback rolls only on legacy shapes.
    if (cand.stickerId === 'empower') {
      const fallbackTpl = tplForSlot(slot);
      const roll = cand.empowerRoll || (fallbackTpl ? rollEmpowerTarget(fallbackTpl) : null);
      if (!Array.isArray(slot.empowerRolls)) slot.empowerRolls = [];
      slot.empowerRolls.push(roll);
    }
    if (cand.stickerId === 'subtype') {
      const roll = cand.subtypeRoll || rollSubtypeFromDeck(runState.slots, cand.slotIdx);
      if (!Array.isArray(slot.subtypeRolls)) slot.subtypeRolls = [];
      slot.subtypeRolls.push(roll);
    }
    runState.pendingReward = null;
    save();
    return;
  }
  if (cand.kind === 'ripUp') {
    runState.slots.splice(cand.slotIdx, 1);
    runState.pendingReward = null;
    save();
    return;
  }
  if (cand.kind === 'transform') {
    runState.pendingReward = {
      phase: 'transformPick',
      slotIdx: cand.slotIdx,
      replacementPack: cand.replacementPack.slice(),
    };
    save();
    return;
  }
  if (cand.kind === 'splice') {
    const ok = applySplice(cand.baseSlotIdx, cand.stapleSlotIdx);
    if (!ok) {
      runState.pendingReward = null;
      save();
    }
    return;
  }
  if (cand.kind === 'clone') {
    // Deep-clone all slot state (stickers, staples, empowerRolls, permaBuffs,
    // bonusTrigger) so the player gets the merged/buffed version, not just the base.
    const orig = runState.slots[cand.slotIdx];
    if (!orig) {
      runState.pendingReward = null;
      save();
      return;
    }
    const clone = {
      tplId: orig.tplId,
      stickers: orig.stickers.slice(),
    };
    if (Array.isArray(orig.stapledTpls) && orig.stapledTpls.length > 0) {
      clone.stapledTpls = orig.stapledTpls.slice();
    }
    if (Array.isArray(orig.empowerRolls) && orig.empowerRolls.length > 0) {
      clone.empowerRolls = orig.empowerRolls.map(r => ({...r}));
    }
    if (Array.isArray(orig.subtypeRolls) && orig.subtypeRolls.length > 0) {
      clone.subtypeRolls = orig.subtypeRolls.slice();
    }
    if (Array.isArray(orig.permaBuffs) && orig.permaBuffs.length > 0) {
      clone.permaBuffs = orig.permaBuffs.map(b => ({...b}));
    }
    if (orig.bonusTrigger) {
      clone.bonusTrigger = {
        ...orig.bonusTrigger,
        effects: (orig.bonusTrigger.effects || []).map(e => ({...e})),
      };
    }
    runState.slots.splice(cand.slotIdx + 1, 0, clone);
    runState.pendingReward = null;
    save();
    return;
  }
  if (cand.kind === 'twoStickers') {
    const slotIdx = cand.slotIdx;
    if (slotIdx == null || slotIdx < 0 || slotIdx >= runState.slots.length) {
      runState.pendingReward = null;
      save();
      return;
    }
    const applied = [];
    for (let i = 0; i < 2; i++) {
      const opts = stickersFor(slotIdx);
      if (opts.length === 0) break;
      const sticker = weightedPick(opts);
      const slot = runState.slots[slotIdx];
      pushStickerWithRoll(slot, sticker.id, runState.slots);
      applied.push(sticker.id);
    }
    runState.pendingReward = {
      phase: 'twoStickersReveal',
      slotIdx,
      appliedStickerIds: applied,
    };
    save();
    return;
  }
  if (cand.kind === 'threeStickersBlind') {
    // Re-check eligibility at pick time (deck may have shifted between offer/pick).
    const eligibleSlots = runState.slots
      .map((s, i) => ({s, i}))
      .filter(({s, i}) => {
        const tpl = CARDS[s.tplId];
        if (!tpl || tpl.type !== 'Creature') return false;
        return stickersFor(i).length > 0;
      });
    const playedFiltered = filterByPlayed(eligibleSlots.map(e => e.i));
    const finalSlots = eligibleSlots.filter(e => playedFiltered.includes(e.i));
    if (finalSlots.length === 0) {
      runState.pendingReward = null;
      save();
      return;
    }
    const chosen = finalSlots[Math.floor(Math.random() * finalSlots.length)];
    const slotIdx = chosen.i;
    const applied = [];
    for (let i = 0; i < 3; i++) {
      const opts = stickersFor(slotIdx);
      if (opts.length === 0) break;
      const sticker = weightedPick(opts);
      const slot = runState.slots[slotIdx];
      pushStickerWithRoll(slot, sticker.id, runState.slots);
      applied.push(sticker.id);
    }
    // Reuses the twoStickersReveal phase intentionally — same shape, same
    // UI (card + applied sticker list + Continue button). The flavor of
    // surprise is already conveyed by the player not having seen the slot
    // before; the reveal screen is just "here's what you got".
    runState.pendingReward = {
      phase: 'twoStickersReveal',
      slotIdx,
      appliedStickerIds: applied,
    };
    save();
    return;
  }
}

// Player chose a replacement card from the transform pack. Replace the slot
// (no stickers carry over — fresh slot) and clear the pending reward.
function pickTransformReplacement(tplId) {
  if (!runState || !runState.pendingReward) return;
  if (runState.pendingReward.phase !== 'transformPick') return;
  if (!runState.pendingReward.replacementPack.includes(tplId)) return;
  const slotIdx = runState.pendingReward.slotIdx;
  if (slotIdx == null || slotIdx < 0 || slotIdx >= runState.slots.length) {
    // Defensive: slot index invalidated somehow (shouldn't happen).
    runState.pendingReward = null;
    save();
    return;
  }
  runState.slots[slotIdx] = { tplId, stickers: [] };
  runState.pendingReward = null;
  save();
}

// Apply a splice — merge staple slot into base, remove staple. Pre-rolled
// at offer time. Defensively re-checks bounds/compat in case indices went
// stale across save/load.
function applySplice(baseSlotIdx, stapleSlotIdx) {
  if (!runState) return false;
  if (baseSlotIdx == null || stapleSlotIdx == null) return false;
  if (baseSlotIdx === stapleSlotIdx) return false;
  if (baseSlotIdx < 0 || baseSlotIdx >= runState.slots.length) return false;
  if (stapleSlotIdx < 0 || stapleSlotIdx >= runState.slots.length) return false;
  // Canonicalize by type priority — caller's "base"/"staple" labels advisory.
  const [canonBaseTpl, canonStapleTpl, swapped] = canonicalSplicePair(
    runState.slots[baseSlotIdx].tplId,
    runState.slots[stapleSlotIdx].tplId);
  if (swapped) {
    const t = baseSlotIdx; baseSlotIdx = stapleSlotIdx; stapleSlotIdx = t;
  }
  const baseSlot = runState.slots[baseSlotIdx];
  const stapleSlot = runState.slots[stapleSlotIdx];
  if (!baseSlot || !stapleSlot) return false;
  if (!isSpliceableBase(baseSlot.tplId)) return false;
  if (Array.isArray(stapleSlot.stapledTpls) && stapleSlot.stapledTpls.length > 0) return false;
  if (!isCompatibleStaplePair(baseSlot.tplId, stapleSlot.tplId)) return false;
  // Merge the staple's slot data into the base via the shared splice core
  // (engine.js mergeSpliceData). Stickers are slot-scoped and just concat;
  // empower rolls remap (effect indices shift when arrays concatenate / move
  // into an ETB trigger); subtype/permaBuffs concat; bonusTrigger: base wins.
  const merged = mergeSpliceData(
    { tplId: baseSlot.tplId, stickers: baseSlot.stickers, empowerRolls: baseSlot.empowerRolls,
      subtypeRolls: baseSlot.subtypeRolls, permaBuffs: baseSlot.permaBuffs,
      bonusTrigger: baseSlot.bonusTrigger, priorStaples: baseSlot.stapledTpls },
    { tplId: stapleSlot.tplId, stickers: stapleSlot.stickers, empowerRolls: stapleSlot.empowerRolls,
      subtypeRolls: stapleSlot.subtypeRolls, permaBuffs: stapleSlot.permaBuffs,
      bonusTrigger: stapleSlot.bonusTrigger });
  writeMergedSpliceToSlot(baseSlot, merged);
  // Remove the staple slot. If staple comes BEFORE base, removing it
  // shifts base's index down by 1 — but we don't read baseSlot's index
  // again, we already mutated baseSlot in place above, so the splice is
  // safe regardless of order.
  runState.slots.splice(stapleSlotIdx, 1);
  runState.pendingReward = null;
  save();
  return true;
}

// (countEffects + remapEmpowerRollForStaple moved to module scope so both
//  the RUN IIFE and the ENGINE IIFE can call them — ENGINE needs them for
//  in-game Stapler splice. The function bodies are unchanged from the
//  original RUN-private versions.)

// Dismiss the reveal screen for twoStickers — closes the modal so the
// player can advance to the next game.
function dismissReveal() {
  if (!runState || !runState.pendingReward) return;
  if (runState.pendingReward.phase !== 'twoStickersReveal') return;
  runState.pendingReward = null;
  save();
}

function getReward() {
  return runState ? runState.pendingReward : null;
}
function getSlots() {
  return runState ? runState.slots : null;
}

function getStats() {
  if (!runState) return null;
  return {
    gameNum: runState.gameNum,
    wins: runState.wins,
    active: runState.active,
    lastResult: runState.lastResult,
  };
}

function isActive() { return !!(runState && runState.active); }

// Roll back game number for mid-game restore. Called by the controller
// when a save is loaded mid-game (player closed tab during a game). Without
// this, startNextGame would bump gameNum past the game they were in, making
// it look like they skipped one.
function rollbackForMidGameRestore() {
  if (!runState) return;
  if (runState.gameNum > 0 && !runState.lastResult) {
    runState.gameNum--;
    // Restore the slot snapshot taken at game start. Reverts any mid-game
    // mutations (stickers added by Endomorph/Archdemon-bargain/Scarification,
    // Stapler splices, charge decrements, slot rips from Vile Edict). The
    // player faces the same encounter again with the same deck they started
    // it with — they can't farm boons by intentionally crashing.
    //
    // Defensive: snapshot may be absent for very old saves that pre-date
    // this feature (or for runs whose game-1 was completed before the
    // snapshot was added). In that case, skip — there's nothing better
    // than the current state to fall back to.
    if (runState.midGameSlotsSnapshot) {
      runState.slots = runState.midGameSlotsSnapshot;
      runState.midGameSlotsSnapshot = null;
      save();
    }
  }
}

// Apply a sticker to a slot at runtime. Used by mid-game effects
// (Endomorph's absorb). Non-stackable: silent no-op on duplicate.
// Persists via save flow. Caller separately applies the in-game effect
// (keyword grant, +1/+1) — this only mutates run-state.
function applyStickerToSlot(slotIdx, stickerId) {
  if (!runState || !runState.slots) return false;
  const slot = runState.slots[slotIdx];
  if (!slot) return false;
  // stickerId is a registry id (string) or an inline {kind,...} descriptor
  // (§3.8 apply_sticker). Inline descriptors carry per-application params, so
  // they bypass the id-based stackable dedup (cost_mod stacks; set_color is
  // idempotent).
  const isInline = stickerId && typeof stickerId === 'object';
  const sticker = isInline ? stickerId : STICKERS[stickerId];
  if (!sticker || !sticker.kind) return false;
  if (!isInline && !sticker.stackable && slot.stickers.includes(stickerId)) return false;
  pushStickerWithRoll(slot, stickerId, runState.slots);
  save();
  return true;
}

// Append a new slot mid-game. Used by Steal. Push-at-end preserves existing
// slotIdx pointers. Returns new index or null.
// Append a new slot mid-game. Used by Steal. Push-at-end preserves existing
// slotIdx pointers. Returns new index or null. Optional `meta` carries
// empowerRolls / subtypeRolls / permaBuffs / bonusTrigger / stapledTpls /
// charges from the stolen slot — without these, a stolen card with empower
// or subtype stickers would have its rolls forgotten and its stickers
// degrade or fizzle on the next cast.
function appendSlot(tplId, stickers, meta) {
  if (!runState || !runState.slots) return null;
  if (!CARDS[tplId]) return null;
  const newSlot = { tplId, stickers: (stickers || []).slice() };
  if (meta && typeof meta === 'object') {
    if (Array.isArray(meta.empowerRolls)) newSlot.empowerRolls = meta.empowerRolls.slice();
    if (Array.isArray(meta.subtypeRolls)) newSlot.subtypeRolls = meta.subtypeRolls.slice();
    if (Array.isArray(meta.permaBuffs))   newSlot.permaBuffs   = meta.permaBuffs.slice();
    if (Array.isArray(meta.stapledTpls))  newSlot.stapledTpls  = meta.stapledTpls.slice();
    if (meta.bonusTrigger)                newSlot.bonusTrigger = meta.bonusTrigger;
    if (typeof meta.charges === 'number') newSlot.charges = meta.charges;
    // §3.8: Balancer overrides (symmetricized/colorOverride/extraCost) are gone —
    // those cards now persist via stickers (cost_mod / set_color / stat_boost).
  }
  runState.slots.push(newSlot);
  save();
  return runState.slots.length - 1;
}

// Remove a slot by index. Used by Phylactery rip. CALLER CONTRACT: must
// decrement slotIdx for any in-game card whose slotIdx > removed index
// (see ENGINE.ripSlotForPhylactery for reference implementation).
function removeSlotByIdx(idx) {
  if (!runState || !runState.slots) return null;
  if (idx < 0 || idx >= runState.slots.length) return null;
  const removed = runState.slots.splice(idx, 1)[0];
  save();
  return removed;
}

return { start, startNextGame, recordResult, getStats, isActive,
         pickRewardCandidate, pickTransformReplacement, dismissReveal, getReward, getSlots,
         applySplice,
         applyStickerToSlot, appendSlot, removeSlotByIdx,
         // Map navigation API.
         getMapState, pickMapNode,
         getPostDraftOffer, pickPostDraftOffer,
         // save exposed so EFFECTS.apply_in_game_splice (mutating slot fields)
         // can persist. Internal RUN paths already save() inline.
         save,
         load, clearSave, hasSave, rollbackForMidGameRestore };
})();
