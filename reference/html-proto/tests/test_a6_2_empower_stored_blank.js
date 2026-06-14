// Audit A6-2 (Joe ruled GO) — an empower sticker's target must be rolled ONCE
// and stay fixed. applyStickersToCard treated a stored BLANK roll (null —
// "rolled, nothing to empower") the same as NEVER-rolled and re-rolled a fresh
// random target on every makeCard. Harmless on a card that stays empty, but on
// the STAPLE path the blank survives the merge and the fresh roll lands on the
// combined card's real fields — a different random target each rebuild
// (save reloads, re-staples). Joe: "the empower stays pointing at the same number
// when stapled." Fix: distinguish null (stored blank, respected) from undefined
// (never rolled, falls back + persists); plus stop the clone {...null} laundering
// that turned a null into a truthy {}.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
// The merged card's only empowerable field is the stapled spell's ETB damage.
function trigDamage(card) {
  for (const t of (card.triggers || [])) {
    for (const e of (t.effects || [])) {
      if (e.kind === 'damage' && typeof e.amount === 'number') return e.amount;
    }
  }
  return null;
}
const LAND = 'mountain';     // a base with NO empowerable field of its own
const SPELL = 'lava_spike';  // damage 3 spell staple (its damage is the only target)

console.log('=== A6-2: a stored-blank empower roll stays blank (no wandering re-roll) ===');
(() => {
  // Base had nothing to empower at roll time -> slot stored null. After a staple
  // adds an empowerable field, a rebuild must NOT start empowering it.
  const c1 = ENGINE.makeCard(LAND, ['empower'], 0, [null], null, null, [SPELL], []);
  check('stored-null empower does NOT bump the staple damage (stays 3)', trigDamage(c1) === 3, 'dmg=' + trigDamage(c1));
  const c2 = ENGINE.makeCard(LAND, ['empower'], 0, [null], null, null, [SPELL], []);
  check('and it is STABLE across rebuilds (still 3)', trigDamage(c2) === 3, 'dmg=' + trigDamage(c2));
})();

console.log('\n=== control: a stored REAL roll still applies (no over-correction) ===');
(() => {
  const realRoll = { location: 'triggers', subIdx: 0, effIdx: 0, field: 'amount' };
  const c = ENGINE.makeCard(LAND, ['empower'], 0, [realRoll], null, null, [SPELL], []);
  check('a real stored roll empowers the ETB damage (3 -> 4)', trigDamage(c) === 4, 'dmg=' + trigDamage(c));
})();

console.log('\n=== A6-2: cloning preserves a stored-null roll as null (no {...null} laundering) ===');
(() => {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(5).fill('mountain'), colors: ['R'] }, null);
  const slots = RUN.getSlots();
  slots[0].stickers = ['empower'];
  slots[0].empowerRolls = [null];   // a stored blank
  RUN.recordResult('you', [], []);
  const reward = RUN.getReward();
  reward.candidates = [{ kind: 'clone', slotIdx: 0 }];
  RUN.pickRewardCandidate(0);
  const clone = RUN.getSlots()[1];
  check('clone slot inserted', clone && clone.tplId === 'mountain', clone ? clone.tplId : 'none');
  check('clone preserves the null roll (not a laundered {})',
    clone && Array.isArray(clone.empowerRolls) && clone.empowerRolls[0] === null,
    clone ? JSON.stringify(clone.empowerRolls) : 'none');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
