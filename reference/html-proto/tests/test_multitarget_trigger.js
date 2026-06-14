// Verifies the unified multi-slot target selection end-to-end via the shared
// TargetSelection component: the AI enumerates multi-target activated abilities
// (Stapler); a stapled multi-target spell's ETB resolves every slot; a human-
// controlled multi-target ETB prompts per choosable slot (forced/implicit slots
// auto-fill); and a stapled distinct_targets ETB resolves onto two DIFFERENT
// creatures.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let iid = 8400;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: iid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function mkStapler(controller) {
  const inst = JSON.parse(JSON.stringify(CARDS.stapler));
  return Object.assign(inst, {
    iid: iid++, tplId: 'stapler', controller, owner: controller,
    tapped: false, sick: false, damage: 0, chargesLeft: 3,
    keywords: [], damagedBySources: new Set(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'opp'; G.priorityHolder = 'opp'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = [];
  return G;
}
const VANILLA = Object.keys(CARDS).find(k =>
  hasType(CARDS[k], 'Creature') && !CARDS[k].triggers && !CARDS[k].abilities
  && !CARDS[k].static_buffs && isSpliceableBase(k));

console.log('=== a multi-target ACTIVATED ability is enumerated via the component ===');
(() => {
  // getLegalActions used to skip abilities with target_slots.length > 1, so the
  // AI never offered the Stapler's two-target cross-product. Now it routes through
  // tsEnumerate like the cast path: one action per (base, staple) target set.
  const G = newGame();
  const stapler = mkStapler('opp'); G.opp.battlefield.push(stapler);
  const base = mk(VANILLA, 'opp'); const stap = mk(VANILLA, 'opp');
  base.sick = false; stap.sick = false;
  G.opp.battlefield.push(base, stap);
  const acts = ENGINE.getLegalActions('opp')
    .filter(a => a.type === 'activateAbility' && a.cardIid === stapler.iid);
  check('multi-target Stapler ability is enumerated as 2-target sets',
    acts.length > 0 && acts.every(a => a.targets && a.targets.length === 2),
    'activateAbility actions=' + acts.length);
})();

console.log('\n=== a stapled MULTI-target spell ETB resolves ALL its slots ===');
(() => {
  // Twin Strike (two pump slots) stapled onto a creature → an ETB trigger with
  // target_slots:[creature, creature] and BARE pump effects. pushTriggerOnStack
  // now routes through TargetSelection.tsAutoPick, which understands target_slots
  // and picks a legal target for EACH slot (the old single-pick logic had no
  // target_slots branch, so the trigger fizzled entirely). Both pumps resolve:
  // two +1/+1 land on the board (sum of tempPower = 2; the auto-picker, lacking a
  // distinct constraint, may stack both on the controller's best creature).
  const G = newGame();
  const staple = ENGINE.makeCard(VANILLA, undefined, 0, undefined, undefined, ['twin_strike']);
  staple.iid = iid++; staple.controller = 'opp'; staple.owner = 'opp';
  G.opp.hand.push(staple);
  const buddy = mk('savannah_lions', 'opp'); buddy.sick = false; // a clear pump target
  G.opp.battlefield.push(buddy);

  const etb = (staple.triggers || []).find(t => t.event === 'card_zone_change');
  check('precondition: the staple carries an ETB trigger with two target_slots',
    !!etb && Array.isArray(etb.target_slots) && etb.target_slots.length === 2,
    etb && JSON.stringify(etb.target_slots && etb.target_slots.length));

  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: staple.iid });
  // Drive priority until the cast + its ETB have fully resolved, then STOP before
  // the turn advances to CLEANUP (which clears tempPower).
  let guard = 0;
  while (guard++ < 50) {
    const onBf = G.opp.battlefield.some(c => c.iid === staple.iid);
    const settled = G.stack.length === 0 && !G.pendingTriggers.length
      && !G.pendingTriggerTarget && !G.pendingOptionalCost;
    if (onBf && settled) break;
    const who = ENGINE.expectedActor();
    if (!who) break;
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who) {
      ENGINE.executeAction(who, { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] });
    } else {
      ENGINE.executeAction(who, { type: 'pass' });
    }
  }
  const sumTemp = [...G.you.battlefield, ...G.opp.battlefield]
    .reduce((s, c) => s + (c.tempPower || 0), 0);
  check('stapled twin_strike ETB resolves both slots — two +1/+1 land (sum 2)',
    sumTemp === 2, 'sum tempPower across board=' + sumTemp);
})();

