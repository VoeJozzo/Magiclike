// Audit A4-2 (adjudicates parked A2-9) — lord static-buff reconciliation.
//
// A static_buff is ONE ability with two halves. Before this fix the halves
// lived in two divergent lifecycle models:
//   - stats: recomputed live in getStats (drops instantly when the filter
//     stops matching) — but with NO Creature gate, so a subtype-free lord
//     buffed lands (A2-9's executed divergence);
//   - keywords: event-reconciled into card.keywords by
//     applyStaticKeywordGrants — but ADD-ONLY, so a grant went stale forever
//     when the lord's filter stopped matching without a leave-play event
//     (steal the creature, change its type, ...).
//
// The fix hoists ONE shared lordBuffApplies() predicate consumed by both
// halves, and makes applyStaticKeywordGrants a true diff-reconcile (revoke
// pass for lord-sourced grants the predicate no longer accepts). This file
// pins:
//   1. steal (change_control) revokes the old lord's keyword AND the stat
//      half agrees (both halves answer through the one predicate);
//   2. the thief's own lord picks the stolen creature up;
//   3. spell-sourced permanent grants survive reconcile (leave-play contract
//      untouched);
//   4. multi-source: revoking the lord's source keeps a keyword another
//      source still grants;
//   5. an EOT grant of the same keyword (Threaten's grant_haste) survives the
//      lord-grant revocation;
//   6. A2-9's stat gate: a subtype-free {controller:'self'} lord buff no
//      longer buffs non-creatures (lands);
//   7. the real emit path heals stale grants with no direct reconcile call.

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
    keywords: (inst.keywords || []).slice(),
    grantedBy: new Map(), eotGrants: [], typeGrants: [],
  });
}
function drain(G) {
  let safety = 80;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
function freshGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('mountain'), colors: ['R'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];
  return G;
}
const steal = (G, byWho, c) => {
  ENGINE.applyEffect({ controller: byWho, sourceName: 'Mind Control', sourceIid: -101 },
    { kind: 'change_control' }, { kind: 'creature', iid: c.iid });
};

console.log('=== 1. steal revokes the old lord\'s keyword grant; stat half agrees ===');
(() => {
  const G = freshGame();
  const lord = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(lord, raider);
  ENGINE.applyStaticKeywordGrants();
  check('setup: raider has lord-granted haste', raider.keywords.includes('haste'));
  check('setup: stat half applies (+1/+1)', ENGINE.getStats(raider)[0] === CARDS.goblin_raider.power + 1);

  steal(G, 'opp', raider);
  ENGINE.applyStaticKeywordGrants();   // the emit() reconcile hook
  check('stolen raider is on opp battlefield', G.opp.battlefield.some(c => c.iid === raider.iid));
  check('haste REVOKED after steal (was: stuck forever)', !raider.keywords.includes('haste'),
    'keywords=' + JSON.stringify(raider.keywords));
  check('grantedBy no longer maps haste to the old lord',
    !(raider.grantedBy instanceof Map) || !raider.grantedBy.has('haste'));
  check('stat half dropped too (both halves agree)',
    ENGINE.getStats(raider)[0] === CARDS.goblin_raider.power,
    'power=' + ENGINE.getStats(raider)[0]);
})();

console.log('\n=== 2. the thief\'s own lord picks the stolen creature up ===');
(() => {
  const G = freshGame();
  const yourLord = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  const oppLord = mk('goblin_chieftain', 'opp');
  G.you.battlefield.push(yourLord, raider);
  G.opp.battlefield.push(oppLord);
  ENGINE.applyStaticKeywordGrants();
  steal(G, 'opp', raider);
  ENGINE.applyStaticKeywordGrants();
  check('stolen raider still has haste — now from the OPP lord', raider.keywords.includes('haste'));
  check('grantedBy maps haste to the opp lord, not the old one',
    raider.grantedBy instanceof Map && raider.grantedBy.has('haste')
      && raider.grantedBy.get('haste').has(oppLord.iid)
      && !raider.grantedBy.get('haste').has(yourLord.iid));
  check('stat half follows the new lord (+1/+1)',
    ENGINE.getStats(raider)[0] === CARDS.goblin_raider.power + 1);
})();

