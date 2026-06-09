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
    name: tpl.name, types: Array.isArray(tpl.types) ? tpl.types.slice() : [],
    keywords: (tpl.keywords || []).slice(),
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
  };
}

console.log('=== applyStickersToCard: each kind mutates correctly ===');

{
  const card = freshCard('savannah_lions', ['plus1_plus1']);
  applyStickersToCard(card);
  check('statBoost adds modifier with power/toughness',
    card.modifiers.length === 1 && card.modifiers[0].power === 1 && card.modifiers[0].toughness === 1);
}

{
  const card = freshCard('savannah_lions', ['kw_flying']);
  applyStickersToCard(card);
  check("keyword adds 'flying' to card.keywords", card.keywords.includes('flying'));
}

{
  const card = freshCard('furnace_whelp', ['kw_flying']);
  applyStickersToCard(card);
  const flyingCount = card.keywords.filter(k => k === 'flying').length;
  check('keyword: dedup (no double-flying on Furnace Whelp)', flyingCount === 1);
}

{
  // remove_keyword: lose_defender strips a Wall's (subtype-derived) defender so it can attack.
  const card = freshCard('wall_of_omens', ['lose_defender']);
  ENGINE.applySubtypeKeywords(card);   // Wall→defender is derived, not printed on the card
  check('lose_defender precondition: wall_of_omens has defender via its Wall subtype',
    card.keywords.includes('defender'));
  applyStickersToCard(card);
  check("remove_keyword strips 'defender' from card.keywords",
    !card.keywords.includes('defender'));
  check('canCreatureAttack true once defender removed (untapped, not sick)',
    ENGINE.canCreatureAttack({...card, tapped: false, sick: false}));
}

{
  const card = freshCard('plains', ['innate']);
  applyStickersToCard(card);
  check("innate adds 'innate' to card.keywords", (card.keywords || []).includes('innate'));
}

{
  const card = freshCard('plains', ['land_color_r']);
  applyStickersToCard(card);
  // §3.9: landColor extends the tap-ability; producible colors read from it.
  const prod = ENGINE.landProducibleColors(card);
  check("landColor adds 'R' to the land's producible colors", prod.includes('R'));
  check("landColor keeps the native 'W'", prod.includes('W'));
}

{
  const card = freshCard('plains', ['land_color_w']);
  applyStickersToCard(card);
  // Adding the native color is a no-op — still just W (no duplicate / no choose).
  check("landColor: native 'W' stays single-color", JSON.stringify(ENGINE.landProducibleColors(card)) === JSON.stringify(['W']));
}

{
  const card = freshCard('furnace_whelp', ['cost_minus_1']);
  const before = card.cost.C;
  applyStickersToCard(card);
  check('costReduction reduces card.cost.C by 1', card.cost.C === before - 1,
    'before=' + before + ' after=' + card.cost.C);
}

// §3.8: inline parameterized stickers ({kind,...} descriptors) — cost_mod /
// set_color — flow through the batch (applyStickersToCard) path.
{
  const card = freshCard('furnace_whelp', [{ kind: 'cost_mod', amount: 2, stackable: true }]);
  const before = card.cost.C;
  applyStickersToCard(card);
  check('cost_mod +2 raises card.cost.C by 2', card.cost.C === before + 2,
    'before=' + before + ' after=' + card.cost.C);
}
{
  const card = freshCard('furnace_whelp', [{ kind: 'set_color', color: 'C' }]);
  applyStickersToCard(card);
  check('set_color sets card.color to C', card.color === 'C', 'color=' + card.color);
}
{
  // Mixed string + inline descriptors in one slot's sticker list.
  const card = freshCard('furnace_whelp', ['plus1_plus1', { kind: 'cost_mod', amount: 1, stackable: true }]);
  const before = card.cost.C;
  applyStickersToCard(card);
  check('mixed string + inline stickers both apply',
    card.modifiers.some(m => m.power === 1) && card.cost.C === before + 1);
}

