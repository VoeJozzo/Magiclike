// Elystra's "last forever" buffs (her printed text: "End-of-turn effects on
// Elystra last forever") survive flicker/exile/bounce routed through move_card:
// the battlefield-leave branch calls leavesPlayPreservingBuffs unconditionally,
// and flushPermanentEotToStickers self-gates on tpl.permanent_eot, so it is a
// no-op for every other card. The flush banks the buffs as slot stickers — a
// stat_boost sticker for the P/T delta plus a kw_<keyword> sticker per grant.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function newGame(cards) {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards, colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.stack = []; G.gameOver = false;
  return G;
}
// Pull the slot-built instance out of whatever zone startNextGame dealt it to.
function takeInstance(G, tplId) {
  for (const zone of ['library', 'hand', 'battlefield']) {
    const idx = G.you[zone].findIndex(c => c.tplId === tplId);
    if (idx >= 0) return G.you[zone].splice(idx, 1)[0];
  }
  return null;
}

console.log('=== A4-16: flicker (move_card bf→exile) banks Elystra\'s pending buffs ===');
(() => {
  const cards = ['elystra_the_immortal'].concat(Array(11).fill('plains'));
  const G = newGame(cards);
  const ely = takeInstance(G, 'elystra_the_immortal');
  check('Elystra instance found (has a run slot)', !!ely && typeof ely.slotIdx === 'number');
  if (!ely) return;
  ely.sick = false;
  G.you.battlefield.push(ely);
  const ctx = { controller: 'you', sourceName: 'Test Pump', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'pump', power: 2, toughness: 2 },
    { kind: 'creature', iid: ely.iid });
  ENGINE.applyEffect(ctx, { kind: 'grant_keyword', keyword: 'flying', duration: 'eot' },
    { kind: 'creature', iid: ely.iid });
  check('pump landed as temp (pre-flicker)', ely.tempPower === 2 && ely.tempTou === 2);
  // Cloudshift's first half.
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Cloudshift', sourceIid: null },
    { kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target' },
    { kind: 'creature', iid: ely.iid });
  check('Elystra left the battlefield', !G.you.battlefield.some(c => c.tplId === 'elystra_the_immortal'));
  const slot = RUN.getSlots()[ely.slotIdx];
  const statSticker = (slot.stickers || []).find(s => s && typeof s === 'object' && s.kind === 'stat_boost');
  check('slot banked a stat_boost sticker for the +2/+2',
    !!statSticker && statSticker.power === 2 && statSticker.toughness === 2,
    'stickers=' + JSON.stringify(slot && slot.stickers));
  check('slot banked the EOT keyword grant as a kw_flying sticker',
    (slot.stickers || []).includes('kw_flying'),
    'stickers=' + JSON.stringify(slot && slot.stickers));

  // Cloudshift's second half — the banked buffs re-apply: the stat_boost
  // modifier survives resetInPlayState, and the kw_flying sticker is
  // re-derived by intrinsicKeywords on permanent_eot arrivals.
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Cloudshift', sourceIid: null },
    { kind: 'move_card', from_zone: 'exile', to_zone: 'battlefield', selector: 'target' },
    { kind: 'graveyard_card', iid: ely.iid });
  const back = G.you.battlefield.find(c => c.tplId === 'elystra_the_immortal');
  check('Elystra returned to the battlefield', !!back);
  if (back) {
    const [p, t] = ENGINE.getStats(back);
    check('returned Elystra keeps the banked stats (3/3 from base 1/1)',
      p === 3 && t === 3, p + '/' + t);
    check('returned Elystra keeps the banked keyword', back.keywords.includes('flying'),
      back.keywords.join(','));
  }
})();

console.log('\n=== control: a non-permanent_eot creature banks nothing ===');
(() => {
  const cards = ['gray_ogre'].concat(Array(11).fill('plains'));
  const G = newGame(cards);
  const ogre = takeInstance(G, 'gray_ogre');
  check('ogre instance found', !!ogre && typeof ogre.slotIdx === 'number');
  if (!ogre) return;
  ogre.sick = false;
  G.you.battlefield.push(ogre);
  const ctx = { controller: 'you', sourceName: 'Test Pump', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'pump', power: 2, toughness: 2 },
    { kind: 'creature', iid: ogre.iid });
  ENGINE.applyEffect(ctx,
    { kind: 'move_card', from_zone: 'battlefield', to_zone: 'exile', selector: 'target' },
    { kind: 'creature', iid: ogre.iid });
  const slot = RUN.getSlots()[ogre.slotIdx];
  check('ordinary creature: no buff sticker banked (flush self-gates on permanent_eot)',
    !(slot.stickers || []).some(s => s && typeof s === 'object' && s.kind === 'stat_boost'),
    'stickers=' + JSON.stringify(slot.stickers));
  const exiled = G.you.exile.find(c => c.tplId === 'gray_ogre');
  check('ordinary creature exiled with temps reset', !!exiled && exiled.tempPower === 0);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
