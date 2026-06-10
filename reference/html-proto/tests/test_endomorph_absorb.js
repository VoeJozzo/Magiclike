// Endomorph absorb — dedicated coverage for the endomorph_absorb effect
// handler (engine.js EFFECTS) and its full pipeline: kill-attribution
// predicate (card_damaged_by_this over damagedBySources), the novel-keyword
// diff + priority pick, the +1/+1 fallback, run-slot persistence via
// RUN.applyStickerToSlot, the in-game mirror (keywords/stickers/modifiers
// push), and the dead-Endomorph graveyard-corpse path.
//
// REGRESSION PIN: the E1 zone-change migration renamed the event payload to
// `subject_card`, but endomorph_absorb kept reading the legacy `event.card` —
// so EVERY absorb fizzled ("no victim recorded") with no test to notice.
// Identical to the bargain_sticker_other payout bug fixed earlier. Section 1
// exists so a payload rename can never silently kill this mechanic again.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function drain(G) {
  let safety = 40;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
// Fresh run per section: slot 0 is the Endomorph slot, so persistence
// assertions read a clean slate each time.
function freshRun() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: ['endomorph'].concat(Array(11).fill('mountain')), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = [];
  G.pendingTriggers = [];
  return G;
}
// Real-path instances. slotIdx 0 for the player's Endomorph (matches deck).
function place(G, tplId, controller, slotIdx) {
  const c = ENGINE.makeCard(tplId, [], typeof slotIdx === 'number' ? slotIdx : null);
  Object.assign(c, { controller, owner: controller, tapped: false, sick: false, damage: 0 });
  G[controller].battlefield.push(c);
  return c;
}
// Kill `victim` with damage-attribution pointing at `byCard` (the combat /
// damage paths stamp exactly these two fields), then let triggers drain.
function killAttributedTo(G, victim, byCard) {
  victim.damagedBySources = new Set([byCard.iid]);
  victim.killedBy = byCard.controller || 'you';
  ENGINE.applyEffect({ controller: victim.killedBy, sourceName: 'Doom', sourceIid: 99001 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: victim.iid });
  drain(G);
}
const logHas = (G, re) => (G.log || []).some(l => re.test(l.msg || l));

console.log('=== regression pin: a real kill ABSORBS (event payload reaches the handler) ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victim = place(G, 'cloud_pegasus', 'opp');   // flying
  killAttributedTo(G, victim, endo);
  check('no fizzle logged', !logHas(G, /absorb fizzles/i));
  check('absorb logged', logHas(G, /absorbs flying from Cloud Pegasus/i));
  check('keyword active on the live instance', endo.keywords.includes('flying'));
  check('sticker badge mirrored on the instance', endo.stickers.includes('kw_flying'));
  check('run slot persisted kw_flying', (RUN.getSlots()[0].stickers || []).includes('kw_flying'),
    JSON.stringify(RUN.getSlots()[0]));
})();

console.log('\n=== priority: multi-keyword victim → highest-priority keyword wins ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  // skyfire_drakelord: first_strike (printed) + flying (Dragon subtype-implied).
  // flying ranks 4, first_strike 2 → flying is absorbed.
  const victim = place(G, 'skyfire_drakelord', 'opp');
  check('victim carries both candidates', victim.keywords.includes('flying') && victim.keywords.includes('first_strike'),
    JSON.stringify(victim.keywords));
  killAttributedTo(G, victim, endo);
  check('higher-priority flying absorbed', endo.keywords.includes('flying'));
  check('first_strike NOT absorbed (one keyword per kill)', !endo.keywords.includes('first_strike'));
})();

console.log('\n=== fallback: vanilla victim → +1/+1 (modifiers + sticker + slot) ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victim = place(G, 'grizzly_bears', 'opp');
  const [bp, bt] = ENGINE.getStats(endo);
  killAttributedTo(G, victim, endo);
  check('grow logged', logHas(G, /eats Grizzly Bears and grows/i));
  check('stats grew +1/+1 via modifiers', ENGINE.getStats(endo).join('/') === (bp + 1) + '/' + (bt + 1),
    ENGINE.getStats(endo).join('/'));
  check('plus1_plus1 sticker mirrored', endo.stickers.includes('plus1_plus1'));
  check('run slot persisted plus1_plus1', (RUN.getSlots()[0].stickers || []).includes('plus1_plus1'));
})();

console.log('\n=== defender is never absorbed: defender-only victim falls back to +1/+1 ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victim = place(G, 'grizzly_bears', 'opp');
  victim.keywords.push('defender');
  killAttributedTo(G, victim, endo);
  check('defender not absorbed', !endo.keywords.includes('defender'));
  check('fell back to +1/+1', endo.stickers.includes('plus1_plus1'));
})();

console.log('\n=== already-known keyword is not novel: second flier → +1/+1 ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  killAttributedTo(G, place(G, 'cloud_pegasus', 'opp'), endo);
  check('first kill absorbed flying', endo.keywords.includes('flying'));
  killAttributedTo(G, place(G, 'cloud_pegasus', 'opp'), endo);
  check('second flier fell back to +1/+1', endo.stickers.includes('plus1_plus1'),
    JSON.stringify(endo.stickers));
  check('slot carries both stickers', ['kw_flying', 'plus1_plus1'].every(s => (RUN.getSlots()[0].stickers || []).includes(s)),
    JSON.stringify(RUN.getSlots()[0].stickers));
})();

console.log('\n=== dead-Endomorph path: mutual kill still rewards the graveyard corpse ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victim = place(G, 'cloud_pegasus', 'opp');
  // Victim dies with attribution (queues the absorb trigger)…
  victim.damagedBySources = new Set([endo.iid]); victim.killedBy = 'you';
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Doom', sourceIid: 99001 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: victim.iid });
  // …and Endomorph dies BEFORE the trigger resolves (combat mutual-kill shape).
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Doom', sourceIid: 99002 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: endo.iid });
  drain(G);
  const corpse = G.you.graveyard.find(c => c.iid === endo.iid);
  check('Endomorph is in the graveyard', !!corpse);
  check('corpse carries the absorbed keyword', corpse && corpse.keywords.includes('flying'));
  check('corpse carries the sticker badge', corpse && corpse.stickers.includes('kw_flying'));
  check('run slot still persisted (corpse slotIdx intact)', (RUN.getSlots()[0].stickers || []).includes('kw_flying'),
    JSON.stringify(RUN.getSlots()[0]));
})();

console.log('\n=== opponent-side Endomorph: in-game mirror only, no run persistence ===');
(() => {
  const G = freshRun();
  const oppEndo = place(G, 'endomorph', 'opp');           // slotIdx null — opp has no run slots
  const victim = place(G, 'cloud_pegasus', 'you');
  victim.damagedBySources = new Set([oppEndo.iid]); victim.killedBy = 'opp';
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Doom', sourceIid: 99001 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: victim.iid });
  drain(G);
  check('opp Endomorph absorbed in-game', oppEndo.keywords.includes('flying'));
  check('player run slots untouched', !(RUN.getSlots()[0].stickers || []).length,
    JSON.stringify(RUN.getSlots()[0].stickers));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
