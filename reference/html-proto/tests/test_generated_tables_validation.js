// Audit fix A3-5 — the three generated-trigger data tables get boot-time
// validation (ENGINE.validateGeneratedTriggerTables, called from main.js
// alongside validateAllCardConditions/Effects).
//
// Pre-fix, validateAllCardConditions/validateAllCardEffects walked only the
// collection passed in — and the only boot call sites passed CARDS. The
// three module-level tables powering RANDOMLY GENERATED abilities
// (GENERATOR_EFFECTS / GENERATOR_CONDITIONS in trigger-generator.js, plus
// MERCURIAL_TRIGGER_POOL in engine.js) were validated by NOTHING: a typo'd
// effect kind, token id, predicate name, or event kind booted clean and the
// player's whole-run boon silently no-opped. PROTOCOL §3.4 promises "every
// ID a card references is registered at boot" — the pool's triggers ARE
// card-attached at runtime. Stale-save guard: makePlayer now runs the same
// shape check over a slot's persisted bonusTrigger (warn-only; the trigger
// still attaches — behavior-neutral).
//
// Arms:
//   1. KEY — the validator exists and the LIVE tables validate clean.
//   2. KEY — injected typos in each of the three tables are caught
//      (bad effect kind / bad token id / bad predicate / bad event).
//   3. KEY — a stale-save bonusTrigger with unknown ids warns at makePlayer
//      (and still attaches — the check is loud, not behavior-changing).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== A3-5 KEY: validator exists and live tables are clean ===');
const hasFn = typeof ENGINE.validateGeneratedTriggerTables === 'function';
check('A3-5: ENGINE.validateGeneratedTriggerTables is a function', hasFn);
if (!hasFn) {
  // Pre-fix there is nothing to call — count the remaining arms as failures.
  console.log('  FAIL: (validator missing -- live-clean arm skipped)'); fail++;
  console.log('  FAIL: (validator missing -- injection arms skipped)'); fail++;
  console.log('  FAIL: (validator missing -- bonusTrigger warn arm skipped)'); fail++;
} else {
  (() => {
    const origWarn = console.warn;
    console.warn = () => {};
    const r = ENGINE.validateGeneratedTriggerTables();
    console.warn = origWarn;
    const allEmpty = r && ['unknownKinds', 'unknownTokens', 'unknownAtomics', 'unknownEvents']
      .every(k => Array.isArray(r[k]) && r[k].length === 0);
    check('live GENERATOR_EFFECTS / GENERATOR_CONDITIONS / MERCURIAL_TRIGGER_POOL validate clean',
      allEmpty, JSON.stringify(r));
  })();

  console.log('\n=== A3-5 KEY: injected typos in each table are caught ===');
  (() => {
    const origWarn = console.warn;
    console.warn = () => {};
    GENERATOR_EFFECTS.push({
      id: '__badEffect__', weight: 1, needsLiveSource: false,
      roll: () => [{ kind: 'gain_lyfe', scope: 'self', amount: 1 }],
      describe: () => 'bad',
    });
    GENERATOR_EFFECTS.push({
      id: '__badToken__', weight: 1, needsLiveSource: false,
      roll: () => [{ kind: 'create_tokens', token_id: 'no_such_token_x', count: 1 }],
      describe: () => 'bad',
    });
    GENERATOR_CONDITIONS.push({
      id: '__badCond__', weight: 1, sourceLive: false, text: 'bad',
      event: 'card_explodes', condition: ['no_such_predicate_x'],
    });
    MERCURIAL_TRIGGER_POOL.push({
      label: '__BadBoon__', event: 'card_zone_change',
      condition: ['another_fake_predicate_x'], text: 'bad',
      effects: [{ kind: 'gain_lyfe', scope: 'self', amount: 1 }],
    });
    const r = ENGINE.validateGeneratedTriggerTables();
    console.warn = origWarn;
    MERCURIAL_TRIGGER_POOL.pop();
    GENERATOR_CONDITIONS.pop();
    GENERATOR_EFFECTS.pop();
    GENERATOR_EFFECTS.pop();
    check('typo\'d effect kind in GENERATOR_EFFECTS caught',
      r.unknownKinds.some(s => s.includes('__badEffect__') && s.includes('gain_lyfe')),
      JSON.stringify(r.unknownKinds));
    check('unknown token id in GENERATOR_EFFECTS caught',
      r.unknownTokens.some(s => s.includes('__badToken__') && s.includes('no_such_token_x')),
      JSON.stringify(r.unknownTokens));
    check('unknown event kind in GENERATOR_CONDITIONS caught',
      r.unknownEvents.some(s => s.includes('__badCond__') && s.includes('card_explodes')),
      JSON.stringify(r.unknownEvents));
    check('unknown predicate in GENERATOR_CONDITIONS caught',
      r.unknownAtomics.some(s => s.includes('__badCond__') && s.includes('no_such_predicate_x')),
      JSON.stringify(r.unknownAtomics));
    check('typo\'d Mercurial pool entry caught (predicate + effect kind)',
      r.unknownAtomics.some(s => s.includes('__BadBoon__'))
      && r.unknownKinds.some(s => s.includes('__BadBoon__')),
      JSON.stringify({ atomics: r.unknownAtomics, kinds: r.unknownKinds }));
    // Tables restored — validator must be clean again (no lasting mutation).
    const origWarn2 = console.warn;
    console.warn = () => {};
    const clean = ENGINE.validateGeneratedTriggerTables();
    console.warn = origWarn2;
    check('tables restored: validator clean after the probe',
      ['unknownKinds', 'unknownTokens', 'unknownAtomics', 'unknownEvents']
        .every(k => clean[k].length === 0));
  })();

  console.log('\n=== A3-5 KEY: stale-save bonusTrigger warns at makePlayer (and still attaches) ===');
  (() => {
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    ENGINE.init(
      [{ tplId: 'plains', bonusTrigger: {
        label: '__StaleBoon__', event: 'bogus_event',
        condition: ['no_such_pred_y'], text: 'stale',
        effects: [{ kind: 'gain_lyfe', scope: 'self', amount: 1 }],
      } }].concat(Array(11).fill('plains')),
      Array(12).fill('plains'));
    console.warn = origWarn;
    check('A3-5: invalid persisted bonusTrigger warns loudly',
      warns.some(w => /bonusTrigger/.test(w) || /__StaleBoon__/.test(w)
        || (/bogus_event/.test(w) && /gain_lyfe/.test(w))),
      warns.length ? warns.join(' | ') : '(no warning)');
    // Behavior-neutral: the trigger is still attached (validation warns, not strips).
    const G = ENGINE.state();
    let carrier = null;
    for (const zone of ['hand', 'library', 'battlefield', 'graveyard']) {
      const c = (G.you[zone] || []).find(x =>
        (x.triggers || []).some(t => t.label === '__StaleBoon__'));
      if (c) { carrier = c; break; }
    }
    check('the trigger still attaches (warn-only, behavior-neutral)', !!carrier);
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
