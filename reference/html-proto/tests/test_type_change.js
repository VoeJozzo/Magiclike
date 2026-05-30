// Type-change layer (add_type / set_types) + the Phase-4 test-case cards
// (type-change spells, colorless artifact creatures, artifact lands).
//
// The grant layer mirrors keyword grants: card.typeGrants = [{tags,op,source,eot}],
// read live by typesOf so every hasType/governingType reader sees the change.
// Reverts ride the existing end-of-turn cleanup (eot grants + temp stats) and
// resetInPlayState (leave-play). The revert tests drive a REAL end of turn /
// real bounce rather than hand-emulating the cleanup loop — emulating it would
// pass against a copy of the logic and miss a real regression (it did: the first
// real-turn version of this test caught a bug where a permanent animate's P/T
// went to the EOT-cleared tempPower/tempTou, so it became a 0/0 creature and
// died to SBA at cleanup. Fixed to permPower/permTou in applyTypeChange).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
const CTX = (name) => ({ controller: 'you', sourceName: name, sourceIid: -1 });

// Boot a real game and drop a fresh instance of `tplId` onto your battlefield.
function spawn(tplId) {
  RUN.start({ cards: [tplId].concat(Array(11).fill('plains')), colors: ['W'] }, null);
  RUN.load();
  ENGINE.init(RUN.getSlots(), [tplId].concat(Array(11).fill('plains')));
  const G = ENGINE.state();
  const inst = ENGINE.makeCard(tplId, [], 0);
  inst.controller = 'you'; inst.owner = 'you'; inst.sick = false;
  G.you.battlefield.push(inst);
  return { G, inst };
}
// Drive a REAL end of turn: both players pass at every window until the turn
// counter advances, so the engine's actual cleanup loop reverts eot type grants
// + temp stats (not a hand-copy that could mask a regression).
function endTurn(G) {
  const startTurn = G.turn;
  let safety = 300;
  while (G.turn === startTurn && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    ENGINE.executeAction(w, { type: 'pass' });
  }
}

console.log('=== add_type (eot): a land becomes a 3/3 creature, reverts at EOT ===');
(() => {
  const { G, inst } = spawn('forest');
  check('forest starts a Land, not a Creature', hasType(inst, 'Land') && !hasType(inst, 'Creature'));
  ENGINE.applyEffect(CTX('Awaken the Vault'),
    { kind: 'add_type', types: ['Creature'], power: 3, toughness: 3, duration: 'eot' },
    { kind: 'permanent', iid: inst.iid });
  check('now BOTH Land and Creature (union)', hasType(inst, 'Land') && hasType(inst, 'Creature'));
  check('governs as Creature (Creature > Land), still a permanent',
    governingType(inst) === 'Creature' && isPermanent(inst));
  check('stats are 3/3', JSON.stringify(ENGINE.getStats(inst)) === '[3,3]', JSON.stringify(ENGINE.getStats(inst)));
  check('can attack (an in-play land isn’t summoning sick)', ENGINE.canCreatureAttack(inst));
  endTurn(G);
  check('after a real end of turn: reverts to a plain 0/0 Land',
    hasType(inst, 'Land') && !hasType(inst, 'Creature') && JSON.stringify(ENGINE.getStats(inst)) === '[0,0]');
})();

