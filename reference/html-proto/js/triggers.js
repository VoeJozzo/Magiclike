// ─── Composable atomic predicates (Slice 2 / DIVERGENCE E2) ──────────────
// New-vocabulary predicates over the unified event shapes (§3 of
// plan-zone-change-and-composable-predicates.md):
//   card_zone_change {type, subject_iid, subject_card, controller, from_zone, to_zone, source_iid?}
//   spell_cast       {type, subject_iid, subject_card, controller}
//   attacks          {type, subject_iid, subject_card, controller, defender_key}
//   life_changed     {type, who, delta, source_iid?}
//   combat_damage    {type, subject_iid, subject_card, controller, who, amount}
//   ability_activated {type, subject_iid, subject_card, controller} — subject
//                    is the ability's SOURCE permanent; fired only from the
//                    non-mana stack-entry activation site (mana abilities are
//                    structurally silent, canon §705)
// `type` is the discriminator emit()/the dispatcher match on (the wire name is
// the same string on both engines — PROTOCOL §3.3). `source_iid` on
// card_zone_change names the card that CAUSED the move (e.g. the token-maker),
// distinct from subject_iid; the noSelfCascade guard below reads it.
// Each atomic takes (ctx, args); ctx = {state, source, event, who} where `who`
// is the trigger source's controller (Godot resolves the same from
// source.controller_key — the per-engine signature detail; the evaluator
// shape is the parallel part).

function _predOtherPlayer(who) { return who === 'you' ? 'opp' : 'you'; }
function _predResolvePlayer(token, who) { return token === 'you' ? who : _predOtherPlayer(who); }

const ATOMIC_PREDICATES = {
  // Card predicates (events with a subject_card)
  this_card:        (ctx) => !!ctx.event.subject_card && ctx.event.subject_card.iid === ctx.source.iid,
  another_card:     (ctx) => !!ctx.event.subject_card && ctx.event.subject_card.iid !== ctx.source.iid,
  card_is_creature: (ctx) => !!ctx.event.subject_card && hasType(ctx.event.subject_card, 'Creature'),
  controlled_by:    (ctx, args) => ctx.event.controller === _predResolvePlayer(args[0], ctx.who),
  card_moves:       (ctx, args) => {
    const from = args[0], to = args[1];
    const fromOk = from === 'anywhere' || ctx.event.from_zone === from;
    const toOk = to === 'anywhere' || ctx.event.to_zone === to;
    return fromOk && toOk;
  },
  card_has_subtype: (ctx, args) => {
    const c = ctx.event.subject_card;
    // Word-exact subtype match via hasType, reading the unified types[] array.
    // Mirrors matchFilter so a multi-subtype card ("Human Cleric Wall")
    // satisfies card_has_subtype(Cleric). (Pre-v2.0.70 this matched against the
    // legacy space-separated `sub` string; that field is gone -- types[] is now
    // the sole source, and a tag like "Goblin" is one entry, not a substring.)
    // Multiple args are ANY-OF: card_has_subtype(Elf, Merfolk) = "is an Elf
    // or a Merfolk" (Covenant Scholar's two-tribe covenant).
    return args.some((a) => hasType(c, a));
  },
  // The cast/subject card carries the named keyword — including keywords
  // IMPLIED by subtype (Angel/Dragon fly etc.), read through the same
  // effective-keyword helper the synergy graph uses. "Whenever you cast a
  // spell with flash" (Feinting Sprite, Surgecaster).
  card_has_keyword: (ctx, args) => {
    const c = ctx.event.subject_card;
    if (!c) return false;
    const kws = (typeof ENGINE !== 'undefined' && ENGINE.addSubtypeKeywords)
      ? ENGINE.addSubtypeKeywords((c.types || []), (c.keywords || []).slice())
      : (c.keywords || []);
    return kws.includes(args[0]);
  },
  // True when it is not the listener's controller's turn ("Whenever you cast
  // a spell during an opponent's turn" — Tidewatcher). Reads the active
  // player off state; false when state carries no turn info (test stubs).
  opponents_turn: (ctx) =>
    !!ctx.state && ctx.state.activePlayer != null && ctx.state.activePlayer !== ctx.who,
  card_damaged_by_this: (ctx) => {
    const c = ctx.event.subject_card;
    return !!c && (c.damagedBySources instanceof Set) && c.damagedBySources.has(ctx.source.iid);
  },
  card_has_effect:  (ctx, args) => {
    const c = ctx.event.subject_card;
    if (!c) return false;
    // Optional second arg scopes WHERE to look (parameterize, don't multiply
    // predicate names — Joe's ruling). Default: spell-level effects, as ever.
    // 'etb': the subject card's enters-the-battlefield triggers ("whenever a
    // creature WITH AN ETB DAMAGE ABILITY enters" — Triage Cleric).
    if (args[1] === 'etb') {
      return (c.triggers || []).some((trig) =>
        triggerFiresOnEnter(trig) && (trig.effects || []).some((e) => e && e.kind === args[0]));
    }
    return ENGINE.cardHasEffect(c, (e) => e.kind === args[0]);
  },
  // Event-meta (player-subject events, e.g. life_changed)
  affected_player_is: (ctx, args) => ctx.event.who === _predResolvePlayer(args[0], ctx.who),
  // Life
  is_life_gain:     (ctx) => ctx.event.delta > 0,
  is_life_loss:     (ctx) => ctx.event.delta < 0,
  lost_life_this_turn: (ctx, args) => {
    const p = ctx.state[_predResolvePlayer(args[0], ctx.who)];
    return !!p && (p.lifeLostThisTurn || 0) > 0;
  },
};

