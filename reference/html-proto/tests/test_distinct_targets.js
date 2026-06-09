// `distinct_targets` opt-in: a two-creature spell whose two slots must name
// DIFFERENT creatures. Roots and Branches / Sword and Sorcery carry the flag (so
// their text reads "...another target creature"); Twin Strike / Branching Bolt
// deliberately do NOT (they stay permissive — you may stack both halves on one
// creature).
//
// NOTE: Roots and Branches / Sword and Sorcery are also CONTROLLER-gated (tap an
// opponent's creature, buff your own). Cross-controller slots are inherently
// distinct, so on those two cards the controller split co-enforces the rule and
// the pure distinct behavior can't be isolated on them. The distinct rule itself
// is therefore pinned on a SYNTHETIC same-controller card (the "two target
// creatures you control ..." shape — both slots self, where controller can't imply
// distinctness). This pins:
//   1. text — "another" appears iff the card is flagged;
//   2. legality — controller-gated cards take a distinct opp×self pair; the
//      synthetic same-controller card rejects same-creature-in-both-slots;
//   3. enumeration — getLegalActions emits only valid combos (no same-target);
//   4. castability — a controller-gated card needs a creature on each side.

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
  // The controller filters render into the text too (an opponent controls / you
  // control), so "another" rides alongside the controller clause.
  check('roots_and_branches reads "...an opponent controls. Another target creature you control..."',
    r('roots_and_branches') === 'Tap target creature an opponent controls. Another target creature you control gets +1/+1 until end of turn.',
    r('roots_and_branches'));
  check('sword_and_sorcery reads "...Tap another target creature an opponent controls."',
    r('sword_and_sorcery') === 'Target creature you control gets +2/+2 until end of turn. Tap another target creature an opponent controls.',
    r('sword_and_sorcery'));
  check('twin_strike stays repeated (no "another")', !/another/i.test(r('twin_strike')), r('twin_strike'));
  check('branching_bolt stays repeated (no "another")', !/another/i.test(r('branching_bolt')), r('branching_bolt'));
})();

console.log('\n=== legality: controller-gated cards take a distinct opp×self pair; permissive cards stack ===');
(() => {
  // Roots and Branches / Sword and Sorcery are CONTROLLER-gated, so their two slots
  // are inherently cross-controller (and thus distinct). Feed one creature per side
  // and build each slot's target from its declared controller filter.
  const pairFor = (id, youC, oppC) => CARDS[id].target_slots.map(s =>
    (s.filter && s.filter.controller === 'opp') ? t(oppC) : t(youC));
  for (const id of ['roots_and_branches', 'sword_and_sorcery']) {
    const G = newGame();
    const spell = mk(id, 'you'); G.you.hand.push(spell);
    const youC = mk('savannah_lions', 'you'); const oppC = mk('savannah_lions', 'opp');
    G.you.battlefield.push(youC); G.opp.battlefield.push(oppC);
    const base = { type: 'castSpell', cardIid: spell.iid };
    check(id + ' distinct opp×self cast is legal',
      ENGINE.isLegalAction('you', { ...base, targets: pairFor(id, youC, oppC) }) === true);
    // Same creature in both slots can't be made legal — one slot wants the other
    // controller, so a same-side pair fails the controller filter.
    check(id + ' same-creature-both-slots cast is rejected',
      ENGINE.isLegalAction('you', { ...base, targets: [t(youC), t(youC)] }) === false);
  }
  // Permissive cards (no distinct flag): two of your own creatures; same-target OK.
  for (const id of ['twin_strike', 'branching_bolt']) {
    const G = newGame();
    const spell = mk(id, 'you'); G.you.hand.push(spell);
    const a = mk('savannah_lions', 'you'); const b = mk('savannah_lions', 'you');
    G.you.battlefield.push(a, b);
    const base = { type: 'castSpell', cardIid: spell.iid };
    check(id + ' distinct two-target cast is legal',
      ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(b)] }) === true);
    check(id + ' same-target cast is allowed',
      ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(a)] }) === true);
  }
})();

console.log('\n=== distinct_targets in isolation: two DIFFERENT creatures you control (the reusable shape) ===');
(() => {
  // No SHIPPING card needs distinct WITHOUT controller-gating today, but the rule
  // exists for the "two target creatures you control ..." shape — both slots self,
  // so the controller split can't imply distinctness and distinct_targets does the
  // real work. Synthesize it from Twin Strike (two self-slots) + the flag.
  const G = newGame();
  const spell = mk('twin_strike', 'you'); spell.distinct_targets = true;
  G.you.hand.push(spell);
  const a = mk('savannah_lions', 'you'); const b = mk('savannah_lions', 'you');
  G.you.battlefield.push(a, b);
  const base = { type: 'castSpell', cardIid: spell.iid };
  check('synthetic distinct (both self): two different creatures is legal',
    ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(b)] }) === true);
  check('synthetic distinct (both self): same creature is REJECTED by the distinct rule',
    ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(a)] }) === false);
})();

