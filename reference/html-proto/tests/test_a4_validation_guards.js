// Audit A4-11 + A4-17 + A4-21 (+ the A4-8/A4-14 boot legs) — authoring
// safety nets on the boot validator, plus the two resolution-path guards:
//
//   A4-11: matchFilter's key vocabulary was an open tail — a typo'd or
//          camelCase target_filter key (the PROTOCOL doc's own pre-A4-10
//          spelling!) booted clean and silently over-targeted. Boot
//          validation now flags unknown filter keys (MATCH_FILTER_KEYS:
//          matchFilter ∪ matchFilterSpell ∪ graveyard-search ∪ library-
//          search axes — the union the verifier flagged, so
//          deepseam_quarry/seal_thief_courier don't false-positive).
//   A4-17: missing-target / missing-param failure modes were an uncaught
//          TypeError (spell stranded in NO zone) or NaN damage corruption
//          (creature unkillable for a turn). Guards: resolveTarget fizzles
//          on a null/iid-less target; applyDamageFrom ignores non-positive/
//          NaN amounts and fizzles on a missing target. EFFECT_SCHEMA grows
//          required-param entries (damage/gain_life/draw/discard amount;
//          add_mana amounts|choose; grant_keyword keyword; create_tokens
//          known token_id) + a targeted-kinds-need-a-target-source sweep
//          (separate `targetErrors` list).
//   A4-21: move_card's schema validated (from,to) PAIRS while the handler
//          dispatches on (from,to,selector) TRIPLES — schema-clean combos
//          no-op'd at runtime. Schema now checks the selector against the
//          handler's real dispatch table. And the hand→graveyard arm now
//          honors the §5.2 shorthand selectors: 'controller_chosen' always
//          discards the controller; 'target_player_chosen' requires a player
//          target (else a logged fizzle).
//   A4-8 boot leg: target_filter on player/opp targets is rejected loudly
//          (matchFilter's vocabulary is card axes — the pairing is
//          nonsensical and was silently dropped).
//   A4-14 boot leg: stat bounds (max/min power/toughness) inside
//          static_buffs are rejected loudly until supported.

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
    grantedBy: new Map(), eotGrants: [], modifiers: [], stickers: [],
    keywords: (inst.keywords || []).slice(),
  });
}
function newGame() {
  RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors: ['B'] }, null);
  RUN.startNextGame();
  const G = ENGINE.state();
  G.you.battlefield = []; G.opp.battlefield = [];
  G.opp.hand = [];
  G.stack = []; G.gameOver = false;
  return G;
}
const quiet = (fn) => {
  const orig = console.warn; console.warn = () => {};
  try { return fn(); } finally { console.warn = orig; }
};

console.log('=== A4-11: unknown target_filter keys are flagged at boot ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    { tplId: 'camelTrap', target: 'creature', target_filter: { hasKeyword: 'flying' },
      effects: [{ kind: 'affect_creature', severity: 'destroy' }] },
    { tplId: 'typoTrap', target: 'creature', target_filter: { max_tuogh: 2 },
      effects: [{ kind: 'affect_creature', severity: 'destroy' }] },
    { tplId: 'cleanCard', target: 'creature', target_filter: { max_tough: 2 },
      effects: [{ kind: 'affect_creature', severity: 'destroy' }] },
    { tplId: 'buffTrap', static_buffs: [{ power: 1, filter: { controler: 'self' } }] },
  ]));
  check('returns an unknownFilterKeys list', Array.isArray(r.unknownFilterKeys),
    JSON.stringify(r.unknownFilterKeys));
  if (!Array.isArray(r.unknownFilterKeys)) return;
  check('camelCase key flagged (the A4-10 PROTOCOL spelling)',
    r.unknownFilterKeys.some(k => k.includes('camelTrap') && k.includes('hasKeyword')));
  check('typo\'d key flagged', r.unknownFilterKeys.some(k => k.includes('typoTrap') && k.includes('max_tuogh')));
  check('static_buff filter keys are swept too',
    r.unknownFilterKeys.some(k => k.includes('buffTrap') && k.includes('controler')));
  check('valid snake_case key NOT flagged', !r.unknownFilterKeys.some(k => k.includes('cleanCard')));
})();

