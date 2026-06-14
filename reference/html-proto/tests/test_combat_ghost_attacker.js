// Audit fix A2-3 — ghost attacker via bounce + re-cast.
//
// Cast arrivals do NOT re-mint iids (only the move_card/flicker path does),
// and before this fix nothing pruned `G.attackers` / `G.blockers` when a
// creature left the battlefield. So a declared attacker bounced to hand in
// the COMBAT_BLOCK window and flash-re-cast re-matched its stale
// `G.attackers` entry and dealt combat damage while summoning-sick,
// untapped, and never re-declared (canon §801: attackers are declared by
// tapping in step 505; §901.1: sick creatures can't attack without haste).
//
// The fix (packet option A): one `removeFromCombat(iid)` concept, called
// from the unified leave-battlefield funnel — the creature is crossed off
// the attacker list (and its block entries retired) the moment it leaves.
//
// This file pins:
//   1. the ghost-attack line, end-to-end through real actions:
//      declare attacker -> opp declares no blocks -> bounce the attacker
//      (Unsummon) -> flash-re-cast it -> pass to damage -> NO damage dealt
//   2. structural: the bounced creature is pruned from G.attackers
//   3. guard (green before AND after): a BLOCKER killed in the block window
//      does not un-block its attacker — the attacker stays blocked and
//      deals no face damage (MTG 510.1c "blocked stays blocked")
//
// Note: 'you' keeps untapped lands on the battlefield so the engine's
// auto-pass fast-path (hasNoAction) doesn't fast-forward the combat's
// priority rounds before the test can act in them.

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
// Untapped lands keep hasNoAction() false while a castable spell is in hand,
// so the auto-pass fast-path can't consume the combat priority rounds.
function giveLands(G, who, tplIds) {
  for (const tplId of tplIds) {
    const l = mk(tplId, who);
    G[who].battlefield.push(l);
  }
}
function floatMana(G, who) {
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
}
// Pass priority with whoever the engine expects until `done()` or safety.
function passUntil(G, done, max) {
  let safety = max || 30;
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

if (!VANILLA || !CARDS['unsummon'] || !CARDS['lightning_bolt'] || !CARDS['plains']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A2-3: bounce + flash re-cast must not ghost-attack ===');
  {
    const G = newGame();
    // A: a flash 2/2 so it can be re-cast in the COMBAT_BLOCK window.
    const A = mk(VANILLA, 'you');
    A.keywords = ['flash']; A.power = 2; A.toughness = 2; A.sick = false;
    G.you.battlefield.push(A);
    // Afford Unsummon ({U}) and the re-cast ({B}{B}{3}) from real lands.
    giveLands(G, 'you', ['island', 'island', 'swamp', 'swamp', 'swamp', 'swamp', 'swamp']);
    const bounce = mk('unsummon', 'you');
    G.you.hand.push(bounce);
    readyMain(G, 'you');
    // Anchor the defender's life BEFORE combat: with no blocks and the
    // attacker bounced mid-combat, NOTHING may hit the face this turn.
    // (Pre-fix, the ghost attack resolves atomically inside the re-cast's
    // resolution pass chain, so a later baseline would read post-damage.)
    const oppLifeAtStart = G.opp.life;

    // March the real machine to COMBAT_ATTACK and declare A.
    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    check('reached COMBAT_ATTACK', G.phase === 'COMBAT_ATTACK', 'phase=' + G.phase);
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [A.iid] });
    check('A is a declared attacker', G.attackers.includes(A.iid),
      'attackers=' + JSON.stringify(G.attackers));

    // Pass to the COMBAT_BLOCK window; the empty-board defender auto-declares
    // no blocks, and the block-window priority round opens.
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && G.blockersDeclared, 10);
    check('block window reached (no blocks declared)',
      G.phase === 'COMBAT_BLOCK' && G.blockersDeclared, 'phase=' + G.phase);

    // Bounce our own declared attacker (Unsummon, flash).
    floatMana(G, 'you');
    const okBounce = ENGINE.executeAction('you', {
      type: 'castSpell', cardIid: bounce.iid,
      targets: [{ kind: 'creature', iid: A.iid }],
    });
    check('Unsummon cast on the attacker', !!okBounce, 'returned=' + okBounce);
    passUntil(G, () => G.you.hand.some(c => c.iid === A.iid), 10);
    check('A bounced to hand with the SAME iid',
      G.you.hand.some(c => c.iid === A.iid));
    check('A2-3: leaving the battlefield pruned A from G.attackers',
      !G.attackers.includes(A.iid), 'attackers=' + JSON.stringify(G.attackers));

    // Flash-re-cast A in the same block window.
    floatMana(G, 'you');
    const okRecast = ENGINE.executeAction('you', { type: 'castSpell', cardIid: A.iid });
    check('A flash-re-cast from hand', !!okRecast, 'returned=' + okRecast);
    passUntil(G, () => G.you.battlefield.some(c => c.iid === A.iid), 10);
    const back = G.you.battlefield.find(c => c.iid === A.iid);
    check('A is back on the battlefield (cast path keeps the iid)', !!back);
    check('A is summoning-sick after the re-cast', back && back.sick === true);
    check('A2-3: the re-cast creature is NOT in G.attackers',
      !G.attackers.includes(A.iid), 'attackers=' + JSON.stringify(G.attackers));

    // Pass through combat damage. A was never (re-)declared: no damage.
    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('A2-3: NO ghost combat damage was dealt',
      G.opp.life === oppLifeAtStart,
      'life ' + oppLifeAtStart + ' -> ' + G.opp.life);
  }

  console.log('\n=== guard: killing a BLOCKER does not un-block the attacker ===');
  {
    const G = newGame();
    const atk = mk(VANILLA, 'you');
    atk.power = 2; atk.toughness = 2; atk.sick = false;
    G.you.battlefield.push(atk);
    giveLands(G, 'you', ['mountain', 'mountain']);   // afford the bolt ({R})
    const blk = mk(VANILLA, 'opp');
    blk.power = 1; blk.toughness = 1; blk.sick = false;
    G.opp.battlefield.push(blk);
    const bolt = mk('lightning_bolt', 'you');
    G.you.hand.push(bolt);
    readyMain(G, 'you');
    const oppLifeAtStart = G.opp.life;

    passUntil(G, () => G.phase === 'COMBAT_ATTACK');
    ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [atk.iid] });
    check('attacker declared', G.attackers.includes(atk.iid));
    // The defender has an eligible blocker, so the machine waits for the
    // real declaration.
    passUntil(G, () => G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared, 10);
    const okBlock = ENGINE.executeAction('opp', {
      type: 'declareBlockers', blockMap: new Map([[blk.iid, atk.iid]]),
    });
    check('blocker declared', !!okBlock && G.blockers.get(blk.iid) === atk.iid);

    // Kill the blocker in the block-window priority round.
    floatMana(G, 'you');
    const okBolt = ENGINE.executeAction('you', {
      type: 'castSpell', cardIid: bolt.iid,
      targets: [{ kind: 'creature', iid: blk.iid }],
    });
    check('bolt cast on the blocker', !!okBolt, 'returned=' + okBolt);
    passUntil(G, () => G.opp.graveyard.some(c => c.iid === blk.iid), 10);
    check('the blocker died pre-damage',
      G.opp.graveyard.some(c => c.iid === blk.iid));

    passUntil(G, () => G.phase === 'MAIN2' || G.gameOver, 40);
    check('combat completed (reached MAIN2)', G.phase === 'MAIN2', 'phase=' + G.phase);
    check('510.1c: the attacker stayed blocked — no face damage',
      G.opp.life === oppLifeAtStart,
      'life ' + oppLifeAtStart + ' -> ' + G.opp.life);
    check('the attacker survived (nothing dealt damage to it)',
      G.you.battlefield.some(c => c.iid === atk.iid));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
