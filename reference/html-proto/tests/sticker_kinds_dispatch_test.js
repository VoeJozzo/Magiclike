// Sticker-kind dispatch coverage: each STICKERS kind (statBoost, keyword,
// innate, landColor, costReduction, empower, subtype) is exercised across
// the three surfaces it touches:
//
//   applyStickersToCard — mutating a card at construction time
//   stickersForSlot     — gating re-offer at reward time
//   stickerBadgesHtml   — rendering the visual badge
//
// Adapted from the prior-session bundle.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function freshCard(tplId, stickers, opts) {
  opts = opts || {};
  const tpl = CARDS[tplId];
  return {
    tplId,
    name: tpl.name, type: tpl.type, sub: tpl.sub || '',
    keywords: (tpl.keywords || []).slice(),
    extraManaColors: (tpl.extraManaColors || []).slice(),
    cost: tpl.cost ? {...tpl.cost} : undefined,
    mana: tpl.mana,
    power: tpl.power, toughness: tpl.toughness,
    effects: tpl.effects ? JSON.parse(JSON.stringify(tpl.effects)) : undefined,
    triggers: tpl.triggers ? JSON.parse(JSON.stringify(tpl.triggers)) : [],
    abilities: tpl.abilities ? JSON.parse(JSON.stringify(tpl.abilities)) : undefined,
    stickers: stickers || [],
    modifiers: [],
    empowerRolls: opts.empowerRolls || [],
    subtypeRolls: opts.subtypeRolls || [],
    innate: false,
  };
}

console.log('=== applyStickersToCard: each kind mutates correctly ===');

{
  const card = freshCard('savannahLions', ['plus1plus1']);
  applyStickersToCard(card);
  check('statBoost adds modifier with power/toughness',
    card.modifiers.length === 1 && card.modifiers[0].power === 1 && card.modifiers[0].toughness === 1);
}

{
  const card = freshCard('savannahLions', ['kw_flying']);
  applyStickersToCard(card);
  check("keyword adds 'flying' to card.keywords", card.keywords.includes('flying'));
}

{
  const card = freshCard('furnaceWhelp', ['kw_flying']);
  applyStickersToCard(card);
  const flyingCount = card.keywords.filter(k => k === 'flying').length;
  check('keyword: dedup (no double-flying on Furnace Whelp)', flyingCount === 1);
}

{
  const card = freshCard('plains', ['innate']);
  applyStickersToCard(card);
  check('innate sets card.innate = true', card.innate === true);
}

{
  const card = freshCard('plains', ['landColor_R']);
  applyStickersToCard(card);
  check("landColor adds 'R' to extraManaColors", (card.extraManaColors || []).includes('R'));
}

{
  const card = freshCard('plains', ['landColor_W']);
  applyStickersToCard(card);
  check("landColor: doesn't add native 'W' to extraManaColors",
    !(card.extraManaColors || []).includes('W'));
}

{
  const card = freshCard('furnaceWhelp', ['costMinus1']);
  const before = card.cost.C;
  applyStickersToCard(card);
  check('costReduction reduces card.cost.C by 1', card.cost.C === before - 1,
    'before=' + before + ' after=' + card.cost.C);
}

{
  const roll = { location: 'abilities', subIdx: 0, effIdx: 0, modeIdx: null, field: 'amount' };
  const card = freshCard('spitfireBastion', ['empower'], { empowerRolls: [roll] });
  applyStickersToCard(card);
  const ability = card.abilities[0];
  const eff = ability.effects[0];
  check('empower bumps the targeted field', eff.amount === 2, 'amount=' + eff.amount);
}

{
  const card = freshCard('savannahLions', ['subtype'], { subtypeRolls: ['Beast'] });
  applyStickersToCard(card);
  check('subtype appends rolled subtype to card.sub', card.sub.includes('Beast'));
  check('subtype preserves native Cat', card.sub.includes('Cat'));
}

{
  const card = freshCard('savannahLions', ['subtype'], { subtypeRolls: ['Cat'] });
  applyStickersToCard(card);
  const tokens = card.sub.split(/\s+/).filter(Boolean);
  const catCount = tokens.filter(t => t === 'Cat').length;
  check('subtype: dedup (no double-Cat)', catCount === 1);
}

