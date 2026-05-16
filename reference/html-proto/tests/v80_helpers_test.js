// Source-level: the v0.80-era helper layer is in place and the older
// duplicated patterns it replaced are gone (or down to the helper's own
// body). Adapted from the prior-session test bundle.

const { getSource } = require('./_setup');
const code = getSource();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Source-level: helpers defined ===');
check('leavesPlayPreservingBuffs defined',
  /function leavesPlayPreservingBuffs\(card\)/.test(code));
check('appendMergedText defined',
  /function appendMergedText\(merged, addition\)/.test(code));

console.log('\n=== Source-level: call site counts ===');
const lppb = (code.match(/leavesPlayPreservingBuffs\(/g) || []).length;
check('leavesPlayPreservingBuffs calls (>=5 call sites + def + comments)',
  lppb >= 6, 'actual=' + lppb);

const amt = (code.match(/appendMergedText\(/g) || []).length;
check('appendMergedText calls (>=6 call sites + def + comments)',
  amt >= 7, 'actual=' + amt);

console.log('\n=== Source-level: old patterns gone ===');
const oldLeavePattern = code.split('\n').filter(line =>
  /flushPermanentEotToPermaBuffs\(card\)/.test(line) && !/^\s*\/\//.test(line.trim())
);
console.log('  flushPermanentEotToPermaBuffs(card) sites remaining:', oldLeavePattern.length);
check('flushPermanentEotToPermaBuffs(card) appearances <= 4 (helper + standalones)',
  oldLeavePattern.length <= 4, 'found ' + oldLeavePattern.length);

const oldMergedAppend = (code.match(/merged\.text = \(merged\.text \? merged\.text \+ ' ' : ''\)/g) || []).length;
check('Inline merged.text concat pattern <= 1 (helper body only)',
  oldMergedAppend <= 1, 'found ' + oldMergedAppend);

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
