// Audit A4 batch — zone-routing + arrival-state fixes:
//
//   A4-19: a countered spell goes to its OWNER's graveyard (§706), not its
//          controller's — counter was the lone controller-routed outlier
//          among ~7 sibling graveyard-routing sites (live via Seal-Thief
//          Courier's cast-permission flow: countering an opp-owned card you
//          cast filed THEIR card in YOUR graveyard forever).
//   A4-22: reanimation (move_card graveyard/exile → battlefield) resets via
//          resetInPlayState — the old hand-rolled 6-field list missed
//          killedBy, so a revived creature carried its original killer's
//          trophy credit into its next death.
//   A4-20: fetchLibraryToBattlefield routes arrivals through
//          placeCardOnBattlefield — the one battlefield door (§3.7 fresh
//          iid, summoning sickness, post handling, sourced ETB emit). The
//          old bespoke push skipped all of it; fine for the five land-only
//          users, but a fetched creature arrived attack-ready with a stale
//          iid.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9100;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    counters: {}, killedBy: null, dealtDeathtouch: false,
    cantAttack: false, cantBlock: false,
    cantAttackBy: new Set(), cantBlockBy: new Set(),
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.you.hand = []; G.opp.hand = [];
  G.you.graveyard = []; G.opp.graveyard = [];
  G.stack = []; G.gameOver = false;
  return G;
}

console.log('=== A4-19: countered spell routes to its OWNER\'s graveyard ===');
(() => {
  const G = newGame();
  // The Seal-Thief flow distilled: 'you' is CASTING an opp-OWNED card.
  const stolen = mk('lightning_bolt', 'you');
  stolen.owner = 'opp';
  const item = { kind: 'spell', card: stolen, controller: 'you', targets: [] };
  G.stack.push(item);
  const ctx = { controller: 'opp', sourceName: 'Counterspell', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'counter' }, { kind: 'stack', stackItem: item });
  check('stack is empty after counter', G.stack.length === 0);
  check("countered card is in the OWNER's (opp) graveyard",
    G.opp.graveyard.some(c => c.iid === stolen.iid),
    'opp gy=' + G.opp.graveyard.length + ' you gy=' + G.you.graveyard.length);
  check("countered card is NOT in the controller's (you) graveyard",
    !G.you.graveyard.some(c => c.iid === stolen.iid));
})();

console.log('\n=== A4-19 control: own-card counter unchanged ===');
(() => {
  const G = newGame();
  const own = mk('lightning_bolt', 'you');
  const item = { kind: 'spell', card: own, controller: 'you', targets: [] };
  G.stack.push(item);
  const ctx = { controller: 'opp', sourceName: 'Counterspell', sourceIid: null };
  ENGINE.applyEffect(ctx, { kind: 'counter' }, { kind: 'stack', stackItem: item });
  check("own countered card lands in the caster's graveyard",
    G.you.graveyard.some(c => c.iid === own.iid));
})();

console.log('\n=== A4-22: reanimation clears killedBy (full resetInPlayState) ===');
(() => {
  const G = newGame();
  const corpse = mk('gray_ogre', 'you');
  corpse.killedBy = 'opp';              // it died once; the killer was credited
  corpse.dealtDeathtouch = true;        // sibling stale-state field
  const deadIid = corpse.iid;
  G.you.graveyard.push(corpse);
  const ctx = { controller: 'you', sourceName: 'Reanimate', sourceIid: null };
  ENGINE.applyEffect(ctx,
    { kind: 'move_card', from_zone: 'graveyard', to_zone: 'battlefield', selector: 'target' },
    { kind: 'graveyard_card', iid: deadIid });
  const revived = G.you.battlefield.find(c => c.tplId === 'gray_ogre');
  check('creature was reanimated onto the battlefield', !!revived);
  if (revived) {
    check('killedBy is cleared on revival (was: stale original killer)',
      revived.killedBy === null, 'killedBy=' + revived.killedBy);
    check('dealtDeathtouch cleared on revival', revived.dealtDeathtouch === false);
    check('revival mints a fresh iid (§3.7, pre-existing placeCardOnBattlefield behavior)',
      revived.iid !== deadIid, 'iid ' + deadIid + ' -> ' + revived.iid);
    check('arrives summoning-sick', revived.sick === true);
  }
})();

console.log('\n=== A4-20: creature fetched library→battlefield gets the full arrival discipline ===');
(() => {
  const G = newGame();
  const creature = mk('gray_ogre', 'you');
  creature.sick = false;                 // library cards aren't sick; the old
  const oldIid = creature.iid;           // bespoke push preserved both fields
  G.you.library.unshift(creature);
  const ctx = { controller: 'you', sourceName: 'Fetch Test', sourceIid: null };
  ENGINE.applyEffect(ctx,
    { kind: 'move_card', from_zone: 'library', to_zone: 'battlefield',
      filter: { type: 'Creature' } });
  const fetched = G.you.battlefield.find(c => c.tplId === 'gray_ogre');
  check('creature was fetched onto the battlefield', !!fetched);
  if (fetched) {
    check('fetched creature arrives summoning-sick (§901.1)', fetched.sick === true,
      'sick=' + fetched.sick);
    check('fetched creature got a fresh iid (§3.7 mint-on-arrival)',
      fetched.iid !== oldIid, 'iid ' + oldIid + ' -> ' + fetched.iid);
  }
})();

console.log('\n=== A4-20 control: land fetch (the five live users) unchanged ===');
(() => {
  const G = newGame();
  const land = mk('forest', 'you');
  land.sick = false;
  G.you.library.unshift(land);
  const ctx = { controller: 'you', sourceName: 'Rampant Growth', sourceIid: null };
  ENGINE.applyEffect(ctx,
    { kind: 'move_card', from_zone: 'library', to_zone: 'battlefield',
      filter: { type: 'Land' }, post: { tap: true } });
  const fetched = G.you.battlefield.find(c => c.tplId === 'forest');
  check('land was fetched onto the battlefield', !!fetched);
  if (fetched) {
    check('fetched land arrives tapped (post.tap honored)', fetched.tapped === true);
    check('fetched land is not summoning-sick (defensive non-creature clear)',
      fetched.sick === false, 'sick=' + fetched.sick);
  }
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
