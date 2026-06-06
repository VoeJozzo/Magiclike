// Type system — types[] is the SOLE source of truth (the legacy card.type /
// card.sub fields were removed in the cutover). This test pins the invariants
// the accessors (typesOf / hasType / subtypesOf / governingType / typeLine)
// must hold across the whole pool, plus the multi-type generalization and the
// makeCard carry-through. (Previously this file proved accessor↔legacy-field
// equivalence; with the legacy fields gone, the accessors ARE the definition,
// so the equivalence half was retired — see git history / BACKLOG.)

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== whole pool: types[] is present + the accessors are coherent ===');
(() => {
  const ids = Object.keys(CARDS);
  // Guard against a VACUOUS pass: the whole-pool checks below assert "bad list is
  // empty" over `ids` — if the pool failed to load, every list would be empty and
  // all assertions would silently go green on zero cards.
  check('card pool loaded (whole-pool checks are not vacuous)', ids.length > 200, ids.length + ' templates');

  let noTypes = [], emptyTypes = [], govMiss = [], hasTypeMiss = [], dupTags = [], strayLegacy = [];
  for (const id of ids) {
    const c = CARDS[id];

    // The sole source of truth: every card carries a non-empty types[] and NO
    // residual legacy type/sub field survived the cutover.
    if (!Array.isArray(c.types)) { noTypes.push(id); continue; }
    if (c.types.length === 0) emptyTypes.push(id);
    if ('type' in c || 'sub' in c) strayLegacy.push(id);
    if (new Set(c.types).size !== c.types.length) dupTags.push(id + ':' + JSON.stringify(c.types));

    // governingType returns a real card-type tag, and it's a hasType member.
    const g = governingType(c);
    if (!g || !isCardTypeTag(g)) govMiss.push(id + ':' + g);
    else if (!hasType(c, g)) hasTypeMiss.push(id);

    // hasType hits every declared tag; absent tags miss.
    for (const t of c.types) if (!hasType(c, t)) hasTypeMiss.push(id + ':' + t);
  }
  check('every card has a types[] array', noTypes.length === 0, noTypes.slice(0, 5).join(', '));
  check('no card has an empty types[]', emptyTypes.length === 0, emptyTypes.slice(0, 5).join(', '));
  check('no card retains a legacy type/sub field (cutover complete)', strayLegacy.length === 0, strayLegacy.slice(0, 5).join(', '));
  check('no card has duplicate tags in types[]', dupTags.length === 0, dupTags.slice(0, 5).join(', '));
  check('governingType is a real card-type tag for every card', govMiss.length === 0, govMiss.slice(0, 5).join(', '));
  check('hasType hits governing type + every declared tag', hasTypeMiss.length === 0, hasTypeMiss.slice(0, 5).join(', '));

  // typeLine renders the canonical MTG line, including the corrected cases:
  // basic lands (Basic supertype), City of Brass (single Land), legendary cards.
  const EXPECT = { forest: 'Basic Land', island: 'Basic Land', mountain: 'Basic Land',
    plains: 'Basic Land', swamp: 'Basic Land', city_of_brass: 'Land',
    city_guardian: 'Legendary Creature — Human Soldier', grizzly_bears: 'Creature — Bear' };
  const bad = Object.keys(EXPECT).filter(id => CARDS[id] && typeLine(CARDS[id]) !== EXPECT[id]);
  check('typeLine renders canonical lines (basic lands / legendary / subtypes)',
    bad.length === 0, bad.map(id => id + '="' + typeLine(CARDS[id]) + '" want "' + EXPECT[id] + '"').join(', '));

  // Every legendary card hasType('Legendary') and renders the supertype first.
  const legends = ids.filter(id => CARDS[id].legendary);
  check('legendary cards: hasType("Legendary") and typeLine starts "Legendary "',
    legends.length > 0 && legends.every(id => hasType(CARDS[id], 'Legendary') && typeLine(CARDS[id]).startsWith('Legendary ')),
    legends.join(', '));

  // subtypesOf returns exactly the non-type/supertype tags.
  check('subtypesOf(grizzly_bears) === ["Bear"]', JSON.stringify(subtypesOf(CARDS.grizzly_bears)) === '["Bear"]',
    JSON.stringify(subtypesOf(CARDS.grizzly_bears)));
  check('subtypesOf(copper_golem) === ["Golem"] (drops the Artifact/Creature type tags)',
    JSON.stringify(subtypesOf(CARDS.copper_golem)) === '["Golem"]', JSON.stringify(subtypesOf(CARDS.copper_golem)));
})();

