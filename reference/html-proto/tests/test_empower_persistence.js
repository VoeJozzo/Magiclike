// §3.8 empower — the two fragile seams the addressing-shape investigation left
// in place (positional + remap is net-neutral vs identity addressing; see
// docs/GODOT-QA-TODO.md). They had no direct coverage; this locks them:
//   1. RUN.load backfills missing empowerRolls ONCE, deterministically, and is
//      idempotent on reload — so a buffed stat can't flicker between sessions.
//   2. remapEmpowerRollForStaple keeps a BASE card's empower roll pointing at the
//      BASE effect after a staple prepends its own triggers/abilities/effects.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== RUN.load backfills a missing empowerRoll once + idempotently ===');
(() => {
  // A save with an empower sticker but NO recorded roll (legacy shape).
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    version: SAVE_VERSION,
    runState: { slots: [{ tplId: 'divination', stickers: ['empower'] }], gameNum: 1, active: true },
  }));
  const ok = RUN.load();
  check('load succeeded', ok === true);
  const stateAfter = JSON.parse(localStorage.getItem(SAVE_KEY)).runState;
  const slot = stateAfter.slots[0];
  check('empowerRolls backfilled to match empower-sticker count (1)',
    Array.isArray(slot.empowerRolls) && slot.empowerRolls.length === 1,
    JSON.stringify(slot.empowerRolls));
  const roll = slot.empowerRolls[0];
  check('backfilled roll is a valid pointer (has a field)', !!roll && typeof roll.field === 'string', JSON.stringify(roll));
  // The persisted roll must survive a second load unchanged — no re-roll, no
  // duplicate. (This is the anti-flicker guarantee.)
  const snapshot = JSON.stringify(roll);
  RUN.load();
  const reloaded = JSON.parse(localStorage.getItem(SAVE_KEY)).runState.slots[0];
  check('reload does NOT add a second roll (idempotent)', reloaded.empowerRolls.length === 1, 'len=' + reloaded.empowerRolls.length);
  check('reload keeps the SAME roll (stable, no re-roll)', JSON.stringify(reloaded.empowerRolls[0]) === snapshot,
    snapshot + ' vs ' + JSON.stringify(reloaded.empowerRolls[0]));
  RUN.clearSave();
})();

console.log('\n=== remapEmpowerRollForStaple keeps a base roll on the base effect ===');
(() => {
  // creature+creature: staple's triggers/abilities are merged BEFORE the base's,
  // so a base roll's subIdx must shift forward by the count merged ahead of it.
  const trigRoll = { location: 'triggers', subIdx: 0, effIdx: 0, field: 'amount' };
  const r1 = remapEmpowerRollForStaple(trigRoll, true, true, true, 0, 2, 0);
  check('creature+creature trigger roll: subIdx += priorMergedTriggerCount (0→2)',
    r1.subIdx === 2 && r1.effIdx === 0 && r1.location === 'triggers', JSON.stringify(r1));

  const abilRoll = { location: 'abilities', subIdx: 0, effIdx: 1, field: 'amount' };
  const r2 = remapEmpowerRollForStaple(abilRoll, true, true, true, 0, 0, 3);
  check('creature+creature ability roll: subIdx += priorMergedAbilityCount (0→3)',
    r2.subIdx === 3 && r2.effIdx === 1 && r2.location === 'abilities', JSON.stringify(r2));

  const effRollCC = { location: 'effects', subIdx: null, effIdx: 0, field: 'amount' };
  const r3 = remapEmpowerRollForStaple(effRollCC, true, true, true, 5, 0, 0);
  check('creature+creature effects roll: unchanged (creatures merge via triggers/abilities)',
    r3.effIdx === 0 && r3.location === 'effects', JSON.stringify(r3));

  // spell+spell: on-cast effect arrays concatenate, base after staple, so a base
  // effects roll shifts by the staple's effect count.
  const effRollSS = { location: 'effects', subIdx: null, effIdx: 1, field: 'amount' };
  const r4 = remapEmpowerRollForStaple(effRollSS, false, false, false, 4, 0, 0);
  check('spell+spell effects roll: effIdx += priorMergedEffectCount (1→5)',
    r4.effIdx === 5 && r4.location === 'effects', JSON.stringify(r4));

  check('null roll passes through', remapEmpowerRollForStaple(null, true, true, true, 1, 1, 1) === null);

  // Pinning the real intent: a 2-effect staple spliced before a base, the base's
  // 1st effect (effIdx 0) ends up at index 2 — exactly countEffects of the staple.
  const stapleTpl = { effects: [{ kind: 'damage', amount: 1 }, { kind: 'gain_life', amount: 1 }] };
  const baseRoll = { location: 'effects', subIdx: null, effIdx: 0, field: 'amount' };
  const remapped = remapEmpowerRollForStaple(baseRoll, false, false, false, countEffects(stapleTpl), 0, 0);
  check('end-to-end: base effIdx 0 shifts by staple countEffects (2)', remapped.effIdx === 2, JSON.stringify(remapped));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
