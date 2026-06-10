// Step 12 (plan-effects-refactor §1.2 / §10): Stapler's `noop` slot-marker hack
// is gone. The ability now declares `target_slots: [{spliceable_base}, {spliceable
// Staple}]` — two structural slot specs on the ability instead of a fake empty-
// body effect. This test pins the contract `noop` used to provide: the ability
// requires exactly two targets, each validated against its own slot filter, and
// resolution staples the second onto the first.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Two vanilla spliceable creatures (non-special, non-modal → spliceable as base
// AND staple). Pick real ones from the pool.
const baseTpl = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
const stapleTpl = Object.keys(CARDS).find(k => k !== baseTpl && hasType(CARDS[k], 'Creature') && isSpliceableStaple(k));

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
function mkStapler(controller) {
  const inst = JSON.parse(JSON.stringify(CARDS.stapler));
  return Object.assign(inst, {
    iid: nextIid++, tplId: 'stapler', controller, owner: controller,
    tapped: false, sick: false, damage: 0, chargesLeft: 3,
    keywords: [], damagedBySources: new Set(),
  });
}
function newGame() {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}

console.log('=== ability schema: noop gone, target_slots present ===');
(() => {
  const ab = CARDS.stapler.abilities[0];
  check('Stapler ability declares target_slots (length 2)', Array.isArray(ab.target_slots) && ab.target_slots.length === 2,
    JSON.stringify(ab.target_slots && ab.target_slots.map(s => s.filter)));
  check('no effect uses kind noop', !ab.effects.some(e => e.kind === 'noop'));
  check('single splice effect remains', ab.effects.length === 1 && ab.effects[0].kind === 'apply_in_game_splice');
  check('noop is no longer a registered EFFECTS kind', !('noop' in (ENGINE.EFFECTS || {})) || typeof ENGINE.EFFECTS === 'undefined');
})();

console.log('\n=== legality requires exactly two per-slot-validated targets ===');
(() => {
  const G = newGame();
  const stapler = mkStapler('you'); G.you.battlefield.push(stapler);
  const c0 = mk(baseTpl, 'you'); const c1 = mk(stapleTpl, 'you');
  G.you.battlefield.push(c0, c1);
  const t0 = { kind: 'permanent', iid: c0.iid, label: c0.name };
  const t1 = { kind: 'permanent', iid: c1.iid, label: c1.name };
  const base = { type: 'activateAbility', cardIid: stapler.iid, abilityIdx: 0 };

  check('illegal with ZERO targets', !ENGINE.isLegalAction('you', { ...base }));
  check('illegal with ONE target (noop’s old job: require a 2nd)',
    !ENGINE.isLegalAction('you', { ...base, targets: [t0] }));
  check('legal with TWO valid targets', ENGINE.isLegalAction('you', { ...base, targets: [t0, t1] }));
})();

console.log('\n=== resolution staples the second target onto the first ===');
(() => {
  const G = newGame();
  const stapler = mkStapler('you'); G.you.battlefield.push(stapler);
  const c0 = mk(baseTpl, 'you'); const c1 = mk(stapleTpl, 'you');
  c0.sick = false; c1.sick = false;
  G.you.battlefield.push(c0, c1);
  const t0 = { kind: 'permanent', iid: c0.iid, label: c0.name };
  const t1 = { kind: 'permanent', iid: c1.iid, label: c1.name };
  const before = G.you.battlefield.length;
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: stapler.iid, abilityIdx: 0, targets: [t0, t1] });
  // The staple merges c1 into c0: c0 survives (now stapled), c1 leaves the
  // battlefield. Net battlefield count drops by one (the staple consumed).
  const baseStillThere = G.you.battlefield.some(c => c.iid === c0.iid);
  const stapleConsumed = !G.you.battlefield.some(c => c.iid === c1.iid);
  check('base survives the staple', baseStillThere);
  check('staple target consumed (merged into base)', stapleConsumed, 'before=' + before + ' after=' + G.you.battlefield.length);
  const baseCard = G.you.battlefield.find(c => c.iid === c0.iid);
  check('base now carries stapled metadata', !!(baseCard && baseCard.stapledFrom),
    baseCard && JSON.stringify(baseCard.stapledFrom));
})();