console.log('\n=== stickersForSlot: each kind reflects into view correctly ===');

{
  const slot = { tplId: 'savannahLions', stickers: ['plus1plus1'] };
  const result = stickersForSlot(slot, ['W']);
  check('statBoost re-offerable (stackable)', result.some(s => s.id === 'plus1plus1'));
}

{
  const slot = { tplId: 'savannahLions', stickers: ['kw_flying'] };
  const result = stickersForSlot(slot, ['W']);
  check('keyword kw_flying not re-offered', !result.some(s => s.id === 'kw_flying'));
  check('other keywords still offered (e.g., kw_lifelink)', result.some(s => s.id === 'kw_lifelink'));
}

{
  const slot = { tplId: 'plains', stickers: ['innate'] };
  const result = stickersForSlot(slot, ['W']);
  check('innate not re-offered after applied', !result.some(s => s.id === 'innate'));
}

{
  const slot = { tplId: 'plains', stickers: ['landColor_R'] };
  const result = stickersForSlot(slot, ['W','R']);
  const offeredColors = result.filter(s => s.kind === 'landColor').map(s => s.color);
  check('landColor_R not re-offered', !offeredColors.includes('R'));
  check('native W still suppressed', !offeredColors.includes('W'));
}

{
  const slot = { tplId: 'furnaceWhelp', stickers: ['costMinus1', 'costMinus1'] };
  const result = stickersForSlot(slot, ['R']);
  check('costMinus1 not offered when C already 0',
    !result.some(s => s.id === 'costMinus1'),
    '(after 2 reductions, generic is at floor)');
}

{
  const slot = { tplId: 'spitfireBastion', stickers: ['empower'] };
  const result = stickersForSlot(slot, ['R']);
  check('empower stackable - still offered', result.some(s => s.id === 'empower'));
}

{
  const slot = { tplId: 'savannahLions', stickers: ['subtype'], subtypeRolls: ['Beast'] };
  const result = stickersForSlot(slot, ['W','G']);
  check('subtype re-offerable (stackable)', result.some(s => s.id === 'subtype'));
}

console.log('\n=== stickerBadgesHtml: each kind renders correctly ===');

{
  const html = stickerBadgesHtml(['plus1plus1']);
  check("statBoost badge contains '+1/+1'", html.includes('+1/+1'));
  check("statBoost badge has 'stat' class", html.includes('stk-badge stat'));
}

{
  const html = stickerBadgesHtml(['kw_flying']);
  check("keyword badge contains 'flying'", html.includes('flying'));
  check("keyword badge has 'skw' class", html.includes('stk-badge skw'));
}

{
  const html = stickerBadgesHtml(['innate']);
  check("innate badge contains 'Innate'", html.includes('Innate'));
  check("innate badge has 'innate' class", html.includes('stk-badge innate'));
}

{
  const html = stickerBadgesHtml(['landColor_R']);
  check("landColor badge contains '+{R}'", html.includes('+{R}'));
}

{
  const html = stickerBadgesHtml(['costMinus1']);
  check("costReduction badge contains '-1 cost'", html.includes('-1 cost'));
}

{
  const roll = { location: 'abilities', subIdx: 0, effIdx: 0, modeIdx: null, field: 'amount' };
  const html = stickerBadgesHtml(['empower'], false, [roll], 'spitfireBastion');
  check("empower badge contains 'Empower'", html.includes('Empower'));
}

{
  const html = stickerBadgesHtml(['subtype'], false, [], 'savannahLions', null, ['Beast']);
  check("subtype badge contains rolled type 'Beast'", html.includes('Beast'));
}

{
  const html = stickerBadgesHtml(['plus1plus1', 'plus1plus1']);
  check("statBoost stacking shows multiplier", html.includes('×2'));
}

{
  const html = stickerBadgesHtml(['plus1plus1', 'innate', 'kw_flying']);
  const innateIdx = html.indexOf('Innate');
  const plusIdx = html.indexOf('+1/+1');
  check('innate badge renders before others',
    innateIdx >= 0 && innateIdx < plusIdx,
    'innate@' + innateIdx + ' plus@' + plusIdx);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