{
  const roll = { location: 'abilities', subIdx: 0, effIdx: 0, modeIdx: null, field: 'amount' };
  const card = freshCard('spitfire_bastion', ['empower'], { empowerRolls: [roll] });
  applyStickersToCard(card);
  const ability = card.abilities[0];
  const eff = ability.effects[0];
  check('empower bumps the targeted field', eff.amount === 2, 'amount=' + eff.amount);
}

{
  const card = freshCard('savannah_lions', ['subtype'], { subtypeRolls: ['Beast'] });
  applyStickersToCard(card);
  check('subtype appends rolled subtype to types[]', hasType(card, 'Beast'));
  check('subtype preserves native Cat', hasType(card, 'Cat'));
}

{
  const card = freshCard('savannah_lions', ['subtype'], { subtypeRolls: ['Cat'] });
  applyStickersToCard(card);
  const tokens = subtypesOf(card);
  const catCount = tokens.filter(t => t === 'Cat').length;
  check('subtype: dedup (no double-Cat)', catCount === 1);
}

console.log('\n=== stickersForSlot: each kind reflects into view correctly ===');

{
  const slot = { tplId: 'savannah_lions', stickers: ['plus1_plus1'] };
  const result = stickersForSlot(slot, ['W']);
  check('statBoost re-offerable (stackable)', result.some(s => s.id === 'plus1_plus1'));
}

{
  const slot = { tplId: 'savannah_lions', stickers: ['kw_flying'] };
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
  const slot = { tplId: 'plains', stickers: ['land_color_r'] };
  const result = stickersForSlot(slot, ['W','R']);
  const offeredColors = result.filter(s => s.kind === 'land_color').map(s => s.color);
  check('land_color_r not re-offered', !offeredColors.includes('R'));
  check('native W still suppressed', !offeredColors.includes('W'));
}

{
  const slot = { tplId: 'furnace_whelp', stickers: ['cost_minus_1', 'cost_minus_1'] };
  const result = stickersForSlot(slot, ['R']);
  check('costMinus1 not offered when C already 0',
    !result.some(s => s.id === 'cost_minus_1'),
    '(after 2 reductions, generic is at floor)');
}

{
  const slot = { tplId: 'spitfire_bastion', stickers: ['empower'] };
  const result = stickersForSlot(slot, ['R']);
  check('empower stackable - still offered', result.some(s => s.id === 'empower'));
}

{
  const slot = { tplId: 'savannah_lions', stickers: ['subtype'], subtypeRolls: ['Beast'] };
  const result = stickersForSlot(slot, ['W','G']);
  check('subtype re-offerable (stackable)', result.some(s => s.id === 'subtype'));
}

{
  // lose_defender: offered on a defender creature, gated off non-defenders, and
  // not re-offered once applied (view reflects the removal).
  const wall = stickersForSlot({ tplId: 'wall_of_omens', stickers: [] }, ['W']);
  check('lose_defender offered on a defender creature', wall.some(s => s.id === 'lose_defender'));
  const lion = stickersForSlot({ tplId: 'savannah_lions', stickers: [] }, ['W']);
  check('lose_defender NOT offered on a non-defender creature', !lion.some(s => s.id === 'lose_defender'));
  const applied = stickersForSlot({ tplId: 'wall_of_omens', stickers: ['lose_defender'] }, ['W']);
  check('lose_defender NOT re-offered once applied', !applied.some(s => s.id === 'lose_defender'));
}

console.log('\n=== stickerBadgesHtml: only non-redundant kinds render (Q2) ===');

// KEPT — info no other frame element surfaces. (grant_mana_ability is also a
// kept kind, but no registry sticker uses it post-Q3 — land stickers are now
// add_type — so it's exercised only by inline/boss descriptors, not here.)
{
  const roll = { location: 'abilities', subIdx: 0, effIdx: 0, modeIdx: null, field: 'amount' };
  const html = stickerBadgesHtml(['empower'], false, [roll], 'spitfire_bastion');
  check('empower badge still renders', html.includes('Empower'));
}
{
  // remove_keyword (lose_defender) — its effect (absence of Defender) isn't
  // shown anywhere else, so the badge stays.
  const html = stickerBadgesHtml(['lose_defender']);
  check('lose_defender (remove_keyword) badge still renders', html.includes('Loses Defender'));
}

