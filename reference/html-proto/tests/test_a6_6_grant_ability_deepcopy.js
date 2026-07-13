// Audit A6-6 — a granted activated ability must be DEEP-copied so two cards
// built from one shared (registry-singleton) descriptor don't alias a nested
// field. Latent today (only inline descriptors use grant_activated_ability),
// but the day a registry grant sticker exists, a one-level copy would share
// effects[].types / cost sub-objects across every card built from it.
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// One SHARED descriptor (simulates a future STICKERS['grant_x'] singleton) with
// a nested array (effect.types) and a nested object (ability.cost).
const SHARED = { kind: 'grant_activated_ability',
  ability: { cost: { C: 1 }, effects: [{ kind: 'set_types', types: ['Artifact'] }] } };

console.log('=== A6-6: nested ability field is not aliased across cards ===');
(() => {
  const a = { abilities: [], keywords: [] };
  const b = { abilities: [], keywords: [] };
  applyStickerKindEffect(a, SHARED);
  applyStickerKindEffect(b, SHARED);
  a.abilities[0].effects[0].types.push('Creature');
  check('mutating card A nested types does NOT leak to card B',
    !b.abilities[0].effects[0].types.includes('Creature'),
    'B.types=' + JSON.stringify(b.abilities[0].effects[0].types));
  check('A and B have distinct effects arrays', a.abilities[0].effects !== b.abilities[0].effects);
  check('A and B have distinct cost objects', a.abilities[0].cost !== b.abilities[0].cost);
  check('the SHARED source was not mutated',
    JSON.stringify(SHARED.ability.effects[0].types) === JSON.stringify(['Artifact']));
})();

console.log('\n=== A6-6: granted trigger is also deep-copied (same latent shape) ===');
(() => {
  const SHARED_T = { kind: 'trigger',
    trigger: { event: 'onEnter', effects: [{ kind: 'set_types', types: ['Land'] }] } };
  const a = { triggers: [] };
  const b = { triggers: [] };
  applyStickerKindEffect(a, SHARED_T);
  applyStickerKindEffect(b, SHARED_T);
  a.triggers[0].effects[0].types.push('Creature');
  check('mutating card A granted-trigger nested types does NOT leak to B',
    !b.triggers[0].effects[0].types.includes('Creature'),
    'B.types=' + JSON.stringify(b.triggers[0].effects[0].types));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
