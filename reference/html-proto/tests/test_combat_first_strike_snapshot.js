// First-strike membership is snapshotted at combat-damage start; the two
// strike passes consult the snapshot, never live keywords. There is no
// priority window between the strike steps, so nothing can respond to a
// keyword change mid-combat: each combatant deals damage in exactly the wave
// the snapshot assigned it (pass 1 if it had first strike when damage
// started, pass 2 otherwise) — never both. Canon: C:/Users/Claude/k-wiki/magiclike/rules/800-combat.md
// §803.
//
// (not_keyword rather than a stat-gated filter like max_power: a stat gate on
// a static_buff recurses getStats <-> matchFilter; keyword gates don't.)

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
  setup.startMainPhase(who);
}
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
    // your Dragons; Goblin Raider (2/1) is made a Dragon to receive it.
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
    check('A2-1: X deals its single pass-2 hit (2, not 0)',
      oppLifeAtStart - G.opp.life === 2,
      'face damage=' + (oppLifeAtStart - G.opp.life));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
