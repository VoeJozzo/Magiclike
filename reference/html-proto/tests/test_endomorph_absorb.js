// Endomorph absorb — dedicated coverage for the endomorph_absorb effect
// handler (engine.js EFFECTS) and its full pipeline: kill-attribution
// (recordDamage → damagedBySources / card_damaged_by_this), the shared
// trophy rule (claimableKeywords: intrinsics only — printed + stickers +
// subtype-implied, never borrowed lord/EOT grants, never defender — used by
// BOTH the absorb and the end-of-game claimedKeywords reward system), the
// priority pick, the +1/+1 fallback, run-slot persistence via
// RUN.applyStickerToSlot, the in-game mirror, the dead-Endomorph
// graveyard-corpse path, and the bounced-Endomorph fade.
//
// REGRESSION PINS:
// - The E1 zone-change migration renamed the event payload to `subject_card`,
//   but endomorph_absorb kept reading the legacy `event.card` — so EVERY
//   absorb fizzled ("no victim recorded") with no test to notice. Identical
//   to the bargain_sticker_other payout bug fixed earlier. Section 1 exists
//   so a payload rename can never silently kill this mechanic again.
// - The lord-granted sections pin the trophy rule against death-pipeline
//   reordering: claims must exclude borrowed keywords because
//   claimableKeywords reads intrinsics, NOT because resetInPlayState happens
//   to strip grants before the dies-event emits.

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

