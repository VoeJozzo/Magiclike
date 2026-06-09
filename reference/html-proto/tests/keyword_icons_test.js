// keywordIconsHtml — the compact keyword icon row shown on the small in-play
// frame (in place of the keyword text line; the blow-up popup keeps the words).
// Covers: icon emission + reminder tooltip, the unblockable text fallback, the
// creature-vs-spell keyword selection, and the no_block/innate exclusions.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== keywordIconsHtml: icons + tooltips ===');

{
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying'] };
  const html = keywordIconsHtml(card);
  check('flying emits its coin SVG', html.includes('assets/keywords/flying.svg'));
  check('flying carries a "Flying: <reminder>" tooltip',
    html.includes('title="Flying: ') && html.includes('blocked by creatures with flying or reach'));
  check('icon row is wrapped in .frame-keywords', html.includes('class="frame-keywords"'));
}

{
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying', 'first_strike', 'lifelink'] };
  const html = keywordIconsHtml(card);
  const imgCount = (html.match(/<img /g) || []).length;
  check('multiple keywords each emit an icon', imgCount === 3, imgCount + ' imgs');
  check('first_strike resolves to its file', html.includes('first_strike.svg'));
}

{
  // unblockable has no art yet — text fallback, not an <img>.
  const card = { tplId: 'x', types: ['Creature'], keywords: ['unblockable'] };
  const html = keywordIconsHtml(card);
  check('unblockable falls back to a text chip (no img)',
    !html.includes('<img') && html.includes('kw-icon-fallback') && html.includes('Unblockable'));
}

{
  // innate is a status keyword — excluded from the combat icon row.
  const card = { tplId: 'x', types: ['Creature'], keywords: ['flying', 'innate'] };
  const html = keywordIconsHtml(card);
  check('innate is excluded from the icon row',
    !html.includes('innate.svg') && html.includes('flying.svg'));
}

{
  // Non-creature: only spell-legal keywords (flash) show; combat ones don't.
  const card = { tplId: 'x', types: ['Instant'], keywords: ['flash', 'trample'] };
  const html = keywordIconsHtml(card);
  check('non-creature shows flash but not trample',
    html.includes('flash.svg') && !html.includes('trample.svg'));
}

{
  const card = { tplId: 'x', types: ['Creature'], keywords: [] };
  check('no keywords -> empty string', keywordIconsHtml(card) === '');
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