console.log('\n=== negative: absent tags miss; nullish safe ===');
(() => {
  const c = CARDS[Object.keys(CARDS)[0]];
  check('absent tag misses', hasType(c, 'Zzyzx') === false);
  check('null card → no tags', typesOf(null).length === 0 && hasType(null, 'Creature') === false);
  check('null tag → miss', hasType(c, null) === false);
  check('governingType(null) === null', governingType(null) === null);
  check('subtypesOf(null) === []', JSON.stringify(subtypesOf(null)) === '[]');
})();

console.log('\n=== registry: type vs subtype classification ===');
(() => {
  check('Creature/Land/Artifact/Sorcery are type tags',
    ['Creature', 'Land', 'Artifact', 'Sorcery'].every(isCardTypeTag));
  check('Instant is retired (no longer a known type tag)',
    !isCardTypeTag('Instant') && typeCategory('Instant') === 'subtype');
  check('Goblin/Forest/Cleric are subtype tags',
    ['Goblin', 'Forest', 'Cleric'].every(t => typeCategory(t) === 'subtype' && !isCardTypeTag(t)));
  check('Basic/Legendary are supertype tags (render left, not type-tags)',
    ['Basic', 'Legendary'].every(t => typeCategory(t) === 'supertype' && !isCardTypeTag(t)));
  check('Creature/Land/Artifact are permanents',
    ['Creature', 'Land', 'Artifact'].every(t => isPermanent({ types: [t] })));
  check('Sorcery is not a permanent', !isPermanent({ types: ['Sorcery'] }));
})();

console.log('\n=== multi-type governance + carry-through (the Phase-4 generalization) ===');
(() => {
  check('Artifact+Creature → Creature governs (permanent body)',
    governingType({ types: ['Creature', 'Artifact'] }) === 'Creature');
  check('Land+Creature → Creature governs (Creature > Land)',
    governingType({ types: ['Land', 'Creature'] }) === 'Creature');
  check('Sorcery+Goblin → Sorcery governs (spell; subtype rides along)',
    governingType({ types: ['Sorcery', 'Goblin'] }) === 'Sorcery');
  check('Artifact alone → Artifact governs (inert cast permanent)',
    governingType({ types: ['Artifact'] }) === 'Artifact');
  check('typeLine of Artifact Creature — Construct',
    typeLine({ types: ['Creature', 'Artifact', 'Construct'] }) === 'Creature Artifact — Construct',
    typeLine({ types: ['Creature', 'Artifact', 'Construct'] }));
  const robot = { types: ['Creature', 'Construct'] };
  check('robot hasType both Creature and Construct', hasType(robot, 'Creature') && hasType(robot, 'Construct'));

  // RISK #1 (QA): the Legendary supertype must survive an explicit types[] — else
  // a legendary multi-type card silently loses the legend rule.
  const legendRobot = { types: ['Artifact', 'Creature'], legendary: true };
  check('legendary + types[]: Legendary tag unioned in, NOT dropped',
    hasType(legendRobot, 'Legendary') && typeLine(legendRobot).startsWith('Legendary '), typeLine(legendRobot));

  // makeCard carries the template types[] onto the runtime instance end-to-end.
  const baseId = Object.keys(CARDS).find(id => hasType(CARDS[id], 'Creature') && !CARDS[id].special && CARDS[id].cost);
  CARDS.__robotProbe = Object.assign({}, CARDS[baseId], { name: 'Robot Probe', types: ['Artifact', 'Creature'] });
  const inst = ENGINE.makeCard('__robotProbe', [], 0);
  check('makeCard carries types[] onto the instance (no legacy type/sub)',
    Array.isArray(inst.types) && hasType(inst, 'Artifact') && hasType(inst, 'Creature')
    && !('type' in inst) && !('sub' in inst));
  check('instance governs as Creature + is a permanent (Robot)',
    governingType(inst) === 'Creature' && isPermanent(inst));
  delete CARDS.__robotProbe;
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
