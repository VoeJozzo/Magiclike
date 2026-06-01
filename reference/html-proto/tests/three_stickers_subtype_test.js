// pushStickerWithRoll is reachable from both the RUN public path and
// the opp-AI direct-slot path. Adapted from the prior-session bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Test: pushStickerWithRoll reachable from RUN context ===');
{
  RUN.start({cards:['savannah_lions','furnace_whelp','goblin_chieftain','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['R','W']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  const lionsIdx = slots.findIndex(s => s.tplId === 'savannah_lions');
  const ok = RUN.applyStickerToSlot(lionsIdx, 'subtype');
  check('applyStickerToSlot succeeded', ok === true);
  const slotsAfter = RUN.getSlots();
  const lionsAfter = slotsAfter[lionsIdx];
  console.log('  lions.subtypeRolls:', lionsAfter.subtypeRolls);
  check('subtypeRolls populated', Array.isArray(lionsAfter.subtypeRolls) && lionsAfter.subtypeRolls.length === 1);
  check('roll is a real subtype', typeof lionsAfter.subtypeRolls[0] === 'string' && lionsAfter.subtypeRolls[0].length > 0);
}

console.log('\n=== Test: pushStickerWithRoll with explicit slots array (opp-AI shape) ===');
{
  const oppSlots = [
    { tplId: 'goblin_chieftain', stickers: [] },
    { tplId: 'savannah_lions', stickers: [] },
    { tplId: 'plains', stickers: [] },
  ];
  pushStickerWithRoll(oppSlots[0], 'subtype', oppSlots);
  console.log('  chieftain stickers:', oppSlots[0].stickers);
  console.log('  chieftain subtypeRolls:', oppSlots[0].subtypeRolls);
  check('sticker pushed', oppSlots[0].stickers.includes('subtype'));
  check('subtypeRolls created', Array.isArray(oppSlots[0].subtypeRolls));
  check('rolled a subtype', typeof oppSlots[0].subtypeRolls[0] === 'string');
  check('did not roll Goblin (already Goblin)', oppSlots[0].subtypeRolls[0] !== 'Goblin');
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
