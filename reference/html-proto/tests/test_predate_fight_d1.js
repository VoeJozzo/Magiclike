// Predate ({1}{G} Sorcery: target creature you control gets +1/+1 until end of
// turn, then it fights target creature an opponent controls) and the machinery
// it exercises:
//   1. the `fight` effect's two operands — the targeted creature plus a `fighter`
//      selector (a {slot} reference for Predate, a {select} computed pick for the
//      one-sided fight cards).
//   2. The D1 live-read hybrid (DIVERGENCE §3.6): a {from:'target_*'} expression
//      reads LIVE state while the target is on the battlefield (so Predate's pump
//      counts in the fight) and falls back to last-known-info once the target has
//      left its zone (Swords-to-Plowshares: exile, then gain life = its power).
//   3. Static-lord keyword grants (applyStaticKeywordGrants) — previously live in
//      emit() but covered only by selfplay; this pins the behavior directly.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const LANDS12 = Array(12).fill('forest');
RUN.start({ cards: LANDS12.slice(), colors: ['G'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS12.slice());
const G = ENGINE.state();

function clearBoards() { G.you.battlefield = []; G.opp.battlefield = []; }
function place(who, tpl, p, t) {
  const c = ENGINE.makeCard(tpl); c.sick = false;
  if (p != null) c.power = p;
  if (t != null) c.toughness = t;
  G[who].battlefield.push(c); return c;
}
function tgt(c) { return { kind: 'creature', iid: c.iid }; }

console.log('=== Predate: the fight uses the POST-pump power (D1 live-read) ===');
(() => {
  clearBoards();
  const mine   = place('you', 'goblin_raider', 2, 2);  // our 2/2 fighter
  const theirs = place('opp', 'goblin_raider', 3, 3);  // their 3/3 target
  const ctx = { controller: 'you', sourceName: 'Predate', sourceIid: -1,
                allTargets: [tgt(mine), tgt(theirs)] };
  // Effect order matches resolveTopOfStack's loop: pump slot 0, then fight.
  ENGINE.applyEffect(ctx, { kind: 'pump', power: 1, toughness: 1, target_slot: 0 }, tgt(mine));
  check('our creature pumped to 3/3', ENGINE.getStats(mine)[0] === 3 && ENGINE.getStats(mine)[1] === 3);
  ENGINE.applyEffect(ctx, { kind: 'fight', target_slot: 1, fighter: { slot: 0 } }, tgt(theirs));
  check('boosted fighter dealt 3 (would be 2 if it read the pre-pump snapshot)', theirs.damage === 3,
    'damage=' + theirs.damage);
  check('the 3/3 dealt its 3 back to our creature', mine.damage === 3, 'damage=' + mine.damage);
})();

console.log('\n=== fight with a {select} fighter auto-picks our biggest (Beast\'s Fury) ===');
(() => {
  clearBoards();
  const small  = place('you', 'goblin_raider', 1, 1);
  const big    = place('you', 'goblin_raider', 5, 5);
  const theirs = place('opp', 'goblin_raider', 4, 4);
  const ctx = { controller: 'you', sourceName: "Beast's Fury", sourceIid: -1 };
  ENGINE.applyEffect(ctx, { kind: 'fight', fighter: { select: 'highest_power_yours' } }, tgt(theirs));
  check('auto-picked the 5/5 → dealt 5 to target', theirs.damage === 5, 'damage=' + theirs.damage);
  check('target dealt 4 back to the 5/5, not the 1/1', big.damage === 4 && small.damage === 0);
})();

console.log('\n=== D1 hybrid: {from:target_power} reads LIVE while in-zone ===');
(() => {
  clearBoards();
  const c = place('opp', 'goblin_raider', 3, 3);
  // A deliberately STALE snapshot (power 3, captured before the pump). The live
  // read must beat it.
  const staleSnap = { kind: 'creature', iid: c.iid, power: 3, toughness: 3, controller: 'opp' };
  ENGINE.applyEffect({ controller: 'you', sourceName: 'x', sourceIid: -1 },
    { kind: 'pump', power: 2, toughness: 2 }, tgt(c));   // now 5/5
  const before = G.you.life;
  ENGINE.applyEffect({ controller: 'you', sourceName: 'x', sourceIid: -1 },
    { kind: 'gain_life', amount: { from: 'target_power' } }, tgt(c), staleSnap);
  check('in-zone → read live power 5, not stale 3', G.you.life - before === 5, 'gained ' + (G.you.life - before));
})();

console.log('\n=== D1 hybrid: departed target falls back to last-known info (Swords) ===');
(() => {
  clearBoards();
  const c = place('opp', 'goblin_raider', 3, 3);
  const snap = { kind: 'creature', iid: c.iid, power: 3, toughness: 3, controller: 'opp' };
  const before = G.you.life;
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Swords', sourceIid: -1 },
    { kind: 'affect_creature', severity: 'exile' }, tgt(c));
  check('target exiled (off the battlefield)', !G.opp.battlefield.some(x => x.iid === c.iid));
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Swords', sourceIid: -1 },
    { kind: 'gain_life', amount: { from: 'target_power' } }, tgt(c), snap);
  check('departed → read last-known power 3', G.you.life - before === 3, 'gained ' + (G.you.life - before));
})();

