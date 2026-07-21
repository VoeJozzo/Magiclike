// A trigger's top-level target() step (trig.target on a bare effect, not
// per-effect eff.target) must prompt the player to choose; objectNeedsTarget
// must inspect trig.target too. The AI still auto-picks (no prompt).

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
  const G = setup.startMainPhase(caster);
  G[caster].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const c1 = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && !isUndraftable(CARDS[k]));
  const c2 = Object.keys(CARDS).find(k => hasType(CARDS[k], 'Creature') && !isUndraftable(CARDS[k]) && k !== c1);
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
  // aether_drake: ETB → target(your_creature) gains hexproof (ambiguous with 2+ own creatures).
  const G = castETB('aether_drake', 'you');
  check('player prompted for aetherDrake ETB target',
    !!G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you',
    G.pendingTriggerTarget ? G.pendingTriggerTarget.valid.length + ' valid' : 'no prompt');
})();
(() => {
  // ravenous_chupacabra: ETB → destroy target(creature) — multiple legal creatures.
  const G = castETB('ravenous_chupacabra', 'you');
  check('player prompted for chupacabra ETB target',
    !!G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you');
})();

console.log('\n=== the AI (opp) still auto-picks — no prompt ===');
(() => {
  const G = castETB('ravenous_chupacabra', 'opp');
  check('opp ETB trigger does NOT raise a prompt (AI auto-picks)', !G.pendingTriggerTarget);
})();

console.log('\n=== a single legal target still auto-picks (no needless prompt) ===');
(() => {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  // aetherDrake's your_creature trigger: with no other own creature on the
  // battlefield, the drake itself is the only legal target.
  const spell = mk('aether_drake', 'you'); G.you.hand.push(spell);
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
