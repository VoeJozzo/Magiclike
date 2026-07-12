// Wave 2 cards (docs/plans/plan-pool-waves.md FINAL BUILD SPEC, 2026-07-10):
// 32 ship / 1 kill. Mechanics = conversation-board `after` fields
// (docs/plans/wave-data/build_wave2_conversations.js); names/typelines =
// wave2_flavor_final.json. The shared primitives have their own deep pins
// (wave2_hook_test = spell riders, wave2_ability_event_test = ability_activated);
// this file covers (1) TEXT GOLDENS — the exact generated rules text of all 32,
// which transitively locks every new archetype signature + preamble — and
// (2) per-card behavior probes for the mechanics unique to this batch.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

let nextIid = 9800;
function mk(tplId, controller) {
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, {
    iid: nextIid++, tplId, controller, owner: controller,
    tapped: false, sick: false, damage: 0, tempPower: 0, tempTou: 0,
    permPower: 0, permTou: 0, damagedBySources: new Set(),
    keywords: (inst.keywords || []).slice(),
    grantedBy: new Map(), eotGrants: [], typeGrants: [],
  });
}
function drain(G) {
  let safety = 80;
  while ((G.stack.length || (G.pendingTriggers || []).length || G.pendingTriggerTarget
          || (G.forcedDiscard && G.forcedDiscard.remaining > 0)) && safety-- > 0) {
    const w = ENGINE.expectedActor(); if (!w) break;
    const a = AI.decide(G, w); if (!a) break;
    ENGINE.executeAction(w, a);
  }
}
function freshGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('forest'), colors: ['G'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  setup.startMainPhase('you');
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  G.you.battlefield = []; G.opp.battlefield = []; G.you.hand = []; G.opp.hand = [];
  return G;
}
// Re-open a clean main phase per cast so no assertion passes vacuously off a
// rejected action (wave2_hook_test lesson).
function cast(G, tplId, targets, who) {
  who = who || 'you';
  setup.startMainPhase(who);
  G[who].mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const spell = mk(tplId, who);
  G[who].hand.push(spell);
  const act = { type: 'castSpell', cardIid: spell.iid };
  if (targets) act.targets = targets;
  const ok = ENGINE.executeAction(who, act);
  drain(G);
  return { spell, ok };
}

// ── 1. Text goldens: every Wave 2 card's generated rules text, exactly ────
console.log('=== text goldens (all 32 — locks archetypes, preambles, rider text) ===');
const GOLDENS = {
  steadfast_knight: 'When this enters the battlefield, creatures you control gain vigilance until end of turn.',
  chapter_recruiter: 'Whenever another Human enters under your control, put a +1/+1 counter on this.',
  triage_cleric: 'Whenever another creature with an enters-the-battlefield damage ability enters under your control, gain 2 life.',
  intimidating_lancer: 'When this attacks, tap target creature an opponent controls.',
  vigil_chanter: 'Spells you cast also grant vigilance to each creature they target until end of turn.',
  rescue_angel: 'Whenever you cast a spell, target creature you control gains flying until end of turn.',
  wing_commander: 'Other creatures you control with flying get +1/+1.',
  second_wind: 'Untap target creature you control. Target creature you control gains vigilance until end of turn.',
  vanguard_ensign: 'Other creatures you control get +1/+0.',
  vanishing_act: 'Exile target creature you control, then return it to the battlefield.',
  updraft: 'Target creature you control gains flying until end of turn.',
  strategic_retreat: "Return target creature you control to its owner's hand. Draw a card.",
  chrysalis_ward: 'Target creature you control gets +0/+1 and gains hexproof until end of turn.',
  feinting_sprite: 'Whenever you cast a spell with flash, put a +1/+1 counter on this.',
  curious_faerie: 'Whenever you draw a card, this creature gets +1/+0 until end of turn.',
  spellrider: 'Whenever you cast a noncreature spell, this creature gains flying until end of turn.',
  tidewatcher: "Whenever you cast a spell during an opponent's turn, draw a card.",
  surgecaster: 'Whenever you cast a spell with flash, put a +1/+1 counter on this.',
  covenant_scholar: 'Whenever another Elf or Merfolk enters under your control, put a +1/+1 counter on this.',
  sapling_tender: 'Spells you cast that target creatures you control also put a +1/+1 counter on them.',
  bramble_acolyte: 'Whenever another creature enters under your control, put a +1/+1 counter on this.',
  earthsinger: '{T}, {G}: target land also becomes a 2/2 Elemental Creature until end of turn.',
  rootbound_sentinel: 'Land creatures you control have vigilance.',
  frontier_sapling: 'Whenever a land enters the battlefield under your control, put a +1/+1 counter on this.',
  wildwood_scout: 'Whenever a land enters the battlefield under your control, this creature gets +1/+1 until end of turn.',
  charnel_shaman: 'Whenever a creature you control dies, put a +1/+1 counter on target creature you control.',
  altar_butcher: '{T}, Sacrifice a creature: deal 2 damage to any target.',
  aggressive_instigator: 'Whenever another creature you control attacks, this creature gets +1/+0 until end of turn.',
  backlash_mage: 'Whenever you activate an ability of a creature you control, deal 1 damage to target opponent.',
  scrap: 'Destroy target artifact.',
  primal_metamagus: 'Spells you cast also deal 1 damage to their targets.',
  wildfire_colossus: 'Sorceries you cast that deal damage also put a +1/+1 counter on Wildfire Colossus.',
};
for (const [id, want] of Object.entries(GOLDENS)) {
  const got = describeCardText(ENGINE.makeCard(id));
  check(id, got === want, got !== want ? 'got "' + got + '"' : '');
}
// Flash preamble spot-check: the flash sorceries carry the keyword line.
check('flash sorceries carry flash (scrap keywords)',
  (CARDS.scrap.keywords || []).includes('flash'));