console.log('\n=== real instantiation path: ENGINE.makeCard carries the flag (cast-enforcement regression) ===');
(() => {
  // The REAL game builds cards through ENGINE.makeCard — a whitelist copy. A prior
  // bug omitted distinct_targets from that whitelist, so the live instance had no
  // flag and the forbidden same-target cast was ALLOWED in-game while clone-based
  // tests stayed green. Pin the real path: the flag survives makeCard, and the
  // distinct rule it powers rejects a same-creature pick. (The two real cards are
  // controller-gated above, where distinct can't be isolated; here we re-flag a
  // makeCard instance with same-controller slots to exercise the rule on the real path.)
  for (const id of ['roots_and_branches', 'sword_and_sorcery']) {
    const made = ENGINE.makeCard(id, [], 0);
    check(id + ' makeCard instance carries distinct_targets',
      made.distinct_targets === true, JSON.stringify(made.distinct_targets));
  }
  const G = newGame();
  const spell = Object.assign(ENGINE.makeCard('twin_strike', [], 0), {
    distinct_targets: true, controller: 'you', owner: 'you',
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
  });
  G.you.hand.push(spell);
  const a = mk('savannah_lions', 'you'); const b = mk('savannah_lions', 'you');
  G.you.battlefield.push(a, b);
  const base = { type: 'castSpell', cardIid: spell.iid };
  check('(makeCard) synthetic distinct two-target cast is legal',
    ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(b)] }) === true, 'diff');
  check('(makeCard) synthetic distinct same-target cast is REJECTED',
    ENGINE.isLegalAction('you', { ...base, targets: [t(a), t(a)] }) === false, 'same');
})();

console.log('\n=== getLegalActions: controller-gated card enumerates only valid opp×self combos ===');
(() => {
  // Roots and Branches: slot0 wants an opponent creature, slot1 your own. One
  // creature per side → exactly one legal assignment, and it is distinct.
  const G = newGame();
  const spell = mk('roots_and_branches', 'you'); G.you.hand.push(spell);
  G.you.battlefield.push(mk('savannah_lions', 'you'));
  G.opp.battlefield.push(mk('savannah_lions', 'opp'));
  const acts = ENGINE.getLegalActions('you')
    .filter(x => x.type === 'castSpell' && x.cardIid === spell.iid);
  const sameCombos = acts.filter(x => x.targets && x.targets[0] && x.targets[1]
    && x.targets[0].iid === x.targets[1].iid).length;
  check('roots_and_branches enumerates one distinct opp×self combo',
    acts.length === 1 && sameCombos === 0, 'combos=' + acts.length + ' same=' + sameCombos);
})();

console.log('\n=== getLegalActions: a permissive card emits all combos incl. same-target ===');
(() => {
  const G = newGame();
  const spell = mk('twin_strike', 'you'); G.you.hand.push(spell);
  G.you.battlefield.push(mk('savannah_lions', 'you'), mk('savannah_lions', 'you'));
  const acts = ENGINE.getLegalActions('you')
    .filter(x => x.type === 'castSpell' && x.cardIid === spell.iid);
  const sameCombos = acts.filter(x => x.targets && x.targets[0] && x.targets[1]
    && x.targets[0].iid === x.targets[1].iid).length;
  check('twin_strike enumerates all combos (same-target included)',
    acts.length === 4 && sameCombos === 2, 'combos=' + acts.length + ' same=' + sameCombos);
})();

console.log('\n=== castability: a controller-gated card needs a creature on EACH side ===');
(() => {
  const G = newGame();
  const spell = mk('roots_and_branches', 'you'); G.you.hand.push(spell);
  G.you.battlefield.push(mk('savannah_lions', 'you')); // no opponent creature
  const castable = ENGINE.getLegalActions('you')
    .some(x => x.type === 'castSpell' && x.cardIid === spell.iid);
  check('roots_and_branches with no opponent creature is UNCASTABLE', castable === false, 'castable=' + castable);
})();

console.log('\n=== castability: a permissive card casts with even one creature ===');
(() => {
  // Twin Strike isn't distinct — one creature suffices (stack both pumps on it).
  const G = newGame();
  const spell = mk('twin_strike', 'you'); G.you.hand.push(spell);
  G.you.battlefield.push(mk('savannah_lions', 'you'));
  const castable = ENGINE.getLegalActions('you')
    .some(x => x.type === 'castSpell' && x.cardIid === spell.iid);
  check('twin_strike with one creature is castable', castable === true, 'castable=' + castable);
})();

console.log('\n=== stapled distinct card carries its rule onto the ETB ===');
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

console.log('\n=== regression guard: makeCard preserves EVERY card-level targeting flag for ALL templates ===');
(() => {
  // The cast-enforcement bug existed because makeCard copies card-level fields
  // through an explicit whitelist, and a newly-added flag (distinct_targets) was
  // left off it — silently dropped on the real game path while clone-based tests
  // (JSON.parse(JSON.stringify(...))) stayed green. Guard the whole CLASS, not
  // just the two cards: every template that declares one of these card-level
  // targeting flags must have it survive ENGINE.makeCard. When you add a NEW
  // card-level targeting flag, add it to makeCard's instance whitelist AND here.
  const TARGETING_FLAGS = ['target', 'target_filter', 'target_slots', 'distinct_targets'];
  const present = v => Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== null && v !== false && v !== '');
  const dropped = [];
  for (const id of Object.keys(CARDS)) {
    let made;
    try { made = ENGINE.makeCard(id); }
    catch (e) { dropped.push(id + ': makeCard threw (' + e.message + ')'); continue; }
    for (const f of TARGETING_FLAGS) {
      if (present(CARDS[id][f]) && !present(made[f])) dropped.push(id + '.' + f);
    }
  }
  check('makeCard preserves all declared card-level targeting flags across every template',
    dropped.length === 0,
    dropped.length ? dropped.slice(0, 10).join(', ') : 'all ' + Object.keys(CARDS).length + ' templates OK');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
