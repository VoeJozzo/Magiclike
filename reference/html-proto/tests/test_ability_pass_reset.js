// Audit fix A1-1 leg 2 — a NON-MANA ability activation resets the priority
// pass tracker (Joe-approved, PR #98 round 3), so a stale pre-activation
// pass can never close the round with no response window.
//
// REWRITTEN for A3-2 (stackable infrastructure): non-mana activations now
// push a real kind:'ability' STACK ENTRY, and the §603 reset rides the push
// itself (exactly like a spell cast / trigger push) — the leg-2 protection
// is structural now. The response window moved EARLIER: the opponent
// responds before the ability resolves, not merely before the round closes
// over its result. These arms pin the protection in its new shape. (The
// original inline reset survives verbatim in the dormant stackable:false
// arm of doActivateAbility.)
//
// Arms:
//   1. KEY (main phase) — you pass, opp pings with Prodigal Sorcerer: the
//      ping goes ON THE STACK, your stale pass is wiped, you hold priority
//      and can respond BEFORE the ping resolves; after you pass it resolves
//      and you get a fresh round on the post-resolution board.
//   2. KEY (block window — where it bites hardest) — blocks are in, the
//      attacker passes, the defender pings an attacker: the entry stacks,
//      the attacker regains priority BEFORE the ping resolves and again
//      before combat damage.
//   3. Guard — MANA abilities stay exempt (Llanowar Elves resolves inline,
//      no stack entry, no reset; the stale pass still counts and the turn
//      sails on). Pins the §705 fast path's scope.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9800;
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
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs
        && (!c.keywords || c.keywords.length === 0)) return id;
  }
  return null;
})();

