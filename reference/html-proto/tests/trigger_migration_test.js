// condId -> composable `condition` migration (Slice 2 / E2, step 6). The
// migration is long done; the ONGOING invariants it established are what earn
// this test's keep:
//   1. Every known trigger archetype is still PRESENT and classifiable, and no
//      trigger is unclassified (catches a dropped/mis-mapped condition). The
//      pre-migration EXACT counts were removed — they were a calcified snapshot
//      that broke every time a triggered card was added, for no bug caught.
//   2. No legacy cond_id / params / self_only survives on any trigger.
//   3. Representative real cards evaluate correctly (fire on the positive
//      scenario, stay silent on the negative) via the composable evaluator.
//   4. condId consumers (card-text preambles, AI ETB-detection) recover via
//      triggerArchetype.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// Collapse a condition list to a comparable signature: card_has_subtype(X) ->
// card_has_subtype(*) so the three subtype lords group regardless of subtype.
function condSig(event, cond) {
  if (!Array.isArray(cond)) return null;
  const terms = cond.map((t) =>
    (typeof t === 'string' ? t.replace(/card_has_subtype\([^)]*\)/, 'card_has_subtype(*)') : JSON.stringify(t)));
  return event + ' | ' + terms.join(', ');
}

// The known trigger archetypes (signature -> archetype name). Each must still be
// PRESENT in the pool; the migration's real invariant is "no archetype was
// dropped or mis-mapped, and nothing is unclassified" — NOT the exact per-
// archetype card count (which moves every time a triggered card is added).
const ARCHETYPES = {
  'card_zone_change | this_card, card_moves(anywhere, battlefield)': 'thisEnters',
  'card_zone_change | another_card, card_is_creature, controlled_by(you), card_moves(anywhere, battlefield)': 'anotherCreatureYouEntersStrict',
  'card_zone_change | another_card, card_is_creature, controlled_by(you), card_has_subtype(*), card_moves(anywhere, battlefield)': 'anotherCreatureYouEntersOfSubtype',
  'attacks | this_card': 'thisAttacks',
  'attacks | this_card, lost_life_this_turn(opp)': 'thisAttacksAfterOppLifeLoss',
  'attacks | controlled_by(you), card_has_subtype(*)': 'creatureYouAttacksOfSubtype',
  'card_zone_change | this_card, card_moves(battlefield, graveyard)': 'thisDies',
  'card_zone_change | this_card, card_moves(battlefield, anywhere)': 'thisLeaves',
  'card_zone_change | another_card, card_is_creature, card_moves(battlefield, graveyard)': 'anotherCreatureDies',
  'card_zone_change | card_is_creature, card_moves(battlefield, graveyard)': 'anyCardDies',
  'card_zone_change | another_card, card_is_creature, card_moves(battlefield, graveyard), card_damaged_by_this': 'thisKillsCreature',
  'life_changed | is_life_gain, affected_player_is(you)': 'youGainLife',
  'spell_cast | another_card, controlled_by(you)': 'youCastSpell',
  'spell_cast | another_card, controlled_by(you), card_has_effect(counter)': 'youCastCounterspell',
};

// ── 1. Every archetype present + nothing unclassified ────────────────────
console.log('=== every known archetype present, no trigger unclassified ===');
(() => {
  const counts = {};
  let unclassified = 0;
  for (const card of Object.values(CARDS)) {
    for (const trig of (card.triggers || [])) {
      const sig = condSig(trig.event, trig.condition);
      if (sig && ARCHETYPES[sig]) counts[sig] = (counts[sig] || 0) + 1;
      else { unclassified++; console.log('    unclassified trigger on', card.tplId, ':', sig); }
    }
  }
  for (const [sig, name] of Object.entries(ARCHETYPES)) {
    check(`${name}: present`, (counts[sig] || 0) >= 1, `got ${counts[sig] || 0}`);
  }
  check('every trigger classifies to a known archetype (0 unclassified)', unclassified === 0, `${unclassified} unclassified`);
})();