console.log('\n=== add_type (permanent): survives EOT, reverts on leave-play ===');
(() => {
  const { G, inst } = spawn('forest');
  ENGINE.applyEffect(CTX('Living Lands'),
    { kind: 'add_type', types: ['Creature'], power: 2, toughness: 2, duration: 'permanent' },
    { kind: 'permanent', iid: inst.iid });
  check('is a 2/2 creature', hasType(inst, 'Creature') && JSON.stringify(ENGINE.getStats(inst)) === '[2,2]');
  endTurn(G);
  // Survives a real end of turn AS A LIVING 2/2 — the permanent animate's stats
  // must persist with its Creature type (the bug this caught: stats vanished →
  // 0/0 → died to SBA at cleanup).
  check('SURVIVES a real end of turn as a living 2/2 creature',
    G.you.battlefield.some(c => c.iid === inst.iid) && hasType(inst, 'Creature')
    && JSON.stringify(ENGINE.getStats(inst)) === '[2,2]');
  // Real leave-play: bounce to hand → resetInPlayState fires → grant reverts.
  ENGINE.applyEffect(CTX('Unsummon'),
    { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' },
    { kind: 'permanent', iid: inst.iid });
  const bounced = G.you.hand.find(c => c.iid === inst.iid) || inst;
  check('reverts on a real leave-play (bounce): no longer a Creature', !hasType(bounced, 'Creature'));
})();

console.log('\n=== set_types: a creature becomes ONLY an artifact (neutralized) ===');
(() => {
  // Use a real single-type creature from the pool (not an explicit-multi-type
  // robot — set_types should neutralize a plain creature, not a co-typed one).
  const crId = Object.keys(CARDS).find(id => hasType(CARDS[id], 'Creature') && !CARDS[id].special && CARDS[id].cost
    && !(Array.isArray(CARDS[id].types) && CARDS[id].types.filter(t => isCardTypeTag(t)).length > 1));
  const { G, inst } = spawn(crId);
  check('starts a Creature', hasType(inst, 'Creature') && ENGINE.canCreatureAttack(inst));
  ENGINE.applyEffect(CTX('Petrify'),
    { kind: 'set_types', types: ['Artifact'], duration: 'eot' },
    { kind: 'creature', iid: inst.iid });
  check('becomes ONLY an Artifact — no longer a creature', hasType(inst, 'Artifact') && !hasType(inst, 'Creature'));
  check('can no longer attack (not a creature)', !ENGINE.canCreatureAttack(inst));
  check('still a permanent (artifact)', isPermanent(inst) && governingType(inst) === 'Artifact');
  endTurn(G);
  check('after a real end of turn: creature again', hasType(inst, 'Creature') && ENGINE.canCreatureAttack(inst) && !hasType(inst, 'Artifact'));
})();

console.log('\n=== multi-tag add (Golem Forge): land → 4/4 Artifact Creature ===');
(() => {
  const { inst } = spawn('forest');
  ENGINE.applyEffect(CTX('Golem Forge'),
    { kind: 'add_type', types: ['Artifact', 'Creature'], power: 4, toughness: 4, duration: 'eot' },
    { kind: 'permanent', iid: inst.iid });
  check('is Land + Artifact + Creature, 4/4',
    hasType(inst, 'Land') && hasType(inst, 'Artifact') && hasType(inst, 'Creature')
    && JSON.stringify(ENGINE.getStats(inst)) === '[4,4]');
  check('typeLine lists all three types left of the dash',
    ['Land', 'Artifact', 'Creature'].every(t => typeLine(inst).includes(t)) && !typeLine(inst).includes('—'), typeLine(inst));
})();

console.log('\n=== the 7 type-change spells are authored + generate clean text ===');
(() => {
  const spellIds = ['awaken_the_vault', 'living_lands', 'brand_of_iron', 'petrify', 'encase_in_amber', 'golem_forge', 'sudden_vines'];
  check('all 7 present, type Sorcery', spellIds.every(id => CARDS[id] && hasType(CARDS[id], 'Sorcery')),
    spellIds.filter(id => !CARDS[id]).join(', '));
  check('petrify & suddenVines have flash (instant-speed)',
    (CARDS.petrify.keywords || []).includes('flash') && (CARDS.sudden_vines.keywords || []).includes('flash'));
  const txt = describeEffect(CARDS.awaken_the_vault.effects[0]).map(s => s.text).join('');
  check('add_type generates readable text (no "[add_type]" sentinel)',
    !txt.includes('[add_type]') && /Creature/.test(txt) && /3\/3/.test(txt), txt);
  const stxt = describeEffect(CARDS.petrify.effects[0]).map(s => s.text).join('');
  check('set_types generates readable text', !stxt.includes('[set_types]') && /Artifact/.test(stxt), stxt);
  // Indefinite article: "becomes an artifact" (vowel), "becomes a 3/3 creature"
  // (number spoken "three" → consonant). Regression for the missing-article bug.
  check('set_types text reads "becomes an Artifact"', /becomes an Artifact/.test(stxt), stxt);
  check('add_type text reads "becomes a 3/3 Creature"', /becomes a 3\/3 Creature/.test(txt), txt);
  // Article picker handles letter + number pronunciation cases.
  check('article: vowel-initial → an', indefiniteArticle('Artifact') === 'an');
  check('article: consonant-initial → a', indefiniteArticle('Creature') === 'a' && indefiniteArticle('Goblin') === 'a');
  check('article: numbers follow pronunciation (3→a, 8→an, 11/18→an, 10→a)',
    indefiniteArticle('3/3 Creature') === 'a' && indefiniteArticle('8/8 Creature') === 'an'
    && indefiniteArticle('11/11 Beast') === 'an' && indefiniteArticle('18/18 Wurm') === 'an'
    && indefiniteArticle('10/10 Giant') === 'a' && indefiniteArticle('1/1 Soldier') === 'a');
})();

console.log('\n=== 8 colorless artifact creatures ===');
(() => {
  const robots = ['clockwork_beetle', 'scrap_hound', 'alloy_myr', 'copper_golem', 'razor_beacon', 'iron_sentinel', 'bulwark_automaton', 'sentinel_colossus'];
  check('all 8 present', robots.every(id => CARDS[id]), robots.filter(id => !CARDS[id]).join(', '));
  check('each is an Artifact Creature (explicit types[]) + colorless',
    robots.every(id => { const c = CARDS[id]; return hasType(c, 'Artifact') && hasType(c, 'Creature') && governingType(c) === 'Creature' && !['W', 'U', 'B', 'R', 'G'].some(k => c.cost && c.cost[k]); }));
  // An instance dies to creature removal AND counts as an artifact.
  const { inst } = spawn('copper_golem');
  check('instance: hasType Artifact AND Creature, isPermanent, governs Creature',
    hasType(inst, 'Artifact') && hasType(inst, 'Creature') && isPermanent(inst) && governingType(inst) === 'Creature');
  check('typeLine renders "Artifact Creature — <sub>"', /^Artifact Creature — \S/.test(typeLine(inst)), typeLine(inst));
})();

console.log('\n=== 6 artifact lands (WUBRG + C), mana DERIVED from basic subtype ===');
(() => {
  const lands = ['gilded_seat', 'tidal_conduit', 'bone_reliquary', 'ember_anvil', 'verdant_verge', 'dross_pylon'];
  check('all 6 present', lands.every(id => CARDS[id]), lands.filter(id => !CARDS[id]).join(', '));
  check('each is Land + Artifact and taps for its color',
    lands.every(id => { const c = CARDS[id]; return hasType(c, 'Land') && hasType(c, 'Artifact') && c.mana && Array.isArray(c.abilities); }));
  // The 5 colored lands carry a basic-land subtype and DERIVE their mana ability
  // from it at ingest (no hand-authored ability in the JSON). Verify the derived
  // ability produces exactly the matching color.
  const SUBTYPE_COLOR = { gilded_seat: ['Plains', 'W'], tidal_conduit: ['Island', 'U'], bone_reliquary: ['Swamp', 'B'], ember_anvil: ['Mountain', 'R'], verdant_verge: ['Forest', 'G'] };
  for (const [id, [sub, color]] of Object.entries(SUBTYPE_COLOR)) {
    check(`${id}: has the ${sub} subtype`, hasType(CARDS[id], sub));
    check(`${id}: subtype derives "{T}: Add {${color}}"`,
      JSON.stringify(ENGINE.landProducibleColors(CARDS[id])) === JSON.stringify([color]),
      JSON.stringify(ENGINE.landProducibleColors(CARDS[id])));
  }
  // End-to-end: a derived land actually taps for its color through the real action.
  RUN.start({ cards: ['gilded_seat'].concat(Array(11).fill('plains')), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state(); G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  const gs = ENGINE.makeCard('gilded_seat', [], 0); gs.controller = 'you'; gs.owner = 'you'; gs.tapped = false; gs.sick = false;
  G.you.battlefield.push(gs);
  const w0 = G.you.mana.W;
  check('derived land tap is legal', ENGINE.isLegalAction('you', { type: 'tapLandForMana', cardIid: gs.iid }));
  ENGINE.executeAction('you', { type: 'tapLandForMana', cardIid: gs.iid });
  check('derived land taps for {W} and becomes tapped', G.you.mana.W === w0 + 1 && gs.tapped);
  check('cover all six mana colors W/U/B/R/G/C',
    ['W', 'U', 'B', 'R', 'G', 'C'].every(c => lands.some(id => CARDS[id].mana === c)));
  // Draft pool: artifact lands IN, basic lands OUT.
  const inPool = (id) => {
    // Re-derive the pool predicate (draftPool is cached/internal): non-land OR artifact-land, non-special.
    const c = CARDS[id];
    return !c.special && (!hasType(c, 'Land') || hasType(c, 'Artifact'));
  };
  check('artifact lands qualify for the draft pool', lands.every(inPool));
  check('basic lands still excluded from the draft pool', !inPool('forest') && !inPool('plains'));
  check('artifact creatures + type-change spells qualify too',
    inPool('copper_golem') && inPool('awaken_the_vault'));
})();

console.log('\n=== end-to-end: cast awakenVault through the real action flow ===');
(() => {
  // The type-change spells are the first cards to use a top-level target:'permanent'
  // step — drive a full executeAction cast → resolve to prove that path works,
  // not just the effect handler in isolation.
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const land = ENGINE.makeCard('forest', [], 0);
  land.controller = 'you'; land.owner = 'you'; land.sick = false; land.iid = 7001;
  G.you.battlefield.push(land);
  const spell = ENGINE.makeCard('awaken_the_vault', [], 0);
  spell.controller = 'you'; spell.owner = 'you'; spell.iid = 7002;
  G.you.hand.push(spell);

  const casts = ENGINE.getLegalActions('you').filter(a => a.type === 'castSpell' && a.cardIid === 7002);
  check('exactly one cast action, target restricted to the land (target:permanent + filter:Land)',
    casts.length === 1 && (casts[0].targets || []).length === 1 && casts[0].targets[0].iid === 7001,
    'casts=' + casts.length);
  if (casts.length) {
    ENGINE.executeAction('you', casts[0]);
    let g = 0;
    while (G.stack.length > 0 && g++ < 20) {
      const w = ENGINE.expectedActor(); if (!w) break;
      const a = AI.decide(G, w); if (!a) break;
      ENGINE.executeAction(w, a);
    }
    check('after cast+resolve: the land is a 3/3 creature',
      hasType(land, 'Creature') && JSON.stringify(ENGINE.getStats(land)) === '[3,3]');
  }
})();

console.log('\n=== #3: card text narrows "permanent" to the filtered type ===');
(() => {
  const aw = describeCardText(CARDS.awaken_the_vault);
  check('awakenVault says "target land" (not "target permanent")',
    /target land/i.test(aw) && !/target permanent/i.test(aw), aw);
  check('golemForge / livingLands / suddenVines also say "target land"',
    ['golem_forge', 'living_lands', 'sudden_vines'].every(id => /target land/i.test(describeCardText(CARDS[id]))));
  check('petrify (target:creature) still says "target creature"',
    /target creature/i.test(describeCardText(CARDS.petrify)));
  check('encaseInAmber (target:permanent, no type filter) still says "target permanent"',
    /target permanent/i.test(describeCardText(CARDS.encase_in_amber)));
})();

console.log('\n=== #4: the AI has tooling — it casts a neutralize spell at an enemy creature ===');
(() => {
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.activePlayer = 'you'; G.priorityHolder = 'you'; G.phase = 'MAIN1';
  G.stack = []; G.gameOver = false; G.priority = { passes: new Set() };
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.hand = []; G.you.battlefield = []; G.opp.battlefield = [];
  const enemy = ENGINE.makeCard('sentinel_colossus', [], 0);  // a 6/6 worth answering
  enemy.controller = 'opp'; enemy.owner = 'opp'; enemy.iid = 8101; enemy.sick = false;
  G.opp.battlefield.push(enemy);
  const spell = ENGINE.makeCard('encase_in_amber', [], 0);
  spell.controller = 'you'; spell.owner = 'you'; spell.iid = 8102;
  G.you.hand.push(spell);
  const dec = AI.decide(G, 'you');
  check('AI chooses to cast encaseInAmber (no longer zero-tooled)',
    dec && dec.type === 'castSpell' && dec.cardIid === 8102, JSON.stringify(dec && { t: dec.type, iid: dec.cardIid }));
  check('AI aims the neutralize at the enemy creature',
    dec && Array.isArray(dec.targets) && dec.targets.some(t => t.iid === 8101));
})();

console.log('\n=== staple same-class UNION: Artifact co-type rides along ===');
(() => {
  const vanilla = Object.keys(CARDS).find(id => hasType(CARDS[id], 'Creature') && !CARDS[id].special && CARDS[id].cost && !(Array.isArray(CARDS[id].types) && CARDS[id].types.filter(t => isCardTypeTag(t)).length > 1) && !CARDS[id].triggers && !CARDS[id].abilities);
  // Artifact creature as the STAPLE onto a vanilla creature base (the direction
  // that used to drop Artifact — base had no types[]).
  const syn = ENGINE.synthesizeStapledTemplate(vanilla, ['copper_golem']);
  check('Cr base + artifact-Cr staple → merged is BOTH Artifact and Creature',
    hasType(syn, 'Artifact') && hasType(syn, 'Creature') && governingType(syn) === 'Creature');
  check('merged carries the staple’s subtype (Golem)', hasType(syn, 'Golem'), typeLine(syn));
  // Land staple still COLLAPSES (no true land-creatures): a Cr+Ld staple stays a
  // cast creature, NOT playable as a land.
  const synLand = ENGINE.synthesizeStapledTemplate(vanilla, ['forest']);
  check('Cr base + Land staple → Creature, NOT a Land (collapse preserved)',
    hasType(synLand, 'Creature') && !hasType(synLand, 'Land'));
  // Artifact LAND staple: Land collapses, but the Artifact co-type rides along.
  const synArtLand = ENGINE.synthesizeStapledTemplate(vanilla, ['gilded_seat']);
  check('Cr base + artifact-Land staple → Artifact rides, Land collapses',
    hasType(synArtLand, 'Artifact') && hasType(synArtLand, 'Creature') && !hasType(synArtLand, 'Land'));
  // Vanilla Cr + vanilla Cr staple forces no spurious CO-TYPE (Artifact). Post
  // id-normalization every card carries types[], so the merge legitimately has
  // one too — the real invariant is that it stays a plain Creature with no
  // Artifact/Enchantment co-type bolted on, governing as Creature.
  const vanilla2 = Object.keys(CARDS).find(id => id !== vanilla && hasType(CARDS[id], 'Creature') && !CARDS[id].special && CARDS[id].cost && !(Array.isArray(CARDS[id].types) && CARDS[id].types.filter(t => isCardTypeTag(t)).length > 1) && !CARDS[id].triggers && !CARDS[id].abilities);
  const synPlain = ENGINE.synthesizeStapledTemplate(vanilla, [vanilla2]);
  check('vanilla Cr + vanilla Cr staple → governs Creature, no spurious Artifact co-type',
    governingType(synPlain) === 'Creature' && !hasType(synPlain, 'Artifact') && !hasType(synPlain, 'Enchantment'));
})();

console.log('\n=== boot validation clean (effects + card-text + coverage) ===');
(() => {
  const v = ENGINE.validateAllCardEffects(CARDS);
  check('no unknown effect kinds across the whole (expanded) pool', v.unknownKinds.length === 0, v.unknownKinds.join(', '));
  check('no unknown target filters', v.unknownFilters.length === 0, v.unknownFilters.join(', '));
  const cov = ENGINE.effectCoverageReport();
  check('add_type/set_types classified for valuation + cast-scoring + card-text',
    cov.unclassifiedValuation.length === 0 && cov.unclassifiedCastScoring.length === 0 && cov.missingText.length === 0,
    JSON.stringify({ val: cov.unclassifiedValuation, cast: cov.unclassifiedCastScoring, text: cov.missingText }));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
