// Mass `scope` groundwork for the effects refactor (Slice 3 step 1 /
// decision 2). damage/pump/remove_creature gain a `scope` path
// (all_creatures / all_yours / all_opps) alongside the legacy
// damageAll/pumpAllYours/removeAll handlers. Additive + a semantic no-op for
// existing cards (none use `scope` yet); this exercises the new path directly
// via applyEffect on a booted board.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Boot a minimal game so G + zones exist.
const LANDS12 = Array(12).fill('plains');
RUN.start({ cards: LANDS12.slice(), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS12.slice());
const G = ENGINE.state();

// Pick a vanilla-ish creature template with toughness >= 3 (survives small
// damage so we can assert marked damage rather than death).
const CREATURE_TPL = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && (c.toughness || 0) >= 3
        && !c.triggers && !c.abilities) return id;
  }
  // Fallback: any creature with toughness >= 3.
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && (c.toughness || 0) >= 3) return id;
  }
  return null;
})();

function clearBoards() { G.you.battlefield = []; G.opp.battlefield = []; }
function place(who, tplId) {
  const c = ENGINE.makeCard(tplId || CREATURE_TPL);
  c.sick = false;
  G[who].battlefield.push(c);
  return c;
}
const CTX = { controller: 'you', sourceName: 'Test', sourceIid: -1 };

console.log('=== creaturesInScope ===');
(() => {
  clearBoards();
  place('you'); place('you');
  place('opp');
  check('all_creatures sees both sides', ENGINE.creaturesInScope(CTX, 'all_creatures').length === 3);
  check('all_yours sees only controller', ENGINE.creaturesInScope(CTX, 'all_yours').length === 2);
  check('all_opps sees only opponent', ENGINE.creaturesInScope(CTX, 'all_opps').length === 1);
  check('unknown scope → empty', ENGINE.creaturesInScope(CTX, 'nonsense').length === 0);
  // Non-creatures (lands) excluded.
  const land = ENGINE.makeCard('plains'); G.you.battlefield.push(land);
  check('lands excluded from scope', ENGINE.creaturesInScope(CTX, 'all_yours').length === 2);
})();

console.log('\n=== damage(scope: all_creatures) ===');
(() => {
  clearBoards();
  const a = place('you'), b = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'damage', amount: 2, scope: 'all_creatures' }, null);
  check('your creature took 2', a.damage === 2, 'damage=' + a.damage);
  check('opp creature took 2', b.damage === 2, 'damage=' + b.damage);
})();

console.log('\n=== pump(scope: all_yours) ===');
(() => {
  clearBoards();
  const a = place('you'), b = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'pump', power: 1, toughness: 1, scope: 'all_yours' }, null);
  check('your creature pumped +1/+1', a.tempPower === 1 && a.tempTou === 1);
  check('opp creature NOT pumped', b.tempPower === 0 && b.tempTou === 0);
})();

console.log('\n=== remove_creature(severity:1 tap, scope: all_opps) ===');
(() => {
  clearBoards();
  const a = place('you'), b = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'remove_creature', severity: 1, scope: 'all_opps' }, null);
  check('opp creature tapped', b.tapped === true);
  check('your creature NOT tapped', a.tapped === false);
})();

console.log('\n=== remove_creature(severity:3 destroy, scope: all_creatures) ===');
(() => {
  clearBoards();
  place('you'); place('opp'); place('opp');
  ENGINE.applyEffect(CTX, { kind: 'remove_creature', severity: 3, scope: 'all_creatures' }, null);
  check('all creatures destroyed (battlefields empty)',
    G.you.battlefield.length === 0 && G.opp.battlefield.length === 0,
    `you=${G.you.battlefield.length} opp=${G.opp.battlefield.length}`);
})();

console.log('\n=== single-target path still works (no scope) ===');
(() => {
  clearBoards();
  const a = place('you');
  ENGINE.applyEffect(CTX, { kind: 'remove_creature', severity: 1 }, { kind: 'creature', iid: a.iid });
  check('single-target tap still works', a.tapped === true);
  const b = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'damage', amount: 1 }, { kind: 'creature', iid: b.iid });
  check('single-target damage still works', b.damage === 1, 'damage=' + b.damage);
})();

console.log('\n=== pump duration: eot (temp) vs permanent (counters) ===');
(() => {
  clearBoards();
  const a = place('you');
  ENGINE.applyEffect(CTX, { kind: 'pump', power: 1, toughness: 1 }, { kind: 'creature', iid: a.iid });
  check('eot pump → tempPower/tempTou', a.tempPower === 1 && a.tempTou === 1 && a.permPower === 0);

  clearBoards();
  const b = place('you');
  ENGINE.applyEffect(CTX, { kind: 'pump', power: 1, toughness: 1, duration: 'permanent' }, { kind: 'creature', iid: b.iid });
  check('permanent pump → permPower/permTou (counters)', b.permPower === 1 && b.permTou === 1 && b.tempPower === 0);
})();

console.log('\n=== sacrifice vs annihilate (graveyard contract) ===');
(() => {
  function inZone(who, zone, iid) { return G[who][zone].some(c => c.iid === iid); }

  // sacrifice → goes to graveyard, fires leave/death emits.
  clearBoards();
  const s = place('you');
  const sIid = s.iid;
  ENGINE.applyEffect(CTX, { kind: 'sacrifice' }, { kind: 'creature', iid: sIid });
  check('sacrifice: off battlefield', !inZone('you', 'battlefield', sIid));
  check('sacrifice: in graveyard', inZone('you', 'graveyard', sIid));

  // annihilate → ceases to exist: not on battlefield, NOT in graveyard/exile.
  clearBoards();
  const a = place('you');
  const aIid = a.iid;
  const gyBefore = G.you.graveyard.length, exBefore = G.you.exile.length;
  ENGINE.applyEffect(CTX, { kind: 'annihilate' }, { kind: 'creature', iid: aIid });
  check('annihilate: off battlefield', !inZone('you', 'battlefield', aIid));
  check('annihilate: NOT in graveyard', !inZone('you', 'graveyard', aIid) && G.you.graveyard.length === gyBefore);
  check('annihilate: NOT in exile', !inZone('you', 'exile', aIid) && G.you.exile.length === exBefore);
  check('annihilate: queued no triggers (silent)', (G.pendingTriggers || []).length === 0);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
