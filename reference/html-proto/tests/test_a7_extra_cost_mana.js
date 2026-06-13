// Audit A7-1 — extra-cost mana abilities (a mana ability whose cost includes
// anything beyond {T}/mana, e.g. "{T}, sacrifice a creature: add {B}{B}") were
// triple-bypassed: surfaced ONLY as a tapLandForMana auto-action, executed by
// doTapLandForMana which paid only the tap (silently SKIPPING the sacrifice),
// and counted as a FREE mana source by the solver. Refuter widening: a TAPLESS
// extra-cost mana ability was also surfaced and WRONGLY tapped. P2 LATENT (no
// pool card has the shape today; 18 trivial {T}-only mana dorks must keep
// auto-paying). Joe GO + guard: the autotapper must NEVER auto-pay a non-trivial
// cost, so extra-cost mana abilities are EXCLUDED from every auto path
// (enumeration, legality, doTapLandForMana, solver) and surface only as explicit
// activated abilities; a boot tripwire flags the unsupported shape.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const quiet = (fn) => { const o = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = o; } };

let nextIid = 7700;
function mk(tplId, controller, abilities) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
  if (abilities) inst.abilities = abilities;
  return inst;
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.stack = []; G.gameOver = false;
  // First-player is assigned non-deterministically; force 'you' to be the actor
  // so getLegalActions('you')/executeAction reflect 'you's options each run.
  G.activePlayer = 'you'; G.priorityHolder = 'you';
  return G;
}

const SAC_MANA = [{ cost: { tap: true, sacrifice: 'creature' }, effects: [{ kind: 'add_mana', amounts: { B: 2 } }] }];
const TAPLESS_SAC_MANA = [{ cost: { sacrifice: 'creature' }, effects: [{ kind: 'add_mana', amounts: { B: 1 } }] }];
const TRIVIAL_MANA = [{ cost: { tap: true }, effects: [{ kind: 'add_mana', choose: ['G'] }] }];
const MANA_ONLY_COST = [{ cost: { tap: true, mana: { C: 1 } }, effects: [{ kind: 'add_mana', amounts: { W: 1, U: 1 } }] }]; // filter-land shape

console.log('=== A7-1 boot tripwire: extra-cost mana abilities flagged; trivial ones not ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    { tplId: 'sacAltar', abilities: SAC_MANA },
    { tplId: 'taplessSacAltar', abilities: TAPLESS_SAC_MANA },
    { tplId: 'okDork', abilities: TRIVIAL_MANA },
    { tplId: 'filterLand', abilities: MANA_ONLY_COST },
  ]));
  check('{T},sacrifice: add mana flagged', r.schemaErrors.some(e => e.startsWith('sacAltar:') && /non-tap\/mana cost|A7-1/.test(e)), r.schemaErrors.join('; '));
  check('tapless sacrifice: add mana flagged', r.schemaErrors.some(e => e.startsWith('taplessSacAltar:')));
  check('trivial {T}-only mana dork NOT flagged (the 18 pool dorks)', !r.schemaErrors.some(e => e.startsWith('okDork:')));
  check('mana-only cost ({1},{T}) NOT flagged (filter-land may auto-pay)', !r.schemaErrors.some(e => e.startsWith('filterLand:')));
  // The live pool has no extra-cost mana ability today.
  const live = quiet(() => ENGINE.validateAllCardEffects(CARDS));
  check('live pool has no extra-cost mana ability', !live.schemaErrors.some(e => /non-tap\/mana cost/.test(e)),
    live.schemaErrors.filter(e => /non-tap\/mana/.test(e)).join('; '));
})();

console.log('\n=== A7-1: extra-cost mana abilities are excluded from the tapLandForMana auto-lane ===');
(() => {
  const G = newGame();
  const victim = mk('gray_ogre', 'you');             // a creature to satisfy the sac cost
  const altar = mk('gray_ogre', 'you', SAC_MANA);    // {T},sac: add {B}{B}
  const dork = mk('gray_ogre', 'you', TRIVIAL_MANA); // {T}: add {G}
  G.you.battlefield = [victim, altar, dork];
  const actions = ENGINE.getLegalActions('you');
  const tapFor = (iid) => actions.filter(a => a.type === 'tapLandForMana' && a.cardIid === iid);
  check('the extra-cost altar is NOT surfaced as tapLandForMana (leg a)', tapFor(altar.iid).length === 0, JSON.stringify(tapFor(altar.iid)));
  check('the trivial dork IS still surfaced as tapLandForMana (control)', tapFor(dork.iid).length >= 1, JSON.stringify(tapFor(dork.iid)));
})();

console.log('\n=== A7-1: doTapLandForMana refuses extra-cost abilities (defense-in-depth) ===');
(() => {
  const G = newGame();
  const victim = mk('gray_ogre', 'you');
  const altar = mk('gray_ogre', 'you', SAC_MANA);
  G.you.battlefield = [victim, altar];
  const beforeB = G.you.mana.B || 0;
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: altar.iid, abilityIdx: 0 });
  check('altar was NOT tapped (no silent tap)', altar.tapped === false, 'tapped=' + altar.tapped);
  check('no {B} mana was produced (cost not silently skipped)', (G.you.mana.B || 0) === beforeB, 'B=' + (G.you.mana.B || 0));
  check('the victim was NOT sacrificed', G.you.battlefield.some(c => c.iid === victim.iid));

  // Tapless widening: a tapless extra-cost mana ability must not be wrongly tapped.
  const altar2 = mk('gray_ogre', 'you', TAPLESS_SAC_MANA);
  G.you.battlefield.push(altar2);
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: altar2.iid, abilityIdx: 0 });
  check('tapless extra-cost ability NOT wrongly tapped', altar2.tapped === false, 'tapped=' + altar2.tapped);
})();

console.log('\n=== A7-1: the mana SOLVER excludes extra-cost abilities as sources (the auto-cast leg) ===');
(() => {
  // manaAbilityOf (the solver source-scan, via landProducibleColors) must NOT
  // see an extra-cost ability — else a spell auto-casts off it without paying
  // the sacrifice. This pins the gate the tap-lane/legality assertions above do
  // NOT cover: reverting the manaAbilityOf trivial-cost gate re-opens
  // auto-cast-off-a-sac-source (the finding's headline "counted as a FREE source").
  // landProducibleColors is land-only and reads manaAbilityOf (the solver's
  // source scan), so use LAND bases to exercise the gate directly.
  const altar = mk('gray_ogre', 'you', SAC_MANA); altar.types = ['Land'];
  const dork = mk('gray_ogre', 'you', TRIVIAL_MANA); dork.types = ['Land'];
  const altarColors = ENGINE.landProducibleColors(altar);
  const dorkColors = ENGINE.landProducibleColors(dork);
  check('landProducibleColors(extra-cost altar) is [] (solver excludes it)',
    Array.isArray(altarColors) && altarColors.length === 0, JSON.stringify(altarColors));
  check('landProducibleColors(trivial dork) is non-empty (still a source)',
    Array.isArray(dorkColors) && dorkColors.length >= 1, JSON.stringify(dorkColors));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
