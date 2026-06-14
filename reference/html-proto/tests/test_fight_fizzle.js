// Audit A4-3 — fight effects must FIZZLE, not retarget, when a chosen
// participant is gone at resolution (§704/§1006 fizzle semantics, PR #111's
// framework; Joe's ruling PR #98: "Definitely not intentional, fix this").
//
// resolveFightOperands has two passes: pass 1 resolves {slot:N} operands (the
// creatures the caster CHOSE), pass 2 fills empty slots with the controller's
// highest-power unused creature. Pass 2 exists for {select:...} computed
// operands ("your strongest creature fights..."); before this fix it ALSO
// filled a {slot} operand whose chosen creature died in response — silently
// conscripting the caster's own next-biggest creature as the replacement
// combatant (friendly fire instead of fizzle, right after printing the fizzle
// log). This file pins:
//   1. Prey Upon shape ({slot},{slot}): the enemy target dies in response →
//      the fight fizzles, NO friendly fire on the caster's other creature;
//   2. same with the CASTER's chosen creature dead → fizzle (no substitute);
//   3. Beast's Fury shape ({select},{slot}): dead slot target → fizzle, no
//      second friendly recruited as the punching bag;
//   4. the {select} auto-pick itself still works when the slot target is live.

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
function kill(who, c) {
  const bf = G[who].battlefield;
  const idx = bf.findIndex(x => x.iid === c.iid);
  if (idx >= 0) bf.splice(idx, 1);
  G[who].graveyard.push(c);
}

console.log('=== 1. Prey Upon: enemy target dies in response → fizzle, no friendly fire ===');
(() => {
  clearBoards();
  const fighter  = place('you', 'goblin_raider', 2, 2);  // chosen slot-0 fighter
  const innocent = place('you', 'goblin_raider', 4, 4);  // the bystander pass 2 used to conscript
  const victim   = place('opp', 'goblin_raider', 3, 2);  // chosen slot-1 target
  const ctx = { controller: 'you', sourceName: 'Prey Upon', sourceIid: -1,
                allTargets: [tgt(fighter), tgt(victim)] };
  kill('opp', victim);  // dies in response, before the fight resolves
  ENGINE.applyEffect(ctx, { kind: 'fight', operands: [{ slot: 0 }, { slot: 1 }] }, null);
  check('chosen fighter took NO damage', fighter.damage === 0, 'damage=' + fighter.damage);
  check('innocent bystander took NO damage (was: conscripted as replacement)',
    innocent.damage === 0, 'damage=' + innocent.damage);
  check('both friendly creatures still on the battlefield',
    G.you.battlefield.length === 2);
})();

console.log('\n=== 2. caster\'s chosen creature dead → fizzle (no substitute fighter) ===');
(() => {
  clearBoards();
  const fighter  = place('you', 'goblin_raider', 2, 2);
  const innocent = place('you', 'goblin_raider', 4, 4);
  const victim   = place('opp', 'goblin_raider', 3, 2);
  const ctx = { controller: 'you', sourceName: 'Prey Upon', sourceIid: -1,
                allTargets: [tgt(fighter), tgt(victim)] };
  kill('you', fighter);  // our own pick is gone instead
  ENGINE.applyEffect(ctx, { kind: 'fight', operands: [{ slot: 0 }, { slot: 1 }] }, null);
  check('enemy target took NO damage (no substitute stepped in)',
    victim.damage === 0, 'damage=' + victim.damage);
  check('innocent bystander took NO damage', innocent.damage === 0, 'damage=' + innocent.damage);
})();

console.log('\n=== 3. Beast\'s Fury shape: dead slot target → fizzle, no second friendly recruited ===');
(() => {
  clearBoards();
  const big    = place('you', 'goblin_raider', 5, 5);
  const second = place('you', 'goblin_raider', 3, 3);
  const victim = place('opp', 'goblin_raider', 4, 4);
  const ctx = { controller: 'you', sourceName: "Beast's Fury", sourceIid: -1,
                allTargets: [tgt(victim)] };
  kill('opp', victim);
  ENGINE.applyEffect(ctx, { kind: 'fight',
    operands: [{ select: 'highest_power_yours' }, { slot: 0 }] }, null);
  check('the 5/5 took NO damage', big.damage === 0, 'damage=' + big.damage);
  check('the 3/3 was NOT recruited as the opposing combatant',
    second.damage === 0, 'damage=' + second.damage);
})();

console.log('\n=== 4. {select} auto-pick still works when the slot target is live ===');
(() => {
  clearBoards();
  const small  = place('you', 'goblin_raider', 1, 1);
  const big    = place('you', 'goblin_raider', 5, 5);
  const victim = place('opp', 'goblin_raider', 4, 4);
  const ctx = { controller: 'you', sourceName: "Beast's Fury", sourceIid: -1,
                allTargets: [tgt(victim)] };
  ENGINE.applyEffect(ctx, { kind: 'fight',
    operands: [{ select: 'highest_power_yours' }, { slot: 0 }] }, null);
  check('auto-picked the 5/5 → dealt 5 to the target', victim.damage === 5, 'damage=' + victim.damage);
  check('target dealt 4 back to the 5/5, not the 1/1',
    big.damage === 4 && small.damage === 0,
    'big=' + big.damage + ' small=' + small.damage);
})();

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
