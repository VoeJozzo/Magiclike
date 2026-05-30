// Drain cards are LIFE LOSS, not damage. Cards authored as "loses N life"
// (Blood Artist, Blood Priest, drain demons, Goblin Chieftain's ping, Grave
// Charm's drain mode, Wicked Acolyte, the self-loss on Demonic Tutor / Life for
// Life / Dread Knight / Vexing Ogre, and the Scarified sticker) were implemented
// as damage-to-player. The D4 signed gain_life mechanism existed but nothing
// migrated the cards onto it. Now they do — life loss is unpreventable, doesn't
// trigger damage synergies, and DOES feed life-loss synergies (Blood Priest +
// Bloodlust). This locks the data shape, the behavior, and the AI valuation.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

const DRAIN = ['blood_artist', 'blood_priest', 'bloodthirsty_stalker', 'cult_priest', 'demonic_tutor',
  'dread_knight', 'dread_wraith', 'fallen_champion', 'goblin_chieftain', 'grave_charm',
  'final_strike', 'spiteful_imp', 'vexing_ogre', 'wicked_acolyte'];

console.log('=== no drain card deals damage to a player anymore (all signed gain_life) ===');
(() => {
  let offenders = [];
  const walk = (effs, container) => (effs || []).forEach(e => {
    const tgt = e.target || container;
    if (e.kind === 'damage' && (tgt === 'self' || tgt === 'player' || tgt === 'opp')) offenders.push(e);
  });
  for (const id of DRAIN) {
    const c = CARDS[id];
    if (Array.isArray(c.effects)) walk(c.effects, c.target);
    else if (c.effects && c.effects.modes) c.effects.modes.forEach(m => walk(m, c.target));
    (c.triggers || []).forEach(t => walk(t.effects, t.target));
    (c.abilities || []).forEach(a => walk(a.effects, a.target));
  }
  check('zero damage-to-player effects remain across the 14 drain cards', offenders.length === 0,
    JSON.stringify(offenders));
})();

let iid = 5000;
function mk(t, c) {
  return Object.assign(JSON.parse(JSON.stringify(CARDS[t])), {
    iid: iid++, tplId: t, controller: c, owner: c, tapped: false, sick: false,
    damage: 0, keywords: (CARDS[t].keywords || []).slice(), damagedBySources: new Set(),
  });
}
function game(active) {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = active; G.priorityHolder = active; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G[active].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return G;
}
function drain(G) {
  let safety = 40;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}

console.log('\n=== Blood Priest drains the OPPONENT (and tracks life loss) ===');
(() => {
  const G = game('opp');                 // opp casts → drains "you"
  const youLife0 = G.you.life;
  const bp = mk('blood_priest', 'opp'); G.opp.hand.push(bp);
  ENGINE.executeAction('opp', { type: 'castSpell', cardIid: bp.iid });
  drain(G);
  check('opponent (you) lost 2 life', G.you.life === youLife0 - 2, youLife0 + '→' + G.you.life);
  check('life loss tracked for synergies (lifeLostThisTurn)', (G.you.lifeLostThisTurn || 0) >= 2,
    'lifeLostThisTurn=' + G.you.lifeLostThisTurn);
})();

console.log('\n=== Demonic Tutor: the "you lose 2 life" is self life loss ===');
(() => {
  const G = game('you');
  const myLife0 = G.you.life;
  // seed library with a creature so the search has something
  G.you.library.push(mk(Object.keys(CARDS).find(k => CARDS[k].type === 'Creature' && !CARDS[k].special), 'you'));
  const dt = mk('demonic_tutor', 'you'); G.you.hand.push(dt);
  ENGINE.executeAction('you', { type: 'castSpell', cardIid: dt.iid });
  drain(G);
  check('caster lost 2 life (self drain)', G.you.life === myLife0 - 2, myLife0 + '→' + G.you.life);
})();

console.log('\n=== AI still values + casts a drain creature (not undervalued) ===');
(() => {
  // abilityValue must score the drain trigger positively; getCardValue reflects it.
  const v = ENGINE.getCardValue(CARDS.blood_priest, 'play');
  check('bloodPriest has positive card value (drain trigger valued, not negative)', v > 0, 'value=' + v);
  // And the AI actually casts it when it's the only play (clear the dealt hand
  // so it doesn't prefer a land drop or another spell).
  const G = game('opp');
  G.opp.hand.length = 0;
  const bp = mk('blood_priest', 'opp'); G.opp.hand.push(bp);
  const dec = AI.decide(G, 'opp');
  check('AI casts the drain creature', !!dec && dec.type === 'castSpell' && dec.cardIid === bp.iid,
    dec ? dec.type : 'null');
})();

console.log('\n=== Scarified sticker is life loss too ===');
(() => {
  const trig = STICKERS.scarified.trigger;
  const eff = (trig.effects || [])[0];
  check('scarified sticker uses gain_life (negative), not damage',
    eff && eff.kind === 'gain_life' && eff.amount < 0, JSON.stringify(eff));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