console.log('\n=== A4-8/A4-14 boot legs: nonsensical pairings rejected loudly ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    { tplId: 'playerFilter', target: 'player', target_filter: { type: 'Land' },
      effects: [{ kind: 'gain_life', amount: 2 }] },
    { tplId: 'oppFilter', target: 'opp', target_filter: { not_color: 'B' },
      effects: [{ kind: 'damage', amount: 2 }] },
    { tplId: 'statLord', static_buffs: [{ power: 1, toughness: 1, filter: { max_power: 2 } }] },
    { tplId: 'okLord', static_buffs: [{ power: 1, toughness: 1, filter: { controller: 'self' } }] },
  ]));
  check('target_filter on a player target is rejected',
    r.schemaErrors.some(e => e.startsWith('playerFilter:')), r.schemaErrors.join('; '));
  check('target_filter on an opp target is rejected',
    r.schemaErrors.some(e => e.startsWith('oppFilter:')));
  check('stat bound inside a static_buff is rejected (A4-14)',
    r.schemaErrors.some(e => e.startsWith('statLord:') && /stat bound/i.test(e)));
  check('ordinary lord buff NOT flagged', !r.schemaErrors.some(e => e.startsWith('okLord:')));
})();

console.log('\n=== A4-17: required-param schema entries ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    { tplId: 'dmgNoAmt', target: 'creature', effects: [{ kind: 'damage' }] },
    { tplId: 'lifeNoAmt', effects: [{ kind: 'gain_life' }] },
    { tplId: 'drawNoAmt', effects: [{ kind: 'draw' }] },
    { tplId: 'manaNothing', abilities: [{ cost: { tap: true }, effects: [{ kind: 'add_mana' }] }] },
    { tplId: 'kwMissing', target: 'creature', effects: [{ kind: 'grant_keyword' }] },
    { tplId: 'tokUnknown', effects: [{ kind: 'create_tokens', token_id: 'no_such_token' }] },
    { tplId: 'dmgExprOk', target: 'creature', effects: [{ kind: 'damage', amount: { from: 'source_power' } }] },
    { tplId: 'tokAliasOk', effects: [{ kind: 'create_tokens', token_id: 'goblin' }] },
  ]));
  check('damage without amount flagged', r.schemaErrors.some(e => e.startsWith('dmgNoAmt:')),
    r.schemaErrors.join('; '));
  check('gain_life without amount flagged', r.schemaErrors.some(e => e.startsWith('lifeNoAmt:')));
  check('draw without amount flagged', r.schemaErrors.some(e => e.startsWith('drawNoAmt:')));
  check('add_mana without amounts/choose flagged', r.schemaErrors.some(e => e.startsWith('manaNothing:')));
  check('grant_keyword without keyword flagged', r.schemaErrors.some(e => e.startsWith('kwMissing:')));
  check('create_tokens with unknown token flagged', r.schemaErrors.some(e => e.startsWith('tokUnknown:')));
  check('expression amount ({from:...}) accepted', !r.schemaErrors.some(e => e.startsWith('dmgExprOk:')));
  check('legacy token alias accepted', !r.schemaErrors.some(e => e.startsWith('tokAliasOk:')));
})();

console.log('\n=== A4-17: targeted kinds need a target source (targetErrors) ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    // The executed repro: a Sorcery authored {kind:'damage'} with NO way to
    // get a target — used to boot clean then throw mid-resolution, leaving
    // the spell in NO zone.
    { tplId: 'orphanDamage', effects: [{ kind: 'damage', amount: 2 }] },
    { tplId: 'okTargeted', target: 'creature', effects: [{ kind: 'damage', amount: 2 }] },
    { tplId: 'okScoped', effects: [{ kind: 'damage', amount: 2, scope: 'all_creatures' }] },
    { tplId: 'okSelf', effects: [{ kind: 'damage', amount: 2, scope: 'self' }] },
    { tplId: 'okTrig', triggers: [{ event: 'card_zone_change', target: 'opp_creature',
        effects: [{ kind: 'pump', power: 1, toughness: 1 }] }] },
  ]));
  check('returns a targetErrors list', Array.isArray(r.targetErrors), JSON.stringify(r.targetErrors));
  if (!Array.isArray(r.targetErrors)) return;
  check('orphaned damage flagged', r.targetErrors.some(e => e.startsWith('orphanDamage:')));
  check('top-level target step accepted', !r.targetErrors.some(e => e.startsWith('okTargeted:')));
  check('mass scope accepted', !r.targetErrors.some(e => e.startsWith('okScoped:')));
  check('scope self accepted', !r.targetErrors.some(e => e.startsWith('okSelf:')));
  check('trigger-level target step accepted', !r.targetErrors.some(e => e.startsWith('okTrig:')));
})();

