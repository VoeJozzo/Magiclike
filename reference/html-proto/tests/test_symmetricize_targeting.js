const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9900;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0,
    tempPower: 0, tempTou: 0, permPower: 0, permTou: 0,
    damagedBySources: new Set(), modifiers: [],
    keywords: (inst.keywords || []).slice(),
  });
}

function game() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = setup.startMainPhase('you');
  G.you.hand = []; G.opp.hand = [];
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  G.pendingSymmetricizeChoice = null;
  return G;
}

function passUntilStackResolves(G) {
  let safety = 10;
  while (G.stack.length && safety-- > 0) {
    const who = ENGINE.expectedActor();
    if (!who) break;
    ENGINE.executeAction(who, { type: 'pass' });
  }
}

const restrict = CARDS.symmetricize.target_filter;

console.log('=== target pool and human prompt exclude symmetric creatures on both sides ===');
(() => {
  const G = game();
  const symYou = mk('bear_cub', 'you');        // 1/1 for 1
  const symOpp = mk('white_knight', 'opp');    // 2/2 for 2
  const asymYou = mk('devoted_watcher', 'you');
  const asymOpp = mk('devoted_watcher', 'opp');
  G.you.battlefield.push(symYou, asymYou);
  G.opp.battlefield.push(symOpp, asymOpp);

  const legal = ENGINE.targetsForFilter('creature', 'you', restrict);
  check('own symmetric creature is excluded', !legal.some(t => t.iid === symYou.iid));
  check('opposing symmetric creature is excluded', !legal.some(t => t.iid === symOpp.iid));
  check('own asymmetric creature remains legal', legal.some(t => t.iid === asymYou.iid));
  check('opposing asymmetric creature remains legal', legal.some(t => t.iid === asymOpp.iid));

  const promptEff = { target: 'creature', filter: restrict };
  check('human target highlight excludes a symmetric creature',
    !isValidTargetCreature(promptEff, symOpp));
  check('human target highlight includes an asymmetric creature',
    isValidTargetCreature(promptEff, asymOpp));
})();

console.log('\n=== no asymmetric creature means no cast, action, or target prompt ===');
(() => {
  const G = game();
  const target = mk('bear_cub', 'opp');
  const spell = mk('symmetricize', 'you');
  G.opp.battlefield.push(target);
  G.you.hand.push(spell);
  const cast = {
    type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: target.iid, label: target.name }],
  };

  check('direct validation rejects a symmetric target', !ENGINE.isLegalAction('you', cast));
  check('castability probe reports no legal target',
    ENGINE.probeTargetsForObject(spell, 'you') === null);
  check('action enumeration omits Symmetricize',
    !ENGINE.getLegalActions('you').some(a => a.type === 'castSpell' && a.cardIid === spell.iid));
  CONTROLLER.clickHand(spell.iid);
  check('human click does not open target-picking', !CONTROLLER.pendingTarget());
  check('uncastable Symmetricize remains in hand', G.you.hand.some(c => c.iid === spell.iid));

  const asym = mk('devoted_watcher', 'opp');
  G.opp.battlefield.push(asym);
  const legalCast = {
    type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: asym.iid, label: asym.name }],
  };
  check('direct validation accepts an asymmetric target', ENGINE.isLegalAction('you', legalCast));
  const casts = ENGINE.getLegalActions('you')
    .filter(a => a.type === 'castSpell' && a.cardIid === spell.iid);
  check('action enumeration includes only the asymmetric target',
    casts.length === 1 && casts[0].targets[0].iid === asym.iid,
    JSON.stringify(casts.map(a => a.targets && a.targets[0] && a.targets[0].iid)));
  CONTROLLER.clickHand(spell.iid);
  check('human click opens target-picking once an asymmetric target exists',
    !!CONTROLLER.pendingTarget());
  CONTROLLER.cancelTarget();
})();

console.log('\n=== live stats and stored cost govern both eligibility and resolution ===');
(() => {
  const G = game();
  const target = mk('bear_cub', 'opp');
  applyOneStickerToRuntimeCard(target, { kind: 'cost_mod', amount: 1 });
  target.tempPower = 1;
  target.tempTou = 1; // effective 2/2 for 2: symmetric despite printed 1/1 for 1
  G.opp.battlefield.push(target);

  let legal = ENGINE.targetsForFilter('creature', 'you', restrict);
  check('temporary stats plus stored cost can make a creature symmetric',
    !legal.some(t => t.iid === target.iid));

  target.tempTou = 0; // effective 2/1 for 2: asymmetric
  legal = ENGINE.targetsForFilter('creature', 'you', restrict);
  check('a live temporary stat change can make it legal again',
    legal.some(t => t.iid === target.iid));

  const spell = mk('symmetricize', 'you');
  G.you.hand.push(spell);
  ENGINE.executeAction('you', {
    type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: target.iid, label: target.name }],
  });
  passUntilStackResolves(G);
  const values = G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.values;
  check('resolution prompt snapshots the same live power/toughness/stored cost',
    !!values && values.power === 2 && values.toughness === 1 && values.cost === 2,
    JSON.stringify(values));
})();

console.log('\n=== becoming symmetric before resolution makes the spell fizzle ===');
(() => {
  const G = game();
  const target = mk('devoted_watcher', 'opp'); // 1/3 for 2: legal when cast
  const spell = mk('symmetricize', 'you');
  const response = mk('lightning_bolt', 'opp');
  G.opp.battlefield.push(target);
  G.you.hand.push(spell);
  G.opp.hand.push(response);
  G.opp.mana.R = 1; G.opp.mana.C = 1;
  const cast = {
    type: 'castSpell', cardIid: spell.iid,
    targets: [{ kind: 'creature', iid: target.iid, label: target.name }],
  };
  check('asymmetric target is legal before the response window',
    ENGINE.isLegalAction('you', cast));
  ENGINE.executeAction('you', cast);
  target.tempPower = 1;
  target.tempTou = -1; // now 2/2 for 2
  const beforeResolution = ENGINE.targetsForFilter('creature', 'you', restrict);
  check('response-window stat change makes the locked target illegal',
    !beforeResolution.some(t => t.iid === target.iid),
    JSON.stringify(ENGINE.getStats(target)));
  passUntilStackResolves(G);
  check('resolution revalidation opens no Symmetricize choice',
    G.pendingSymmetricizeChoice === null,
    JSON.stringify(G.pendingSymmetricizeChoice));
  check('fizzled Symmetricize leaves the stack', G.stack.length === 0);
  check('fizzled Symmetricize goes to its owner graveyard',
    G.you.graveyard.some(c => c.iid === spell.iid));
})();

console.log('\n=== generated card text states the restriction ===');
(() => {
  const text = describeCardSegments(CARDS.symmetricize, { skipKeywords: false })
    .map(seg => seg.text).join('');
  const expected = "Flash. The controller of the target creature that isn't already symmetric equalizes its power, toughness, or cost.";
  check('Symmetricize text is truthful', text === expected, text);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
