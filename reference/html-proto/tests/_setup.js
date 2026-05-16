// Shared test setup for the Magiclike engine.
//
// Two entry points:
//
//   getSource()  — returns the concatenated source of all engine JS modules
//                  as one string. Use for source-level pattern matching
//                  (call-site counts, "old pattern is gone" checks).
//
//   loadEngine() — boots the engine in this Node process. DOM/window
//                  globals get stubbed, then the modules are eval'd in
//                  the right load order with CONTROLLER.init() stripped.
//                  After return, ENGINE / AI / RUN / DRAFT / CARDS /
//                  STICKERS / CONTROLLER / PICKLOG are on `global`.
//                  Idempotent — second call is a no-op.
//
// History: the previous-session test bundle (see ../../../docs/...) read
// a monolithic magiclike_engine.html and regex-extracted its single
// <script> block. After the multi-file refactor (v1.0.129+) the HTML
// loads modules via <script src=...> tags, so we concatenate them here
// in the same order as magiclike_engine.html lines 522-530.

const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'js');

// Order matches the <script> tags in magiclike_engine.html. Earlier files
// declare module-scope constants that later files reference (e.g. main.js
// calls CONTROLLER.init() so controller.js must load first).
const ENGINE_FILES = [
  'cards.js',
  'engine.js',
  'ai.js',
  'meta.js',
  'controller.js',
  'render.js',
  'triggers.js',
  'trigger-generator.js',
  'main.js',
];

let _sourceCache = null;
function getSource() {
  if (_sourceCache != null) return _sourceCache;
  let out = '';
  for (const f of ENGINE_FILES) {
    out += '// ===== ' + f + ' =====\n';
    out += fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    out += '\n';
  }
  _sourceCache = out;
  return out;
}

function installDomStubs() {
  // A bag-of-stubs DOM node. Every method/prop the engine touches at load
  // time or via render() needs to exist or the boot will throw. Anything
  // that returns elements returns more of these (recursively).
  const fakeEl = () => ({
    textContent: '', innerHTML: '', style: {}, className: '',
    classList: {
      add: () => {}, remove: () => {}, toggle: () => {},
      contains: () => false,
    },
    addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {}, removeChild: () => {},
    insertBefore: () => {}, setAttribute: () => {}, getAttribute: () => null,
    removeAttribute: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    children: [], childNodes: [],
    firstChild: null, lastChild: null, parentNode: null,
    dataset: {}, onclick: null, disabled: false, value: '', checked: false,
    focus: () => {}, blur: () => {}, click: () => {}, remove: () => {},
  });
  global.document = {
    getElementById: () => fakeEl(),
    addEventListener: () => {}, removeEventListener: () => {},
    body: fakeEl(),
    createElement: () => fakeEl(),
    createTextNode: () => ({}),
    querySelectorAll: () => [], querySelector: () => null,
    activeElement: null,
  };
  global.window = {
    addEventListener: () => {}, removeEventListener: () => {},
    location: { reload: () => {} },
  };
  const _ls = {};
  global.localStorage = {
    getItem: k => (k in _ls ? _ls[k] : null),
    setItem: (k, v) => { _ls[k] = String(v); },
    removeItem: k => { delete _ls[k]; },
    clear: () => { for (const k of Object.keys(_ls)) delete _ls[k]; },
  };
  global.ResizeObserver = function() {
    this.observe = () => {}; this.disconnect = () => {}; this.unobserve = () => {};
  };
  global.MutationObserver = function() {
    this.observe = () => {}; this.disconnect = () => {}; this.takeRecords = () => [];
  };
  global.requestAnimationFrame = cb => setTimeout(cb, 0);
  global.cancelAnimationFrame = id => clearTimeout(id);
  global.confirm = () => false;
  global.alert = () => {};
}

// Names the engine declares at module scope that we want exposed for
// tests. Each becomes `global.<NAME> = <NAME>` after eval.
//
// Scope rule: only declarations at the OUTERMOST scope of each .js
// file (i.e. not inside an IIFE) can be hoisted to `global` from here.
// Helpers declared INSIDE the ENGINE / RUN / DRAFT / PICKLOG IIFEs are
// closure-captured and unreachable from outside. The try/catch around
// the assignment silently swallows the ReferenceError for those — so
// adding a name here doesn't break the loader, it just won't take
// effect for an IIFE-internal name.
//
// For IIFE-internal helpers, prefer the public route:
//   ENGINE.makeCard, ENGINE.findCard       (instead of bare makeCard / findCard)
//   RUN.applyStickerToSlot, RUN.stickersFor (instead of bare names)
// See engine.js's IIFE return object for the full ENGINE export set,
// and meta.js for the RUN / DRAFT exports.
const EXPOSED = [
  // Public module objects (top of each .js file).
  'ENGINE', 'AI', 'RUN', 'DRAFT', 'CARDS', 'STICKERS',
  'CONTROLLER', 'PICKLOG', 'VERSION', 'Modal',
  // Trigger-generator surface (triggers.js + trigger-generator.js —
  // no IIFE, all module-scope).
  'TRIGGER_CONDITIONS', 'GENERATOR_EFFECTS', 'GENERATOR_CONDITIONS',
  'evalTriggerCondition', 'generateRandomTrigger',
  'generateConditionOptions', 'generateEffectOptions', 'assembleTrigger',
  // Engine module-scope helpers (above the ENGINE IIFE).
  'applyStickersToCard', 'rollSubtypeFromDeck', 'pushStickerWithRoll',
  'stickersForSlot', 'deckColorsFromSlots', 'fakeTargetsForLegality',
  // Render module-scope helpers (render.js has no IIFE).
  'stickerBadgesHtml',
];

let _loaded = false;
function loadEngine() {
  if (_loaded) return;
  _loaded = true;
  installDomStubs();
  let code = getSource();
  // Strip the bootstrap call — it tries to wire up real DOM listeners we
  // don't have. The engine APIs are fully usable without it.
  code = code.replace(/CONTROLLER\.init\(\);?/g, '/* CONTROLLER.init() stripped for tests */');
  // Expose engine module-scope identifiers to the surrounding Node global,
  // so test code outside the new Function() can use them. The engine code
  // runs inside a fresh function scope (because of the new Function()),
  // so top-level const/let declarations there aren't visible to us
  // otherwise.
  const expose = EXPOSED.map(n => `try { global.${n} = ${n}; } catch (_) {}`).join('\n');
  new Function(code + '\n' + expose)();
}

module.exports = { getSource, loadEngine, ENGINE_FILES };
