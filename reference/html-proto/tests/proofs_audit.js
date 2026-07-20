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

proof('A14b',
  "A staple's keywords print once on the merged card, not twice",
  () => {
    // The A14 section renders the staple half's text; the custom-text branch
    // ALSO prepends keywords the base template lacks. A keyword-bearing
    // staple hits both, so the display path must not double it. (The swamp
    // case above can't catch this — a land contributes no keywords.)
    const staple = Object.values(CARDS).find(c =>
      (c.keywords || []).includes('flying') && (c.types || []).includes('Creature')
      && !c.custom_text && !c.special);
    if (!staple) throw new Error('no plain flying creature in the pool to staple');
    const card = ENGINE.makeCard('mercurial_adept', [], 0, undefined, undefined, [staple.tplId]);
    const text = segsToText(describeCardSegments(card, {}));
    const hits = (text.match(/Flying/gi) || []).length;
    return {
      ok: hits === 1,
      info: 'mercurial_adept+' + staple.tplId + ' display text mentions Flying ' + hits
        + ' time(s): "' + text.slice(0, 90) + '..."',
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
    // True-by-logic: both sides of the equality are computed from
    // REWARD_TYPE_WEIGHTS here, so retuning the weights can never redden this
    // — only decoupling the burst roll from them can. Probes sit just inside
    // each boundary, which is exactly what a hand-copied literal would move.
    const w = RUN.REWARD_TYPE_WEIGHTS;
    const total = w.sticker + w.twoStickers + w.threeStickersBlind;
    const bS = w.sticker / total;                       // 1 → 2 boundary
    const bD = (w.sticker + w.twoStickers) / total;     // 2 → 3 boundary
    const eps = 1e-9;
    const cases = [
      [0, 1], [bS - eps, 1],
      [bS, 2], [bD - eps, 2],
      [bD, 3], [1 - eps, 3],
    ];
    const got = cases.map(([r]) => DRAFT._burstSizeForRollForTest(r));
    const want = cases.map(([, n]) => n);
    return {
      ok: JSON.stringify(got) === JSON.stringify(want),
      info: 'weights ' + JSON.stringify(w) + ' → boundaries ' + bS.toFixed(4) + '/' + bD.toFixed(4)
        + ' | burst sizes at probes: got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want),
    };
  });

proof('R32b',
  'A "Loses Defender" sticker survives the subtype rule — on a Wall (whose defender is subtype-derived) and across a re-derive',
  () => {
    // The sticker exists to let a Wall attack. Both keyword paths must honor
    // it: makeCard's build AND intrinsicKeywords' re-derive (leave-play, EOT
    // grant strip) — otherwise SUBTYPE_KEYWORDS.Wall silently hands defender
    // back and the reward buys nothing.
    const walls = Object.values(CARDS).filter(c => (c.types || []).includes('Wall'));
    const bad = [];
    for (const tpl of walls) {
      const card = ENGINE.makeCard(tpl.tplId, ['lose_defender']);
      const built = (card.keywords || []).includes('defender');
      const rederived = ENGINE.intrinsicKeywords(card).includes('defender');
      if (built || rederived) bad.push(tpl.tplId + (built ? ' (build)' : '') + (rederived ? ' (re-derive)' : ''));
    }
    return {
      ok: walls.length > 0 && bad.length === 0,
      info: walls.length + ' Wall card(s) checked; still defender after the sticker: '
        + (bad.length ? bad.join(', ') : 'none'),
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
