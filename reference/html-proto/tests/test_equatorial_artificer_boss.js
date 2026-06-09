// Equatorial Artificer boss: colorless special cards + the small rules seams
// they need (intrinsic innate, spend-as-any-color, granted activated ability).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

function boot() {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you';
  G.priorityHolder = 'you';
  G.phase = 'MAIN1';
  G.stack = [];
  G.gameOver = false;
  G.priority = { passes: new Set() };
  G.you.hand = [];
  G.you.battlefield = [];
  G.you.graveyard = [];
  G.you.exile = [];
  G.you.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  return G;
}

console.log('=== colorless boss card data + constructed registry ===');
(() => {
  const ids = ['equatorial_engine', 'artifice_triumphant', 'ingenuity_unbounded'];
  check('all three special cards load', ids.every(id => CARDS[id]), ids.filter(id => !CARDS[id]).join(', '));
  check('all three cards are boss-only specials, excluded from normal draft offers',
    ids.every(id => CARDS[id].special === true));
  check('Equatorial Engine is an Artifact Land that taps for {C}{C}',
    hasType(CARDS.equatorial_engine, 'Artifact')
    && hasType(CARDS.equatorial_engine, 'Land')
    && CARDS.equatorial_engine.abilities[0].effects[0].amounts.C === 2);
  check('Ingenuity is innate, hexproof, indestructible, and fixes mana',
    (CARDS.ingenuity_unbounded.keywords || []).includes('innate')
    && (CARDS.ingenuity_unbounded.keywords || []).includes('hexproof')
    && (CARDS.ingenuity_unbounded.keywords || []).includes('indestructible')
    && CARDS.ingenuity_unbounded.spend_mana_as_any_color === true);
  const deck = DRAFT.getConstructedDeck('equatorialArtificerBoss');
  check('boss deck resolves and is marked as a boss',
    deck && deck.isBoss && Array.isArray(deck.cards) && deck.cards.length === 23);
  check('boss deck declares no colors',
    deck && Array.isArray(deck.colors) && deck.colors.length === 0);
  const built = DRAFT.buildOpponentDeck(0, 0, 0, null, 'equatorialArtificerBoss');
  check('built boss keeps colorless identity',
    built && Array.isArray(built.colors) && built.colors.length === 0);
  check('built boss uses exactly 10 Equatorial Engines and no other lands',
    built.cards.filter(s => s.tplId === 'equatorial_engine').length === 10
    && built.cards.filter(s => hasType(CARDS[s.tplId], 'Land')).length === 10);
})();

console.log('\n=== Artifice Triumphant neutralizes permanently and grants reanimation ability ===');
(() => {
  const G = boot();
  const knight = ENGINE.makeCard('white_knight', [], 0);
  knight.controller = 'you'; knight.owner = 'you'; knight.sick = false; knight.iid = 9101;
  const equator = ENGINE.makeCard('equatorial_engine', [], 1);
  equator.controller = 'you'; equator.owner = 'you'; equator.sick = false; equator.iid = 9102;
  const ingenuity = ENGINE.makeCard('ingenuity_unbounded', [], 2);
  ingenuity.controller = 'you'; ingenuity.owner = 'you'; ingenuity.sick = false; ingenuity.iid = 9103;
  G.you.battlefield.push(knight, equator, ingenuity);

  const spell = CARDS.artifice_triumphant;
  for (const eff of spell.effects) {
    ENGINE.applyEffect({ controller: 'you', sourceName: 'Artifice Triumphant', sourceIid: -1 },
      eff, { kind: 'creature', iid: knight.iid, label: knight.name });
  }

  check('target becomes only an Artifact, permanently',
    hasType(knight, 'Artifact') && !hasType(knight, 'Creature') && isPermanent(knight));
  const abilityIdx = (knight.abilities || []).findIndex(ab => ab._sticker_ability_id === 'artifice_triumphant_reanimate');
  check('target gains the color-cost activated ability',
    abilityIdx >= 0 && knight.abilities[abilityIdx].cost.mana.colors_of_source === true);
  check('generated text mentions the granted ability',
    /gains/.test(describeCardText(spell)) && /one mana of each/.test(describeCardText(spell)));
  check('activation is legal even with only Equatorial + Ingenuity available',
    ENGINE.isLegalAction('you', { type: 'activateAbility', cardIid: knight.iid, abilityIdx }));
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: knight.iid, abilityIdx });
  check('Equatorial tapped and Ingenuity let {C}{C} pay the white activation cost',
    equator.tapped && G.you.mana.C === 1);
  check('target is a creature again until end of turn',
    hasType(knight, 'Artifact') && hasType(knight, 'Creature'));
  const slot = RUN.getSlots()[0];
  check('both transformations persist on the player run slot',
    slot.stickers.some(s => s && s.kind === 'set_types')
    && slot.stickers.some(s => s && s.kind === 'grant_activated_ability'));
  const rebuilt = ENGINE.makeCard('white_knight', slot.stickers, 0);
  check('next-fight rebuild is still an Artifact, not naturally a Creature',
    hasType(rebuilt, 'Artifact') && !hasType(rebuilt, 'Creature'));
  check('next-fight rebuild still has the color-cost activation',
    (rebuilt.abilities || []).some(ab => ab._sticker_ability_id === 'artifice_triumphant_reanimate'));
})();

