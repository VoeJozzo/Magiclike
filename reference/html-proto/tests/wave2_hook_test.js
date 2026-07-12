// Wave 2 static spell riders ("Spells you cast also …" — applySpellRiders).
// The settled semantics under test (docs/plans/plan-pool-waves.md):
//   - riders apply AFTER the spell's own effects (resolution-time: the pump
//     lands before the rider reads the board — no cast-time timing trap)
//   - per-target, with scope filters (all/creature/your-creature/self)
//   - targets that died during resolution are skipped
//   - fizzled spells apply no riders; creature casts never do
//   - spell_filter.has_effect gates riders to matching spells
// Synthetic rider cards mirror the four Wave 2 customers' exact shapes.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9700;
function mk(tplId, controller, extra) {
  const base = CARDS[tplId] ? JSON.parse(JSON.stringify(CARDS[tplId])) : {};
  const inst = Object.assign(base, extra || {});
  return Object.assign(inst, {
    iid: nextIid++, tplId: inst.tplId || tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
    grantedBy: new Map(), eotGrants: [], typeGrants: [],
  });
}
function drain(G) {
  let safety = 80;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget
          || (G.forcedDiscard && G.forcedDiscard.remaining > 0)) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
function freshGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('forest'), colors: ['G'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];
  return G;
}

// Synthetic rider bodies (the four customers' shapes)
const SAPLING = { tplId: 'test_sapling', name: 'Test Sapling', cost: { G: 1, C: 1 }, types: ['Creature', 'Elf', 'Druid'], power: 1, toughness: 2,
  spell_riders: [{ rider_scope: 'your_creature_targets', effects: [{ kind: 'pump', duration: 'permanent', power: 1, toughness: 1 }] }] };
const METAMAGUS = { tplId: 'test_metamagus', name: 'Test Metamagus', cost: { R: 1, G: 1, C: 1 }, types: ['Creature', 'Elemental', 'Shaman'], power: 2, toughness: 2,
  spell_riders: [{ rider_scope: 'all_targets', effects: [{ kind: 'damage', amount: 1 }] }] };
const CHANTER = { tplId: 'test_chanter', name: 'Test Chanter', cost: { W: 1, C: 2 }, types: ['Creature', 'Human', 'Cleric'], power: 2, toughness: 3,
  spell_riders: [{ rider_scope: 'creature_targets', effects: [{ kind: 'grant_keyword', keyword: 'vigilance', duration: 'eot' }] }] };
const COLOSSUS = { tplId: 'test_colossus', name: 'Test Colossus', cost: { R: 1, G: 1, C: 1 }, types: ['Creature', 'Elemental'], power: 2, toughness: 3,
  spell_riders: [{ spell_filter: { has_effect: 'damage' }, rider_scope: 'self', effects: [{ kind: 'pump', duration: 'permanent', power: 1, toughness: 1, scope: 'self' }] }] };

function cast(G, tplId, targets) {
  // Drains can cascade phases; re-open a clean main phase per cast so every
  // cast is legal and no assertion passes vacuously off a rejected action.
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const spell = mk(tplId, 'you');
  G.you.hand.push(spell);
  const act = { type: 'castSpell', cardIid: spell.iid };
  if (targets) act.targets = targets;
  const ok = ENGINE.executeAction('you', act);
  drain(G);
  return { spell, ok };
}

console.log('=== riders fire AFTER the spell: giant_growth pump lands, then the counter ===');
(() => {
  const G = freshGame();
  const sap = mk(null, 'you', JSON.parse(JSON.stringify(SAPLING)));
  const bear = mk('goblin_raider', 'you');
  G.you.battlefield.push(sap, bear);
  cast(G, 'giant_growth', [{ kind: 'creature', iid: bear.iid }]);
  const [p, t] = ENGINE.getStats(bear);
  check('raider = base 2/1 +3/+3 eot +1/+1 permanent = 6/5', p === 6 && t === 5, p + '/' + t);
})();

