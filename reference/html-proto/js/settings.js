// SETTINGS — user-configurable display + behavior toggles.
//
// Persisted to localStorage under `magiclike_settings_v1`. Forward-compatible:
// missing keys fall back to DEFAULTS so new settings added in later versions
// don't need an explicit migration path. Removing a setting orphans its
// stored value but doesn't break anything.
//
// Public API: SETTINGS.get(key), SETTINGS.set(key, value), SETTINGS.getAll(),
// SETTINGS.applyFontsToRoot(), SETTINGS.FONT_OPTIONS, SETTINGS.FONT_PRESETS.
// `set` writes through to localStorage immediately and (for font keys) pushes
// the new value into the matching CSS custom property on :root.
//
// Settings:
// - cardFrameStyle: 'new' | 'classic' (v1.0.147)
// - cardFontTitle / cardFontBody / cardFontPip: CSS font-family stack
//   strings; written to --card-font-* CSS vars at runtime (v1.0.153).
const SETTINGS = (function() {

const STORAGE_KEY = 'magiclike_settings_v1';

// Each font slot is a CSS font-family value. Keep the string format identical
// to what would appear after `font-family:` in CSS (quotes around multi-word
// names, comma-separated fallbacks).
const DEFAULTS = {
  cardFrameStyle: 'new',                              // 'new' | 'classic'
  cardFontTitle: "'Cinzel', Georgia, serif",          // name, type, P/T, damage
  cardFontBody:  "Georgia, serif",                    // oracle text, stickers
  cardFontPip:   "Arial, sans-serif",                 // mana pip numbers, bumped arrow
};

// Per-slot picker options. Each entry is { label, value } where value is the
// CSS font-family string. Adding a new font: drop the @font-face into the
// HTML, then add an entry here.
const FONT_OPTIONS = [
  { label: 'Cinzel (display serif)',  value: "'Cinzel', Georgia, serif" },
  { label: 'Georgia (serif)',         value: "Georgia, serif" },
  { label: 'Press Start 2P (pixel)',  value: "'Press Start 2P', monospace" },
  { label: 'Arial (sans-serif)',      value: "Arial, sans-serif" },
  { label: 'System UI',               value: "system-ui, sans-serif" },
  { label: 'Monospace',               value: "monospace" },
];

// Named presets — one-click bundles. The settings UI writes all three font
// slots when a preset is selected. No "active preset" state is tracked; if
// the user later changes one slot manually, the preset dropdown shows
// "Custom" because no preset matches the current trio.
const FONT_PRESETS = {
  'Display Serif (default)': {
    title: "'Cinzel', Georgia, serif",
    body:  "Georgia, serif",
    pip:   "Arial, sans-serif",
  },
  'Classic (all Georgia)': {
    title: "Georgia, serif",
    body:  "Georgia, serif",
    pip:   "Georgia, serif",
  },
  'Pixel Headers': {
    title: "'Press Start 2P', monospace",
    body:  "Georgia, serif",
    pip:   "Arial, sans-serif",
  },
  'Full Pixel (Press Start 2P)': {
    title: "'Press Start 2P', monospace",
    body:  "'Press Start 2P', monospace",
    pip:   "'Press Start 2P', monospace",
  },
  'Modern Sans': {
    title: "system-ui, sans-serif",
    body:  "system-ui, sans-serif",
    pip:   "system-ui, sans-serif",
  },
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
  // For font keys, push the change to :root immediately so the visible
  // cards re-paint without a full re-render cycle. Guarded for Node tests.
  if (typeof document !== 'undefined' && document.documentElement) {
    if (key === 'cardFontTitle') document.documentElement.style.setProperty('--card-font-title', value);
    if (key === 'cardFontBody')  document.documentElement.style.setProperty('--card-font-body', value);
    if (key === 'cardFontPip')   document.documentElement.style.setProperty('--card-font-pip', value);
  }
}

function getAll() {
  ensureLoaded();
  return { ...data };
}

// Apply all three font slots to :root. Called on boot so the saved choices
// take effect before the first render. Guarded so the Node test harness
// (which stubs only a partial DOM) can safely call it.
function applyFontsToRoot() {
  ensureLoaded();
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement.style;
  root.setProperty('--card-font-title', data.cardFontTitle);
  root.setProperty('--card-font-body', data.cardFontBody);
  root.setProperty('--card-font-pip', data.cardFontPip);
}

return { get, set, getAll, applyFontsToRoot, FONT_OPTIONS, FONT_PRESETS };

})();