console.log('\n=== 3. spell-sourced permanent grants survive the reconcile ===');
(() => {
  const G = freshGame();
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(raider);
  // Permanent grant from a one-shot spell (source not on the battlefield).
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Winged Boon', sourceIid: -202 },
    { kind: 'grant_keyword', keyword: 'flying', duration: 'permanent' },
    { kind: 'creature', iid: raider.iid });
  check('setup: spell granted flying', raider.keywords.includes('flying'));
  ENGINE.applyStaticKeywordGrants();
  check('flying survives reconcile (leave-play contract untouched)',
    raider.keywords.includes('flying'));
  check('grantedBy still records the spell source',
    raider.grantedBy.has('flying') && raider.grantedBy.get('flying').has(-202));
})();

console.log('\n=== 4. multi-source: lord revoked, spell source keeps the keyword alive ===');
(() => {
  const G = freshGame();
  const lord = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(lord, raider);
  ENGINE.applyStaticKeywordGrants();
  // Same keyword from a spell too.
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Quickening', sourceIid: -303 },
    { kind: 'grant_keyword', keyword: 'haste', duration: 'permanent' },
    { kind: 'creature', iid: raider.iid });
  steal(G, 'opp', raider);
  ENGINE.applyStaticKeywordGrants();
  check('haste kept — the spell source still grants it', raider.keywords.includes('haste'));
  check('lord\'s source removed from the grant set',
    raider.grantedBy.has('haste') && !raider.grantedBy.get('haste').has(lord.iid)
      && raider.grantedBy.get('haste').has(-303));
})();

console.log('\n=== 5. Threaten shape: EOT haste survives the lord-grant revocation ===');
(() => {
  const G = freshGame();
  const lord = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(lord, raider);
  ENGINE.applyStaticKeywordGrants();
  // Threaten: steal until EOT + grant_haste (eot) — the in-pool card's params.
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Threaten', sourceIid: -404 },
    { kind: 'change_control', duration: 'eot', grant_haste: true, untap: true },
    { kind: 'creature', iid: raider.iid });
  ENGINE.applyStaticKeywordGrants();
  check('stolen raider keeps haste — Threaten\'s own EOT grant', raider.keywords.includes('haste'),
    'keywords=' + JSON.stringify(raider.keywords));
  check('eotGrants carries it (not the revoked lord grant)',
    Array.isArray(raider.eotGrants) && raider.eotGrants.includes('haste')
      && !(raider.grantedBy.has('haste') && raider.grantedBy.get('haste').has(lord.iid)));
})();

console.log('\n=== 6. A2-9: the stat half no longer buffs non-creatures ===');
(() => {
  const G = freshGame();
  // Hand-crafted subtype-free lord ("creatures you control get +1/+1") — the
  // executed A2-9 divergence: the stat loop buffed a Mountain.
  const lord = mk('goblin_chieftain', 'you');
  lord.static_buffs = [{ filter: { controller: 'self' }, power: 1, toughness: 1 }];
  const land = mk('mountain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(lord, land, raider);
  const [lp, lt] = ENGINE.getStats(land);
  check('a land gets NO stat buff from a subtype-free lord', lp === 0 && lt === 0,
    'land stats=' + lp + '/' + lt);
  check('a creature still gets the buff', ENGINE.getStats(raider)[0] === CARDS.goblin_raider.power + 1);
})();

console.log('\n=== 7. the real emit path heals a stale grant (no direct reconcile call) ===');
(() => {
  const G = freshGame();
  const lord = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(lord, raider);
  ENGINE.applyStaticKeywordGrants();
  steal(G, 'opp', raider);
  // No direct call — cast a creature; the resolution's emits reconcile.
  const burn = mk('goblin_raider', 'you');
  G.you.hand.push(burn);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: burn.iid });
  drain(G);
  check('stolen raider lost haste via the ordinary event flow', !raider.keywords.includes('haste'),
    'keywords=' + JSON.stringify(raider.keywords));
})();

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
