// Two bug fixes:
//
// BUG 1 (Archdemon of Bargains): the ETB number-choice was hardcoded to prompt
// `who: 'you'`, so when the BOSS controlled the demon the HUMAN was asked to
// choose — picking the boss's ETB sticker count AND their own death payout. The
// chooser must follow the CONTROLLER (the dealmaker).
//
// BUG 2 (empower on signed values): empower did `field += amount`, so a -2
// debuff (Sicken's pump) empowered to -1 (WEAKER) instead of -3. Empower must
// amplify magnitude in the field's existing direction.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9000;
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
// Drive the game forward but STOP the instant a number-choice opens, so we can
// inspect who it belongs to before the AI auto-resolves it.
function driveUntilNumberChoice(G) {
  let safety = 40;
  while (safety-- > 0) {
    if (G.pendingNumberChoice) return;
    const work = G.stack.length > 0 || (G.pendingTriggers || []).length > 0;
    if (!work) return;
    const w = ENGINE.expectedActor(); if (!w) return;
    const a = AI.decide(G, w); if (!a) return;
    ENGINE.executeAction(w, a);
  }
}

console.log('=== BUG 1: Archdemon ETB choice follows the CONTROLLER, not always the human ===');
if (!CARDS['archdemonBargains']) {
  console.log('  (archdemonBargains not in CARDS -- skipping)');
} else {
  // Boss (opp) controls it → the boss is the dealmaker, so the prompt is opp's.
  {
    const G = newGame();
    const demon = mk('archdemonBargains', 'opp'); G.opp.hand.push(demon);
    readyForCast(G, 'opp');
    const cast = { type: 'castSpell', cardIid: demon.iid };
    check('opp can cast Archdemon', ENGINE.isLegalAction('opp', cast));
    ENGINE.executeAction('opp', cast);
    driveUntilNumberChoice(G);
    check('a number-choice opened from the ETB', G.pendingNumberChoice != null);
    check("boss-controlled Archdemon prompts the CONTROLLER (opp), not the human",
      G.pendingNumberChoice && G.pendingNumberChoice.who === 'opp',
      G.pendingNumberChoice && ('who=' + G.pendingNumberChoice.who));
  }
  // Player controls it → the player chooses.
  {
    const G = newGame();
    const demon = mk('archdemonBargains', 'you'); G.you.hand.push(demon);
    readyForCast(G, 'you');
    ENGINE.executeAction('you', { type: 'castSpell', cardIid: demon.iid });
    driveUntilNumberChoice(G);
    check('player-controlled Archdemon prompts the player',
      G.pendingNumberChoice && G.pendingNumberChoice.who === 'you',
      G.pendingNumberChoice && ('who=' + G.pendingNumberChoice.who));
  }
}

console.log('\n=== BUG 2: empower amplifies magnitude in the field\'s direction ===');
{
  // Negative debuff (Sicken: pump -2/-2). Empower toughness → -3, NOT -1.
  const sicken = ENGINE.makeCard('sicken');
  const before = sicken.effects[0].toughness;
  applyEmpowerRoll(sicken, { location: 'effects', effIdx: 0, field: 'toughness' }, 1);
  check('Sicken toughness starts at -2', before === -2, 'was ' + before);
  check('empowered -2 debuff becomes -3 (stronger), not -1',
    sicken.effects[0].toughness === -3, 'got ' + sicken.effects[0].toughness);
  // Power untouched by a toughness-only empower.
  check('untargeted field (power) unchanged', sicken.effects[0].power === -2,
    'got ' + sicken.effects[0].power);

  // Positive buff still grows the normal way (+2 → +3) — no regression.
  const buff = { effects: [{ kind: 'pump', power: 2, toughness: 2 }] };
  applyEmpowerRoll(buff, { location: 'effects', effIdx: 0, field: 'power' }, 1);
  check('empowered +2 buff becomes +3', buff.effects[0].power === 3,
    'got ' + buff.effects[0].power);

  // Larger empower amount also respects direction (-2, +2 → -4).
  const big = { effects: [{ kind: 'pump', power: -2, toughness: -2 }] };
  applyEmpowerRoll(big, { location: 'effects', effIdx: 0, field: 'power' }, 2);
  check('empower amount 2 on -2 → -4', big.effects[0].power === -4,
    'got ' + big.effects[0].power);
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
