// Procedural trigger generator (Mercurial Adept / Architect's Codex).
// Three concerns:
//   1. Output shape — every generated trigger has the expected fields and
//      types so the resolution loop can fire it.
//   2. Hard-break filter — effects with `needsLiveSource: true` must not
//      pair with conditions where the source is dead (sourceLive: false).
//      Mismatch = self-targeting effect resolves against a graveyard
//      source and crashes / no-ops.
//   3. Two-step build flow — the (3 conditions, then 3 effects)
//      Mercurial Adept UX path produces well-formed picks.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Generator surface exists ===');
check('GENERATOR_EFFECTS is a non-empty array',
  Array.isArray(GENERATOR_EFFECTS) && GENERATOR_EFFECTS.length > 0);
check('GENERATOR_CONDITIONS is a non-empty array',
  Array.isArray(GENERATOR_CONDITIONS) && GENERATOR_CONDITIONS.length > 0);
check('generateRandomTrigger is a function', typeof generateRandomTrigger === 'function');
check('assembleTrigger is a function', typeof assembleTrigger === 'function');
check('generateConditionOptions is a function', typeof generateConditionOptions === 'function');
check('generateEffectOptions is a function', typeof generateEffectOptions === 'function');

console.log('\n=== GENERATOR_EFFECTS entries are well-shaped ===');
for (const eff of GENERATOR_EFFECTS) {
  const desc = eff.id || '(no id)';
  check(desc + ': has id', typeof eff.id === 'string' && eff.id.length > 0);
  check(desc + ': has weight > 0',
    typeof eff.weight === 'number' && eff.weight > 0);
  check(desc + ': has needsLiveSource boolean',
    typeof eff.needsLiveSource === 'boolean');
  check(desc + ': roll() is a function', typeof eff.roll === 'function');
  check(desc + ': describe() is a function', typeof eff.describe === 'function');
  // Smoke: rolling produces an effects array with a kind.
  const rolled = eff.roll();
  check(desc + ': roll() returns non-empty array',
    Array.isArray(rolled) && rolled.length > 0);
  check(desc + ": roll()[0].kind is set",
    rolled[0] && typeof rolled[0].kind === 'string');
}

console.log('\n=== GENERATOR_CONDITIONS entries are well-shaped ===');
for (const cond of GENERATOR_CONDITIONS) {
  const desc = cond.id || '(no id)';
  check(desc + ': has id', typeof cond.id === 'string');
  check(desc + ': has weight > 0',
    typeof cond.weight === 'number' && cond.weight > 0);
  check(desc + ': has sourceLive boolean',
    typeof cond.sourceLive === 'boolean');
  check(desc + ': has text', typeof cond.text === 'string' && cond.text.length > 0);
  // Composable shape (Slice 2 / E2): valid event + a condition array that
  // classifies back to its archetype id.
  check(desc + ': event is a recognized trigger event',
    VALID_TRIGGER_EVENTS.has(cond.event));
  check(desc + ': condition is an array', Array.isArray(cond.condition));
  check(desc + ': condition classifies back to its id',
    triggerArchetype({event: cond.event, condition: cond.condition}) === cond.id);
}

console.log('\n=== generateRandomTrigger output shape (200 rolls) ===');
{
  const VALID_KIND = new Set();
  let badShape = 0, badEvent = 0, missingText = 0;
  for (let i = 0; i < 200; i++) {
    const t = generateRandomTrigger();
    if (!t || typeof t !== 'object') { badShape++; continue; }
    if (typeof t.event !== 'string' || !t.event) badEvent++;
    if (typeof t.text !== 'string' || !t.text) missingText++;
    if (!Array.isArray(t.effects) || t.effects.length === 0) badShape++;
    else {
      for (const e of t.effects) {
        if (!e || typeof e.kind !== 'string') badShape++;
        else VALID_KIND.add(e.kind);
      }
    }
    if (!Array.isArray(t.condition)) badShape++;
    if (t.generated !== true) badShape++;
  }
  check('all 200 rolls have well-shaped effects', badShape === 0,
    'badShape=' + badShape);
  check('all 200 rolls have an event string', badEvent === 0,
    'badEvent=' + badEvent);
  check('all 200 rolls have non-empty text', missingText === 0,
    'missingText=' + missingText);
  console.log('  effect kinds observed:', [...VALID_KIND].join(', '));
  check('multiple effect kinds rolled (not stuck on one)', VALID_KIND.size >= 4);
}

console.log('\n=== Hard-break filter: needsLiveSource never pairs with !sourceLive ===');
{
  // Pull dead-source conditions and live-source effects, then verify the
  // generator never produces a bad pairing across many rolls. Detect by
  // looking at (condId, effect.kind) tuples — any live-source effect kind
  // appearing with a dead-source condId is a regression.
  const deadCondIds = new Set(GENERATOR_CONDITIONS.filter(c => !c.sourceLive).map(c => c.id));
  // Build a "kind -> needsLiveSource?" map. Multiple effects share a kind
  // but with consistent flags within this generator.
  const liveKinds = new Set();
  for (const eff of GENERATOR_EFFECTS) {
    if (!eff.needsLiveSource) continue;
    const rolled = eff.roll();
    if (rolled[0] && rolled[0].kind) liveKinds.add(rolled[0].kind);
  }
  let violations = 0;
  for (let i = 0; i < 500; i++) {
    const t = generateRandomTrigger();
    if (deadCondIds.has(triggerArchetype(t)) && t.effects[0] && liveKinds.has(t.effects[0].kind)) {
      // The same kind COULD appear from a different effect that's not
      // needsLiveSource — so we need to double-check by looking at the
      // effect target. needsLiveSource effects typically target 'self'.
      if (t.effects[0].scope === 'self') {
        violations++;
      }
    }
  }
  check('no live-source-self effect appears under a dead-source condition (500 rolls)',
    violations === 0, 'violations=' + violations);
}

