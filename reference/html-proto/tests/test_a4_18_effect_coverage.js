// Audit A4-18 (re-scoped remainder) — most of the originally-named dark effect
// handlers were already fenced by the shipped chunk-4 STAGE-fix regression tests
// (steal, become_copy_of, counter/owner-routing, mass-removal batch, fight/
// trample/deathtouch, the A4-8 filter arms, A4-24 hexproof). This covers the
// TRUE remainder: grant_cast_permission dedup (was 100% mutation-dark) and the
// grant_keyword scope arms. AI-valuation mutants are descoped to chunk-7 (they're
// judgment coefficients, not pinnable); snapshotTarget is already behaviorally
// covered by the D1 tests, so it's not re-fenced here.
const setup = require('./_setup'); setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  ' + (ok?'PASS':'FAIL') + ': ' + label + (info?' -- '+info:'')); if(ok)pass++;else fail++; }

const LANDS12 = Array(12).fill('plains');
RUN.start({ cards: LANDS12.slice(), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS12.slice());
const G = ENGINE.state();

const CREATURE_TPL = (() => {
  for (const [id, c] of Object.entries(CARDS)) if (hasType(c, 'Creature') && !c.triggers && !c.abilities) return id;
  return null;
})();
// Reset keywords so a grant is the ONLY source (the vanilla template may carry
// native keywords, which would pollute the "opp did not gain flying" assertion).
function placeCreature(who){ const c = ENGINE.makeCard(CREATURE_TPL); c.sick = false; c.keywords = []; G[who].battlefield.push(c); return c; }

console.log('=== A4-18: grant_cast_permission dedups for the same card+zone ===');
(() => {
  G.castPermissions = [];
  const victim = ENGINE.makeCard('lightning_bolt'); victim.owner = 'opp'; victim.controller = 'opp';
  G.opp.graveyard = [victim];
  const ctx = { controller: 'you', sourceName: 'Permission Test', sourceIid: -1 };
  const eff = { kind: 'grant_cast_permission', from_zone: 'graveyard', duration: 'eot' };
  const tgt = { kind: 'graveyard_card', iid: victim.iid, controller: 'opp' };
  ENGINE.applyEffect(ctx, eff, tgt);
  check('one permission after first grant', G.castPermissions.length === 1, 'len=' + G.castPermissions.length);
  ENGINE.applyEffect(ctx, eff, tgt);
  check('STILL one permission after duplicate grant (dedup, not two)', G.castPermissions.length === 1, 'len=' + G.castPermissions.length);
  check('permission points at the right card+zone',
    G.castPermissions[0].cardIid === victim.iid && G.castPermissions[0].from_zone === 'graveyard');
})();

console.log('\n=== A4-18: grant_keyword scope:all_yours grants to my side only ===');
(() => {
  G.you.battlefield = []; G.opp.battlefield = [];
  const mine = placeCreature('you'); const theirs = placeCreature('opp');
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Wind', sourceIid: -1 },
    { kind: 'grant_keyword', keyword: 'flying', scope: 'all_yours' }, null);
  check('all_yours: my creature gains flying', mine.keywords.includes('flying'));
  check('all_yours: opp creature does NOT gain flying', !theirs.keywords.includes('flying'));
})();

console.log('\n=== A4-18: grant_keyword scope:all_creatures grants to both sides ===');
(() => {
  G.you.battlefield = []; G.opp.battlefield = [];
  const mine = placeCreature('you'); const theirs = placeCreature('opp');
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Gale', sourceIid: -1 },
    { kind: 'grant_keyword', keyword: 'flying', scope: 'all_creatures' }, null);
  check('all_creatures: both sides gain flying', mine.keywords.includes('flying') && theirs.keywords.includes('flying'));
})();

console.log('\n=== A4-18: grant_keyword single-target already-had is a no-op (no duplicate) ===');
(() => {
  G.you.battlefield = []; G.opp.battlefield = [];
  const c = placeCreature('you'); if (!c.keywords.includes('flying')) c.keywords.push('flying');
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Redundant', sourceIid: -1 },
    { kind: 'grant_keyword', keyword: 'flying' }, { kind: 'creature', iid: c.iid });
  check('already-had: flying not duplicated', c.keywords.filter(k => k === 'flying').length === 1,
    'count=' + c.keywords.filter(k => k === 'flying').length);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
