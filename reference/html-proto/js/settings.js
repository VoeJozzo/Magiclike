// SETTINGS — user-configurable display + behavior toggles.
//
// Persisted to localStorage under `magiclike_settings_v1`. Forward-compatible:
// missing keys fall back to DEFAULTS so new settings added in later versions
// don't need an explicit migration path. Removing a setting orphans its
// stored value but doesn't break anything.
//
// Public API: SETTINGS.get(key), SETTINGS.set(key, value), SETTINGS.getAll().
// `set` writes through to localStorage immediately.
//
// First setting (v1.0.147): cardFrameStyle — 'new' (default, the v2 80x112
// pixel-art frames) or 'classic' (the original wireframe cards). The render
// path branches on this; flipping it triggers an immediate re-render.
const SETTINGS = (function() {

const STORAGE_KEY = 'magiclike_settings_v1';

const DEFAULTS = {
  cardFrameStyle: 'new',   // 'new' | 'classic'
};

let data = null;

function ensureLoaded() {
  if (data !== null) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { data = { ...DEFAULTS }; return; }
    const blob = JSON.parse(raw);
    // Merge: any saved keys win, missing ones fall back to DEFAULTS.
    // Forward-compat: a save written before a new key was added still loads
    // fine; the new key just gets its default value.
    data = { ...DEFAULTS, ...blob };
  } catch (e) {
    console.warn('Settings load failed; using defaults:', e);
    data = { ...DEFAULTS };
  }
}

function get(key) {
  ensureLoaded();
  return data[key];
}

function set(key, value) {
  ensureLoaded();
  data[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Settings save failed:', e);
  }
}

function getAll() {
  ensureLoaded();
  return { ...data };
}

return { get, set, getAll };

})();
