// Audit A3-6 (approved build-out, PR #98: "This is meant to support arbitrary
// zone movements. We should probably build that out.") — the engine now emits
// `card_zone_change` for EVERY genuine card move between zones, not just
// battlefield-touching ones. A trigger authored against any zone pair —
// card_moves(library, hand) ("whenever you draw"), card_moves(hand, graveyard)
// ("whenever a card is discarded") — now fires. RED before the build-out:
// draws/discards/mills/casts/counters/recursion emitted nothing, so every
// "queued === 1" below read 0.
//
// Also pinned here:
//   - existing-pool isolation (structural): every shipped/generated
//     card_zone_change trigger carries a battlefield-touching card_moves
//     term, so the NEW events cannot match any existing trigger — zero
//     behavior change for the current pool (the full suite enforces the
//     battlefield emissions themselves).
//   - the trigger BUDGET stops a draw-triggered-draw loop (TRIGGER_DEPTH_CAP
//     per stack episode), and noSelfCascade self-suppresses via drawCard's
//     new sourceIid thread.
//   - the setup rule (canon §1002.2a): opening hands are constructed, not
//     moved — no zone events exist before the game starts.

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
  G.you.hand = []; G.opp.hand = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  G.you.exile = []; G.opp.exile = [];
  G.stack = []; G.gameOver = false;
  G.pendingTriggers = [];
  return G;
}
function readyMain(G, who) {
  G.activePlayer = who; G.priorityHolder = who; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
}
function passUntil(G, done, max) {
  let safety = max || 60;
  while (!done() && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
  return safety > 0;
}
// A trigger that listens for one zone pair and gains its controller 1 life —
// a durable observable even after the queue drains.
const onMove = (from, to, extraTerms, opts) => Object.assign({
  event: 'card_zone_change',
  condition: ['card_moves(' + from + ', ' + to + ')'].concat(extraTerms || []),
  text: 'Whenever a card moves ' + from + ' -> ' + to + ', gain 1 life.',
  effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }],
}, opts || {});
// Find the queued/stacked trigger for a listener, wherever drain left it.
function queuedEventsFor(G, listenerIid) {
  const out = [];
  for (const p of G.pendingTriggers) if (p.sourceIid === listenerIid) out.push(p.event);
  for (const s of G.stack) if (s.kind === 'trigger' && s.sourceIid === listenerIid) out.push(s.event);
  return out;
}
const VANILLA = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (hasType(c, 'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id;
  }
  return null;
})();

if (!VANILLA || !CARDS['lightning_bolt'] || !CARDS['plains'] || !CARDS['mountain']) {
  console.log('  (required templates missing -- cannot run)');
  fail++;
} else {

console.log('=== A3-6 core (RED pre-build-out): "whenever you draw" fires — card_moves(library, hand) ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('library', 'hand', ['controlled_by(you)'])];
  G.you.battlefield.push(listener);
  G.you.library = [mk('plains', 'you'), mk('plains', 'you')];
  G.pendingTriggers = [];
  const topIid = G.you.library[0].iid;
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test Draw', sourceIid: -1 },
    { kind: 'draw', amount: 1 }, null);
  check('drawn card is in hand', G.you.hand.some(c => c.iid === topIid));
  check('the draw queued the trigger (RED today: 0 queued)',
    G.pendingTriggers.length === 1, 'queued=' + G.pendingTriggers.length);
  const evt = G.pendingTriggers[0] && G.pendingTriggers[0].event;
  check('payload: from_zone=library, to_zone=hand',
    !!evt && evt.from_zone === 'library' && evt.to_zone === 'hand', JSON.stringify(evt && { f: evt.from_zone, t: evt.to_zone }));
  check('payload: subject is the drawn card', !!evt && evt.subject_iid === topIid);
  check('payload: source_iid threads the causing source', !!evt && evt.source_iid === -1);
  G.pendingTriggers = [];
})();

console.log('\n=== move_card-shaped draw (the desugared "draw(1)") fires the same way ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('library', 'hand', ['controlled_by(you)'])];
  G.you.battlefield.push(listener);
  G.you.library = [mk('plains', 'you')];
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test', sourceIid: -1 },
    { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }, null);
  check('move_card draw queued the trigger', G.pendingTriggers.length === 1,
    'queued=' + G.pendingTriggers.length);
  G.pendingTriggers = [];
})();