console.log('\n=== a human-controlled multi-target ETB prompts for EACH slot ===');
(() => {
  // The human builds stapled cards (plays the Stapler on their own creature), so
  // they should CHOOSE the ETB's targets, not have them auto-picked. The trigger
  // prompt now steps through every choosable slot. Distinguishing assertion: the
  // human picks two DIFFERENT creatures (a, b) — auto-pick would instead stack
  // both pumps on the single best creature (a.tempPower=2, b=0).
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = [];
  const staple = ENGINE.makeCard(VANILLA, undefined, 0, undefined, undefined, ['twin_strike']);
  staple.iid = iid++; staple.controller = 'you'; staple.owner = 'you';
  G.you.hand.push(staple);
  const a = mk('savannah_lions', 'you'); const b = mk('benalish_hero', 'you');
  a.sick = false; b.sick = false;
  G.you.battlefield.push(a, b);

  ENGINE.executeAction('you', { type: 'castSpell', cardIid: staple.iid });
  const picks = [a, b]; let pickIdx = 0, promptedSlots = 0, guard = 0;
  while (guard++ < 60) {
    const onBf = G.you.battlefield.some(c => c.iid === staple.iid);
    const settled = G.stack.length === 0 && !G.pendingTriggers.length
      && !G.pendingTriggerTarget && !G.pendingOptionalCost;
    if (onBf && settled) break;
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
      promptedSlots++;
      const pick = picks[pickIdx++] || picks[0];
      ENGINE.executeAction('you', { type: 'triggerTargetPick',
        target: { kind: 'creature', iid: pick.iid, label: pick.name } });
      continue;
    }
    const who = ENGINE.expectedActor(); if (!who) break;
    ENGINE.executeAction(who, { type: 'pass' });
  }
  check('human is prompted for BOTH target slots', promptedSlots === 2, 'prompts=' + promptedSlots);
  check('each human-chosen creature got exactly +1/+1 (choices honored, not auto-picked)',
    a.tempPower === 1 && b.tempPower === 1, 'a.tempPower=' + a.tempPower + ' b.tempPower=' + b.tempPower);
})();

