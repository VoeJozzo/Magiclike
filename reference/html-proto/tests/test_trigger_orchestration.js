// Audit A3-9 (re-scoped remainder) — trigger-layer coverage. Much of the audit's
// original dark list shipped its own tests since (zone events, source_iid
// self-suppress, distinct_targets, emit-fizzle, become_copy_of/grave-return
// auto-pick). This battery fences the TRUE remainder, highest-value first: the
// pickBestTriggerTarget auto-pick heuristic (#3 — its controller-comparison
// branches were mutation-dark; a flip would aim buffs at the opponent and burn
// at ourselves), the signed gain_life branch, and the #10c design rider (the
// generator's "opponent" damage text is only true because the heuristic routes
// free-choice damage to the opponent — pinned as characterization, not changed).
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
    counters: {}, killedBy: null, dealtDeathtouch: false,
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = []; G.you.graveyard = []; G.opp.graveyard = [];
  G.stack = []; G.gameOver = false; G.pendingTriggers = [];
  return G;
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS))
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  return null;
})();

if (!VANILLA) { console.log('  (no vanilla creature template)'); fail++; }
else {
  console.log('=== #3 pickBestTriggerTarget: damage aims at a killable OPP creature, never our own ===');
  (() => {
    const G = newGame();
    const ours = mk(VANILLA, 'you'); ours.power = 5; ours.toughness = 5;
    const oppSmall = mk(VANILLA, 'opp'); oppSmall.power = 1; oppSmall.toughness = 1;
    const oppBig = mk(VANILLA, 'opp'); oppBig.power = 5; oppBig.toughness = 5;
    G.you.battlefield.push(ours); G.opp.battlefield.push(oppSmall, oppBig);
    const valid = [
      { kind: 'creature', iid: ours.iid }, { kind: 'creature', iid: oppSmall.iid },
      { kind: 'creature', iid: oppBig.iid },
      { kind: 'player', who: 'you' }, { kind: 'player', who: 'opp' },
    ];
    const pick = ENGINE.pickBestTriggerTarget({ kind: 'damage', amount: 2 }, valid, 'you');
    check('damage picks the killable opp 1/1, not our 5/5 or the unkillable opp 5/5',
      pick && pick.iid === oppSmall.iid, 'picked iid=' + (pick && pick.iid));
  })();

  console.log('\n=== #3 pickBestTriggerTarget: damage falls back to OPP face when no creature is killable ===');
  (() => {
    const G = newGame();
    const oppBig = mk(VANILLA, 'opp'); oppBig.power = 5; oppBig.toughness = 5;
    G.opp.battlefield.push(oppBig);
    const valid = [{ kind: 'creature', iid: oppBig.iid },
      { kind: 'player', who: 'you' }, { kind: 'player', who: 'opp' }];
    const pick = ENGINE.pickBestTriggerTarget({ kind: 'damage', amount: 1 }, valid, 'you');
    check('damage with no killable creature picks OPP face, never our own',
      pick && pick.kind === 'player' && pick.who === 'opp', JSON.stringify(pick));
  })();

  console.log('\n=== #3 pickBestTriggerTarget: pump aims at OUR best creature (controller-flip would pick opp) ===');
  (() => {
    const G = newGame();
    const ourSmall = mk(VANILLA, 'you'); ourSmall.power = 1; ourSmall.toughness = 1;
    const ourBig = mk(VANILLA, 'you'); ourBig.power = 4; ourBig.toughness = 4;
    const oppBig = mk(VANILLA, 'opp'); oppBig.power = 9; oppBig.toughness = 9;
    G.you.battlefield.push(ourSmall, ourBig); G.opp.battlefield.push(oppBig);
    const valid = [{ kind: 'creature', iid: ourSmall.iid }, { kind: 'creature', iid: ourBig.iid },
      { kind: 'creature', iid: oppBig.iid }];
    const pick = ENGINE.pickBestTriggerTarget({ kind: 'pump', power: 2, toughness: 2 }, valid, 'you');
    check('pump buffs OUR highest-power creature (not the opp 9/9)',
      pick && pick.iid === ourBig.iid, 'picked iid=' + (pick && pick.iid));
  })();

  console.log('\n=== #3 pickBestTriggerTarget: signed gain_life — gain aims at our face, drain at opp ===');
  (() => {
    newGame();
    const valid = [{ kind: 'player', who: 'you' }, { kind: 'player', who: 'opp' }];
    const drain = ENGINE.pickBestTriggerTarget({ kind: 'gain_life', amount: -2 }, valid, 'you');
    check('negative gain_life (drain) targets OPP face', drain && drain.who === 'opp', JSON.stringify(drain));
    const gain = ENGINE.pickBestTriggerTarget({ kind: 'gain_life', amount: 3 }, valid, 'you');
    check('positive gain_life targets OUR face', gain && gain.who === 'you', JSON.stringify(gain));
  })();

  console.log('\n=== #10c rider: damageFace encodes target:player; the heuristic makes the "opponent" text true ===');
  (() => {
    // Characterization (A3-9 #10c): the printed "deal N to opponent" text only
    // agrees with behavior because pickBestTriggerTarget routes free-choice damage
    // at the opponent. A behavior fork (target:'opp') is a separate decision.
    const fac = GENERATOR_EFFECTS.find(e => e.id === 'damageFace');
    check('generator damageFace exists and encodes target:player (free choice)',
      !!fac && fac.roll()[0].target === 'player', fac ? JSON.stringify(fac.roll()[0]) : 'no damageFace');
    newGame();
    const valid = [{ kind: 'player', who: 'you' }, { kind: 'player', who: 'opp' }];
    const pick = ENGINE.pickBestTriggerTarget({ kind: 'damage', target: 'player', amount: 1 }, valid, 'you');
    check('the heuristic routes free-choice face damage to the OPPONENT (text/behavior agree only via #3)',
      pick && pick.who === 'opp', JSON.stringify(pick));
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
