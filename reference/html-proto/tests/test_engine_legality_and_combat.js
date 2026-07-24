const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 25000;
function mk(tplId, controller) {
  const card = ENGINE.makeCard(tplId);
  card.iid = nextIid++;
  card.owner = controller;
  card.controller = controller;
  return card;
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W', 'U', 'R'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyMain(G, who) {
  setup.startMainPhase(who);
  G[who].mana = { W: 20, U: 20, B: 20, R: 20, G: 20, C: 20 };
}
function passUntil(G, done, max) {
  let safety = max || 40;
  while (!done() && safety-- > 0) {
    const who = ENGINE.expectedActor();
    if (!who) break;
    ENGINE.executeAction(who, { type: 'pass' });
  }
}
const VANILLA = Object.keys(CARDS).find(id => {
  const card = CARDS[id];
  return hasType(card, 'Creature') && !card.triggers && !card.abilities && !card.static_buffs;
});
const ctx = { controller: 'you', sourceName: 'Test Effect', sourceIid: null };

console.log('=== Land plays require the active player to hold priority ===');
{
  const G = newGame();
  const land = mk('plains', 'you');
  G.you.hand = [land];
  readyMain(G, 'you');
  G.priorityHolder = 'opp';
  check('playLand dispatch legality rejects an active player without priority',
    !ENGINE.isLegalAction('you', { type: 'playLand', cardIid: land.iid }));
  check('getLegalActions omits land plays without priority',
    !ENGINE.getLegalActions('you').some(a => a.type === 'playLand' && a.cardIid === land.iid));
}

console.log('\n=== Control changes apply summoning sickness, with haste overriding it ===');
{
  const G = newGame();
  const creature = mk(VANILLA, 'opp');
  G.opp.battlefield = [creature];
  ENGINE.applyEffect(ctx, { kind: 'change_control' }, { kind: 'creature', iid: creature.iid });
  check('a newly controlled creature becomes summoning sick', creature.sick === true);
  check('the newly controlled creature cannot attack without haste', !ENGINE.canCreatureAttack(creature));
}
{
  const G = newGame();
  const creature = mk(VANILLA, 'opp');
  G.opp.battlefield = [creature];
  ENGINE.applyEffect(ctx, { kind: 'change_control', grant_haste: true },
    { kind: 'creature', iid: creature.iid });
  check('the haste control-change path remains attack-eligible',
    creature.sick === true && creature.keywords.includes('haste') && ENGINE.canCreatureAttack(creature));
}

console.log('\n=== Losing Creature type removes combat roles and blocks stale damage ===');
{
  const G = newGame();
  const attacker = mk(VANILLA, 'you');
  G.you.battlefield = [attacker];
  setup.startCombat('you', { attackers: [attacker.iid], phase: 'COMBAT_BLOCK', declared: true });
  ENGINE.applyEffect(ctx, { kind: 'set_types', types: ['Artifact'], duration: 'permanent' },
    { kind: 'creature', iid: attacker.iid });
  check('an attacker that stops being a creature leaves combat', !G.attackers.includes(attacker.iid));
}
{
  const G = newGame();
  const attacker = mk(VANILLA, 'you');
  const blocker = mk(VANILLA, 'opp');
  G.you.battlefield = [attacker];
  G.opp.battlefield = [blocker];
  setup.startCombat('you', {
    attackers: [attacker.iid], blockers: [[blocker.iid, attacker.iid]],
    phase: 'COMBAT_BLOCK', declared: true,
  });
  ENGINE.applyEffect(ctx, { kind: 'set_types', types: ['Artifact'], duration: 'permanent' },
    { kind: 'creature', iid: blocker.iid });
  check('a blocker that stops being a creature leaves combat', !G.blockers.has(blocker.iid));
}
{
  const G = newGame();
  const stale = mk(VANILLA, 'you');
  stale.power = 7;
  G.you.battlefield = [stale];
  ENGINE.applyEffect(ctx, { kind: 'set_types', types: ['Artifact'], duration: 'permanent' },
    { kind: 'creature', iid: stale.iid });
  setup.startCombat('you', { attackers: [stale.iid], phase: 'COMBAT_BLOCK', declared: true });
  const lifeBefore = G.opp.life;
  passUntil(G, () => G.phase === 'MAIN2');
  check('a stale noncreature attacker entry cannot deal combat damage',
    G.opp.life === lifeBefore, 'life=' + G.opp.life + ' before=' + lifeBefore);
}

console.log('\n=== Legendary cast enumeration matches dispatch legality ===');
{
  const G = newGame();
  const inPlay = mk('city_guardian', 'you');
  const duplicate = mk('city_guardian', 'you');
  inPlay.sick = false;
  G.you.battlefield = [inPlay];
  G.you.hand = [duplicate];
  readyMain(G, 'you');
  const action = { type: 'castSpell', cardIid: duplicate.iid };
  check('duplicate legendary cast is illegal', !ENGINE.isLegalAction('you', action));
  check('getLegalActions does not enumerate the rejected legendary cast',
    !ENGINE.getLegalActions('you').some(a => a.type === 'castSpell' && a.cardIid === duplicate.iid));
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
