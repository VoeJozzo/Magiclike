// Roguelike map progression — two guarantees:
//
// 1. REGRESSION: getConstructedDeck lives inside draft.js's DRAFT IIFE, so a
//    bare (unqualified) call is undefined and throws when the boss banner
//    builds.
//
// 2. CONTRACT for the "always show the minimap" UI: startNextGame keeps a
//    single-successor auto-advance only as a back-compat fallback for
//    pre-2.0.61 saves with no pendingChoice.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== walk a full sector (root → boss → next sector) ===');
(() => {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame(); // game 1 = root node

  let threw = null;
  let mapPresentEvery = true;
  let sawBossBanner = false;
  let reachedNewSector = false;
  let sawSingleOptionChoice = false;

  try {
    for (let i = 0; i < 14; i++) {
      RUN.recordResult('you', [], []);          // win the current battle
      const ms = RUN.getMapState();
      if (!ms) { mapPresentEvery = false; break; }
      if (ms.pendingChoice) {
        if (ms.pendingChoice.options.length === 1) sawSingleOptionChoice = true;
        RUN.pickMapNode(ms.pendingChoice.options[0]);
      }
      const info = RUN.startNextGame();
      if (info && info.bossName) sawBossBanner = true;
      const cur = RUN.getMapState();
      const node = cur && cur.nodes.find(n => n.id === cur.currentNodeId);
      if (i > 0 && node && node.level === 0) { reachedNewSector = true; break; }
    }
  } catch (e) {
    threw = e.message || String(e);
  }

  check('advancing through the sector (incl. the boss) does not throw', threw === null, threw || '');
  check('boss banner resolved (DRAFT.getConstructedDeck reachable)', sawBossBanner);
  check('map state present at every between-game transition', mapPresentEvery);
  check('beating the boss rolls into a fresh sector', reachedNewSector);
  check('a single successor is offered as a one-option choice (unified UI, no auto-advance)',
    sawSingleOptionChoice);
})();

console.log('\n=== boss node carries a resolvable constructed deck ===');
(() => {
  let bossNodes = 0, resolvable = 0;
  for (let i = 0; i < 20; i++) {
    RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
    const ms = RUN.getMapState();
    for (const n of ms.nodes) {
      if (n.type === 'boss' && n.constructedId) {
        bossNodes++;
        const spec = DRAFT.getConstructedDeck(n.constructedId);
        if (spec && spec.name) resolvable++;
      }
    }
  }
  check('boss nodes exist across sampled maps', bossNodes > 0, 'count=' + bossNodes);
  check('every boss constructedId resolves to a named deck', bossNodes > 0 && resolvable === bossNodes,
    resolvable + '/' + bossNodes);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
