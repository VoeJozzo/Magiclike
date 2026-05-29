// Phase 1 of docs/plan-unified-type-system.md — equivalence proof.
//
// The unified type accessors (typesOf / hasType / governingType / typeLine) run
// ALONGSIDE the legacy `card.type` + `card.sub` fields with ZERO behavior change.
// This test pins that equivalence across the whole card pool: for every one of
// today's single-type cards, governingType === card.type, every legacy tag is a
// hasType hit, absent tags miss, and the new typeLine parser reproduces the
// hardcoded `type — sub` render. Plus a synthesized multi-type case proving the
// accessors generalize past the single-type data we have today.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Legacy typeline exactly as render.js:1322 builds it today.
function legacyTypeLine(card) {
  return card.type + (card.sub ? ' — ' + card.sub : '');
}

console.log('=== whole pool: accessors agree with legacy type/sub (all cards) ===');
(() => {
  const ids = Object.keys(CARDS);
  // Guard against a VACUOUS pass: the whole-pool checks below assert "mismatch
  // list is empty" over `ids` — if the pool failed to load, every list would be
  // empty and all 20+ assertions would silently go green on zero cards.
  check('card pool loaded (whole-pool checks are not vacuous)', ids.length > 200, ids.length + ' templates');

  // A card's typeLine legitimately diverges from the naive legacy concat in two
  // cases the parser corrects: (a) basic-land `sub: "Basic Land"` cruft (a type
  // word leaks into the subtype string), and (b) legendary cards, whose legacy
  // render omitted the Legendary supertype. Every other card must reproduce
  // legacy byte-for-byte.
  function subHasTypeTag(c) {
    return typeof c.sub === 'string' && c.sub.split(/\s+/).some(t => t && isCardTypeTag(t));
  }
  // Explicit-types[] cards (the multi-type Phase-4 cards) intentionally render a
  // typeLine that differs from the legacy type+sub concat — validated in
  // test_type_change, so excluded from the legacy-equivalence check here.
  function isCorrected(c) { return !!c.legendary || subHasTypeTag(c) || Array.isArray(c.types); }

  let govMismatch = [], hasTypeMiss = [], subMiss = [], lineMismatch = [], corrected = [];
  for (const id of ids) {
    const c = CARDS[id];

    // governingType collapses to the single declared type for today's data.
    if (governingType(c) !== c.type) govMismatch.push(id + ':' + governingType(c) + '!=' + c.type);

    // The declared type is a member.
    if (!hasType(c, c.type)) hasTypeMiss.push(id);

    // Every subtype token is a member.
    if (typeof c.sub === 'string') {
      for (const s of c.sub.split(/\s+/)) {
        if (s && !hasType(c, s)) subMiss.push(id + ':' + s);
      }
    }

    // typeLine reproduces legacy for clean cards; corrected cards asserted below.
    if (isCorrected(c)) {
      corrected.push(id);
    } else if (typeLine(c) !== legacyTypeLine(c)) {
      lineMismatch.push(id + ' "' + typeLine(c) + '" != "' + legacyTypeLine(c) + '"');
    }
  }
  check('governingType === card.type for every card', govMismatch.length === 0, govMismatch.slice(0, 5).join(', '));
  check('hasType(card, card.type) for every card', hasTypeMiss.length === 0, hasTypeMiss.slice(0, 5).join(', '));
  check('hasType hits every subtype token', subMiss.length === 0, subMiss.slice(0, 5).join(', '));
  check('typeLine reproduces legacy "type — sub" (clean-data cards)', lineMismatch.length === 0, lineMismatch.slice(0, 5).join(', '));

  // The known corrected set: basic lands + City of Brass (sub repeats "Land"),
  // plus legendary cards (Legendary supertype now prepended). Expected outputs.
  const EXPECT = { forest: 'Basic Land', island: 'Basic Land', mountain: 'Basic Land',
    plains: 'Basic Land', swamp: 'Basic Land', cityOfBrass: 'Land',
    cityGuardian: 'Legendary Creature — Human Soldier' };
  const bad = corrected.filter(id => EXPECT[id] !== undefined && typeLine(CARDS[id]) !== EXPECT[id]);
  check('parser corrects dirty-land + legendary typelines (Basic Land / Legendary prefix)',
    bad.length === 0, bad.map(id => id + '="' + typeLine(CARDS[id]) + '" want "' + EXPECT[id] + '"').join(', '));
  // Every legendary card hasType('Legendary') and renders the supertype first.
  const legends = ids.filter(id => CARDS[id].legendary);
  check('legendary cards: hasType("Legendary") and typeLine starts "Legendary "',
    legends.length > 0 && legends.every(id => hasType(CARDS[id], 'Legendary') && typeLine(CARDS[id]).startsWith('Legendary ')),
    legends.join(', '));
})();

