// The boon is the draft's pick #0: a real card tagged `boon:true`, offered by
// rollBoonOffer and rendered by the same card picker as the packs. The boon's
// art IS the card's art, by construction.
// What can still silently break:
//   - a boon card without `art` renders a blank tile in the pick-#0 offer;
//   - a boon pool under 3 cards silently shrinks the offer;
//   - the boon phase failing to gate (or to clear) breaks pick #0 entirely.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== boon pool: every boon is a renderable card ===');
const boonIds = Object.keys(CARDS).filter(id => CARDS[id] && CARDS[id].boon);
console.log('  found ' + boonIds.length + ' boon cards');
check('boon pool can fill a 3-card offer', boonIds.length >= 3, 'pool=' + boonIds.length);
for (const id of boonIds) {
  check('boon ' + id + ' has art (the pick-#0 picker renders the card)', !!CARDS[id].art);
  check('boon ' + id + ' is undraftable (pick #0 only, never in packs)', isUndraftable(CARDS[id]));
}

console.log('\n=== pick #0 flow: offer -> pick -> packs ===');
DRAFT.startDraft('classic');
check('classic draft opens in the boon phase', DRAFT.isBoonPhase());
const offer = DRAFT.getPlayerPack();
check('boon offer holds 3 cards', offer.length === 3, 'got ' + offer.length);
check('boon offer draws only from the boon pool', offer.every(id => CARDS[id] && CARDS[id].boon),
  offer.join(','));
DRAFT.pickPlayer(offer[0]);
check('picking the boon ends the boon phase', !DRAFT.isBoonPhase());
check('first real pack holds no boons', DRAFT.getPlayerPack().every(id => !CARDS[id].boon));

console.log('\n=== Desert Cube skips the boon phase ===');
DRAFT.startDraft('desertCube');
check('desertCube has no boon phase', !DRAFT.isBoonPhase());

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