// ── 2. Behavior probes ────────────────────────────────────────────────────

console.log('\n=== steadfast_knight: ETB grants your creatures vigilance until EOT ===');
(() => {
  const G = freshGame();
  const bear = mk('grizzly_bears', 'you');
  const theirs = mk('grizzly_bears', 'opp');
  G.you.battlefield.push(bear); G.opp.battlefield.push(theirs);
  cast(G, 'steadfast_knight');
  check('your bystander gained vigilance', bear.keywords.includes('vigilance'));
  check("their creature didn't", !theirs.keywords.includes('vigilance'));
})();

console.log('\n=== chapter_recruiter: Humans feed it; non-Humans do not ===');
(() => {
  const G = freshGame();
  const rec = mk('chapter_recruiter', 'you');
  G.you.battlefield.push(rec);
  cast(G, 'pyromaniac');           // Human Shaman
  let [p, t] = ENGINE.getStats(rec);
  check('Human enters -> 2/2', p === 2 && t === 2, p + '/' + t);
  cast(G, 'grizzly_bears');        // Bear, not Human
  [p, t] = ENGINE.getStats(rec);
  check('non-Human enters -> still 2/2', p === 2 && t === 2, p + '/' + t);
})();

console.log('\n=== triage_cleric: ETB-damager enters -> gain 2; vanilla does not ===');
(() => {
  const G = freshGame();
  G.you.battlefield.push(mk('triage_cleric', 'you'));
  G.opp.battlefield.push(mk('grizzly_bears', 'opp')); // ping target for pyromaniac
  const life0 = G.you.life;
  cast(G, 'pyromaniac');           // has an ETB damage trigger
  check('pyromaniac (ETB pinger) -> +2 life', G.you.life === life0 + 2,
    life0 + ' -> ' + G.you.life);
  cast(G, 'grizzly_bears');
  check('vanilla creature -> no gain', G.you.life === life0 + 2, String(G.you.life));
})();

console.log('\n=== intimidating_lancer: attack tap (their creature) ===');
(() => {
  const G = freshGame();
  const lancer = mk('intimidating_lancer', 'you'); lancer.sick = false;
  const blocker = mk('grizzly_bears', 'opp');
  G.you.battlefield.push(lancer); G.opp.battlefield.push(blocker);
  // ANCHOR: a castable response in opp's hand parks the engine mid-combat.
  // Without it the whole turn auto-cascades inside declareAttackers and the
  // opponent's next UNTAP step silently undoes the tap we're asserting
  // (found the hard way — the tap DID land, then evaporated). Real lands,
  // not gifted mana: floating pools empty at every phase boundary (B2), so
  // combat-phase castability must come from the board.
  G.opp.hand.push(mk('lightning_bolt', 'opp'));
  G.opp.battlefield.push(mk('mountain', 'opp'), mk('mountain', 'opp'), mk('mountain', 'opp'));
  // Real combat drive (test_ability_pass_reset pattern): close MAIN1, declare.
  ENGINE.executeAction('you', { type: 'pass' });
  ENGINE.executeAction('opp', { type: 'pass' });
  const ok = ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [lancer.iid] });
  drain(G);   // resolve the stacked trigger; the anchor stops the cascade after
  check('attack declared', ok === true);
  check('their creature is tapped (sole target auto-fills)', blocker.tapped === true);
})();