console.log('\n=== Predate: oracle text + boot validation ===');
(() => {
  const txt = describeCardText(CARDS['predate']);
  check('text reads buff-then-fight with the pronoun fighter',
    txt === 'Target creature you control gets +1/+1 until end of turn, then it fights target creature an opponent controls.',
    txt);
  const errs = ENGINE.validateAllCardEffects({ predate: CARDS['predate'] });
  check('no unknown effect kinds / filters', errs.unknownKinds.length === 0 && errs.unknownFilters.length === 0,
    JSON.stringify(errs));
})();

console.log('\n=== Static lord grants its keyword to fellow tribe, clears on leave ===');
(() => {
  clearBoards();
  const NON_GOBLIN = Object.keys(CARDS).find(id => {
    const c = CARDS[id];
    return hasType(c, 'Creature') && !hasType(c, 'Goblin')
      && !(c.keywords || []).includes('haste') && !c.static_buffs;
  });
  const chief     = place('you', 'goblin_chieftain');   // grants Goblins +1/+1 and haste
  const goblin    = place('you', 'goblin_raider');      // vanilla Goblin, no native haste
  const outsider  = place('you', NON_GOBLIN);
  ENGINE.applyStaticKeywordGrants();
  check('fellow Goblin gains haste', (goblin.keywords || []).includes('haste'));
  check('lord does not grant haste to itself (already native, no dupe)',
    (chief.keywords || []).filter(k => k === 'haste').length === 1);
  check('non-Goblin gets nothing (' + NON_GOBLIN + ')', !(outsider.keywords || []).includes('haste'));
  ENGINE.clearRestrictionsFromSource(chief.iid);   // lord leaves play
  check('granted haste cleared when the lord leaves', !(goblin.keywords || []).includes('haste'));
})();

// Runs LAST: this rebuilds the game via RUN.startNextGame, which swaps the
// engine's G — so it must come after every section that uses the module-level G.
console.log('\n=== Predate cast END-TO-END through the real stack (AI resolves) ===');
(() => {
  // Real turn machinery (mirrors test_drain_lifeloss's harness) so the cast goes
  // on the stack, the caster passes, and resolution runs the loop that wires
  // ctx.allTargets + applies pump-before-fight. Stats chosen so both creatures
  // SURVIVE (no SBA death → .damage isn't reset), letting us read the exchange.
  RUN.start({ cards: Array(12).fill('forest'), colors: ['G'] }, null);
  RUN.startNextGame();
  const g = ENGINE.state();
  g.activePlayer = 'you'; g.priorityHolder = 'you'; g.phase = 'MAIN1';
  g.stack = []; g.gameOver = false; g.priority = { passes: new Set() };
  g.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  g.you.battlefield = []; g.opp.battlefield = [];
  const mk2 = (who, tpl, p, t) => { const c = ENGINE.makeCard(tpl); c.sick = false; if (p != null) c.power = p; if (t != null) c.toughness = t; g[who].battlefield.push(c); return c; };
  const mine   = mk2('you', 'goblin_raider', 2, 2);   // → 3/3 after the pump
  const theirs = mk2('opp', 'goblin_raider', 1, 5);   // 1/5: survives 3 dmg, deals only 1 back
  const pred = ENGINE.makeCard('predate'); g.you.hand.push(pred);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: pred.iid,
    targets: [{ kind: 'creature', iid: mine.iid }, { kind: 'creature', iid: theirs.iid }] });
  let safety = 40;
  while ((g.stack.length || (g.pendingTriggers || []).length || g.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(g, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
  check('cast resolved (stack drained)', g.stack.length === 0);
  check('buffed fighter dealt 3 to the 1/5 (boosted; would be 2 pre-pump)', theirs.damage === 3, 'their dmg=' + theirs.damage);
  check('the 1/5 dealt only 1 back to our creature', mine.damage === 1, 'our dmg=' + mine.damage);
  check('both creatures survived (no SBA death)',
    g.you.battlefield.some(c => c.iid === mine.iid) && g.opp.battlefield.some(c => c.iid === theirs.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