console.log('\n=== Two-step build flow: condition options ===');
{
  const opts = generateConditionOptions();
  check('returns 3 condition options', opts.length === 3);
  const ids = opts.map(o => o.id);
  check('options are distinct', new Set(ids).size === 3);
  for (const o of opts) {
    check(o.id + ': has text', typeof o.text === 'string' && o.text.length > 0);
    check(o.id + ': has sourceLive', typeof o.sourceLive === 'boolean');
  }
}

console.log('\n=== Two-step build flow: effect options (dead-source condition) ===');
{
  const deadCond = GENERATOR_CONDITIONS.find(c => !c.sourceLive);
  if (!deadCond) {
    console.log('  (no dead-source condition in pool -- skipping)');
  } else {
    const effOpts = generateEffectOptions(deadCond);
    check('returns 3 effect options for ' + deadCond.id,
      effOpts.length === 3);
    // Every offered effect, when picked, must NOT be a needsLiveSource one
    // (since the chosen condition has sourceLive=false).
    let liveOffered = 0;
    for (const eo of effOpts) {
      const tpl = GENERATOR_EFFECTS.find(e => e.id === eo.effId);
      if (tpl && tpl.needsLiveSource) liveOffered++;
    }
    check('no needsLiveSource effects offered for dead-source condition',
      liveOffered === 0, 'liveOffered=' + liveOffered);
  }
}

console.log('\n=== Two-step build flow: assembleTrigger output ===');
{
  const cond = GENERATOR_CONDITIONS.find(c => c.id === 'thisEnters');
  const effOpts = generateEffectOptions(cond);
  const trig = assembleTrigger(cond, effOpts[0]);
  check('assembled trigger has event', typeof trig.event === 'string' && trig.event.length > 0);
  check('assembled trigger condition classifies to its id', triggerArchetype(trig) === cond.id);
  check('assembled trigger has text', typeof trig.text === 'string' && trig.text.length > 0);
  check('assembled trigger has effects array',
    Array.isArray(trig.effects) && trig.effects.length > 0);
  check('assembled trigger marked generated', trig.generated === true);
  check('assembled trigger has noSelfCascade guard', trig.noSelfCascade === true);
  // The effects in the assembled trigger should be FRESH COPIES — mutating
  // them must not affect the chosenEffect's original array (otherwise the
  // condition-pick view could see post-resolution state).
  trig.effects[0].amount = 999;
  const stillOriginal = effOpts[0].effects[0].amount !== 999;
  check('assembled trigger effects are copies (not shared refs)', stillOriginal);
}

console.log('\n=== Mercurial Adept template + deck-build integration ===');
{
  // Mercurial Adept is the fixed-pool variant: card carries
  // trigger_pool_seed='mercurial', and at deck-build time the engine rolls
  // one entry from MERCURIAL_TRIGGER_POOL into the card's bonusTrigger.
  const tpl = CARDS['mercurialAdept'];
  if (tpl) {
    check('Adept template exists', !!tpl);
    check("Adept marked with trigger_pool_seed='mercurial'",
      tpl.trigger_pool_seed === 'mercurial');

    // Deck-build integration: construct a game with Adept in the deck
    // and verify the resulting card has a bonusTrigger.
    RUN.start({cards:['mercurialAdept','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['U']}, null);
    RUN.load();
    ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
    const G = ENGINE.state();
    const adept = [...G.you.library, ...G.you.hand].find(c => c.tplId === 'mercurialAdept');
    check('Adept appears in the player game state', !!adept);
    if (adept) {
      // The bonusTrigger is appended onto card.triggers at makeCard time
      // (see engine.js:1868-1877) rather than stored as a separate field.
      // Adept's template has no intrinsic triggers, so the one trigger we
      // see IS the rolled boon.
      check('Adept has a trigger rolled from the pool',
        Array.isArray(adept.triggers) && adept.triggers.length >= 1);
      if (adept.triggers && adept.triggers[0]) {
        const t = adept.triggers[0];
        check('rolled trigger has an event',
          typeof t.event === 'string' && t.event.length > 0);
        check('rolled trigger has effects',
          Array.isArray(t.effects) && t.effects.length > 0);
      }
    }
  } else {
    console.log('  (mercurialAdept not in CARDS -- skipping)');
  }
}

console.log("\n=== Architect's Codex template (build_on_draw / procedural path) ===");
{
  // Codex is the procedural-generator variant: build_on_draw triggers the
  // generateConditionOptions -> generateEffectOptions -> assembleTrigger
  // flow controller-side. Template should be tagged appropriately.
  const tpl = CARDS['architectsCodex'];
  if (tpl) {
    check('Codex template exists', !!tpl);
    check('Codex has build_on_draw flag', tpl.build_on_draw === true);
    check('Codex marked special', tpl.special === true);
  } else {
    console.log('  (architectsCodex not in CARDS -- skipping)');
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
