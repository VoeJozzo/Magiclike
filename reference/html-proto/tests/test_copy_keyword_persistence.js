// A copy's keywords are part of the copied identity and persist like
// template keywords. become_copy_of materializes the copied template's
// keywords onto the instance; intrinsicKeywords() must resolve them through
// card.copyOf (not CARDS[card.tplId]), since both the CLEANUP keyword rebuild
// and claimableKeywords' trophy check read through it. This file pins:
//   1. intrinsicKeywords on a live copy = the COPIED template's keywords
//      (+ subtype-implied), not the base's;
//   2. the real CLEANUP: copy + an EOT haste grant crosses end of turn →
//      flying kept, flash NOT resurrected, haste correctly dropped;
//   3. the leave-play revert contract: a bounced copy re-derives the
//      false_witness base identity (flash back, flying gone).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('island'), colors: ['U'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  return G;
}
function place(who, tpl) {
  const G = ENGINE.state();
  const c = ENGINE.makeCard(tpl); c.sick = false;
  G[who].battlefield.push(c); return c;
}
// Drive the turn to its end so CLEANUP runs. Both players pass at every
// window; no attackers, so combat fast-forwards.
function endTurn(G) {
  const startTurn = G.turn;
  let safety = 200;
  while (G.turn === startTurn && safety-- > 0) {
    const w = ENGINE.expectedActor();
    if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
  return safety > 0;
}
// Abyss Lurker is a flying demon.
function makeCopy(G) {
  const witness = place('you', 'false_witness');
  const lurker = place('opp', 'abyss_lurker');
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'The False Witness',
      sourceIid: witness.iid, sourceCard: witness },
    { kind: 'become_copy_of', keep_subtypes: ['Insect', 'Shapeshifter'] },
    { kind: 'creature', iid: lurker.iid });
  return { witness, lurker };
}

console.log('=== 1. intrinsicKeywords reads the COPIED identity while copyOf is set ===');
(() => {
  const G = newGame();
  const { witness } = makeCopy(G);
  check('setup: witness became the copy', witness.copyOf === 'abyss_lurker',
    'copyOf=' + witness.copyOf);
  check('setup: materialized keywords are the lurker\'s', witness.keywords.includes('flying'));
  const intr = ENGINE.intrinsicKeywords(witness);
  check('intrinsicKeywords includes copied flying', intr.includes('flying'),
    'intrinsic=' + JSON.stringify(intr));
  check('intrinsicKeywords does NOT include base flash', !intr.includes('flash'),
    'intrinsic=' + JSON.stringify(intr));
})();

console.log('\n=== 2. real CLEANUP: EOT grant on a live copy → copied keywords survive ===');
(() => {
  const G = newGame();
  const { witness } = makeCopy(G);
  // Any EOT keyword grant arms the cleanup rebuild.
  ENGINE.applyEffect({ controller: 'you', sourceName: "Predator's Speed", sourceIid: -11 },
    { kind: 'grant_keyword', keyword: 'haste', duration: 'eot' },
    { kind: 'creature', iid: witness.iid });
  check('setup: copy has flying + EOT haste',
    witness.keywords.includes('flying') && witness.keywords.includes('haste'));
  const ended = endTurn(G);
  check('turn crossed cleanup', ended && !G.gameOver);
  check('copy still flies after cleanup (was: keywords rebuilt as ["flash"])',
    witness.keywords.includes('flying'), 'keywords=' + JSON.stringify(witness.keywords));
  check('base flash NOT resurrected', !witness.keywords.includes('flash'),
    'keywords=' + JSON.stringify(witness.keywords));
  check('the EOT haste itself correctly dropped', !witness.keywords.includes('haste'));
  check('still the copy in name and identity', witness.copyOf === 'abyss_lurker'
    && witness.name === CARDS.abyss_lurker.name);
})();

console.log('\n=== 3. leave-play revert unchanged: a bounced copy is the base witness again ===');
(() => {
  const G = newGame();
  const { witness } = makeCopy(G);
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Unsummon', sourceIid: -12 },
    { kind: 'affect_creature', severity: 'bounce' },
    { kind: 'creature', iid: witness.iid });
  const inHand = G.you.hand.find(c => c.iid === witness.iid);
  check('copy bounced to its owner\'s hand', !!inHand);
  check('reverted to base identity (flash back, flying gone)',
    inHand && inHand.keywords.includes('flash') && !inHand.keywords.includes('flying'),
    inHand && JSON.stringify(inHand.keywords));
  check('copyOf cleared on leave-play', inHand && !inHand.copyOf);
  check('name reverted', inHand && inHand.name === CARDS.false_witness.name);
})();

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
