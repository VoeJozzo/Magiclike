// Audit fix A3-1 — stack entries re-validate their locked targets at
// RESOLUTION (§1006.1 for triggers, §704.1 for spells).
//
// Pre-fix, target legality was checked at queue time and stack-push time and
// never again: a target that became illegal while the entry waited on the
// stack (hexproof gained in response, target left play) was still affected,
// and a dead sole target still let untargeted rider effects resolve instead
// of fizzling the whole entry. The fix (tsRevalidateTargets) re-runs the SAME
// per-slot legality sets used at cast/queue time once, at resolution start:
// illegal slots are dropped (multi-target entries proceed on the remaining
// legal targets), and if no slot survives the entry fizzles whole with a log
// line — riders included, costs stay paid. Mana abilities never touch the
// stack, so their fast path is untouched.
//
// Case 1 reproduces the audit packet's 100%-real-actions route: the pool's
// only hexproof granter (Aether Drake) stapled onto a flash base (Ambush
// Djinn) via the game's own synthesis, cast in response to a trigger on the
// stack — the grant resolves first (LIFO), and the waiting trigger must
// fizzle instead of hitting the now-hexproofed target.

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

// Fresh game with opp holding priority in MAIN1 and both sides flush on mana.
// The human side keeps a castable flash card (Lightning Bolt) in hand for the
// whole scenario: with a live response available, the engine's auto-pass
// PAUSES at every priority window instead of churning through resolutions and
// turns inside a single executeAction call — the response window each case
// needs is only observable this way (same mechanism as the audit repro).
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'opp'; G.priorityHolder = 'opp'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = [mk('lightning_bolt', 'you')];  // the never-cast pause card
  G.opp.hand = [];
  return G;
}

// Pass priority until a predicate on G holds (or the machine quiesces).
// pickFor: map of controller -> iid to pick when that side's trigger prompt
// opens (the synth's grant target).
function driveUntil(G, pred, pickIid) {
  let guard = 0;
  while (guard++ < 60) {
    if (pred()) return true;
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
      const pt = G.pendingTriggerTarget;
      const pick = (pickIid != null && pt.valid.find(v => v.iid === pickIid)) || pt.valid[0];
      ENGINE.executeAction('you', { type: 'triggerTargetPick', target: pick });
      continue;
    }
    const who = ENGINE.expectedActor();
    if (!who) return pred();
    ENGINE.executeAction(who, { type: 'pass' });
  }
  return pred();
}
function settled(G) {
  return G.stack.length === 0 && !G.pendingTriggers.length
    && !G.pendingTriggerTarget && !G.pendingOptionalCost;
}

console.log('=== A3-1 (a): hexproof gained IN RESPONSE — the waiting trigger fizzles ===');
(() => {
  // Opp's Flame Wisp ETB (2 damage to target opp creature) locks your creature;
  // you respond with a REAL flash cast — Ambush Djinn + Aether Drake, built by
  // the game's own staple synthesis — whose ETB grants the locked target
  // hexproof before the wisp trigger resolves.
  const G = newGame();
  const victim = mk('abyss_lurker', 'you');   // the wisp ETB's only legal target
  G.you.battlefield.push(victim);

  const synthTpl = ENGINE.synthesizeStapledTemplate('ambush_djinn', ['aether_drake']);
  const synthKey = '__test_synth_drake__';
  CARDS[synthKey] = synthTpl;
  const synth = mk(synthKey, 'you');
  G.you.hand.push(synth);
  check('precondition: synthesized staple is a flash creature carrying the hexproof-grant ETB',
    synth.keywords.includes('flash')
    && (synth.triggers || []).some(t => (t.effects || []).some(e => e.kind === 'grant_keyword' && e.keyword === 'hexproof')));

  const wisp = mk('flame_wisp', 'opp');
  G.opp.hand.push(wisp);
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: wisp.iid });
  driveUntil(G, () => {
    const top = G.stack[G.stack.length - 1];
    return !!top && top.kind === 'trigger';
  });
  const trig = G.stack[G.stack.length - 1];
  check('precondition: wisp ETB trigger is on the stack with the victim locked',
    !!trig && trig.kind === 'trigger'
    && Array.isArray(trig.targets) && trig.targets[0] && trig.targets[0].iid === victim.iid,
    trig && JSON.stringify(trig.targets));

  // THE RESPONSE — a real cast, at flash speed, while the trigger waits.
  check('precondition: flash response is legal with the trigger on the stack',
    ENGINE.isLegalAction('you', { type: 'castSpell', cardIid: synth.iid }));
  G.log.length = 0;
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: synth.iid });
  driveUntil(G, () => settled(G), victim.iid);

  check('the grant resolved first: victim has hexproof',
    victim.keywords.includes('hexproof'), JSON.stringify(victim.keywords));
  check('A3-1: the trigger took NO effect on the now-illegal target (was: 2 damage applied anyway)',
    victim.damage === 0 && G.you.battlefield.some(c => c.iid === victim.iid),
    'victim.damage=' + victim.damage);
  check('A3-1: the fizzle is LOGGED (existing wording family)',
    G.log.some(e => /Flame Wisp trigger fizzles — no legal target/.test(e.msg)),
    G.log.slice(-5).map(e => e.msg).join(' | '));
})();

