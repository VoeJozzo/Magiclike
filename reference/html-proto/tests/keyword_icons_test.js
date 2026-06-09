// keywordIconsHtml — the compact keyword icon row shown on the small in-play
// frame (in place of the keyword text line; the blow-up popup keeps the words).
// Covers: inline coin SVG emission + reminder tooltip, the per-source recolor
// class (native/sticker/granted), the unblockable text fallback, the
// creature-vs-spell keyword selection, and the no_block/innate exclusions.

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
  check('flying carries a "Flying: <reminder>" tooltip',
    html.includes('title="Flying: ') && html.includes('blocked by creatures with flying or reach'));
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
  // crude per-icon class extraction
  const cls = kw => {
    const m = html.match(new RegExp('kw-icon (kw-[a-z]+)[^>]*aria-label="' + kw[0].toUpperCase() + kw.slice(1)));
    return m && m[1];
  };
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
    html.includes('<svg') && !html.includes('kw-icon-fallback') && html.includes('title="Unblockable:'));
}

{
  // innate is a status keyword — excluded from the combat icon row.
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying', 'innate'] };
  const html = keywordIconsHtml(card);
  const svgCount = (html.match(/<svg/g) || []).length;
  check('innate is excluded from the icon row', svgCount === 1);
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
