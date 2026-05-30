// Sticker subtype rolls: applyStickerToSlot populates subtypeRolls, and
// the rolled subtype propagates onto the card at ENGINE.init time.
// Adapted from the prior-session test bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log("=== Test: RUN.applyStickerToSlot('subtype') populates subtypeRolls ===");
{
  RUN.start({cards:['savannah_lions','furnace_whelp','goblin_chieftain','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['R','W']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  const lionsIdx = slots.findIndex(s => s.tplId === 'savannah_lions');
  check('Lions slot exists', lionsIdx >= 0);

  const result = RUN.applyStickerToSlot(lionsIdx, 'subtype');
  check('applyStickerToSlot returned true', result === true);

  const slotsAfter = RUN.getSlots();
  const lionsAfter = slotsAfter[lionsIdx];
  console.log('  lions.stickers:', lionsAfter.stickers);
  console.log('  lions.subtypeRolls:', lionsAfter.subtypeRolls);
  check("'subtype' is in stickers", lionsAfter.stickers.includes('subtype'));
  check('subtypeRolls is an array', Array.isArray(lionsAfter.subtypeRolls));
  check('subtypeRolls has 1 entry', lionsAfter.subtypeRolls.length === 1);
  check('Entry is a non-empty string', typeof lionsAfter.subtypeRolls[0] === 'string' && lionsAfter.subtypeRolls[0].length > 0);
  check("Roll is not 'Cat' (Lions already has Cat)", lionsAfter.subtypeRolls[0] !== 'Cat');
}

console.log('\n=== Test: applyStickerToSlot followed by ENGINE.init produces card with correct sub ===');
{
  RUN.start({cards:['savannah_lions','furnace_whelp','goblin_chieftain','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['R','W']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  const lionsIdx = slots.findIndex(s => s.tplId === 'savannah_lions');
  RUN.applyStickerToSlot(lionsIdx, 'subtype');
  const rolledSubtype = RUN.getSlots()[lionsIdx].subtypeRolls[0];
  console.log('  rolled subtype:', rolledSubtype);

  ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
  const G = ENGINE.state();
  const lions = [...G.you.library, ...G.you.hand].find(c => c.tplId === 'savannah_lions');
  check('Lions card constructed', !!lions);
  if (lions) {
    console.log('  lions subtypes:', subtypesOf(lions));
    console.log('  lions.subtypeRolls:', lions.subtypeRolls);
    check('lions.subtypeRolls propagated to card', Array.isArray(lions.subtypeRolls) && lions.subtypeRolls[0] === rolledSubtype);
    check('lions has rolled subtype', hasType(lions, rolledSubtype));
    check('lions still has Cat', hasType(lions, 'Cat'));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