// Coerce a raw arg string to its typed value (quoted string / bool / int / float / bare string).
function _coerceArg(s) {
  s = s.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

// Split "a, b" → ["a","b"], respecting quoted strings (commas inside quotes stay).
function _splitArgs(s) {
  const out = [];
  let current = '', inQuotes = false;
  for (const ch of s) {
    if (ch === '"') { inQuotes = !inQuotes; current += ch; }
    else if (ch === ',' && !inQuotes) { out.push(current); current = ''; }
    else current += ch;
  }
  if (current.trim() !== '') out.push(current);
  return out;
}

// "card_moves(battlefield, graveyard)" → {name:"card_moves", args:["battlefield","graveyard"]}.
function _parseCall(str) {
  const open = str.indexOf('('), close = str.lastIndexOf(')');
  if (open === -1 || close === -1 || close < open) {
    console.warn('Malformed predicate string:', str);
    return { name: str.trim(), args: [] };
  }
  const name = str.slice(0, open).trim();
  const argsStr = str.slice(open + 1, close).trim();
  if (argsStr === '') return { name, args: [] };
  return { name, args: _splitArgs(argsStr).map(_coerceArg) };
}

// ─── Effect-shorthand parser (plan-effects-refactor §5.1/§5.2) ──────────────
// Card effects may be authored as canonical dicts OR as function-call strings
// ("damage(3)", "draw(2)", "chooses(creature)"). ingestCard() runs
// normalizeCardEffects() at load so the dispatcher only ever sees dicts;
// dict-form effects pass through untouched (existing cards are a no-op).
// `flicker` is intentionally NOT a shorthand: its §5.2 desugar needs a
// `previous_target` move_card selector the engine doesn't implement yet.

// Parse "kind(pos, key=value)" → {name, positional:[...], kwargs:{...}}. Reuses
// the predicate lexer (_splitArgs / _coerceArg); adds keyword-arg support: an
// arg shaped `ident=value` is a kwarg, everything else is positional (and
// positional must precede kwargs, per §5.1).
function _parseEffectCall(str) {
  const open = str.indexOf('('), close = str.lastIndexOf(')');
  if (open === -1 || close === -1 || close < open) {
    return { name: str.trim(), positional: [], kwargs: {} };
  }
  const name = str.slice(0, open).trim();
  const argsStr = str.slice(open + 1, close).trim();
  const positional = [], kwargs = {};
  if (argsStr !== '') {
    for (const raw of _splitArgs(argsStr)) {
      const m = raw.match(/^\s*([A-Za-z_]\w*)\s*=(.*)$/);
      if (m) kwargs[m[1]] = _coerceArg(m[2]);
      else positional.push(_coerceArg(raw));
    }
  }
  return { name, positional, kwargs };
}

// Curated movement shorthands → canonical move_card dict (§5.2). One handler
// (move_card) runs at execution time; this table is the only place the mapping
// lives. Builders take the positional args; kwargs are merged on top after.
const EFFECT_SHORTHAND_MOVE = {
  draw:    (p) => ({ kind: 'move_card', from_zone: 'library', to_zone: 'hand',      selector: 'controller_top',   amount: p[0] != null ? p[0] : 1 }),
  mill:    (p) => ({ kind: 'move_card', from_zone: 'library', to_zone: 'graveyard', selector: 'controller_top',   amount: p[0] != null ? p[0] : 1 }),
  discard: (p) => ({ kind: 'move_card', from_zone: 'hand',    to_zone: 'graveyard', selector: 'controller_chosen', amount: p[0] != null ? p[0] : 1 }),
  target_player_discards: (p) => ({ kind: 'move_card', from_zone: 'hand', to_zone: 'graveyard', selector: 'target_player_chosen', amount: p[0] != null ? p[0] : 1 }),
  bounce:               () => ({ kind: 'move_card', from_zone: 'battlefield', to_zone: 'hand',    selector: 'target', amount: 1 }),
  shuffle_into_library: () => ({ kind: 'move_card', from_zone: 'battlefield', to_zone: 'library', selector: 'target', amount: 1, post: { shuffle: true } }),
  search_for:           (p) => ({ kind: 'move_card', from_zone: 'library', to_zone: 'hand',        selector: 'library_search', amount: 1, filter: p[0], post: { shuffle: true } }),
  search_land_tapped:   () => ({ kind: 'move_card', from_zone: 'library', to_zone: 'battlefield', selector: 'library_search', amount: 1, filter: 'land', post: { tap: true, shuffle: true } }),
};

// Positional-arg field names per atomic effect kind (§5.1). Keyword args
// (name=value) always work and override; this table just names the positional
// slots so "damage(3)" === "damage(amount=3)".
const EFFECT_POSITIONAL = {
  damage: ['amount'], gain_life: ['amount'],
  pump: ['power', 'toughness'], add_counter: ['power', 'toughness'],
  chooses: ['filter'], affect_creature: ['severity'],
  grant_keyword: ['keyword'], create_tokens: ['token_id', 'count'],
  fight: [], counter: [], untap: [], sacrifice: [], annihilate: [],
  rip: [], symmetricize: [],
};

// Desugar one function-call string to its canonical effect dict.
function desugarEffectString(str) {
  const { name, positional, kwargs } = _parseEffectCall(str);
  if (EFFECT_SHORTHAND_MOVE[name]) {
    return Object.assign(EFFECT_SHORTHAND_MOVE[name](positional, kwargs), kwargs);
  }
  const dict = { kind: name };
  const slots = EFFECT_POSITIONAL[name] || [];
  positional.forEach((val, i) => { if (slots[i] != null) dict[slots[i]] = val; });
  Object.assign(dict, kwargs);
  return dict;
}

function _normalizeEffectArray(arr) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  for (const e of arr) {
    if (typeof e === 'string') {
      const d = desugarEffectString(e);
      if (Array.isArray(d)) out.push(...d); else out.push(d);
    } else out.push(e);
  }
  return out;
}