// ── 2. No legacy trigger fields survive ──────────────────────────────────
console.log('\n=== no legacy cond_id / params / self_only on any trigger ===');
(() => {
  const offenders = [];
  for (const card of Object.values(CARDS)) {
    for (const trig of (card.triggers || [])) {
      // ingestCard rebinds cond_id -> condId; both must be gone.
      for (const legacy of ['cond_id', 'condId', 'params', 'self_only']) {
        if (Object.prototype.hasOwnProperty.call(trig, legacy)) offenders.push(`${card.tplId}.${legacy}`);
      }
    }
  }
  check('no legacy fields remain', offenders.length === 0, offenders.join(', '));
})();

// ── 3. Representative real cards evaluate correctly ──────────────────────
console.log('\n=== representative migrated cards fire correctly ===');
(() => {
  // Helper: find one card whose trigger matches a signature.
  function cardWithSig(sig) {
    for (const card of Object.values(CARDS)) {
      for (const trig of (card.triggers || [])) {
        if (condSig(trig.event, trig.condition) === sig) return { card, trig };
      }
    }
    return null;
  }
  function evalFor(found, event, who) {
    const source = { iid: 1, name: found.card.name };
    return evaluateCondition(found.trig.condition, { state: S(), source, event, who });
  }
  function S() { return { you: { lifeLostThisTurn: 0 }, opp: { lifeLostThisTurn: 0 } }; }

  // Subtype-enters lord (e.g. drakelord/Drake). Fires when another creature of
  // its subtype enters under your control; not on a non-subtype creature.
  const lord = cardWithSig('card_zone_change | another_card, card_is_creature, controlled_by(you), card_has_subtype(*), card_moves(anywhere, battlefield)');
  if (lord) {
    const subTerm = lord.trig.condition.find((t) => typeof t === 'string' && t.startsWith('card_has_subtype('));
    const sub = subTerm.slice('card_has_subtype('.length, -1).replace(/^"|"$/g, '');
    const yesEvt = { subject_card: { iid: 2, types: ['Creature'].concat(String(sub||'').split(/\s+/).filter(Boolean)) }, controller: 'you', from_zone: 'hand', to_zone: 'battlefield' };
    const noEvt = { subject_card: { iid: 2, types: ['Creature', 'SomethingElse'] }, controller: 'you', from_zone: 'hand', to_zone: 'battlefield' };
    check(`${lord.card.tplId}: fires on ${sub} ETB`, evalFor(lord, yesEvt, 'you') === true);
    check(`${lord.card.tplId}: silent on non-${sub} ETB`, evalFor(lord, noEvt, 'you') === false);
  } else check('subtype-enters lord present', false);

  // thisDies: fires when THIS card moves battlefield->graveyard; not on bounce.
  const dies = cardWithSig('card_zone_change | this_card, card_moves(battlefield, graveyard)');
  if (dies) {
    const diesEvt = { subject_card: { iid: 1, types: ['Creature'] }, from_zone: 'battlefield', to_zone: 'graveyard' };
    const bounceEvt = { subject_card: { iid: 1, types: ['Creature'] }, from_zone: 'battlefield', to_zone: 'hand' };
    check(`${dies.card.tplId}: fires on own death`, evalFor(dies, diesEvt, 'you') === true);
    check(`${dies.card.tplId}: silent on own bounce`, evalFor(dies, bounceEvt, 'you') === false);
  } else check('thisDies card present', false);

  // youCastCounterspell: another spell you control with a counter effect.
  const counter = cardWithSig('spell_cast | another_card, controlled_by(you), card_has_effect(counter)');
  if (counter) {
    const yes = { subject_card: { iid: 2, effects: [{ kind: 'counter' }] }, controller: 'you' };
    const no = { subject_card: { iid: 2, effects: [{ kind: 'damage' }] }, controller: 'you' };
    check(`${counter.card.tplId}: fires on your counterspell`, evalFor(counter, yes, 'you') === true);
    check(`${counter.card.tplId}: silent on your damage spell`, evalFor(counter, no, 'you') === false);
  } else check('youCastCounterspell card present', false);

  // anyCardDies (Blood Artist shape): fires on ANY creature death incl. self,
  // but NOT on non-creature permanents (the legacy cardDies emit was
  // creature-only -- a faithfulness fix over the plan's bare decomposition).
  const anyDies = cardWithSig('card_zone_change | card_is_creature, card_moves(battlefield, graveyard)');
  if (anyDies) {
    const selfDeath = { subject_card: { iid: 1, types: ['Creature'] }, from_zone: 'battlefield', to_zone: 'graveyard' };
    const otherDeath = { subject_card: { iid: 99, types: ['Creature'] }, from_zone: 'battlefield', to_zone: 'graveyard' };
    const landDeath = { subject_card: { iid: 99, types: ['Land'] }, from_zone: 'battlefield', to_zone: 'graveyard' };
    check(`${anyDies.card.tplId}: fires on own creature death`, evalFor(anyDies, selfDeath, 'you') === true);
    check(`${anyDies.card.tplId}: fires on another creature's death`, evalFor(anyDies, otherDeath, 'you') === true);
    check(`${anyDies.card.tplId}: silent on a non-creature death`, evalFor(anyDies, landDeath, 'you') === false);
  } else check('anyCardDies card present', false);
})();

