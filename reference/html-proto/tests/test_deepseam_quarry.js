// Deepseam Quarry — reanimation land. Exercises the primitives it introduced:
// enters-tapped, all-graveyards graveyard targeting, the greatest-total-mana-cost
// superlative restriction, self-sacrifice as an activation cost, and reanimate-
// under-your-control (take_control). Driven directly on a booted board.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const LANDS20 = Array(20).fill('plains');
RUN.start({ cards: LANDS20.slice(), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS20.slice());
const G = ENGINE.state();

function has(arr, iid) { return arr.some(c => c && c.iid === iid); }
function sorceryWindow() {
  G.activePlayer = 'you';
  G.phase = 'MAIN1';
  G.stack = [];
  G.cleanupDiscarding = false;
  G.gameOver = false;
  G.priority = { passes: new Set() };
  G.priorityHolder = 'you';
}
// Put the board/turn into a main-phase window for the AI seat `who` (mirrors
// ai_burn_lethal_test's helper; MAIN2 skips the burn-lethal reservation path).
function readyForMain(who) {
  G.activePlayer = who;
  G.priorityHolder = who;
  G.phase = 'MAIN2';
  G.stack = [];
  G.gameOver = false;
  if (G.priority) G.priority.passes = new Set();
  else G.priority = { passes: new Set() };
}
// A vanilla creature template (no triggers/abilities), used as graveyard fodder.
const CREATURE = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities) return id;
  }
  for (const [id, c] of Object.entries(CARDS)) if (hasType(c, 'Creature')) return id;
  return null;
})();
// Make a creature with a forced owner + total mana cost (costTotalCard reads card.cost).
function grdCreature(owner, total) {
  const c = ENGINE.makeCard(CREATURE);
  c.owner = owner;
  c.cost = { C: total };
  return c;
}
const REANIMATE_F = { all_graveyards: true, greatest_total_cost: true };

console.log('=== card loads ===');
check('deepseam_quarry template present in CARDS', !!CARDS['deepseam_quarry']);
check('a vanilla creature template was found for fixtures', !!CREATURE);

console.log('\n=== enters tapped + taps for {C} ===');
(() => {
  G.you.battlefield = []; G.you.hand = [];
  const q = ENGINE.makeCard('deepseam_quarry');
  check('makeCard carries enters_tapped flag', q.enters_tapped === true);
  G.you.hand.push(q);
  sorceryWindow();
  G.you.landPlayedThisTurn = false;
  const played = ENGINE.executeAction('you', { type: 'playLand', cardIid: q.iid });
  const onbf = G.you.battlefield.find(c => c.iid === q.iid);
  check('playLand resolves; on battlefield', played === true && !!onbf);
  check('entered TAPPED', !!onbf && onbf.tapped === true);
  // executeAction(playLand) settles the unattended priority loop and can hand the
  // turn to opp; re-establish a clean window for `you` before the mana ability.
  sorceryWindow();
  check('cannot tap for mana while tapped',
    !ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: q.iid, color: 'C' }));
  onbf.tapped = false;  // simulate untap step
  check('mana ability legal once untapped',
    ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: q.iid, color: 'C' }));
  // (The added {C} is real but the settle loop empties the pool at the phase
  // boundary, so assert on the tap, not the transient pool — mana production
  // itself is covered by test_mana.js via the shared tap-for-mana path.)
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: q.iid, color: 'C' });
  check('taps for {C} (land is now tapped)', onbf.tapped === true);
})();

console.log('\n=== greatest total mana cost among all graveyards ===');
(() => {
  G.you.graveyard = []; G.opp.graveyard = [];
  const cheap = grdCreature('you', 2);
  const mid = grdCreature('opp', 4);
  const big = grdCreature('opp', 7);  // unique greatest
  G.you.graveyard.push(cheap);
  G.opp.graveyard.push(mid, big);
  const tg = ENGINE.getValidTargets({ target: 'graveyard_creature', filter: REANIMATE_F }, 'you');
  check('exactly one legal target (unique greatest)', tg.length === 1, 'got ' + tg.length);
  check('it is the total-7 creature', tg[0] && tg[0].iid === big.iid);
  check('target tags the opp graveyard it sits in', tg[0] && tg[0].controller === 'opp');
  const tie = grdCreature('you', 7);  // a second total-7, in your yard
  G.you.graveyard.push(tie);
  const tg2 = ENGINE.getValidTargets({ target: 'graveyard_creature', filter: REANIMATE_F }, 'you');
  check('ties stay legal (two at total 7)',
    tg2.length === 2 && has(tg2, big.iid) && has(tg2, tie.iid), 'got ' + tg2.length);
  const own = ENGINE.getValidTargets({ target: 'graveyard_creature', filter: { greatest_total_cost: true } }, 'you');
  check('own-yard-only ignores opp graveyard', own.length === 1 && own[0].iid === tie.iid);
  G.you.graveyard = []; G.opp.graveyard = [];
  check('empty graveyards → no legal target',
    ENGINE.getValidTargets({ target: 'graveyard_creature', filter: REANIMATE_F }, 'you').length === 0);
})();

