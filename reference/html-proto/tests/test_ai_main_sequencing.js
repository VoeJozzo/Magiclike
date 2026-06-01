// decideMain sequences by play VALUE, not raw mana cost (AI quality fix).
// Previously the AI cast its highest-COST castable spell first, so an expensive
// vanilla body would go ahead of a cheap, high-impact removal spell. Now it
// ranks by a cross-card play value, so removal-on-a-real-threat beats filler.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9500;
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
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  return ENGINE.state();
}
function readyForCast(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
}
// A vanilla creature (no triggers/abilities) — the "filler" body.
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

console.log('=== decideMain prefers cheap high-value removal over an expensive filler body ===');
if (!CARDS['sicken'] || !VANILLA) {
  console.log('  (sicken or a vanilla creature unavailable -- skipping)');
} else {
  const G = newGame();
  // Hand: cheap removal (Sicken, {B}) + a pricey vanilla body. No lands in hand,
  // so decideMain goes straight to the spell decision.
  const removal = mk('sicken', 'you');
  const filler = mk(VANILLA, 'you');
  filler.cost = { C: 6 };           // make the body clearly the most EXPENSIVE option
  G.you.hand = [removal, filler];
  // A small opp creature Sicken (-2/-2) cleanly kills → removal is high-value.
  const victim = mk(VANILLA, 'opp'); victim.power = 2; victim.toughness = 2;
  G.opp.battlefield.push(victim);
  readyForCast(G, 'you');

  const act = AI.decide(G, 'you');
  check('AI casts a spell', act && act.type === 'castSpell', 'got ' + (act && act.type));
  check('AI casts the cheap removal (Sicken), not the expensive filler body',
    act && act.cardIid === removal.iid,
    act ? ('cast iid ' + act.cardIid + ' — removal=' + removal.iid + ', filler=' + filler.iid) : 'no action');
  check('removal targets the opponent creature',
    act && act.targets && act.targets[0] && act.targets[0].iid === victim.iid);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