console.log('\n=== Artifice Triumphant colorless activation is intentionally free ===');
(() => {
  const G = boot();
  const colossus = ENGINE.makeCard('sentinel_colossus', [], 0);
  colossus.controller = 'you'; colossus.owner = 'you'; colossus.sick = false; colossus.iid = 9151;
  G.you.battlefield.push(colossus);

  for (const eff of CARDS.artifice_triumphant.effects) {
    ENGINE.applyEffect({ controller: 'you', sourceName: 'Artifice Triumphant', sourceIid: -1 },
      eff, { kind: 'creature', iid: colossus.iid, label: colossus.name });
  }

  const abilityIdx = (colossus.abilities || []).findIndex(ab => ab._sticker_ability_id === 'artifice_triumphant_reanimate');
  check('colorless target can reactivate with no mana available',
    ENGINE.isLegalAction('you', { type: 'activateAbility', cardIid: colossus.iid, abilityIdx }));
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: colossus.iid, abilityIdx });
  check('free activation makes the colorless target a creature until end of turn',
    hasType(colossus, 'Artifact') && hasType(colossus, 'Creature'));
  check('colors_of_source cannot be paid without a source-card resolution',
    (() => {
      try {
        ENGINE.payMana('you', { colors_of_source: true });
        return false;
      } catch (err) {
        return /colors_of_source/.test(String(err && err.message));
      }
    })());
})();

console.log('\n=== Artifice Triumphant target shows the activated-ability glow as an artifact ===');
(() => {
  // Regression: the ".activatable" green glow used to gate on hasType(Creature),
  // so an Artifice'd target (now a bare Artifact with a granted reanimate
  // ability) never glowed — and then DID glow after activation, when it's a
  // creature again and re-activating is a no-op. The fix inverts both.
  const G = boot();
  const colossus = ENGINE.makeCard('sentinel_colossus', [], 0);
  colossus.controller = 'you'; colossus.owner = 'you'; colossus.sick = false; colossus.iid = 9161;
  G.you.battlefield.push(colossus);
  for (const eff of CARDS.artifice_triumphant.effects) {
    ENGINE.applyEffect({ controller: 'you', sourceName: 'Artifice Triumphant', sourceIid: -1 },
      eff, { kind: 'creature', iid: colossus.iid, label: colossus.name });
  }
  check('Artifice target glows while it is a bare Artifact (reanimate is meaningful)',
    activationGlowAvailable(colossus, 'you') === true && !hasType(colossus, 'Creature'));
  check('the glow belongs to the controller only (opp does not see it)',
    activationGlowAvailable(colossus, 'opp') === false);
  const abilityIdx = (colossus.abilities || []).findIndex(ab => ab._sticker_ability_id === 'artifice_triumphant_reanimate');
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: colossus.iid, abilityIdx });
  check('glow drops once it is already a Creature again (re-activation is a no-op)',
    activationGlowAvailable(colossus, 'you') === false && hasType(colossus, 'Creature'));
})();

