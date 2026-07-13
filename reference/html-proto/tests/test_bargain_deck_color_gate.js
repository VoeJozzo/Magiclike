// Joe ruling 2026-06-14: the Archdemon-of-Bargains in-game sticker reward must
// RESPECT deck colors — the same gate deck construction enforces — so it can't
// splash a color the deck was never built for.
//
// Bug (pre-fix): land-color "Also a X" stickers gate on `c.deckColors`, but live
// battlefield cards carry no deckColors field, so the in-game bargain path
// skipped the gate. A mono-black deck's Swamp could be handed a white "Also a
// Plains" sticker via the Archdemon — confirmed empirically — becoming a real
// B/W dual that splashes off-color. (Deck construction, working from slots that
// DO have deckColors, never offers that.)
//
// Fix: applyRandomStickersToSide computes the stickered side's deck colors via
// deckColorsForSide (a runtime analog of deckColorsFromSlots that unions the
// side's live cards across zones) and passes them to bargainStickerCandidates,
// which supplies them to each sticker's appliesTo. The two paths now agree.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// A live B/W "deck": a Swamp (deck color B) + a Plains (deck color W). Basic
// lands establish colors through deckColorsFromSlots' land-mana branch, so no
// colored spells are needed. Cards spread across zones to prove the union.
function bwState() {
  return {
    you: {
      battlefield: [ENGINE.makeCard('swamp')],
      library: [ENGINE.makeCard('plains')],
      hand: [], graveyard: [], exile: [],
    },
  };
}

console.log('=== deckColorsForSide unions the side\'s live cards across zones ===');
{
  const st = bwState();
  const dc = deckColorsForSide(st, 'you');
  check('B/W board (swamp + plains) yields deck colors B and W',
    dc.includes('B') && dc.includes('W'), 'dc=' + JSON.stringify(dc));
  check('no off-color (R) leaks into the deck-color set', !dc.includes('R'),
    'dc=' + JSON.stringify(dc));
  check('missing zones are tolerated (no crash on empty hand/graveyard/exile)',
    Array.isArray(dc));
}

console.log('\n=== Bargain candidates honor deck colors (the fix) ===');
{
  const st = bwState();
  const swamp = st.you.battlefield[0];            // produces B; deck is B/W
  const dc = deckColorsForSide(st, 'you');         // ['B','W']
  const ids = bargainStickerCandidates([swamp], dc).map(c => c.sticker.id);

  check('ON-color land sticker allowed (W in deck, swamp lacks W) -> Also a Plains',
    ids.includes('land_color_w'), 'ids=' + JSON.stringify(ids.filter(i => i.startsWith('land_color_'))));
  check('OFF-color land sticker gated out (R not in deck) -> no Also a Mountain',
    !ids.includes('land_color_r'));
  check('OFF-color land sticker gated out (U not in deck) -> no Also an Island',
    !ids.includes('land_color_u'));
  check('OFF-color land sticker gated out (G not in deck) -> no Also a Forest',
    !ids.includes('land_color_g'));
  check('same-color sticker dedup-excluded (swamp already makes B)',
    !ids.includes('land_color_b'));
}

console.log('\n=== Backward-compat: no deckColors arg -> unfiltered broad pool ===');
{
  // bargainStickerCandidates called with one arg (as test_bargain_weighted_pool
  // does) must keep the old behavior: every appliesTo-eligible land sticker.
  const swamp = ENGINE.makeCard('swamp');
  const ids = bargainStickerCandidates([swamp]).map(c => c.sticker.id);
  check('without deckColors, off-color sticker still offered (old broad behavior)',
    ids.includes('land_color_r'), 'ids=' + JSON.stringify(ids.filter(i => i.startsWith('land_color_'))));
}

console.log('\n=== End-to-end: applyRandomStickersToSide never splashes off-color ===');
{
  // Mono-black side (a lone Swamp). The gate makes any off-color land subtype
  // IMPOSSIBLE, so after a burst of bargain picks the Swamp must never gain
  // Plains/Island/Mountain/Forest. (slotIdx is null on a bare makeCard, so the
  // player-side RUN.applyStickerToSlot mirror is correctly skipped.)
  const swamp = ENGINE.makeCard('swamp');
  const st = { you: { battlefield: [swamp], library: [], hand: [], graveyard: [], exile: [] } };
  applyRandomStickersToSide(st, 'you', 5, 'Archdemon Test', null);
  const offColor = ['Plains', 'Island', 'Mountain', 'Forest'];
  check('mono-black Swamp gained no off-color basic-land subtype',
    !offColor.some(t => (swamp.types || []).includes(t)),
    'types=' + JSON.stringify(swamp.types));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
