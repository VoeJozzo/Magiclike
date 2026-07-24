const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function refillMana(G) {
  G.you.mana = { W: 20, U: 20, B: 20, R: 20, G: 20, C: 20 };
  G.opp.mana = { W: 20, U: 20, B: 20, R: 20, G: 20, C: 20 };
}

function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('island'), colors: ['U'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  refillMana(G);
  return G;
}

function castAction(who, cardIid, targetIid) {
  return ENGINE.getLegalActions(who).find(a => a.type === 'castSpell'
    && a.cardIid === cardIid
    && (targetIid == null || (a.targets && a.targets[0] && a.targets[0].iid === targetIid)));
}

function driveUntil(G, pred) {
  let guard = 0;
  while (guard++ < 100) {
    if (pred()) return true;
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
      ENGINE.executeAction('you', { type: 'triggerTargetPick', target: G.pendingTriggerTarget.valid[0] });
      continue;
    }
    const who = ENGINE.expectedActor();
    if (!who) return pred();
    ENGINE.executeAction(who, { type: 'pass' });
  }
  return pred();
}

function castInitialSprite(G) {
  setup.startMainPhase('you');
  refillMana(G);
  const sprite = ENGINE.makeCard('feinting_sprite');
  G.you.hand.push(sprite);
  const cast = castAction('you', sprite.iid);
  check('setup: initial Feinting Sprite cast is legal', !!cast);
  if (cast) ENGINE.executeAction('you', cast);
  driveUntil(G, () => G.you.battlefield.includes(sprite) && G.stack.length === 0);
  return sprite;
}

console.log('=== locked target distinguishes a bounced and recast permanent ===');
(() => {
  const G = newGame();
  const sprite = castInitialSprite(G);
  const firstIncarnation = sprite.battlefieldIncarnation;

  setup.startMainPhase('opp');
  refillMana(G);
  const doom = ENGINE.makeCard('doom_blade');
  const unsummon = ENGINE.makeCard('unsummon');
  G.opp.hand.push(doom);
  G.you.hand.push(unsummon);

  const doomCast = castAction('opp', doom.iid, sprite.iid);
  check('Doom Blade locks the first battlefield incarnation', !!doomCast
    && doomCast.targets[0].battlefieldIncarnation === firstIncarnation,
    doomCast && JSON.stringify(doomCast.targets[0]));
  if (!doomCast) return;
  ENGINE.executeAction('opp', doomCast);

  const bounceCast = castAction('you', unsummon.iid, sprite.iid);
  check('Unsummon response is legal', !!bounceCast);
  if (!bounceCast) return;
  ENGINE.executeAction('you', bounceCast);
  driveUntil(G, () => G.you.hand.includes(sprite)
    && G.stack.some(item => item.card === doom));
  check('normal bounce preserves persistent iid', sprite.iid === doomCast.targets[0].iid);

  const recast = castAction('you', sprite.iid);
  check('flash recast is legal over Doom Blade', !!recast);
  if (!recast) return;
  G.log.length = 0;
  ENGINE.executeAction('you', recast);
  driveUntil(G, () => G.you.battlefield.includes(sprite));
  check('flash recast mints a new battlefield incarnation',
    sprite.battlefieldIncarnation === firstIncarnation + 1,
    'before=' + firstIncarnation + ', after=' + sprite.battlefieldIncarnation);

  driveUntil(G, () => G.stack.length === 0);
  check('old Doom Blade target fizzles against the recast permanent',
    G.you.battlefield.includes(sprite) && !G.you.graveyard.includes(sprite));
  check('Doom Blade fizzle is logged',
    G.log.some(e => /Doom Blade fizzles — no legal target/.test(e.msg)),
    G.log.map(e => e.msg).join(' | '));
})();

console.log('\n=== queued self trigger does not bind a recast source with the same iid ===');
(() => {
  const G = newGame();
  const sprite = castInitialSprite(G);
  const firstIncarnation = sprite.battlefieldIncarnation;

  setup.startMainPhase('you');
  refillMana(G);
  const target = ENGINE.makeCard('bear_cub');
  target.sick = false;
  G.opp.battlefield.push(target);
  const spell = ENGINE.makeCard('unsummon');
  const reply = ENGINE.makeCard('unsummon');
  G.you.hand.push(spell);
  G.opp.hand.push(reply);

  const triggerSpell = castAction('you', spell.iid, target.iid);
  check('flash spell that fires Feinting Sprite is legal', !!triggerSpell);
  if (!triggerSpell) return;
  ENGINE.executeAction('you', triggerSpell);
  driveUntil(G, () => {
    const top = G.stack[G.stack.length - 1];
    return !!top && top.kind === 'trigger' && top.sourceIid === sprite.iid;
  });
  const queued = G.stack[G.stack.length - 1];
  check('queued trigger captures the first source incarnation', !!queued
    && queued.sourceBattlefieldIncarnation === firstIncarnation,
    queued && 'sourceIncarnation=' + queued.sourceBattlefieldIncarnation);

  const bounce = castAction('opp', reply.iid, sprite.iid);
  check('opponent can bounce the trigger source in response', !!bounce);
  if (!bounce) return;
  ENGINE.executeAction('opp', bounce);
  driveUntil(G, () => G.you.hand.includes(sprite)
    && G.stack.some(item => item === queued));

  const recast = castAction('you', sprite.iid);
  check('source can be flash-recast before its old trigger resolves', !!recast);
  if (!recast) return;
  ENGINE.executeAction('you', recast);
  driveUntil(G, () => G.you.battlefield.includes(sprite));
  check('recast source has a new incarnation but stable iid', sprite.iid === queued.sourceIid
    && sprite.battlefieldIncarnation === firstIncarnation + 1,
    'iid=' + sprite.iid + ', incarnation=' + sprite.battlefieldIncarnation);

  driveUntil(G, () => !G.stack.includes(queued));
  check('old self-pump does not mutate the recast Sprite',
    sprite.permPower === 0 && sprite.permTou === 0,
    'permPower=' + sprite.permPower + ', permTou=' + sprite.permTou);
})();

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
