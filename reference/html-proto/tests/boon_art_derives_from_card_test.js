// Boon picker derives art from the card it grants, not from a duplicate
// `art:` field on the boon. The v1.0.134.13 dedup established this rule
// but only checked the 6 boons in cards.js; a 7th in engine.js
// (architectsCodex) slipped through with its old `art: '📜'` intact,
// silently breaking the dedup for that boon.
//
// This test enforces the rule across ALL boons, no matter where they're
// defined: if RUN_MODIFIERS[id] has a matching CARDS[id], the boon
// MUST NOT carry its own `art:` field — the picker will derive from
// CARDS[id].art and any boon-side override will silently win.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== every boon either has no `art:` or matches no card ===');
const boons = Object.entries(RUN_MODIFIERS);
console.log('  found ' + boons.length + ' boons');
for (const [id, m] of boons) {
  if (CARDS[id]) {
    check(
      'boon ' + id + ': no duplicate art (should derive from CARDS.' + id + '.art)',
      !m.art,
      m.art ? 'has art=' + JSON.stringify(m.art) + ' but card art=' + JSON.stringify(CARDS[id].art) : ''
    );
  } else {
    // No matching card — explicit `art:` is fine here (no derivation
    // possible). Just note it.
    console.log('  NOTE: boon ' + id + ' has no matching card; explicit art OK');
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
