// Sticker subtype system: there's exactly one 'subtype' sticker that
// rolls a subtype from the deck at apply time, persists via subtypeRolls,
// stacks for multiple subtypes, and migrates legacy subtype_<tribe>
// saves. Adapted from the prior-session test bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== Test 1: Only one subtype sticker exists in STICKERS ===');
{
  const ids = Object.keys(STICKERS).filter(id => STICKERS[id].kind === 'subtype');
  console.log('  subtype-kind sticker IDs:', ids);
  check('Exactly one subtype sticker', ids.length === 1);
  check("Its ID is 'subtype'", ids[0] === 'subtype');
  check('Old subtype_goblin no longer exists', !STICKERS['subtype_goblin']);
  check('Old subtype_wizard no longer exists', !STICKERS['subtype_wizard']);
  check('Subtype sticker is stackable', STICKERS['subtype'].stackable === true);
  check('Subtype sticker weight is 10', STICKERS['subtype'].weight === 10);
}

console.log('\n=== Test 2: rollSubtypeFromDeck weights by deck contents ===');
{
  RUN.start({cards:['savannahLions','goblinChieftain','goblinWarDrummer','prodigal','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['W','R','U']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  console.log('  deck slot tplIds:', slots.map(s => s.tplId));
  const targetIdx = slots.findIndex(s => s.tplId === 'savannahLions');
  check('Lions slot exists', targetIdx >= 0);

  const counts = {};
  for (let i = 0; i < 1000; i++) {
    const roll = rollSubtypeFromDeck(slots, targetIdx);
    if (roll) counts[roll] = (counts[roll] || 0) + 1;
  }
  console.log('  1000 rolls distribution:', counts);
  check("Cat not rolled (target has it)", !counts['Cat']);
  check('Goblin rolled', counts['Goblin'] > 0);
  check('Wizard rolled', counts['Wizard'] > 0);
  check('Goblin appears more than Wizard', (counts['Goblin'] || 0) > (counts['Wizard'] || 0));
}

console.log("\n=== Test 3: rollSubtypeFromDeck excludes target's existing subtypes ===");
{
  RUN.start({cards:['goblinChieftain','goblinWarDrummer','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['R','W']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  const targetIdx = slots.findIndex(s => s.tplId === 'goblinChieftain');
  let rolledGoblin = false;
  for (let i = 0; i < 200; i++) {
    if (rollSubtypeFromDeck(slots, targetIdx) === 'Goblin') { rolledGoblin = true; break; }
  }
  check("All 200 rolls avoid the target's existing subtype", !rolledGoblin);
  let sawShaman = false;
  for (let i = 0; i < 200; i++) {
    if (rollSubtypeFromDeck(slots, targetIdx) === 'Shaman') { sawShaman = true; break; }
  }
  check('Rolled Shaman (only viable subtype)', sawShaman);
}

console.log('\n=== Test 4: Sticker application respects rolled subtype ===');
{
  RUN.start({cards:['savannahLions','goblinChieftain','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['R','W']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  const lionsIdx = slots.findIndex(s => s.tplId === 'savannahLions');
  slots[lionsIdx].stickers = ['subtype'];
  slots[lionsIdx].subtypeRolls = ['Goblin'];
  RUN.save();

  ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
  const G = ENGINE.state();
  const lions = [...G.you.library, ...G.you.hand].find(c => c.tplId === 'savannahLions');
  check('Lions found', !!lions);
  if (lions) {
    console.log('  lions.sub:', lions.sub, '  subtypeRolls:', lions.subtypeRolls);
    check("Lions sub contains 'Goblin'", lions.sub.includes('Goblin'));
    check("Lions sub still contains 'Cat'", lions.sub.includes('Cat'));

    const chieftain = [...G.you.library, ...G.you.hand].find(c => c.tplId === 'goblinChieftain');
    if (chieftain) {
      G.you.library = G.you.library.filter(c => c !== lions && c !== chieftain);
      G.you.hand = G.you.hand.filter(c => c !== lions && c !== chieftain);
      lions.sick = false; chieftain.sick = false;
      G.you.battlefield.push(lions, chieftain);
      const [p, t] = ENGINE.getStats(lions);
      console.log('  Lions stats with Goblin sticker + Chieftain on battlefield:', p, '/', t);
      check('Lions get Goblin lord buff (P>=3)', p >= 3);
    }
  }
}

console.log('\n=== Test 5: Stacking applies multiple subtypes ===');
{
  RUN.start({cards:['savannahLions','goblinChieftain','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains'], colors:['R','W']}, null);
  RUN.load();
  const slots = RUN.getSlots();
  const lionsIdx = slots.findIndex(s => s.tplId === 'savannahLions');
  slots[lionsIdx].stickers = ['subtype', 'subtype'];
  slots[lionsIdx].subtypeRolls = ['Goblin', 'Wizard'];
  RUN.save();

  ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
  const G = ENGINE.state();
  const lions = [...G.you.library, ...G.you.hand].find(c => c.tplId === 'savannahLions');
  if (lions) {
    console.log('  Lions sub with 2 subtype stickers:', lions.sub);
    check('Lions sub contains Goblin', lions.sub.includes('Goblin'));
    check('Lions sub contains Wizard', lions.sub.includes('Wizard'));
    check('Lions sub still contains Cat', lions.sub.includes('Cat'));
  }
}

console.log("\n=== Test 6: Save migration converts legacy subtype_goblin -> 'subtype' + roll ===");
{
  const legacySave = JSON.stringify({
    version: 1,
    runState: {
      slots: [
        {tplId: 'savannahLions', stickers: ['subtype_goblin']},
        {tplId: 'plains', stickers: []},
      ],
      colors: ['W'],
      mode: 'draft',
      lives: 3,
      results: [],
      modifiers: [],
      lastClaimedKeywords: [],
    },
  });
  global.localStorage.setItem('claudeMagiclikeRunV1', legacySave);
  RUN.load();
  const slots = RUN.getSlots();
  const lionsSlot = slots.find(s => s.tplId === 'savannahLions');
  check('Lions slot still present after load', !!lionsSlot);
  if (lionsSlot) {
    console.log('  migrated stickers:', lionsSlot.stickers);
    console.log('  migrated subtypeRolls:', lionsSlot.subtypeRolls);
    check("Stickers contains 'subtype' (new)", lionsSlot.stickers.includes('subtype'));
    check("Stickers does NOT contain 'subtype_goblin' (old)", !lionsSlot.stickers.includes('subtype_goblin'));
    check("subtypeRolls contains 'Goblin'", Array.isArray(lionsSlot.subtypeRolls) && lionsSlot.subtypeRolls.includes('Goblin'));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