console.log('\n=== your_creature_targets scope: their creature gets NO counter (roots_and_branches split) ===');
(() => {
  const G = freshGame();
  const sap = mk(null, 'you', JSON.parse(JSON.stringify(SAPLING)));
  const mine = mk('goblin_raider', 'you');
  const theirs = mk('hill_giant', 'opp');
  G.you.battlefield.push(sap, mine);
  G.opp.battlefield.push(theirs);
  cast(G, 'roots_and_branches', [{ kind: 'creature', iid: theirs.iid }, { kind: 'creature', iid: mine.iid }]);
  const [mp, mt] = ENGINE.getStats(mine);
  const [tp, tt] = ENGINE.getStats(theirs);
  check('my pumped raider got the counter (2/1 +1/+1 eot +1/+1 perm = 4/3)', mp === 4 && mt === 3, mp + '/' + mt);
  check('their tapped giant did NOT (still 3/3... base)', tp === 3 && tt === 3, tp + '/' + tt);
  check('their giant is tapped (spell worked)', theirs.tapped === true);
})();

console.log('\n=== all_targets scope: player targets get pinged too; dead targets skipped ===');
(() => {
  const G = freshGame();
  const meta = mk(null, 'you', JSON.parse(JSON.stringify(METAMAGUS)));
  G.you.battlefield.push(meta);
  const oppLife = G.opp.life;
  cast(G, 'lightning_bolt', [{ kind: 'player', who: 'opp' }]);
  check('bolt at face: 3 + 1 rider = opp lost 4', G.opp.life === oppLife - 4, oppLife + ' -> ' + G.opp.life);
  // Dead-target skip: bolt kills a 2/1; the rider must not throw or double-kill.
  const chump = mk('goblin_raider', 'opp');
  G.opp.battlefield.push(chump);
  const r = cast(G, 'lightning_bolt', [{ kind: 'creature', iid: chump.iid }]);
  check('second bolt cast was accepted (not vacuous)', r.ok === true);
  check('bolted 2/1 died; rider skipped the corpse without crashing',
    G.opp.graveyard.some(c => c.iid === chump.iid));
})();

console.log('\n=== spell_filter.has_effect: Colossus grows on damage sorceries only ===');
(() => {
  const G = freshGame();
  const col = mk(null, 'you', JSON.parse(JSON.stringify(COLOSSUS)));
  G.you.battlefield.push(col);
  let r = cast(G, 'lightning_bolt', [{ kind: 'player', who: 'opp' }]);
  let [p, t] = ENGINE.getStats(col);
  check('bolt (damage sorcery) grew it: 3/4', r.ok === true && p === 3 && t === 4, p + '/' + t);
  const lib = mk('swamp', 'you'); G.you.library = [lib];
  r = cast(G, 'healing_light', [{ kind: 'player', who: 'you' }]);
  [p, t] = ENGINE.getStats(col);
  check('non-damage sorcery resolved and did NOT grow it (still 3/4)', r.ok === true && p === 3 && t === 4,
    'ok=' + r.ok + ' ' + p + '/' + t);
  // Creature cast: rider path structurally unreachable.
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const body = mk('goblin_raider', 'you');
  G.you.hand.push(body);
  const bodyOk = ENGINE.executeAction('you', { type: 'castSpell', cardIid: body.iid });
  drain(G);
  [p, t] = ENGINE.getStats(col);
  check('creature cast resolved and did NOT grow it (still 3/4)', bodyOk === true && p === 3 && t === 4,
    'ok=' + bodyOk + ' ' + p + '/' + t);
})();