// Normalize string-form effects → canonical dicts across every effect-bearing
// field of a card (on-cast `effects` incl. `{modes}`, activated `abilities`,
// `triggers`). Dict effects pass through untouched (idempotent for the current
// all-dict card pool). Called from ingestCard() at load.
function normalizeCardEffects(card) {
  if (!card || typeof card !== 'object') return card;
  if (Array.isArray(card.effects)) card.effects = _normalizeEffectArray(card.effects);
  else if (card.effects && Array.isArray(card.effects.modes)) {
    card.effects.modes = card.effects.modes.map(_normalizeEffectArray);
  }
  for (const ab of (card.abilities || [])) {
    if (Array.isArray(ab.effects)) ab.effects = _normalizeEffectArray(ab.effects);
  }
  for (const tr of (card.triggers || [])) {
    if (Array.isArray(tr.effects)) tr.effects = _normalizeEffectArray(tr.effects);
  }
  return card;
}

function _callAtomic(name, ctx, args) {
  const fn = ATOMIC_PREDICATES[name];
  if (!fn) { console.warn('Unknown atomic predicate:', name); return false; }
  return fn(ctx, args);
}

// Evaluate a condition expression. Shapes: "" (true) | bare string | "call(args)"
// | Array (AND of terms) | {op:"and"|"or"|"not", terms:[...]} | {name, args}.
function evaluateCondition(expr, ctx) {
  if (expr == null || expr === '') return true;
  if (typeof expr === 'string') {
    if (expr.indexOf('(') !== -1) {
      const parsed = _parseCall(expr);
      return _callAtomic(parsed.name, ctx, parsed.args);
    }
    return _callAtomic(expr, ctx, []);
  }
  if (Array.isArray(expr)) {
    return expr.every((term) => evaluateCondition(term, ctx));
  }
  if (typeof expr === 'object') {
    if (expr.op) {
      const terms = expr.terms || [];
      if (expr.op === 'and') return terms.every((t) => evaluateCondition(t, ctx));
      if (expr.op === 'or') return terms.some((t) => evaluateCondition(t, ctx));
      if (expr.op === 'not') return !evaluateCondition(terms[0], ctx);
    }
    if (expr.name) return _callAtomic(expr.name, ctx, expr.args || []);
  }
  console.warn('evaluateCondition: malformed expression', expr);
  return false;
}

