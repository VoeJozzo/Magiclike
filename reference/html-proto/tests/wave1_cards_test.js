// Wave 1 cards (docs/plans/plan-pool-waves.md — Joe's verdicts 2026-07-07):
// gloomfang_leech, bloodtithe_collector, toll_of_secrets, grim_ferryman,
// ironbrand_marshal, rakdos_underboss, toll_of_silence, tideglass_broker.
// Plus the two primitives that shipped with them: the `another: true`
// source-exclusion target filter (ts* layer) and the life_changed DIRECTION
// SPLIT in the buckets extractor (is_life_loss → self_pain/opp_loss).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9500;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
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
  RUN.start({ cards: Array(12).fill('swamp'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  // Clear BOTH dealt hands: a stray opp hand + gifted mana lets the AI act
  // during drains and contaminate life totals (found the hard way).
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];
  return G;
}
const hitOpp = (G, n) => {
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test', sourceIid: 99002 },
    { kind: 'damage', amount: n }, { kind: 'player', who: 'opp' });
  drain(G);
};

console.log('=== gloomfang_leech: opp life LOSS grows it; gains and your losses do not ===');
(() => {
  const G = freshGame();
  const leech = mk('gloomfang_leech', 'you');
  G.you.battlefield.push(leech);
  hitOpp(G, 2);
  let [p, t] = ENGINE.getStats(leech);
  check('opp loses 2 life -> leech is 2/2', p === 2 && t === 2, p + '/' + t);
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test', sourceIid: 99002 },
    { kind: 'gain_life', amount: 2, scope: 'self' }, null);
  drain(G);
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test', sourceIid: 99003 },
    { kind: 'damage', amount: 2 }, { kind: 'player', who: 'you' });
  drain(G);
  [p, t] = ENGINE.getStats(leech);
  check('your lifegain + your life loss do not grow it', p === 2 && t === 2, p + '/' + t);
})();

console.log('\n=== bloodtithe_collector: opp life loss -> you gain 1; no loop with leech out ===');
(() => {
  const G = freshGame();
  const collector = mk('bloodtithe_collector', 'you');
  const leech = mk('gloomfang_leech', 'you');
  G.you.battlefield.push(collector, leech);
  const lifeBefore = G.you.life;
  hitOpp(G, 1);
  check('you gained exactly 1 (no retrigger loop)', G.you.life === lifeBefore + 1,
    lifeBefore + ' -> ' + G.you.life);
  const [p, t] = ENGINE.getStats(leech);
  check('leech grew once off the same event', p === 2 && t === 2, p + '/' + t);
})();

console.log('\n=== toll_of_secrets: YOUR discard drains; opp discard does not ===');
(() => {
  // Real path: activate merfolk_looter (draw 1, discard 1). The human-side
  // discard opens a forcedDiscard prompt — drain() services it via AI.decide.
  const G = freshGame();
  G.you.battlefield.push(mk('toll_of_secrets', 'you'));
  const looter = mk('merfolk_looter', 'you'); looter.sick = false;
  G.you.battlefield.push(looter);
  G.you.library = [mk('swamp', 'you')];
  G.you.hand.push(mk('swamp', 'you'));
  const oppLife = G.opp.life;
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: looter.iid, abilityIdx: 0 });
  drain(G);
  check('your loot-discard -> opp loses 1', G.opp.life === oppLife - 1, oppLife + ' -> ' + G.opp.life);
  // Opp-side discards auto-resolve (no prompt) and must NOT trigger your Toll.
  G.opp.hand.push(mk('mountain', 'opp'));
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test', sourceIid: 99005 },
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', amount: 1, scope: 'self' }, null);
  drain(G);
  check('opp discard does not re-trigger your Toll', G.opp.life === oppLife - 1,
    String(G.opp.life) + ', opp yard ' + G.opp.graveyard.length);
})();