console.log('\n=== "whenever a card is discarded" — AI discard path (hand → graveyard) ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('hand', 'graveyard')];
  G.you.battlefield.push(listener);
  G.opp.hand = [mk('plains', 'opp'), mk('plains', 'opp')];
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Rack', sourceIid: -2 },
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'controller_chosen', amount: 2 }, null);
  check('both discards queued the trigger', G.pendingTriggers.length === 2,
    'queued=' + G.pendingTriggers.length);
  const evt = G.pendingTriggers[0] && G.pendingTriggers[0].event;
  check('payload: hand → graveyard, controller=opp (the discarder)',
    !!evt && evt.from_zone === 'hand' && evt.to_zone === 'graveyard' && evt.controller === 'opp');
  check('payload: source_iid = the discard-forcer', !!evt && evt.source_iid === -2);
  G.pendingTriggers = [];
})();

console.log('\n=== human forced-discard resolution (doDiscard) emits with the forcing card attributed ===');
(() => {
  // executeAction's step() resolves the queued triggers immediately, so pin
  // via life deltas: an unguarded listener (+1) proves the emission; a
  // noSelfCascade listener (+5) cast as the FORCER proves source_iid is
  // threaded (it must self-suppress — the test_event_source_iid pattern).
  const G = newGame();
  const plain = mk(VANILLA, 'you');
  plain.triggers = [onMove('hand', 'graveyard')];
  const forcer = mk(VANILLA, 'you');
  forcer.triggers = [Object.assign(onMove('hand', 'graveyard'),
    { effects: [{ kind: 'gain_life', scope: 'self', amount: 5 }], generated: true, noSelfCascade: true })];
  G.you.battlefield.push(plain, forcer);
  const victim = mk('plains', 'you');
  G.you.hand = [victim];
  readyMain(G, 'you');
  G.pendingTriggers = [];
  const life0 = G.you.life;
  // The FORCER compels you to discard (sourceIid threaded onto forcedDiscard).
  ENGINE.applyEffect({ controller: 'opp', sourceName: forcer.name, sourceIid: forcer.iid },
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'target_player_chosen', amount: 1 },
    { kind: 'player', who: 'you' });
  check('forcedDiscard prompt opened', !!G.forcedDiscard);
  ENGINE.executeAction('you', { type: 'discard', cardIid: victim.iid });
  passUntil(G, () => G.stack.length === 0 && G.pendingTriggers.length === 0, 80);
  check('the human discard emitted (unguarded listener fired) AND source_iid named the forcer (guarded listener self-suppressed): +1, not +6',
    G.you.life === life0 + 1, life0 + ' -> ' + G.you.life);
})();

console.log('\n=== "whenever a card is milled" — card_moves(library, graveyard) ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('library', 'graveyard')];
  G.you.battlefield.push(listener);
  G.you.library = [mk('plains', 'you'), mk('plains', 'you'), mk('plains', 'you')];
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test Mill', sourceIid: -4 },
    { kind: 'move_card', from_zone: 'library', to_zone: 'graveyard', selector: 'controller_top', amount: 2 }, null);
  check('two mills queued two triggers', G.pendingTriggers.length === 2,
    'queued=' + G.pendingTriggers.length);
  const evt = G.pendingTriggers[1] && G.pendingTriggers[1].event;
  check('payload: library → graveyard with source_iid', !!evt
    && evt.from_zone === 'library' && evt.to_zone === 'graveyard' && evt.source_iid === -4);
  G.pendingTriggers = [];
})();

console.log('\n=== "whenever a spell is countered" — card_moves(stack, graveyard) via counter ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('stack', 'graveyard')];
  G.you.battlefield.push(listener);
  const spell = mk('lightning_bolt', 'you');
  const item = { kind: 'spell', card: spell, controller: 'you', targets: [] };
  G.stack.push(item);
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Counter', sourceIid: -5 },
    { kind: 'counter' }, { kind: 'stack', stackItem: item });
  check('counter queued the stack→graveyard trigger', G.pendingTriggers.length === 1,
    'queued=' + G.pendingTriggers.length);
  const evt = G.pendingTriggers[0] && G.pendingTriggers[0].event;
  check('payload: subject = countered card, controller = its caster',
    !!evt && evt.subject_iid === spell.iid && evt.controller === 'you');
  G.pendingTriggers = [];
})();

