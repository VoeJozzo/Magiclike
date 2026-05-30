// Sandbox mode — engine-level spawn operations (controller.js's startSandbox /
// sandboxSpawn). The floating panel DOM is browser-only, but the risky part is
// engine-level: booting a RUN-less game and pushing a freshly-made card
// instance straight onto the battlefield (an incomplete instance would crash
// combat / state-based actions / legality). This locks that contract down.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Mirror of controller.js sandboxDeck() — kept in sync by intent; this test
// guards exactly the tplIds the controller relies on existing.
function sandboxDeck() {
  const basics = Object.keys(CARDS).filter(id => {
    const c = CARDS[id];
    return c && hasType(c, 'Land') && /^(plains|island|swamp|mountain|forest)$/.test(id);
  });
  const d = [];
  for (let i = 0; i < 40; i++) d.push(basics[i % basics.length]);
  return d;
}

// Mirror of controller.js sandboxSpawn() core (zone routing + field stamping).
function spawn(G, tplId, target) {
  const card = ENGINE.makeCard(tplId);
  const dash = target.indexOf('-');
  const side = target.slice(0, dash);
  const zone = target.slice(dash + 1);
  card.owner = side; card.controller = side;
  if (zone === 'board' && isPermanent(card)) {
    card.sick = false;
    G[side].battlefield.push(card);
  } else {
    G[side].hand.push(card);
  }
  return card;
}

console.log('=== Sandbox deck builds from real basic-land tplIds ===');
{
  const deck = sandboxDeck();
  check('deck has 40 cards', deck.length === 40);
  check('every deck entry is a known card', deck.every(id => !!CARDS[id]));
  check('every deck entry is a Land', deck.every(id => hasType(CARDS[id], 'Land')));
}

console.log('\n=== RUN-less boot via ENGINE.init (both sides basic decks) ===');
let G;
{
  let threw = null;
  try { ENGINE.init(sandboxDeck(), sandboxDeck()); G = ENGINE.state(); }
  catch (e) { threw = e; }
  check('ENGINE.init did not throw', !threw, threw && threw.message);
  check('state exists with both players', !!(G && G.you && G.opp));
  check('opening hands drawn', !!(G && G.you.hand.length > 0 && G.opp.hand.length > 0));
}

console.log('\n=== Spawn a spell into hand ===');
{
  const before = G.you.hand.length;
  const spellId = Object.keys(CARDS).find(id => governingType(CARDS[id]) === 'Sorcery');
  check('a spell template exists to spawn', !!spellId);
  if (spellId) {
    const c = spawn(G, spellId, 'you-hand');
    check('spell landed in your hand', G.you.hand.some(x => x.iid === c.iid));
    check('hand grew by one', G.you.hand.length === before + 1);
    check('owner + controller stamped', c.owner === 'you' && c.controller === 'you');
  }
}

console.log('\n=== Spawn a creature onto each battlefield; combat/legality/stats survive it ===');
{
  const creatureId = Object.keys(CARDS).find(id => hasType(CARDS[id], 'Creature'));
  check('a creature template exists', !!creatureId);
  const mine = spawn(G, creatureId, 'you-board');
  const theirs = spawn(G, creatureId, 'opp-board');
  check('creature on your battlefield', G.you.battlefield.some(x => x.iid === mine.iid));
  check('creature on opp battlefield', G.opp.battlefield.some(x => x.iid === theirs.iid));
  check('spawned creature is not summoning-sick (sandbox convenience)', mine.sick === false);

  // findCard resolves controller positionally from the zone it sits in.
  const f = ENGINE.findCard(mine.iid);
  check('findCard resolves the spawned creature as yours', !!f && f.controller === 'you');

  // The instance must be complete enough that stats + legality don't throw.
  let threw = null, stats = null;
  try {
    stats = ENGINE.getStats(mine);
    ENGINE.getLegalActions('you');
    ENGINE.getLegalActions('opp');
  } catch (e) { threw = e; }
  check('getStats + getLegalActions did not throw on the spawned instance', !threw, threw && threw.message);
  check('getStats returns a [power, toughness] pair', Array.isArray(stats) && stats.length === 2);

  // Drive a few AI turns to confirm the spawned creatures play out cleanly
  // (combat damage / SBAs touch every battlefield instance).
  let crashed = null;
  try {
    for (let i = 0; i < 30 && !G.gameOver; i++) {
      const w = ENGINE.expectedActor();
      if (!w) break;
      const a = AI.decide(G, w);
      if (!a) break;
      ENGINE.executeAction(w, a);
    }
  } catch (e) { crashed = e; }
  check('30 AI plies with spawned creatures did not crash', !crashed, crashed && crashed.message);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
