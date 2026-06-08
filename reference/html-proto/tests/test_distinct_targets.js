// `distinct_targets` opt-in: a two-creature spell whose two slots must name
// DIFFERENT creatures. Roots and Branches / Sword and Sorcery carry the flag (so
// their text honestly reads "...another target creature" and you can't tap+pump
// the same creature); Twin Strike / Branching Bolt deliberately do NOT (they stay
// permissive — you may stack both halves on one creature). This pins:
//   1. text — "another" appears iff the card is flagged;
//   2. legality — same-creature-in-both-slots is rejected iff flagged;
//   3. enumeration — getLegalActions emits no same-target combo for a flagged card;
//   4. castability — a flagged card needs two distinct creatures in play.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 8200;
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
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  // Deterministic board: clear both battlefields so target enumeration only sees
  // the creatures this test adds.
  G.you.battlefield = []; G.opp.battlefield = [];
  return G;
}
const t = c => ({ kind: 'creature', iid: c.iid, label: c.name });

console.log('=== card data: the two flagged cards carry distinct_targets; the permissive two do not ===');
(() => {
  check('roots_and_branches has distinct_targets', CARDS.roots_and_branches.distinct_targets === true);
  check('sword_and_sorcery has distinct_targets', CARDS.sword_and_sorcery.distinct_targets === true);
  check('twin_strike does NOT', !CARDS.twin_strike.distinct_targets);
  check('branching_bolt does NOT', !CARDS.branching_bolt.distinct_targets);
})();

console.log('\n=== generated text: "another target creature" iff flagged ===');
(() => {
  const r = id => describeCardText(JSON.parse(JSON.stringify(CARDS[id])));
  check('roots_and_branches reads "...Another target creature..."',
    r('roots_and_branches') === 'Tap target creature. Another target creature gets +1/+1 until end of turn.',
    r('roots_and_branches'));
  check('sword_and_sorcery reads "...Tap another target creature."',
    r('sword_and_sorcery') === 'Target creature gets +2/+2 until end of turn. Tap another target creature.',
    r('sword_and_sorcery'));
  check('twin_strike stays repeated (no "another")', !/another/i.test(r('twin_strike')), r('twin_strike'));
  check('branching_bolt stays repeated (no "another")', !/another/i.test(r('branching_bolt')), r('branching_bolt'));
})();

console.log('\n=== legality: same creature in both slots ===');
(() => {
  for (const id of ['roots_and_branches', 'sword_and_sorcery', 'twin_strike', 'branching_bolt']) {
    const G = newGame();
    const spell = mk(id, 'you'); G.you.hand.push(spell);
    const a = mk('savannah_lions', 'you'); const b = mk('savannah_lions', 'you');
    G.you.battlefield.push(a, b);
    const base = { type: 'castSpell', cardIid: spell.iid };
    const same = ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(a)] });
    const diff = ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(b)] });
    const flagged = !!CARDS[id].distinct_targets;
    check(id + ' distinct two-target cast is legal', diff === true);
    check(id + ' same-target cast is ' + (flagged ? 'REJECTED' : 'allowed'),
      same === !flagged, 'same=' + same);
  }
})();

console.log('\n=== getLegalActions emits no same-target combo for a flagged card ===');
(() => {
  for (const id of ['roots_and_branches', 'twin_strike']) {
    const G = newGame();
    const spell = mk(id, 'you'); G.you.hand.push(spell);
    G.you.battlefield.push(mk('savannah_lions', 'you'), mk('savannah_lions', 'you'));
    const acts = ENGINE.getLegalActions('you')
      .filter(x => x.type === 'castSpell' && x.cardIid === spell.iid);
    const sameCombos = acts.filter(x => x.targets && x.targets[0] && x.targets[1]
      && x.targets[0].iid === x.targets[1].iid).length;
    const flagged = !!CARDS[id].distinct_targets;
    check(id + ' enumerates ' + (flagged ? 'ONLY distinct' : 'all') + ' combos',
      flagged ? (sameCombos === 0 && acts.length === 2) : (sameCombos === 2 && acts.length === 4),
      'combos=' + acts.length + ' same=' + sameCombos);
  }
})();

console.log('\n=== castability: a flagged card needs two distinct creatures ===');
(() => {
  for (const id of ['roots_and_branches', 'twin_strike']) {
    const G = newGame();
    const spell = mk(id, 'you'); G.you.hand.push(spell);
    G.you.battlefield.push(mk('savannah_lions', 'you')); // only ONE creature
    const castable = ENGINE.getLegalActions('you')
      .some(x => x.type === 'castSpell' && x.cardIid === spell.iid);
    const flagged = !!CARDS[id].distinct_targets;
    check(id + ' with one creature is ' + (flagged ? 'UNCASTABLE' : 'castable'),
      castable === !flagged, 'castable=' + castable);
  }
})();

console.log('\n=== stapled distinct card carries its rule onto the ETB (Slice 5) ===');
(() => {
  // Stapling a distinct_targets spell onto a permanent turns it into an ETB
  // trigger; the rule now rides along (the trigger path enforces cross-slot
  // constraints), so the stapled card keeps "another target creature" semantics
  // instead of silently going permissive.
  const staple = ENGINE.makeCard('clockwork_beetle', [], 0, null, null, null, ['roots_and_branches']);
  const etb = (staple.triggers || []).find(t => t.event === 'card_zone_change');
  check('staple ETB carries distinct_targets', !!etb && etb.distinct_targets === true,
    etb && JSON.stringify(etb.distinct_targets));
  const txt = describeCardText(staple);
  check('stapled card text reads "another target creature"', /another target creature/i.test(txt), txt);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
