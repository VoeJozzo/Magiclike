// Audit A5-1 + A5-3 — the Stapler's combat-state transfer was side-blind.
//
// A5-1: when you spliced the OPPONENT'S declared attacker onto YOUR creature,
// the merged base inherited the attacker role with no controller check. Since
// the defender is fixed at opp(activePlayer) and the opponent is active during
// their own combat, your merged creature attacked YOU.
//
// A5-3: when the absorbed staple was a BLOCKER, the transfer deleted its
// G.blockers entry outright (no tombstone) if the base was already a blocker —
// flipping the staple's attacker to UNblocked so it hit your face.
//
// Fix: route the staple through removeFromCombat (the one "leaves combat"
// funnel) and re-assign a role to the base ONLY when it is valid for
// resultOwner (attack iff resultOwner === activePlayer; block iff
// resultOwner === opp(activePlayer)).
//
// The combat STATE is set up directly (deterministic) — the engine's
// settle/auto-pass timing around held priority is not what's under test; the
// post-splice attacker/blocker bookkeeping is. Each scenario also resolves
// combat to MAIN2 to confirm the downstream life outcome the state implies.

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
    permPower: 0, permTou: 0, damagedBySources: new Set(), keywords: [],
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
// Pose the game mid-combat with declared attackers/blockers, deterministically.
function poseCombat(G, activePlayer, attackers, blockers) {
  G.activePlayer = activePlayer; G.priorityHolder = activePlayer;
  G.phase = 'COMBAT_BLOCK'; G.stack = []; G.gameOver = false;
  G.priority = { passes: new Set() };
  G.attackers = attackers.slice();
  G.attackersDeclared = true;
  G.blockers = new Map(blockers || []);
  G.blockersDeclared = true;
}
function splice(caster, baseIid, stapleIid) {
  ENGINE.applyEffect(
    { controller: caster, sourceName: 'Stapler', sourceIid: -1,
      allTargets: [{ kind: 'permanent', iid: baseIid }, { kind: 'permanent', iid: stapleIid }] },
    { kind: 'apply_in_game_splice' }, null);
}
function resolveToMain2(G) {
  let s = 60;
  while (G.phase !== 'MAIN2' && !G.gameOver && s-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
function gone(G, iid) {
  return !G.you.battlefield.some(c => c.iid === iid) && !G.opp.battlefield.some(c => c.iid === iid);
}

const baseTpl = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
const stapleTpl = Object.keys(CARDS).find(k => k !== baseTpl && hasType(CARDS[k], 'Creature') && isSpliceableStaple(k));
const VANILLA = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && !CARDS[k].triggers && !CARDS[k].abilities && !CARDS[k].static_buffs);

if (!baseTpl || !stapleTpl || !VANILLA) {
  console.log('  (required spliceable/vanilla templates missing -- cannot run)');
  fail++;
} else {

console.log('=== A5-1: splicing the OPP attacker onto your creature must NOT make it attack YOU ===');
{
  const G = newGame();
  const B = mk(baseTpl, 'you');   B.power = 2; B.toughness = 2;            // your non-attacking base
  G.you.battlefield.push(B);
  const OA = mk(stapleTpl, 'opp'); OA.power = 3; OA.toughness = 3;          // opp's declared attacker
  G.opp.battlefield.push(OA);
  const youLife0 = G.you.life, oppLife0 = G.opp.life;
  poseCombat(G, 'opp', [OA.iid], []);                                      // opp's combat, OA attacking

  splice('you', B.iid, OA.iid);   // staple opp's attacker onto your base
  check('A5-1: your base did NOT inherit the cross-side attack role',
    !G.attackers.includes(B.iid), 'attackers=' + JSON.stringify(G.attackers));
  check('the absorbed opp attacker left combat (pruned)', !G.attackers.includes(OA.iid));
  check('no attackers remain — you cannot be self-damaged', G.attackers.length === 0,
    'attackers=' + JSON.stringify(G.attackers));
  check('the absorbed opp attacker is consumed (off both battlefields)', gone(G, OA.iid));

  resolveToMain2(G);
  check('combat resolved to MAIN2', G.phase === 'MAIN2', 'phase=' + G.phase);
  check('A5-1: you took NO self-damage', G.you.life === youLife0, 'life ' + youLife0 + ' -> ' + G.you.life);
  check('opp untouched', G.opp.life === oppLife0, 'life ' + oppLife0 + ' -> ' + G.opp.life);
}

console.log('\n=== A5-1 guard: SAME-side attacker inheritance still works (no over-correction) ===');
{
  const G = newGame();
  const B = mk(baseTpl, 'you');   B.power = 2; B.toughness = 2;            // your non-attacking base
  const YA = mk(stapleTpl, 'you'); YA.power = 2; YA.toughness = 2;          // your declared attacker
  G.you.battlefield.push(B, YA);
  const youLife0 = G.you.life, oppLife0 = G.opp.life;
  poseCombat(G, 'you', [YA.iid], []);                                      // YOUR combat, YA attacking

  splice('you', B.iid, YA.iid);   // staple your attacker onto your base
  check('merged base INHERITS the same-side attack role', G.attackers.includes(B.iid),
    'attackers=' + JSON.stringify(G.attackers));
  check('absorbed attacker pruned (one creature, one role)', !G.attackers.includes(YA.iid));
  check('exactly one attacker remains', G.attackers.length === 1, 'attackers=' + JSON.stringify(G.attackers));

  resolveToMain2(G);
  check('opp took combat damage from the merged attacker', G.opp.life < oppLife0, 'life ' + oppLife0 + ' -> ' + G.opp.life);
  check('you took no damage', G.you.life === youLife0, 'life ' + youLife0 + ' -> ' + G.you.life);
}

console.log('\n=== A5-3: merging one of your blockers onto another keeps BOTH attackers blocked ===');
{
  const G = newGame();
  const bA = mk(baseTpl, 'you');   bA.power = 0; bA.toughness = 3;
  const bB = mk(stapleTpl, 'you'); bB.power = 0; bB.toughness = 3;
  G.you.battlefield.push(bA, bB);
  const atk1 = mk(VANILLA, 'opp'); atk1.power = 2; atk1.toughness = 2;
  const atk2 = mk(VANILLA, 'opp'); atk2.power = 2; atk2.toughness = 2;
  G.opp.battlefield.push(atk1, atk2);
  const youLife0 = G.you.life;
  poseCombat(G, 'opp', [atk1.iid, atk2.iid], [[bA.iid, atk1.iid], [bB.iid, atk2.iid]]);

  splice('you', bA.iid, bB.iid);   // merge blocker bB onto blocker bA
  check('A5-3: atk2 (bB was blocking it) stays blocked via tombstone',
    G.blockers.get('gone:' + bB.iid) === atk2.iid,
    'blockers=' + JSON.stringify([...G.blockers.entries()]));
  check('bA still blocks atk1', G.blockers.get(bA.iid) === atk1.iid);
  check('no LIVE blocker entry for the consumed bB', !G.blockers.has(bB.iid));
  check('bB consumed', gone(G, bB.iid));

  resolveToMain2(G);
  check('A5-3: you took NO face damage (both attackers stayed blocked)',
    G.you.life === youLife0, 'life ' + youLife0 + ' -> ' + G.you.life);
}

console.log('\n=== A5-1: splicing your BLOCKED attacker onto a non-attacker keeps it BLOCKED ===');
{
  // Review regression: when the staple is a blocked attacker and the base
  // inherits the attack role, the staple's blockers must re-point at the base —
  // otherwise the merged attacker reads unblocked and hits face.
  const G = newGame();
  const B = mk(baseTpl, 'you');   B.power = 2; B.toughness = 2;            // your non-attacking base
  const S = mk(stapleTpl, 'you'); S.power = 3; S.toughness = 3;            // your attacker (blocked)
  G.you.battlefield.push(B, S);
  const D = mk(VANILLA, 'opp');   D.power = 0; D.toughness = 4;            // opp blocker on S
  G.opp.battlefield.push(D);
  const oppLife0 = G.opp.life;
  poseCombat(G, 'you', [S.iid], [[D.iid, S.iid]]);                        // your combat, D blocks S

  splice('you', B.iid, S.iid);    // staple your blocked attacker onto your base
  check('merged base inherited the attack role', G.attackers.includes(B.iid), 'attackers=' + JSON.stringify(G.attackers));
  check('A5-1: the blocker re-points at the merged base (still blocked)',
    G.blockers.get(D.iid) === B.iid, 'blockers=' + JSON.stringify([...G.blockers.entries()]));
  check('S consumed', gone(G, S.iid));

  resolveToMain2(G);
  check('A5-1: opp took NO face damage (merged attacker stayed blocked)',
    G.opp.life === oppLife0, 'life ' + oppLife0 + ' -> ' + G.opp.life);
}

console.log('\n=== A5-3: inheriting a block onto an idle base leaves NO stale tombstone ===');
{
  const G = newGame();
  const bA = mk(baseTpl, 'you');   bA.power = 0; bA.toughness = 3;        // base, NOT blocking
  const bB = mk(stapleTpl, 'you'); bB.power = 0; bB.toughness = 3;        // staple, blocking atk1
  G.you.battlefield.push(bA, bB);
  const atk1 = mk(VANILLA, 'opp'); atk1.power = 2; atk1.toughness = 2;
  G.opp.battlefield.push(atk1);
  const youLife0 = G.you.life;
  poseCombat(G, 'opp', [atk1.iid], [[bB.iid, atk1.iid]]);                 // opp combat, bB blocks atk1

  splice('you', bA.iid, bB.iid);  // base inherits bB's block
  check('base inherited the block (bA blocks atk1)', G.blockers.get(bA.iid) === atk1.iid,
    'blockers=' + JSON.stringify([...G.blockers.entries()]));
  check('no stale gone:bB tombstone left behind', !G.blockers.has('gone:' + bB.iid),
    'blockers=' + JSON.stringify([...G.blockers.entries()]));

  resolveToMain2(G);
  check('atk1 stayed blocked — no face damage', G.you.life === youLife0, 'life ' + youLife0 + ' -> ' + G.you.life);
}

}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
