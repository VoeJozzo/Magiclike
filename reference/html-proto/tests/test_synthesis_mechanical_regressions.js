const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function newGame() {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.mana = { W: 20, U: 20, B: 20, R: 20, G: 20, C: 20 };
  return G;
}

function runtimeCard(tplId, controller, stapledTpls) {
  const card = ENGINE.makeCard(tplId, [], null, [], null, stapledTpls || [], []);
  card.controller = controller;
  card.owner = controller;
  return card;
}

function targetOf(card) {
  return { kind: 'creature', iid: card.iid, label: card.name };
}

function drainStack(G) {
  let safety = 20;
  while (G.stack.length > 0 && safety-- > 0) {
    const who = ENGINE.expectedActor();
    if (!who || !ENGINE.executeAction(who, { type: 'pass' })) break;
  }
  return safety > 0;
}

function castSynthesized(baseTplId, stapledTplId, targets, arrange) {
  const G = newGame();
  const board = arrange(G);
  const spell = runtimeCard(baseTplId, 'you', [stapledTplId]);
  G.you.hand.push(spell);
  const action = { type: 'castSpell', cardIid: spell.iid, targets: targets(board) };
  check(baseTplId + ' + ' + stapledTplId + ' cast is legal', ENGINE.isLegalAction('you', action));
  ENGINE.executeAction('you', action);
  check(baseTplId + ' + ' + stapledTplId + ' stack drains', drainStack(G));
  return { G, board };
}

console.log('=== Artifact permanents remain permanent synthesis inputs ===');
(() => {
  const staplerPlains = ENGINE.synthesizeStapledTemplate('stapler', ['plains']);
  check('Stapler + Plains keeps the splice activation',
    staplerPlains.abilities.some(ab => (ab.effects || []).some(e => e.kind === 'apply_in_game_splice')));
  check('Stapler + Plains gains the Plains mana ability',
    manaEffectColors(manaAbilityOf(staplerPlains).effects[0]).includes('W'));

  const ingenuityEngine = ENGINE.synthesizeStapledTemplate('ingenuity_unbounded', ['equatorial_engine']);
  const engineMana = manaAbilityOf(ingenuityEngine);
  check('Ingenuity Unbounded + Equatorial Engine gains a colorless mana ability',
    !!engineMana && manaEffectColors(engineMana.effects[0]).includes('C'));

  const ingenuityStapler = ENGINE.synthesizeStapledTemplate('ingenuity_unbounded', ['stapler']);
  check('a pure Artifact staple contributes its activated ability',
    ingenuityStapler.abilities.some(ab => (ab.effects || []).some(e => e.kind === 'apply_in_game_splice')));
  check('a pure Artifact staple does not become an empty ETB trigger',
    (ingenuityStapler.triggers || []).length === 0);
})();

console.log('\n=== spell synthesis appends target descriptors and effect slots ===');
(() => {
  const rootsBolt = ENGINE.synthesizeStapledTemplate('roots_and_branches', ['lightning_bolt']);
  check('Roots + Bolt carries three target slots with constituent filters',
    rootsBolt.target_slots.length === 3
      && rootsBolt.target_slots[0].filter.controller === 'opp'
      && rootsBolt.target_slots[1].filter.controller === 'self'
      && rootsBolt.target_slots[2].target === 'creature_or_player');
  check('Roots + Bolt effect slots are 0,1,2',
    JSON.stringify(rootsBolt.effects.map(e => e.target_slot)) === JSON.stringify([0, 1, 2]));
  check('Roots + Bolt keeps distinct-target metadata', rootsBolt.distinct_targets === true);

  const boltRoots = ENGINE.synthesizeStapledTemplate('lightning_bolt', ['roots_and_branches']);
  check('Bolt + Roots carries the single target before the filtered slots',
    boltRoots.target_slots.length === 3
      && boltRoots.target_slots[0].target === 'creature_or_player'
      && boltRoots.target_slots[1].filter.controller === 'opp'
      && boltRoots.target_slots[2].filter.controller === 'self');
  check('Bolt + Roots effect slots are 0,1,2',
    JSON.stringify(boltRoots.effects.map(e => e.target_slot)) === JSON.stringify([0, 1, 2]));

  const rootsSword = ENGINE.synthesizeStapledTemplate('roots_and_branches', ['sword_and_sorcery']);
  check('Roots + Sword carries all four target slots', rootsSword.target_slots.length === 4);
  check('Roots + Sword remaps every appended effect slot',
    JSON.stringify(rootsSword.effects.map(e => e.target_slot)) === JSON.stringify([0, 1, 2, 3]));
})();

