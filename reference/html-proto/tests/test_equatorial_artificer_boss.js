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
  const ids = ['equatorial_artifice', 'artifice_triumphant', 'ingenuity_unbounded'];
  check('all three special cards load', ids.every(id => CARDS[id]), ids.filter(id => !CARDS[id]).join(', '));
  check('Equatorial Artifice is an Artifact Land that taps for {C}{C}',
    hasType(CARDS.equatorial_artifice, 'Artifact')
    && hasType(CARDS.equatorial_artifice, 'Land')
    && CARDS.equatorial_artifice.abilities[0].effects[0].amounts.C === 2);
  check('Ingenuity is innate, hexproof, indestructible, and fixes mana',
    CARDS.ingenuity_unbounded.innate === true
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
})();

console.log('\n=== Artifice Triumphant neutralizes permanently and grants reanimation ability ===');
(() => {
  const G = boot();
  const knight = ENGINE.makeCard('white_knight', [], 0);
  knight.controller = 'you'; knight.owner = 'you'; knight.sick = false; knight.iid = 9101;
  const equator = ENGINE.makeCard('equatorial_artifice', [], 1);
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
  const abilityIdx = (knight.abilities || []).findIndex(ab => ab._granted);
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
