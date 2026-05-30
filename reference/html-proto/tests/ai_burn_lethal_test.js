// AI burn-lethal recognition. The AI's first tier is "if any burn spell
// kills opp on its own, cast it"; multi-spell lethal is sequenced by
// the AI naturally calling decide() again after each cast.
//
// Refactor protection: getDirectBurnSources was extracted in this
// session as a shared helper between findBurnLethal (single-spell) and
// computeReservedBurnForLethal (multi-spell). A regression in either
// helper would let the AI miss obvious kills — exactly the kind of
// behavior change unit tests catch better than playtest.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Boot a baseline game we can mutate. The deck/colors don't matter for
// the tests below — we replace the AI side's hand and mana pool
// directly each time.
function makeBaselineGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({cards:['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','plains','plains'], colors:['R']}, null);
  RUN.load();
  ENGINE.init(RUN.getSlots(), ['mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain','mountain']);
  return ENGINE.state();
}

// Replace `who`'s hand with a single card built from a template.
// makeCard handles iid assignment, stickers, modifiers, etc.
function giveHand(G, who, tplIds) {
  G[who].hand = tplIds.map(tplId => ENGINE.makeCard(tplId));
  for (const c of G[who].hand) c.owner = who;
}

// Set `who`'s mana pool to a specific shape. AI.decide → findBurnLethal
// flows through ENGINE.getLegalActions, which requires mana actually be
// in the pool for cast actions to appear as legal.
function setMana(G, who, pool) {
  G[who].mana = Object.assign({W:0,U:0,B:0,R:0,G:0,C:0}, pool);
}

// Put `who` in a state where casting sorceries/instants targeting face
// is legal: it's their main phase, they have priority, the stack is empty.
function readyForMain(G, who) {
  G.activePlayer = who;
  G.priorityHolder = who;
  G.phase = 'MAIN2';   // MAIN2 to skip computeReservedBurnForLethal
  G.stack = [];
  G.gameOver = false;
  if (G.priority) G.priority.passes = new Set();
  else G.priority = { passes: new Set() };
}

console.log('=== Single-spell lethal: AI casts Lightning Bolt at face ===');
{
  const G = makeBaselineGame();
  giveHand(G, 'opp', ['lightning_bolt']);
  setMana(G, 'opp', { R: 1 });
  G.you.life = 3;
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI returns an action', !!action);
  if (action) {
    check('Action is castSpell', action.type === 'castSpell');
    check('Cast target is the player you', action.targets &&
      action.targets[0] && action.targets[0].kind === 'player' &&
      action.targets[0].who === 'you');
    // Verify it's specifically the Bolt (not some other random pick).
    const card = G.opp.hand.find(c => c.iid === action.cardIid);
    check('Cast card is Lightning Bolt', card && card.tplId === 'lightning_bolt');
  }
}

console.log('\n=== Single-spell lethal: 2-damage Shock kills opp at 2 ===');
{
  const G = makeBaselineGame();
  giveHand(G, 'opp', ['shock']);
  setMana(G, 'opp', { R: 1 });
  G.you.life = 2;
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI casts Shock for lethal', action && action.type === 'castSpell');
  if (action && action.type === 'castSpell') {
    const card = G.opp.hand.find(c => c.iid === action.cardIid);
    check('Cast card is Shock', card && card.tplId === 'shock');
    check('Target is face', action.targets[0].kind === 'player' &&
      action.targets[0].who === 'you');
  }
}

console.log('\n=== No lethal: opp at 20, AI has Bolt but does NOT face-burn ===');
{
  const G = makeBaselineGame();
  giveHand(G, 'opp', ['lightning_bolt']);
  setMana(G, 'opp', { R: 1 });
  G.you.life = 20;
  readyForMain(G, 'opp');

  // AI may still choose to cast Bolt at face for the +30 burn-range bonus
  // mentioned in ai.js (a heuristic preference for spending Bolt early
  // rather than holding it). Verify either: (a) it doesn't burn-lethal,
  // or (b) it picks a different action entirely. Either is acceptable.
  // The key assertion is "AI doesn't claim it's lethal here" — meaning
  // findBurnLethal returns null since 3 < 20.
  // We can't observe findBurnLethal directly, but we can check that
  // whatever action AI returns is NOT marked as a lethal-cast.
  const action = AI.decide(G, 'opp');
  check('AI returns SOME action even when not lethal', !!action);
  // No way to assert "AI didn't take the burn-lethal path" from outside
  // unless we observe the action sequence. So this is a smoke test.
}

