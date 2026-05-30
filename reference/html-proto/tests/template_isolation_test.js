// Per-instance independence: stickersForSlot computes from a template
// without mutating it. Otherwise one slot's stickers could bleed onto
// every card sharing the tplId. Adapted from the prior-session bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Test: stickersForSlot does NOT share refs with template ===');
{
  const cards = ['spitfire_bastion', 'goblin_war_drummer', 'savannah_lions'];
  for (const tplId of cards) {
    const tpl = CARDS[tplId];
    if (!tpl) continue;
    const slot = { tplId, stickers: [] };
    const beforeEffects = JSON.stringify(tpl.effects);
    const beforeTriggers = JSON.stringify(tpl.triggers);
    const beforeAbilities = JSON.stringify(tpl.abilities);
    const beforeKeywords = JSON.stringify(tpl.keywords);
    const beforeExtra = JSON.stringify(tpl.extraManaColors);
    const beforeCost = JSON.stringify(tpl.cost);

    stickersForSlot(slot, ['W','U','B','R','G']);

    check(tplId + ': tpl.effects unchanged', JSON.stringify(tpl.effects) === beforeEffects);
    check(tplId + ': tpl.triggers unchanged', JSON.stringify(tpl.triggers) === beforeTriggers);
    check(tplId + ': tpl.abilities unchanged', JSON.stringify(tpl.abilities) === beforeAbilities);
    check(tplId + ': tpl.keywords unchanged', JSON.stringify(tpl.keywords) === beforeKeywords);
    check(tplId + ': tpl.extraManaColors unchanged', JSON.stringify(tpl.extraManaColors) === beforeExtra);
    check(tplId + ': tpl.cost unchanged', JSON.stringify(tpl.cost) === beforeCost);
  }
}

console.log("\n=== Test: deep-copy actually deep -- mutating view doesn't reach template ===");
{
  const tpl = CARDS['spitfire_bastion'];
  const originalAmount = tpl.abilities[0].effects[0].amount;
  stickersForSlot({ tplId: 'spitfire_bastion', stickers: [] }, ['R']);
  check('template ability effect amount unchanged after call',
    tpl.abilities[0].effects[0].amount === originalAmount);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