// ── 4. condId consumers recover via triggerArchetype ─────────────────────
// card-text preambles and AI trigger-frequency valuation used to read condId;
// post-migration they classify via triggerArchetype. Verify the classifier
// and that no migrated card renders the generic "relevant event" fallback.
console.log('\n=== triggerArchetype classification + preamble recovery ===');
(() => {
  // Composable trigger classifies back to its archetype id.
  check('classifies composable thisDies',
    triggerArchetype({ event: 'card_zone_change', condition: ['this_card', 'card_moves(battlefield, graveyard)'] }) === 'thisDies');
  check('classifies composable subtype-attacks',
    triggerArchetype({ event: 'attacks', condition: ['controlled_by(you)', 'card_has_subtype(Goblin)'] }) === 'creatureYouAttacksOfSubtype');
  check('unknown shape classifies to null', triggerArchetype({ event: 'attacks', condition: ['bogus'] }) === null);
  check('triggerSubtype extracts subtype',
    triggerSubtype({ condition: ['controlled_by(you)', 'card_has_subtype(Goblin)'] }) === 'Goblin');

  // No migrated card falls through to the generic preamble.
  const generic = [];
  for (const card of Object.values(CARDS)) {
    for (const trig of (card.triggers || [])) {
      const pre = triggerPreamble(trig);
      if (pre === 'Whenever a relevant event occurs,') generic.push(card.tplId);
    }
  }
  check('no migrated card renders the generic preamble fallback', generic.length === 0, generic.join(', '));

  // Spot-check a couple of real preambles.
  function preambleOf(tplId) {
    const c = CARDS[tplId]; if (!c || !c.triggers || !c.triggers[0]) return null;
    return triggerPreamble(c.triggers[0]);
  }
  if (CARDS.skyfire_drakelord) check('drakelord preamble names its subtype',
    /another Drake enters under your control/.test(preambleOf('skyfire_drakelord')), preambleOf('skyfire_drakelord'));
  if (CARDS.goblin_chieftain) check('goblinChieftain preamble names its subtype',
    /Goblin you control attacks/.test(preambleOf('goblin_chieftain')), preambleOf('goblin_chieftain'));

  // AI ETB-detection (flicker / flash valuation) must still recognize migrated
  // ETB triggers, which now live on card_zone_change, not cardEntersBattlefield.
  check('triggerFiresOnEnter: thisEnters (composable)',
    triggerFiresOnEnter({ event: 'card_zone_change', condition: ['this_card', 'card_moves(anywhere, battlefield)'] }) === true);
  check('triggerFiresOnEnter: subtype-enters lord',
    triggerFiresOnEnter({ event: 'card_zone_change', condition: ['another_card', 'controlled_by(you)', 'card_has_subtype(Drake)', 'card_moves(anywhere, battlefield)'] }) === true);
  check('triggerFiresOnEnter: dies is NOT an enter',
    triggerFiresOnEnter({ event: 'card_zone_change', condition: ['this_card', 'card_moves(battlefield, graveyard)'] }) === false);
  check('triggerFiresOnEnter: attacks is NOT an enter',
    triggerFiresOnEnter({ event: 'attacks', condition: ['this_card'] }) === false);
  // At least one real migrated card is detected as an ETB-trigger card.
  let etbCards = 0;
  for (const card of Object.values(CARDS)) {
    if ((card.triggers || []).some(triggerFiresOnEnter)) etbCards++;
  }
  check('migrated pool: ETB-trigger cards detected (was 47 ETB triggers)', etbCards >= 40, `got ${etbCards}`);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
