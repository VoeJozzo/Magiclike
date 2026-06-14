// A3-2 — Stackable infrastructure (plan-stackable.md Phases 0-2, everything-
// stackable). Per Joe's PR #98 round-5 ruling: the `stackable` boolean exists
// on trigger AND activated-ability definitions, ABSENT defaults TRUE
// (gracefully — no card carries the field yet), and every shipped definition
// stays stackable tonight; the unstackable arms exist but are dormant pending
// Joe's dedicated classification pass.
//
// Arms:
//   (a) KEY (RED pre-build) — a targeted activated ability (Prodigal
//       Sorcerer's ping) now takes a kind:'ability' stack entry: activation
//       pays costs + locks targets, the opponent gets a real response window
//       (§603 handoff), and the effect has NOT happened yet. Pre-build it
//       resolved inline with no window.
//   (b) KEY (RED pre-build) — respond-with-removal kills the ability's
//       target: §1006.1/§704.1 re-validation fizzles the ability at
//       resolution, WITH a log; costs stay paid. Also pins that "target
//       spell" enumeration sees the responding spell but never the ability
//       entry.
//   (c) Guard — mana abilities stay hardcoded off-stack (canon §705): both
//       the creature-dork activateAbility path and tapLandForMana resolve
//       instantly with no stack entry.
//   (d) Default + dormant arm — a trigger with NO stackable field stacks
//       exactly as today (control), while a constructed stackable:false
//       trigger exercises the drain-time-immediate arm: resolves at drain,
//       before any stack push, logged ("split second"), no response window.
//   (e) Boot validation — a present-but-non-boolean `stackable` on a trigger
//       or ability is a loud schema error; boolean/absent boots clean.
//   (f) Counter parity (§1004.6) — the counter handler refuses kind:'ability'
//       entries the same way it refuses triggers, and targetsForFilter('spell')
//       excludes them.
//   (g) AI sanity — the AI's own activation doesn't wedge its decision loop
//       (it sees the entry, passes, the ability resolves), and it answers a
//       human-owned ability entry with a legal action.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
let nextIid = 9600;
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
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.pendingTriggers = []; G.pendingTriggerTarget = null;
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
function logHas(G, re) { return G.log.some(e => re.test(e.msg)); }
// Pass-until-settled (bounded): drives whoever holds priority to pass until
// the stack drains. Auto-pass handles the no-action seats; this only feeds
// the explicit passes a parked (anchored) seat owes.
function settle(G) {
  let safety = 8;
  while (G.stack.length > 0 && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs
        && (!c.keywords || c.keywords.length === 0)) return id;
  }
  return null;
})();