console.log('\n=== graveyard/exile recursion — card_moves(graveyard, exile) and (graveyard, hand) ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('graveyard', 'exile'), onMove('graveyard', 'hand')];
  G.you.battlefield.push(listener);
  const dead1 = mk(VANILLA, 'you'), dead2 = mk(VANILLA, 'you');
  G.you.graveyard = [dead1, dead2];
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test Scoop', sourceIid: -6 },
    { kind: 'move_card', from_zone: 'graveyard', to_zone: 'exile', selector: 'target', amount: 1 },
    { kind: 'creature', iid: dead1.iid });
  check('graveyard→exile moved the card', G.you.exile.some(c => c.iid === dead1.iid));
  check('graveyard→exile queued its trigger', G.pendingTriggers.length === 1,
    'queued=' + G.pendingTriggers.length);
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test Raise', sourceIid: -6 },
    { kind: 'move_card', from_zone: 'graveyard', to_zone: 'hand', selector: 'target', amount: 1 },
    { kind: 'creature', iid: dead2.iid });
  check('graveyard→hand queued its trigger', G.pendingTriggers.length === 1,
    'queued=' + G.pendingTriggers.length);
  G.pendingTriggers = [];
})();

console.log('\n=== tutors are library→hand moves — AI search + human searchPick ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('library', 'hand')];
  G.you.battlefield.push(listener);
  // AI path: opp tutors a land (auto-pick).
  G.opp.library = [mk('plains', 'opp')];
  G.pendingTriggers = [];
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Tutor', sourceIid: -7 },
    { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'library_search', filter: 'land', amount: 1 }, null);
  check('AI tutor queued the trigger', G.pendingTriggers.length === 1,
    'queued=' + G.pendingTriggers.length);
  check('AI tutor payload carries source_iid', G.pendingTriggers[0]
    && G.pendingTriggers[0].event.source_iid === -7);
  G.pendingTriggers = [];
  // Human path: prompt opens, searchPick resolves it. Same life-delta pin as
  // the doDiscard block: the searching card is itself a noSelfCascade
  // library→hand listener (+5) — threaded source_iid must self-suppress it,
  // while the plain listener above (+1) proves the emission happened.
  const searcher = mk(VANILLA, 'you');
  searcher.triggers = [Object.assign(onMove('library', 'hand'),
    { effects: [{ kind: 'gain_life', scope: 'self', amount: 5 }], generated: true, noSelfCascade: true })];
  G.you.battlefield.push(searcher);
  const fetchable = mk('plains', 'you');
  G.you.library = [fetchable];
  readyMain(G, 'you');
  G.pendingTriggers = [];
  const life0 = G.you.life;
  ENGINE.applyEffect({ controller: 'you', sourceName: searcher.name, sourceIid: searcher.iid },
    { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'library_search', filter: 'land', amount: 1 }, null);
  check('human search prompt opened', !!G.pendingSearch);
  ENGINE.executeAction('you', { type: 'searchPick', cardIid: fetchable.iid });
  passUntil(G, () => G.stack.length === 0 && G.pendingTriggers.length === 0, 80);
  check('human searchPick emitted (plain listener +1) with source_iid = the searcher (guarded listener self-suppressed)',
    G.you.life === life0 + 1, life0 + ' -> ' + G.you.life);
})();

console.log('\n=== steal mints its fresh instance none→library ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [onMove('none', 'library')];
  G.you.battlefield.push(listener);
  const victim = mk(VANILLA, 'you');
  G.you.battlefield.push(victim);
  G.pendingTriggers = [];
  // opp steals (transient slot, no RUN write) — fresh instance into opp library.
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test Theft', sourceIid: -9 },
    { kind: 'steal' }, { kind: 'creature', iid: victim.iid });
  const mine = queuedEventsFor(G, listener.iid).filter(e =>
    e.from_zone === 'none' && e.to_zone === 'library');
  check('the fresh instance announced none→library', mine.length === 1, 'found=' + mine.length);
  check('the minted card is in the thief\'s library',
    G.opp.library.some(c => c.tplId === victim.tplId));
  G.pendingTriggers = [];
})();

