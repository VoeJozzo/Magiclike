// =========================================================================
// PICKLOG — captures draft pick decisions for later analysis.
// Storage (localStorage 'magiclike_picklog_v1'):
//   { schemaVersion, drafts: [{timestamp, colors, picks: [{picked, offered}],
//     result, gamesPlayed}] }
// Pairs matrix (pairs[X][Y].wins = times X was picked over Y) is derived on
// demand, never stored — re-derive when the formula changes.
// =========================================================================
const PICKLOG = (function() {

const STORAGE_KEY = 'magiclike_picklog_v1';
const SCHEMA_VERSION = 1;

let data = null;
let currentDraft = null;

function ensureLoaded() {
  if (data !== null) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      data = { schemaVersion: SCHEMA_VERSION, drafts: [] };
      return;
    }
    const blob = JSON.parse(raw);
    if (!blob || blob.schemaVersion !== SCHEMA_VERSION || !Array.isArray(blob.drafts)) {
      console.warn('Picklog data malformed; resetting.');
      data = { schemaVersion: SCHEMA_VERSION, drafts: [] };
      return;
    }
    // Apply tplId renames inline (no schema bump -- analytics has no
    // migration framework, and bumping schemaVersion would wipe history).
    // renameTplId is defined at module scope by run.js (loaded before
    // picklog.js — see magiclike_engine.html script order); a future
    // reorder of the script list would break this call. It's a no-op
    // for ids not in the rename map, so it's safe to run every load.
    for (const draft of blob.drafts) {
      if (!Array.isArray(draft.picks)) continue;
      for (const pick of draft.picks) {
        if (pick.picked) pick.picked = renameTplId(pick.picked);
        if (Array.isArray(pick.offered)) pick.offered = pick.offered.map(renameTplId);
      }
    }
    data = blob;
  } catch (e) {
    console.warn('Picklog load failed; resetting:', e);
    data = { schemaVersion: SCHEMA_VERSION, drafts: [] };
  }
}

function persist() {
  if (!data) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Picklog save failed:', e);
  }
}

// Begin a new draft entry. Called when the player starts drafting.
function startDraft() {
  ensureLoaded();
  currentDraft = {
    timestamp: Date.now(),
    colors: null,
    picks: [],
    result: null,
    gamesPlayed: 0,
  };
}

// Record one pick. `offered` is the array of tplIds the player chose between.
// `picked` is the chosen tplId. Both are required.
function logPick(picked, offered) {
  if (!currentDraft) {
    // Lazy: if startDraft wasn't called (older code path / save resume),
    // create a draft entry on the fly.
    startDraft();
  }
  currentDraft.picks.push({ picked, offered: offered.slice() });
}

// Mark the draft complete with the resulting deck colors. Persists.
function finishDraft(colors) {
  if (!currentDraft) return;
  currentDraft.colors = colors ? colors.slice() : null;
  ensureLoaded();
  data.drafts.push(currentDraft);
  currentDraft = null;
  persist();
}

// Bump games-played counter for the most recent draft.
function recordGamePlayed() {
  ensureLoaded();
  if (!data.drafts.length) return;
  data.drafts[data.drafts.length - 1].gamesPlayed++;
  persist();
}

// Set final run result on the most recent draft. 'won' = full run win (we
// don't have a victory condition yet, so realistically only 'lost' is set).
function recordRunResult(result) {
  ensureLoaded();
  if (!data.drafts.length) return;
  data.drafts[data.drafts.length - 1].result = result;
  persist();
}

// Build the pairs matrix from raw drafts on demand.
//
// For each pick: picked > each unpicked. Increment pairs[picked][loser].wins.
function getPairsMatrix() {
  ensureLoaded();
  const pairs = {};
  for (const draft of data.drafts) {
    for (const pick of draft.picks) {
      const winner = pick.picked;
      for (const card of pick.offered) {
        if (card === winner) continue;
        if (!pairs[winner]) pairs[winner] = {};
        if (!pairs[winner][card]) pairs[winner][card] = { wins: 0 };
        pairs[winner][card].wins++;
      }
    }
  }
  return pairs;
}

// Compute per-card stats from the pairs matrix:
//   { tplId: { picks, offers, pickRate, winRate } }
//   - picks: total times this card was picked
//   - offers: total times it was offered (picked or not)
//   - pickRate: picks / offers
//   - winRate: micro-averaged across all pairs (sum of wins / total head-to-head)
function getCardStats() {
  const pairs = getPairsMatrix();
  const stats = {};
  ensureLoaded();
  // Walk all picks to compute "offers" — every time a card appeared in a pack.
  for (const draft of data.drafts) {
    for (const pick of draft.picks) {
      for (const card of pick.offered) {
        if (!stats[card]) stats[card] = { picks: 0, offers: 0 };
        stats[card].offers++;
        if (card === pick.picked) stats[card].picks++;
      }
    }
  }
  // Compute win rate from pairs matrix.
  for (const card of Object.keys(stats)) {
    let wins = 0, total = 0;
    const wonAgainst = pairs[card] || {};
    for (const opp of Object.keys(wonAgainst)) {
      const w = wonAgainst[opp].wins;
      const l = (pairs[opp] && pairs[opp][card]) ? pairs[opp][card].wins : 0;
      wins += w;
      total += w + l;
    }
    stats[card].winRate = total > 0 ? wins / total : null;
    stats[card].pickRate = stats[card].offers > 0 ? stats[card].picks / stats[card].offers : null;
  }
  return stats;
}

// Console-friendly dump. Sorts by win rate, shows the top and bottom cards.
function summarize(n) {
  const N = n || 20;
  const stats = getCardStats();
  const rows = Object.entries(stats)
    .filter(([, s]) => s.offers >= 3)   // need a few observations to be meaningful
    .map(([id, s]) => ({
      id,
      name: (CARDS[id] && CARDS[id].name) || id,
      picks: s.picks,
      offers: s.offers,
      pickRate: s.pickRate,
      winRate: s.winRate,
    }))
    .sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
  ensureLoaded();
  console.log(`%c=== Picklog summary — ${data.drafts.length} drafts ===`, 'color:#ffd700;font-weight:bold');
  console.log(`Top ${N} by win rate:`);
  console.table(rows.slice(0, N));
  console.log(`Bottom ${N} by win rate:`);
  console.table(rows.slice(-N).reverse());
  return rows;
}

// Wipe everything. Useful for testing / fresh starts.
function clearAll() {
  data = { schemaVersion: SCHEMA_VERSION, drafts: [] };
  currentDraft = null;
  persist();
}

// Raw access for export / debugging.
function exportData() {
  ensureLoaded();
  return JSON.parse(JSON.stringify(data));
}

return {
  startDraft, logPick, finishDraft,
  recordGamePlayed, recordRunResult,
  getPairsMatrix, getCardStats, summarize,
  clearAll, exportData,
};
})();
