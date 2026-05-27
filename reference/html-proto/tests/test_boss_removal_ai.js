// Boss special-removal AI casting (longstanding bug): the two boss decks —
// Archdemon of Bargains (vileEdict, scarification) and The Balancer
// (symmetricize, embargo, bleach) — never cast their signature removal because
// the AI's per-target scorer (scoreSpellTargetForMode) had no branch for
// rip_permanent / symmetricize / destroy_and_sticker_slot / move_card-bounce /
// plain-exile, and picked the apply_sticker rider as embargo/bleach's primary
// effect. All scored 0 → the AI passed. This pins that each now scores positive
// and gets cast on a valid target (without breaking flicker, which shares the
// bf→exile shape).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let iid = 4000;
function mk(tplId, ctrl) {
  return Object.assign(JSON.parse(JSON.stringify(CARDS[tplId])), {
    iid: iid++, tplId, controller: ctrl, owner: ctrl, tapped: false, sick: false,
    damage: 0, keywords: (CARDS[tplId].keywords || []).slice(), damagedBySources: new Set(),
  });
}
// Set up an opp (boss) main phase with `spellTpl` in hand and a target creature.
// `targetSide` controls whose battlefield the creature is on (your_creature
// spells like cloudshift need the caster's own; removal needs the opponent's).
function trial(spellTpl, targetSide) {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'opp'; G.priorityHolder = 'opp'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const ctpl = Object.keys(CARDS).find(k => CARDS[k].type === 'Creature');
  G[targetSide].battlefield.push(mk(ctpl, targetSide));
  G.opp.hand.length = 0;
  const spell = Object.assign(JSON.parse(JSON.stringify(CARDS[spellTpl])),
    { iid: 9999, tplId: spellTpl, controller: 'opp', owner: 'opp' });
  G.opp.hand.push(spell);
  const dec = AI.decide(G, 'opp');
  return !!(dec && dec.type === 'castSpell' && dec.cardIid === 9999);
}

console.log('=== Archdemon of Bargains specials ===');
check('vileEdict — AI casts it (edict: opp rips a permanent)', trial('vileEdict', 'you'));
check('scarification — AI casts it (destroy + scar slot)', trial('scarification', 'you'));

console.log('\n=== The Balancer specials ===');
check('symmetricize — AI casts it (equalize opp creature)', trial('symmetricize', 'you'));
check('embargo — AI casts it (bounce, scoring the move_card not the sticker)', trial('embargo', 'you'));
check('bleach — AI casts it (exile, scoring the move_card not the sticker)', trial('bleach', 'you'));

console.log('\n=== change_control family (same silent-uncast class) ===');
check('mindControl — AI casts it (permanent steal of control)', trial('mindControl', 'you'));
check('threaten — AI casts it (temporary control)', trial('threaten', 'you'));
check('steal — AI casts it (permanent_or_spell target, run-slot theft)', trial('steal', 'you'));

console.log('\n=== regressions: ordinary removal + flicker still cast ===');
check('terror still cast (vanilla destroy)', trial('terror', 'you'));
check('oblation still cast (shuffle-into-library)', trial('oblation', 'you'));
check('cloudshift still cast on OWN creature (flicker, shares bf→exile)', trial('cloudshift', 'opp'));

console.log('\n=== negative: do NOT bleach/embargo your own creature ===');
(() => {
  // targetSide=opp puts the only creature on the caster's side — removal must
  // not fire on it (no opp-controlled target). AI should pass / not cast it.
  check('bleach does not target own creature', !trial('bleach', 'opp'));
  check('embargo does not target own creature', !trial('embargo', 'opp'));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