console.log('\n=== self-staple rejected at ACTIVATION, costs never paid (MtG 601.2h) ===');
(() => {
  // Costs are the LAST part of activation: an illegal activation (here the
  // same card in both slots — caught by distinct_targets AND the
  // resolveSplicePair legality check) is rejected by executeAction before any
  // cost is paid, so there is nothing to refund or reverse.
  const G = newGame();
  const stapler = mkStapler('you'); G.you.battlefield.push(stapler);
  const c0 = mk(baseTpl, 'you');
  G.you.battlefield.push(c0);
  const t0 = { kind: 'permanent', iid: c0.iid, label: c0.name };
  const action = { type: 'activateAbility', cardIid: stapler.iid, abilityIdx: 0, targets: [t0, t0] };
  check('Stapler ability declares distinct_targets', CARDS.stapler.abilities[0].distinct_targets === true);
  check('self-staple action is ILLEGAL at activation', !ENGINE.isLegalAction('you', action));
  const total = (m) => ['W','U','B','R','G','C'].reduce((s, c) => s + (m[c] || 0), 0);
  const manaBefore = total(G.you.mana);
  const accepted = ENGINE.executeAction('you', action);
  check('executeAction rejects it (no cost paid)',
    accepted === false && stapler.tapped === false && total(G.you.mana) === manaBefore);
})();

console.log('\n=== already-stapled STACK spell is not a legal staple target ===');
(() => {
  // matchFilterSpell mirrors matchFilter's chain check (stapleChainOf): a
  // spell on the stack that already carries a staple chain must not pass the
  // spliceable_staple slot filter. Before the fix it passed legality and only
  // fizzled at resolution.
  const G = newGame();
  const spell = mk(stapleTpl, 'you');
  const item = { card: spell, controller: 'you', targets: [] };
  G.stack.push(item);
  const slotSpec = { target: 'permanent_or_spell', filter: { spliceable_staple: true } };
  const pre = ENGINE.getValidTargets(slotSpec, 'you');
  check('clean stack spell IS a legal staple target', pre.some(v => v.kind === 'stack' && v.stackItem === item));
  spell.stapledFrom = { baseTplId: spell.tplId, stapledTpls: ['lightning_bolt'] };
  const post = ENGINE.getValidTargets(slotSpec, 'you');
  check('stapled stack spell is NOT a legal staple target', !post.some(v => v.kind === 'stack' && v.stackItem === item));
  G.stack.pop();
})();

console.log('\n=== resolution-time fizzle keeps costs paid (MtG 608.2b semantics) ===');
(() => {
  // The handler re-runs resolveSplicePair as defense-in-depth; reaching a
  // fizzle there means legality/handler drift, and — matching real MtG, where
  // an ability that fizzles on resolution does NOT refund its costs — the
  // paid tap/mana stay spent. Simulate the drift case by invoking the handler
  // directly with an invalid (self-staple) pair on an already-paid Stapler.
  const G = newGame();
  const stapler = mkStapler('you'); G.you.battlefield.push(stapler);
  const c0 = mk(baseTpl, 'you');
  G.you.battlefield.push(c0);
  const t0 = { kind: 'permanent', iid: c0.iid, label: c0.name };
  stapler.tapped = true;                              // the already-paid tap
  G.you.mana.C -= 3;                                  // the already-paid mana
  const total = (m) => ['W','U','B','R','G','C'].reduce((s, c) => s + (m[c] || 0), 0);
  const afterPayment = total(G.you.mana);
  const ctx = { controller: 'you', sourceName: stapler.name, sourceIid: stapler.iid,
    sourceCard: stapler, allTargets: [t0, t0] };
  ENGINE.applyEffect(ctx, { kind: 'apply_in_game_splice' }, t0);
  check('Stapler stays tapped after a resolution fizzle (no refund)', stapler.tapped === true);
  check('mana pool unchanged by the fizzle (costs stay paid)', total(G.you.mana) === afterPayment,
    'after-payment=' + afterPayment + ' now=' + total(G.you.mana));
  check('no staple happened', !c0.stapledFrom);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