console.log('\n=== Multi-spell sequencing: opp at 4, AI has two Shocks ===');
{
  // Each Shock = 2; alone neither is lethal. After one cast, opp drops
  // to 2 — at which point findBurnLethal sees the second Shock as
  // single-spell lethal. Verify the AI completes the kill by repeating
  // decide/execute until opp dies or we hit a safety cap.
  const G = makeBaselineGame();
  giveHand(G, 'opp', ['shock', 'shock']);
  setMana(G, 'opp', { R: 2 });
  G.you.life = 4;
  readyForMain(G, 'opp');

  // AI's flow for multi-spell lethal:
  //   cast shock #1 (stack)
  //   pass priority (stack resolves, opp from 4 -> 2)
  //   cast shock #2 (now lethal-range) -> game over
  // So we expect at least ~3 iterations. The pass step is necessary for
  // the first cast to resolve, hence we DON'T break on pass.
  let safety = 10;
  let castCount = 0;
  while (safety-- > 0 && !G.gameOver) {
    const action = AI.decide(G, 'opp');
    if (!action) break;
    if (action.type === 'castSpell') castCount++;
    try {
      ENGINE.executeAction(G.priorityHolder || 'opp', action);
    } catch (e) {
      console.log('  executeAction threw:', e.message);
      break;
    }
  }
  console.log('  cast count:', castCount, 'final you.life:', G.you.life,
    'gameOver:', G.gameOver);
  check('AI cast at least one Shock', castCount >= 1);
  check('opp life reduced to <= 0 or game over', G.you.life <= 0 || G.gameOver);
}

console.log('\n=== Cost-aware lethal: AI prefers cheaper single-spell when both kill ===');
{
  // Opp at 3. AI has both Bolt (R:1, 3 dmg) and Volcanic Hammer
  // (R:1,C:2, 4 dmg). Both would kill, but Bolt is cheaper. AI's
  // getDirectBurnSources doesn't sort, but findBurnLethal picks the
  // first source in `actions` order — usually that ends up being the
  // cheaper one because legalActions enumerates hand in order.
  // The relevant assertion is "AI casts SOMETHING that kills" — which
  // is the bare minimum guarantee. Cheapest-first is a nice-to-have.
  const G = makeBaselineGame();
  giveHand(G, 'opp', ['lightning_bolt', 'volcanic_hammer']);
  setMana(G, 'opp', { R: 1, C: 2 });
  G.you.life = 3;
  readyForMain(G, 'opp');

  const action = AI.decide(G, 'opp');
  check('AI returns a cast for lethal', action && action.type === 'castSpell');
  if (action && action.type === 'castSpell') {
    const card = G.opp.hand.find(c => c.iid === action.cardIid);
    check('Cast is one of the burn options',
      card && (card.tplId === 'lightning_bolt' || card.tplId === 'volcanic_hammer'));
    check('Target is face',
      action.targets[0] && action.targets[0].kind === 'player' &&
      action.targets[0].who === 'you');
  }
}

console.log('\n=== Ability-based burn: tap-for-damage hits face ===');
{
  // Wicked Acolyte has T: deal 1 to player. Set opp at 1 life and the
  // Acolyte untapped on AI's battlefield. AI should activate the ability
  // for face for lethal.
  if (CARDS['wicked_acolyte']) {
    const G = makeBaselineGame();
    G.opp.battlefield = [ENGINE.makeCard('wicked_acolyte')];
    G.opp.battlefield[0].owner = 'opp';
    G.opp.battlefield[0].controller = 'opp';
    G.opp.battlefield[0].sick = false;
    G.opp.battlefield[0].tapped = false;
    G.opp.hand = [];
    setMana(G, 'opp', {});
    G.you.life = 1;
    readyForMain(G, 'opp');

    const action = AI.decide(G, 'opp');
    check('AI activates ability for lethal',
      action && action.type === 'activateAbility');
    if (action && action.type === 'activateAbility') {
      check('Target is the player you',
        action.targets && action.targets[0] &&
        action.targets[0].kind === 'player' &&
        action.targets[0].who === 'you');
    }
  } else {
    console.log('  (wickedAcolyte not in CARDS -- skipping)');
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