console.log('\n=== grim_ferryman: {T}, sac a creature -> draw ===');
(() => {
  const G = freshGame();
  const ferry = mk('grim_ferryman', 'you');
  const fodder = mk('goblin_raider', 'you');
  G.you.battlefield.push(ferry, fodder);
  G.you.library = [mk('swamp', 'you')];
  const handBefore = G.you.hand.length;
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: ferry.iid, abilityIdx: 0, sacIid: fodder.iid });
  drain(G);
  check('drew a card', G.you.hand.length === handBefore + 1, handBefore + ' -> ' + G.you.hand.length);
  check('fodder is in the graveyard', G.you.graveyard.some(c => c.iid === fodder.iid));
  check('ferryman is tapped', ferry.tapped === true);
  const again = ENGINE.getLegalActions('you').filter(a =>
    a.type === 'activateAbility' && a.cardIid === ferry.iid);
  check('tapped ferryman cannot activate again', again.length === 0, String(again.length));
})();

console.log('\n=== ironbrand_marshal: artifact creatures +1/+1; others and himself unbuffed ===');
(() => {
  const G = freshGame();
  const marshal = mk('ironbrand_marshal', 'you');
  const construct = mk('alloy_construct', 'you');   // 2/2 Artifact Creature
  const raider = mk('goblin_raider', 'you');        // 2/1 non-artifact
  G.you.battlefield.push(marshal, construct, raider);
  const cs = ENGINE.getStats(construct), rs = ENGINE.getStats(raider), ms = ENGINE.getStats(marshal);
  check('alloy_construct is 3/3 under the marshal', cs[0] === 3 && cs[1] === 3, cs.join('/'));
  check('non-artifact raider stays 2/1', rs[0] === 2 && rs[1] === 1, rs.join('/'));
  check('marshal does not buff himself', ms[0] === 2 && ms[1] === 2, ms.join('/'));
})();

console.log('\n=== rakdos_underboss: +1/-1 anthem kills 1-toughness demons INTO his own drain ===');
(() => {
  const G = freshGame();
  const imp = mk('spiteful_imp', 'you');      // 2/1 Demon
  const fiend = mk('pit_fiend', 'you');       // 5/4 Demon
  G.you.battlefield.push(imp, fiend);
  const boss = mk('rakdos_underboss', 'you');
  G.you.hand.push(boss);
  const oppLife = G.opp.life, youLife = G.you.life;
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: boss.iid });
  drain(G);
  check('boss resolved onto the battlefield', G.you.battlefield.some(c => c.iid === boss.iid));
  check('2/1 imp died to the +1/-1 anthem (SBA)', G.you.graveyard.some(c => c.iid === imp.iid));
  const fs = ENGINE.getStats(G.you.battlefield.find(c => c.iid === fiend.iid));
  check('pit_fiend survives as 6/3', fs[0] === 6 && fs[1] === 3, fs.join('/'));
  // opp -2: the boss's drain (-1) AND the imp's own death rattle (-1) — the
  // imp's printed trigger, not a bug. you +1 from the drain alone.
  check('the imp death fed the drain (+ the imp own death rattle): opp -2, you +1',
    G.opp.life === oppLife - 2 && G.you.life === youLife + 1,
    'opp ' + oppLife + '->' + G.opp.life + ', you ' + youLife + '->' + G.you.life);
  const bs = ENGINE.getStats(G.you.battlefield.find(c => c.iid === boss.iid));
  check('boss does not shrink himself', bs[0] === 2 && bs[1] === 2, bs.join('/'));
  // His own death is a Demon dying — the drain fires on the way out.
  // Fresh game: part 1's cast advances priority/phase state, and a destroy
  // dropped into that mid-flight state let the drain loop walk into combat
  // (found the hard way: opp took pit_fiend damage on top of the drain).
  const G2 = freshGame();
  const boss2 = mk('rakdos_underboss', 'you');
  G2.you.battlefield.push(boss2);
  const o2 = G2.opp.life;
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Doom', sourceIid: 99006 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: boss2.iid });
  drain(G2);
  check('his own death drains too', G2.opp.life === o2 - 1, o2 + ' -> ' + G2.opp.life);
})();

console.log('\n=== toll_of_silence: counter target spell, its controller loses 2 ===');
(() => {
  const G = freshGame();
  setup.startMainPhase('opp');
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const bolt = mk('lightning_bolt', 'opp');
  G.opp.hand.push(bolt);
  const toll = mk('toll_of_silence', 'you');
  G.you.hand.push(toll);
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'player', who: 'you' }] });
  const oppLife = G.opp.life, youLife = G.you.life;
  const acts = ENGINE.getLegalActions('you').filter(a =>
    a.type === 'castSpell' && a.cardIid === toll.iid);
  check('toll_of_silence is castable at the stack spell (flash)', acts.length > 0, String(acts.length));
  if (acts.length) {
    ENGINE.executeAction('you', acts[0]);
    drain(G);
    check('bolt was countered (opp graveyard, you took no damage)',
      G.opp.graveyard.some(c => c.iid === bolt.iid) && G.you.life === youLife);
    check('its controller lost 2', G.opp.life === oppLife - 2, oppLife + ' -> ' + G.opp.life);
  }
})();

