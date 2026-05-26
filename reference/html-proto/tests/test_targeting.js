// target() / chooses() targeting primitives + STRUCTURAL hexproof (Slice 3
// step 2 / §3.5). The target() step is the hexproof checkpoint (opp hexproof
// creatures are not legal targets); chooses() is selection-by-the-targeted-
// player (NOT targeting → hexproof never applies); mass `scope` effects have
// no target step and ignore hexproof. This is *why* an edict kills a hexproof
// creature: the player is targeted, the creature is merely chosen.

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
function place(who, opts) {
  const c = ENGINE.makeCard(CREATURE_TPL);
  c.sick = false;
  if (opts && opts.hexproof && !c.keywords.includes('hexproof')) c.keywords.push('hexproof');
  G[who].battlefield.push(c);
  return c;
}
function ids(list) { return list.filter(t => t.kind === 'creature').map(t => t.iid); }

console.log('=== TARGET_FILTERS closed taxonomy ===');
(() => {
  for (const f of ['creature', 'player', 'creature_or_player', 'spell', 'permanent',
                   'your_creature', 'opp_creature', 'graveyard_creature']) {
    check('taxonomy has ' + f, ENGINE.TARGET_FILTERS.has(f));
  }
  check('unknown filter → empty target set', ENGINE.targetsForFilter('bogus', 'you').length === 0);
})();

console.log('\n=== target(creature) is the hexproof checkpoint ===');
(() => {
  clearBoards();
  const mine = place('you');
  const mineHex = place('you', { hexproof: true });
  const oppPlain = place('opp');
  const oppHex = place('opp', { hexproof: true });

  const t = ids(ENGINE.targetsForFilter('creature', 'you'));
  check('includes my creature', t.includes(mine.iid));
  check('includes MY hexproof creature (own hexproof is targetable)', t.includes(mineHex.iid));
  check('includes opp non-hexproof creature', t.includes(oppPlain.iid));
  check('EXCLUDES opp hexproof creature', !t.includes(oppHex.iid));
})();

console.log('\n=== your_creature / opp_creature filters ===');
(() => {
  clearBoards();
  const mine = place('you');
  const oppPlain = place('opp');
  const oppHex = place('opp', { hexproof: true });

  const yours = ids(ENGINE.targetsForFilter('your_creature', 'you'));
  check('your_creature = only mine', yours.length === 1 && yours.includes(mine.iid));

  const opps = ids(ENGINE.targetsForFilter('opp_creature', 'you'));
  check('opp_creature excludes opp hexproof', opps.includes(oppPlain.iid) && !opps.includes(oppHex.iid));
})();

console.log('\n=== creature_or_player includes both players ===');
(() => {
  clearBoards();
  place('opp');
  const t = ENGINE.targetsForFilter('creature_or_player', 'you');
  check('two player targets present', t.filter(x => x.kind === 'player').length === 2);
  check('plus the creature', t.filter(x => x.kind === 'creature').length === 1);
})();

console.log('\n=== edict chain sacrifices a HEXPROOF creature (the §3.5 proof) ===');
(() => {
  clearBoards();
  // Opp's only creature is hexproof. A targeted-removal spell (target(creature))
  // could NOT touch it; the edict can, because the creature is chosen, not targeted.
  const oppHex = place('opp', { hexproof: true });
  check('precondition: opp hexproof is NOT a legal target() for creature removal',
    !ids(ENGINE.targetsForFilter('creature', 'you')).includes(oppHex.iid));

  // Resolution of: target(player)=opp → chooses(creature) → sacrifice.
  // (target(player) established opp as allTargets[0]; chooses + sacrifice run here.)
  const ctx = { controller: 'you', sourceName: 'Diabolic Edict', sourceIid: -1,
                allTargets: [{ kind: 'player', who: 'opp' }] };
  ENGINE.applyEffect(ctx, { kind: 'chooses', filter: 'creature' }, null);
  check('chooses picked the hexproof creature', ctx.chosen && ctx.chosen.iid === oppHex.iid);
  ENGINE.applyEffect(ctx, { kind: 'sacrifice' }, null);
  check('hexproof creature left the battlefield', !G.opp.battlefield.some(c => c.iid === oppHex.iid));
  check('hexproof creature is in opp graveyard (sacrificed)',
    G.opp.graveyard.some(c => c.iid === oppHex.iid));
})();

console.log('\n=== mass scope ignores hexproof (no target step) ===');
(() => {
  clearBoards();
  const oppHex = place('opp', { hexproof: true });
  const ctx = { controller: 'you', sourceName: 'Pyroclasm', sourceIid: -1 };
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 2, scope: 'all_creatures' }, null);
  check('Pyroclasm damaged the hexproof creature', oppHex.damage === 2, 'damage=' + oppHex.damage);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
