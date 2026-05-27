// Regression: player-controlled triggers with a top-level target() step must
// PROMPT the player to choose, not silently auto-pick. The §3.5 migration moved
// trigger targets from per-effect `eff.target` to the top-level `trig.target`
// (bare effects), but triggerNeedsPlayerChoice only inspected per-effect targets
// — so every migrated targeted trigger auto-selected its target when the human
// cast the creature ("targets auto-selected when I cast spells"). The AI still
// auto-picks (no prompt).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let iid = 5000;
function mk(t, c) {
  return Object.assign(JSON.parse(JSON.stringify(CARDS[t])), {
    iid: iid++, tplId: t, controller: c, owner: c, tapped: false, sick: false,
    damage: 0, keywords: (CARDS[t].keywords || []).slice(), damagedBySources: new Set(),
  });
}
function castETB(tplId, caster) {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = caster; G.priorityHolder = caster; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[caster].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const c1 = Object.keys(CARDS).find(k => CARDS[k].type === 'Creature' && !CARDS[k].special);
  const c2 = Object.keys(CARDS).find(k => CARDS[k].type === 'Creature' && !CARDS[k].special && k !== c1);
  const oc = caster === 'you' ? 'opp' : 'you';
  // Both sides get two creatures so every target taxonomy has >1 legal option.
  G[caster].battlefield.push(mk(c1, caster), mk(c2, caster));
  G[oc].battlefield.push(mk(c1, oc), mk(c2, oc));
  const spell = mk(tplId, caster); G[caster].hand.push(spell);
  ENGINE.executeAction(caster, { type: 'castSpell', cardIid: spell.iid });
  let safety = 20;
  while ((G.stack.length || (G.pendingTriggers || []).length) && !G.pendingTriggerTarget && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
  return G;
}

console.log('=== migrated targeted trigger PROMPTS the human (not auto-picked) ===');
(() => {
  // aetherDrake: ETB → target(your_creature) gains hexproof. With 2+ own
  // creatures the player must choose which.
  const G = castETB('aetherDrake', 'you');
  check('player prompted for aetherDrake ETB target',
    !!G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you',
    G.pendingTriggerTarget ? G.pendingTriggerTarget.valid.length + ' valid' : 'no prompt');
})();
(() => {
  // blackKnight: ETB → destroy target(creature) — multiple legal creatures.
  const G = castETB('blackKnight', 'you');
  check('player prompted for blackKnight ETB target',
    !!G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you');
})();

console.log('\n=== the AI (opp) still auto-picks — no prompt ===');
(() => {
  const G = castETB('blackKnight', 'opp');
  check('opp ETB trigger does NOT raise a prompt (AI auto-picks)', !G.pendingTriggerTarget);
})();

console.log('\n=== a single legal target still auto-picks (no needless prompt) ===');
(() => {
  // your_creature trigger with only ONE of your creatures (the source itself
  // hasn't entered yet for a non-creature... use otherworldlyJourney? simpler:
  // give the human exactly one own creature so your_creature has 1 option).
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  // aetherDrake's your_creature trigger: with NO other own creature, only the
  // drake itself is a legal target → exactly 1 → auto-pick, no prompt.
  const spell = mk('aetherDrake', 'you'); G.you.hand.push(spell);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: spell.iid });
  let safety = 20;
  while ((G.stack.length || (G.pendingTriggers || []).length) && !G.pendingTriggerTarget && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
  check('single legal target auto-picks (no prompt for a forced choice)', !G.pendingTriggerTarget);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