console.log('\n=== wing_commander: buffs YOUR fliers only, not itself, not ground ===');
(() => {
  const G = freshGame();
  const cmdr = mk('wing_commander', 'you');
  const flier = mk('air_elemental', 'you');
  const ground = mk('grizzly_bears', 'you');
  const theirFlier = mk('air_elemental', 'opp');
  G.you.battlefield.push(cmdr, flier, ground); G.opp.battlefield.push(theirFlier);
  const fs = ENGINE.getStats(flier), gs = ENGINE.getStats(ground),
        cs = ENGINE.getStats(cmdr), os = ENGINE.getStats(theirFlier);
  check('your flier +1/+1', fs[0] === (CARDS.air_elemental.power + 1) && fs[1] === (CARDS.air_elemental.toughness + 1), fs.join('/'));
  check('ground creature unbuffed', gs[0] === CARDS.grizzly_bears.power && gs[1] === CARDS.grizzly_bears.toughness, gs.join('/'));
  check('commander not self-buffed (2/3)', cs[0] === 2 && cs[1] === 3, cs.join('/'));
  check('their flier unbuffed', os[0] === CARDS.air_elemental.power, os.join('/'));
})();

console.log('\n=== vanguard_ensign: filterless anthem, others only ===');
(() => {
  const G = freshGame();
  const ensign = mk('vanguard_ensign', 'you');
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(ensign, bear);
  const bs = ENGINE.getStats(bear), es = ENGINE.getStats(ensign);
  check('bystander +1/+0', bs[0] === 3 && bs[1] === 2, bs.join('/'));
  check('ensign itself 2/2', es[0] === 2 && es[1] === 2, es.join('/'));
})();

console.log('\n=== earthsinger: animates a land 2/2 EOT; double-animation STACKS (pinned) ===');
(() => {
  const G = freshGame();
  const singer = mk('earthsinger', 'you'); singer.sick = false;
  const singer2 = mk('earthsinger', 'you'); singer2.sick = false;
  const land = mk('forest', 'you');
  G.you.battlefield.push(singer, singer2, land);
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: singer.iid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: land.iid, label: land.name }] });
  drain(G);
  check('land is now a creature', hasType(land, 'Creature'));
  check('and an Elemental', hasType(land, 'Elemental'));
  let s = ENGINE.getStats(land);
  check('2/2', s[0] === 2 && s[1] === 2, s.join('/'));
  // Joe's build-time question: animating an ALREADY-animated land. Pinned
  // behavior: the type grant unions harmlessly and the +2/+2 temp stats STACK
  // (add_type is additive, not a base-stat set) — a double-animated land is a
  // 4/4 for the turn. Documented, not hidden.
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: singer2.iid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: land.iid, label: land.name }] });
  drain(G);
  s = ENGINE.getStats(land);
  check('second animation stacks -> 4/4 (documented additive behavior)',
    s[0] === 4 && s[1] === 4, s.join('/'));
  check('still a land', hasType(land, 'Land'));
})();

console.log('\n=== rootbound_sentinel: animated lands you control gain vigilance ===');
(() => {
  const G = freshGame();
  const sentinel = mk('rootbound_sentinel', 'you');
  const singer = mk('earthsinger', 'you'); singer.sick = false;
  const land = mk('forest', 'you');
  const plainLand = mk('forest', 'you');
  G.you.battlefield.push(sentinel, singer, land, plainLand);
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: singer.iid, abilityIdx: 0,
    targets: [{ kind: 'permanent', iid: land.iid, label: land.name }] });
  drain(G);
  check('animated land has vigilance', (land.keywords || []).includes('vigilance'),
    JSON.stringify(land.keywords));
  check('non-creature land does not', !(plainLand.keywords || []).includes('vigilance'));
  check('sentinel itself has intrinsic vigilance', sentinel.keywords.includes('vigilance'));
})();