console.log('\n=== Equatorial boss deploys Ingenuity Unbounded instead of passing ===');
(() => {
  // Regression: Ingenuity has no on-cast effects, so the AI scored it 0 and the
  // score<=0 reject gate dropped it — the boss never cast its colorless→any
  // fixer, leaving every colored spell in the deck uncastable. Static permanents
  // now floor above the gate.
  const G = boot();
  G.activePlayer = 'opp'; G.priorityHolder = 'opp';
  G.opp.hand = []; G.opp.battlefield = []; G.opp.graveyard = [];
  G.opp.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };   // one Equatorial Engine, tapped for {C}{C}
  const ing = ENGINE.makeCard('ingenuity_unbounded', [], 0);
  ing.controller = 'opp'; ing.owner = 'opp'; ing.iid = 9401;
  G.opp.hand.push(ing);
  check('Ingenuity Unbounded is a legal cast for {C}',
    ENGINE.isLegalAction('opp', { type: 'castSpell', cardIid: ing.iid }));
  const dec = AI.decide(G, 'opp');
  check('AI casts Ingenuity rather than passing (effect-less, but real static value)',
    dec && dec.type === 'castSpell' && dec.cardIid === ing.iid, JSON.stringify(dec));
})();

console.log('\n=== Artifice Triumphant AI prefers colored targets but permits colorless ===');
(() => {
  const G = boot();
  G.you.mana.C = 9;
  const spell = ENGINE.makeCard('artifice_triumphant', [], 0);
  spell.controller = 'you'; spell.owner = 'you'; spell.iid = 9201;
  const colored = ENGINE.makeCard('white_knight', [], 1);
  colored.controller = 'opp'; colored.owner = 'opp'; colored.sick = false; colored.iid = 9202;
  const colorless = ENGINE.makeCard('sentinel_colossus', [], 2);
  colorless.controller = 'opp'; colorless.owner = 'opp'; colorless.sick = false; colorless.iid = 9203;
  G.you.hand.push(spell);
  G.opp.battlefield = [colored, colorless];
  const dec = AI.decide(G, 'you');
  check('AI casts Artifice Triumphant at the colored creature, not the free-reactivation colorless one',
    dec && dec.type === 'castSpell' && dec.cardIid === spell.iid
    && dec.targets && dec.targets[0] && dec.targets[0].iid === colored.iid,
    JSON.stringify(dec));
})();

(() => {
  const G = boot();
  G.you.mana.C = 9;
  const spell = ENGINE.makeCard('artifice_triumphant', [], 0);
  spell.controller = 'you'; spell.owner = 'you'; spell.iid = 9251;
  const colorless = ENGINE.makeCard('sentinel_colossus', [], 1);
  colorless.controller = 'opp'; colorless.owner = 'opp'; colorless.sick = false; colorless.iid = 9252;
  G.you.hand.push(spell);
  G.opp.battlefield = [colorless];
  const dec = AI.decide(G, 'you');
  check('AI may cast Artifice Triumphant at a colorless creature when it is the only target',
    dec && dec.type === 'castSpell' && dec.cardIid === spell.iid
    && dec.targets && dec.targets[0] && dec.targets[0].iid === colorless.iid,
    JSON.stringify(dec));
})();

console.log('\n=== validation coverage ===');
(() => {
  const v = ENGINE.validateAllCardEffects(CARDS);
  check('no unknown effect kinds', v.unknownKinds.length === 0, v.unknownKinds.join(', '));
  check('no unknown target filters', v.unknownFilters.length === 0, v.unknownFilters.join(', '));
  const cov = ENGINE.effectCoverageReport();
  check('effect coverage remains classified',
    cov.unclassifiedValuation.length === 0
    && cov.unclassifiedCastScoring.length === 0
    && cov.missingText.length === 0,
    JSON.stringify(cov));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
