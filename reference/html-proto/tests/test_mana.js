// §3.9 mana deep-clean: lands and creature dorks both produce mana through a
// tap-for-mana ability (the extraManaColors parallel model is retired). Covers
// land/ability consistency, the addMana choose form (City of Brass), summoning-
// sickness gating (lands vs dorks), the landColor sticker, payMana auto-tap, and
// the land staple-merge.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
RUN.startNextGame();
const G = ENGINE.state();
function resetMana(who) { G[who].mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }; }
function put(who, tplId) { const c = ENGINE.makeCard(tplId, who, null); G[who].battlefield.push(c); return c; }

console.log('=== every Land template: mana label is in its tap-ability colors ===');
(() => {
  let bad = 0;
  for (const tpl of Object.values(CARDS)) {
    if (tpl.type !== 'Land') continue;
    const prod = ENGINE.landProducibleColors(tpl);
    if (prod.length === 0) { bad++; console.log('   no mana ability:', tpl.tplId); continue; }
    if (tpl.mana && !prod.includes(tpl.mana)) { bad++; console.log('   mana/ability mismatch:', tpl.tplId, tpl.mana, prod); }
  }
  check('all lands have a tap-ability whose colors include the mana label', bad === 0, 'bad=' + bad);
  check('cityOfBrass taps for all 5 colors', JSON.stringify(ENGINE.landProducibleColors(CARDS.cityOfBrass).slice().sort()) === JSON.stringify(['B', 'G', 'R', 'U', 'W']));
  check('plains taps for W only', JSON.stringify(ENGINE.landProducibleColors(CARDS.plains)) === JSON.stringify(['W']));
})();

console.log('\n=== basic land taps for its color the turn it is played (no sickness) ===');
(() => {
  resetMana('you');
  const p = put('you', 'plains');
  ENGINE.executeAction && null;
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1'; G.stack = []; G.priority = { passes: new Set() };
  check('tap is legal', ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: p.iid }));
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: p.iid });
  check('produced {W}', G.you.mana.W === 1 && p.tapped, JSON.stringify(G.you.mana));
})();

console.log('\n=== City of Brass taps for a chosen color (choose:any) ===');
(() => {
  resetMana('you');
  const cob = put('you', 'cityOfBrass');
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: cob.iid, color: 'R' });
  check('produced the chosen {R}', G.you.mana.R === 1, JSON.stringify(G.you.mana));
})();

console.log('\n=== creature mana dork is summoning-sick the turn it enters ===');
(() => {
  resetMana('you');
  const dork = put('you', 'elves'); dork.sick = true;
  check('sick dork cannot tap for mana', !ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: dork.iid }));
  dork.sick = false;
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: dork.iid });
  check('un-sick dork taps for {G}', G.you.mana.G === 1, JSON.stringify(G.you.mana));
})();

console.log('\n=== landColor sticker extends the tap-ability ===');
(() => {
  const c = ENGINE.makeCard('plains', 'you', null);
  // Apply a land_color_u sticker through the runtime sticker path (takes the id).
  applyOneStickerToRuntimeCard(c, 'land_color_u');
  const prod = ENGINE.landProducibleColors(c).slice().sort();
  check('plains + land_color_u produces W and U', JSON.stringify(prod) === JSON.stringify(['U', 'W']), JSON.stringify(prod));
  // Tapping it for the stickered color works.
  G.you.battlefield.push(c); resetMana('you');
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: c.iid, color: 'U' });
  check('taps for the stickered {U}', G.you.mana.U === 1, JSON.stringify(G.you.mana));
})();

console.log('\n=== payMana auto-taps lands for a colored cost ===');
(() => {
  G.you.battlefield = []; resetMana('you');
  put('you', 'plains'); put('you', 'forest');
  ENGINE.payMana('you', { W: 1, G: 1 });  // auto-taps both lands
  const tappedCount = G.you.battlefield.filter(c => c.tapped).length;
  check('both lands tapped to pay {W}{G}', tappedCount === 2, 'tapped=' + tappedCount);
})();