console.log('\n=== A3-1 (c): happy path unchanged — no response, the trigger resolves ===');
(() => {
  const G = newGame();
  const victim = mk('abyss_lurker', 'you');
  G.you.battlefield.push(victim);
  const wisp = mk('flame_wisp', 'opp');
  G.opp.hand.push(wisp);
  G.log.length = 0;
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: wisp.iid });
  driveUntil(G, () => settled(G));
  check('with no response, the locked target takes the 2 damage as before',
    victim.damage === 2, 'victim.damage=' + victim.damage);
  check('no fizzle line on the happy path',
    !G.log.some(e => /fizzles — no legal target/.test(e.msg)),
    G.log.slice(-5).map(e => e.msg).join(' | '));
})();

console.log('\n=== A3-1 (b): multi-target PARTIAL fizzle — drop the illegal slot, proceed on the rest ===');
(() => {
  // Roots and Branches stapled onto a vanilla base, cast by opp: a 2-slot ETB
  // (slot 0 taps one of YOUR creatures, slot 1 pumps one of THEIRS). While the
  // trigger waits on the stack, the slot-0 target gains hexproof (fixture
  // mutation — case (a) proves the real-actions route). At resolution slot 0
  // is dropped; slot 1 must still resolve.
  const G = newGame();
  const VANILLA = Object.keys(CARDS).find(k =>
    hasType(CARDS[k], 'Creature') && !CARDS[k].triggers && !CARDS[k].abilities
    && !CARDS[k].static_buffs && isSpliceableBase(k));
  const staple = ENGINE.makeCard(VANILLA, undefined, 0, undefined, undefined, undefined, ['roots_and_branches']);
  staple.iid = nextIid++; staple.controller = 'opp'; staple.owner = 'opp';
  G.opp.hand.push(staple);
  const mine = mk('savannah_lions', 'you');    // slot 0 (tap) target
  const theirs = mk('benalish_hero', 'opp');   // slot 1 (pump) candidate
  mine.sick = false; theirs.sick = false;
  G.you.battlefield.push(mine); G.opp.battlefield.push(theirs);

  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: staple.iid });
  driveUntil(G, () => {
    const top = G.stack[G.stack.length - 1];
    return !!top && top.kind === 'trigger';
  });
  const trig = G.stack[G.stack.length - 1];
  check('precondition: 2-slot trigger on the stack, slot 0 locked on your creature',
    !!trig && trig.kind === 'trigger' && Array.isArray(trig.targets)
    && trig.targets.filter(Boolean).length === 2
    && trig.targets[0] && trig.targets[0].iid === mine.iid,
    trig && JSON.stringify(trig.targets));

  // The response window: slot 0's target gains hexproof while the trigger waits.
  mine.keywords.push('hexproof');
  driveUntil(G, () => settled(G));

  const allBf = G.you.battlefield.concat(G.opp.battlefield);
  const pumped = allBf.reduce((s, c) => s + (c.tempPower || 0), 0);
  check('A3-1: the now-illegal tap slot was DROPPED (was: tapped despite hexproof)',
    mine.tapped === false, 'mine.tapped=' + mine.tapped);
  check('A3-1: the still-legal pump slot RESOLVED (partial fizzle, not whole)',
    pumped === 1, 'sum tempPower=' + pumped);
})();

console.log('\n=== A3-1 (spell twin, §704.1): all targets illegal — the SPELL fizzles whole, riders included ===');
(() => {
  // Consume Spirit: damage 4 to target creature + its controller gains 4 life
  // (an untargeted scope:self rider). Hexproof gained in response must fizzle
  // the WHOLE spell: no damage AND no lifegain — pre-fix the damage landed and
  // the rider ran.
  const G = newGame();
  const victim = mk('abyss_lurker', 'you');
  G.you.battlefield.push(victim);
  const spirit = mk('consume_spirit', 'opp');
  G.opp.hand.push(spirit);
  const oppLife = G.opp.life;
  G.log.length = 0;
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: spirit.iid,
    targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
  check('precondition: the spell is on the stack with the victim locked',
    G.stack.length === 1 && G.stack[0].targets && G.stack[0].targets[0].iid === victim.iid);

  // The response window: the locked target gains hexproof.
  victim.keywords.push('hexproof');
  driveUntil(G, () => settled(G));

  check('A3-1: no damage through hexproof (was: 4 damage applied anyway)',
    victim.damage === 0 && G.you.battlefield.some(c => c.iid === victim.iid),
    'victim.damage=' + victim.damage);
  check('A3-1: the untargeted lifegain RIDER was skipped too (whole-object fizzle)',
    G.opp.life === oppLife, 'opp.life=' + G.opp.life + ' (was ' + oppLife + ')');
  check('the fizzled spell still went to the graveyard (costs stay paid)',
    G.opp.graveyard.some(c => c.iid === spirit.iid));
  check('A3-1: the spell fizzle is LOGGED',
    G.log.some(e => /Consume Spirit fizzles — no legal target/.test(e.msg)),
    G.log.slice(-5).map(e => e.msg).join(' | '));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