console.log('\n=== full loop: cast emits hand→stack, resolution emits stack→graveyard ===');
(() => {
  const G = newGame();
  const listener = mk(VANILLA, 'you');
  listener.triggers = [
    onMove('hand', 'stack', ['controlled_by(you)']),
    onMove('stack', 'graveyard', ['controlled_by(you)']),
  ];
  G.you.battlefield.push(listener);
  const bolt = mk('lightning_bolt', 'you');
  G.you.hand = [bolt];
  readyMain(G, 'you');
  G.you.mana.R = 1;
  const youLife0 = G.you.life, oppLife0 = G.opp.life;
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: bolt.iid,
    targets: [{ kind: 'player', who: 'opp', label: 'Opp' }] });
  const settled = passUntil(G, () => G.stack.length === 0 && G.pendingTriggers.length === 0, 80);
  check('game settled', settled);
  check('bolt resolved (opp took 3)', G.opp.life === oppLife0 - 3, oppLife0 + ' -> ' + G.opp.life);
  check('BOTH zone triggers fired through the real loop (cast + resolution = +2 life)',
    G.you.life === youLife0 + 2, youLife0 + ' -> ' + G.you.life);
  check('bolt is in the graveyard', G.you.graveyard.some(c => c.iid === bolt.iid));
})();

console.log('\n=== existing-pool isolation (structural pin): every shipped/generated card_zone_change trigger is battlefield-touching ===');
(() => {
  // If this ever fails, a pool trigger became matchable by the new
  // non-battlefield events — re-audit pool behavior before shipping it.
  const movesArgs = (cond) => {
    const out = [];
    const walk = (t) => {
      if (typeof t === 'string') {
        const m = t.match(/card_moves\(([^)]*)\)/);
        if (m) out.push(m[1].split(',').map(s => s.trim()));
      } else if (Array.isArray(t)) t.forEach(walk);
      else if (t && typeof t === 'object') (t.terms || []).forEach(walk);
    };
    walk(cond);
    return out;
  };
  const offenders = [];
  const scanTrig = (label, trig) => {
    if (!trig || trig.event !== 'card_zone_change') return;
    const pairs = movesArgs(trig.condition || []);
    const ok = pairs.length > 0
      && pairs.every(([f, t]) => f === 'battlefield' || t === 'battlefield');
    if (!ok) offenders.push(label);
  };
  for (const [id, c] of Object.entries(CARDS)) {
    for (const trig of (c.triggers || [])) scanTrig(id, trig);
  }
  for (const g of (GENERATOR_CONDITIONS || [])) scanTrig('GENERATOR_CONDITIONS:' + g.id, g);
  for (const m of (MERCURIAL_TRIGGER_POOL || [])) scanTrig('MERCURIAL:' + (m.text || '?'), m);
  check('no pool/generator card_zone_change trigger can match a non-battlefield event',
    offenders.length === 0, offenders.join('; '));
})();

console.log('\n=== existing-pool isolation (behavioral): pool-shaped listeners stay silent through the new events ===');
(() => {
  const G = newGame();
  const etb = mk(VANILLA, 'you');
  etb.triggers = [{
    event: 'card_zone_change',
    condition: ['another_card', 'card_is_creature', 'controlled_by(you)', 'card_moves(anywhere, battlefield)'],
    effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }],
  }];
  const dies = mk(VANILLA, 'you');
  dies.triggers = [{
    event: 'card_zone_change',
    condition: ['this_card', 'card_moves(battlefield, graveyard)'],
    effects: [{ kind: 'gain_life', scope: 'self', amount: 1 }],
  }];
  G.you.battlefield.push(etb, dies);
  G.you.library = [mk('plains', 'you'), mk('plains', 'you'), mk('plains', 'you')];
  G.opp.hand = [mk('plains', 'opp')];
  const dead = mk(VANILLA, 'you');
  G.you.graveyard = [dead];
  G.pendingTriggers = [];
  const ctx = { controller: 'you', sourceName: 'Test', sourceIid: -10 };
  ENGINE.applyEffect(ctx, { kind: 'draw', amount: 1 }, null);
  ENGINE.applyEffect(ctx, { kind: 'move_card', from_zone: 'library', to_zone: 'graveyard', selector: 'controller_top', amount: 1 }, null);
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test', sourceIid: -10 },
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'controller_chosen', amount: 1 }, null);
  ENGINE.applyEffect(ctx, { kind: 'move_card', from_zone: 'graveyard', to_zone: 'exile', selector: 'target', amount: 1 },
    { kind: 'creature', iid: dead.iid });
  check('draw/mill/discard/recursion queued NOTHING for battlefield-pair listeners',
    G.pendingTriggers.length === 0, 'queued=' + G.pendingTriggers.length);
})();