console.log('\n=== A4-21: move_card selector validated against the real dispatch ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects([
    { tplId: 'mcBadSel', effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'target' }] },
    { tplId: 'mcTypoSel', effects: [{ kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'taregt' }] },
    { tplId: 'mcSearchOk', effects: [{ kind: 'move_card', from_zone: 'library', to_zone: 'hand', selector: 'library_search' }] },
    { tplId: 'mcDiscardOk', effects: [{ kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'controller_chosen' }] },
    { tplId: 'mcBounceOk', target: 'creature', effects: [{ kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand', selector: 'target' }] },
    { tplId: 'mcNoSelOk', effects: [{ kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard' }] },
  ]));
  check('library→hand selector:target flagged (handler would warn-and-no-op)',
    r.schemaErrors.some(e => e.startsWith('mcBadSel:')), r.schemaErrors.join('; '));
  check('typo\'d selector flagged', r.schemaErrors.some(e => e.startsWith('mcTypoSel:')));
  check('valid selectors NOT flagged',
    !r.schemaErrors.some(e => e.startsWith('mcSearchOk:') || e.startsWith('mcDiscardOk:')
      || e.startsWith('mcBounceOk:') || e.startsWith('mcNoSelOk:')));
})();

console.log('\n=== the live shipped pool stays clean under ALL new checks ===');
(() => {
  const r = quiet(() => ENGINE.validateAllCardEffects(CARDS));
  check('no unknown filter keys in CARDS', r.unknownFilterKeys.length === 0,
    r.unknownFilterKeys.join(', '));
  check('no schema errors in CARDS', r.schemaErrors.length === 0, r.schemaErrors.join('; '));
  check('no target errors in CARDS', r.targetErrors.length === 0, r.targetErrors.join('; '));
})();

console.log('\n=== A4-17 guards: no-target / no-amount resolution is a fizzle, not a crash ===');
(() => {
  const G = newGame();
  const ctx = { controller: 'you', sourceName: 'Malformed Spell', sourceIid: null };
  let threw = null;
  try { ENGINE.applyEffect(ctx, { kind: 'damage', amount: 2 }, null); }
  catch (e) { threw = e; }
  check('damage with NO target does not throw (was: TypeError, spell in no zone)',
    threw === null, threw && String(threw));
  check('players untouched by the fizzled damage', G.you.life === 20 && G.opp.life === 20);

  const ogre = mk('gray_ogre', 'you'); G.you.battlefield.push(ogre);
  ENGINE.applyEffect(ctx, { kind: 'damage' }, { kind: 'creature', iid: ogre.iid });
  check('damage with NO amount leaves damage at 0 (was: NaN — unkillable creature)',
    ogre.damage === 0, 'damage=' + ogre.damage);
  ENGINE.applyEffect(ctx, { kind: 'damage', amount: 2 }, { kind: 'creature', iid: ogre.iid });
  check('follow-up damage still lands (no NaN poisoning)', ogre.damage === 2,
    'damage=' + ogre.damage);

  let threw2 = null;
  try { ENGINE.applyEffect(ctx, { kind: 'pump', power: 1, toughness: 1 }, { kind: 'creature' }); }
  catch (e) { threw2 = e; }
  check('an iid-less target descriptor fizzles instead of crashing (resolveTarget guard)',
    threw2 === null, threw2 && String(threw2));
})();

console.log('\n=== A4-21 guards: the discard arm honors its selector ===');
(() => {
  const G = newGame();
  G.opp.hand = [mk('forest', 'opp'), mk('plains', 'opp')];
  G.forcedDiscard = null;
  // 'controller_chosen' ("you discard") with a stray player target in scope:
  // the CONTROLLER (opp here — AI auto-discards, measurable) must discard,
  // never the targeted player.
  const ctx = { controller: 'opp', sourceName: 'Mind Rot', sourceIid: null };
  ENGINE.applyEffect(ctx,
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'controller_chosen', amount: 1 },
    { kind: 'player', who: 'you' });
  check("'controller_chosen' discards the CONTROLLER (was: whatever player target was in scope)",
    G.opp.hand.length === 1, 'opp hand=' + G.opp.hand.length);
  check('the targeted player got NO forced-discard prompt', !G.forcedDiscard,
    JSON.stringify(G.forcedDiscard));

  // 'target_player_chosen' WITH a player target: the target discards.
  G.opp.hand = [mk('forest', 'opp'), mk('plains', 'opp')];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Targeted Rot', sourceIid: null },
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'target_player_chosen', amount: 1 },
    { kind: 'player', who: 'opp' });
  check("'target_player_chosen' discards the targeted player", G.opp.hand.length === 1,
    'opp hand=' + G.opp.hand.length);

  // 'target_player_chosen' WITHOUT a player target: logged fizzle, no discard.
  G.opp.hand = [mk('forest', 'opp'), mk('plains', 'opp')];
  ENGINE.applyEffect({ controller: 'you', sourceName: 'Aimless Rot', sourceIid: null },
    { kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'target_player_chosen', amount: 1 },
    null);
  check("'target_player_chosen' with no player target fizzles (nobody discards)",
    G.opp.hand.length === 2, 'opp hand=' + G.opp.hand.length);
})();

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
