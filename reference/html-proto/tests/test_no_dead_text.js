// Guards the v2.0.55 cleanup: a card's displayed oracle text is GENERATED from
// its effects/triggers/abilities, so a hand-written top-level `text` field is
// dead weight on a procedural card — it never renders and silently rots out of
// sync. We stripped 245 such fields. This test stops them creeping back: a
// top-level `text` is allowed ONLY when it actually affects the rendered output
// (i.e. custom_text authored cards, or a vanilla card with nothing to generate
// where the text is its only content — genuine flavor).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const render = (card) => segsToText(describeCardSegments(card, { skipKeywords: false }));

console.log('=== no card carries a DEAD top-level text field (render-identical with/without) ===');
(() => {
  const dead = [];
  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    if (typeof c.text !== 'string') continue;     // no field — fine
    if (c.custom_text === true) continue;          // authored — the field IS the text
    // Does the stored text change what renders? If not, it's dead.
    const withText = render(c);
    const saved = c.text;
    delete c.text;
    const without = render(c);
    c.text = saved;                                // restore (shared CARDS object)
    if (withText === without) dead.push(id);
  }
  check('no procedural card has a render-irrelevant `text` field', dead.length === 0,
    dead.length ? 'dead text on: ' + dead.join(', ') : '');
})();

console.log('\n=== custom_text cards still render their authored text ===');
(() => {
  const authored = Object.keys(CARDS).filter(id => CARDS[id].custom_text === true);
  check('there are custom_text cards', authored.length > 0, authored.length + ' cards');
  const blank = authored.filter(id => render(CARDS[id]).trim() === '');
  check('every custom_text card renders non-empty text', blank.length === 0, blank.join(', '));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
