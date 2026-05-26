// Composable predicates (Slice 2 / DIVERGENCE E2) — proto side.
// Covers the function-call parser, the evaluate() walker (all expression
// shapes), and each of the 12 atomic predicates against synthetic
// new-vocabulary events. These run in parallel with the legacy condId path;
// no card uses the new `condition` field yet, so the existing 482 assertions
// are unaffected (verified by run_all.js).
//
// Atomics read only specific fields, so synthetic ctx objects (not a started
// game) are sufficient and keep the unit tests deterministic. `state` is a
// plain {you:{...}, opp:{...}} stand-in — only lost_life_this_turn reads it.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
// Fresh synthetic engine-state stand-in.
function S(youLost, oppLost) {
  return { you: { lifeLostThisTurn: youLost || 0 }, opp: { lifeLostThisTurn: oppLost || 0 } };
}

// ── Parser: _parseCall / arg coercion ────────────────────────────────────
console.log('=== _parseCall ===');
(() => {
  const p = _parseCall('card_moves(battlefield, graveyard)');
  check('name parsed', p.name === 'card_moves', p.name);
  check('two string args', p.args.length === 2 && p.args[0] === 'battlefield' && p.args[1] === 'graveyard');

  const ws = _parseCall('card_moves( battlefield ,  graveyard )');
  check('whitespace tolerant', ws.args[0] === 'battlefield' && ws.args[1] === 'graveyard');

  const bare = _parseCall('this_card');
  check('no-paren bare name', bare.name === 'this_card' && bare.args.length === 0);

  const quoted = _parseCall('card_has_subtype("Beast Folk")');
  check('quoted arg keeps space, strips quotes', quoted.args[0] === 'Beast Folk', quoted.args[0]);

  const num = _parseCall('foo(3, 2.5, true, bar)');
  check('int coercion', num.args[0] === 3 && typeof num.args[0] === 'number');
  check('float coercion', num.args[1] === 2.5);
  check('bool coercion', num.args[2] === true);
  check('bare string stays string', num.args[3] === 'bar');

  const forcedStr = _parseCall('foo("3")');
  check('quoted "3" is string not int', forcedStr.args[0] === '3' && typeof forcedStr.args[0] === 'string');
})();

// ── evaluate() expression shapes ─────────────────────────────────────────
console.log('\n=== evaluateCondition shapes ===');
(() => {
  const source = { iid: 1 };
  const etbEvt = {
    kind: 'card_zone_change', subject_iid: 2,
    subject_card: { iid: 2, type: 'Creature', sub: ['Goblin'] },
    controller: 'you', from_zone: 'hand', to_zone: 'battlefield',
  };
  const ctx = { state: S(), source, event: etbEvt, who: 'you' };

  check('"" → true', evaluateCondition('', ctx) === true);
  check('null → true', evaluateCondition(null, ctx) === true);
  check('bare another_card → true', evaluateCondition('another_card', ctx) === true);
  check('call card_moves(anywhere, battlefield) → true',
    evaluateCondition('card_moves(anywhere, battlefield)', ctx) === true);
  check('call card_moves(battlefield, graveyard) → false',
    evaluateCondition('card_moves(battlefield, graveyard)', ctx) === false);

  check('array AND all-true → true',
    evaluateCondition(['another_card', 'card_is_creature', 'card_moves(anywhere, battlefield)'], ctx) === true);
  check('array AND one-false → false',
    evaluateCondition(['another_card', 'card_moves(battlefield, graveyard)'], ctx) === false);

  check('OR with one true → true',
    evaluateCondition({ op: 'or', terms: ['this_card', 'another_card'] }, ctx) === true);
  check('OR all false → false',
    evaluateCondition({ op: 'or', terms: ['this_card', 'card_moves(battlefield, graveyard)'] }, ctx) === false);

  check('NOT this_card → true (subject is another card)',
    evaluateCondition({ op: 'not', terms: ['this_card'] }, ctx) === true);
  check('explicit AND → true',
    evaluateCondition({ op: 'and', terms: ['another_card', 'card_is_creature'] }, ctx) === true);
  check('canonical {name,args} dict → true',
    evaluateCondition({ name: 'card_moves', args: ['anywhere', 'battlefield'] }, ctx) === true);
  check('malformed number expr → false', evaluateCondition(42, ctx) === false);
})();

