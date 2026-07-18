// AUDIT BUG PROOFS — born 2026-07-17 as deliberately-failing demonstrations
// of vibecode-audit findings (each proof asserts the CORRECT behavior, so a
// FAIL meant "bug confirmed"). The batch-I fixes (v2.2.36) flipped them
// green; the file is now registered in run_all.js as the regression pin for
// that bug class. A CONFIRMED result here means a fixed bug came back.
const setup = require('./_setup');
setup.loadEngine();

let confirmed = 0, absent = 0, errored = 0;
function proof(id, gameClaim, fn) {
  try {
    const r = fn();
    if (r.ok) { absent++; console.log('[' + id + '] NOT CONFIRMED (behavior already correct) — ' + gameClaim); }
    else { confirmed++; console.log('[' + id + '] BUG CONFIRMED — ' + gameClaim); }
    if (r.info) console.log('        evidence: ' + r.info);
  } catch (e) {
    errored++;
    console.log('[' + id + '] PROOF ERROR — ' + gameClaim + '\n        ' + e.message);
  }
}

proof('R32/R53',
  'A sticker-rolled Dragon has flying from the moment it is built (build path must agree with the re-derive path)',
  () => {
    const card = ENGINE.makeCard('bear_cub', ['subtype'], 0, undefined, undefined, undefined, ['Dragon']);
    const built = (card.keywords || []).includes('flying');
    const derived = ENGINE.intrinsicKeywords(card).includes('flying');
    return {
      ok: built && built === derived,
      info: 'keywords at build: [' + (card.keywords || []).join(',') + '] | intrinsicKeywords (what the card becomes after any grant strips/leave-play reset): [' + ENGINE.intrinsicKeywords(card).join(',') + ']',
    };
  });

proof('A14',
  'Stapling a Swamp onto Mercurial Adept shows the added mana ability in the merged card text',
  () => {
    const merged = ENGINE.synthesizeStapledTemplate('mercurial_adept', ['swamp']);
    const text = describeCardText(merged);
    const controlText = describeCardText(ENGINE.synthesizeStapledTemplate('bear_cub', ['swamp']));
    return {
      ok: /add \{B\}/i.test(text),
      info: 'mercurial_adept+swamp text: "' + String(text).slice(0, 100) + '..." | control bear_cub+swamp mentions add {B}: ' + /add \{B\}/i.test(controlText),
    };
  });

proof('N7',
  "Card text renders the live target value 'permanent_or_spell' as English, never the raw key",
  () => {
    const out = targetPhrase({ target: 'permanent_or_spell' });
    return {
      ok: typeof out === 'string' && out.length > 0 && !out.includes('_'),
      info: "targetPhrase({target:'permanent_or_spell'}) = \"" + out + '"',
    };
  });

proof('A12/A13',
  "The opponent's sticker-burst odds derive from the player reward weights (single source, cannot drift)",
  () => {
    const src = setup.getSource();
    const i = src.indexOf('const burstRoll');
    if (i < 0) throw new Error('burst-roll site not found in source');
    const region = src.slice(Math.max(0, i - 600), i + 200);
    const derived = /REWARD_TYPE_WEIGHTS\.sticker/.test(region)
      && /REWARD_TYPE_WEIGHTS\.threeStickersBlind/.test(region)
      && !/Math\.random\(\)\s*\*\s*\d/.test(region);
    return {
      ok: derived,
      info: derived
        ? 'burst odds read REWARD_TYPE_WEIGHTS at roll time — no literals to drift'
        : 'burst-roll site still carries hand-copied literals instead of reading REWARD_TYPE_WEIGHTS',
    };
  });

proof('R60/R61',
  "Selfplay bughunt's multicolor-land stress setup actually applies its land-color stickers (harness writes registry ids since v2.2.36)",
  () => {
    RUN.start({ cards: ['plains', 'plains', 'bear_cub', 'bear_cub'], colors: ['W'], mode: 'classic' }, null);
    const slots = RUN.getSlots();
    const li = slots.findIndex(s => s.tplId === 'plains');
    if (li < 0) throw new Error('no plains slot after RUN.start');
    const before = (RUN.getSlots()[li].stickers || []).length;
    RUN.applyStickerToSlot(li, 'land_color_' + 'U'.toLowerCase());  // the id the harness now builds
    const afterCanonical = (RUN.getSlots()[li].stickers || []).length;
    RUN.applyStickerToSlot(li, 'landColor_B');                       // the retired camelCase form must stay dead
    const afterLegacy = (RUN.getSlots()[li].stickers || []).length;
    return {
      ok: afterCanonical - before === 1 && afterLegacy === afterCanonical,
      info: "canonical 'land_color_u' applied: " + (afterCanonical - before) + " | retired 'landColor_B' applied: " + (afterLegacy - afterCanonical),
    };
  });

console.log('---');
console.log('PROOF SUMMARY: ' + confirmed + ' bug(s) confirmed, ' + absent + ' not confirmed, ' + errored + ' proof error(s)');
console.log('\n=== TOTAL: ' + absent + ' passed, ' + (confirmed + errored) + ' failed ===');
process.exit(confirmed === 0 && errored === 0 ? 0 : 1);  // regression pin since v2.2.36