if (!VANILLA || !CARDS['prodigal_sorcerer'] || !CARDS['lightning_bolt'] || !CARDS['llanowar_elves']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {

  console.log('=== (a) KEY: a targeted activated ability takes a stack entry + response window ===');
  (() => {
    const G = newGame();
    const sorcerer = mk('prodigal_sorcerer', 'you');
    G.you.battlefield.push(sorcerer);
    const victim = mk(VANILLA, 'opp');
    victim.power = 1; victim.toughness = 1;
    G.opp.battlefield.push(victim);
    const bolt = mk('lightning_bolt', 'opp');
    G.opp.hand.push(bolt);
    const ok = ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: sorcerer.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    check('activation executed', ok === true);
    check('cost paid at activation (sorcerer tapped)', sorcerer.tapped === true);
    check('KEY: a kind:\'ability\' entry is on the stack',
      G.stack.length === 1 && G.stack[0].kind === 'ability',
      'stack=' + G.stack.length + ' kind=' + (G.stack[0] && G.stack[0].kind));
    check('KEY: the effect has NOT resolved yet (victim undamaged, alive)',
      victim.damage === 0 && G.opp.battlefield.some(c => c.iid === victim.iid),
      'damage=' + victim.damage);
    check('KEY: opponent of the activator holds priority (§603 handoff)',
      ENGINE.expectedActor() === 'opp', 'actor=' + ENGINE.expectedActor());
    check('KEY: the opponent can actually respond (bolt is castable)',
      ENGINE.isLegalAction('opp', { type: 'castSpell', cardIid: bolt.iid,
        targets: [{ kind: 'creature', iid: sorcerer.iid, label: sorcerer.name }] }));
    // Decline to respond: the ability resolves through resolveTopOfStack.
    ENGINE.executeAction('opp', { type: 'pass' });
    check('after the response window closes, the ping resolves (victim dead)',
      !G.opp.battlefield.some(c => c.iid === victim.iid)
      && G.opp.graveyard.some(c => c.iid === victim.iid),
      'stack=' + G.stack.length);
    check('stack empty after resolution', G.stack.length === 0);
  })();

  console.log('\n=== (b) KEY: killing the ability\'s target in response fizzles it at resolution ===');
  (() => {
    const G = newGame();
    const sorcerer = mk('prodigal_sorcerer', 'you');
    G.you.battlefield.push(sorcerer);
    // Second untapped sorcerer anchors 'you' (hasNoAction false → step()
    // parks instead of auto-pass-resolving the whole stack synchronously).
    G.you.battlefield.push(mk('prodigal_sorcerer', 'you'));
    const victim = mk(VANILLA, 'opp');
    victim.power = 1; victim.toughness = 1;
    G.opp.battlefield.push(victim);
    const bolt = mk('lightning_bolt', 'opp');
    G.opp.hand.push(bolt);
    ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: sorcerer.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    check('setup: ability entry on the stack', G.stack.length === 1 && G.stack[0].kind === 'ability');
    const abilityEntry = G.stack[0];
    // Opp responds: bolts their OWN creature (the ability's target).
    ENGINE.executeAction('opp', { type: 'castSpell', cardIid: bolt.iid,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    check('setup: bolt above the ability on the stack', G.stack.length === 2);
    // Targeting parity while both are stacked: "target spell" sees the bolt,
    // never the ability entry (§1004.6 mechanism).
    const spellTargets = ENGINE.targetsForFilter('spell', 'you');
    check('targetsForFilter(\'spell\') includes the responding spell',
      spellTargets.some(t => t.stackItem && t.stackItem.card && t.stackItem.card.iid === bolt.iid));
    check('targetsForFilter(\'spell\') excludes the kind:\'ability\' entry',
      !spellTargets.some(t => t.stackItem === abilityEntry));
    // Let everything resolve: bolt kills the victim, then the ability
    // re-validates and fizzles.
    settle(G);
    check('bolt resolved first (victim dead)', !G.opp.battlefield.some(c => c.iid === victim.iid));
    check('KEY: the ability fizzled at resolution (no crash, stack empty)',
      G.stack.length === 0, 'stack=' + G.stack.length);
    check('KEY: the fizzle is LOGGED',
      logHas(G, /ability fizzles — no legal target/),
      JSON.stringify(G.log.slice(-6).map(e => e.msg)));
    check('costs stay paid (sorcerer still tapped, §601.2h)', sorcerer.tapped === true);
  })();

  console.log('\n=== (c) guard: mana abilities stay off-stack (canon §705 fast path) ===');
  (() => {
    const G = newGame();
    const elves = mk('llanowar_elves', 'you');
    G.you.battlefield.push(elves);
    const land = mk('mountain', 'you');
    G.you.battlefield.push(land);
    // Anchor: an untapped non-mana ability keeps hasNoAction false so step()
    // parks instead of marching phases (setPhase would empty the pool).
    G.you.battlefield.push(mk('prodigal_sorcerer', 'you'));
    G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    ENGINE.executeAction('you', { type: 'activateAbility', cardIid: elves.iid, abilityIdx: 0 });
    check('creature mana ability resolved instantly ({G} floating)',
      G.you.mana.G === 1, 'G=' + G.you.mana.G);
    check('no stack entry for the mana ability', G.stack.length === 0, 'stack=' + G.stack.length);
    ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: land.iid });
    check('land tap resolved instantly ({R} floating)', G.you.mana.R === 1, 'R=' + G.you.mana.R);
    check('still no stack entry', G.stack.length === 0);
  })();

  console.log('\n=== (d) absent field = stackable (control) vs stackable:false drain-time-immediate (dormant arm) ===');
  (() => {
    // Control: an ETB gain-life trigger WITHOUT the field goes on the stack.
    const G = newGame();
    // Untapped sorcerer anchors: hasNoAction stays false, so step() parks
    // instead of auto-pass-cascading through the resolution moments we want
    // to observe.
    G.you.battlefield.push(mk('prodigal_sorcerer', 'you'));
    const etb = mk(VANILLA, 'you');
    etb.triggers = [{
      event: 'card_zone_change',
      condition: ['this_card', 'card_moves(anywhere, battlefield)'],
      effects: [{ kind: 'gain_life', scope: 'self', amount: 2 }],
    }];
    G.you.hand.push(etb);
    const life0 = G.you.life;
    ENGINE.executeAction('you', { type: 'castSpell', cardIid: etb.iid });
    // Two passes resolve the creature spell; its ETB trigger then drains.
    ENGINE.executeAction('opp', { type: 'pass' });
    ENGINE.executeAction('you', { type: 'pass' });
    check('control: the default-stackable ETB trigger is ON the stack',
      G.stack.length === 1 && G.stack[0].kind === 'trigger',
      'stack=' + G.stack.length + ' kind=' + (G.stack[0] && G.stack[0].kind));
    check('control: life unchanged while the trigger waits', G.you.life === life0);
    settle(G);
    check('control: trigger resolved after the window (life +2)',
      G.you.life === life0 + 2, 'life=' + G.you.life);

    // Dormant arm: the same trigger with stackable:false resolves at drain —
    // no stack entry, no response window, logged.
    const G2 = newGame();
    G2.you.battlefield.push(mk('prodigal_sorcerer', 'you'));
    const etb2 = mk(VANILLA, 'you');
    etb2.triggers = [{
      event: 'card_zone_change',
      condition: ['this_card', 'card_moves(anywhere, battlefield)'],
      effects: [{ kind: 'gain_life', scope: 'self', amount: 2 }],
      stackable: false,
    }];
    G2.you.hand.push(etb2);
    const life2 = G2.you.life;
    ENGINE.executeAction('you', { type: 'castSpell', cardIid: etb2.iid });
    // Two passes resolve the creature spell; its unstackable ETB then
    // resolves AT DRAIN — before any player gets a window over it.
    ENGINE.executeAction('opp', { type: 'pass' });
    ENGINE.executeAction('you', { type: 'pass' });
    check('KEY: unstackable trigger resolved at drain (life +2 immediately)',
      G2.you.life === life2 + 2, 'life=' + G2.you.life);
    check('KEY: it never took a stack entry', G2.stack.length === 0,
      'stack=' + G2.stack.length + ' kind=' + (G2.stack[0] && G2.stack[0].kind));
    check('KEY: the immediate resolution is LOGGED (split second)',
      logHas(G2, /triggers \(split second\)/),
      JSON.stringify(G2.log.slice(-5).map(e => e.msg)));
    check('trigger queue empty (nothing left pending)', G2.pendingTriggers.length === 0);
  })();

  console.log('\n=== (e) boot validation: non-boolean stackable is a loud schema error ===');
  (() => {
    const badTrig = {
      tplId: 'bad_stackable_trig', name: 'Bad Trig', types: ['Creature'],
      power: 1, toughness: 1, effects: [],
      triggers: [{ event: 'card_zone_change', condition: ['this_card'],
        effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }], stackable: 'yes' }],
    };
    const badAb = {
      tplId: 'bad_stackable_ab', name: 'Bad Ab', types: ['Creature'],
      power: 1, toughness: 1, effects: [],
      abilities: [{ cost: { tap: true },
        effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }], stackable: 1 }],
    };
    const goodBoth = {
      tplId: 'good_stackable', name: 'Good', types: ['Creature'],
      power: 1, toughness: 1, effects: [],
      triggers: [{ event: 'card_zone_change', condition: ['this_card'],
        effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }], stackable: false }],
      abilities: [{ cost: { tap: true },
        effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }], stackable: true }],
    };
    const r = ENGINE.validateAllCardEffects([badTrig, badAb, goodBoth]);
    check('non-boolean trigger stackable is a schema error',
      r.schemaErrors.some(e => /bad_stackable_trig/.test(e) && /stackable/.test(e)),
      JSON.stringify(r.schemaErrors));
    check('non-boolean ability stackable is a schema error',
      r.schemaErrors.some(e => /bad_stackable_ab/.test(e) && /stackable/.test(e)));
    check('boolean stackable boots clean',
      !r.schemaErrors.some(e => /good_stackable/.test(e)),
      JSON.stringify(r.schemaErrors));
    check('the live card pool boots clean under the new check',
      ENGINE.validateAllCardEffects(CARDS).schemaErrors.length === 0);
  })();

  console.log('\n=== (f) counter parity: counter effects refuse kind:\'ability\' entries (§1004.6) ===');
  (() => {
    const G = newGame();
    const sorcerer = mk('prodigal_sorcerer', 'you');
    G.you.battlefield.push(sorcerer);
    const victim = mk(VANILLA, 'opp');
    G.opp.battlefield.push(victim);
    // Park the engine post-activation: opp anchor keeps hasNoAction false.
    G.opp.battlefield.push(mk('prodigal_sorcerer', 'opp'));
    ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: sorcerer.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
    check('setup: ability entry on the stack', G.stack.length === 1 && G.stack[0].kind === 'ability');
    const entry = G.stack[0];
    check('targeting site: targetsForFilter(\'spell\') enumerates NO targets',
      ENGINE.targetsForFilter('spell', 'opp').length === 0,
      'targets=' + ENGINE.targetsForFilter('spell', 'opp').length);
    // Handler site: a counter effect aimed straight at the entry refuses it.
    ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Counter', sourceIid: -1 },
      { kind: 'counter' }, { kind: 'stack', stackItem: entry, label: 'ability' });
    check('handler site: the entry is still on the stack', G.stack.length === 1 && G.stack[0] === entry);
    check('handler site: the refusal is logged',
      logHas(G, /can't counter that/), JSON.stringify(G.log.slice(-3).map(e => e.msg)));
  })();

  console.log('\n=== (g) AI sanity: own ability entry doesn\'t wedge the loop; legal answer to a human entry ===');
  (() => {
    // AI activates its own ability, then must pass over its own entry and
    // let it resolve (bounded drive, every action legal).
    const G = newGame();
    G.activePlayer = 'opp'; G.priorityHolder = 'opp';
    const sorcerer = mk('prodigal_sorcerer', 'opp');
    sorcerer.sick = false;
    G.opp.battlefield.push(sorcerer);
    const victim = mk(VANILLA, 'you');
    victim.power = 1; victim.toughness = 1;
    G.you.battlefield.push(victim);
    let activated = false, wedged = false, illegal = 0;
    for (let i = 0; i < 12; i++) {
      if (G.gameOver) break;
      const w = ENGINE.expectedActor(); if (!w) { wedged = true; break; }
      const a = AI.decide(G, w); if (!a) { wedged = true; break; }
      if (w === 'opp' && a.type === 'activateAbility' && a.cardIid === sorcerer.iid) activated = true;
      if (!ENGINE.executeAction(w, a)) illegal++;
      if (activated && G.stack.length === 0 && victim.damage > 0) break;
      if (activated && G.stack.length === 0 && !G.you.battlefield.some(c => c.iid === victim.iid)) break;
    }
    check('AI chose to activate the ping', activated);
    check('no wedge (expectedActor/AI.decide never went null)', !wedged);
    check('no illegal actions during the drive', illegal === 0, 'illegal=' + illegal);
    check('the AI\'s own ability resolved (victim dead or damaged)',
      !G.you.battlefield.some(c => c.iid === victim.iid) || victim.damage > 0,
      'stack=' + G.stack.length);

    // Human-owned entry on the stack: the AI's answer is a legal action.
    const G2 = newGame();
    const mySorc = mk('prodigal_sorcerer', 'you');
    G2.you.battlefield.push(mySorc);
    const theirGuy = mk(VANILLA, 'opp');
    G2.opp.battlefield.push(theirGuy);
    G2.opp.hand.push(mk('lightning_bolt', 'opp'));
    ENGINE.executeAction('you', { type: 'activateAbility',
      cardIid: mySorc.iid, abilityIdx: 0,
      targets: [{ kind: 'creature', iid: theirGuy.iid, label: theirGuy.name }] });
    check('setup: human ability entry on the stack, AI to act',
      G2.stack.length === 1 && G2.stack[0].kind === 'ability' && ENGINE.expectedActor() === 'opp');
    const answer = AI.decide(G2, 'opp');
    check('AI.decide returns an action over the human ability entry', !!answer, JSON.stringify(answer));
    check('and it is legal', !!answer && ENGINE.executeAction('opp', answer) === true);
  })();
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
