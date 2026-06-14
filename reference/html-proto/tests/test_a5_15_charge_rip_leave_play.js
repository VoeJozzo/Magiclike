// Audit A5-15 — the out-of-charges Stapler rip must route its battlefield removal
// through leave-play discipline (removeFromCombat + clearRestrictionsFromSource),
// not a raw Array.filter. A5-5 already scoped the purge to (tplId, slotIdx); this
// pins the remaining half. Latent today (Stapler is the only charges card, an
// Artifact, special/unique), so the observable conditions are CONSTRUCTED: the
// about-to-be-ripped stapler is injected into combat state and stamped as the
// source of a can't-attack restriction on a bystander.
const setup = require('./_setup');
setup.loadEngine();
let pass = 0, fail = 0;
function check(label, ok, info) { console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : '')); if (ok) pass++; else fail++; }

const baseTpl = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && isSpliceableBase(k));
const stapleTpl = Object.keys(CARDS).find(k => k !== baseTpl && hasType(CARDS[k], 'Creature') && isSpliceableStaple(k));

console.log('=== A5-15: charge-rip routes battlefield removal through leave-play discipline ===');
(() => {
  RUN.start({ cards: Array(5).fill('plains'), colors: ['W'] }, 'stapler');
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { C: 9, W: 9, U: 9, B: 9, R: 9, G: 9 };

  const slots0 = RUN.getSlots();
  const staplerIdx = slots0.findIndex(s => s.tplId === 'stapler');
  slots0[staplerIdx].charges = 1;   // next activation rips it

  let iid = 9200;
  const mkPerm = (tplId, owner) => Object.assign(JSON.parse(JSON.stringify(CARDS[tplId])),
    { iid: iid++, tplId, controller: owner, owner, slotIdx: null,
      stickers: [], empowerRolls: [], subtypeRolls: [],
      tapped: false, sick: false, damage: 0, keywords: [], damagedBySources: new Set() });
  const oppBase = mkPerm(baseTpl, 'opp');       // splice base (becomes the merged card)
  const youStaple = mkPerm(stapleTpl, 'you');   // splice staple (consumed by the merge)
  const bystander = mkPerm(baseTpl, 'opp');     // survives; carries a stapler-granted restriction
  const someAttacker = mkPerm(baseTpl, 'opp');  // an attacker the stapler is "blocking"
  const stapler = Object.assign(JSON.parse(JSON.stringify(CARDS.stapler)),
    { iid: iid++, tplId: 'stapler', controller: 'you', owner: 'you', slotIdx: staplerIdx,
      chargesLeft: 1, tapped: false, sick: false, keywords: [], damagedBySources: new Set() });
  const staplerIid = stapler.iid;
  G.you.battlefield = [youStaple, stapler];
  G.opp.battlefield = [oppBase, bystander, someAttacker];

  // CONSTRUCTED observables — only cleared if leave-play discipline runs on the rip:
  G.attackers = [staplerIid, someAttacker.iid];            // stapler is (artificially) attacking
  G.blockers = new Map([[staplerIid, someAttacker.iid]]);  // ...and blocking someAttacker
  bystander.cantAttack = true;
  bystander.cantAttackBy = new Set([staplerIid]);          // stapler granted this restriction

  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: staplerIid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: oppBase.iid, label: oppBase.name },
              { kind: 'permanent', iid: youStaple.iid, label: youStaple.name }] });

  check('ripped stapler removed from battlefield (scoping preserved)', !G.you.battlefield.some(c => c.iid === staplerIid));
  check('A5-15: rip purged the stapler from G.attackers (no ghost attacker)',
    !G.attackers.includes(staplerIid), 'attackers=' + JSON.stringify(G.attackers));
  check('A5-15: rip tombstoned the stapler block entry (its attacker stays blocked)',
    !G.blockers.has(staplerIid) && G.blockers.has('gone:' + staplerIid),
    'keys=' + JSON.stringify([...G.blockers.keys()]));
  check('A5-15: rip cleared the cantAttackBy restriction the stapler granted',
    !(bystander.cantAttackBy instanceof Set) || !bystander.cantAttackBy.has(staplerIid),
    'cantAttackBy=' + JSON.stringify(bystander.cantAttackBy ? [...bystander.cantAttackBy] : null));
  check('A5-15: bystander cantAttack flag flipped back to false', bystander.cantAttack === false);
  check('guard: an unrelated attacker is untouched', G.attackers.includes(someAttacker.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
