// The False Witness — a Flash doppelganger. As it enters, it exiles target
// creature an opponent controls and becomes a copy of it (plus Insect
// Shapeshifter); when it leaves, the exiled card returns under its owner's
// control and the witness reverts to The False Witness.
//
// The copy is implemented as the engine's existing materialize-then-re-derive
// pattern (like keyword/type grants): become_copy_of writes the copied printed
// characteristics onto the instance, and resetInPlayState re-derives the base
// on EVERY leave path — so the revert is free and the witness's own leave
// trigger (on the base identity) is never clobbered by the copied triggers.
//
// Covers: flash timing; ETB exile+copy (stats/types/keywords + kept subtypes);
// copying a creature WITH a trigger (the leave-return still fires); the death
// path AND the bounce path (revert + return to owner); the AI copies the
// opponent's biggest threat and won't flash into an empty board.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 7400;
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
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
function freshGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('island'), colors: ['U'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.exile = [];
  return G;
}

console.log('=== boot + oracle text ===');
check('false_witness loaded', !!CARDS['false_witness']);
{
  const segs = describeCardSegments(CARDS['false_witness']);
  check('full card render shows Flash', /Flash/i.test(JSON.stringify(segs)));
  const rules = describeCardText(CARDS['false_witness']);
  check('oracle: exiles target opp creature + becomes a copy',
    /exile target creature an opponent controls/i.test(rules) && /becomes a copy/i.test(rules), rules);
  check('oracle: kept subtypes (Insect Shapeshifter) rider', /Insect Shapeshifter/.test(rules), rules);
  check('oracle: returns the exiled card to its owner on leave',
    /return the exiled card .* under its owner's control/i.test(rules), rules);
  check('no [become_copy_of] sentinel leaked', !/\[become_copy_of\]/.test(rules));
}

console.log('\n=== ETB exile + copy (stats / types / keywords + kept subtypes) ===');
(() => {
  const G = freshGame();
  const victim = mk('air_elemental', 'opp'); G.opp.battlefield.push(victim);  // 4/4 flying
  const vStats = ENGINE.getStats(victim);
  const witness = mk('false_witness', 'you'); G.you.hand.push(witness);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: witness.iid });
  drain(G);
  const w = G.you.battlefield.find(c => c.iid === witness.iid);
  check('witness resolved onto your battlefield', !!w);
  check('witness copied the name', w && w.name === 'Air Elemental', w && w.name);
  check('witness copied the stats', w && ENGINE.getStats(w).join('/') === vStats.join('/'),
    w && ENGINE.getStats(w).join('/'));
  check('witness copied the flying keyword', w && (w.keywords || []).includes('flying'));
  check('witness keeps Insect + Shapeshifter', w && hasType(w, 'Insect') && hasType(w, 'Shapeshifter'));
  check('witness is a Creature (governs as one)', w && hasType(w, 'Creature') && isPermanent(w));
  check('the target was exiled', !G.opp.battlefield.some(c => c.iid === victim.iid)
    && G.opp.exile.some(c => c.iid === victim.iid));
})();

console.log('\n=== copying a creature WITH a trigger — the leave-return still fires ===');
(() => {
  const G = freshGame();
  const victim = mk('blood_artist', 'opp');   // 0/1 with a dies trigger
  G.opp.battlefield.push(victim);
  const copiedTrigCount = (CARDS['blood_artist'].triggers || []).length;
  const witness = mk('false_witness', 'you'); G.you.hand.push(witness);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: witness.iid });
  drain(G);
  const w = G.you.battlefield.find(c => c.iid === witness.iid);
  check('witness became Blood Artist', w && w.name === 'Blood Artist', w && w.name);
  // It carries the copied trigger(s) AND its own base triggers (ETB + leave).
  check('witness has copied trigger(s) plus its own (leave survives the copy)',
    w && (w.triggers || []).length >= copiedTrigCount + 1,
    w && (w.triggers || []).length + ' triggers');
  // Kill it: it must revert AND return the exiled Blood Artist to the opponent.
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Kill', sourceIid: 99001 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: witness.iid });
  drain(G);
  const wGy = G.you.graveyard.find(c => c.iid === witness.iid);
  check('witness reverted to The False Witness in the graveyard', wGy && wGy.name === 'The False Witness',
    wGy && wGy.name);
  check('the exiled Blood Artist returned to the opponent (owner)',
    G.opp.battlefield.some(c => c.tplId === 'blood_artist') && !G.opp.exile.some(c => c.tplId === 'blood_artist'));
})();

console.log('\n=== bounce path: revert + return the original (a non-death leave) ===');
(() => {
  const G = freshGame();
  const victim = mk('grizzly_bears', 'opp'); G.opp.battlefield.push(victim);
  const witness = mk('false_witness', 'you'); G.you.hand.push(witness);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: witness.iid });
  drain(G);
  const w = G.you.battlefield.find(c => c.iid === witness.iid);
  check('witness copied Grizzly Bears', w && w.name === 'Grizzly Bears', w && w.name);
  // Bounce the witness to hand (battlefield -> hand leave path).
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Bounce', sourceIid: 99002 },
    { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' },
    { kind: 'creature', iid: witness.iid });
  drain(G);
  const inHand = G.you.hand.find(c => c.iid === witness.iid);
  check('witness is in hand and reverted to The False Witness',
    inHand && inHand.name === 'The False Witness' && inHand.power === 0 && inHand.toughness === 1,
    inHand && inHand.name + ' ' + inHand.power + '/' + inHand.toughness);
  check('the exiled Grizzly Bears returned to the opponent',
    G.opp.battlefield.some(c => c.tplId === 'grizzly_bears'));
})();

console.log('\n=== AI behavior: copies the biggest threat; no flash into an empty board ===');
(() => {
  const G = freshGame();
  // a weak 2/2, a 2/1, and a fat 4/4 flyer — the AI should copy the flyer.
  G.opp.battlefield.push(mk('grizzly_bears', 'opp'), mk('savannah_lions', 'opp'), mk('air_elemental', 'opp'));
  const witness = mk('false_witness', 'you'); G.you.hand.push(witness);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: witness.iid });
  drain(G);
  const w = G.you.battlefield.find(c => c.iid === witness.iid);
  check('AI copied the opponent’s strongest creature (Air Elemental)',
    w && w.name === 'Air Elemental', w && w.name);

  // Flash window: opp's END step, opp has a creature → AI flashes it in.
  const G2 = freshGame();
  G2.activePlayer = 'opp'; G2.priorityHolder = 'you'; G2.phase = 'END';
  G2.opp.battlefield.push(mk('air_elemental', 'opp'));
  const wit2 = mk('false_witness', 'you'); G2.you.hand.push(wit2);
  const a1 = AI.decide(G2, 'you');
  check('AI flashes the witness at the opponent’s end step (has a creature to copy)',
    a1 && a1.type === 'castSpell' && a1.cardIid === wit2.iid, a1 && a1.type);

  // Flash window with EMPTY opp board → AI must NOT flash (ETB would fizzle).
  const G3 = freshGame();
  G3.activePlayer = 'opp'; G3.priorityHolder = 'you'; G3.phase = 'END';
  const wit3 = mk('false_witness', 'you'); G3.you.hand.push(wit3);
  const a2 = AI.decide(G3, 'you');
  check('AI does NOT flash the witness into an empty board',
    !(a2 && a2.type === 'castSpell' && a2.cardIid === wit3.iid), a2 && a2.type);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
