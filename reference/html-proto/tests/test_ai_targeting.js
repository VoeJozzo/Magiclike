// §8.1 AI-valuation lockstep: the AI must value migrated (top-level target() +
// bare effect) spells the same as the legacy per-effect-target shape. Before
// the fix, scoreMultiTargetSpell/scoreSpellTargetForMode keyed off per-effect
// `eff.target` and scored a bare-effect spell at 0 (AI would never cast it).
// These cast a synthetic migrated bolt through AI.decide on a board where
// casting is clearly correct.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Migrated Lightning Bolt: top-level target() + bare damage (no per-effect target).
CARDS._testBolt = { tplId: '_testBolt', name: 'Test Bolt', types: ['Instant'], cost: { R: 1 }, color: 'R', colors: ['R'], target: 'creature_or_player', effects: [{ kind: 'damage', amount: 3 }] };

// A keyword-free vanilla so the AI's combat sim isn't skewed by flying/etc. when
// the test overrides power/toughness — keeps the decision deterministic across
// pool order (pre-id-normalization this happened to land on a vanilla; the
// alphabetical reorder exposed the latent dependency on "no keywords").
const TOUGH = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && (c.toughness || 0) >= 4 && !c.triggers && !c.abilities && !(c.keywords && c.keywords.length)) return id;
  }
  for (const [id, c] of Object.entries(CARDS)) if (hasType(c, 'Creature') && (c.toughness || 0) >= 4 && !(c.keywords && c.keywords.length)) return id;
  return null;
})();
let nextIid = 9000;
function mk(t, c) {
  const i = JSON.parse(JSON.stringify(CARDS[t]));
  return Object.assign(i, { iid: nextIid++, tplId: t, controller: c, owner: c, tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0, permPower: 0, permTou: 0, damagedBySources: new Set(), keywords: (i.keywords || []).slice() });
}
function newGame() { RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null); RUN.startNextGame(); return ENGINE.state(); }
function aiMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G[who].landPlayedThisTurn = true; // suppress land-play option to isolate the cast
}

console.log('=== AI casts a migrated bolt at a killable creature (score > 0) ===');
(() => {
  const G = newGame();
  const victim = mk(TOUGH, 'you'); victim.toughness = 2; victim.power = 2; G.you.battlefield.push(victim);
  const bolt = mk('_testBolt', 'opp'); G.opp.hand = [bolt];
  aiMain(G, 'opp');
  const a = AI.decide(G, 'opp');
  check('AI chose to cast the bolt', !!a && a.type === 'castSpell' && a.cardIid === bolt.iid, a && a.type);
  check('targeting the killable creature', !!a && a.targets && a.targets[0] && a.targets[0].iid === victim.iid);
})();

console.log('\n=== AI fires a migrated bolt at the face for lethal ===');
(() => {
  const G = newGame();
  G.you.life = 3;
  const bolt = mk('_testBolt', 'opp'); G.opp.hand = [bolt];
  aiMain(G, 'opp');
  const a = AI.decide(G, 'opp');
  check('AI chose to cast the bolt', !!a && a.type === 'castSpell' && a.cardIid === bolt.iid, a && a.type);
  check('aimed at the opponent player (lethal burn)', !!a && a.targets && a.targets[0] && a.targets[0].kind === 'player' && a.targets[0].who === 'you');
})();

console.log('\n=== AI does NOT bolt its own creature ===');
(() => {
  const G = newGame();
  // Only target available is the AI's own creature → casting scores <= 0, AI passes/holds.
  const own = mk(TOUGH, 'opp'); own.toughness = 2; G.opp.battlefield.push(own);
  const bolt = mk('_testBolt', 'opp'); G.opp.hand = [bolt];
  G.you.life = 20;
  aiMain(G, 'opp');
  const a = AI.decide(G, 'opp');
  // It may cast at the player (face chip) but must NOT target its own creature.
  const targetsOwn = a && a.type === 'castSpell' && a.targets && a.targets[0] && a.targets[0].iid === own.iid;
  check('AI never targets its own creature', !targetsOwn);
})();

// §8.1 mass-valuation: a migrated mass spell (damage + scope) is recognized as
// mass and held sensibly (the AI correctly holds a sweeper on its own
// unpressured turn). The legacy damageAll kind has been removed (step 7), so
// these now assert the new form's behavior + absolute values directly.
CARDS._pyroNew = { tplId: '_pyroNew', name: 'Pyro New', types: ['Sorcery'], cost: { R: 2 }, color: 'R', colors: ['R'], effects: [{ kind: 'damage', amount: 2, scope: 'all_creatures' }] };

function decidesToCast(tpl, setup) {
  const G = newGame();
  setup(G);
  const sp = mk(tpl, 'opp'); G.opp.hand = [sp];
  aiMain(G, 'opp');
  const d = AI.decide(G, 'opp');
  return !!(d && d.type === 'castSpell' && d.cardIid === sp.iid);
}

console.log('\n=== migrated mass-damage held when it would wreck only own board ===');
(() => {
  // AI's own creatures would die, opponent has none → holding is correct.
  const s = (G) => { for (let i = 0; i < 3; i++) { const c = mk(TOUGH, 'opp'); c.toughness = 2; c.power = 2; G.opp.battlefield.push(c); } };
  check('migrated mass-damage held (would only kill own)', decidesToCast('_pyroNew', s) === false);
})();

console.log('\n=== spellValueForEffects: mass/severity forms are valued sanely ===');
(() => {
  // Assert RELATIONSHIPS, not exact constants. The absolute values are AI tuning
  // numbers that churn constantly (see the changelog) — pinning `=== 12` made
  // this false-fail on every benign retune. What must hold is the ordering /
  // sign / scaling, which is the actual behavior the AI relies on.
  const v = AI.spellValueForEffects;
  const massDmg2 = v([{ kind: 'damage', amount: 2, scope: 'all_creatures' }]);
  const massDmg4 = v([{ kind: 'damage', amount: 4, scope: 'all_creatures' }]);
  const massKill = v([{ kind: 'affect_creature', severity: 'destroy', scope: 'all_creatures' }]);
  const singleKill = v([{ kind: 'affect_creature', severity: 'destroy' }]);
  const singleTap = v([{ kind: 'affect_creature', severity: 'tap' }]);
  const singleExile = v([{ kind: 'affect_creature', severity: 'exile' }]);
  check('mass damage is positively valued', massDmg2 > 0);
  check('mass damage scales with amount', massDmg4 > massDmg2);
  check('mass removal is positively valued', massKill > 0);
  check('single removal is positively valued', singleKill > 0);
  check('removal severity orders tap < destroy <= exile',
    singleTap < singleKill && singleKill <= singleExile, `tap=${singleTap} destroy=${singleKill} exile=${singleExile}`);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
