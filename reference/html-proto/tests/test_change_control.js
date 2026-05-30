// change_control unified control primitive (Slice 3 step 3 / decision 11).
// Covers the control-change core (Mind Control / Threaten): pluck from the
// current controller, push to the caster, with optional untap/haste/duration.
// transfer_ownership delegates to the proven steal handler (not re-tested
// deeply here). Additive — gainControl/steal remain. Exercised via applyEffect.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const LANDS12 = Array(12).fill('plains');
RUN.start({ cards: LANDS12.slice(), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS12.slice());
const G = ENGINE.state();

const CREATURE_TPL = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && (c.toughness || 0) >= 3 && !c.triggers && !c.abilities) return id;
  }
  for (const [id, c] of Object.entries(CARDS)) if (c.type === 'Creature' && (c.toughness || 0) >= 3) return id;
  return null;
})();
function clearBoards() { G.you.battlefield = []; G.opp.battlefield = []; }
function place(who) { const c = ENGINE.makeCard(CREATURE_TPL); c.sick = false; G[who].battlefield.push(c); return c; }
function has(arr, iid) { return arr.some(c => c.iid === iid); }
const CTX = { controller: 'you', sourceName: 'Mind Control', sourceIid: -1 };

console.log('=== permanent control change (Mind Control) ===');
(() => {
  clearBoards();
  const c = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'change_control', duration: 'permanent' }, { kind: 'creature', iid: c.iid });
  check('off opp battlefield', !has(G.opp.battlefield, c.iid));
  check('on your battlefield', has(G.you.battlefield, c.iid));
  check('not flagged eot (permanent)', !c.tempControlUntilEot);
})();

console.log('\n=== Threaten: grant_haste + untap + eot duration ===');
(() => {
  clearBoards();
  const c = place('opp');
  c.tapped = true;
  ENGINE.applyEffect(CTX, { kind: 'change_control', duration: 'eot', grant_haste: true, untap_on_take: true },
    { kind: 'creature', iid: c.iid });
  check('taken to your side', has(G.you.battlefield, c.iid));
  check('untapped on take', c.tapped === false);
  check('granted haste', (c.keywords || []).includes('haste'));
  check('flagged control-until-eot', c.tempControlUntilEot === true);
})();

console.log('\n=== already-yours fizzles ===');
(() => {
  clearBoards();
  const c = place('you');
  const before = G.you.battlefield.length;
  ENGINE.applyEffect(CTX, { kind: 'change_control' }, { kind: 'creature', iid: c.iid });
  check('no duplication / still one copy', G.you.battlefield.filter(x => x.iid === c.iid).length === 1
    && G.you.battlefield.length === before);
})();

console.log('\n=== legacy param names still honored (grant_haste/untap) ===');
(() => {
  clearBoards();
  const c = place('opp'); c.tapped = true;
  ENGINE.applyEffect(CTX, { kind: 'change_control', grant_haste: true, untap: true }, { kind: 'creature', iid: c.iid });
  check('legacy untap honored', c.tapped === false);
  check('legacy grant_haste honored', (c.keywords || []).includes('haste'));
})();

console.log('\n=== Steal on a STAPLED opp creature transfers the WHOLE staple (not just the base) ===');
(() => {
  // Regression: the steal capture only read stapledTpls from a player-side run
  // SLOT. An opponent's creature has no slot, so the else-branch dropped the
  // staple -- the thief got a bare base creature (savannahLions 2/1) instead of
  // the merged savannahLions+furnaceWhelp (4/3 flying). The merged identity lives
  // on the runtime card's stapledFrom; the fix copies it on the no-slot path.
  clearBoards();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 9 };

  const stapled = ENGINE.makeCard('savannahLions', undefined, 0, undefined, undefined, undefined, ['furnaceWhelp']);
  stapled.controller = 'opp'; stapled.owner = 'opp'; stapled.sick = false;
  G.opp.battlefield.push(stapled);
  check('opp stapled creature is the merged 4/3 flying (sanity)',
    JSON.stringify(ENGINE.getStats(stapled)) === '[4,3]' && (stapled.keywords || []).includes('flying'),
    JSON.stringify(ENGINE.getStats(stapled)) + ' kw=' + JSON.stringify(stapled.keywords));

  const steal = ENGINE.makeCard('steal', undefined, 0);
  steal.controller = 'you'; steal.owner = 'you';
  G.you.hand.push(steal);
  const cast = { type: 'castSpell', cardIid: steal.iid, targets: [{ kind: 'permanent', iid: stapled.iid, label: stapled.name }] };
  check('steal on the stapled permanent is legal', ENGINE.isLegalAction('you', cast));
  ENGINE.executeAction('you', cast);
  let guard = 0;
  while ((G.stack.length || G.pendingTriggers.length) && guard++ < 30) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
  const stolen = [...G.you.library, ...G.you.hand, ...G.you.battlefield]
    .find(c => c.tplId === 'savannahLions' && c.owner === 'you');
  check('the stolen card exists, owned by you', !!stolen);
  check('the stolen card kept the WHOLE staple (4/3 flying + stapledTpls), not the bare 2/1 base',
    !!stolen && JSON.stringify(ENGINE.getStats(stolen)) === '[4,3]'
      && (stolen.keywords || []).includes('flying')
      && stolen.stapledFrom && Array.isArray(stolen.stapledFrom.stapledTpls)
      && stolen.stapledFrom.stapledTpls.includes('furnaceWhelp'),
    stolen ? (JSON.stringify(ENGINE.getStats(stolen)) + ' kw=' + JSON.stringify(stolen.keywords)
      + ' staple=' + JSON.stringify(stolen.stapledFrom && stolen.stapledFrom.stapledTpls)) : 'no stolen card');
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
