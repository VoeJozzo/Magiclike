// move_card unified card-movement primitive (Slice 3 step 3 / decision 10).
// Covers the deterministic, no-battlefield-arrival moves this pass supports:
// draw, mill, bounce, shuffle-into-library, exile, graveyard→hand. Additive
// (no card uses move_card yet); exercised directly via the ENGINE.applyEffect
// seam on a booted board.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const LANDS20 = Array(20).fill('plains');
RUN.start({ cards: LANDS20.slice(), colors: ['W'] }, null);
RUN.load();
ENGINE.init(RUN.getSlots(), LANDS20.slice());
const G = ENGINE.state();

const CREATURE_TPL = (() => {
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.type === 'Creature' && (c.toughness || 0) >= 3 && !c.triggers && !c.abilities) return id;
  }
  for (const [id, c] of Object.entries(CARDS)) if (c.type === 'Creature' && (c.toughness || 0) >= 3) return id;
  return null;
})();
const CTX = { controller: 'you', sourceName: 'Test', sourceIid: -1 };
function place(who) { const c = ENGINE.makeCard(CREATURE_TPL); c.sick = false; G[who].battlefield.push(c); return c; }
function has(arr, iid) { return arr.some(c => c.iid === iid); }

console.log('=== draw: library → hand (controller_top) ===');
(() => {
  const h0 = G.you.hand.length, l0 = G.you.library.length;
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 2 }, null);
  check('hand +2', G.you.hand.length === h0 + 2, `${h0}→${G.you.hand.length}`);
  check('library -2', G.you.library.length === l0 - 2, `${l0}→${G.you.library.length}`);
})();

console.log('\n=== mill: library → graveyard (controller_top) ===');
(() => {
  const g0 = G.you.graveyard.length, l0 = G.you.library.length;
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'library', to_zone: 'graveyard', selector: 'controller_top', amount: 2 }, null);
  check('graveyard +2', G.you.graveyard.length === g0 + 2);
  check('library -2', G.you.library.length === l0 - 2);
})();

console.log('\n=== bounce: battlefield → hand (target) ===');
(() => {
  const c = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target', amount: 1 },
    { kind: 'creature', iid: c.iid });
  check('off battlefield', !has(G.opp.battlefield, c.iid));
  check('in owner hand', has(G.opp.hand, c.iid));
})();

console.log('\n=== shuffle_into_library: battlefield → library (target, post.shuffle) ===');
(() => {
  const c = place('you');
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'battlefield', to_zone: 'library', selector: 'target', amount: 1, post: { shuffle: true } },
    { kind: 'creature', iid: c.iid });
  check('off battlefield', !has(G.you.battlefield, c.iid));
  check('in library', has(G.you.library, c.iid));
})();

console.log('\n=== exile: battlefield → exile (target) ===');
(() => {
  const c = place('opp');
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target', amount: 1 },
    { kind: 'creature', iid: c.iid });
  check('off battlefield', !has(G.opp.battlefield, c.iid));
  check('in exile', has(G.opp.exile, c.iid));
})();

console.log('\n=== return: graveyard → hand (target) ===');
(() => {
  // Seed a card into the controller's graveyard.
  const c = ENGINE.makeCard(CREATURE_TPL);
  G.you.graveyard.push(c);
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'graveyard', to_zone: 'hand', selector: 'target', amount: 1 },
    { kind: 'creature', iid: c.iid });
  check('off graveyard', !has(G.you.graveyard, c.iid));
  check('in hand', has(G.you.hand, c.iid));
})();

console.log('\n=== uses ctx.chosen when no explicit target ===');
(() => {
  const c = place('opp');
  const ctx2 = { controller: 'you', sourceName: 'Test', sourceIid: -1, chosen: { kind: 'creature', iid: c.iid } };
  ENGINE.applyEffect(ctx2, { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target', amount: 1 }, null);
  check('bounced the ctx.chosen creature', !has(G.opp.battlefield, c.iid) && has(G.opp.hand, c.iid));
})();

console.log('\n=== reanimate: graveyard → battlefield (iid-mint §3.7) ===');
(() => {
  const c = ENGINE.makeCard(CREATURE_TPL);
  const oldIid = c.iid;
  G.you.graveyard.push(c);
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'graveyard', to_zone: 'battlefield', selector: 'target', amount: 1 },
    { kind: 'creature', iid: oldIid });
  check('off graveyard', !has(G.you.graveyard, oldIid));
  // After iid-mint, the card carries a NEW iid — find it on the battlefield.
  const arrived = G.you.battlefield.find(x => x !== undefined && x.tplId === CREATURE_TPL && x.iid !== oldIid);
  check('on battlefield with a FRESH iid (old iid is gone)',
    !!arrived && !has(G.you.battlefield, oldIid), 'oldIid=' + oldIid);
  check('arrives summoning-sick (no haste)', arrived && arrived.sick === true);
})();

console.log('\n=== iid-mint regression: exile → battlefield re-mints (§12.10) ===');
(() => {
  clearBoardsSafe();
  const c = place('you');
  const iid1 = c.iid;
  // Exile it, then return from exile to the battlefield.
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target', amount: 1 },
    { kind: 'creature', iid: iid1 });
  const exiled = G.you.exile.find(x => x.iid === iid1);
  check('exiled (same iid while in exile)', !!exiled);
  ENGINE.applyEffect(CTX, { kind: 'move_card', from_zone: 'exile', to_zone: 'battlefield', selector: 'target', amount: 1 },
    { kind: 'creature', iid: iid1 });
  const back = G.you.battlefield.find(x => x.tplId === CREATURE_TPL);
  check('returned to battlefield with a NEW iid (old iid would fizzle a spell)',
    !!back && back.iid !== iid1, 'iid1=' + iid1 + ' new=' + (back && back.iid));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
function clearBoardsSafe() { G.you.battlefield = []; G.opp.battlefield = []; G.you.exile = []; }
process.exit(fail > 0 ? 1 : 0);