console.log('\n=== defender is never absorbed (intrinsic Wall defender, both shapes) ===');
(() => {
  // iron_statue: Wall (subtype-implied defender) + printed indestructible.
  // The filter must skip defender while still taking the real trophy.
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const statue = place(G, 'iron_statue', 'opp');
  // Strip LIVE indestructible so destroy can kill it — intrinsics (what the
  // absorb reads) still carry both indestructible and Wall-defender.
  statue.keywords = statue.keywords.filter(k => k !== 'indestructible');
  killAttributedTo(G, statue, endo);
  check('indestructible absorbed from the statue', endo.keywords.includes('indestructible'));
  check('defender NOT absorbed alongside it', !endo.keywords.includes('defender'));
})();
(() => {
  // Defender-ONLY victim (vanilla bear made a Wall): nothing claimable → +1/+1.
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victim = place(G, 'grizzly_bears', 'opp');
  victim.types.push('Wall');   // intrinsic defender via subtype
  killAttributedTo(G, victim, endo);
  check('defender-only victim: defender not absorbed', !endo.keywords.includes('defender'));
  check('defender-only victim: fell back to +1/+1', endo.stickers.includes('plus1_plus1'));
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

console.log('\n=== shared trophy rule: lord-granted keywords are claimable by NEITHER system ===');
(() => {
  // Victim's only keyword is haste borrowed from its (opposing) lord. Pin for
  // BOTH systems — and against death-pipeline reordering: the rule must hold
  // because claimableKeywords reads intrinsics, not because resetInPlayState
  // happens to strip grants before the dies-event emits.
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const oppLord = place(G, 'goblin_chieftain', 'opp');
  const raider = place(G, 'goblin_raider', 'opp');
  ENGINE.applyStaticKeywordGrants();
  check('victim is hasted by its lord pre-death', raider.keywords.includes('haste'));
  G.you.claimedKeywords = new Set();
  killAttributedTo(G, raider, endo);
  check('Endomorph did not absorb the borrowed haste', !endo.keywords.includes('haste'));
  check('fell back to +1/+1', endo.stickers.includes('plus1_plus1'));
  check('reward claim did not bank the borrowed haste either', !G.you.claimedKeywords.has('haste'),
    JSON.stringify([...G.you.claimedKeywords]));
  void oppLord;
})();

console.log('\n=== claim-system consistency: stickers claimable, borrowed grants not ===');
(() => {
  // One kill, one victim carrying BOTH a sticker keyword (lifelink) and a
  // lord-granted keyword (haste): both systems take the sticker, skip the loan.
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  place(G, 'goblin_chieftain', 'opp');
  const victim = ENGINE.makeCard('goblin_raider', ['kw_lifelink']);
  Object.assign(victim, { controller: 'opp', owner: 'opp', tapped: false, sick: false, damage: 0 });
  G.opp.battlefield.push(victim);
  ENGINE.applyStaticKeywordGrants();
  check('victim carries sticker lifelink + granted haste',
    victim.keywords.includes('lifelink') && victim.keywords.includes('haste'),
    JSON.stringify(victim.keywords));
  G.you.claimedKeywords = new Set();
  killAttributedTo(G, victim, endo);
  check('Endomorph absorbed the sticker lifelink', endo.keywords.includes('lifelink'));
  check('Endomorph skipped the granted haste', !endo.keywords.includes('haste'));
  check('reward claim banked lifelink, not haste',
    G.you.claimedKeywords.has('lifelink') && !G.you.claimedKeywords.has('haste'),
    JSON.stringify([...G.you.claimedKeywords]));
})();

console.log('\n=== novelty is intrinsic: a BORROWED keyword does not block absorbing it for keeps ===');
(() => {
  // Endomorph temporarily has flying (until-EOT grant). Killing a flier should
  // still absorb flying PERMANENTLY — what it borrows isn't what it owns.
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Wings', sourceIid: 88001 },
    { kind: 'grant_keyword', keyword: 'flying', duration: 'eot' }, { kind: 'creature', iid: endo.iid });
  check('endo borrows flying until EOT', endo.keywords.includes('flying'));
  const victim = place(G, 'cloud_pegasus', 'opp');
  killAttributedTo(G, victim, endo);
  check('flying absorbed for keeps despite the borrow', endo.stickers.includes('kw_flying'),
    JSON.stringify(endo.stickers));
  check('run slot persisted kw_flying', (RUN.getSlots()[0].stickers || []).includes('kw_flying'));
})();

console.log('\n=== ghost edge: Endomorph bounced between queue and resolve → honest fade, no false absorb ===');
(() => {
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victim = place(G, 'cloud_pegasus', 'opp');
  // Victim dies with attribution (queues the absorb trigger)…
  victim.damagedBySources = new Set([endo.iid]); victim.killedBy = 'you';
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Doom', sourceIid: 99001 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: victim.iid });
  // …and Endomorph is BOUNCED to hand before the trigger resolves: no
  // battlefield card, no corpse — nowhere for the reward to land.
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Unsummon', sourceIid: 99002 },
    { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' },
    { kind: 'creature', iid: endo.iid });
  drain(G);
  check('fade logged (not a false absorb)', logHas(G, /absorb fades/i));
  check('no absorb logged', !logHas(G, /absorbs flying/i));
  const inHand = G.you.hand.find(c => c.iid === endo.iid);
  check('bounced Endomorph gained nothing', inHand && !inHand.keywords.includes('flying')
    && !(inHand.stickers || []).includes('kw_flying'));
  check('run slot untouched', !(RUN.getSlots()[0].stickers || []).length,
    JSON.stringify(RUN.getSlots()[0].stickers));
})();

console.log('\n=== finisher kills: chip + ANY death this turn feeds (SBA + destroy paths) ===');
(() => {
  // The templating is "a creature dealt damage by this dies" — Endomorph need
  // not deal the killing blow. Two real shapes, exercising BOTH death paths:
  // (a) Endomorph chips 2, a burn spell finishes — death via the checkDeaths
  //     SBA batch (the path real combat kills take, with extraSources);
  // (b) Endomorph chips 2 (block), a destroy spell finishes — death via
  //     moveToGraveyard. The destroy stamps nothing into damagedBySources
  //     (destroying isn't damage) but must not erase Endomorph's chip either.
  const G = freshRun();
  const endo = place(G, 'endomorph', 'you', 0);
  const victimA = place(G, 'cloud_pegasus', 'opp');
  victimA.power = 5; victimA.toughness = 5;
  // (a) real damage path both times: chip from Endomorph, finish from a spell
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Endomorph', sourceIid: endo.iid, sourceCard: endo },
    { kind: 'damage', amount: 2 }, { kind: 'creature', iid: victimA.iid });
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Lightning Bolt', sourceIid: 77001,
    sourceCard: { name: 'Lightning Bolt', types: ['Sorcery'] } },
    { kind: 'damage', amount: 3 }, { kind: 'creature', iid: victimA.iid });
  check('spell finisher did NOT enter damagedBySources (creature sources only)',
    victimA.damagedBySources.size === 1 && victimA.damagedBySources.has(endo.iid));
  // 5 damage on a 5-tough creature: death happens at the next SBA sweep —
  // poke the settle loop with a pass, then drain the queued trigger.
  ENGINE.executeAction('you', { type: 'pass' });
  drain(G);
  check('(a) SBA death after burn finish: absorb fired', endo.keywords.includes('flying'),
    JSON.stringify(endo.keywords));
  // (b) chip then destroy-finish on a fresh victim (flying already absorbed,
  // so use a lifelink-stickered victim to see a fresh trophy)
  const victimB = ENGINE.makeCard('goblin_raider', ['kw_lifelink']);
  Object.assign(victimB, { controller: 'opp', owner: 'opp', tapped: false, sick: false, damage: 0 });
  G.opp.battlefield.push(victimB);
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Endomorph', sourceIid: endo.iid, sourceCard: endo },
    { kind: 'damage', amount: 1 }, { kind: 'creature', iid: victimB.iid });
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Doom Blade', sourceIid: 77002 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: victimB.iid });
  drain(G);
  check('(b) destroy finish after a block chip: absorb fired', endo.keywords.includes('lifelink'),
    JSON.stringify(endo.keywords));
  // Negative: a victim Endomorph never touched feeds nothing — pin on the
  // sticker count (a wrong fire would add a keyword OR a +1/+1 sticker).
  const bystander = place(G, 'savannah_lions', 'opp');
  const stickersBefore = endo.stickers.length;
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Doom Blade', sourceIid: 77003 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: bystander.iid });
  drain(G);
  check('untouched victim feeds nothing', endo.stickers.length === stickersBefore,
    JSON.stringify(endo.stickers));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