console.log('\n=== negative: absent tags miss; nullish safe ===');
(() => {
  const c = CARDS[Object.keys(CARDS)[0]];
  check('absent tag misses', hasType(c, 'Zzyzx') === false);
  check('null card → no tags', typesOf(null).length === 0 && hasType(null, 'Creature') === false);
  check('null tag → miss', hasType(c, null) === false);
  check('governingType(null) === null', governingType(null) === null);
})();

console.log('\n=== registry: type vs subtype classification ===');
(() => {
  check('Creature/Land/Artifact/Enchantment/Sorcery are type tags',
    ['Creature', 'Land', 'Artifact', 'Enchantment', 'Sorcery'].every(isCardTypeTag));
  check('Instant is retired (no longer a known type tag)',
    !isCardTypeTag('Instant') && typeCategory('Instant') === 'subtype');
  check('Goblin/Forest/Cleric are subtype tags',
    ['Goblin', 'Forest', 'Cleric'].every(t => typeCategory(t) === 'subtype' && !isCardTypeTag(t)));
  check('Basic/Legendary are supertype tags (render left, not type-tags)',
    ['Basic', 'Legendary'].every(t => typeCategory(t) === 'supertype' && !isCardTypeTag(t)));
  check('Creature/Land/Artifact/Enchantment are permanents',
    ['Creature', 'Land', 'Artifact', 'Enchantment'].every(t => isPermanent({ type: t })));
  check('Sorcery is not a permanent',
    !isPermanent({ type: 'Sorcery' }));
})();

console.log('\n=== synthesized multi-type: accessors generalize (no such card today) ===');
(() => {
  // An artifact creature ("Robot") authored the future way, to prove the
  // accessors are not secretly single-type-only.
  const robot = { type: 'Creature', sub: 'Construct', __typesOverride: null };
  // Simulate a future multi-type card by feeding typesOf a card whose tag set
  // spans two type tags via the legacy fields it CAN represent: Artifact in
  // `type`, Creature folded as a subtype-position token is NOT how it'd be
  // authored, so instead verify governance directly on a hand-built tag list.
  check('Artifact+Creature → Creature governs (permanent body)',
    governingType({ type: 'Creature', sub: 'Artifact' }) === 'Creature');
  check('Land+Creature → Creature governs (Creature > Land)',
    governingType({ type: 'Land', sub: 'Creature' }) === 'Creature');
  check('Sorcery+Goblin → Sorcery governs (spell; subtype rides along)',
    governingType({ type: 'Sorcery', sub: 'Goblin' }) === 'Sorcery');
  check('Artifact alone → Artifact governs (inert cast permanent)',
    governingType({ type: 'Artifact', sub: '' }) === 'Artifact');
  check('typeLine of Artifact Creature — Construct',
    typeLine({ type: 'Creature', sub: 'Artifact Construct' }) === 'Creature Artifact — Construct',
    typeLine({ type: 'Creature', sub: 'Artifact Construct' }));
  check('robot hasType both Creature and Construct',
    hasType(robot, 'Creature') && hasType(robot, 'Construct'));
})();

console.log('\n=== explicit types[] hook: authoritative + carried through makeCard ===');
(() => {
  // typesOf honors an explicit types[] over the legacy type/sub derivation.
  const explicit = { type: 'Creature', sub: 'Ignored', types: ['Artifact', 'Creature', 'Construct'] };
  check('explicit types[] overrides derived type/sub',
    JSON.stringify(typesOf(explicit)) === JSON.stringify(['Artifact', 'Creature', 'Construct']));
  check('explicit Artifact+Creature → Creature governs, isPermanent',
    governingType(explicit) === 'Creature' && isPermanent(explicit) && hasType(explicit, 'Artifact'));
  // RISK #1 (QA): the Legendary supertype must survive an explicit types[] —
  // else a legendary multi-type card silently loses the legend rule.
  const legendRobot = { type: 'Creature', legendary: true, types: ['Artifact', 'Creature'] };
  check('legendary + explicit types[]: Legendary tag NOT dropped',
    hasType(legendRobot, 'Legendary') && typeLine(legendRobot).startsWith('Legendary '), typeLine(legendRobot));

  // makeCard carries an explicit template types[] onto the runtime instance, so
  // a future multi-type card behaves end-to-end (the Phase 4 readiness hook).
  const baseId = Object.keys(CARDS).find(id => CARDS[id].type === 'Creature' && !CARDS[id].special && CARDS[id].cost);
  CARDS.__robotProbe = Object.assign({}, CARDS[baseId], { name: 'Robot Probe', types: ['Artifact', 'Creature'] });
  const inst = ENGINE.makeCard('__robotProbe', [], 0);
  check('makeCard carries types[] onto the instance',
    Array.isArray(inst.types) && hasType(inst, 'Artifact') && hasType(inst, 'Creature'));
  check('instance governs as Creature + is a permanent (Robot)',
    governingType(inst) === 'Creature' && isPermanent(inst));
  delete CARDS.__robotProbe;
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
