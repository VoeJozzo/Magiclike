// Authored text is keyed on `custom_text`, NOT `special`. `special` is a gameplay
// flag (draft-excluded / unspliceable); routing it to hand-written text let a
// card's text drift from its effects. After decoupling, special cards whose
// effects ARE describable generate their text (guaranteed accurate); only cards
// whose mechanic can't be expressed carry `custom_text: true`. This locks the
// split and the five cards that moved to generated text.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
function r(c) { return describeCardSegments(c, { skipKeywords: false }).map(x => x.text).join(''); }

console.log('=== `special` alone no longer forces authored text ===');
(() => {
  // vileEdict / symmetricize / endomorph / bleach / embargo are special:true but
  // carry NO custom_text → they must generate from their effects.
  for (const id of ['vile_edict', 'symmetricize', 'endomorph', 'bleach', 'embargo']) {
    check(id + ' is special but not custom_text', CARDS[id].special === true && CARDS[id].custom_text !== true);
  }
})();

console.log('\n=== the moved cards generate accurate text (not sentinel/empty) ===');
(() => {
  const want = {
    vile_edict: 'Target opponent rips a permanent they control.',
    // symmetricize + bleach are flash sorceries (retired Instants); the keyword
    // preamble now surfaces "Flash." on non-creature spells too (r() renders
    // with skipKeywords:false).
    symmetricize: "Flash. Target creature's controller equalizes its power, toughness, or cost.",
    bleach: 'Flash. Exile target creature; it becomes colorless, including its mana cost, permanently.',
    embargo: "Return target creature to its owner's hand; it costs {1} more permanently.",
  };
  for (const [id, exp] of Object.entries(want)) check(id + ' generates: "' + exp + '"', r(CARDS[id]) === exp, r(CARDS[id]));
  check('endomorph generates a non-empty, non-sentinel clause',
    r(CARDS.endomorph).length > 0 && !/\[[a-z_]+\]/.test(r(CARDS.endomorph)), r(CARDS.endomorph));
})();

console.log('\n=== apply_sticker + move_card idiom is not a false-match on flicker/exile-eot ===');
(() => {
  check('cloudshift (flicker) still renders its idiom', /return it to the battlefield/.test(r(CARDS.cloudshift)));
  check('otherworldlyJourney (exile-until-eot) unchanged', /at end of turn/.test(r(CARDS.otherworldly_journey)));
})();

console.log('\n=== cards that genuinely need authored text keep custom_text:true ===');
(() => {
  for (const id of ['city_guardian', 'phylactery', 'elystra_the_immortal', 'stapler', 'architects_codex',
                    'archdemon_of_bargains', 'steal', 'pacifism']) {
    check(id + ' keeps custom_text:true', CARDS[id].custom_text === true);
  }
})();

console.log('\n=== scarification generates (no custom_text) so empower shows in the text ===');
(() => {
  // Was custom_text with a hardcoded "Destroy ..." — which froze the removal
  // verb, so an empower(severity)-stickered Scarification still read "Destroy"
  // even though it mechanically EXILES. Now generated: the verb tracks severity.
  check('scarification is NOT custom_text', CARDS.scarification.custom_text !== true);
  const base = describeCardText(ENGINE.makeCard('scarification', [], 0));
  check('base reads "Destroy target creature."', /^Destroy target creature\. Scar it:/.test(base), base);
  const roll = { location: 'effects', subIdx: null, effIdx: 1, modeIdx: null, field: 'severity' };
  const empowered = describeCardText(ENGINE.makeCard('scarification', ['empower'], 0, [roll]));
  check('empower(severity) promotes the text to "Exile target creature."',
    /^Exile target creature\. Scar it:/.test(empowered), empowered);
  check('scar rider is preserved in both', /Scar it: each time it enters the battlefield, its controller loses 1 life\.$/.test(base));
})();

console.log('\n=== stapled multi-target spell: ETB trigger keeps its per-slot targets (regression) ===');
(() => {
  // A multi-slot spell (Twin Strike: two `pump` effects on two `creature` slots)
  // stapled onto a creature folds both effects into ONE ETB trigger that carries
  // `target_slots`. describeTrigger must forward those slot specs to
  // describeEffectList (it previously passed only trig.target, dropping the slot
  // specs) — else the target nouns vanish and the text reads
  // "...,  gets +1/+1 ...  gets +1/+1 ..." with empty subjects + double spaces.
  // Repro: "Clockwork Beetle + Twin Strike" rendered blank targets in-game.
  const beetleTwin = describeCardText(
    ENGINE.makeCard('clockwork_beetle', [], 0, null, null, null, ['twin_strike']));
  check('stapled ETB names its targets (no empty subject)', /target creature/i.test(beetleTwin), beetleTwin);
  check('stapled ETB has no empty-target artifact (no "  gets" / "to  .")',
    !/\s{2,}gets/.test(beetleTwin) && !/to\s{2,}[.]/.test(beetleTwin), beetleTwin);
  // Single-target staple control (Lightning Bolt) is unaffected by the slot-spec path.
  const beetleBolt = describeCardText(
    ENGINE.makeCard('clockwork_beetle', [], 0, null, null, null, ['lightning_bolt']));
  check('single-target staple ETB still names "any target"', /any target/i.test(beetleBolt), beetleBolt);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
