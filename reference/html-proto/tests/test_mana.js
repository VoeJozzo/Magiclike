// Lands and creature dorks both produce mana through a tap-for-mana ability.
// Covers land/ability consistency, the add_mana choose form (City of Brass),
// summoning-sickness gating (lands vs dorks), the landColor sticker, payMana
// auto-tap, and the land staple-merge.

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
    if (!hasType(tpl, 'Land')) continue;
    const prod = ENGINE.landProducibleColors(tpl);
    if (prod.length === 0) { bad++; console.log('   no mana ability:', tpl.tplId); continue; }
    // 'C' is the colorless-IDENTITY label for an identity-less land (City of
    // Brass taps for any color but has no color identity), so it need not be a
    // produced color. Every other (WUBRG) label must be in the produced set.
    if (tpl.mana && tpl.mana !== 'C' && !prod.includes(tpl.mana)) { bad++; console.log('   mana/ability mismatch:', tpl.tplId, tpl.mana, prod); }
  }
  check('all lands have a tap-ability whose colors include the mana label (C exempt)', bad === 0, 'bad=' + bad);
  check('cityOfBrass taps for all 5 colors', JSON.stringify(ENGINE.landProducibleColors(CARDS.city_of_brass).slice().sort()) === JSON.stringify(['B', 'G', 'R', 'U', 'W']));
  check('plains taps for W only', JSON.stringify(ENGINE.landProducibleColors(CARDS.plains)) === JSON.stringify(['W']));
})();

console.log('\n=== basic land taps for its color the turn it is played (no sickness) ===');
(() => {
  resetMana('you');
  const p = put('you', 'plains');
  ENGINE.executeAction && null;
  setup.startMainPhase('you');
  check('tap is legal', ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: p.iid }));
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: p.iid });
  check('produced {W}', G.you.mana.W === 1 && p.tapped, JSON.stringify(G.you.mana));
})();

console.log('\n=== City of Brass taps for a chosen color (choose:any) ===');
(() => {
  resetMana('you');
  const cob = put('you', 'city_of_brass');
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: cob.iid, color: 'R' });
  check('produced the chosen {R}', G.you.mana.R === 1, JSON.stringify(G.you.mana));
})();

console.log('\n=== creature mana dork is summoning-sick the turn it enters ===');
(() => {
  resetMana('you');
  const dork = put('you', 'llanowar_elves'); dork.sick = true;
  check('sick dork cannot tap for mana', !ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: dork.iid }));
  dork.sick = false;
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: dork.iid });
  check('un-sick dork taps for {G}', G.you.mana.G === 1, JSON.stringify(G.you.mana));
})();

console.log('\n=== landColor sticker extends the tap-ability ===');
(() => {
  const c = ENGINE.makeCard('plains', 'you', null);
  applyOneStickerToRuntimeCard(c, 'land_color_u');
  const prod = ENGINE.landProducibleColors(c).slice().sort();
  check('plains + land_color_u produces W and U', JSON.stringify(prod) === JSON.stringify(['U', 'W']), JSON.stringify(prod));
  G.you.battlefield.push(c); resetMana('you');
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: c.iid, color: 'U' });
  check('taps for the stickered {U}', G.you.mana.U === 1, JSON.stringify(G.you.mana));
})();

console.log('\n=== payMana auto-taps lands for a colored cost ===');
(() => {
  G.you.battlefield = []; resetMana('you');
  put('you', 'plains'); put('you', 'forest');
  ENGINE.payMana('you', { W: 1, G: 1 });
  const tappedCount = G.you.battlefield.filter(c => c.tapped).length;
  check('both lands tapped to pay {W}{G}', tappedCount === 2, 'tapped=' + tappedCount);
})();

console.log('\n=== payMana prefers a fixed land over City of Brass for a needed color ===');
(() => {
  G.you.battlefield = []; resetMana('you');
  const plains = put('you', 'plains');
  const cob = put('you', 'city_of_brass');
  ENGINE.payMana('you', { W: 1 });
  check('the basic Plains was tapped (fixed source preferred)', plains.tapped === true);
  check('City of Brass left untapped (flexibility preserved)', cob.tapped === false);
})();

console.log('\n=== staple: creature + land gains a tap-for-mana ability ===');
(() => {
  if (!ENGINE.synthesizeStapledTemplate) { check('synthesizeStapledTemplate available', false); return; }
  // A vanilla creature + forest → gains a {T}: Add {G} ability.
  const cr = Object.values(CARDS).find(c => hasType(c, 'Creature') && !c.abilities && !isUndraftable(c));
  const merged = ENGINE.synthesizeStapledTemplate(cr.tplId, ['forest']);
  const manaAbs = (merged.abilities || []).filter(ab => ab.cost && ab.cost.tap && ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana');
  check('vanilla creature + forest gains a tap-for-mana ability', manaAbs.length === 1, 'count=' + manaAbs.length);
  check('the gained ability produces {G}', JSON.stringify(ENGINE.landProducibleColors({ types: ['Land'], abilities: manaAbs })) === JSON.stringify(['G']));
  // Card text is regenerated from the merged abilities by describeCardText,
  // not hand-concatenated.
  check('describeCardText regenerates the gained mana ability text', /\{T\}.*add \{G\}/i.test(describeCardText(merged)), JSON.stringify(describeCardText(merged)));
})();

console.log('\n=== City of Brass is a boon: out of draft, but a LEGAL splice staple ===');
(() => {
  // City of Brass is the boon pool's any-color land (draft pick #0), so it is
  // undraftable — but splice exclusion is a SEPARATE axis (`stapleable:false`),
  // and boons without that flag are legal splice components (ratified
  // 2026-07-20). Phylactery carries the flag (its slot-keyed protection can't
  // see stapled components), so it pins the axis actually doing the work.
  check('City of Brass is a boon (undraftable)', isUndraftable(CARDS.city_of_brass));
  const cr = Object.values(CARDS).find(c => hasType(c, 'Creature') && !c.abilities && !isUndraftable(c));
  check('a boon without stapleable:false is accepted as a splice staple',
    isCompatibleStaplePair(cr.tplId, 'city_of_brass'));
  check('stapleable:false (Phylactery) is rejected as a splice staple',
    !isCompatibleStaplePair(cr.tplId, 'phylactery'));
})();

console.log('\n=== staple: land + land merges colors into one choose ability ===');
(() => {
  const merged = ENGINE.synthesizeStapledTemplate('plains', ['island']);
  const colors = ENGINE.landProducibleColors(merged).slice().sort();
  check('plains + island taps for W or U', JSON.stringify(colors) === JSON.stringify(['U', 'W']), JSON.stringify(colors));
  const manaAbs = (merged.abilities || []).filter(ab => ab.cost && ab.cost.tap && ab.effects[0] && ab.effects[0].kind === 'add_mana');
  check('merged land has exactly one mana ability (merged, not duplicated)', manaAbs.length === 1, 'count=' + manaAbs.length);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
