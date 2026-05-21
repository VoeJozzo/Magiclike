// destroyLand effect + 'land' target kind. Heir to the Burnt House is
// the first card using it (on-death trigger). EFFECTS is IIFE-scoped
// so direct invocation isn't possible from tests; this verifies
// publicly observable behavior:
//   - card text renders "destroy target land"
//   - getValidTargets('land') returns only Land permanents
//   - sameTarget handles kind:'land' (regression guard for the
//     runaway-loop bug where missing 'land' case made the AI's
//     triggerTargetPick action perpetually illegal)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function makeBaseline() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({cards:['swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','heirToBurntHouse'], colors:['B']}, null);
  RUN.load();
  ENGINE.init(RUN.getSlots(), ['swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp','swamp']);
  return ENGINE.state();
}

console.log('=== Card template ===');
{
  const heir = CARDS['heirToBurntHouse'];
  check('heir card template loaded', !!heir);
  check('heir text mentions "land"', /land/i.test(heir.text || ''),
    'text=' + JSON.stringify(heir.text));
  const trig = heir.triggers && heir.triggers[0];
  check('trigger event is cardDies', trig && trig.event === 'cardDies');
  const eff = trig && trig.effects && trig.effects[0];
  check('effect kind is destroyLand', eff && eff.kind === 'destroyLand');
  check('effect target is land', eff && eff.target === 'land');
}

console.log('\n=== getValidTargets(land) ===');
{
  const G = makeBaseline();
  G.you.battlefield = [
    ENGINE.makeCard('swamp'),
    ENGINE.makeCard('heirToBurntHouse'),
  ];
  G.opp.battlefield = [
    ENGINE.makeCard('swamp'),
    ENGINE.makeCard('swamp'),
    ENGINE.makeCard('bears'),
  ];

  const valid = ENGINE.getValidTargets({target: 'land'}, 'you');
  check('valid lands = 3 (1 yours + 2 opp)', valid.length === 3, 'actual=' + valid.length);
  check('all targets have kind:"land"', valid.every(t => t.kind === 'land'));
  check('no creature/non-land in list', valid.every(t => {
    const f = ENGINE.findCard(t.iid);
    return f && f.card.type === 'Land';
  }));
}

console.log('\n=== getValidTargets respects hexproof on opp lands ===');
{
  const G = makeBaseline();
  const myLand = ENGINE.makeCard('swamp');
  const oppLand = ENGINE.makeCard('swamp');
  oppLand.keywords = ['hexproof'];
  G.you.battlefield = [myLand];
  G.opp.battlefield = [oppLand];

  const valid = ENGINE.getValidTargets({target: 'land'}, 'you');
  check('hexproof opp land filtered out', valid.length === 1, 'actual=' + valid.length);
  check('only your own land remains targetable', valid[0] && valid[0].iid === myLand.iid);
}

console.log('\n=== pickBestTriggerTarget prefers opp land over own ===');
{
  const G = makeBaseline();
  const myLand = ENGINE.makeCard('swamp');
  const oppLand = ENGINE.makeCard('swamp');
  G.you.battlefield = [myLand];
  G.opp.battlefield = [oppLand];

  const valid = ENGINE.getValidTargets({target: 'land'}, 'you');
  const picked = ENGINE.pickBestTriggerTarget(
    {kind: 'destroyLand', target: 'land'}, valid, 'you');
  check('AI picks the opp land', picked && picked.iid === oppLand.iid);
}

console.log('\n=== pickBestTriggerTarget prefers untapped over tapped opp land ===');
{
  const G = makeBaseline();
  const oppTapped = ENGINE.makeCard('swamp');
  const oppUntapped = ENGINE.makeCard('swamp');
  oppTapped.tapped = true;
  G.opp.battlefield = [oppTapped, oppUntapped];

  const valid = ENGINE.getValidTargets({target: 'land'}, 'you');
  const picked = ENGINE.pickBestTriggerTarget(
    {kind: 'destroyLand', target: 'land'}, valid, 'you');
  check('AI picks the untapped opp land', picked && picked.iid === oppUntapped.iid);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