// ─── Archetype classification (Slice 2 / E2) ────────────────────────────
// condId used to be a runtime-readable label that other systems keyed off
// (card-text preambles, AI trigger-frequency valuation). Post-migration the
// classification is recovered from event+condition. This is the single
// centralized inverse of the migration table — consumers call it instead of
// scattering condition-shape checks.
// NOTE: term ORDER is load-bearing here. The signature is the condition terms
// joined in array order, and _ARCHETYPE_BY_SIG keys on the exact string. A card
// that authors semantically-identical predicates in a different order (or as a
// non-array {op} tree) won't match and triggerArchetype returns null. That
// degrades gracefully (consumers -- card-text preambles, AI valuation -- handle
// null), but it's silent: no boot warning. Keep migrated conditions in the
// canonical order the MIGRATION table emits, or normalize-sort before signing.
function _condSignature(event, condition) {
  if (!Array.isArray(condition)) return event + ' | <non-array>';
  const terms = condition.map((t) => (typeof t === 'string'
    ? t.replace(/card_has_subtype\([^)]*\)/, 'card_has_subtype(*)')
       .replace(/card_has_keyword\([^)]*\)/, 'card_has_keyword(*)')
    : JSON.stringify(t)));
  return event + ' | ' + terms.join(', ');
}

