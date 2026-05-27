// Authored text is keyed on `customText`, NOT `special`. `special` is a gameplay
// flag (draft-excluded / unspliceable); routing it to hand-written text let a
// card's text drift from its effects. After decoupling, special cards whose
// effects ARE describable generate their text (guaranteed accurate); only cards
// whose mechanic can't be expressed carry `customText: true`. This locks the
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
  // carry NO customText → they must generate from their effects.
  for (const id of ['vileEdict', 'symmetricize', 'endomorph', 'bleach', 'embargo']) {
    check(id + ' is special but not customText', CARDS[id].special === true && CARDS[id].customText !== true);
  }
})();

console.log('\n=== the moved cards generate accurate text (not sentinel/empty) ===');
(() => {
  const want = {
    vileEdict: 'Target opponent rips a permanent they control.',
    symmetricize: "Target creature's controller equalizes its power, toughness, or cost.",
    bleach: 'Exile target creature; it becomes colorless permanently.',
    embargo: "Return target creature to its owner's hand; it costs {1} more permanently.",
  };
  for (const [id, exp] of Object.entries(want)) check(id + ' generates: "' + exp + '"', r(CARDS[id]) === exp, r(CARDS[id]));
  check('endomorph generates a non-empty, non-sentinel clause',
    r(CARDS.endomorph).length > 0 && !/\[[a-z_]+\]/.test(r(CARDS.endomorph)), r(CARDS.endomorph));
})();

console.log('\n=== apply_sticker + move_card idiom is not a false-match on flicker/exile-eot ===');
(() => {
  check('cloudshift (flicker) still renders its idiom', /return it to the battlefield/.test(r(CARDS.cloudshift)));
  check('otherworldlyJourney (exile-until-eot) unchanged', /at end of turn/.test(r(CARDS.otherworldlyJourney)));
})();

console.log('\n=== cards that genuinely need authored text keep customText:true ===');
(() => {
  for (const id of ['cityGuardian', 'phylactery', 'elystra', 'stapler', 'architectsCodex',
                    'archdemonBargains', 'steal', 'scarification', 'pacifism']) {
    check(id + ' keeps customText:true', CARDS[id].customText === true);
  }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
