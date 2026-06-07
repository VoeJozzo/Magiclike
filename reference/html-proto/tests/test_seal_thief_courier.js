// Seal-Thief Courier: combat damage to a player exiles a nonland card from
// that player's graveyard and grants a temporary permission to cast it from
// exile with mana of any color.

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
  G.activePlayer = 'you'; G.priorityHolder = null; G.phase = 'COMBAT_ATTACK';
  G.priority = null; G.stack = []; G.gameOver = false;
  G.pendingTriggers = []; G.pendingTriggerTarget = null;
  G.attackers = []; G.blockers = new Map();
  G.attackersDeclared = false; G.blockersDeclared = false;
  G.you.hand = []; G.opp.hand = [];
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  G.you.exile = []; G.opp.exile = [];
  G.you.mana = { W: 3, U: 0, B: 0, R: 0, G: 0, C: 0 };
  G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  return G;
}

function make(tplId, owner) {
  const c = ENGINE.makeCard(tplId);
  c.owner = owner; c.controller = owner;
  return c;
}

function driveUntil(G, predicate, choose) {
  for (let i = 0; i < 80; i++) {
    if (predicate()) return true;
    const who = ENGINE.expectedActor();
    if (!who) return predicate();
    const action = choose(who);
    if (!action) return predicate();
    ENGINE.executeAction(who, action);
  }
  return predicate();
}

function settle(G) {
  return driveUntil(G, () => G.stack.length === 0 && (!G.pendingTriggers || G.pendingTriggers.length === 0)
    && !G.pendingTriggerTarget, who => {
      if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who) {
        return { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] };
      }
      return { type: 'pass' };
    });
}

console.log('=== card data and generated text ===');
(() => {
  const tpl = CARDS.seal_thief_courier;
  check('Seal-Thief Courier exists', !!tpl);
  check('uses combat_damage trigger', tpl && tpl.triggers && tpl.triggers[0].event === 'combat_damage');
  check('targets nonland opponent graveyard card',
    tpl && tpl.triggers[0].target === 'opp_graveyard_card'
      && tpl.triggers[0].target_filter
      && tpl.triggers[0].target_filter.not_type === 'Land');
  const text = describeCardText(ENGINE.makeCard('seal_thief_courier'));
  check('generated text names combat damage to an opponent',
    /deals combat damage to an opponent/.test(text), text);
  check('generated text grants cast permission from exile',
    /Until end of turn, you may cast that card/.test(text)
      && /mana as though it were mana of any color/.test(text), text);
})();

console.log('\n=== combat damage trigger exiles and permits the stolen card ===');
(() => {
  const G = newGame();
  const courier = make('seal_thief_courier', 'you');
  courier.sick = false;
  G.you.battlefield.push(courier);
  for (let i = 0; i < 3; i++) {
    const land = make('plains', 'you');
    land.tapped = false;
    G.you.battlefield.push(land);
  }

  const bolt = make('lightning_bolt', 'opp');
  const land = make('plains', 'opp');
  G.opp.graveyard.push(bolt, land);

  const startedLife = G.opp.life;
  const reachedPermission = driveUntil(G, () =>
    (G.castPermissions || []).some(p => p.controller === 'you' && p.cardIid === bolt.iid),
    who => {
      if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === who) {
        return { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] };
      }
      if (G.phase === 'COMBAT_ATTACK' && who === 'you' && !G.attackersDeclared) {
        return { type: 'declareAttackers', cardIids: [courier.iid] };
      }
      if (G.phase === 'COMBAT_BLOCK' && who === 'opp' && !G.blockersDeclared) {
        return { type: 'declareBlockers', blockMap: new Map() };
      }
      return { type: 'pass' };
    });

  check('combat loop reached cast permission', reachedPermission, 'phase=' + G.phase);
  check('opponent took combat damage', G.opp.life === startedLife - 2, startedLife + ' -> ' + G.opp.life);
  check('stolen nonland left opponent graveyard', !G.opp.graveyard.some(c => c.iid === bolt.iid));
  check('opponent land stayed in graveyard', G.opp.graveyard.some(c => c.iid === land.iid));
  check('stolen card is in owner exile', G.opp.exile.some(c => c.iid === bolt.iid));

  const castAction = { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'player', who: 'opp', label: 'Opponent' }] };
  check('permission makes exiled spell castable through rules legality',
    ENGINE.isLegalAction('you', castAction));
  check('UI castability sees the exiled spell', canPlayFromUI('you', bolt));

  const casted = ENGINE.executeAction('you', castAction);
  check('cast action accepted', casted);
  check('permission consumed when spell is cast',
    !(G.castPermissions || []).some(p => p.cardIid === bolt.iid));
  check('stolen card left exile for the stack', !G.opp.exile.some(c => c.iid === bolt.iid));

  settle(G);
  check('stolen spell resolves to its owner graveyard', G.opp.graveyard.some(c => c.iid === bolt.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