console.log('\n=== payMana prefers a fixed land over City of Brass for a needed color ===');
(() => {
  G.you.battlefield = []; resetMana('you');
  const plains = put('you', 'plains');
  const cob = put('you', 'cityOfBrass');
  ENGINE.payMana('you', { W: 1 });  // both can make W; the fixed plains should be spent
  check('the basic Plains was tapped (fixed source preferred)', plains.tapped === true);
  check('City of Brass left untapped (flexibility preserved)', cob.tapped === false);
})();

console.log('\n=== staple: creature + land gains a tap-for-mana ability ===');
(() => {
  if (!ENGINE.synthesizeStapledTemplate) { check('synthesizeStapledTemplate available', false); return; }
  // A vanilla creature + forest → gains a {T}: Add {G} ability.
  const cr = Object.values(CARDS).find(c => c.type === 'Creature' && !c.abilities && !c.special);
  const merged = ENGINE.synthesizeStapledTemplate(cr.tplId, ['forest']);
  const manaAbs = (merged.abilities || []).filter(ab => ab.cost && ab.cost.tap && ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana');
  check('vanilla creature + forest gains a tap-for-mana ability', manaAbs.length === 1, 'count=' + manaAbs.length);
  check('the gained ability produces {G}', JSON.stringify(ENGINE.landProducibleColors({ type: 'Land', abilities: manaAbs })) === JSON.stringify(['G']));
  // §3.10: appendMergedText removed — card text is regenerated from the merged
  // abilities by describeCardText (not hand-concatenated).
  check('describeCardText regenerates the gained mana ability text', /\{T\}.*add \{G\}/i.test(describeCardText(merged)), JSON.stringify(describeCardText(merged)));
})();

console.log('\n=== staple: §3.10 multi-color land (City of Brass) is now a valid staple ===');
(() => {
  const cr = Object.values(CARDS).find(c => c.type === 'Creature' && !c.abilities && !c.special);
  check('City of Brass onto a creature is now compatible (rejection lifted)',
    isCompatibleStaplePair(cr.tplId, 'cityOfBrass'));
  const merged = ENGINE.synthesizeStapledTemplate(cr.tplId, ['cityOfBrass']);
  const manaAb = (merged.abilities || []).find(ab => ab.cost && ab.cost.tap && ab.effects[0] && ab.effects[0].kind === 'addMana');
  check('the gained ability taps for all 5 colors (choose form)',
    manaAb && JSON.stringify(manaEffectColors(manaAb.effects[0]).slice().sort()) === JSON.stringify(['B', 'G', 'R', 'U', 'W']),
    JSON.stringify(manaAb && manaAb.effects[0]));
})();

console.log('\n=== staple: land + land merges colors into one choose ability ===');
(() => {
  const merged = ENGINE.synthesizeStapledTemplate('plains', ['island']);
  const colors = ENGINE.landProducibleColors(merged).slice().sort();
  check('plains + island taps for W or U', JSON.stringify(colors) === JSON.stringify(['U', 'W']), JSON.stringify(colors));
  const manaAbs = (merged.abilities || []).filter(ab => ab.cost && ab.cost.tap && ab.effects[0] && ab.effects[0].kind === 'addMana');
  check('merged land has exactly one mana ability (merged, not duplicated)', manaAbs.length === 1, 'count=' + manaAbs.length);
})();

console.log('\n=== §3.8 grant_mana_ability generalizes to any permanent ===');
(() => {
  // A creature with no mana ability gains a {T}: Add {G} when granted one.
  const cr = Object.values(CARDS).find(c => c.type === 'Creature' && !c.abilities && !c.special);
  const c = ENGINE.makeCard(cr.tplId, [{ kind: 'grant_mana_ability', color: 'G', stackable: true }]);
  const ab = (c.abilities || []).find(a => a.cost && a.cost.tap && a.effects && a.effects[0] && a.effects[0].kind === 'addMana');
  check('creature gained a tap-for-mana ability (created, not just extended)', !!ab);
  check('the created ability produces {G}', ab && JSON.stringify(ab.effects[0].amounts) === JSON.stringify({ G: 1 }));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
