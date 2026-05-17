// PERSISTENCE — auto-saved to localStorage after state changes.
// SAVE_VERSION bumps on schema change; MIGRATIONS walks old saves forward.
// Hoisted out of the RUN IIFE so the test harness can exercise the
// migration helpers directly via the EXPOSED list in tests/_setup.js.
// save() and load() inside the IIFE still see these via outer-scope closure.
const SAVE_KEY = 'magiclike_run_v1';
const SAVE_VERSION = 2;

// tplId renames -- old tplId -> new tplId. Persists forever (we never know
// when a stale save will surface). Used by both the v1->v2 run-save
// migration AND the on-load PICKLOG translation (analytics has no
// migration framework, so picklog.js translates inline without a schema
// bump).
//
// v1.0.134.16 -- four cards had tplIds that didn't match their display
// names (legacy from earlier renames where the engine id wasn't updated).
// Per the rename, every save and picklog entry needs the new id to look
// up cards correctly.
const TPLID_RENAMES = {
  archmage: 'archmageOfVeils',
  fireImp:  'cinderSprite',
  zealot:   'holyZealot',
  merfolk:  'merfolkLooter',
};
function renameTplId(id) { return TPLID_RENAMES[id] || id; }

// keyed by from-version: (old) => newer
const MIGRATIONS = {
  1: (blob) => {
    // Walk every place a tplId persists and apply the rename map.
    // Run save shape (from save()):
    //   blob.runState.slots[].tplId
    //   blob.runState.slots[].stapledTpls[]
    //   blob.runState.pendingNeowModifier  (boon id; matches a card tplId)
    //   blob.runState.currentPack[]        (mid-draft tplIds)
    //   blob.runState.youPicks[]           (mid-draft pick history)
    //   blob.runState.oppDecks[]           (opp deck tplIds, when present)
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

// RUN — owns the drafted deck across games. Public API: start, startNextGame,
// recordResult, getStats, isActive.
const RUN = (function() {

let runState = null;

function save() {
  if (!runState) return;
  try {
    const blob = { version: SAVE_VERSION, runState };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch (e) {
    // localStorage can fail (quota, disabled, private mode) — best-effort.
    console.warn('Save failed:', e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    let blob = JSON.parse(raw);
    // Run migrations forward.
    while (blob.version < SAVE_VERSION) {
      const migrate = MIGRATIONS[blob.version];
      if (!migrate) {
        console.warn(`No migration from save v${blob.version}; discarding save.`);
        clearSave();
        return false;
      }
      blob = migrate(blob);
    }
    // Sanity check: shape we expect.
    if (!blob.runState || !blob.runState.slots || !Array.isArray(blob.runState.slots)) {
      console.warn('Save shape unrecognized; discarding.');
      clearSave();
      return false;
    }
    runState = blob.runState;
    // Defensive: strip sticker IDs that no longer exist (e.g., severityPlus1
    // from pre-v0.93 saves where it was rolled into the unified Empower).
    // Without this, applyStickersToCard silently ignores unknown IDs but
    // the IDs hang around in slot.stickers as dead data — confusing on the
    // sticker-summary UI.
    let stalePruned = 0;
    let rollsBackfilled = 0;
    let subtypeMigrated = 0;
    if (Array.isArray(runState.slots)) {
      for (const slot of runState.slots) {
        if (!Array.isArray(slot.stickers)) continue;
        // Migrate legacy fixed-subtype stickers ('subtype_goblin', etc) to
        // the unified 'subtype' sticker (v1.0.70). The legacy ID's subtype
        // is extracted and pushed onto slot.subtypeRolls so the granted type
        // is preserved across save/load. This runs once per stale slot;
        // after save, the slot is in the new format.
        if (!Array.isArray(slot.subtypeRolls)) slot.subtypeRolls = [];
        slot.stickers = slot.stickers.map(id => {
          if (typeof id === 'string' && id.startsWith('subtype_') && id !== 'subtype') {
            const sub = id.slice('subtype_'.length);
            const cap = sub.charAt(0).toUpperCase() + sub.slice(1);
            slot.subtypeRolls.push(cap);
            subtypeMigrated++;
            return 'subtype';
          }
          return id;
        });
        const before = slot.stickers.length;
        slot.stickers = slot.stickers.filter(id => STICKERS[id]);
        stalePruned += before - slot.stickers.length;
        // empowerRolls migration (added v0.99.80). Old saves don't have this
        // field. For each 'empower' sticker on the slot without a corresponding
        // recorded roll, generate one fresh against the current template. This
        // is non-deterministic (a player loading the same old save twice will
        // get different rolls), but only happens once: after the first load,
        // the rolls are persisted and become stable. New empowers always have
        // their rolls recorded at apply time.
        const empowerCount = slot.stickers.filter(id => id === 'empower').length;
        if (!Array.isArray(slot.empowerRolls)) slot.empowerRolls = [];
        while (slot.empowerRolls.length < empowerCount) {
          // Stapled-aware: roll against the synthesized merged template so
          // backfilled rolls can target the staple's effects too.
          const tpl = tplForSlot(slot);
          slot.empowerRolls.push(tpl ? rollEmpowerTarget(tpl) : null);
          rollsBackfilled++;
        }
        // If there are MORE rolls than empowers (shouldn't happen, but be
        // defensive), trim the extras.
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
    }
    // Defensive: if pendingReward isn't in a current valid shape, regenerate
    // it. Valid current shapes: 'mixed' (offer), 'transformPick' (mid-flow),
    // 'twoStickersReveal' (mid-flow). Older shapes ('pair'/'card'/'sticker')
    // get rerolled into a fresh offer. v1.0.47 removed 'splicePickBase' and
    // 'splicePickStaple' (splice is now pre-rolled, no two-phase modal); any
    // save left mid-splice-pick from older versions falls through this guard
    // and gets a fresh offer — that specific reward is forfeit but the run
    // continues.
    if (runState.pendingReward) {
      const ph = runState.pendingReward.phase;
      if (ph !== 'mixed' && ph !== 'transformPick' && ph !== 'twoStickersReveal') {
        runState.pendingReward = generateRewardOffer();
      }
    }
    // Map color backfill (added v1.0.100). Older saves stored map nodes
    // without a `color` field — every node renders neutral on the map UI
    // and opp-color affinity has no effect. Backfill colors retroactively
    // using the same probability and rules as generateMap, with the
    // root/exit constraint preserved. Non-root/non-exit nodes that already
    // had `color` set (possibly null) are left alone — the saved roll is
    // the source of truth.
    //
    // constructedId backfill (added v1.0.103). Same migration shape — older
    // saves don't have the field, and we just default to null (no
    // constructed deck for legacy nodes). This is conservative — we don't
    // retroactively assign constructed decks because that would change
    // mid-run difficulty in ways the player didn't sign up for.
    // Boss-type backfill (added v1.0.105). Older saves marked the exit
    // node as type:'combat' with no constructedId. Backfill: any exit
    // (highest-level) node missing type='boss' gets converted to a boss
    // node with a random boss deck assigned. This means existing in-
    // progress runs gain a boss fight at sector clear — a real difficulty
    // bump mid-run, but the alternative (silently keeping the trivial
    // combat exit) feels worse and the player can always concede.
    if (runState.map && Array.isArray(runState.map.nodes)) {
      const COLOR_KEYS = ['W','U','B','R','G'];
      const maxLevel = runState.map.nodes.reduce((m, n) => Math.max(m, n.level), 0);
      // Pre-compute boss pool once per load.
      const bossIds = (typeof DRAFT !== 'undefined' && DRAFT.getConstructedDeckIds)
        ? DRAFT.getConstructedDeckIds().filter(id => {
            const spec = DRAFT.getConstructedDeck(id);
            return spec && spec.isBoss;
          })
        : [];
      for (const n of runState.map.nodes) {
        if (!('constructedId' in n)) n.constructedId = null;
        // Backfill exit-as-boss for older maps that had type:'combat' here.
        const isExit = (n.level === maxLevel);
        if (isExit && n.type !== 'boss' && bossIds.length > 0) {
          n.type = 'boss';
          n.constructedId = bossIds[Math.floor(Math.random() * bossIds.length)];
        }
        if ('color' in n) continue;   // already migrated or freshly generated
        const isEnd = (n.level === 0 || n.level === maxLevel);
        if (isEnd) { n.color = null; continue; }
        n.color = Math.random() < 0.6
          ? COLOR_KEYS[Math.floor(Math.random() * 5)]
          : null;
      }
    }
    if (stalePruned > 0) save();
    return true;
  } catch (e) {
    console.warn('Load failed:', e);
    clearSave();
    return false;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function start(playerDeck, modifierId) {
  // Take the drafted deck and convert it to "slots": each slot is an object
  // {tplId, stickers} that persists across games. Picks AND lands are slots —
  // lands need to be slots so they can hold the 'innate' sticker. Cards
  // with template field `chargesAtRunStart` (Stapler) initialize their
  // charge counter on the slot here at run start.
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
        // Boon-added cards with template-defined charges (Stapler boon)
        // get their initial charge count here, mirroring the regular
        // draft-pick path above.
        const extraTpl = CARDS[e.tplId];
        if (extraTpl && typeof extraTpl.chargesAtRunStart === 'number') {
          slot.charges = (typeof e.charges === 'number') ? e.charges : extraTpl.chargesAtRunStart;
        }
        slots.push(slot);
      }
    }
  }
  runState = {
    slots,                       // run-persistent per-card stickering
    colors: playerDeck.colors,
    modifier: modifierId || null, // remember what Neow gave us, for stats/UI
    gameNum: 0,
    wins: 0,
    active: true,
    lastResult: null,
    lastPlayedSlotIdxs: [],
    lastClaimedKeywords: [],
    pendingReward: null,
    // Which sector we're in (1-indexed). Increments when a sector's
    // terminal node is cleared. Drives no behavior yet — reserved for
    // future difficulty scaling, node-type variation, or boss layers.
    sectorNum: 1,
    // Sector map. Generated at run start; navigation happens between games.
    // See generateMap for the graph shape. currentNodeId tracks where the
    // player is. pendingMapChoice is set when a win resolves and the next
    // step needs a player pick (multiple successors).
    map: generateMap(),
    pendingMapChoice: null,
    // Post-draft Innate offer — set in RUN.start to a non-null array of
    // basic-land tplIds the player drafted (deduplicated to ≤3 distinct
    // types). The controller shows a modal; player picks one type; we
    // apply the Innate sticker to the FIRST slot of that tplId. Cleared
    // after the pick (or on skip — currently no skip UI, but the field
    // can be nulled by future code). Single-shot: only fires once per run.
    pendingPostDraftOffer: null,
  };
  // Player starts at the root and immediately enters their first encounter
  // (root counts as the first node — first game is at runState.map.currentNodeId).
  runState.map.currentNodeId = runState.map.rootId;
  // Build the post-draft Innate offer: enumerate distinct basic land
  // tplIds in the player's slots. Cap at 3 distinct types — if the deck
  // is 4-5 color (rare), the 3 with the most copies are offered, so the
  // player still has a meaningful choice between their most-played
  // colors. If 0 basics (impossible in normal play, but defensive), the
  // offer just doesn't appear.
  const BASIC_TPL_IDS = new Set(['plains','island','swamp','mountain','forest']);
  const basicCounts = {};
  for (const slot of runState.slots) {
    if (BASIC_TPL_IDS.has(slot.tplId)) {
      basicCounts[slot.tplId] = (basicCounts[slot.tplId] || 0) + 1;
    }
  }
  const distinctBasics = Object.keys(basicCounts)
    .sort((a, b) => basicCounts[b] - basicCounts[a])   // most-played first
    .slice(0, 3);
  if (distinctBasics.length > 0) {
    runState.pendingPostDraftOffer = { kind: 'innate', basics: distinctBasics };
  }
  save();
}

// ─── Sector map generation ───────────────────────────────────────────────
// STS-style branching graph: DEPTH levels, WIDTH nodes per level, edges
// from each node to 1-2 nodes in the next level. Root at level 0 is a
// single node; terminal (sector exit) at level DEPTH-1 is also single.
// Middle levels are WIDTH wide. All nodes are 'combat' type for now;
// the type field is reserved so we can introduce elite/shop/etc. later
// without changing the schema.
const MAP_DEPTH = 5;
const MAP_WIDTH = 3;
function generateMap() {
  const nodes = [];
  const edges = [];
  const idForLevelCol = (level, col) => `n_${level}_${col}`;

  // Build nodes by level. Level 0 = single root. Level DEPTH-1 = single
  // exit. Levels in between have MAP_WIDTH nodes each. Each middle-level
  // node gets a color affinity (W/U/B/R/G) with ~60% probability; the
  // rest stay neutral (null color). Root and exit are always neutral —
  // the first encounter happens before strategic map planning, and the
  // exit is the climactic sector-end where a fixed "deck flavor" would
  // feel arbitrary.
  // Node roll: 15% constructed (curated deck), else the existing
  // colored/neutral roll. Root and exit are always neutral.
  const COLOR_KEYS = ['W','U','B','R','G'];
  const COLOR_PROB = 0.6;
  const CONSTRUCTED_PROB = 0.15;
  // Split constructed decks into "regular" (mid-sector pool) and "boss"
  // (sector-terminal pool). Boss decks are flagged via spec.isBoss and
  // should never appear at random mid-sector positions — they're the
  // climactic encounter, by design tied to the exit node.
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
        // Boss node — sector-terminal. Picks uniformly from the boss pool
        // (currently only Archdemon, but the structure supports more).
        type = 'boss';
        constructedId = bossConstructedIds[Math.floor(Math.random() * bossConstructedIds.length)];
      } else if (!isEnd) {
        const roll = Math.random();
        if (roll < CONSTRUCTED_PROB && regularConstructedIds.length > 0) {
          // Regular constructed deck. Pick uniformly from the non-boss
          // registry. The deck's own declared colors drive the visual
          // color ring — read it through DRAFT.getConstructedDeck at
          // render time so we don't store a stale color here if the
          // deck spec changes.
          constructedId = regularConstructedIds[Math.floor(Math.random() * regularConstructedIds.length)];
        } else if (roll < CONSTRUCTED_PROB + COLOR_PROB * (1 - CONSTRUCTED_PROB)) {
          // Colored — same ~60% effective rate among non-constructed nodes.
          color = COLOR_KEYS[Math.floor(Math.random() * 5)];
        }
        // Otherwise: neutral.
      }
      nodes.push({
        id: idForLevelCol(level, col),
        level,
        col,
        type,                 // 'combat' | 'boss' (future: elite, shop, event, rest)
        color,                // 'W'|'U'|'B'|'R'|'G' or null
        constructedId,        // string id into CONSTRUCTED_DECKS or null
        cols,
      });
    }
  }

  // Build edges. Each non-final node picks 1-2 successors from the next
  // level. Preference: connect to nearby columns to keep the graph
  // visually clean and avoid long diagonals.
  for (let level = 0; level < MAP_DEPTH - 1; level++) {
    const nextLevel = level + 1;
    const isCurEnd = (level === 0 || level === MAP_DEPTH - 1);
    const isNextEnd = (nextLevel === 0 || nextLevel === MAP_DEPTH - 1);
    const curCols = isCurEnd ? 1 : MAP_WIDTH;
    const nextCols = isNextEnd ? 1 : MAP_WIDTH;
    for (let col = 0; col < curCols; col++) {
      const fromId = idForLevelCol(level, col);
      // Map our column to an approximate position in the next level.
      // (col + 0.5) / curCols gives a value in (0, 1); scale to next.
      const ratio = (col + 0.5) / curCols;
      const targetCol = Math.floor(ratio * nextCols);
      const candidates = new Set();
      candidates.add(targetCol);
      // Optional second edge: 50% chance of branching to an adjacent col.
      // Last-level (next is the single exit) always has only one option,
      // so this is a no-op there.
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

  // Guarantee reachability for every non-root node: any node with no
  // incoming edge gets one from the nearest in-prev-level node. This
  // also catches edge-density flukes from the random branching above.
  for (let level = 1; level < MAP_DEPTH; level++) {
    const isEnd = (level === 0 || level === MAP_DEPTH - 1);
    const cols = isEnd ? 1 : MAP_WIDTH;
    for (let col = 0; col < cols; col++) {
      const id = idForLevelCol(level, col);
      if (edges.some(e => e.to === id)) continue;
      // Pick the nearest prev-level column.
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
    currentNodeId: null,    // set after RUN.start
    visitedNodeIds: [],
  };
}

// Successors of the current node — used to know whether navigation
// is automatic (1 successor) or requires a player choice (≥2 successors).
function getMapSuccessors(nodeId) {
  if (!runState || !runState.map) return [];
  return runState.map.edges
    .filter(e => e.from === nodeId)
    .map(e => e.to);
}

function startNextGame() {
  if (!runState || !runState.active) return null;
  // Advance the map BEFORE the game begins (except for game 1, where the
  // root is already set in RUN.start). Two cases:
  //   - Multi-successor: pickMapNode already advanced currentNodeId to
  //     the chosen new node. visitedNodeIds does NOT include it. We must
  //     NOT advance again — the game proceeds at currentNodeId.
  //   - Single-successor: recordResult marked the completed node as
  //     visited but didn't advance. currentNodeId is still the just-
  //     completed (visited) node. We auto-advance via succ[0].
  // Signal: is currentNodeId in visitedNodeIds? If yes → still on the
  // completed node, auto-advance. If no → already on the new node, do
  // nothing. (Game 1 special-case: gameNum===0, neither branch fires.)
  if (runState.gameNum > 0 && runState.map && runState.map.currentNodeId) {
    const cur = runState.map.currentNodeId;
    const completedVisited = runState.map.visitedNodeIds.includes(cur);
    if (completedVisited) {
      const succ = getMapSuccessors(cur);
      if (succ.length === 1) {
        runState.map.currentNodeId = succ[0];
      } else if (succ.length >= 2) {
        // Shouldn't reach here — recordResult sets pendingMapChoice and
        // the controller routes through pickMapNode first. Defensive:
        // fall through, log a warning, let the game proceed.
        console.warn('startNextGame: pending map choice not resolved; using current node');
      }
      // 0 successors: sector complete; this code path shouldn't fire
      // because recordResult handles sector-clear by regenerating the
      // map and resetting currentNodeId to the new root.
    }
    // !completedVisited: pickMapNode already advanced — leave alone.
  }
  runState.gameNum++;
  runState.lastResult = null;
  runState.pendingReward = null;
  // Snapshot slots before the game starts. Any mid-game mutations (stickers
  // applied via Endomorph/Archdemon-bargain/Scarification, Stapler splices,
  // slot rips from Vile Edict, charge decrements, etc.) live on runState
  // and are saved to localStorage. Without a snapshot, if the player
  // crashes mid-game and reloads, those mutations stick — they keep the
  // boons they gained without finishing the encounter.
  //
  // The snapshot is restored by rollbackForMidGameRestore (load path,
  // mid-game crash). It's cleared by recordResult (clean completion —
  // win OR loss — both mean the mutations are "earned" and stay).
  //
  // Deep clone: slot objects contain arrays (stickers, empowerRolls,
  // stapledTpls, subtypeRolls, permaBuffs) that must be copied so later
  // mutations don't bleed through the snapshot. JSON round-trip is the
  // simplest deep-clone; slot data is plain JSON (no Set/Map/Date).
  runState.midGameSlotsSnapshot = JSON.parse(JSON.stringify(runState.slots));
  const numStickers = Math.max(0, runState.gameNum - 1);
  const numStaples = Math.max(0, Math.floor((runState.gameNum - 1) / 3));
  const numClones = Math.max(0, Math.floor((runState.gameNum - 1) / 5));
  // Pass the current node's color affinity and constructed deck ID to the
  // drafter. constructedId takes precedence — when set, the drafter skips
  // the draft loop entirely and uses the curated card list. colorAffinity
  // forces the opp's first pack to be all that color (biasing the drafter).
  const curNode = runState.map && runState.map.nodes
    ? runState.map.nodes.find(n => n.id === runState.map.currentNodeId)
    : null;
  const colorAffinity = curNode ? curNode.color : null;
  const constructedId = curNode ? curNode.constructedId : null;
  const opp = DRAFT.buildOpponentDeck(numStickers, numStaples, numClones, colorAffinity, constructedId);
  ENGINE.init(runState.slots, opp.cards);
  save();
  PICKLOG.recordGamePlayed();
  // Boss-node detection: surface the boss name + icon so the controller
  // can show a "You face [boss name]" intro banner. Non-boss nodes return
  // bossName: null so the controller knows there's nothing to show.
  let bossName = null;
  let bossIcon = null;
  if (curNode && curNode.type === 'boss' && constructedId) {
    const spec = getConstructedDeck(constructedId);
    if (spec && spec.name) bossName = spec.name;
    if (spec && spec.icon) bossIcon = spec.icon;
  }
  return { gameNum: runState.gameNum, oppColors: opp.colors, bossName, bossIcon };
}

// Commit a player choice of next map node. Used when the just-cleared
// node had ≥2 successors (a fork in the path). Validates that the chosen
// node is a legal successor of the current node, then advances and clears
// the pending choice flag. After this returns, the controller calls
// startNextGame to begin combat at the new node.
function pickMapNode(nodeId) {
  if (!runState || !runState.pendingMapChoice) return false;
  if (!runState.pendingMapChoice.options.includes(nodeId)) return false;
  runState.map.currentNodeId = nodeId;
  runState.pendingMapChoice = null;
  save();
  return true;
}

// Post-draft Innate offer: player picks ONE basic land type from the
// distinct basics they drafted. We apply the Innate sticker to the first
// slot of that tplId. Returns true on success, false if no offer is open
// or the pick is invalid (unknown tplId / not in the offer's basics list).
// Caller (controller UI) hides the modal on success and proceeds to
// game 1.
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

// Read-only accessor for the controller UI.
function getPostDraftOffer() {
  return (runState && runState.pendingPostDraftOffer) ? runState.pendingPostDraftOffer : null;
}

// Read-only access for the UI.
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
  // Clear the mid-game slots snapshot. The game completed (win OR loss),
  // so any mid-game mutations to runState.slots are now "earned" and
  // should persist. The snapshot only matters for crash-restore.
  runState.midGameSlotsSnapshot = null;
  // Snapshot the player's played-slots set (passed in from the controller
  // at game-end, sourced from G.you.playedSlotIdxs). Stored as a sorted
  // array — Sets don't survive JSON round-trips. The reward filter reads
  // this back as a Set on demand. Reset to empty array each game so a
  // late-game scoreless display doesn't leak prior-game data.
  runState.lastPlayedSlotIdxs = Array.isArray(playedSlotIdxs)
    ? playedSlotIdxs.slice()
    : (playedSlotIdxs instanceof Set ? [...playedSlotIdxs] : []);
  // Snapshot the keywords claimed by killing/exiling opp's creatures this
  // game. Same Set→array transform as playedSlotIdxs, same rationale (JSON
  // doesn't carry Set type). Consumed by stickersFor to restrict keyword
  // sticker offers to keywords the player actually fought against. Empty
  // array means "no keyword stickers offered" — which is the design intent
  // for a player who killed nothing keyword-bearing.
  runState.lastClaimedKeywords = Array.isArray(claimedKeywords)
    ? claimedKeywords.slice()
    : (claimedKeywords instanceof Set ? [...claimedKeywords] : []);
  if (winner === 'you') {
    runState.wins++;
    runState.lastResult = 'won';
    // Open reward flow — pick from 3 mixed-type reward options
    // (sticker pair, transform, or rip up).
    runState.pendingReward = generateRewardOffer();
    // Map advance: mark the just-cleared node as visited and queue up
    // the next-node decision. The controller picks this up AFTER the
    // reward modal is resolved. If there's only one successor, auto-
    // advance: pendingMapChoice stays null, startNextGame handles the
    // single-option case. If there are 0 successors, the sector is
    // complete — for now, that ends the run (no boss layer yet).
    if (runState.map && runState.map.currentNodeId) {
      const cur = runState.map.currentNodeId;
      if (!runState.map.visitedNodeIds.includes(cur)) {
        runState.map.visitedNodeIds.push(cur);
      }
      const successors = getMapSuccessors(cur);
      if (successors.length === 0) {
        // Sector complete → generate the next sector. The drafted deck and
        // all run-state (slots, stickers, wins, modifier, gameNum) carry
        // forward; only the map graph resets. Opp scaling continues via
        // the same gameNum-based formulas in startNextGame.
        runState.sectorNum = (runState.sectorNum || 1) + 1;
        runState.map = generateMap();
        runState.map.currentNodeId = runState.map.rootId;
        runState.pendingMapChoice = null;
        // No special "sector cleared" beat — the player will see the new
        // map's first fork (or auto-advance into combat at the new root).
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

// Build a single reward candidate of the given type. Returns null if the
// type can't be materialized (caller falls back to another type).
function rollOneCandidate(type, alreadyOffered) {
  if (type === 'sticker') {
    const allIdx = runState.slots.map((_, i) => i);
    const eligibleSlots = filterByPlayed(allIdx.filter(i => stickersFor(i).length > 0));
    if (eligibleSlots.length === 0) return null;
    // Try a handful of times to find a non-duplicate (slot, sticker) pair.
    for (let tries = 0; tries < 30; tries++) {
      const slotIdx = eligibleSlots[Math.floor(Math.random() * eligibleSlots.length)];
      const stickerOpts = stickersFor(slotIdx);
      if (stickerOpts.length === 0) continue;
      const sticker = weightedPick(stickerOpts);
      const dupKey = `sticker:${slotIdx}:${sticker.id}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      const cand = { kind: 'sticker', slotIdx, stickerId: sticker.id };
      // Pre-roll Empower's target at offer time so the player can see exactly
      // which field (and which mode for charms) gets bumped before they pick.
      // The roll is committed if the player picks this candidate; if they
      // pick something else, the roll is discarded.
      if (sticker.id === 'empower') {
        // Stapled-aware: pre-roll against the merged template so the offer
        // preview matches what'll actually be applied on pick.
        const tpl = tplForSlot(runState.slots[slotIdx]);
        cand.empowerRoll = tpl ? rollEmpowerTarget(tpl) : null;
      }
      // Pre-roll subtype at offer time so the player sees exactly which
      // subtype they'd grant. Weighted by deck contents; excludes subtypes
      // already on the target. If the roll fizzles (deck has no other
      // creature subtypes), drop this candidate and retry — the player
      // shouldn't be offered an inert sticker.
      if (sticker.id === 'subtype') {
        cand.subtypeRoll = rollSubtypeFromDeck(runState.slots, slotIdx);
        if (!cand.subtypeRoll) {
          alreadyOffered.delete(dupKey);  // free the slot for retry on a different sticker
          continue;
        }
      }
      return cand;
    }
    return null;
  }
  if (type === 'transform') {
    // Any slot is eligible — including lands. The replacement pack comes
    // from the standard non-land draft pool, so transforming a Forest into
    // a creature is a way to mess with your manabase deliberately.
    const eligibleSlots = runState.slots.map((_, i) => i);
    if (eligibleSlots.length === 0) return null;
    // Pre-roll the replacement pack so it's stable across renders / saves.
    // Color bias is computed from colored cards in the deck (rollPack
    // ignores lands' color since they're null anyway).
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
    // Any slot is eligible — including lands. No floor: skill issue if you
    // rip yourself into a deck that can't function.
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
    // Splice needs at least two eligible cards in the deck. The shared
    // canonicalSplicePair helper decides which is base and which is staple
    // by type priority (Creature > Artifact > Land > Spell), so the
    // enumeration here treats pairs as UNORDERED: iterate i<j to avoid
    // both (a,b) and (b,a). For each unordered pair, canonicalize and
    // check compatibility on the canonical form. v1.0.56: previously
    // iterated all ordered pairs and rejected the "wrong" order via
    // isCompatibleStaplePair's forbid rules; now those rules are gone
    // and canonicalization handles ordering.
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
    // Any slot is eligible — including lands. The clone gets a fresh empty
    // sticker list (stickers don't carry), consistent with transform.
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
    // Slot must have at least one legal sticker (we'll attempt to apply two,
    // but if only one is legal that's fine — we just apply that one).
    const allIdx = runState.slots.map((_, i) => i);
    const eligibleSlots = filterByPlayed(allIdx.filter(i => stickersFor(i).length > 0));
    if (eligibleSlots.length === 0) return null;
    for (let tries = 0; tries < 30; tries++) {
      const slotIdx = eligibleSlots[Math.floor(Math.random() * eligibleSlots.length)];
      const dupKey = `twoStickers:${slotIdx}`;
      if (alreadyOffered.has(dupKey)) continue;
      alreadyOffered.add(dupKey);
      // No pre-rolled stickers — they're rolled at pick time so the player
      // experiences the random outcome on click.
      return { kind: 'twoStickers', slotIdx };
    }
    return null;
  }
  if (type === 'threeStickersBlind') {
    // "Mystery card" reward — the slot identity is hidden at offer time and
    // only revealed when the player picks. Restricted to creature slots
    // because (a) creatures take the widest range of stickers (stat boosts,
    // keywords, innate, empower), making three stickers reliably impactful;
    // (b) a stack of three stickers feels emotionally right on a creature
    // (your "blessed creature" of the run); (c) random stickers landing on
    // a Forest is the worst possible outcome for player satisfaction.
    //
    // Candidate carries NO slotIdx — by design. Slot is rolled at apply
    // time, with eligibility re-checked then. Dedup by candidate kind
    // alone, so at most one mystery-card tile shows per offer.
    if (alreadyOffered.has('threeStickersBlind')) return null;
    const eligibleSlots = runState.slots
      .map((s, i) => ({s, i}))
      .filter(({s, i}) => {
        const tpl = CARDS[s.tplId];
        if (!tpl || tpl.type !== 'Creature') return false;
        return stickersFor(i).length > 0;
      });
    // Apply played-this-game restriction. The offer is gated by intersection;
    // if no played creatures are sticker-eligible, the offer is dropped.
    // The pick-time path (in pickRewardCandidate) does the same restriction
    // when actually rolling the slot.
    const playedEligible = filterByPlayed(eligibleSlots.map(e => e.i));
    if (playedEligible.length === 0) return null;
    alreadyOffered.add('threeStickersBlind');
    return { kind: 'threeStickersBlind' };
  }
  return null;
}

// Generate up to 3 reward candidates of mixed types, weighted by
// REWARD_TYPE_WEIGHTS. Each candidate rolls independently; a single offer
// can be all of one type or any mix. Falls back gracefully when a rolled
// type can't be fulfilled (no legal slots, etc.).
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

// Filter a list of slot indexes to only those the player played in the
// most recent game. Sticker-style rewards consume this to direct stickers
// at cards that actually saw use, rather than letting players pile
// stickers on cards they never play. Fallback: when the played-set is
// empty (game just ended with no plays — rare but possible, e.g.,
// immediate concede), return the unrestricted list. Without this fallback
// the reward generator would silently drop all sticker offers, leaving
// the player with reward-less wins.
function filterByPlayed(slotIdxs) {
  const played = runState && runState.lastPlayedSlotIdxs;
  if (!Array.isArray(played) || played.length === 0) return slotIdxs;
  const playedSet = new Set(played);
  const filtered = slotIdxs.filter(i => playedSet.has(i));
  // Defensive fallback: if the intersection is empty (e.g., every played
  // slot was already maxed on stickers), allow unrestricted. Better to
  // offer a sticker for an unplayed card than to drop the offer entirely.
  return filtered.length > 0 ? filtered : slotIdxs;
}

// Stickers applicable to slot index `i`. Wraps stickersForSlot and adds
// the keyword-claim gate — player can only be offered keyword stickers
// they claimed by killing/exiling opp creatures last game. Opp-AI bypasses
// this gate.
function stickersFor(slotIdx) {
  const slot = runState && runState.slots && runState.slots[slotIdx];
  if (!slot) return [];
  const base = stickersForSlot(slot, deckColors());
  // Defensive: missing lastClaimedKeywords (legacy save) → allow all.
  const claimed = runState && runState.lastClaimedKeywords;
  if (claimed === undefined || !Array.isArray(claimed)) return base;
  return base.filter(s => s.kind !== 'keyword' || claimed.includes(s.keyword));
}

// Colors {W,U,B,R,G} the player's deck plays. Gates land-color stickers.
function deckColors() {
  if (!runState) return [];
  return deckColorsFromSlots(runState.slots);
}

// Pick one of the 3 mixed-offer candidates. For sticker/ripUp this commits
// immediately. For transform, we transition the pendingReward into a
// 'transformPick' phase and the UI re-renders showing the replacement pack.
function pickRewardCandidate(idx) {
  if (!runState || !runState.pendingReward) return;
  if (runState.pendingReward.phase !== 'mixed') return;
  const cand = runState.pendingReward.candidates[idx];
  if (!cand) return;
  if (cand.kind === 'sticker') {
    const slot = runState.slots[cand.slotIdx];
    slot.stickers.push(cand.stickerId);
    // If this candidate carried a pre-rolled empower target (set at offer
    // time so the player could see what would be empowered), consume it.
    // Otherwise roll fresh — covers any unmigrated reward shapes.
    if (cand.stickerId === 'empower') {
      // Fallback if the offer didn't pre-roll. Stapled-aware roll.
      const fallbackTpl = tplForSlot(slot);
      const roll = cand.empowerRoll || (fallbackTpl ? rollEmpowerTarget(fallbackTpl) : null);
      if (!Array.isArray(slot.empowerRolls)) slot.empowerRolls = [];
      slot.empowerRolls.push(roll);
    }
    // Subtype: consume cand.subtypeRoll (set at offer time so the player saw
    // exactly which subtype they'd grant). Fallback to a fresh roll only if
    // the candidate carried none (shouldn't happen post-v1.0.70 — offer roll
    // is the only path that creates 'subtype' candidates).
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
    // Pre-rolled pack carries forward so options stay stable across save/load.
    runState.pendingReward = {
      phase: 'transformPick',
      slotIdx: cand.slotIdx,
      replacementPack: cand.replacementPack.slice(),
    };
    save();
    return;
  }
  if (cand.kind === 'splice') {
    // Splice applies the pre-rolled pair directly (v1.0.47+ — was a two-phase
    // pickBase/pickStaple modal flow). The candidate carries baseSlotIdx and
    // stapleSlotIdx, both validated at offer time. Re-check at apply time
    // via applySplice's defensive guards (the deck can't change between
    // offer and pick within a session, but this is robust to save/load).
    const ok = applySplice(cand.baseSlotIdx, cand.stapleSlotIdx);
    if (!ok) {
      // Pair invalidated (shouldn't happen — defensive). Clear and let the
      // player re-roll the reward by advancing without applying anything.
      runState.pendingReward = null;
      save();
    }
    return;
  }
  if (cand.kind === 'clone') {
    // Duplicate the slot as a literal photocopy — every piece of run-persistent
    // slot state (stickers, staples, empower rolls, permaBuffs, bonusTrigger)
    // carries onto the clone. The reward fantasy is "I want another of THIS
    // card," meaning the merged/buffed/rolled version, not the base concept.
    // Without this, cloning a stapled slot would silently drop the staple half
    // — a real downgrade compared to what the player thought they were
    // duplicating. Insert right after the original so the deck stays grouped.
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
    // stapledTpls: shallow array copy is fine — entries are tplId strings.
    if (Array.isArray(orig.stapledTpls) && orig.stapledTpls.length > 0) {
      clone.stapledTpls = orig.stapledTpls.slice();
    }
    // empowerRolls: array of {location, subIdx, effIdx, modeIdx, field}
    // descriptors. Deep-copy each so future mutations on either slot don't
    // bleed across.
    if (Array.isArray(orig.empowerRolls) && orig.empowerRolls.length > 0) {
      clone.empowerRolls = orig.empowerRolls.map(r => ({...r}));
    }
    if (Array.isArray(orig.subtypeRolls) && orig.subtypeRolls.length > 0) {
      clone.subtypeRolls = orig.subtypeRolls.slice();
    }
    // permaBuffs: defensive copy. Today only Elystra has permaBuffs and she's
    // `special` (uncloneable), but if a future card combines permanentEot
    // with cloneable, dropping these would silently zero the buffs.
    if (Array.isArray(orig.permaBuffs) && orig.permaBuffs.length > 0) {
      clone.permaBuffs = orig.permaBuffs.map(b => ({...b}));
    }
    // bonusTrigger: defensive copy. Today only Codex sets this and Codex is
    // `special`. Same future-proofing rationale.
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
    // Roll up to two stickers, re-evaluating eligibility between picks
    // (a non-stackable just-applied sticker is no longer legal).
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
    // Reveal phase: player clicks Continue to clear.
    runState.pendingReward = {
      phase: 'twoStickersReveal',
      slotIdx,
      appliedStickerIds: applied,
    };
    save();
    return;
  }
  if (cand.kind === 'threeStickersBlind') {
    // Roll which creature slot gets the stickers. Re-check eligibility now
    // (the offer-time check could be stale if the deck changed between
    // generating the offer and picking — defensive). Then apply up to 3
    // stickers, same per-iteration eligibility re-check as twoStickers.
    const eligibleSlots = runState.slots
      .map((s, i) => ({s, i}))
      .filter(({s, i}) => {
        const tpl = CARDS[s.tplId];
        if (!tpl || tpl.type !== 'Creature') return false;
        return stickersFor(i).length > 0;
      });
    // Played-this-game restriction at pick time. Mirrors the offer-gen
    // gate. Fallback to unrestricted set is built into filterByPlayed —
    // when nothing was played, all eligible slots are allowed.
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
  // Merge stickers and empowerRolls from the staple into the base. Stickers
  // are slot-scoped (costMinus1, kw_*, statBoost, innate) and apply to the
  // merged slot the same way they applied to the original slot — they don't
  // care which effect within the merged template they live on. Append the
  // arrays. Empower rolls need remap because they reference effect indices
  // that shift when effects concatenate (spell base) OR when effects move
  // into a new ETB trigger (creature base).
  const baseTpl = CARDS[baseSlot.tplId];
  const baseEffectCount = countEffects(baseTpl);
  const baseTriggerCount = (baseTpl.triggers || []).length;
  const baseAbilityCount = (baseTpl.abilities || []).length;
  const baseIsCreature = baseTpl.type === 'Creature';
  const stapleIsCreature = stapleSlot && CARDS[stapleSlot.tplId] && CARDS[stapleSlot.tplId].type === 'Creature';
  if (!Array.isArray(baseSlot.stapledTpls)) baseSlot.stapledTpls = [];
  // Compute the merged template's effect/trigger/ability counts BEFORE this
  // staple is added, so the remap accounts for any prior staples too. The
  // shift depends on the merge case for each prior staple:
  //   - Creature+Creature: prior staple's triggers, abilities concat into
  //     the merged arrays. Effects don't matter (creatures have none).
  //   - Creature base + Spell staple: prior staple becomes one new ETB
  //     trigger (so triggers += 1), no effect/ability shift.
  //   - Spell base + Spell staple: prior staple's effects concat (effects
  //     += staple's effect count), no trigger/ability shift.
  const priorStaples = baseSlot.stapledTpls.slice();
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
  // Now finalize: append the staple to the base.
  baseSlot.stapledTpls.push(stapleSlot.tplId);
  // Remap and append the staple's stickers and empower rolls.
  const stapleStickers = (stapleSlot.stickers || []).slice();
  const stapleRolls = (stapleSlot.empowerRolls || []).slice();
  const remappedRolls = stapleRolls.map(roll =>
    remapEmpowerRollForStaple(roll, baseIsCreature, stapleIsCreature,
                              priorMergedEffectCount, priorMergedTriggerCount, priorMergedAbilityCount));
  if (!Array.isArray(baseSlot.stickers)) baseSlot.stickers = [];
  if (!Array.isArray(baseSlot.empowerRolls)) baseSlot.empowerRolls = [];
  baseSlot.stickers = baseSlot.stickers.concat(stapleStickers);
  baseSlot.empowerRolls = baseSlot.empowerRolls.concat(remappedRolls);
  // permaBuffs: defensive merge. Today no spliceable card has permanentEot
  // (Elystra is the only permanentEot card and is `special` so she can't
  // splice). But if a future card combines the two, dropping the staple's
  // permaBuffs would silently zero out accumulated run-persistent buffs.
  const stapleBuffs = stapleSlot.permaBuffs;
  if (Array.isArray(stapleBuffs) && stapleBuffs.length > 0) {
    if (!Array.isArray(baseSlot.permaBuffs)) baseSlot.permaBuffs = [];
    baseSlot.permaBuffs = baseSlot.permaBuffs.concat(stapleBuffs);
  }
  // bonusTrigger: today only Codex sets this (special card, can't splice),
  // so this branch is dead in v1. Defensive: if the staple has one and the
  // base doesn't, inherit it.
  if (stapleSlot.bonusTrigger && !baseSlot.bonusTrigger) {
    baseSlot.bonusTrigger = stapleSlot.bonusTrigger;
  }
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
  const sticker = STICKERS[stickerId];
  if (!sticker) return false;
  if (!sticker.stackable && slot.stickers.includes(stickerId)) return false;
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
    // Balancer-boss overrides: numeric/string fields, copy directly.
    if (typeof meta.symmetricized === 'number') newSlot.symmetricized = meta.symmetricized;
    if (typeof meta.colorOverride === 'string') newSlot.colorOverride = meta.colorOverride;
    if (typeof meta.extraCost === 'number')     newSlot.extraCost     = meta.extraCost;
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
         // save exposed so EFFECTS.applyInGameSplice (mutating slot fields)
         // can persist. Internal RUN paths already save() inline.
         save,
         load, clearSave, hasSave, rollbackForMidGameRestore };
})();