const _ARCHETYPE_BY_SIG = {
  'card_zone_change | this_card, card_moves(anywhere, battlefield)': 'thisEnters',
  'card_zone_change | another_card, card_is_creature, controlled_by(you), card_moves(anywhere, battlefield)': 'anotherCreatureYouEntersStrict',
  // OfSubtype intentionally has NO card_is_creature term — tribal is type-agnostic
  // (a non-creature with a creature subtype still counts). card_has_subtype is the
  // gate. See migrate-triggers.js MIGRATION for the full rationale.
  'card_zone_change | another_card, controlled_by(you), card_has_subtype(*), card_moves(anywhere, battlefield)': 'anotherCreatureYouEntersOfSubtype',
  'attacks | this_card': 'thisAttacks',
  'combat_damage | this_card, affected_player_is(opp)': 'thisDealsCombatDamageToOpp',
  'attacks | this_card, lost_life_this_turn(opp)': 'thisAttacksAfterOppLifeLoss',
  'attacks | controlled_by(you), card_has_subtype(*)': 'creatureYouAttacksOfSubtype',
  'card_zone_change | this_card, card_moves(battlefield, graveyard)': 'thisDies',
  'card_zone_change | this_card, card_moves(battlefield, anywhere)': 'thisLeaves',
  'card_zone_change | another_card, card_is_creature, card_moves(battlefield, graveyard)': 'anotherCreatureDies',
  'card_zone_change | card_is_creature, card_moves(battlefield, graveyard)': 'anyCardDies',
  'card_zone_change | another_card, card_is_creature, card_moves(battlefield, graveyard), card_damaged_by_this': 'thisKillsCreature',
  'life_changed | is_life_gain, affected_player_is(you)': 'youGainLife',
  'life_changed | is_life_loss, affected_player_is(opp)': 'oppLosesLife',
  'card_zone_change | controlled_by(you), card_moves(hand, graveyard)': 'youDiscard',
  'card_zone_change | card_has_subtype(*), card_moves(battlefield, graveyard)': 'cardDiesOfSubtype',
  'spell_cast | another_card, controlled_by(you)': 'youCastSpell',
  'spell_cast | another_card, controlled_by(you), card_has_effect(counter)': 'youCastCounterspell',
  // Wave 2 archetypes. card_has_keyword wildcards like card_has_subtype (see
  // _condSignature); card_has_effect stays literal (youCastCounterspell
  // precedent — the args ARE the archetype).
  'spell_cast | another_card, controlled_by(you), card_has_keyword(*)': 'youCastSpellWithKeyword',
  'spell_cast | another_card, controlled_by(you), opponents_turn': 'youCastSpellOppTurn',
  'spell_cast | another_card, controlled_by(you), {"op":"not","terms":["card_is_creature"]}': 'youCastNoncreatureSpell',
  'ability_activated | controlled_by(you), card_is_creature': 'youActivateCreatureAbility',
  'card_zone_change | another_card, card_is_creature, controlled_by(you), card_has_effect(damage, etb), card_moves(anywhere, battlefield)': 'anotherEtbDamagerYouEnters',
  // No card_is_creature term: the subtype IS the gate (OfSubtype precedent) —
  // today's customers are landfall (card_has_subtype(Land) reads types[]
  // through hasType, so card types work as "subtypes" here).
  'card_zone_change | controlled_by(you), card_has_subtype(*), card_moves(anywhere, battlefield)': 'cardYouEntersOfSubtype',
  'card_zone_change | card_is_creature, controlled_by(you), card_moves(battlefield, graveyard)': 'creatureYouDies',
  'attacks | another_card, controlled_by(you)': 'anotherCreatureYouAttacks',
  // House ruling (Joe, Wave 2): "drawing" = ANY library→hand move, tutors
  // included — the text says "draw" and the wire is honest because the house
  // defines draw that way. (Backlog: tutor-text consistency pass.)
  'card_zone_change | controlled_by(you), card_moves(library, hand)': 'youDraw',
};

// Classify a trigger into its archetype id (the old condId vocabulary) from
// its composable event+condition. Returns null if unknown.
function triggerArchetype(trig) {
  if (!trig) return null;
  return _ARCHETYPE_BY_SIG[_condSignature(trig.event, trig.condition)] || null;
}

// True if the trigger fires when a card ENTERS the battlefield (any ETB
// archetype: thisEnters / anotherCreatureYouEnters*). Used by AI heuristics
// (flicker / flash-fizzle valuation) that previously keyed on the legacy
// `event === 'cardEntersBattlefield'`. Now matches a card_moves(*, battlefield)
// term under the unified `card_zone_change` event.
function triggerFiresOnEnter(trig) {
  if (!trig) return false;
  if (trig.event !== 'card_zone_change') return false;
  for (const t of (trig.condition || [])) {
    if (typeof t === 'string' && /card_moves\(\s*[^,]+,\s*battlefield\s*\)/.test(t)) return true;
  }
  return false;
}

