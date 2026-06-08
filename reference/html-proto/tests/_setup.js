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
  'settings.js',
  'cards.js',
  'types.js',
  'engine.js',
  'card-text.js',
  'stickers.js',
  'ai.js',
  'draft.js',
  'run.js',
  'picklog.js',
  'controller.js',
  'render.js',
  'settings-panel.js',
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
// and run.js / draft.js / picklog.js for their respective IIFE exports.
const EXPOSED = [
  // Public module objects (top of each .js file).
  'ENGINE', 'AI', 'RUN', 'DRAFT', 'CARDS', 'STICKERS',
  // §7b cast-path coverage sets (ai.js module scope).
  'TARGET_SCORED_KINDS', 'NOT_TARGET_SCORED_KINDS',
  'CONTROLLER', 'PICKLOG', 'VERSION', 'Modal', 'RUN_MODIFIERS', 'SETTINGS',
  // Card-load surface (cards.js, module-scope).
  'ingestCard',
  // tplId rename plumbing — exposed for tplid_renames_test.
  'TPLID_RENAMES', 'renameTplId', 'MIGRATIONS', 'SAVE_VERSION', 'SAVE_KEY',
  // Trigger-generator surface (triggers.js + trigger-generator.js —
  // no IIFE, all module-scope).
  'GENERATOR_EFFECTS', 'GENERATOR_CONDITIONS',
  'evalTriggerCondition', 'generateRandomTrigger',
  // Composable-predicate surface (triggers.js, module-scope — Slice 2 / E2).
  'ATOMIC_PREDICATES', 'evaluateCondition', '_parseCall',
  // Effect-shorthand parser (triggers.js, module-scope — §5.1/§5.2).
  '_parseEffectCall', 'desugarEffectString', 'normalizeCardEffects',
  'validateAllCardConditions', 'VALID_TRIGGER_EVENTS',
  'triggerArchetype', 'triggerSubtype', 'triggerFiresOnEnter',
  'generateConditionOptions', 'generateEffectOptions', 'assembleTrigger',
  // Empower system (cards.js module-scope).
  'EMPOWER_FIELDS', 'isEmpowerableField', 'enumerateEmpowerTargets',
  'rollEmpowerTarget', 'hasEmpowerableEffect',
  // Engine module-scope helpers (above the ENGINE IIFE).
  'deckColorsFromSlots', 'fakeTargetsForLegality',
  'isCompatibleStaplePair', 'manaAbilityOf', 'manaEffectColors',
  'remapEmpowerRollForStaple', 'countEffects', 'mergeSpliceData',
  'isSpliceableBase', 'isSpliceableStaple',
  // Sticker module surface (stickers.js, all top-level).
  'pickWeightedSticker',
  'applyStickersToCard', 'applyOneStickerToRuntimeCard',
  'applyRandomStickersToSide', 'empowerRollLabel', 'applyEmpowerRoll',
  'rollSubtypeFromDeck', 'pushStickerWithRoll', 'stickersForSlot',
  // Render module-scope helpers (render.js has no IIFE).
  'stickerBadgesHtml', 'segmentsToHtml', 'effectiveArt', 'renderManaSymbols', 'formatCostBraced',
  'isValidTargetCreature', 'canPlayFromUI', 'playerForcedPrompt', 'anyForcedPrompt',
  'activationGlowAvailable',
  'edictChoiceNoun', 'graveyardPickerPrompt', 'castCardByIid',
  // Card-text module surface (card-text.js, all module-scope, no IIFE).
  'describeAmount', 'describeEffect', 'describeEffectList',
  'describeTrigger', 'triggerLogText', 'describeAbility', 'describeStaticBuff',
  'describeCardText', 'describeCardSegments', 'describeModalSegs',
  // Card-text internal helpers — exposed so tests can target them
  // independently if a regression localizes to one.
  'targetPhrase', 'withFilter', 'plainSeg', 'indefiniteArticle', 'manaCostBraces',
  'bumpedSeg', 'bumpedDerived',
  'segsToText', 'capitalize', 'capitalizeSegs',
  'triggerPreamble', 'abilityCostPhrase', 'keywordPreamble',
  // Unified type system (types.js, all module-scope, no IIFE — Phase 1).
  'TYPE_REGISTRY', 'typeRegistryEntry', 'typeCategory', 'isCardTypeTag',
  'typesOf', 'hasType', 'addType', 'subtypesOf', 'governingType',
  'isPermanent', 'typeLine',
];

// Card templates now live in cards/<tplId>/card.json. The browser-side
// loadCards() uses fetch() — useless in Node. Tests instead populate
// CARDS synchronously from disk via fs.readFileSync, much faster than
// awaiting a fetch loop and gives identical data.
//
// Wire format is snake_case (docs/STANDARDIZATION-PLAN.md §4). We pipe each
// card through cards.js's ingestCard() to rebind to the JS-internal camelCase
// names (tplId) and compute color/colors from cost — matching what
// the browser-side loadCards() does.
const CARDS_DIR = path.join(__dirname, '..', 'cards');
function loadCardsFromDisk() {
  const manifest = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, '_manifest.json'), 'utf8'));
  const out = {};
  for (const folderId of manifest) {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, folderId, 'card.json'), 'utf8'));
    global.ingestCard(card);
    out[card.tplId] = card;
  }
  return out;
}

let _loaded = false;
function loadEngine() {
  if (_loaded) return;
  _loaded = true;
  installDomStubs();
  let code = getSource();
  // Strip the browser bootstrap. main.js now wraps CONTROLLER.init() in a
  // loadCards().then(...) so cards arrive before init. In Node we'll
  // populate CARDS ourselves and call nothing — leaving the .then chain
  // intact would invoke fetch(), which doesn't exist here.
  code = code.replace(
    /loadCards\(\)\.then\([\s\S]*?\}\);/,
    '/* main.js bootstrap stripped for tests */'
  );
  // Also strip any bare CONTROLLER.init() that might remain elsewhere.
  code = code.replace(/^\s*CONTROLLER\.init\(\);?\s*$/m, '/* CONTROLLER.init() stripped */');
  // Expose engine module-scope identifiers to the surrounding Node global,
  // so test code outside the new Function() can use them. The engine code
  // runs inside a fresh function scope (because of the new Function()),
  // so top-level const/let declarations there aren't visible to us
  // otherwise.
  const expose = EXPOSED.map(n => `try { global.${n} = ${n}; } catch (_) {}`).join('\n');
  new Function(code + '\n' + expose)();
  // Populate CARDS now that the engine modules are loaded. Done after
  // eval so the engine's `const CARDS = {}` exists; we mutate it in place
  // rather than replace the binding (other modules captured the
  // reference via closure).
  const cards = loadCardsFromDisk();
  for (const tplId of Object.keys(cards)) {
    global.CARDS[tplId] = cards[tplId];
  }
}

module.exports = { getSource, loadEngine, ENGINE_FILES };
