const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// --- A10-1: picker labels ARE the oracle, never a hand-rolled duplicate ---
console.log('=== A10-1: abilityPickerLabel === the engine oracle (no lying table) ===');
(() => {
  const RAW_KIND = /\b(affect_creature|add_type|set_types|move_card|add_mana|apply_in_game_splice|returnFromGraveyard|grant_keyword)\b/;
  let abilityCount = 0; const mismatches = []; const rawLeaks = [];
  for (const tplId of Object.keys(CARDS)) {
    for (const ab of (CARDS[tplId].abilities || [])) {
      abilityCount++;
      // Mirror the helper exactly so this catches any future divergence.
      let oracle; try { oracle = segsToText(describeAbility(ab, ab)); } catch (_) { oracle = ''; }
      if (!oracle) oracle = 'Activate ability';
      const expected = oracle.length > 60 ? oracle.slice(0, 59).trimEnd() + '…' : oracle;
      const got = abilityPickerLabel(ab);
      if (got !== expected) mismatches.push(tplId + ': "' + got + '" != "' + expected + '"');
      if (RAW_KIND.test(got)) rawLeaks.push(tplId + ': "' + got + '"');
    }
  }
  check('pool has activated abilities to check', abilityCount > 0, 'count=' + abilityCount);
  check('every picker label IS its capped oracle text', mismatches.length === 0, mismatches.slice(0, 4).join(' | '));
  check('no picker label leaks a raw effect-kind token', rawLeaks.length === 0, rawLeaks.slice(0, 4).join(' | '));

  // carrion_feeder's self-pump is a permanent +1/+1 counter, not an EOT buff.
  const cfAb = CARDS['carrion_feeder'].abilities[0];
  const cfLabel = abilityPickerLabel(cfAb);
  check('carrion_feeder label is the oracle, non-empty', cfLabel === segsToText(describeAbility(cfAb, cfAb)) && cfLabel.length > 0, cfLabel);
  check('carrion_feeder label drops the old "EOT" lie (permanent counter)', !/EOT/i.test(cfLabel), cfLabel);
})();

// --- A10-3: ~ never reaches a player; substitution is global ---
console.log('\n=== A10-3: formatTriggerText substitutes ~ -> card name (every consumer) ===');
(() => {
  check('single ~ replaced', formatTriggerText('~ attacks', 'Goblin Raider') === 'Goblin Raider attacks', formatTriggerText('~ attacks', 'Goblin Raider'));
  check('all ~ replaced (global)', formatTriggerText('~ fights ~', 'Bob') === 'Bob fights Bob');
  check('no ~ -> text unchanged', formatTriggerText('deals 1 damage', 'X') === 'deals 1 damage');
  check('empty name -> ~ removed, not left raw', formatTriggerText('~ enters', '') === ' enters');

  // The reachable face leak: the Mercurial Adept's authored face carries ~
  // twice. describeCardText (the real render path) must show the name, not ~.
  const adept = Object.assign({}, CARDS['mercurial_adept'], { tplId: 'mercurial_adept' });
  const face = describeCardText(adept);
  check('Mercurial Adept face shows the card name', /Mercurial/.test(face), face);
  check('Mercurial Adept face has NO raw ~ leak', !face.includes('~'), face);
})();

// --- A10-4: add_type/set_types scope:'self' has the subject "this" ---
console.log('\n=== A10-4: add_type/set_types scope:self subject is "this" (no empty subject) ===');
(() => {
  const addSelf = segsToText(describeEffect({ kind: 'add_type', scope: 'self', types: ['Artifact'] }));
  check('add_type scope:self -> "this also becomes ..."', addSelf.startsWith('this also becomes'), addSelf);
  const setSelf = segsToText(describeEffect({ kind: 'set_types', scope: 'self', types: ['Artifact'] }));
  check('set_types scope:self -> "this becomes ..."', setSelf.startsWith('this becomes'), setSelf);
  check('no empty-subject leading space (the A10-4 bug)', !addSelf.startsWith(' ') && !setSelf.startsWith(' '), JSON.stringify([addSelf, setSelf]));
  const addTgt = segsToText(describeEffect({ kind: 'add_type', target: 'creature', types: ['Artifact'] }));
  check('targeted add_type keeps its target subject (not "this")', !addTgt.startsWith('this') && addTgt.length > 0, addTgt);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