console.log('\n=== a stapled controller-gated multi-target ETB resolves BOTH slots (tap opp, pump self) ===');
(() => {
  // Roots and Branches (slots = [tap an opponent's creature][pump your own]) stapled
  // onto a creature → an ETB trigger carrying the slots + distinct_targets via
  // mergeStapleInto. Controlled by 'opp', so slot0 (controller:opp) targets a 'you'
  // creature and slot1 (controller:self) an 'opp' creature. The opponent path
  // AUTO-picks (tsAutoPick) and must fill each slot from the correct side.
  const G = newGame();
  const staple = ENGINE.makeCard(VANILLA, undefined, 0, undefined, undefined, ['roots_and_branches']);
  staple.iid = iid++; staple.controller = 'opp'; staple.owner = 'opp';
  G.opp.hand.push(staple);
  const mine = mk('savannah_lions', 'you');   // slot0 tap target (opponent-of-staple)
  const theirs = mk('benalish_hero', 'opp');  // slot1 pump target (staple's own side)
  mine.sick = false; theirs.sick = false;
  G.you.battlefield.push(mine); G.opp.battlefield.push(theirs);

  const etb = (staple.triggers || []).find(t => t.event === 'card_zone_change');
  check('precondition: stapled ETB carries distinct_targets + two slots',
    !!etb && etb.distinct_targets === true && Array.isArray(etb.target_slots) && etb.target_slots.length === 2,
    etb && JSON.stringify([etb.distinct_targets, etb.target_slots && etb.target_slots.length]));

  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: staple.iid });
  let guard = 0;
  while (guard++ < 50) {
    const onBf = G.opp.battlefield.some(c => c.iid === staple.iid);
    const settled = G.stack.length === 0 && !G.pendingTriggers.length
      && !G.pendingTriggerTarget && !G.pendingOptionalCost;
    if (onBf && settled) break;
    const who = ENGINE.expectedActor();
    if (!who) break;
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who) {
      ENGINE.executeAction(who, { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] });
    } else {
      ENGINE.executeAction(who, { type: 'pass' });
    }
  }
  const allBf = G.you.battlefield.concat(G.opp.battlefield);
  const tapped = allBf.filter(c => c.tapped);
  const pumped = allBf.filter(c => (c.tempPower || 0) === 1);
  check('stapled ETB tapped exactly one creature and pumped exactly one',
    tapped.length === 1 && pumped.length === 1,
    'tapped=' + tapped.length + ' pumped=' + pumped.length);
  check('tap hit the opponent-of-staple side, pump hit the staple side (slots honored)',
    !!(tapped[0] && pumped[0]) && tapped[0].controller === 'you' && pumped[0].controller === 'opp',
    'tapCtrl=' + (tapped[0] && tapped[0].controller) + ' pumpCtrl=' + (pumped[0] && pumped[0].controller));
})();

console.log('\n=== distinct_targets on the TRIGGER auto-pick path, in isolation (same-controller slots) ===');
(() => {
  // The cross-slot distinct rule on the auto-pick path, where controller can't
  // co-enforce it: re-point a stapled Roots and Branches ETB to TWO self slots and
  // keep the flag (the "tap/pump two DIFFERENT creatures you control" shape). The
  // auto-picker must choose a DIFFERENT creature per slot — not valid[0] twice.
  const G = newGame();
  const staple = ENGINE.makeCard(VANILLA, undefined, 0, undefined, undefined, ['roots_and_branches']);
  staple.iid = iid++; staple.controller = 'opp'; staple.owner = 'opp';
  G.opp.hand.push(staple);
  const etb = (staple.triggers || []).find(t => t.event === 'card_zone_change');
  etb.target_slots = [{ target: 'creature', filter: { controller: 'self' } },
                      { target: 'creature', filter: { controller: 'self' } }];
  const c1 = mk('savannah_lions', 'opp'); const c2 = mk('benalish_hero', 'opp');
  c1.sick = false; c2.sick = false;
  G.opp.battlefield.push(c1, c2);

  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: staple.iid });
  let guard = 0;
  while (guard++ < 50) {
    const onBf = G.opp.battlefield.some(c => c.iid === staple.iid);
    const settled = G.stack.length === 0 && !G.pendingTriggers.length
      && !G.pendingTriggerTarget && !G.pendingOptionalCost;
    if (onBf && settled) break;
    const who = ENGINE.expectedActor();
    if (!who) break;
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who) {
      ENGINE.executeAction(who, { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] });
    } else {
      ENGINE.executeAction(who, { type: 'pass' });
    }
  }
  const bf = G.opp.battlefield;
  const tapped = bf.filter(c => c.tapped);
  const pumped = bf.filter(c => (c.tempPower || 0) === 1);
  check('same-controller distinct ETB tapped one and pumped one',
    tapped.length === 1 && pumped.length === 1, 'tapped=' + tapped.length + ' pumped=' + pumped.length);
  check('distinct rule forced two DIFFERENT creatures (not valid[0] twice)',
    !!(tapped[0] && pumped[0]) && tapped[0].iid !== pumped[0].iid,
    'tappedIid=' + (tapped[0] && tapped[0].iid) + ' pumpedIid=' + (pumped[0] && pumped[0].iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