console.log('\n=== a draw-triggered draw cannot loop unboundedly — the per-episode trigger budget stops it ===');
(() => {
  const G = newGame();
  const looper = mk(VANILLA, 'you');
  looper.triggers = [{
    event: 'card_zone_change',
    condition: ['card_moves(library, hand)', 'controlled_by(you)'],
    text: 'Whenever you draw a card, draw a card.',
    effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }],
  }];
  G.you.battlefield.push(looper);
  G.you.library = [];
  for (let i = 0; i < 150; i++) G.you.library.push(mk('plains', 'you'));
  readyMain(G, 'you');
  G.pendingTriggers = [];
  const hand0 = G.you.hand.length;
  // Seed draw (foreign source), then let the real priority loop chew the chain.
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Seed', sourceIid: -11 },
    { kind: 'draw', amount: 1 }, null);
  const settled = passUntil(G, () => G.stack.length === 0 && G.pendingTriggers.length === 0
    && G.triggerChainDepth === 0, 800);
  const drawn = G.you.hand.length - hand0;
  check('the loop terminated (did not hang or deck out)', settled && !G.gameOver,
    'settled=' + settled + ' gameOver=' + G.gameOver);
  check('the budget capped the chain (~cap+1 draws, library NOT drained)',
    drawn >= 90 && drawn <= 110 && G.you.library.length > 0,
    'drawn=' + drawn + ' libraryLeft=' + G.you.library.length);
})();

console.log('\n=== noSelfCascade: a guarded draw-trigger fires on a foreign draw, never on its own ===');
(() => {
  const G = newGame();
  const guarded = mk(VANILLA, 'you');
  guarded.triggers = [{
    event: 'card_zone_change',
    condition: ['card_moves(library, hand)', 'controlled_by(you)'],
    text: 'Whenever you draw a card, draw a card.',
    effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }],
    generated: true, noSelfCascade: true,
  }];
  G.you.battlefield.push(guarded);
  G.you.library = [mk('plains', 'you'), mk('plains', 'you'), mk('plains', 'you'), mk('plains', 'you')];
  readyMain(G, 'you');
  G.pendingTriggers = [];
  const hand0 = G.you.hand.length;
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Seed', sourceIid: -12 },
    { kind: 'draw', amount: 1 }, null);
  const settled = passUntil(G, () => G.stack.length === 0 && G.pendingTriggers.length === 0, 80);
  const drawn = G.you.hand.length - hand0;
  check('settled', settled);
  check('exactly 2 draws: the seed fires it once; its own draw self-suppresses (sourceIid threaded through drawCard)',
    drawn === 2, 'drawn=' + drawn);
})();

console.log('\n=== setup rule (canon §1002.2a): opening hands are constructed, not moved — no events before the game ===');
(() => {
  const G = newGame();  // newGame runs RUN.startNextGame() — a full game setup
  check('game setup queued no zone-change triggers', ENGINE.state().pendingTriggers.length === 0);
  // And the seam is real: makePlayer never routes through drawCard — the
  // 7-card hand exists without a single library→hand event having fired.
  const src = setup.getSource();
  const mpBody = src.slice(src.indexOf('function makePlayer'), src.indexOf('function makeState'));
  check('makePlayer constructs hands without drawCard/emitZoneChange (source pin)',
    mpBody.length > 0 && !/drawCard\(|emitZoneChange\(/.test(mpBody));
})();

}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
