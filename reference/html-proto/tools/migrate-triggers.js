// Migrate proto card triggers from the monolithic condId format to the
// composable `condition` format (Slice 2 / DIVERGENCE E2).
//
//   node tools/migrate-triggers.js          # rewrite cards/<id>/card.json in place
//   node tools/migrate-triggers.js --dry    # report what would change, write nothing
//
// For each trigger: map cond_id -> {event, condition[]} per the decomposition
// table (plan-zone-change-and-composable-predicates.md §2), substitute the
// subtype param into card_has_subtype(...), and drop cond_id/params/self_only.
// Idempotent: a trigger with no cond_id is left untouched.

const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '..', 'cards');
const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');

// cond_id -> { event, cond:[...] }. The literal '__SUBTYPE__' placeholder is
// replaced with card_has_subtype(<params.sub>) at migration time.
const MIGRATION = {
  thisEnters:                        { event: 'card_zone_change', cond: ['this_card', 'card_moves(anywhere, battlefield)'] },
  // DELIBERATE ASYMMETRY (do not "fix" by adding card_is_creature to OfSubtype):
  // kindred/tribal in this project is type-agnostic — an "Artifact - Goblin" IS a
  // Goblin and SHOULD fire a "whenever a Goblin enters" trigger. The Strict
  // variant has no subtype filter, so it needs card_is_creature to scope itself;
  // the OfSubtype variant is already scoped by card_has_subtype(...), which is the
  // intended gate. Narrowing it to creatures would silently break non-creature
  // tribal cards.
  anotherCreatureYouEntersStrict:    { event: 'card_zone_change', cond: ['another_card', 'card_is_creature', 'controlled_by(you)', 'card_moves(anywhere, battlefield)'] },
  anotherCreatureYouEntersOfSubtype: { event: 'card_zone_change', cond: ['another_card', 'controlled_by(you)', '__SUBTYPE__', 'card_moves(anywhere, battlefield)'] },
  thisAttacks:                       { event: 'attacks', cond: ['this_card'] },
  thisAttacksAfterOppLifeLoss:       { event: 'attacks', cond: ['this_card', 'lost_life_this_turn(opp)'] },
  creatureYouAttacksOfSubtype:       { event: 'attacks', cond: ['controlled_by(you)', '__SUBTYPE__'] },
  thisDies:                          { event: 'card_zone_change', cond: ['this_card', 'card_moves(battlefield, graveyard)'] },
  thisLeaves:                        { event: 'card_zone_change', cond: ['this_card', 'card_moves(battlefield, anywhere)'] },
  anotherCreatureDies:               { event: 'card_zone_change', cond: ['another_card', 'card_is_creature', 'card_moves(battlefield, graveyard)'] },
  anyCardDies:                       { event: 'card_zone_change', cond: ['card_is_creature', 'card_moves(battlefield, graveyard)'] },
  thisKillsCreature:                 { event: 'card_zone_change', cond: ['another_card', 'card_is_creature', 'card_moves(battlefield, graveyard)', 'card_damaged_by_this'] },
  youGainLife:                       { event: 'life_changed', cond: ['is_life_gain', 'affected_player_is(you)'] },
  youCastSpell:                      { event: 'spell_cast', cond: ['another_card', 'controlled_by(you)'] },
  youCastCounterspell:               { event: 'spell_cast', cond: ['another_card', 'controlled_by(you)', 'card_has_effect(counter)'] },
};

// Quote a subtype arg only if it contains whitespace/comma/paren (the parser
// reserves those). Single-word subtypes stay bare.
function quoteArg(s) {
  return /[\s,()]/.test(s) ? '"' + s + '"' : s;
}

// Build the composable condition list from a legacy trigger.
function migrateTrigger(trig, tplId) {
  const m = MIGRATION[trig.cond_id];
  if (!m) {
    console.warn(`  ${tplId}: unknown cond_id '${trig.cond_id}' — left unchanged`);
    return null;
  }
  const cond = m.cond.map((term) => {
    if (term !== '__SUBTYPE__') return term;
    const sub = trig.params && trig.params.sub;
    if (!sub) { console.warn(`  ${tplId}: ${trig.cond_id} missing params.sub`); return 'card_has_subtype()'; }
    return 'card_has_subtype(' + quoteArg(sub) + ')';
  });
  // Rebuild with event + condition first, preserving the trigger's other keys
  // (text, effects, ...); drop the legacy fields.
  const out = { event: m.event, condition: cond };
  for (const [k, v] of Object.entries(trig)) {
    if (['event', 'cond_id', 'params', 'self_only', 'condition'].includes(k)) continue;
    out[k] = v;
  }
  return out;
}

let filesChanged = 0, triggersMigrated = 0, filesScanned = 0;
const manifest = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, '_manifest.json'), 'utf8'));

for (const folderId of manifest) {
  const file = path.join(CARDS_DIR, folderId, 'card.json');
  if (!fs.existsSync(file)) continue;
  filesScanned++;
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(card.triggers) || card.triggers.length === 0) continue;

  let changed = false;
  card.triggers = card.triggers.map((trig) => {
    if (!trig || !trig.cond_id) return trig;   // idempotent: already migrated / unconditional
    const migrated = migrateTrigger(trig, card.card_id || folderId);
    if (migrated) { changed = true; triggersMigrated++; return migrated; }
    return trig;
  });

  if (changed) {
    filesChanged++;
    if (!DRY) fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
  }
}

console.log(`${DRY ? '[dry-run] ' : ''}Scanned ${filesScanned} cards; migrated ${triggersMigrated} triggers across ${filesChanged} files.`);