console.log('\n=== tideglass_broker: ETB blinks ANOTHER creature you control; alone it fizzles ===');
(() => {
  const G = freshGame();
  // 2/2 body with NON-lethal damage + tapped: both must clear on the blink.
  // (A 1-toughness body with damage dies to SBAs before the blink — bad fixture.)
  const cadet = mk('rakdos_cadet', 'you');
  cadet.damage = 1; cadet.tapped = true; cadet.sick = false;
  G.you.battlefield.push(cadet);
  const broker = mk('tideglass_broker', 'you');
  G.you.hand.push(broker);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: broker.iid });
  drain(G);
  const back = G.you.battlefield.find(c => c.tplId === 'rakdos_cadet');
  check('cadet is back on the battlefield after the blink', !!back);
  check('blink reset its state (damage cleared, untapped)',
    back && back.damage === 0 && back.tapped === false,
    back && ('dmg ' + back.damage + ' tapped ' + back.tapped));
  check('broker itself was never blinked (no self-loop)',
    G.you.battlefield.filter(c => c.tplId === 'tideglass_broker').length === 1);

  // Alone: the trigger must fizzle without crashing (the source is excluded).
  const G2 = freshGame();
  const solo = mk('tideglass_broker', 'you');
  G2.you.hand.push(solo);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: solo.iid });
  drain(G2);
  check('solo broker resolves; ETB fizzles with no legal target',
    G2.you.battlefield.some(c => c.iid === solo.iid));
})();

console.log('\n=== buckets extraction: Wave 1 vocabulary + the life_changed direction split ===');
(() => {
  BUCKETS._resetCacheForTest();
  const leech = BUCKETS.analyzeCard('gloomfang_leech');
  check('gloomfang WANTS opp_loss', leech.wants.opp_loss > 0, JSON.stringify(leech.wants));
  check('gloomfang does NOT want lifegain (direction split — the 23-false-edge bug)',
    !leech.wants.lifegain, JSON.stringify(leech.wants));
  const pridemate = BUCKETS.analyzeCard('ajanis_pridemate');
  check('pridemate still wants lifegain (gain branch unregressed)', pridemate.wants.lifegain > 0);
  const toll = BUCKETS.analyzeCard('toll_of_secrets');
  check('toll_of_secrets WANTS discard', toll.wants.discard > 0, JSON.stringify(toll.wants));
  const looter = BUCKETS.analyzeCard('merfolk_looter');
  check('merfolk_looter PROVIDES discard', looter.provides.discard > 0, JSON.stringify(looter.provides));
  const bolt = BUCKETS.analyzeCard('lightning_bolt');
  check('lightning_bolt PROVIDES opp_loss', bolt.provides.opp_loss > 0, JSON.stringify(bolt.provides));
  const construct = BUCKETS.analyzeCard('alloy_construct');
  check('alloy_construct PROVIDES sub:Artifact', construct.provides['sub:Artifact'] > 0);
  const marshal = BUCKETS.analyzeCard('ironbrand_marshal');
  check('ironbrand WANTS sub:Artifact', marshal.wants['sub:Artifact'] > 0);
  const charA = BUCKETS.analyzeCard('char');
  check('char PROVIDES self_pain (self-hit rider)', charA.provides.self_pain > 0);
  const e1 = BUCKETS.edgeBetween('ironbrand_marshal', 'alloy_construct');
  check('marshal <-> construct is a STRONG edge (recruit-grade)', e1.w >= 2, e1.w.toFixed(2));
  const e2 = BUCKETS.edgeBetween('gloomfang_leech', 'lightning_bolt');
  check('leech <-> bolt is a STRONG edge (recruit-grade)', e2.w >= 2, e2.w.toFixed(2));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exitCode = fail ? 1 : 0;
