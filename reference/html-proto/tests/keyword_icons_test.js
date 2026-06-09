// keywordIconsHtml — the compact keyword icon row shown on the small in-play
// frame (in place of the keyword text line; the blow-up popup keeps the words).
// Covers: inline coin SVG emission + reminder tooltip, the per-source recolor
// class (native/sticker/granted), the unblockable text fallback, the
// creature-vs-spell keyword selection, the no_block exclusion, and innate
// inclusion (its coin shows on lands, gold when sticker-granted).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== keywordIconsHtml: inline coins + source colors + tooltips ===');

{
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying'] };
  const html = keywordIconsHtml(card);
  check('flying inlines a coin <svg> (not an <img>)', html.includes('<svg') && !html.includes('<img'));
  check('flying carries a "Flying: <reminder>" tooltip (data-tip)',
    html.includes('data-tip="Flying: ') && html.includes('blocked by creatures with flying or reach'));
  check('icon row is wrapped in .frame-keywords', html.includes('class="frame-keywords"'));
  check('glyph uses currentColor so CSS can recolor it', html.includes('currentColor'));
}

{
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying', 'first_strike', 'lifelink'] };
  const html = keywordIconsHtml(card);
  const svgCount = (html.match(/<svg/g) || []).length;
  check('multiple keywords each inline a coin', svgCount === 3, svgCount + ' svgs');
}

{
  // Source coloring: native (template) = blue, sticker (kw_*) = gold,
  // permanent-granted (grantedBy) = teal.
  global.CARDS.__kwtest = { keywords: ['flying'] };  // template has flying natively
  const grantedBy = new Map([['trample', new Set([999])]]);
  const card = {
    tplId: '__kwtest', types: ['Creature'],
    keywords: ['flying', 'menace', 'trample'],
    stickers: ['kw_menace'],
    grantedBy,
  };
  const html = keywordIconsHtml(card);
  check('native keyword (flying) -> kw-native', html.includes('kw-icon kw-native'));
  check('sticker keyword (menace) -> kw-sticker', html.includes('kw-icon kw-sticker'));
  check('permanent-granted keyword (trample) -> kw-granted', html.includes('kw-icon kw-granted'));
  // Native carries an inline per-card-color style; sticker/granted use the class.
  check('native coin gets inline card-color vars',
    /kw-native"\s+style="[^"]*--kw-disc/.test(html));
  delete global.CARDS.__kwtest;
}

{
  // Native coin color follows the card's frame color (red here -> red ink).
  global.CARDS.__redkw = { keywords: ['flying'], colors: ['R'] };
  const card = { tplId: '__redkw', types: ['Creature'], keywords: ['flying'], colors: ['R'] };
  const html = keywordIconsHtml(card);
  check('red card -> red native glyph ink', html.includes('color:#A52222'));
  delete global.CARDS.__redkw;
}

{
  // unblockable now has coin art — renders an inline coin like the others.
  const card = { tplId: 'x', types: ['Creature'], keywords: ['unblockable'] };
  const html = keywordIconsHtml(card);
  check('unblockable renders a coin (no text fallback)',
    html.includes('<svg') && !html.includes('kw-icon-fallback') && html.includes('data-tip="Unblockable:'));
}

{
  // innate now surfaces its own coin alongside other keywords (flying + innate = 2).
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying', 'innate'] };
  const html = keywordIconsHtml(card);
  const svgCount = (html.match(/<svg/g) || []).length;
  check('innate renders a coin in the icon row', svgCount === 2, svgCount + ' svgs');
}

{
  // Real case: a basic land with the innate sticker shows just the innate coin,
  // styled gold (sticker source — the sticker is stored under the bare id 'innate',
  // not 'kw_innate').
  const card = { tplId: 'forest', types: ['Land', 'Basic'], keywords: ['innate'], stickers: ['innate'] };
  const html = keywordIconsHtml(card, 'C');
  check('innate land shows a coin', html.includes('<svg') && html.includes('class="frame-keywords"'));
  check('stickered innate coin is gold (kw-sticker)', html.includes('kw-icon kw-sticker'));
}

{
  // Non-creature: only spell-legal keywords (flash) show; combat ones don't.
  const card = { tplId: 'x', types: ['Instant'], keywords: ['flash', 'trample'] };
  const html = keywordIconsHtml(card);
  const svgCount = (html.match(/<svg/g) || []).length;
  check('non-creature shows only flash (1 coin)', svgCount === 1, svgCount + ' svgs');
}

{
  const card = { tplId: 'x', types: ['Creature'], keywords: [] };
  check('no keywords -> empty string', keywordIconsHtml(card) === '');
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