console.log('\n=== synthesized spell effects resolve against their selected slots ===');
(() => {
  const arrange = (G) => {
    const opp = runtimeCard('iron_sentinel', 'opp');
    const mine = runtimeCard('iron_sentinel', 'you');
    G.opp.battlefield.push(opp);
    G.you.battlefield.push(mine);
    return { opp, mine };
  };
  const first = castSynthesized('roots_and_branches', 'lightning_bolt',
    ({ opp, mine }) => [targetOf(opp), targetOf(mine), { kind: 'player', who: 'opp', label: 'Opponent' }], arrange);
  check('Roots + Bolt taps slot 0', first.board.opp.tapped === true);
  check('Roots + Bolt pumps slot 1 once', first.board.mine.tempPower === 1 && first.board.mine.tempTou === 1);
  check('Roots + Bolt damages slot 2', first.G.opp.life === 17, 'life=' + first.G.opp.life);

  const second = castSynthesized('lightning_bolt', 'roots_and_branches',
    ({ opp, mine }) => [{ kind: 'player', who: 'opp', label: 'Opponent' }, targetOf(opp), targetOf(mine)], arrange);
  check('Bolt + Roots damages slot 0', second.G.opp.life === 17, 'life=' + second.G.opp.life);
  check('Bolt + Roots taps slot 1', second.board.opp.tapped === true);
  check('Bolt + Roots pumps slot 2 once', second.board.mine.tempPower === 1 && second.board.mine.tempTou === 1);

  const third = castSynthesized('roots_and_branches', 'sword_and_sorcery',
    ({ oppA, mineA, mineB, oppB }) => [targetOf(oppA), targetOf(mineA), targetOf(mineB), targetOf(oppB)],
    (G) => {
      const oppA = runtimeCard('iron_sentinel', 'opp');
      const oppB = runtimeCard('iron_sentinel', 'opp');
      const mineA = runtimeCard('iron_sentinel', 'you');
      const mineB = runtimeCard('iron_sentinel', 'you');
      G.opp.battlefield.push(oppA, oppB);
      G.you.battlefield.push(mineA, mineB);
      return { oppA, oppB, mineA, mineB };
    });
  check('Roots + Sword taps effects bound to slots 0 and 3',
    third.board.oppA.tapped === true && third.board.oppB.tapped === true);
  check('Roots + Sword pumps effects bound to slots 1 and 2',
    third.board.mineA.tempPower === 1 && third.board.mineA.tempTou === 1
      && third.board.mineB.tempPower === 2 && third.board.mineB.tempTou === 2);
})();

console.log('\n=== live Stapler resolution preserves a consumed spell locked target ===');
(() => {
  const G = newGame();
  const base = runtimeCard('iron_sentinel', 'you');
  const growthTarget = runtimeCard('iron_sentinel', 'you');
  const stapler = runtimeCard('stapler', 'you');
  stapler.chargesLeft = 3;
  G.you.battlefield.push(base, growthTarget, stapler);

  const growth = runtimeCard('giant_growth', 'you');
  const growthItem = { card: growth, controller: 'you', targets: [targetOf(growthTarget)] };
  G.stack.push(growthItem);
  const baseTarget = { kind: 'permanent', iid: base.iid, label: base.name };
  const stackTarget = { kind: 'stack', stackItem: growthItem, label: growth.name };
  ENGINE.applyEffect({ controller: 'you', sourceName: stapler.name, sourceIid: stapler.iid,
    sourceCard: stapler, allTargets: [baseTarget, stackTarget] },
  { kind: 'apply_in_game_splice' }, baseTarget);

  check('consumed Giant Growth applies once to its locked creature',
    growthTarget.tempPower === 3 && growthTarget.tempTou === 3,
    JSON.stringify([growthTarget.tempPower, growthTarget.tempTou]));
  check('consumed Giant Growth leaves the live stack', !G.stack.includes(growthItem));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
