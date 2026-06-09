// SETTINGS — user-configurable display + behavior toggles.
//
// Persisted to localStorage under `magiclike_settings_v1`. Forward-compatible:
// missing keys fall back to DEFAULTS so new settings added in later versions
// don't need an explicit migration path. Removing a setting orphans its
// stored value but doesn't break anything.
//
// Public API: SETTINGS.get(key), SETTINGS.set(key, value), SETTINGS.getAll(),
// SETTINGS.applyFontsToRoot(), SETTINGS.FONT_OPTIONS, SETTINGS.FONT_PRESETS,
// SETTINGS.CARD_FONT_ELEMENTS, SETTINGS.FONT_SIZE_OPTIONS_*.
// `set` writes through to localStorage immediately and (for font keys) pushes
// the new value into the matching CSS custom property on :root.
//
// Settings history:
// - v1.0.147: cardFrameStyle ('new' | 'classic') — removed v1.0.180 (v1 wireframe gone)
// - v1.0.153: cardFontTitle / -Body / -Pip (slot-based fonts, deprecated v1.0.158)
// - v1.0.154: cardFontSizeTitle / -Body / -Pip (slot-based size multipliers, deprecated v1.0.158)
// - v1.0.158: per-element font + size keys (name, type, pt, damage, text,
//   stickers, pip, bumped). One-shot migration walks any old slot keys
//   into the matching per-element keys on load.
const SETTINGS = (function() {

const STORAGE_KEY = 'magiclike_settings_v1';

// Per-element baseline px sizes (at --scale 1). Drives the size dropdown
// labels in the settings UI and the buildSizeOptions() helper below.
// Element names match the suffix on each CSS custom property
// (--card-font-NAME / --card-fsize-NAME / etc.) and the .frame-NAME class.
const CARD_FONT_ELEMENTS = [
  { key: 'name',     label: 'Name',          baseline: 7, slot: 'title' },
  { key: 'type',     label: 'Type line',     baseline: 5, slot: 'title' },
  { key: 'pt',       label: 'P/T',           baseline: 5, slot: 'title' },
  { key: 'damage',   label: 'Damage marker', baseline: 5, slot: 'title' },
  { key: 'text',     label: 'Oracle text',   baseline: 6, slot: 'body' },
  { key: 'stickers', label: 'Stickers',      baseline: 5, slot: 'body' },
  { key: 'pip',      label: 'Mana pip',      baseline: 3, slot: 'pip' },
  { key: 'bumped',   label: 'Cost arrow',    baseline: 4, slot: 'pip' },
];

const DEFAULTS = {
  // Baseline tuned for mobile (Pixel 8 / DPR 2.625) per a v1.0.177 session
  // dump. Almendra everywhere; size multipliers landed on the values below.
  // Existing users keep their localStorage tuning; fresh installs start here.
  cardFontName:     "'Almendra', Georgia, serif",
  cardFontType:     "'Almendra', Georgia, serif",
  cardFontPt:       "'Almendra', Georgia, serif",
  cardFontDamage:   "'Almendra', Georgia, serif",
  cardFontText:     "'Almendra', Georgia, serif",
  cardFontStickers: "'Almendra', Georgia, serif",
  cardFontPip:      "'Almendra', Georgia, serif",
  cardFontBumped:   "'Almendra', Georgia, serif",
  // Per-element size multipliers (each * its element's baseline px).
  cardFontSizeName:     8/7,    // 8px (baseline 7)
  cardFontSizeType:     7/5,    // 7px (baseline 5)
  cardFontSizePt:       2,      // 10px (baseline 5)
  cardFontSizeDamage:   2,      // 10px
  cardFontSizeText:     7/6,    // 7px (baseline 6)
  cardFontSizeStickers: 1,      // 5px
  cardFontSizePip:      10/3,   // 10px (baseline 3)
  cardFontSizeBumped:   1.5,    // 6px (baseline 4)
  // Popup mode: dampen text growth so a 4x popup frame renders text at
  // ~2.8x effective scale, leaving more room for long oracle text.
  cardPopupTextScale: 0.7,
  // Mana symbol size knobs.
  cardManaPipSize:      3,      // 12px (baseline 4)
  cardManaPipPopupSize: 1.5,    // 6px-at-1x = 24px in 4x popup
  cardManaTextSize:     1,      // 1.2em (baseline)
  // Ability (keyword) icon size: multiplier on the 10px-at-1x .kw-icon coin
  // shown in the in-play frame's keyword row. Pushed into --card-kw-icon-size.
  cardKwIconSize:       1,      // 10px (baseline)
  // Master card-size multiplier for hand / board cards. Scales the whole
  // 1x (80x112px) frame — art, text, pips — uniformly. Pushed into the
  // --card-size-scale CSS var; the fixed-scale contexts (draft / popup /
  // previews) set --scale inline and ignore it.
  cardSizeScale:        1,
  // Devtools: when true, the settings panel shows the full font / mana
  // picker UI. Off by default for the user-facing build; flipped on via
  // the "Devtools" section in the settings panel.
  showFontDevtools:     false,
  // Devtools: when true, the AI opponent's hand renders face-up instead of
  // as cardbacks — for judging whether AI decisions are reasonable given
  // what it's actually holding. Off by default. Toggled in the same section.
  revealAiHand:         false,
};

// Options for the popup text scale dropdown. Values < 1 dampen the text
// growth in the 4x popup; > 1 amplifies it (rarely useful).
const POPUP_TEXT_SCALE_OPTIONS = [
  { label: '40% (very dense text)',   value: 0.4 },
  { label: '50%',                     value: 0.5 },
  { label: '60%',                     value: 0.6 },
  { label: '70%',                     value: 0.7 },
  { label: '85%',                     value: 0.85 },
  { label: '100% (matches frame)',    value: 1 },
  { label: '125%',                    value: 1.25 },
];

// Mana cost-pip size options. Px-anchored to the frame-pip's 4px baseline at
// --scale 1, so labels read as actual rendered size in hand/board.
const MANA_PIP_SIZE_OPTIONS = buildSizeOptions(4, [3, 4, 5, 6, 8, 9, 10, 12]);

// Ability (keyword) icon size options. Px-anchored to the .kw-icon's 10px
// baseline at --scale 1, so labels read as actual rendered size in hand/board.
const KW_ICON_SIZE_OPTIONS = buildSizeOptions(10, [6, 8, 10, 12, 14, 16, 20]);

// In-text .mana symbol size options. em-based (scales with surrounding
// text), so we express as a multiplier of the 1.2em baseline.
const MANA_TEXT_SIZE_OPTIONS = [
  { label: '80%',                value: 0.8 },
  { label: '100% (default)',     value: 1 },
  { label: '125%',               value: 1.25 },
  { label: '150%',               value: 1.5 },
  { label: '200%',               value: 2 },
];

// Master card-size options. Multiplier on the 1x (80x112px) hand/board
// frame; everything inside scales with it. 100% is the tuned default.
const CARD_SIZE_OPTIONS = [
  { label: '60%',                value: 0.6 },
  { label: '75%',                value: 0.75 },
  { label: '85%',                value: 0.85 },
  { label: '100% (default)',     value: 1 },
  { label: '115%',               value: 1.15 },
  { label: '125%',               value: 1.25 },
  { label: '150%',               value: 1.5 },
  { label: '175%',               value: 1.75 },
  { label: '200%',               value: 2 },
];

const FONT_OPTIONS = [
  { label: 'Almendra (fantasy serif)',    value: "'Almendra', Georgia, serif" },
  { label: 'Almendra Bold',               value: "'Almendra Bold', Georgia, serif" },
  { label: 'Georgia (serif)',             value: "Georgia, serif" },
  { label: 'Arial (sans-serif)',          value: "Arial, sans-serif" },
  { label: 'System UI',                   value: "system-ui, sans-serif" },
  { label: 'Monospace',                   value: "monospace" },
];

// Presets remain slot-shaped (title/body/pip) for compactness; applying a
// preset writes the title font to all four title-slot elements, body font
// to both body-slot elements, pip font to both pip-slot elements.
const FONT_PRESETS = {
  'Almendra (default)': {
    title: "'Almendra', Georgia, serif",
    body:  "'Almendra', Georgia, serif",
    pip:   "'Almendra', Georgia, serif",
  },
  'Almendra Bold headers': {
    title: "'Almendra Bold', Georgia, serif",
    body:  "'Almendra', Georgia, serif",
    pip:   "'Almendra', Georgia, serif",
  },
  'Classic (all Georgia)': {
    title: "Georgia, serif",
    body:  "Georgia, serif",
    pip:   "Georgia, serif",
  },
  'Modern Sans': {
    title: "system-ui, sans-serif",
    body:  "system-ui, sans-serif",
    pip:   "system-ui, sans-serif",
  },
};

function buildSizeOptions(baseline, sizes) {
  return sizes.map(px => ({
    label: px === baseline ? `${px}px (default)` : `${px}px`,
    value: px / baseline,
  }));
}
// Slot-shaped size option arrays. Each element in a slot gets the same
// dropdown choices (e.g. both 'pt' and 'damage' use the title-slot sizes
// since they share the 5px baseline). Each label is computed against the
// ELEMENT's baseline (in CARD_FONT_ELEMENTS), so a 7px label means 7px
// for that element at 1x scale.
const FONT_SIZE_OPTIONS_TITLE   = buildSizeOptions(7, [4, 5, 6, 7, 8, 9, 10, 12, 14]);
const FONT_SIZE_OPTIONS_SECONDARY = buildSizeOptions(5, [3, 4, 5, 6, 7, 8, 10]);
const FONT_SIZE_OPTIONS_BODY    = buildSizeOptions(6, [3, 4, 5, 6, 7, 8, 9, 10, 12]);
const FONT_SIZE_OPTIONS_PIP     = buildSizeOptions(3, [2, 3, 4, 5, 6, 7, 8, 10, 12, 14]);
const FONT_SIZE_OPTIONS_BUMPED  = buildSizeOptions(4, [2, 3, 4, 5, 6, 8]);

// Map each element key to its size-options array. The settings UI reads
// this to populate per-element size dropdowns.
const FONT_SIZE_OPTIONS_BY_ELEMENT = {
  name:     FONT_SIZE_OPTIONS_TITLE,
  type:     FONT_SIZE_OPTIONS_SECONDARY,
  pt:       FONT_SIZE_OPTIONS_SECONDARY,
  damage:   FONT_SIZE_OPTIONS_SECONDARY,
  text:     FONT_SIZE_OPTIONS_BODY,
  stickers: FONT_SIZE_OPTIONS_SECONDARY,
  pip:      FONT_SIZE_OPTIONS_PIP,
  bumped:   FONT_SIZE_OPTIONS_BUMPED,
};

// CSS var names for each element. Used by applyFontsToRoot + set(). The
// key matches the suffix on the var, capitalized in the settings keys:
// cardFontName -> --card-font-name, cardFontSizeName -> --card-fsize-name.
function cssVarFont(elementKey)  { return `--card-font-${elementKey}`; }
function cssVarFsize(elementKey) { return `--card-fsize-${elementKey}`; }
function settingsKeyFont(elementKey)  { return `cardFont${elementKey.charAt(0).toUpperCase()}${elementKey.slice(1)}`; }
function settingsKeyFsize(elementKey) { return `cardFontSize${elementKey.charAt(0).toUpperCase()}${elementKey.slice(1)}`; }

let data = null;

function ensureSettingsLoaded() {
  if (data !== null) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { data = { ...DEFAULTS }; return; }
    const blob = JSON.parse(raw);
    migrateLegacySlotKeys(blob);
    data = { ...DEFAULTS, ...blob };
  } catch (e) {
    console.warn('Settings load failed; using defaults:', e);
    data = { ...DEFAULTS };
  }
}

// One-shot migration: pre-v1.0.158 stored slot keys (cardFontTitle/Body/Pip
// + size variants). Walk those into the matching per-element keys when no
// per-element value is already present. Don't delete the old keys --
// they're harmless and a future user reverting to an older version would
// still see them.
function migrateLegacySlotKeys(blob) {
  const slotToElements = {
    title: ['name', 'type', 'pt', 'damage'],
    body:  ['text', 'stickers'],
    pip:   ['pip', 'bumped'],
  };
  const slotNames = { title: 'Title', body: 'Body', pip: 'Pip' };
  for (const [slot, elements] of Object.entries(slotToElements)) {
    const oldFont = blob[`cardFont${slotNames[slot]}`];
    const oldSize = blob[`cardFontSize${slotNames[slot]}`];
    for (const el of elements) {
      const fKey = settingsKeyFont(el);
      const sKey = settingsKeyFsize(el);
      if (oldFont !== undefined && blob[fKey] === undefined) blob[fKey] = oldFont;
      if (oldSize !== undefined && blob[sKey] === undefined) blob[sKey] = oldSize;
    }
  }
}

function get(key) {
  ensureSettingsLoaded();
  return data[key];
}

// Non-element settings keys mapped to their :root CSS custom property
// names. Element keys (cardFontName / cardFontSizeName / etc.) are
// handled by the CARD_FONT_ELEMENTS loop below — they fan out from a
// single data table and don't need entries here. Adding a new global
// tunable: append one row to this table and one --var to the CSS, no
// new if/else in set().
const CSS_VAR_BINDINGS = {
  cardSizeScale:        '--card-size-scale',
  cardPopupTextScale:   '--card-popup-text-scale',
  cardManaPipSize:      '--card-mana-pip-size',
  cardManaPipPopupSize: '--card-mana-pip-popup-size',
  cardManaTextSize:     '--card-mana-text-size',
  cardKwIconSize:       '--card-kw-icon-size',
};

function set(key, value) {
  ensureSettingsLoaded();
  data[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Settings save failed:', e);
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    // For per-element font/size keys, push the change to :root immediately.
    for (const el of CARD_FONT_ELEMENTS) {
      if (key === settingsKeyFont(el.key))  document.documentElement.style.setProperty(cssVarFont(el.key), value);
      if (key === settingsKeyFsize(el.key)) document.documentElement.style.setProperty(cssVarFsize(el.key), value);
    }
    if (CSS_VAR_BINDINGS[key]) document.documentElement.style.setProperty(CSS_VAR_BINDINGS[key], value);
  }
}

function getAll() {
  ensureSettingsLoaded();
  return { ...data };
}

function applyFontsToRoot() {
  ensureSettingsLoaded();
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement.style;
  for (const el of CARD_FONT_ELEMENTS) {
    root.setProperty(cssVarFont(el.key),  data[settingsKeyFont(el.key)]);
    root.setProperty(cssVarFsize(el.key), data[settingsKeyFsize(el.key)]);
  }
  root.setProperty('--card-size-scale', data.cardSizeScale);
  root.setProperty('--card-popup-text-scale', data.cardPopupTextScale);
  root.setProperty('--card-mana-pip-size', data.cardManaPipSize);
  root.setProperty('--card-mana-pip-popup-size', data.cardManaPipPopupSize);
  root.setProperty('--card-mana-text-size', data.cardManaTextSize);
  root.setProperty('--card-kw-icon-size', data.cardKwIconSize);
}

return {
  get, set, getAll, applyFontsToRoot,
  FONT_OPTIONS, FONT_PRESETS,
  CARD_FONT_ELEMENTS,
  FONT_SIZE_OPTIONS_BY_ELEMENT,
  POPUP_TEXT_SCALE_OPTIONS,
  MANA_PIP_SIZE_OPTIONS, MANA_TEXT_SIZE_OPTIONS,
  KW_ICON_SIZE_OPTIONS,
  CARD_SIZE_OPTIONS,
  // Element-key utilities exposed for controller.js's settings UI.
  settingsKeyFont, settingsKeyFsize,
};

})();
