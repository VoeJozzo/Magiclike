// Rules-infrastructure fixes (DIVERGENCE B2 / F2 / D4).
//   B2 — unused mana empties at every phase boundary (MTG 106.4), not only CLEANUP.
//   F2 — indestructible keeps its marked damage; only the death check is skipped.
//   D4 — damage is life loss: it fires the directional life_changed(delta<0), so
//        "whenever you lose life" (is_life_loss) triggers fire from burn/combat too.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9300;
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
  return ENGINE.state();
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
}
// Pass priority for both seats until the phase changes (runs the transition's SBA).
function advanceOnePhase(G) {
  const start = G.phase;
  let safety = 16;
  while (G.phase === start && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
function settle(G) {
  let safety = 40;
  while (safety-- > 0) {
    const work = G.stack.length > 0 || (G.pendingTriggers || []).length > 0
      || (G.pendingTriggerTarget && G.pendingTriggerTarget.controller);
    if (!work) break;
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

console.log('=== B2: floated mana empties at the phase boundary ===');
{
  const G = newGame();
  readyMain(G, 'you');
  G.you.mana = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 0 };
  check('mana floated in MAIN1', G.you.mana.R === 5);
  advanceOnePhase(G);
  check('phase advanced past MAIN1', G.phase !== 'MAIN1', 'phase=' + G.phase);
  check('B2: the floated mana emptied on the transition', G.you.mana.R === 0, 'R=' + G.you.mana.R);
}

console.log('\n=== F2: indestructible keeps marked damage; dies if it later loses it ===');
if (!VANILLA) { console.log('  (no vanilla creature -- skipping)'); }
else {
  const G = newGame();
  const c = mk(VANILLA, 'you');
  c.keywords = ['indestructible']; c.power = 2; c.toughness = 3; c.sick = true;
  c.damage = 3;   // lethal
  G.you.battlefield.push(c);
  readyMain(G, 'you');
  advanceOnePhase(G);   // runs SBAs at the transition
  const live = G.you.battlefield.find(x => x.iid === c.iid);
  check('indestructible creature survived lethal damage', !!live);
  check('F2: its marked damage was NOT cleared (still 3)',
    live && live.damage === 3, live && ('damage=' + live.damage));
  if (live) {
    live.keywords = [];       // strip indestructible
    advanceOnePhase(G);       // next SBA: retained lethal damage now kills it
    check('F2: losing indestructible lets the retained damage kill it',
      !G.you.battlefield.some(x => x.iid === c.iid));
  }
}

console.log('\n=== D4: damage fires is_life_loss (life loss event from burn, not just drain) ===');
if (!CARDS['bolt'] || !VANILLA) { console.log('  (bolt or vanilla unavailable -- skipping)'); }
else {
  const G = newGame();
  // A watcher: "whenever you lose life, gain 10 life." Fires only via is_life_loss.
  const watcher = mk(VANILLA, 'you');
  watcher.triggers = [{
    event: 'life_changed',
    condition: ['is_life_loss', 'affected_player_is(you)'],
    effects: [{ kind: 'gain_life', scope: 'self', amount: 10 }],
  }];
  G.you.battlefield.push(watcher);
  const bolt = mk('bolt', 'opp'); G.opp.hand.push(bolt);
  readyMain(G, 'opp'); G.opp.mana = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 5 };
  const lifeStart = G.you.life;
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'player', who: 'you', label: 'You' }] });
  settle(G);
  // Bolt deals 1 (you -1); the is_life_loss watcher then gains 10 → net +9.
  check('D4: burn damage fired the is_life_loss watcher (net life gain after +10)',
    G.you.life > lifeStart, 'life ' + lifeStart + ' -> ' + G.you.life);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
