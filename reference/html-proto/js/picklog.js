// PICKLOG — draft-pick analytics. localStorage 'magiclike_picklog_v1'.
// Storage: { schemaVersion, drafts: [{timestamp, colors, picks: [{picked, offered}], result, gamesPlayed}] }
// Pairs matrix derived on demand (never stored).
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
    // tplId renames inline — no schema bump (would wipe history).
    // renameTplId from run.js (must load before picklog.js — see script order).
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

function logPick(picked, offered) {
  if (!currentDraft) startDraft();
  currentDraft.picks.push({ picked, offered: offered.slice() });
}

function finishDraft(colors) {
  if (!currentDraft) return;
  currentDraft.colors = colors ? colors.slice() : null;
  ensureLoaded();
  data.drafts.push(currentDraft);
  currentDraft = null;
  persist();
}

function recordGamePlayed() {
  ensureLoaded();
  if (!data.drafts.length) return;
  data.drafts[data.drafts.length - 1].gamesPlayed++;
  persist();
}

function recordRunResult(result) {
  ensureLoaded();
  if (!data.drafts.length) return;
  data.drafts[data.drafts.length - 1].result = result;
  persist();
}

// pairs[winner][loser].wins for every (picked, unpicked) pair.
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

// Per-card: { picks, offers, pickRate, winRate } — winRate micro-averaged across pairs.
function getCardStats() {
  const pairs = getPairsMatrix();
  const stats = {};
  ensureLoaded();
  for (const draft of data.drafts) {
    for (const pick of draft.picks) {
      for (const card of pick.offered) {
        if (!stats[card]) stats[card] = { picks: 0, offers: 0 };
        stats[card].offers++;
        if (card === pick.picked) stats[card].picks++;
      }
    }
  }
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

// Console dump sorted by win rate.
function summarize(n) {
  const N = n || 20;
  const stats = getCardStats();
  const rows = Object.entries(stats)
    .filter(([, s]) => s.offers >= 3)
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

function clearAll() {
  data = { schemaVersion: SCHEMA_VERSION, drafts: [] };
  currentDraft = null;
  persist();
}

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
