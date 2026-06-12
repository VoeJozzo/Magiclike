// A4-4: mass removal (the affect_creature `scope` path) must be SIMULTANEOUS,
// not sequential. Day of Reckoning kills everything AT ONCE — a dies-listener
// (Blood Artist) swept by the same wipe must see every death, including its
// own, regardless of where it sits in the battlefield array. checkDeaths
// already implements the batch contract (splice the whole batch first, then
// emit each death with the full batch as extraSources); the mass-scope
// destroy/bounce/exile arms used to emit per-creature as each was removed,
// so a listener destroyed early missed every later death (drained 1 vs the
// damage-wrath's 3, order-dependently). These tests pin the batch semantics
// for all three leave-play severities plus pass-1 indestructible validation.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function game(active) {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = active; G.priorityHolder = active; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[active].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = [];
  G.pendingTriggers = [];
  return G;
}
function place(G, who, tplId) {
  const c = ENGINE.makeCard(tplId);
  c.sick = false;
  G[who].battlefield.push(c);
  return c;
}
function drain(G) {
  let safety = 60;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}

// The finding's declared scenario: Blood Artist + 2 vanillas, opp casts a
// destroy-all (Day of Reckoning, scope:all_creatures severity:destroy).
// Full cast path, triggers resolved through the real settle loop.
function wrathScenario(artistPosition) {
  const G = game('opp');
  if (artistPosition === 'first') {
    var artist = place(G, 'you', 'blood_artist');
    place(G, 'you', 'goblin_raider');
    place(G, 'you', 'goblin_raider');
  } else {
    place(G, 'you', 'goblin_raider');
    place(G, 'you', 'goblin_raider');
    var artist = place(G, 'you', 'blood_artist');
  }
  const you0 = G.you.life, opp0 = G.opp.life;
  const wrath = ENGINE.makeCard('day_of_reckoning');
  G.opp.hand.push(wrath);
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: wrath.iid });
  drain(G);
  return { G, artist, you0, opp0 };
}

console.log('=== Day of Reckoning + Blood Artist FIRST in battlefield order ===');
(() => {
  const { G, you0, opp0 } = wrathScenario('first');
  check('all three creatures died', G.you.battlefield.length === 0,
    'bf=' + G.you.battlefield.length);
  check('artist drained for EVERY death incl. its own: opp lost 3',
    G.opp.life === opp0 - 3, opp0 + '→' + G.opp.life);
  check('artist controller gained 3', G.you.life === you0 + 3,
    you0 + '→' + G.you.life);
})();

console.log('\n=== Day of Reckoning + Blood Artist LAST (order independence) ===');
(() => {
  const { G, you0, opp0 } = wrathScenario('last');
  check('all three creatures died', G.you.battlefield.length === 0,
    'bf=' + G.you.battlefield.length);
  check('same wipe, artist last: opp still lost exactly 3',
    G.opp.life === opp0 - 3, opp0 + '→' + G.opp.life);
  check('artist controller still gained exactly 3', G.you.life === you0 + 3,
    you0 + '→' + G.you.life);
})();

console.log('\n=== batch visibility pin: mass DESTROY emits with the full batch ===');
(() => {
  // checkDeaths semantics: each death's zone-change emit carries the whole
  // batch as extraSources, so a listener plucked first still hears the later
  // deaths. Counted at the queue (pre-resolution) so the pin is independent
  // of trigger-resolution order.
  const G = game('you');
  const artist = place(G, 'you', 'blood_artist');   // first = plucked first
  place(G, 'you', 'goblin_raider');
  place(G, 'opp', 'goblin_raider');
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Wipe', sourceIid: -1 },
    { kind: 'affect_creature', severity: 'destroy', scope: 'all_creatures' }, null);
  const mine = G.pendingTriggers.filter(t => t.sourceIid === artist.iid);
  check('artist queued one dies-trigger per death (3)', mine.length === 3,
    'queued=' + mine.length);
  check('non-token corpses all reached their graveyards',
    G.you.graveyard.length === 2 && G.opp.graveyard.length === 1,
    'you.gy=' + G.you.graveyard.length + ' opp.gy=' + G.opp.graveyard.length);
})();

