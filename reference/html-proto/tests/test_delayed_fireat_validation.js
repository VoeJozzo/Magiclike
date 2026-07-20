// A3-14: schedule_delayed refuses an unrecognized `when` instead of
// enqueuing it — the CLEANUP drain only fires 'endStep', so anything else
// would sit in G.delayedTriggers forever, re-checked on every cleanup.
// EFFECT_SCHEMA rejects the same shape at boot. Sibling leak (unknown
// effect kind silently dropped in the same drain) is A1-6.
//
// Arms:
//   1. KEY — scheduling with when:'eot' is refused (nothing enqueued) and
//      console.warn fires.
//   2. Guard — when:'end_step' still enqueues fireAt:'endStep'.
//   3. KEY — EFFECT_SCHEMA flags a schedule_delayed with a bad `when` at
//      boot validation.
//   4. Guard — the well-formed shape (otherworldly_journey's) stays clean.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

ENGINE.init(Array(12).fill('plains'), Array(12).fill('plains'));
const G = ENGINE.state();

console.log('=== A3-14 KEY: unknown `when` is refused loudly at schedule time ===');
(() => {
  G.delayedTriggers = [];
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Typo Source', sourceIid: 4242 },
    { kind: 'schedule_delayed', when: 'eot',
      effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }] },
    null);
  console.warn = origWarn;
  check('A3-14: nothing enqueued for the unknown fire time',
    G.delayedTriggers.length === 0,
    'delayedTriggers=' + JSON.stringify(G.delayedTriggers.map(d => d.fireAt)));
  check('A3-14: the refusal is loud (console.warn names schedule_delayed)',
    warns.some(w => /schedule_delayed/.test(w)),
    warns.length ? warns.join(' | ') : '(no warning — silent immortal entry)');
})();

console.log('\n=== guard: the supported `when` still schedules ===');
(() => {
  G.delayedTriggers = [];
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Good Source', sourceIid: 4243 },
    { kind: 'schedule_delayed', when: 'end_step',
      effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }] },
    null);
  check('end_step enqueues exactly one entry', G.delayedTriggers.length === 1);
  check('entry carries fireAt endStep',
    G.delayedTriggers.length === 1 && G.delayedTriggers[0].fireAt === 'endStep');
  G.delayedTriggers = [];
})();

console.log('\n=== A3-14 KEY: boot EFFECT_SCHEMA flags a bad schedule_delayed ===');
(() => {
  const r = ENGINE.validateAllCardEffects([{
    tplId: 'bad_sched',
    effects: [{ kind: 'schedule_delayed', when: 'eot',
      effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }] }],
  }]);
  check('A3-14: schema error reported for when:\'eot\'',
    r.schemaErrors.length === 1 && /schedule_delayed/.test(r.schemaErrors[0]),
    JSON.stringify(r.schemaErrors));
})();

console.log('\n=== guard: the well-formed schedule_delayed shape validates clean ===');
(() => {
  const r = ENGINE.validateAllCardEffects([{
    tplId: 'good_sched',
    effects: [{ kind: 'schedule_delayed', when: 'end_step',
      effects: [{ kind: 'move_card', from_zone: 'exile', to_zone: 'battlefield', selector: 'target' }] }],
  }]);
  check('no schema error for the canonical shape', r.schemaErrors.length === 0,
    JSON.stringify(r.schemaErrors));
  // Includes otherworldly_journey, the real card using this shape.
  const live = ENGINE.validateAllCardEffects(CARDS);
  check('live card pool has zero schema errors', live.schemaErrors.length === 0,
    JSON.stringify(live.schemaErrors));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
