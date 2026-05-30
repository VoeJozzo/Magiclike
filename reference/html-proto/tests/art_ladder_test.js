// effectiveArt(card) picks the right art from a card's art_ladder based
// on its current power+toughness. Currently only Elystra uses this; the
// mechanism is generic and any card.json can declare its own ladder.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

console.log('=== effectiveArt: card with no art_ladder returns its (resolved) base art ===');
{
  // No ladder → no rung logic; the base art is returned, resolved from the bare
  // stored filename to the card's own folder (the resolveArtPath pass).
  const lions = ENGINE.makeCard('savannah_lions');
  check('non-ladder card returns its base art (folder-resolved)',
    effectiveArt(lions) === 'cards/savannah_lions/art.png', 'got=' + effectiveArt(lions));
}

console.log('\n=== effectiveArt: Elystra at base p+t=2 -> art-1 ===');
{
  const elystra = ENGINE.makeCard('elystra_the_immortal');
  const art = effectiveArt(elystra);
  console.log('  base stats:', elystra.power, '/', elystra.toughness, '(p+t=' + (elystra.power+elystra.toughness) + ')');
  console.log('  picked art:', art);
  check('base Elystra picks art-1', /art-1\.png$/.test(art));
}

console.log('\n=== effectiveArt: Elystra with p+t in [10, 19] -> art-2 ===');
{
  // 5/5 -> sum 10 -> threshold 10 met
  const elystra = ENGINE.makeCard('elystra_the_immortal');
  elystra.modifiers = [{ power: 4, toughness: 4 }];   // 1+4=5, 1+4=5 -> 5/5
  // ENGINE.getStats walks modifiers; sum should be 10.
  const [p, t] = ENGINE.getStats(elystra);
  console.log('  with +4/+4 modifier:', p, '/', t);
  check('p+t = 10 picks art-2', /art-2\.png$/.test(effectiveArt(elystra)));

  // 9/9 -> sum 18 -> still art-2 (not yet 20)
  elystra.modifiers = [{ power: 8, toughness: 8 }];
  const [p2, t2] = ENGINE.getStats(elystra);
  console.log('  with +8/+8 modifier:', p2, '/', t2);
  check('p+t = 18 still picks art-2', /art-2\.png$/.test(effectiveArt(elystra)));
}

console.log('\n=== effectiveArt: Elystra with p+t >= 20 -> art-3 ===');
{
  // 10/10 -> sum 20
  const elystra = ENGINE.makeCard('elystra_the_immortal');
  elystra.modifiers = [{ power: 9, toughness: 9 }];
  const [p, t] = ENGINE.getStats(elystra);
  console.log('  with +9/+9 modifier:', p, '/', t);
  check('p+t = 20 picks art-3 (final form)', /art-3\.png$/.test(effectiveArt(elystra)));

  // 15/15 -> sum 30
  elystra.modifiers = [{ power: 14, toughness: 14 }];
  const [p2, t2] = ENGINE.getStats(elystra);
  console.log('  with +14/+14 modifier:', p2, '/', t2);
  check('p+t = 30 picks art-3 (caps at top rung)', /art-3\.png$/.test(effectiveArt(elystra)));
}

console.log('\n=== effectiveArt: just-below-threshold boundaries ===');
{
  const elystra = ENGINE.makeCard('elystra_the_immortal');
  // 4/4 -> sum 9 -> still art-1
  elystra.modifiers = [{ power: 3, toughness: 3 }];
  check('p+t = 9 still picks art-1 (one below threshold)',
    /art-1\.png$/.test(effectiveArt(elystra)));
  // 9/10 -> sum 19 -> still art-2
  elystra.modifiers = [{ power: 8, toughness: 9 }];
  check('p+t = 19 still picks art-2 (one below threshold)',
    /art-2\.png$/.test(effectiveArt(elystra)));
}

console.log("\n=== effectiveArt: template's art_ladder is in the card data ===");
{
  const elystraTpl = CARDS['elystra_the_immortal'];
  check('Elystra template has art_ladder', Array.isArray(elystraTpl.art_ladder));
  check('art_ladder has 3 rungs', elystraTpl.art_ladder.length === 3);
  check('rungs are ordered by min_pt ascending',
    elystraTpl.art_ladder[0].min_pt < elystraTpl.art_ladder[1].min_pt &&
    elystraTpl.art_ladder[1].min_pt < elystraTpl.art_ladder[2].min_pt);
  check('thresholds are 0 / 10 / 20',
    elystraTpl.art_ladder[0].min_pt === 0 &&
    elystraTpl.art_ladder[1].min_pt === 10 &&
    elystraTpl.art_ladder[2].min_pt === 20);
}

console.log('\n=== effectiveArt: non-Creature with ladder ignored (defensive) ===');
{
  // Fake non-creature with a ladder. The helper should return base art
  // since computing p+t doesn't make sense for non-creatures.
  const fake = { type: 'Instant', art: 'base.png', art_ladder: [
    { min_pt: 0, art: 'low.png' }, { min_pt: 10, art: 'high.png' }
  ]};
  check('Non-creature returns base art ignoring ladder',
    effectiveArt(fake) === 'base.png');
}

console.log('\n=== resolveArtPath: bare filename derives from the card\'s own folder ===');
{
  // The structural guarantee behind the v2.0.69 fix: image art is stored as a
  // BARE filename and the folder is derived from the (current) tplId at render
  // time, so a future folder rename can never stale the path again.
  check('stored art is a bare filename (no folder baked in)',
    typeof CARDS.architects_codex.art === 'string' && !CARDS.architects_codex.art.includes('/'),
    'stored=' + CARDS.architects_codex.art);
  check('effectiveArt resolves a bare filename to cards/<tplId>/<file>',
    effectiveArt(ENGINE.makeCard('architects_codex')) === 'cards/architects_codex/art.png');

  // Derivation is from the id, not a stored path: char's art file once lived in
  // cards/incinerate/ (pre-rename); it now resolves to char's own folder.
  check('char resolves to its OWN folder (id-derived, not a stored path)',
    effectiveArt(ENGINE.makeCard('char')) === 'cards/char/art.png');

  // Rename-proof: same bare art, a hypothetical new id auto-resolves to the new
  // folder with no data edit — exactly what would have prevented the v2.0.67 break.
  check('a renamed id auto-resolves to the new folder (rename-proof)',
    effectiveArt({ tplId: 'some_new_id', art: 'art.png' }) === 'cards/some_new_id/art.png');

  // Non-image / external values pass through untouched.
  check('emoji art is not path-resolved', effectiveArt({ tplId: 'x', art: '🐻' }) === '🐻');
  check('an already-full path passes through (back-compat)',
    effectiveArt({ tplId: 'x', art: 'cards/y/art.png' }) === 'cards/y/art.png');
  check('a data: URL passes through', effectiveArt({ tplId: 'x', art: 'data:image/png;base64,AAAA' }) === 'data:image/png;base64,AAAA');
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