console.log('\n=== reanimate under your control (take_control) ===');
(() => {
  G.you.battlefield = []; G.opp.battlefield = []; G.you.graveyard = []; G.opp.graveyard = [];
  const oppC = grdCreature('opp', 5);
  G.opp.graveyard.push(oppC);
  const oldIid = oppC.iid;
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'Quarry', sourceIid: -1 },
    { kind: 'move_card', from_zone: 'graveyard', to_zone: 'battlefield', selector: 'target', post: { take_control: true } },
    { kind: 'graveyard_creature', iid: oldIid });
  check('left the opp graveyard', !has(G.opp.graveyard, oldIid));
  const arrived = G.you.battlefield.find(c => c.tplId === CREATURE);
  check('arrived under YOUR control', !!arrived && G.opp.battlefield.length === 0);
  check('owner preserved as opp (control != ownership)', arrived && arrived.owner === 'opp');
  check('summoning sick', arrived && arrived.sick === true);
  // Control sanity: WITHOUT take_control, an opp-owned card returns to OPP.
  G.you.battlefield = []; G.opp.battlefield = []; G.opp.graveyard = [];
  const oppC2 = grdCreature('opp', 5);
  G.opp.graveyard.push(oppC2);
  ENGINE.applyEffect(
    { controller: 'you', sourceName: 'X', sourceIid: -1 },
    { kind: 'move_card', from_zone: 'graveyard', to_zone: 'battlefield', selector: 'target' },
    { kind: 'graveyard_creature', iid: oppC2.iid });
  check('default (no take_control): opp-owned returns to OPP battlefield',
    G.opp.battlefield.length === 1 && G.you.battlefield.length === 0);
})();

console.log('\n=== full activation: {2},{T},Sac self → reanimate the biggest ===');
(() => {
  G.you.battlefield = []; G.opp.battlefield = []; G.you.graveyard = []; G.opp.graveyard = [];
  G.you.hand = []; G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const q = ENGINE.makeCard('deepseam_quarry'); q.owner = 'you'; q.tapped = false;
  G.you.battlefield.push(q);
  const mine = grdCreature('you', 2); G.you.graveyard.push(mine);
  const big = grdCreature('opp', 8); G.opp.graveyard.push(big);  // unique greatest, opp-owned
  sorceryWindow();
  G.you.mana.C = 2;  // the quarry taps as the {T} cost, so {2} comes from the pool
  const acts = ENGINE.getLegalActions('you').filter(a => a.type === 'activateAbility' && a.cardIid === q.iid);
  check('reanimate ability enumerated', acts.length >= 1, 'acts=' + acts.length);
  check('every enumerated target is the greatest (opp big)',
    acts.length > 0 && acts.every(a => a.targets && a.targets[0] && a.targets[0].iid === big.iid));
  const act = acts[0];
  check('self-sac: sacIid is the quarry itself', act && act.sacIid === q.iid);
  const ok = ENGINE.executeAction('you', act);
  check('activation resolves', ok === true);
  check('quarry sacrificed off the battlefield', !has(G.you.battlefield, q.iid));
  check('quarry in its owner graveyard', has(G.you.graveyard, q.iid));
  const arrived = G.you.battlefield.find(c => c.tplId === CREATURE);
  check('opp big creature reanimated under YOUR control', !!arrived && G.opp.battlefield.length === 0);
  check('reanimated body is summoning-sick', arrived && arrived.sick === true);
  check('it left the opp graveyard', G.opp.graveyard.length === 0);
})();

console.log('\n=== generated oracle text ===');
(() => {
  if (typeof describeCardText !== 'function') { check('describeCardText available', false, 'not a function'); return; }
  let s = '';
  try {
    const txt = describeCardText(ENGINE.makeCard('deepseam_quarry'));
    s = typeof txt === 'string' ? txt : JSON.stringify(txt);
  } catch (e) {
    check('describeCardText renders without throwing', false, e.message);
    return;
  }
  check('renders the reanimate clause (not a raw "move ...")',
    /greatest total mana cost among all graveyards/i.test(s) && /under your control/i.test(s), s.slice(0, 200));
  check('renders the sacrifice-self cost', /sacrifice this/i.test(s), s.slice(0, 200));
  check('renders the main-phase restriction', /activate only during your main phase/i.test(s), s.slice(0, 200));
})();

console.log('\n=== AI values and plays the reanimate ===');
(() => {
  G.you.battlefield = []; G.opp.battlefield = []; G.you.graveyard = []; G.opp.graveyard = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const q = ENGINE.makeCard('deepseam_quarry'); q.owner = 'opp'; q.tapped = false; q.sick = false;
  const l1 = ENGINE.makeCard('plains'); l1.owner = 'opp'; l1.tapped = false;
  const l2 = ENGINE.makeCard('plains'); l2.owner = 'opp'; l2.tapped = false;
  G.opp.battlefield.push(q, l1, l2);
  const big = grdCreature('opp', 8); big.power = 6; big.toughness = 6;  // clearly worth reanimating
  G.opp.graveyard.push(big);
  let activated = false;
  for (let i = 0; i < 6 && !activated; i++) {
    readyForMain('opp');
    const a = AI.decide(G, 'opp');
    if (!a) break;
    if (a.type === 'activateAbility' && a.cardIid === q.iid) activated = true;
    ENGINE.executeAction('opp', a);
  }
  check('AI chose to activate the reanimate', activated);
  check('reanimation resolved (quarry gone, the 6/6 is on the AI board, left the yard)',
    !G.opp.battlefield.some(c => c.iid === q.iid)
    && G.opp.battlefield.some(c => c.tplId === CREATURE)
    && !G.opp.graveyard.some(c => c.tplId === CREATURE));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
