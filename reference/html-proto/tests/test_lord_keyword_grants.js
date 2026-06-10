// Static-lord KEYWORD grants — dedicated coverage for applyStaticKeywordGrants
// + the grantedBy-Map leave-play cleanup (clearRestrictionsFromSource).
//
// test_predate_fight_d1.js already pins the direct-seam basics (grant, subtype
// gate, no self-dupe, direct-call cleanup). This file covers what that section
// doesn't: the REAL game paths (grant via emit when a creature is cast; cleanup
// when the lord actually dies / bounces, not a direct clear call), controller
// gating, cross-lord subtype isolation, intrinsic-keyword protection on
// cleanup, multi-source grant survival, the stat half riding along via
// getStats, and a data-driven sweep of every keyword-granting lord in the pool.

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
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = [];
  return G;
}
const destroy = (G, c) => {
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Doom', sourceIid: 99001 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: c.iid });
  drain(G);
};

console.log('=== data pin: exactly these lords grant keywords via static_buffs ===');
(() => {
  const granters = Object.keys(CARDS).filter(id =>
    (CARDS[id].static_buffs || []).some(b => b.keywords && b.keywords.length)).sort();
  const expected = ['apex_elder', 'field_marshal', 'goblin_chieftain',
    'knight_commander', 'skyfire_drakelord', 'spirit_shepherd'];
  check('keyword-granting lords are exactly the known six',
    JSON.stringify(granters) === JSON.stringify(expected), granters.join(','));
})();

console.log('\n=== real entry path: a creature CAST while the lord is out gains the keyword via emit ===');
(() => {
  const G = freshGame();
  G.you.battlefield.push(mk('goblin_chieftain', 'you'));
  const raider = mk('goblin_raider', 'you');
  G.you.hand.push(raider);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: raider.iid });
  drain(G);
  const onBf = G.you.battlefield.find(c => c.iid === raider.iid);
  check('raider resolved onto the battlefield', !!onBf);
  check('raider has haste with no direct reconciliation call', onBf && (onBf.keywords || []).includes('haste'));
  check('grantedBy records the grant as a kw → source-set entry',
    onBf && onBf.grantedBy instanceof Map && onBf.grantedBy.has('haste'));
})();

console.log('\n=== gating: controller (self only) and cross-lord subtype isolation ===');
(() => {
  const G = freshGame();
  G.you.battlefield.push(mk('goblin_chieftain', 'you'), mk('field_marshal', 'you'));
  const oppGoblin = mk('goblin_raider', 'opp'); G.opp.battlefield.push(oppGoblin);
  const yourGoblin = mk('goblin_raider', 'you'); G.you.battlefield.push(yourGoblin);
  ENGINE.applyStaticKeywordGrants();
  check('your Goblin gains haste', (yourGoblin.keywords || []).includes('haste'));
  check("the OPPONENT's Goblin gains nothing (controller:self filter)",
    !(oppGoblin.keywords || []).includes('haste'));
  check('the Soldier lord does not leak vigilance onto the Goblin (subtype gate)',
    !(yourGoblin.keywords || []).includes('vigilance'));
})();

console.log('\n=== real leave path: lord DIES → grant cleared through the graveyard move ===');
(() => {
  const G = freshGame();
  const chief = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  const [bp, bt] = [CARDS.goblin_raider.power, CARDS.goblin_raider.toughness];
  G.you.battlefield.push(chief, raider);
  ENGINE.applyStaticKeywordGrants();
  check('raider hasted while the lord lives', (raider.keywords || []).includes('haste'));
  check('stat half rides along: raider is +1/+1 via getStats',
    ENGINE.getStats(raider).join('/') === (bp + 1) + '/' + (bt + 1), ENGINE.getStats(raider).join('/'));
  destroy(G, chief);
  check('lord is in the graveyard', G.you.graveyard.some(c => c.iid === chief.iid));
  check('granted haste cleared by the real death path', !(raider.keywords || []).includes('haste'));
  check('grantedBy entry removed', !(raider.grantedBy instanceof Map && raider.grantedBy.has('haste')));
  check('stat half reverted with the lord gone',
    ENGINE.getStats(raider).join('/') === bp + '/' + bt, ENGINE.getStats(raider).join('/'));
})();

console.log('\n=== real leave path: lord BOUNCES to hand → grant cleared (non-death leave) ===');
(() => {
  const G = freshGame();
  const chief = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(chief, raider);
  ENGINE.applyStaticKeywordGrants();
  check('raider hasted', (raider.keywords || []).includes('haste'));
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Bounce', sourceIid: 99002 },
    { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' },
    { kind: 'creature', iid: chief.iid });
  drain(G);
  check('lord is in hand', G.you.hand.some(c => c.iid === chief.iid));
  check('granted haste cleared by the bounce path', !(raider.keywords || []).includes('haste'));
})();

console.log('\n=== cleanup protects intrinsic keywords: a hasty Goblin keeps its own haste ===');
(() => {
  const G = freshGame();
  const chief = mk('goblin_chieftain', 'you');
  const raging = mk('raging_goblin', 'you');   // intrinsic haste
  G.you.battlefield.push(chief, raging);
  ENGINE.applyStaticKeywordGrants();
  check('no duplicate haste entry on the intrinsic carrier',
    (raging.keywords || []).filter(k => k === 'haste').length === 1);
  destroy(G, chief);
  check('intrinsic haste survives the lord leaving', (raging.keywords || []).includes('haste'));
})();

console.log('\n=== multi-source grant: keyword survives until the LAST granting lord leaves ===');
(() => {
  const G = freshGame();
  const chiefA = mk('goblin_chieftain', 'you');
  const chiefB = mk('goblin_chieftain', 'you');
  const raider = mk('goblin_raider', 'you');
  G.you.battlefield.push(chiefA, chiefB, raider);
  ENGINE.applyStaticKeywordGrants();
  check('raider hasted under two lords', (raider.keywords || []).includes('haste'));
  destroy(G, chiefA);
  check('haste persists while the second lord lives', (raider.keywords || []).includes('haste'));
  destroy(G, chiefB);
  check('haste gone once the last lord leaves', !(raider.keywords || []).includes('haste'));
})();

console.log('\n=== sweep: every keyword-granting lord grants and cleans up on its own subtype ===');
(() => {
  const G = freshGame();
  for (const id of ['goblin_chieftain', 'field_marshal', 'knight_commander',
    'spirit_shepherd', 'apex_elder', 'skyfire_drakelord']) {
    const buff = CARDS[id].static_buffs.find(b => b.keywords && b.keywords.length);
    const kw = buff.keywords[0];
    G.you.battlefield = []; G.opp.battlefield = [];
    const lord = mk(id, 'you');
    const follower = mk('grizzly_bears', 'you');
    if (!hasType(follower, buff.subtype)) follower.types.push(buff.subtype);
    // Synthetic subtype can imply a keyword of its own (Dragon → flying); the
    // granted keyword under test is always distinct from those.
    G.you.battlefield.push(lord, follower);
    ENGINE.applyStaticKeywordGrants();
    const granted = (follower.keywords || []).includes(kw);
    ENGINE.clearRestrictionsFromSource(lord.iid);
    const cleared = !(follower.keywords || []).includes(kw);
    check(id + ' grants ' + kw + ' to a ' + buff.subtype + ' and clears on leave',
      granted && cleared, 'granted=' + granted + ' cleared=' + cleared);
  }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
