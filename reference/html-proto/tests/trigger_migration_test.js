// condId -> composable `condition` migration. This test's invariants:
//   1. Every known trigger archetype is present and classifiable, and no
//      trigger is unclassified (catches a dropped/mis-mapped condition).
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

// The test reads the LIVE archetype table and signature function from
// triggers.js, not a hand-copied snapshot: a row dropped from
// _ARCHETYPE_BY_SIG leaves its cards unclassified (check below fails); a
// stale row whose cards all vanished fails the presence check. Two anchor
// pins guard the degenerate case of the table itself being wiped.
const condSig = (event, cond) => (Array.isArray(cond) ? _condSignature(event, cond) : null);
const ARCHETYPES = _ARCHETYPE_BY_SIG;
check('anchor: live table classifies thisEnters',
  ARCHETYPES['card_zone_change | this_card, card_moves(anywhere, battlefield)'] === 'thisEnters');
check('anchor: live table classifies thisDies',
  ARCHETYPES['card_zone_change | this_card, card_moves(battlefield, graveyard)'] === 'thisDies');

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

console.log('\n=== representative migrated cards fire correctly ===');
(() => {
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

  // e.g. drakelord/Drake.
  const lord = cardWithSig('card_zone_change | another_card, controlled_by(you), card_has_subtype(*), card_moves(anywhere, battlefield)');
  if (lord) {
    const subTerm = lord.trig.condition.find((t) => typeof t === 'string' && t.startsWith('card_has_subtype('));
    const sub = subTerm.slice('card_has_subtype('.length, -1).replace(/^"|"$/g, '');
    const yesEvt = { subject_card: { iid: 2, types: ['Creature'].concat(String(sub||'').split(/\s+/).filter(Boolean)) }, controller: 'you', from_zone: 'hand', to_zone: 'battlefield' };
    const noEvt = { subject_card: { iid: 2, types: ['Creature', 'SomethingElse'] }, controller: 'you', from_zone: 'hand', to_zone: 'battlefield' };
    check(`${lord.card.tplId}: fires on ${sub} ETB`, evalFor(lord, yesEvt, 'you') === true);
    check(`${lord.card.tplId}: silent on non-${sub} ETB`, evalFor(lord, noEvt, 'you') === false);
  } else check('subtype-enters lord present', false);

  const dies = cardWithSig('card_zone_change | this_card, card_moves(battlefield, graveyard)');
  if (dies) {
    const diesEvt = { subject_card: { iid: 1, types: ['Creature'] }, from_zone: 'battlefield', to_zone: 'graveyard' };
    const bounceEvt = { subject_card: { iid: 1, types: ['Creature'] }, from_zone: 'battlefield', to_zone: 'hand' };
    check(`${dies.card.tplId}: fires on own death`, evalFor(dies, diesEvt, 'you') === true);
    check(`${dies.card.tplId}: silent on own bounce`, evalFor(dies, bounceEvt, 'you') === false);
  } else check('thisDies card present', false);

  const counter = cardWithSig('spell_cast | another_card, controlled_by(you), card_has_effect(counter)');
  if (counter) {
    const yes = { subject_card: { iid: 2, effects: [{ kind: 'counter' }] }, controller: 'you' };
    const no = { subject_card: { iid: 2, effects: [{ kind: 'damage' }] }, controller: 'you' };
    check(`${counter.card.tplId}: fires on your counterspell`, evalFor(counter, yes, 'you') === true);
    check(`${counter.card.tplId}: silent on your damage spell`, evalFor(counter, no, 'you') === false);
  } else check('youCastCounterspell card present', false);

  // Blood Artist shape: creature-only by design, not all permanents dying.
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

console.log('\n=== triggerArchetype classification + preamble recovery ===');
(() => {
  check('classifies composable thisDies',
    triggerArchetype({ event: 'card_zone_change', condition: ['this_card', 'card_moves(battlefield, graveyard)'] }) === 'thisDies');
  check('classifies composable subtype-attacks',
    triggerArchetype({ event: 'attacks', condition: ['controlled_by(you)', 'card_has_subtype(Goblin)'] }) === 'creatureYouAttacksOfSubtype');
  check('unknown shape classifies to null', triggerArchetype({ event: 'attacks', condition: ['bogus'] }) === null);
  check('triggerSubtype extracts subtype',
    triggerSubtype({ condition: ['controlled_by(you)', 'card_has_subtype(Goblin)'] }) === 'Goblin');

  const generic = [];
  for (const card of Object.values(CARDS)) {
    for (const trig of (card.triggers || [])) {
      const pre = triggerPreamble(trig);
      if (pre === 'Whenever a relevant event occurs,') generic.push(card.tplId);
    }
  }
  check('no migrated card renders the generic preamble fallback', generic.length === 0, generic.join(', '));

  function preambleOf(tplId) {
    const c = CARDS[tplId]; if (!c || !c.triggers || !c.triggers[0]) return null;
    return triggerPreamble(c.triggers[0]);
  }
  if (CARDS.skyfire_drakelord) check('drakelord preamble names its subtype',
    /another Dragon enters under your control/.test(preambleOf('skyfire_drakelord')), preambleOf('skyfire_drakelord'));
  if (CARDS.goblin_chieftain) check('goblinChieftain preamble names its subtype',
    /Goblin you control attacks/.test(preambleOf('goblin_chieftain')), preambleOf('goblin_chieftain'));

  // AI ETB-detection (flicker / flash valuation) relies on triggerFiresOnEnter.
  check('triggerFiresOnEnter: thisEnters (composable)',
    triggerFiresOnEnter({ event: 'card_zone_change', condition: ['this_card', 'card_moves(anywhere, battlefield)'] }) === true);
  check('triggerFiresOnEnter: subtype-enters lord',
    triggerFiresOnEnter({ event: 'card_zone_change', condition: ['another_card', 'controlled_by(you)', 'card_has_subtype(Dragon)', 'card_moves(anywhere, battlefield)'] }) === true);
  check('triggerFiresOnEnter: dies is NOT an enter',
    triggerFiresOnEnter({ event: 'card_zone_change', condition: ['this_card', 'card_moves(battlefield, graveyard)'] }) === false);
  check('triggerFiresOnEnter: attacks is NOT an enter',
    triggerFiresOnEnter({ event: 'attacks', condition: ['this_card'] }) === false);
  let etbCards = 0;
  for (const card of Object.values(CARDS)) {
    if ((card.triggers || []).some(triggerFiresOnEnter)) etbCards++;
  }
  check('migrated pool: ETB-trigger cards detected (was 47 ETB triggers)', etbCards >= 40, `got ${etbCards}`);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
