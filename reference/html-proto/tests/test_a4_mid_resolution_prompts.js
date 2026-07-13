// Audit A4-23 (leg 2) — two forced discards in ONE resolution must ACCUMULATE
// onto the open prompt, not blind-overwrite it. The old `=` dropped the first
// prompt's remaining count, so a card with two discard effects would
// under-discard. Latent today (no shipped card stacks two human-side discards in
// one effects array). This tests ONLY the leg-2 hardening; leg 1 (the trailing-
// effect defer — should a tutor's later gain_life wait for the human's search
// pick?) is a separate design decision and is intentionally NOT changed here.
const setup = require('./_setup'); setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  ' + (ok?'PASS':'FAIL') + ': ' + label + (info?' -- '+info:'')); if(ok)pass++;else fail++; }

const LANDS12 = Array(12).fill('plains');
RUN.start({ cards: LANDS12.slice(), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS12.slice());
const G = ENGINE.state();

console.log('=== A4-23: two discard effects in one resolution accumulate (no blind overwrite) ===');
(() => {
  G.you.hand = ['plains','plains','plains','plains'].map(id => ENGINE.makeCard(id));
  G.forcedDiscard = null;
  const ctx = { controller: 'you', sourceName: 'Double Discard Test', sourceIid: -1, allTargets: [] };
  ENGINE.applyEffect(ctx, { kind: 'discard', amount: 1 }, null);
  const afterFirst = G.forcedDiscard ? G.forcedDiscard.remaining : 0;
  check('first discard opened a prompt for 1', afterFirst === 1, 'remaining=' + afterFirst);
  ENGINE.applyEffect(ctx, { kind: 'discard', amount: 2 }, null);
  const total = G.forcedDiscard ? G.forcedDiscard.remaining : 0;
  check('second discard ACCUMULATES (3 total, not just the last 2)', total === 3, 'remaining=' + total);
})();

console.log('\n=== A4-23 control: AI (opp) discards inline, opens no prompt ===');
(() => {
  G.opp.hand = ['plains','plains','plains'].map(id => ENGINE.makeCard(id));
  G.forcedDiscard = null;
  const before = G.opp.hand.length;
  const ctx = { controller: 'opp', sourceName: 'AI Discard', sourceIid: -1, allTargets: [] };
  ENGINE.applyEffect(ctx, { kind: 'discard', amount: 2 }, null);
  check('AI discard opens NO human prompt', G.forcedDiscard == null);
  check('AI discarded inline (hand shrank by 2)', G.opp.hand.length === before - 2, 'hand=' + G.opp.hand.length);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