console.log('\n=== creature_targets scope: vigilance to each creature it targets, incl. theirs ===');
(() => {
  const G = freshGame();
  const chant = mk(null, 'you', JSON.parse(JSON.stringify(CHANTER)));
  const mine = mk('goblin_raider', 'you');
  G.you.battlefield.push(chant, mine);
  cast(G, 'giant_growth', [{ kind: 'creature', iid: mine.iid }]);
  check('targeted creature gained vigilance (eot)', (mine.keywords || []).includes('vigilance')
    || (mine.eotGrants || []).some(g => g && (g.keyword === 'vigilance' || g === 'vigilance')),
    JSON.stringify({ kw: mine.keywords, eot: mine.eotGrants }));
})();

console.log('\n=== fizzled spell applies NO riders ===');
(() => {
  // The AI side auto-passes, so a YOU-cast spell resolves synchronously —
  // the response window only exists when the HUMAN holds priority. So: the
  // rider card belongs to OPP, OPP casts bolt at MY creature, the engine
  // pauses for my response, and I kill my own creature so the bolt fizzles.
  const G = freshGame();
  const col = mk(null, 'opp', JSON.parse(JSON.stringify(COLOSSUS)));
  G.opp.battlefield.push(col);
  const mine = mk('goblin_raider', 'you');
  G.you.battlefield.push(mine);
  setup.startMainPhase('opp');
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  // The human must HOLD a legal response or the engine auto-passes the
  // window — give 'you' a flash Doom Blade and use it as the real response.
  const doom = mk('doom_blade', 'you');
  G.you.hand.push(doom);
  const bolt = mk('lightning_bolt', 'opp');
  G.opp.hand.push(bolt);
  const ok = ENGINE.executeAction('opp', { type: 'castSpell', cardIid: bolt.iid, targets: [{ kind: 'creature', iid: mine.iid }] });
  check('opp bolt is on the stack awaiting my response', ok === true && G.stack.length === 1,
    'ok=' + ok + ' stack=' + G.stack.length);
  const ok2 = ENGINE.executeAction('you', { type: 'castSpell', cardIid: doom.iid, targets: [{ kind: 'creature', iid: mine.iid }] });
  check('I doom-bladed my own raider in response', ok2 === true, String(ok2));
  drain(G);
  const [p, t] = ENGINE.getStats(col);
  check('opp colossus did not grow off the fizzled bolt (2/3)', p === 2 && t === 3, p + '/' + t);
})();

console.log('\n=== generated text: the four shipping phrasings ===');
(() => {
  const texts = [
    [SAPLING, 'Spells you cast that target creatures you control also put a +1/+1 counter on them.'],
    [METAMAGUS, 'Spells you cast also deal 1 damage to their targets.'],
    [CHANTER, 'Spells you cast also grant vigilance to each creature they target until end of turn.'],
    [COLOSSUS, 'Sorceries you cast that deal damage also put a +1/+1 counter on Test Colossus.'],
  ];
  for (const [tpl, want] of texts) {
    const got = describeCardText(tpl);
    check(tpl.name + ' text', got.includes(want), got.replace(/\n/g, ' | '));
  }
})();

console.log('\n=== boot validation: bad rider scope / filter key warn; good shapes pass ===');
(() => {
  const bad = { tplId: 'test_bad_rider', name: 'Bad', types: ['Creature'], cost: { G: 1 }, power: 1, toughness: 1,
    spell_riders: [{ rider_scope: 'everything', spell_filter: { colour: 'R' }, effects: [{ kind: 'damage', amount: 1 }] }] };
  const res = ENGINE.validateAllCardEffects({ test_bad_rider: bad });
  check('bad scope caught', res.schemaErrors.some(e => e.includes('rider_scope')), JSON.stringify(res.schemaErrors));
  check('bad filter key caught', res.unknownFilterKeys.some(e => e.includes('colour')), JSON.stringify(res.unknownFilterKeys));
  const good = ENGINE.validateAllCardEffects({ test_sapling: SAPLING, test_colossus: COLOSSUS });
  check('shipping shapes validate clean',
    good.schemaErrors.length === 0 && good.unknownFilterKeys.length === 0 && good.unknownKinds.length === 0,
    JSON.stringify(good));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exitCode = fail ? 1 : 0;
