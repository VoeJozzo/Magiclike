// The id-keyed guard only fires when ability_id is present; an id-less
// grant re-pushes on recast. This test pins that behavior so any change to
// it is a deliberate ruling, not a silent regression.
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const mkCard = () => ({ tplId: 'x', name: 'x', abilities: [], stickers: [] });
const grant = (id) => ({ kind: 'grant_activated_ability', ability_id: id,
  ability: { cost: { C: 1 }, effects: [{ kind: 'add_mana', color: 'R', amount: 1 }] } });

console.log('=== A6-5: ability_id PRESENT dedups on recast ===');
(() => {
  const card = mkCard();
  applyOneStickerToRuntimeCard(card, grant('AT_react'));
  applyOneStickerToRuntimeCard(card, grant('AT_react'));
  const n = card.abilities.filter(a => a && a._sticker_ability_id === 'AT_react').length;
  check('id-keyed grant deduped (count 1)', n === 1, 'count=' + n);
})();

console.log('\n=== A6-5: ability_id ABSENT — current behavior (no dedup) ===');
(() => {
  const card = mkCard();
  applyOneStickerToRuntimeCard(card, grant(undefined));
  applyOneStickerToRuntimeCard(card, grant(undefined));
  check('id-less grant re-pushes (count 2, current behavior pinned)',
    card.abilities.length === 2, 'count=' + card.abilities.length);
  check('each granted ability carries its own copied cost (not shared) [A6-6]',
    card.abilities[0].cost !== card.abilities[1].cost);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
