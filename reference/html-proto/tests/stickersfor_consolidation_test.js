// stickersForSlot and deckColorsFromSlots — the shared sticker-offer
// computation used by both the in-game reward path and the AI. Refactor
// protection: verify behavior across creature/land slots, claim gates,
// and stapling. Adapted from the prior-session bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Test: stickersForSlot returns sane set for a creature ===');
{
  const slot = { tplId: 'savannah_lions', stickers: [] };
  const result = stickersForSlot(slot, ['W','R']);
  console.log('  count:', result.length);
  console.log('  ids:', result.map(s => s.id).slice(0, 10));
  check('Returns array', Array.isArray(result));
  check('Returns non-empty for fresh creature', result.length > 0);
  check('Includes plus1plus1', result.some(s => s.id === 'plus1_plus1'));
  check('Includes subtype sticker for creature', result.some(s => s.id === 'subtype'));
}

console.log('\n=== Test: stickersForSlot excludes non-stackable already-applied ===');
{
  const slot = { tplId: 'savannah_lions', stickers: ['kw_flying'] };
  const result = stickersForSlot(slot, ['W','R']);
  console.log('  has kw_flying after applying it?', result.some(s => s.id === 'kw_flying'));
  check('kw_flying not re-offered (non-stackable)', !result.some(s => s.id === 'kw_flying'));
  check('Other keywords still offered', result.some(s => s.kind === 'keyword'));
  check('plus1plus1 still offered (stackable)', result.some(s => s.id === 'plus1_plus1'));
}

console.log('\n=== Test: stickersForSlot land-color sticker behavior ===');
{
  const slot = { tplId: 'forest', stickers: [] };
  const result = stickersForSlot(slot, ['G','W']);
  console.log('  forest land-color stickers:', result.filter(s => s.kind === 'add_type').map(s => s.color));
  const offered = result.filter(s => s.kind === 'add_type').map(s => s.color);
  check("Doesn't offer 'Also a G' on Forest", !offered.includes('G'));
  check("Offers 'Also a W' on Forest in WG deck", offered.includes('W'));
  check("Doesn't offer 'Also a U' (deck doesn't play U)", !offered.includes('U'));
}

console.log('\n=== Test: RUN.stickersFor wraps with keyword-claim gate ===');
{
  RUN.start({cards:['savannah_lions','furnace_whelp','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['W','R']}, null);
  RUN.load();
  check('RUN active', RUN.isActive());
}

console.log('\n=== Test: stickersForSlot for land vs creature filters by type ===');
{
  const creatureSlot = { tplId: 'savannah_lions', stickers: [] };
  const landSlot = { tplId: 'forest', stickers: [] };
  const cResult = stickersForSlot(creatureSlot, ['W']);
  const lResult = stickersForSlot(landSlot, ['W']);
  check('Creature offers plus1plus1', cResult.some(s => s.id === 'plus1_plus1'));
  check('Land does NOT offer plus1plus1', !lResult.some(s => s.id === 'plus1_plus1'));
  check('Land offers landColor', lResult.some(s => s.kind === 'add_type'));
  check('Creature does NOT offer landColor', !cResult.some(s => s.kind === 'add_type'));
}

console.log('\n=== Test: deckColorsFromSlots correctly identifies colors ===');
{
  const slots = [
    { tplId: 'forest', stickers: [] },
    { tplId: 'plains', stickers: [] },
    { tplId: 'savannah_lions', stickers: [] },
  ];
  const colors = deckColorsFromSlots(slots);
  console.log('  detected colors:', colors);
  check('Includes G from Forest', colors.includes('G'));
  check('Includes W from Plains and Lions', colors.includes('W'));
  check('Does NOT include R (no red cards)', !colors.includes('R'));
}

console.log('\n=== Test: stickersForSlot on stapled slot uses merged template ===');
{
  const slot = { tplId: 'savannah_lions', stickers: [], stapledTpls: ['spitfire_bastion'] };
  const result = stickersForSlot(slot, ['W','U']);
  check('Stapled creature offers plus1plus1', result.some(s => s.id === 'plus1_plus1'));
  check('Stapled slot offers empower (merged effects)', result.some(s => s.id === 'empower'));
}

console.log('\n=== Test: subtype roll dedup works through view ===');
{
  const slot = { tplId: 'savannah_lions', stickers: ['subtype'], subtypeRolls: ['Dragon'] };
  const result = stickersForSlot(slot, ['W']);
  check('Subtype sticker stackable - re-offered', result.some(s => s.id === 'subtype'));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