console.log('\n=== frontier_sapling / wildwood_scout: landfall — permanent counter vs EOT pump ===');
(() => {
  const G = freshGame();
  const sapling = mk('frontier_sapling', 'you');
  const scout = mk('wildwood_scout', 'you');
  G.you.battlefield.push(sapling, scout);
  // Real path: play a land from hand.
  const land = mk('forest', 'you');
  G.you.hand.push(land);
  G.landsPlayed = { you: 0, opp: 0 };
  if (G.you.landsPlayedThisTurn != null) G.you.landsPlayedThisTurn = 0;
  const ok = ENGINE.executeAction('you', { type: 'playLand', cardIid: land.iid });
  drain(G);
  check('land drop executed', ok === true);
  let ss = ENGINE.getStats(sapling), cs = ENGINE.getStats(scout);
  check('sapling got a permanent counter (2/2)', ss[0] === 2 && ss[1] === 2, ss.join('/'));
  check('scout got +1/+1 EOT (2/2)', cs[0] === 2 && cs[1] === 2, cs.join('/'));
  check('sapling counter is PERMANENT (permPower)', sapling.permPower === 1);
  check('scout pump is TEMP (tempPower)', scout.tempPower === 1 && scout.permPower === 0);
  // A creature entering is not a land.
  cast(G, 'grizzly_bears');
  ss = ENGINE.getStats(sapling);
  check('creature enters -> sapling unchanged', ss[0] === 2 && ss[1] === 2, ss.join('/'));
})();

console.log('\n=== curious_faerie: your draws pump it; opp draws do not ===');
(() => {
  const G = freshGame();
  const faerie = mk('curious_faerie', 'you');
  G.you.battlefield.push(faerie);
  G.you.library = [mk('forest', 'you')];
  G.opp.library = [mk('forest', 'opp')];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test', sourceIid: 99101 },
    { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }, null);
  drain(G);
  let s = ENGINE.getStats(faerie);
  check('you draw -> 2/1 until EOT', s[0] === 2 && s[1] === 1, s.join('/'));
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test', sourceIid: 99102 },
    { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }, null);
  drain(G);
  s = ENGINE.getStats(faerie);
  check('opp draw -> unchanged', s[0] === 2 && s[1] === 1, s.join('/'));
})();

