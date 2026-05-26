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

console.log('\n=== legacy param names still honored (grantHaste/untap) ===');
(() => {
  clearBoards();
  const c = place('opp'); c.tapped = true;
  ENGINE.applyEffect(CTX, { kind: 'change_control', grantHaste: true, untap: true }, { kind: 'creature', iid: c.iid });
  check('legacy untap honored', c.tapped === false);
  check('legacy grantHaste honored', (c.keywords || []).includes('haste'));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
