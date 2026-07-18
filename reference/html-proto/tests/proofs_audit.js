// AUDIT BUG PROOFS — deliberately-failing demonstrations of findings from the
// 2026-07-17 vibecode audit. NOT registered in run_all.js CATEGORY_A: each
// proof asserts the CORRECT behavior, so on current code a FAIL means "bug
// confirmed exactly as the finding claims." Each proof joins the suite as a
// regression pin only in the commit that fixes its finding (flipping green).
// Run standalone: node tests/proofs_audit.js
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
  "The opponent's sticker-burst odds mirror the player reward weights they claim to mirror",
  () => {
    const src = setup.getSource();
    const pm = src.match(/REWARD_TYPE_WEIGHTS = \{[\s\S]*?sticker:\s*(\d+)[\s\S]*?twoStickers:\s*(\d+)[\s\S]*?threeStickersBlind:\s*(\d+)/);
    const dm = src.match(/burstRoll = Math\.random\(\)\s*\*\s*(\d+)[\s\S]*?burstRoll < (\d+)\) \? 1 : \(burstRoll < (\d+)\) \? 2 : 3/);
    if (!pm || !dm) throw new Error('source patterns not found (player=' + !!pm + ', opp=' + !!dm + ')');
    const player = [Number(pm[1]), Number(pm[2]), Number(pm[3])];
    const total = Number(dm[1]), t1 = Number(dm[2]), t2 = Number(dm[3]);
    const opp = [t1, t2 - t1, total - t2];
    return {
      ok: player.join(':') === opp.join(':'),
      info: 'player single:double:triple = ' + player.join(':') + ' | opp = ' + opp.join(':'),
    };
  });

proof('R60/R61',
  "Selfplay bughunt's multicolor-land stress setup actually applies its land-color stickers",
  () => {
    RUN.start({ cards: ['plains', 'plains', 'bear_cub', 'bear_cub'], colors: ['W'], mode: 'classic' }, null);
    const slots = RUN.getSlots();
    const li = slots.findIndex(s => s.tplId === 'plains');
    if (li < 0) throw new Error('no plains slot after RUN.start');
    const before = (RUN.getSlots()[li].stickers || []).length;
    RUN.applyStickerToSlot(li, 'landColor_U');          // the id the harness writes
    const afterHarnessId = (RUN.getSlots()[li].stickers || []).length;
    RUN.applyStickerToSlot(li, 'land_color_u');          // the id the registry defines
    const afterCanonical = (RUN.getSlots()[li].stickers || []).length;
    return {
      ok: afterHarnessId - before === 1,
      info: "stickers applied with harness id 'landColor_U': " + (afterHarnessId - before) + " | with registry id 'land_color_u': " + (afterCanonical - afterHarnessId),
    };
  });

console.log('---');
console.log('PROOF SUMMARY: ' + confirmed + ' bug(s) confirmed, ' + absent + ' not confirmed, ' + errored + ' proof error(s)');
process.exit(0);  // verdicts, not gates — this file never reds a pipeline