console.log('\n=== tidewatcher: draws only on opp-turn casts ===');
(() => {
  const G = freshGame();
  G.you.battlefield.push(mk('tidewatcher', 'you'));
  G.you.library = [mk('forest', 'you'), mk('forest', 'you')];
  // Own-turn cast: no draw.
  const hand0 = G.you.hand.length;
  cast(G, 'giant_growth', null); // fizzles targetless? give it a target
  drain(G);
  // (giant_growth needs a creature target; use a bear first)
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(bear);
  const handBefore = G.you.hand.length;
  cast(G, 'giant_growth', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  check('own-turn cast -> no draw', G.you.hand.length === handBefore, handBefore + ' -> ' + G.you.hand.length);
  // Opponent's turn: flip active player, cast a flash spell.
  G.activePlayer = 'opp';
  G.you.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const ward = mk('chrysalis_ward', 'you');
  G.you.hand.push(ward);
  const handOppTurn = G.you.hand.length;
  const ok = ENGINE.executeAction('you', { type: 'castSpell', cardIid: ward.iid,
    targets: [{ kind: 'creature', iid: bear.iid, label: bear.name }] });
  drain(G);
  check('opp-turn flash cast executed', ok === true);
  check('opp-turn cast -> draw 1 (net hand -1 spell +1 draw)',
    G.you.hand.length === handOppTurn, handOppTurn + ' -> ' + G.you.hand.length);
})();

console.log('\n=== feinting_sprite + surgecaster: flash casts feed them; sorceries do not ===');
(() => {
  const G = freshGame();
  const sprite = mk('feinting_sprite', 'you');
  const surge = mk('surgecaster', 'you');
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(sprite, surge, bear);
  cast(G, 'updraft', [{ kind: 'creature', iid: bear.iid, label: bear.name }]); // flash
  let sp = ENGINE.getStats(sprite), su = ENGINE.getStats(surge);
  check('flash cast -> sprite 2/3', sp[0] === 2 && sp[1] === 3, sp.join('/'));
  check('flash cast -> surgecaster 3/4', su[0] === 3 && su[1] === 4, su.join('/'));
  // divination has NO flash (nearly every combat trick in the pool does).
  G.you.library = [mk('forest', 'you'), mk('forest', 'you')];
  cast(G, 'divination');
  sp = ENGINE.getStats(sprite);
  check('non-flash cast -> sprite unchanged', sp[0] === 2 && sp[1] === 3, sp.join('/'));
})();

console.log('\n=== spellrider: noncreature casts grant it flying; creature casts do not ===');
(() => {
  const G = freshGame();
  const rider = mk('spellrider', 'you');
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(rider, bear);
  cast(G, 'giant_growth', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  check('sorcery cast -> flying', rider.keywords.includes('flying'));
  // Clear the EOT grant, then cast a creature.
  rider.keywords = rider.keywords.filter(k => k !== 'flying');
  cast(G, 'grizzly_bears');
  check('creature cast -> no flying', !rider.keywords.includes('flying'));
})();

console.log('\n=== covenant_scholar: Elf feeds, Merfolk feeds, Elf+Merfolk feeds ONCE, Human does not ===');
(() => {
  const G = freshGame();
  const scholar = mk('covenant_scholar', 'you');
  G.you.battlefield.push(scholar);
  cast(G, 'llanowar_elves');       // Elf
  let s = ENGINE.getStats(scholar);
  check('Elf enters -> 3/4', s[0] === 3 && s[1] === 4, s.join('/'));
  cast(G, 'merfolk_looter');       // Merfolk
  s = ENGINE.getStats(scholar);
  check('Merfolk enters -> 4/5', s[0] === 4 && s[1] === 5, s.join('/'));
  // A second Covenant Scholar is Elf AND Merfolk — the any-of predicate is
  // one trigger, ONE fire (Joe's double-fire question, pinned).
  cast(G, 'covenant_scholar');
  s = ENGINE.getStats(scholar);
  check('Elf+Merfolk enters -> exactly ONE counter (5/6)', s[0] === 5 && s[1] === 6, s.join('/'));
  cast(G, 'pyromaniac');           // Human
  s = ENGINE.getStats(scholar);
  check('Human enters -> unchanged', s[0] === 5 && s[1] === 6, s.join('/'));
})();

console.log('\n=== charnel_shaman: your creature dies -> counter on target your creature ===');
(() => {
  const G = freshGame();
  const shaman = mk('charnel_shaman', 'you');
  const victim = mk('grizzly_bears', 'you');
  G.you.battlefield.push(shaman, victim);
  // Destroy outright — bare applyEffect damage doesn't run the death sweep.
  ENGINE.applyEffect({ controller: 'opp', sourceName: 'Test', sourceIid: 99103 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: victim.iid, label: victim.name });
  drain(G);
  check('victim died', !G.you.battlefield.some(c => c.iid === victim.iid));
  const s = ENGINE.getStats(shaman);
  check('shaman got the counter (sole legal target) -> 3/4', s[0] === 3 && s[1] === 4, s.join('/'));
  // An OPP creature dying must not trigger it.
  const theirs = mk('grizzly_bears', 'opp');
  G.opp.battlefield.push(theirs);
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test', sourceIid: 99104 },
    { kind: 'affect_creature', severity: 'destroy' }, { kind: 'creature', iid: theirs.iid, label: theirs.name });
  drain(G);
  const s2 = ENGINE.getStats(shaman);
  check('their creature dies -> no counter', s2[0] === 3 && s2[1] === 4, s2.join('/'));
})();

console.log('\n=== altar_butcher: {T}, sac -> 2 damage; cost paid up front ===');
(() => {
  const G = freshGame();
  const butcher = mk('altar_butcher', 'you'); butcher.sick = false;
  const fodder = mk('grizzly_bears', 'you');
  const victim = mk('air_elemental', 'opp');
  G.you.battlefield.push(butcher, fodder); G.opp.battlefield.push(victim);
  // Anchor: parked opponent, or the cascaded cleanup wipes victim.damage.
  G.opp.hand.push(mk('lightning_bolt', 'opp'));
  G.opp.mana = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  const ok = ENGINE.executeAction('you', { type: 'activateAbility',
    cardIid: butcher.iid, abilityIdx: 0, sacIid: fodder.iid,
    targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
  ENGINE.executeAction('opp', { type: 'pass' });
  check('activation executed', ok === true);
  check('fodder sacrificed', G.you.graveyard.some(c => c.iid === fodder.iid));
  check('victim took 2', victim.damage === 2, 'damage=' + victim.damage);
  check('butcher tapped', butcher.tapped === true);
})();

console.log('\n=== aggressive_instigator: pumps on ANOTHER attacker, not itself ===');
(() => {
  const G = freshGame();
  const inst = mk('aggressive_instigator', 'you');
  const bear = mk('grizzly_bears', 'you'); bear.sick = false;
  G.you.battlefield.push(inst, bear);
  // Anchor (see intimidating_lancer): the EOT pump would evaporate in the
  // auto-cascaded cleanup without a parked opponent. Board lands, not
  // gifted mana (pools empty at phase boundaries).
  G.opp.hand.push(mk('lightning_bolt', 'opp'));
  G.opp.battlefield.push(mk('mountain', 'opp'), mk('mountain', 'opp'), mk('mountain', 'opp'));
  ENGINE.executeAction('you', { type: 'pass' });
  ENGINE.executeAction('opp', { type: 'pass' });
  ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [bear.iid] });
  drain(G);
  let s = ENGINE.getStats(inst);
  check('another attacks -> 3/1', s[0] === 3 && s[1] === 1, s.join('/'));

  const G2 = freshGame();
  const inst2 = mk('aggressive_instigator', 'you'); inst2.sick = false;
  G2.you.battlefield.push(inst2);
  G2.opp.hand.push(mk('lightning_bolt', 'opp'));
  G2.opp.battlefield.push(mk('mountain', 'opp'), mk('mountain', 'opp'), mk('mountain', 'opp'));
  ENGINE.executeAction('you', { type: 'pass' });
  ENGINE.executeAction('opp', { type: 'pass' });
  ENGINE.executeAction('you', { type: 'declareAttackers', cardIids: [inst2.iid] });
  drain(G2);
  const s2 = ENGINE.getStats(inst2);
  check('itself attacks -> no pump (another_card)', s2[0] === 2 && s2[1] === 1, s2.join('/'));
})();

console.log('\n=== backlash_mage (real card): creature activation drains the opponent ===');
(() => {
  const G = freshGame();
  const mage = mk('backlash_mage', 'you');
  const sorcerer = mk('prodigal_sorcerer', 'you'); sorcerer.sick = false;
  const victim = mk('grizzly_bears', 'opp');
  G.you.battlefield.push(mage, sorcerer); G.opp.battlefield.push(victim);
  const oppLife0 = G.opp.life;
  ENGINE.executeAction('you', { type: 'activateAbility', cardIid: sorcerer.iid, abilityIdx: 0,
    targets: [{ kind: 'creature', iid: victim.iid, label: victim.name }] });
  drain(G);
  check('opponent lost 1 to Backlash Mage', G.opp.life === oppLife0 - 1,
    oppLife0 + ' -> ' + G.opp.life);
})();

console.log('\n=== scrap: destroys artifacts, refuses non-artifacts ===');
(() => {
  const G = freshGame();
  const golem = mk('copper_golem', 'opp');
  const bear = mk('grizzly_bears', 'opp');
  G.opp.battlefield.push(golem, bear);
  const r1 = cast(G, 'scrap', [{ kind: 'permanent', iid: golem.iid, label: golem.name }]);
  check('cast at the artifact executed', r1.ok === true);
  check('artifact destroyed', !G.opp.battlefield.some(c => c.iid === golem.iid));
  const r2 = cast(G, 'scrap', [{ kind: 'permanent', iid: bear.iid, label: bear.name }]);
  check('cast at a non-artifact is ILLEGAL', r2.ok !== true);
  check('bear survives', G.opp.battlefield.some(c => c.iid === bear.iid));
})();

console.log('\n=== vanishing_act: blink re-fires the ETB ===');
(() => {
  const G = freshGame();
  const pinger = mk('pyromaniac', 'you');
  const target = mk('grizzly_bears', 'opp');
  G.you.battlefield.push(pinger); G.opp.battlefield.push(target);
  cast(G, 'vanishing_act', [{ kind: 'creature', iid: pinger.iid, label: pinger.name }]);
  const back = G.you.battlefield.find(c => c.tplId === 'pyromaniac');
  check('pyromaniac is back on the battlefield', !!back);
  check('its ETB ping re-fired (something took 1)',
    target.damage === 1 || G.opp.life === 19 || (back && back.damage === 1),
    'tgt=' + target.damage + ' oppLife=' + G.opp.life);
})();

console.log('\n=== strategic_retreat: bounce your creature + draw ===');
(() => {
  const G = freshGame();
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(bear);
  G.you.library = [mk('forest', 'you')];
  const hand0 = G.you.hand.length;
  cast(G, 'strategic_retreat', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  check('bear returned to hand', G.you.hand.some(c => c.iid === bear.iid));
  check('drew a card (net +2: bear + draw, spell left)',
    G.you.hand.length === hand0 + 2, hand0 + ' -> ' + G.you.hand.length);
})();

console.log('\n=== updraft / chrysalis_ward / second_wind: the trick suite ===');
(() => {
  const G = freshGame();
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(bear);
  cast(G, 'updraft', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  check('updraft: flying granted', bear.keywords.includes('flying'));
  cast(G, 'chrysalis_ward', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  const s = ENGINE.getStats(bear);
  check('chrysalis: hexproof granted', bear.keywords.includes('hexproof'));
  check('chrysalis: +0/+1 (2/3)', s[0] === 2 && s[1] === 3, s.join('/'));
  bear.tapped = true;
  cast(G, 'second_wind', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  check('second_wind: untapped', bear.tapped === false);
  check('second_wind: vigilance granted', bear.keywords.includes('vigilance'));
})();

console.log('\n=== rescue_angel: your cast grants a flier (sole target auto-fills) ===');
(() => {
  const G = freshGame();
  const angel = mk('rescue_angel', 'you');
  G.you.battlefield.push(angel);
  check('Angel flies by subtype (no keywords entry)',
    (ENGINE.addSubtypeKeywords(angel.types, (angel.keywords || []).slice())).includes('flying'));
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(bear);
  cast(G, 'giant_growth', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  check('cast -> a creature you control gained flying',
    bear.keywords.includes('flying') || angel.keywords.includes('flying'),
    JSON.stringify([bear.keywords, angel.keywords]));
})();

console.log('\n=== rider cards (real): one end-to-end probe each ===');
(() => {
  const G = freshGame();
  const tender = mk('sapling_tender', 'you');
  const bear = mk('grizzly_bears', 'you');
  G.you.battlefield.push(tender, bear);
  cast(G, 'giant_growth', [{ kind: 'creature', iid: bear.iid, label: bear.name }]);
  const s = ENGINE.getStats(bear);
  check('sapling_tender: growth target = 2+3+1 / 2+3+1', s[0] === 6 && s[1] === 6, s.join('/'));

  const G2 = freshGame();
  G2.you.battlefield.push(mk('primal_metamagus', 'you'));
  const oppLife = G2.opp.life;
  cast(G2, 'lightning_bolt', [{ kind: 'player', who: 'opp', label: 'Opponent' }]);
  check('primal_metamagus: bolt face = 3+1', G2.opp.life === oppLife - 4,
    oppLife + ' -> ' + G2.opp.life);

  const G3 = freshGame();
  G3.you.battlefield.push(mk('vigil_chanter', 'you'));
  const bear3 = mk('grizzly_bears', 'you');
  G3.you.battlefield.push(bear3);
  cast(G3, 'giant_growth', [{ kind: 'creature', iid: bear3.iid, label: bear3.name }]);
  check('vigil_chanter: growth target gained vigilance', bear3.keywords.includes('vigilance'));

  const G4 = freshGame();
  const colossus = mk('wildfire_colossus', 'you');
  G4.you.battlefield.push(colossus);
  cast(G4, 'lightning_bolt', [{ kind: 'player', who: 'opp', label: 'Opponent' }]);
  const cs = ENGINE.getStats(colossus);
  check('wildfire_colossus: damage sorcery -> 3/4', cs[0] === 3 && cs[1] === 4, cs.join('/'));
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