console.log('\n=== batch visibility pin: mass BOUNCE ===');
(() => {
  const G = game('you');
  const watcher = place(G, 'you', 'goblin_raider'); // first = plucked first
  watcher.triggers = [{
    event: 'card_zone_change',
    condition: ['card_is_creature', 'card_moves(battlefield, hand)'],
    effects: [{ kind: 'draw', amount: 1 }],
    target: 'self',
  }];
  place(G, 'you', 'goblin_raider');
  place(G, 'opp', 'goblin_raider');
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Tide', sourceIid: -1 },
    { kind: 'affect_creature', severity: 'bounce', scope: 'all_creatures' }, null);
  const mine = G.pendingTriggers.filter(t => t.sourceIid === watcher.iid);
  check('bounced-first watcher heard all 3 bounces', mine.length === 3,
    'queued=' + mine.length);
  check('all three creatures returned to hand',
    G.you.battlefield.length === 0 && G.opp.battlefield.length === 0,
    'you.bf=' + G.you.battlefield.length + ' opp.bf=' + G.opp.battlefield.length);
})();

console.log('\n=== batch visibility pin: mass EXILE ===');
(() => {
  const G = game('you');
  const watcher = place(G, 'you', 'goblin_raider'); // first = plucked first
  watcher.triggers = [{
    event: 'card_zone_change',
    condition: ['card_is_creature', 'card_moves(battlefield, exile)'],
    effects: [{ kind: 'draw', amount: 1 }],
    target: 'self',
  }];
  place(G, 'you', 'goblin_raider');
  place(G, 'opp', 'goblin_raider');
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Purge', sourceIid: -1 },
    { kind: 'affect_creature', severity: 'exile', scope: 'all_creatures' }, null);
  const mine = G.pendingTriggers.filter(t => t.sourceIid === watcher.iid);
  check('exiled-first watcher heard all 3 exiles', mine.length === 3,
    'queued=' + mine.length);
})();

console.log('\n=== pass-1 validation: indestructible survives, batch counts only real deaths ===');
(() => {
  const G = game('you');
  const artist = place(G, 'you', 'blood_artist');   // first = plucked first
  const indy = place(G, 'you', 'goblin_raider');
  indy.keywords.push('indestructible');
  place(G, 'opp', 'goblin_raider');
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Wipe', sourceIid: -1 },
    { kind: 'affect_creature', severity: 'destroy', scope: 'all_creatures' }, null);
  check('indestructible creature survived the wipe',
    G.you.battlefield.some(c => c.iid === indy.iid),
    'you.bf=' + G.you.battlefield.length);
  const mine = G.pendingTriggers.filter(t => t.sourceIid === artist.iid);
  check('artist counted exactly the 2 real deaths (itself + opp raider)',
    mine.length === 2, 'queued=' + mine.length);
})();

console.log('\n=== single-target path unchanged (no scope) ===');
(() => {
  const G = game('you');
  const artist = place(G, 'you', 'blood_artist');
  const victim = place(G, 'opp', 'goblin_raider');
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test Bolt', sourceIid: -1 },
    { kind: 'affect_creature', severity: 'destroy' },
    { kind: 'creature', iid: victim.iid });
  const mine = G.pendingTriggers.filter(t => t.sourceIid === artist.iid);
  check('single destroy: artist sees exactly 1 death', mine.length === 1,
    'queued=' + mine.length);
  check('mass tap still works (and emits no zone changes)', (() => {
    const a = place(G, 'you', 'goblin_raider');
    const before = G.pendingTriggers.length;
    ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Frost', sourceIid: -1 },
      { kind: 'affect_creature', severity: 'tap', scope: 'all_creatures' }, null);
    return a.tapped === true && G.pendingTriggers.length === before;
  })());
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
