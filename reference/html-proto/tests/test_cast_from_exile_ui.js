// Human cast-from-exile (Seal-Thief Courier grant): the controller must treat a
// permitted exile card exactly like a hand card through the WHOLE cast flow, not
// just the initial click. Regression for the target/modal slot-resolution helpers
// that looked only in G.you.hand — a targeted stolen spell (Lightning Bolt)
// entered targeting, but the target click built an EMPTY targets array
// (slotsNeededForPending found no card → [] slots), so isLegalAction rejected the
// cast and the stack stayed empty. Drives the real CONTROLLER click handlers (DOM
// stubbed by _setup), the same harness as test_ui_targeting. Also unit-tests the
// cross-yard graveyard-picker prompt text (P3).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nid = 9500;
function mk(t, c) {
  const i = JSON.parse(JSON.stringify(CARDS[t]));
  return Object.assign(i, { iid: nid++, tplId: t, controller: c, owner: c, tapped: false, sick: false,
    damage: 0, tempPower: 0, tempTou: 0, permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (i.keywords || []).slice() });
}
function game() {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
// Mirror a Seal-Thief Courier grant: an opponent-owned card sits in exile and
// 'you' may cast it this turn, spending mana as though any color.
function grantExileCast(G, tplId) {
  const card = mk(tplId, 'opp');
  G.opp.exile.push(card);
  G.castPermissions = [{ controller: 'you', cardIid: card.iid, from_zone: 'exile',
                         duration: 'eot', spend_as_any_color: true }];
  return card;
}

const TOUGH = Object.keys(CARDS).find(id => hasType(CARDS[id], 'Creature') && (CARDS[id].toughness || 0) >= 4 && !CARDS[id].special);

console.log('=== targeted stolen spell (Lightning Bolt) casts from exile at the opponent face ===');
(() => {
  const G = game();
  const bolt = grantExileCast(G, 'lightning_bolt');
  const fc = ENGINE.findCastableSpell('you', bolt.iid);
  check('engine resolves the exiled bolt as castable from exile', !!(fc && fc.zone === 'exile' && fc.card.iid === bolt.iid));
  check('castCardByIid (the UI resolver) finds the same card', !!fc && castCardByIid(bolt.iid) === fc.card);
  CONTROLLER.clickHand(bolt.iid);
  check('clickHand entered target-picking (card is in exile, not hand)', !!CONTROLLER.pendingTarget());
  const life0 = G.opp.life;
  CONTROLLER.clickPlayerTarget('opp');
  check('target click CAST the bolt at the face (3 dmg) — not an empty stack', G.opp.life === life0 - 3, life0 + '->' + G.opp.life);
  check('bolt left exile', !G.opp.exile.some(c => c.iid === bolt.iid));
  check("cast spell went to its OWNER's (opp) graveyard", G.opp.graveyard.some(c => c.iid === bolt.iid));
  check('the cast consumed the permission', !(G.castPermissions || []).some(p => p.cardIid === bolt.iid));
  check('targeting mode cleared', !CONTROLLER.pendingTarget());
})();

console.log('\n=== the same stolen spell can target a creature ===');
(() => {
  const G = game();
  const victim = mk(TOUGH, 'opp'); G.opp.battlefield.push(victim);
  const bolt = grantExileCast(G, 'lightning_bolt');
  CONTROLLER.clickHand(bolt.iid);
  check('entered target-picking', !!CONTROLLER.pendingTarget());
  CONTROLLER.clickBattlefield(victim.iid);
  check('clicking the creature cast the exiled bolt at it (3 dmg)', victim.damage === 3, 'damage=' + victim.damage);
  check('bolt left exile', !G.opp.exile.some(c => c.iid === bolt.iid));
})();

console.log('\n=== cross-yard graveyard-picker prompt text (P3) ===');
(() => {
  // Seal-Thief Courier shape: exile a nonland card from an opponent's graveyard.
  const stc = graveyardPickerPrompt(
    { not_type: 'Land', graveyards: ['opp'] },
    [{ kind: 'move_card', from_zone: 'graveyard', to_zone: 'exile' }],
    [{ kind: 'graveyard_card', iid: 1, controller: 'opp' }]);
  check('Seal-Thief picker title = "Exile a nonland card"', stc.title === 'Exile a nonland card', stc.title);
  check("Seal-Thief picker subtitle names the opponent's graveyard", /opponent's graveyard/.test(stc.subtitle), stc.subtitle);

  // Deepseam Quarry shape: return a creature card to the battlefield from any yard.
  const dq = graveyardPickerPrompt(
    { type: 'Creature', graveyards: ['self', 'opp'], select: { by: 'total_mana_cost', extreme: 'greatest' } },
    [{ kind: 'move_card', from_zone: 'graveyard', to_zone: 'battlefield', post: { take_control: true } }],
    [{ kind: 'graveyard_card', iid: 1, controller: 'you' }, { kind: 'graveyard_card', iid: 2, controller: 'opp' }]);
  check('Deepseam picker title = "Return a creature card"', dq.title === 'Return a creature card', dq.title);
  check('Deepseam picker subtitle = any graveyard', /any graveyard/.test(dq.subtitle), dq.subtitle);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
