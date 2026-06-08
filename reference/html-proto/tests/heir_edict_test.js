// Heir to the Burnt House — a dies-trigger edict that makes the killer
// sacrifice a LAND. The only engine work was making chooses()' filter
// type-symmetric: 'creature' / 'permanent' / 'land' all narrow the same way
// (a chooses filter IS a type), so Land needs no bespoke construction.
//
// Asserts: (1) the 'land' filter is a recognized chooses filter (no boot
// warning); (2) oracle text renders "sacrifices a land" (not "a creature");
// (3) existing creature/permanent edicts are unchanged; (4) end-to-end, when
// the Heir dies the opponent sacrifices a LAND, never a creature.

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };
const setup = require('./_setup');
setup.loadEngine();
console.warn = origWarn;

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 7000;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function drain(G) {
  let safety = 60;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

console.log('=== boot: the land chooses-filter is recognized ===');
check('heir_to_burnt_house loaded', !!CARDS['heir_to_burnt_house']);
check('TARGET_FILTERS includes land', ENGINE.TARGET_FILTERS.has('land'));
check('no Unknown chooses/target filter warning at boot',
  warns.filter(w => /Unknown target\/chooses filter/i.test(w)).length === 0,
  warns.filter(w => /Unknown target\/chooses filter/i.test(w)).join(' | '));

console.log('\n=== oracle text renders the land noun ===');
const txt = describeCardText(CARDS['heir_to_burnt_house']);
check('Heir reads "sacrifices a land"', /sacrifices a land/.test(txt), txt);
check('Heir does NOT read "sacrifices a creature"', !/sacrifices a creature/.test(txt), txt);
check('prototype status helper names land edicts as land',
  edictChoiceNoun('land') === 'land', edictChoiceNoun('land'));
check('diabolic_edict still reads "sacrifices a creature"',
  /sacrifices a creature/.test(describeCardText(CARDS['diabolic_edict'])));
check('prototype status helper names creature edicts as creature',
  edictChoiceNoun('creature') === 'creature', edictChoiceNoun('creature'));
check('vile_edict still reads "rips a permanent"',
  /rips a permanent/.test(describeCardText(CARDS['vile_edict'])));
check('prototype status helper names permanent edicts as permanent',
  edictChoiceNoun('permanent') === 'permanent', edictChoiceNoun('permanent'));

console.log('\n=== end-to-end: the Heir dies → opponent sacrifices a LAND ===');
(() => {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = [];

  const heir = mk('heir_to_burnt_house', 'you'); G.you.battlefield.push(heir);
  const oppLand = mk('forest', 'opp'); G.opp.battlefield.push(oppLand);
  const oppCreature = mk(VANILLA, 'opp'); G.opp.battlefield.push(oppCreature);
  const bolt = mk('lightning_bolt', 'you'); G.you.hand.push(bolt);

  // targetsForFilter must back 'land' (the §3.5 invariant: a filter in
  // TARGET_FILTERS resolves here too) — narrows to lands only, never the creature.
  const landTargets = ENGINE.targetsForFilter('land', 'you');
  check("targetsForFilter('land') resolves the land", landTargets.some(t => t.iid === oppLand.iid));
  check("targetsForFilter('land') excludes the creature", !landTargets.some(t => t.iid === oppCreature.iid));

  // Bolt the Heir (3 dmg kills the 3/3) → its dies-trigger edicts the opponent.
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'creature', iid: heir.iid }] });
  drain(G);

  check('the Heir died (in your graveyard)', G.you.graveyard.some(c => c.iid === heir.iid));
  check('opponent sacrificed its LAND (gone from battlefield)',
    !G.opp.battlefield.some(c => c.iid === oppLand.iid));
  check('the sacrificed land is in the opponent graveyard',
    G.opp.graveyard.some(c => c.iid === oppLand.iid));
  check('opponent creature was NOT sacrificed (a creature is not a legal pick)',
    G.opp.battlefield.some(c => c.iid === oppCreature.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
