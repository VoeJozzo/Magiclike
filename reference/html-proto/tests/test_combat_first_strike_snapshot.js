// Audit fix A2-1 — first-strike membership is SNAPSHOTTED at combat-damage
// start; the two strike passes consult the snapshot, never live keywords.
//
// Before this fix, resolveCombatDamage's pass filters read the mutable
// `card.keywords` array at call time. Deaths are swept BETWEEN the passes,
// and a dying lord's clearRestrictionsFromSource splices its granted
// keywords out — so a creature whose first strike was granted by a lord
// that died in pass 1 re-qualified for the pass-2 `!first_strike` filter
// and dealt combat damage TWICE (the finding's executed repro: 5 face
// damage where canon says 3). Mirror bug: a creature GAINING first strike
// between the passes matched NEITHER filter and dealt zero.
//
// Design ruling (PR #98, 2026-06-11, per MTG): there is no priority window
// between the strike steps, so nothing can respond to the revocation —
// snapshot who has first strike once, at damage start. Each combatant
// deals damage in exactly the wave the snapshot assigns (pass 1 if it had
// first strike when damage started, pass 2 otherwise) — never both, so no
// accidental double-strike semantics. Canon: docs/wiki/rules/800-combat.md
// §803.
//
// This file pins both directions, using the finding's executed repro cards:
//   1. Lord dies in pass 1 (skyfire_drakelord granting FS+1/+1 to Dragons,
//      killed by a first-strike blocker): the granted Dragon deals its
//      pass-1 damage ONLY — face total 3, not 5 — even though the grant
//      is revoked between passes.
//   2. Inverse — a creature GAINING first strike between passes (a
//      not_keyword-gated FS lord starts matching when the lord granting
//      that keyword dies in pass 1) still deals its single,
//      snapshot-assigned pass-2 damage — face 2, not 0.
//      (Why not_keyword: a stat-gated filter like max_power on a
//      static_buff recurses getStats <-> matchFilter; keyword gates don't.)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9700;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
}
// Pass priority with whoever the engine expects until `done()` or safety.
function passUntil(G, done, max) {
  let safety = max || 40;
  while (!done() && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

if (!VANILLA || !CARDS['skyfire_drakelord'] || !CARDS['goblin_raider'] || !CARDS['plains']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {

  console.log('=== A2-1 direction 1: FS-granting lord dies in pass 1 — granted creature deals pass-1 damage ONLY ===');
  {
    const G = newGame();
    // Skyfire Drakelord: 3/4 first strike, grants first_strike +1/+1 to
    // your Dragons. The finding's repro makes Goblin Raider (2/1) a Dragon.
    const lord = mk('skyfire_drakelord', 'you');
    const raider = mk('goblin_raider', 'you');
    raider.types.push('Dragon');
    G.you.battlefield.push(lord, raider);
    // First-strike blocker that trades with the lord in pass 1:
    // power 4 kills the 3/4 lord; toughness 3 dies to the lord's 3.
    const blocker = mk(VANILLA, 'opp');
    blocker.power = 4; blocker.toughness = 3;
    blocker.keywords = ['first_strike'];
    G.opp.battlefield.push(blocker);
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    const okAtk = ENGINE.executeAction('you',
      { type: 'declareAttackers', cardIids: [lord.iid, raider.iid] });
    check('attack declared', !!okAtk);
    check('setup: raider has GRANTED first strike at declaration',
      raider.keywords.includes('first_strike'),
      'keywords=' + JSON.stringify(raider.keywords));
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
    const okBlock = ENGINE.executeAction('opp', {
      type: 'declareBlockers', blockMap: new Map([[blocker.iid, lord.iid]]),
    });
    check('block declared', !!okBlock);
    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);

    const lordNow = G.you.battlefield.find(c => c.iid === lord.iid);
    const raiderNow = G.you.battlefield.find(c => c.iid === raider.iid);
    const blockerNow = G.opp.battlefield.find(c => c.iid === blocker.iid);
    check('lord and blocker traded in pass 1', !lordNow && !blockerNow,
      'lordAlive=' + !!lordNow + ' blockerAlive=' + !!blockerNow);
    check('raider survives, grant revoked by the lord\'s death',
      !!raiderNow && !raiderNow.keywords.includes('first_strike'),
      raiderNow ? 'keywords=' + JSON.stringify(raiderNow.keywords) : 'raider dead');
    // THE pin: raider dealt its buffed 3 in pass 1 (granted FS) and must
    // NOT deal again in pass 2 after the grant is revoked. Live-filter bug
    // dealt 3 + 2 = 5; snapshot rule says 3.
    check('A2-1: face damage is the pass-1 hit only (3, not 5)',
      oppLifeAtStart - G.opp.life === 3,
      'face damage=' + (oppLifeAtStart - G.opp.life));
  }

  console.log('\n=== A2-1 direction 2: creature GAINS first strike between passes — still deals its single pass-2 damage ===');
  {
    const G = newGame();
    // X: Goblin Raider 2/1. vigLord grants it vigilance; the FS lord's
    // grant is gated on not_keyword:'vigilance', so X has NO first strike
    // at damage start. When vigLord dies in pass 1, its vigilance grant is
    // revoked (clearRestrictionsFromSource) and the death emit's
    // reconciliation (applyStaticKeywordGrants) grants X first strike —
    // BETWEEN the passes.
    const x = mk('goblin_raider', 'you');
    const vigLord = mk(VANILLA, 'you');
    vigLord.power = 2; vigLord.toughness = 2;
    vigLord.keywords = [];   // VANILLA may carry flying — the blocker must reach it
    vigLord.static_buffs = [
      { filter: { controller: 'self' }, subtype: 'Goblin', keywords: ['vigilance'] },
    ];
    const fsLord = mk(VANILLA, 'you');
    fsLord.static_buffs = [
      { filter: { controller: 'self', not_keyword: 'vigilance' }, subtype: 'Goblin',
        keywords: ['first_strike'] },
    ];
    G.you.battlefield.push(x, vigLord, fsLord);
    // First-strike blocker kills the 2/2 vigLord in pass 1 and survives
    // its 2 back (power 2, toughness 4).
    const blocker = mk(VANILLA, 'opp');
    blocker.power = 2; blocker.toughness = 4;
    blocker.keywords = ['first_strike'];
    G.opp.battlefield.push(blocker);
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    const okAtk = ENGINE.executeAction('you',
      { type: 'declareAttackers', cardIids: [x.iid, vigLord.iid] });
    check('attack declared', !!okAtk);
    check('setup: X has NO first strike at declaration (vigilance blocks the gate)',
      x.keywords.includes('vigilance') && !x.keywords.includes('first_strike'),
      'keywords=' + JSON.stringify(x.keywords));
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
    const okBlock = ENGINE.executeAction('opp', {
      type: 'declareBlockers', blockMap: new Map([[blocker.iid, vigLord.iid]]),
    });
    check('block declared', !!okBlock);
    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);

    const vigLordNow = G.you.battlefield.find(c => c.iid === vigLord.iid);
    const xNow = G.you.battlefield.find(c => c.iid === x.iid);
    const blockerNow = G.opp.battlefield.find(c => c.iid === blocker.iid);
    check('vigilance lord died in pass 1; blocker survived',
      !vigLordNow && !!blockerNow,
      'vigLordAlive=' + !!vigLordNow + ' blockerAlive=' + !!blockerNow);
    check('X survives and GAINED first strike between passes (vigilance revoked)',
      !!xNow && xNow.keywords.includes('first_strike'),
      xNow ? 'keywords=' + JSON.stringify(xNow.keywords) : 'X dead');
    // THE pin: X had no first strike when damage started, so the snapshot
    // assigns it pass 2 — it deals its (now unbuffed) 2 there. Live-filter
    // bug excluded it from BOTH passes: face damage 0.
    check('A2-1: X deals its single pass-2 hit (2, not 0)',
      oppLifeAtStart - G.opp.life === 2,
      'face damage=' + (oppLifeAtStart - G.opp.life));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