// Extract the subtype a trigger filters on (card_has_subtype(...) term, or a
// legacy params.sub), for preamble phrasing. Null if none. Any-of args come
// back raw ("Elf, Merfolk") — the preamble renders the "or"-join.
function triggerSubtype(trig) {
  for (const t of (trig && trig.condition || [])) {
    if (typeof t === 'string' && t.startsWith('card_has_subtype(')) {
      return t.slice('card_has_subtype('.length, -1).replace(/^"|"$/g, '');
    }
  }
  return null;
}

// Sibling of triggerSubtype for card_has_keyword(...) terms — feeds the
// youCastSpellWithKeyword preamble ("Whenever you cast a spell with flash,").
function triggerKeyword(trig) {
  for (const t of (trig && trig.condition || [])) {
    if (typeof t === 'string' && t.startsWith('card_has_keyword(')) {
      return t.slice('card_has_keyword('.length, -1).replace(/^"|"$/g, '');
    }
  }
  return null;
}

// ─── Boot validation (Slice 2 / E2) ─────────────────────────────────────
// Allowed trigger event kinds. New unified vocabulary + legacy kinds (the
// latter accepted during the migration window; removed in step 8).
const VALID_TRIGGER_EVENTS = new Set([
  'card_zone_change', 'spell_cast', 'attacks', 'life_changed', 'combat_damage',
  'ability_activated',
]);

// Recursively collect unknown atomic-predicate names from a condition
// expression (mirrors evaluateCondition's shape handling).
function _collectUnknownAtomics(expr, out, cardId) {
  if (expr == null || expr === '') return;
  if (typeof expr === 'string') {
    let name = expr;
    const paren = expr.indexOf('(');
    if (paren !== -1) name = expr.slice(0, paren).trim();
    if (!ATOMIC_PREDICATES[name]) out.push(cardId + '.' + name);
    return;
  }
  if (Array.isArray(expr)) {
    for (const t of expr) _collectUnknownAtomics(t, out, cardId);
    return;
  }
  if (typeof expr === 'object') {
    if (expr.op) {
      for (const t of (expr.terms || [])) _collectUnknownAtomics(t, out, cardId);
    } else if (expr.name && !ATOMIC_PREDICATES[expr.name]) {
      out.push(cardId + '.' + expr.name);
    }
  }
}

// Walk every card's triggers; flag unknown atomic predicates referenced in the
// composable `condition` field and unexpected event kinds. Called at boot
// after loadCards(). Returns {unknownAtomics, unknownEvents} for tests; warns
// to console for the running app.
function validateAllCardConditions(cards) {
  const unknownAtomics = [];
  const unknownEvents = [];
  const list = Array.isArray(cards) ? cards : Object.values(cards || {});
  for (const card of list) {
    const cardId = card.tplId || card.id || card.name || '?';
    for (const trig of (card.triggers || [])) {
      if (trig.event && !VALID_TRIGGER_EVENTS.has(trig.event)) {
        unknownEvents.push(cardId + '.' + trig.event);
      }
      if (trig.condition != null && typeof trig.condition !== 'function') {
        _collectUnknownAtomics(trig.condition, unknownAtomics, cardId);
      }
    }
  }
  if (unknownAtomics.length) console.warn('Unknown atomic predicate(s):', unknownAtomics.join(', '));
  if (unknownEvents.length) console.warn('Unknown trigger event(s):', unknownEvents.join(', '));
  return { unknownAtomics, unknownEvents };
}

// Resolve: composable condition → legacy closure → fire unconditionally.
function evalTriggerCondition(trig, self, evt, who) {
  // Codex-generated trigger guard: refuse to fire when source caused the event.
  // Reads sourceIid (legacy events) or source_iid (unified card_zone_change).
  if (trig.noSelfCascade && evt) {
    const sid = evt.sourceIid != null ? evt.sourceIid : evt.source_iid;
    if (sid != null && sid === self.iid) return false;
  }
  // Composable `condition` (string / array / {op|name} dict). JSON wire can't
  // hold a function, so this is the only shape post-migration.
  if (trig.condition != null) {
    return evaluateCondition(trig.condition, {
      state: ENGINE.state(), source: self, event: evt, who: who,
    });
  }
  return true;
}