if (!VANILLA || !CARDS['prodigal_sorcerer'] || !CARDS['llanowar_elves'] || !CARDS['lightning_bolt']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A1-1 leg 2 KEY: opp ability after your pass does NOT close the main phase ===');
  (() => {
    const G = newGame();
    const myCreature = mk(VANILLA, 'you');
    myCreature.power = 2; myCreature.toughness = 2;
    G.you.battlefield.push(myCreature);
    const sorcerer = mk('prodigal_sorcerer', 'opp');
    G.opp.battlefield.push(sorcerer);
    const bolt = mk('lightning_bolt', 'you');
    G.you.hand.push(bolt);
    // You pass on the empty board; opp now holds priority.
    ENGINE.executeAction('you', { type: 'pass' });
    check('setup: opp holds priority after your pass',
      ENGINE.expectedActor() === 'opp', 'actor=' + ENGINE.expectedActor());
    // Opp pings your creature with the Sorcerer. A3-2: the ping takes a
    // kind:'ability' stack entry; the push wipes your stale pass.
    ENGINE.executeAction('opp', { type: 'activateAbility', cardIid: sorcerer.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: myCreature.iid, label: myCreature.name }] });
    check('the ping is ON THE STACK (not yet resolved)',
      G.stack.length === 1 && G.stack[0].kind === 'ability'
      && myCreature.damage === 0,
      'stack=' + G.stack.length + ' damage=' + myCreature.damage);
    check('KEY: phase is still MAIN1 (your stale pass did not close the round)',
      G.phase === 'MAIN1', 'phase=' + G.phase);
    check('KEY: you hold priority over the pending ability',
      ENGINE.expectedActor() === 'you' && G.phase === 'MAIN1',
      'actor=' + ENGINE.expectedActor() + ' phase=' + G.phase);
    check('KEY: you can actually respond (bolt is castable)',
      ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: bolt.iid,
        targets: [{ kind: 'creature', iid: sorcerer.iid, label: sorcerer.name }] }));
    // Decline: the ping resolves (opp auto-passes after you — sorcerer
    // tapped, nothing else to do), and you get a FRESH round on the
    // post-resolution board.
    ENGINE.executeAction('you', { type: 'pass' });
    check('the ping resolved after the window (your creature has 1 damage)',
      myCreature.damage === 1 && G.stack.length === 0,
      'damage=' + myCreature.damage + ' stack=' + G.stack.length);
    check('KEY: you hold priority again on the post-resolution board (round reset)',
      ENGINE.expectedActor() === 'you' && G.phase === 'MAIN1',
      'actor=' + ENGINE.expectedActor() + ' phase=' + G.phase);
    // Round still closes normally once you genuinely pass again (no stall).
    ENGINE.executeAction('you', { type: 'pass' });
    check('after your fresh pass the phase advances (no infinite round)',
      G.phase !== 'MAIN1', 'phase=' + G.phase);
  })();

  console.log('\n=== A1-1 leg 2 KEY: defender ability in the block window does not skip the attacker\'s response ===');
  (() => {
    const G = newGame();
    const atk = mk(VANILLA, 'you');
    atk.power = 2; atk.toughness = 2;
    G.you.battlefield.push(atk);
    // Real untapped lands: floating mana empties at every phase boundary
    // (setPhase, B2), so combat-phase castability must come from the board.
    G.you.battlefield.push(mk('mountain', 'you'), mk('mountain', 'you'));
    const sorcerer = mk('prodigal_sorcerer', 'opp');
    G.opp.battlefield.push(sorcerer);
    const bolt = mk('lightning_bolt', 'you');
    G.you.hand.push(bolt);
    // Drive the real machine to the post-blocks priority round.
    ENGINE.executeAction('you', { type: 'pass' });           // MAIN1: you pass
    ENGINE.executeAction('opp', { type: 'pass' });           // MAIN1 closes
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
    ENGINE.executeAction('you', { type: 'pass' });           // post-attack window
    ENGINE.executeAction('opp', { type: 'pass' });
    ENGINE.executeAction('opp', { type: 'declareBlockers', blockMap: new Map() });
    check('setup: post-blocks priority round open in COMBAT_BLOCK',
      G.phase === 'COMBAT_BLOCK' && ENGINE.expectedActor() === 'you',
      'phase=' + G.phase + ' actor=' + ENGINE.expectedActor());
    ENGINE.executeAction('you', { type: 'pass' });           // attacker passes
    // Defender pings the attacker before damage. A3-2: the ping stacks; the
    // attacker gets a window BEFORE it even resolves.
    ENGINE.executeAction('opp', { type: 'activateAbility', cardIid: sorcerer.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: atk.iid, label: atk.name }] });
    check('the ping is ON THE STACK (attacker undamaged so far)',
      G.stack.length === 1 && G.stack[0].kind === 'ability' && atk.damage === 0,
      'stack=' + G.stack.length + ' damage=' + atk.damage);
    check('KEY: still in COMBAT_BLOCK (damage has not resolved out from under you)',
      G.phase === 'COMBAT_BLOCK', 'phase=' + G.phase);
    check('KEY: attacker holds priority and can respond before the ping resolves',
      ENGINE.expectedActor() === 'you'
      && ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: bolt.iid,
        targets: [{ kind: 'creature', iid: sorcerer.iid, label: sorcerer.name }] }),
      'actor=' + ENGINE.expectedActor());
    // Decline: the ping resolves (opp auto-passes — sorcerer tapped).
    ENGINE.executeAction('you', { type: 'pass' });
    check('the ping resolved on the attacker', atk.damage === 1, 'damage=' + atk.damage);
    check('KEY: STILL no combat damage (fresh round on the post-resolution board)',
      G.phase === 'COMBAT_BLOCK' && G.opp.life === 20,
      'phase=' + G.phase + ' opp.life=' + G.opp.life);
    check('KEY: attacker can still respond before damage',
      ENGINE.expectedActor() === 'you'
      && ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: bolt.iid,
        targets: [{ kind: 'creature', iid: sorcerer.iid, label: sorcerer.name }] }),
      'actor=' + ENGINE.expectedActor());
    // Decline; combat damage then resolves normally.
    ENGINE.executeAction('you', { type: 'pass' });
    check('after the fresh pass, combat damage resolves (unblocked attacker connects)',
      G.opp.life === 18, 'opp.life=' + G.opp.life);
  })();

  console.log('\n=== guard: MANA abilities stay exempt (no pass-tracker reset) ===');
  (() => {
    const G = newGame();
    // Both sides get a Sorcerer purely as an auto-pass anchor (an untapped
    // non-mana ability keeps hasNoAction false, so the engine parks
    // deterministically instead of cascading through random decks).
    const myAnchor = mk(VANILLA, 'you');
    G.you.battlefield.push(myAnchor);
    const oppAnchor = mk('prodigal_sorcerer', 'opp');
    const elves = mk('llanowar_elves', 'opp');
    G.opp.battlefield.push(oppAnchor, elves);
    ENGINE.executeAction('you', { type: 'pass' });           // you pass; opp holds
    check('setup: opp holds priority after your pass',
      ENGINE.expectedActor() === 'opp' && G.phase === 'MAIN1',
      'actor=' + ENGINE.expectedActor() + ' phase=' + G.phase);
    // Opp taps the Elves (mana ability): no reset — your stale pass stays
    // on the books.
    ENGINE.executeAction('opp', { type: 'activateAbility', cardIid: elves.iid, abilityIdx: 0 });
    check('mana ability resolved (opp has {G} floating)',
      G.opp.mana.G === 1, 'G=' + G.opp.mana.G);
    check('still MAIN1, opp still holds (a mana tap closes nothing by itself)',
      G.phase === 'MAIN1' && ENGINE.expectedActor() === 'opp',
      'phase=' + G.phase + ' actor=' + ENGINE.expectedActor());
    // Opp now passes: with the mana exemption, your stale pass still counts —
    // the round closes immediately (no re-offer to you in MAIN1).
    ENGINE.executeAction('opp', { type: 'pass' });
    check('mana ability did not reset the round: opp\'s pass closed MAIN1 on your stale pass',
      G.phase === 'COMBAT_ATTACK', 'phase=' + G.phase);
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