// ── Atomic predicates against synthetic events ───────────────────────────
console.log('\n=== atomic predicates ===');
(() => {
  const source = { iid: 10 };

  const selfEvt = { subject_card: { iid: 10, type: 'Creature' } };
  const otherEvt = { subject_card: { iid: 11, type: 'Creature' } };
  const ctxSelf = { state: S(), source, event: selfEvt, who: 'you' };
  const ctxOther = { state: S(), source, event: otherEvt, who: 'you' };
  check('this_card true on self', ATOMIC_PREDICATES.this_card(ctxSelf) === true);
  check('this_card false on other', ATOMIC_PREDICATES.this_card(ctxOther) === false);
  check('another_card false on self', ATOMIC_PREDICATES.another_card(ctxSelf) === false);
  check('another_card true on other', ATOMIC_PREDICATES.another_card(ctxOther) === true);
  check('card_is_creature true', ATOMIC_PREDICATES.card_is_creature(ctxOther) === true);

  const youEvt = { subject_card: { iid: 11 }, controller: 'you' };
  const ctxYou = { state: S(), source, event: youEvt, who: 'you' };
  check('controlled_by(you) when who=you, ctrl=you', ATOMIC_PREDICATES.controlled_by(ctxYou, ['you']) === true);
  check('controlled_by(opp) when who=you, ctrl=you → false', ATOMIC_PREDICATES.controlled_by(ctxYou, ['opp']) === false);
  const ctxYouOppSrc = { state: S(), source, event: youEvt, who: 'opp' };
  check('controlled_by(opp) when who=opp, ctrl=you', ATOMIC_PREDICATES.controlled_by(ctxYouOppSrc, ['opp']) === true);

  const dies = { subject_card: { iid: 11 }, from_zone: 'battlefield', to_zone: 'graveyard' };
  const ctxDies = { state: S(), source, event: dies, who: 'you' };
  check('card_moves(battlefield, graveyard) true', ATOMIC_PREDICATES.card_moves(ctxDies, ['battlefield', 'graveyard']) === true);
  check('card_moves(anywhere, graveyard) true (wildcard from)', ATOMIC_PREDICATES.card_moves(ctxDies, ['anywhere', 'graveyard']) === true);
  check('card_moves(battlefield, hand) false', ATOMIC_PREDICATES.card_moves(ctxDies, ['battlefield', 'hand']) === false);

  const gob = { subject_card: { iid: 11, sub: ['Goblin', 'Warrior'] } };
  const ctxGob = { state: S(), source, event: gob, who: 'you' };
  check('card_has_subtype(Goblin) true', ATOMIC_PREDICATES.card_has_subtype(ctxGob, ['Goblin']) === true);
  check('card_has_subtype(Elf) false', ATOMIC_PREDICATES.card_has_subtype(ctxGob, ['Elf']) === false);

  // card_has_effect uses ENGINE.cardHasEffect (reads card.effects[]).
  const counterCard = { subject_card: { iid: 11, effects: [{ kind: 'counter' }] } };
  const ctxCounter = { state: S(), source, event: counterCard, who: 'you' };
  check('card_has_effect(counter) true', ATOMIC_PREDICATES.card_has_effect(ctxCounter, ['counter']) === true);
  check('card_has_effect(damage) false', ATOMIC_PREDICATES.card_has_effect(ctxCounter, ['damage']) === false);

  const killed = { subject_card: { iid: 11, damagedBySources: new Set([10]) } };
  check('card_damaged_by_this true when source in set',
    ATOMIC_PREDICATES.card_damaged_by_this({ state: S(), source, event: killed, who: 'you' }) === true);
  const notKilled = { subject_card: { iid: 11, damagedBySources: new Set([99]) } };
  check('card_damaged_by_this false otherwise',
    ATOMIC_PREDICATES.card_damaged_by_this({ state: S(), source, event: notKilled, who: 'you' }) === false);

  const gain = { who: 'you', delta: 3 };
  const loss = { who: 'opp', delta: -2 };
  check('is_life_gain true on +delta', ATOMIC_PREDICATES.is_life_gain({ event: gain }) === true);
  check('is_life_gain false on -delta', ATOMIC_PREDICATES.is_life_gain({ event: loss }) === false);
  check('is_life_loss true on -delta', ATOMIC_PREDICATES.is_life_loss({ event: loss }) === true);
  check('affected_player_is(you) matches who=you', ATOMIC_PREDICATES.affected_player_is({ event: gain, who: 'you' }, ['you']) === true);
  check('affected_player_is(opp) when source=you, event.who=opp',
    ATOMIC_PREDICATES.affected_player_is({ event: loss, who: 'you' }, ['opp']) === true);

  // lost_life_this_turn reads state[player].lifeLostThisTurn (synthetic state).
  check('lost_life_this_turn(opp) true when opp lost life',
    ATOMIC_PREDICATES.lost_life_this_turn({ state: S(0, 4), source, event: {}, who: 'you' }, ['opp']) === true);
  check('lost_life_this_turn(you) false when you lost none',
    ATOMIC_PREDICATES.lost_life_this_turn({ state: S(0, 4), source, event: {}, who: 'you' }, ['you']) === false);
})();

// ── Worked composition: Bloodlust Berserker (plan §4.1) ──────────────────
console.log('\n=== worked: Bloodlust Berserker condition ===');
(() => {
  const cond = ['this_card', 'card_moves(battlefield, graveyard)', 'lost_life_this_turn(opp)'];
  const source = { iid: 20 };
  const diesEvt = { subject_card: { iid: 20, type: 'Creature' }, from_zone: 'battlefield', to_zone: 'graveyard' };

  check('fires: this dies + opp lost life',
    evaluateCondition(cond, { state: S(0, 2), source, event: diesEvt, who: 'you' }) === true);
  check('no fire: opp lost no life this turn',
    evaluateCondition(cond, { state: S(0, 0), source, event: diesEvt, who: 'you' }) === false);

  const otherDies = { subject_card: { iid: 999, type: 'Creature' }, from_zone: 'battlefield', to_zone: 'graveyard' };
  check('no fire: another card dies',
    evaluateCondition(cond, { state: S(0, 2), source, event: otherDies, who: 'you' }) === false);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
