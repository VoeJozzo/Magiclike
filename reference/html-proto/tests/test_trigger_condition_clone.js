// Audit fix A3-13 — generated/bonus triggers are attached as EXACT COPIES at
// copy-time, then diverge independently (Joe's ruling, PR #98 round 4).
//
// Pre-fix, the consumer-side spreads deep-cloned `effects` per element but
// spread the parent trigger — copying the `condition` ARRAY by reference:
//   - makePlayer's Mercurial pool pick:   every game's Mercurial card aliased
//     the module-level MERCURIAL_TRIGGER_POOL entry's condition array — one
//     in-place mutation would contaminate the pool for every later game;
//   - makeCard's bonusTrigger push:       the in-game card aliased the run-
//     persistent slot trigger's condition;
//   - finalizeBuild (Codex):              the slot write AND the live-card
//     push both aliased the assembled trigger's condition (slot <-> card).
// The source constructors (assembleTrigger, trigger-generator) deliberately
// slice — this pins the consumer sites to the same discipline. Latent today
// (nothing mutates trig.condition in place), but normalizeCardEffects already
// rewrites the ADJACENT trig.effects field in place — the trap is one key away.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9800;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
const POOL_LABELS = MERCURIAL_TRIGGER_POOL.map(e => e.label);
const POOL_SNAPSHOT = JSON.parse(JSON.stringify(MERCURIAL_TRIGGER_POOL));
function restorePool() {
  for (let i = 0; i < MERCURIAL_TRIGGER_POOL.length; i++) {
    MERCURIAL_TRIGGER_POOL[i].condition = POOL_SNAPSHOT[i].condition.slice();
  }
}

console.log('=== A3-13 site 1: makePlayer Mercurial pool pick does not alias the global pool ===');
(() => {
  ENGINE.init(
    [{ tplId: 'mercurial_adept' }].concat(Array(11).fill('plains')),
    Array(12).fill('plains'));
  const G = ENGINE.state();
  let merc = null;
  for (const zone of ['hand', 'library', 'battlefield', 'graveyard']) {
    const c = (G.you[zone] || []).find(x => x.tplId === 'mercurial_adept');
    if (c) { merc = c; break; }
  }
  check('Mercurial Adept instantiated', !!merc);
  const trig = merc && (merc.triggers || []).find(t => POOL_LABELS.includes(t.label));
  check('pool-rolled bonus trigger attached', !!trig, trig ? trig.label : '(none)');
  if (trig) {
    const aliased = MERCURIAL_TRIGGER_POOL.some(e => e.condition === trig.condition);
    check('A3-13: card condition array is NOT reference-identical to any pool entry',
      !aliased, aliased ? 'aliases pool entry "' + trig.label + '"' : '');
    // Contamination probe: mutate the card's copy in place; the pool must stay pristine.
    trig.condition.push('__contaminated__');
    const poolClean = JSON.stringify(MERCURIAL_TRIGGER_POOL.map(e => e.condition))
      === JSON.stringify(POOL_SNAPSHOT.map(e => e.condition));
    check('A3-13: mutating the card copy does not contaminate the global pool',
      poolClean,
      poolClean ? '' : 'pool entry now: ' + JSON.stringify(
        (MERCURIAL_TRIGGER_POOL.find(e => e.label === trig.label) || {}).condition));
    restorePool(); // undo any pre-fix contamination so later arms see truth
  } else { fail += 2; console.log('  FAIL x2: (no trigger -- aliasing arms skipped)'); }
})();

console.log('\n=== A3-13 site 2: makeCard bonusTrigger push does not alias the slot trigger ===');
(() => {
  const bt = {
    label: '__bt_test__', event: 'attacks', condition: ['this_card'],
    text: 'test', effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }],
  };
  const card = ENGINE.makeCard('plains', undefined, 0, undefined, undefined, bt);
  const trig = (card.triggers || []).find(t => t.label === '__bt_test__');
  check('bonus trigger attached by makeCard', !!trig);
  if (trig) {
    check('A3-13: card condition is NOT the slot trigger\'s array', trig.condition !== bt.condition);
    trig.condition.push('__x__');
    check('A3-13: mutating the card copy leaves the slot trigger pristine',
      bt.condition.length === 1 && bt.condition[0] === 'this_card',
      'slot condition now: ' + JSON.stringify(bt.condition));
  } else { fail += 2; console.log('  FAIL x2: (no trigger -- aliasing arms skipped)'); }
})();

console.log('\n=== A3-13 site 3: finalizeBuild — slot write and live card diverge independently ===');
(() => {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['G'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  const c = mk('plains', 'you');
  c.slotIdx = 0;
  G.you.hand.push(c);
  // Open the build prompt directly (the Codex draw path sets the same shape).
  G.pendingTriggerBuild = {
    who: 'you', cardIid: c.iid, slotIdx: 0, step: 'condition',
    conditionOptions: generateConditionOptions(),
    chosenCondition: null, effectOptions: null, chosenEffect: null,
    assembledTrigger: null, currentTrigger: null,
  };
  ENGINE.executeAction('you', { type: 'triggerBuildPick', choice: 0 });
  ENGINE.executeAction('you', { type: 'triggerBuildPick', choice: 0 });
  const slot = RUN.getSlots()[0];
  const liveTrig = (c.triggers || []).find(t => t.generated);
  check('build finalized: slot.bonusTrigger written', !!(slot && slot.bonusTrigger));
  check('build finalized: live card carries the generated trigger', !!liveTrig);
  if (slot && slot.bonusTrigger && liveTrig) {
    check('A3-13: live card condition is NOT the slot\'s array',
      liveTrig.condition !== slot.bonusTrigger.condition);
    liveTrig.condition.push('__y__');
    check('A3-13: mutating the live card does not corrupt the run-persistent slot',
      !slot.bonusTrigger.condition.includes('__y__'),
      'slot condition: ' + JSON.stringify(slot.bonusTrigger.condition));
  } else { fail += 2; console.log('  FAIL x2: (build did not finalize -- aliasing arms skipped)'); }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
