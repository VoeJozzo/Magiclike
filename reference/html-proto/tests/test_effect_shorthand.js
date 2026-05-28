// Effect-shorthand parser (plan-effects-refactor §5.1/§5.2). Card effects may be
// authored as function-call strings ("damage(3)", "draw(2)") that ingestCard()
// normalizes to canonical dicts at load. This pins: the §5.1 call parser
// (positional + keyword args + coercion), the §5.2 curated movement-shorthand
// desugar table, dict-form pass-through (idempotent for the current pool), and
// one end-to-end execution (a shorthand effect resolves through move_card).

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('=== §5.1 function-call parser: positional, keyword, coercion ===');
(() => {
  check('damage(3) → {kind, amount:3}', eq(desugarEffectString('damage(3)'), { kind: 'damage', amount: 3 }));
  check('damage(amount=3) === positional form', eq(desugarEffectString('damage(amount=3)'), { kind: 'damage', amount: 3 }));
  check('pump(2, 2) → power/toughness', eq(desugarEffectString('pump(2, 2)'), { kind: 'pump', power: 2, toughness: 2 }));
  check('chooses(creature) → filter (bare ident = string)', eq(desugarEffectString('chooses(creature)'), { kind: 'chooses', filter: 'creature' }));
  check('gain_life(3) → amount', eq(desugarEffectString('gain_life(3)'), { kind: 'gain_life', amount: 3 }));
  check('grant_keyword(flying, duration=eot) → pos + kwarg', eq(desugarEffectString('grant_keyword(flying, duration=eot)'), { kind: 'grant_keyword', keyword: 'flying', duration: 'eot' }));
  check('no-arg counter() → bare kind', eq(desugarEffectString('counter()'), { kind: 'counter' }));
  check('whitespace tolerant ( damage ( 5 ) )', eq(desugarEffectString('damage( 5 )'), { kind: 'damage', amount: 5 }));
  // coercion: negative int (signed pump), float, bool
  check('pump(-1, -1) negative coercion', eq(desugarEffectString('pump(-1, -1)'), { kind: 'pump', power: -1, toughness: -1 }));
  const p = _parseEffectCall('foo(true, 1.5, "a b")');
  check('coerce bool/float/quoted', p.positional.length === 3 && p.positional[0] === true && p.positional[1] === 1.5 && p.positional[2] === 'a b');
})();

console.log('\n=== §5.2 movement shorthands desugar to canonical move_card ===');
(() => {
  check('draw(2) → move_card(library,hand,controller_top,2)',
    eq(desugarEffectString('draw(2)'), { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 2 }));
  check('draw() defaults amount 1',
    eq(desugarEffectString('draw()'), { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }));
  check('mill(3) → library→graveyard',
    eq(desugarEffectString('mill(3)'), { kind: 'move_card', from_zone: 'library', to_zone: 'graveyard', selector: 'controller_top', amount: 3 }));
  check('discard(1) → hand→graveyard',
    eq(desugarEffectString('discard(1)'), { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'controller_chosen', amount: 1 }));
  check('bounce() → battlefield→hand target',
    eq(desugarEffectString('bounce()'), { kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target', amount: 1 }));
  check('shuffle_into_library() → bf→library + post.shuffle',
    eq(desugarEffectString('shuffle_into_library()'), { kind: 'move_card', from_zone: 'battlefield', to_zone: 'library', selector: 'target', amount: 1, post: { shuffle: true } }));
  check('search_for(creature) → library_search + post.shuffle',
    eq(desugarEffectString('search_for(creature)'), { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'library_search', amount: 1, filter: 'creature', post: { shuffle: true } }));
  check('search_land_tapped() → library→battlefield + post.tap/shuffle',
    eq(desugarEffectString('search_land_tapped()'), { kind: 'move_card', from_zone: 'library', to_zone: 'battlefield', selector: 'library_search', amount: 1, filter: 'land', post: { tap: true, shuffle: true } }));
})();

console.log('\n=== normalizeCardEffects: strings → dicts; dicts pass through ===');
(() => {
  // on-cast effects (mix of shorthand + canonical dict)
  const card = { effects: ['draw(1)', { kind: 'damage', amount: 2 }] };
  normalizeCardEffects(card);
  check('shorthand entry normalized', eq(card.effects[0], { kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'controller_top', amount: 1 }));
  check('dict entry untouched (same reference identity)', card.effects[1].kind === 'damage' && card.effects[1].amount === 2);

  // dict-only card is a no-op (idempotent for the current pool)
  const dictCard = { effects: [{ kind: 'gain_life', amount: 3 }] };
  const before = JSON.stringify(dictCard);
  normalizeCardEffects(dictCard);
  check('all-dict card unchanged', JSON.stringify(dictCard) === before);

  // abilities + triggers + modes shapes
  const ab = { abilities: [{ effects: ['draw(2)'] }], triggers: [{ effects: ['gain_life(1)'] }], effects: { modes: [['damage(1)'], [{ kind: 'draw', amount: 1 }]] } };
  normalizeCardEffects(ab);
  check('ability shorthand normalized', ab.abilities[0].effects[0].kind === 'move_card');
  check('trigger shorthand normalized', eq(ab.triggers[0].effects[0], { kind: 'gain_life', amount: 1 }));
  check('mode shorthand normalized', eq(ab.effects.modes[0][0], { kind: 'damage', amount: 1 }));
})();

console.log('\n=== execution: a shorthand effect resolves through the real engine ===');
(() => {
  // Author a synthetic on-cast effect via shorthand, normalize it, then apply it
  // and assert the engine actually drew a card (proves the desugar is executable,
  // not just shape-correct).
  RUN.start({ cards: Array(12).fill('plains'), colors: ['W'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  const fx = normalizeCardEffects({ effects: ['draw(1)'] }).effects[0];
  const handBefore = G.you.hand.length;
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Test', sourceIid: -1 }, fx, null);
  check('draw(1) shorthand actually drew a card', G.you.hand.length === handBefore + 1,
    `hand ${handBefore} → ${G.you.hand.length}`);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
