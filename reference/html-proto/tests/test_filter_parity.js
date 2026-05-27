// Filter parity (anti-"lying"): the card text (withFilter) must render EXACTLY
// the restrictions the engine (matchFilter) enforces — no hidden restrictions
// (engine rejects but text is silent) and no fake restrictions (text claims a
// limit the engine ignores). Each describable filter key is checked BOTH ways:
// matchFilter rejects a violating card, AND withFilter changes the noun phrase.
// Keep this list in sync with matchFilter; spliceable*/type are excluded (handled
// by the Stapler-only / library-search paths, not generic target filtering).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// A baseline creature, plus a per-key MUTATION that should make matchFilter reject.
function baseCard() {
  return { type: 'Creature', color: 'W', colors: ['W'], power: 2, toughness: 2,
           tapped: false, keywords: [], sub: '', isToken: false };
}
// {key: [filterValue, mutateCardToViolate]}
const CASES = {
  tapped:     [true,        c => { c.tapped = false; }],
  color:      ['R',         c => { c.color = 'W'; }],
  notColor:   ['W',         c => { c.color = 'W'; }],
  subtype:    ['Goblin',    c => { c.sub = ''; }],
  hasKeyword: ['flying',    c => { c.keywords = []; }],
  notKeyword: ['flying',    c => { c.keywords = ['flying']; }],
  notToken:   [true,        c => { c.isToken = true; }],
  maxTough:   [1,           c => { c.toughness = 5; }],
  minTough:   [6,           c => { c.toughness = 5; }],
  maxPower:   [1,           c => { c.power = 2; }],
  minPower:   [6,           c => { c.power = 2; }],
};

console.log('=== every enforced filter key is ALSO rendered (no hidden restrictions) ===');
for (const [key, [val]] of Object.entries(CASES)) {
  const noun = (key === 'notToken') ? 'target permanent' : 'target creature';
  const rendered = withFilter(noun, { filter: { [key]: val } });
  check(key + ' is rendered in card text', rendered !== noun, rendered);
}

console.log('\n=== every rendered filter key is ALSO enforced (no fake restrictions) ===');
for (const [key, [val, violate]] of Object.entries(CASES)) {
  const c = baseCard(); violate(c);
  // matchFilter(card, filter, cardController, caster) — use opp/you so controller cases resolve.
  const ok = ENGINE.matchFilter(c, { [key]: val }, 'opp', 'you');
  check(key + ' is enforced (violating card rejected)', ok === false);
}

console.log('\n=== controller filter: rendered + enforced ===');
(() => {
  check('controller rendered', withFilter('target creature', { filter: { controller: 'opp' } }) !== 'target creature');
  const c = baseCard();
  // controller:'self' but the card is the opponent's → reject (cardCtrl=opp, caster=you)
  check('controller:self rejects an opp creature', ENGINE.matchFilter(c, { controller: 'self' }, 'opp', 'you') === false);
  check('controller:opp rejects your own creature', ENGINE.matchFilter(c, { controller: 'opp' }, 'you', 'you') === false);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
