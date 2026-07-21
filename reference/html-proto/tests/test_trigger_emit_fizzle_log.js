// A targeted trigger with no legal target is not silently eaten at EMIT
// time; it queues and fizzles LOUDLY at the stack-push moment
// (pushTriggerOnStack -> tsAutoPick logs "X trigger fizzles — no legal
// target."). Canon places queueing on event/condition match (§1004) and
// target choice at the stack moment (§1005).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9700;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
function passUntil(G, done, max) {
  let safety = max || 40;
  while (!done() && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
const settled = (G) => () =>
  G.stack.length === 0 && G.pendingTriggers.length === 0 && !G.pendingTriggerTarget;
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();
// The watcher trigger lives on a LAND so it is never itself a damage target.
const diesWatcher = () => ({
  event: 'card_zone_change',
  condition: ['another_card', 'card_is_creature', 'card_moves(battlefield, graveyard)'],
  text: 'Whenever a creature dies, deal 1 damage to target creature.',
  effects: [{ kind: 'damage', target: 'creature', amount: 1 }],
});
const FIZZLE_RE = /trigger fizzles — no legal target/;

if (!VANILLA || !CARDS['lightning_bolt'] || !CARDS['plains']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {
  console.log('=== A3-10 KEY: only creature dies -> no-target trigger fizzles WITH a log ===');
  (() => {
    const G = newGame();
    const watcher = mk('plains', 'you');
    watcher.triggers = [diesWatcher()];
    G.you.battlefield.push(watcher);
    const victim = mk(VANILLA, 'opp');
    victim.power = 1; victim.toughness = 1;
    G.opp.battlefield.push(victim);
    const bolt = mk('lightning_bolt', 'you');
    G.you.hand.push(bolt);
    G.log.length = 0;
    ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    passUntil(G, settled(G));
    check('the victim died (board has no creature left)',
      !G.opp.battlefield.some(c => hasType(c, 'Creature'))
      && !G.you.battlefield.some(c => hasType(c, 'Creature')));
    check('machine settled (stack + trigger queue empty, no prompt)', settled(G)());
    check('A3-10: the no-target trigger fizzle is LOGGED (not silently eaten at emit)',
      G.log.some(e => FIZZLE_RE.test(e.msg)),
      G.log.length ? G.log.map(e => e.msg).slice(0, 6).join(' | ') : '(log empty — silent suppression)');
  })();

  console.log('\n=== guard: with a legal target the trigger still fires normally ===');
  (() => {
    const G = newGame();
    const watcher = mk('plains', 'you');
    watcher.triggers = [diesWatcher()];
    G.you.battlefield.push(watcher);
    const victim = mk(VANILLA, 'opp');
    victim.power = 1; victim.toughness = 1;
    const bystander = mk(VANILLA, 'opp');
    bystander.power = 1; bystander.toughness = 3;
    G.opp.battlefield.push(victim, bystander);
    const bolt = mk('lightning_bolt', 'you');
    G.you.hand.push(bolt);
    G.log.length = 0;
    ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    passUntil(G, settled(G));
    check('victim died, bystander survived',
      !G.opp.battlefield.some(c => c.iid === victim.iid)
      && G.opp.battlefield.some(c => c.iid === bystander.iid));
    check('trigger resolved onto the bystander (1 damage)',
      bystander.damage === 1, 'damage=' + bystander.damage);
    check('no fizzle line on the happy path',
      !G.log.some(e => FIZZLE_RE.test(e.msg)));
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