// DROPPED — already shown in oracle text / type line / P-T box / cost box.
{
  check('statBoost badge suppressed (shown in P/T box)', stickerBadgesHtml(['plus1_plus1']) === '');
  check('keyword badge suppressed (shown in oracle text)', stickerBadgesHtml(['kw_flying']) === '');
  check('innate badge suppressed (shown in oracle text)', stickerBadgesHtml(['innate']) === '');
  check('costReduction badge suppressed (shown in cost box)', stickerBadgesHtml(['cost_minus_1']) === '');
  check('subtype badge suppressed (shown in type line)',
    stickerBadgesHtml(['subtype'], false, [], 'savannah_lions', null, ['Beast']) === '');
  check('land-type (add_type) badge suppressed (shown in type line)',
    stickerBadgesHtml(['land_color_r']) === '');
}
{
  // Mixed: dropped kinds vanish, kept kinds remain.
  const html = stickerBadgesHtml(['plus1_plus1', 'kw_flying', 'lose_defender']);
  check('mixed badges: dropped suppressed, kept shown',
    !html.includes('+1/+1') && !html.includes('Flying') && html.includes('Loses Defender'));
}

console.log('\n=== Q1: sticker-granted text is flagged for coloring ===');

{
  // Sticker-granted keyword → its keyword-preamble segment carries sticker:true.
  const card = freshCard('savannah_lions', ['kw_flying']);
  applyStickersToCard(card);
  const segs = describeCardSegments(card, { skipKeywords: false });
  const flyingSeg = segs.find(s => s.text === 'Flying');
  check('sticker-granted keyword segment flagged sticker:true', !!flyingSeg && flyingSeg.sticker === true);
}
{
  // An intrinsic keyword is NOT flagged (only sticker-granted ones color).
  const card = freshCard('air_elemental', []);  // 4/4 with intrinsic flying
  applyStickersToCard(card);
  const segs = describeCardSegments(card, { skipKeywords: false });
  const flyingSeg = segs.find(s => s.text === 'Flying');
  check('intrinsic keyword segment NOT flagged sticker', !!flyingSeg && !flyingSeg.sticker);
}
{
  // Sticker-granted trigger (Scarified) → marked _from_sticker + segs flagged.
  const card = freshCard('savannah_lions', ['scarified']);
  applyStickersToCard(card);
  const trig = (card.triggers || []).find(t => t._from_sticker);
  check('scarified trigger marked _from_sticker', !!trig);
  const segs = describeCardSegments(card, { skipKeywords: false });
  check('scarified trigger segments flagged sticker:true', segs.some(s => s.sticker === true));
}
{
  // segmentsToHtml turns the flag into a .sticker-granted span; plain text isn't wrapped.
  const flagged = segmentsToHtml([{ text: 'Flying', sticker: true }]);
  check('segmentsToHtml emits .sticker-granted span', flagged.includes('class="sticker-granted"'));
  const plain = segmentsToHtml([plainSeg('Flying')]);
  check('segmentsToHtml leaves unflagged text unwrapped', !plain.includes('<span'));
}

console.log('\n=== Q3: land-color stickers add a land type (mana autogranted) ===');

{
  // 'Also a Mountain' adds the Mountain subtype to a Plains; the §305.6 autogrant
  // then yields red mana. The native white production is preserved.
  const card = freshCard('plains', ['land_color_r']);
  applyStickersToCard(card);
  check('land_color_r adds the Mountain land type', hasType(card, 'Mountain'));
  check('land_color_r autogrants red mana (305.6)', landProducibleColors(card).includes('R'));
  check('native white mana preserved', landProducibleColors(card).includes('W'));
}
{
  // Re-offer gating runs through the same add_type + autogrant on the slot view.
  const fresh = stickersForSlot({ tplId: 'plains', stickers: [] }, ['W', 'R']);
  check('land_color_r offered on a Plains in a red deck', fresh.some(s => s.id === 'land_color_r'));
  const after = stickersForSlot({ tplId: 'plains', stickers: ['land_color_r'] }, ['W', 'R']);
  check('land_color_r NOT re-offered once applied (view sees the autogranted R)',
    !after.some(s => s.id === 'land_color_r'));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
