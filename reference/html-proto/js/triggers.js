// condId → (events, label, check). Module-scope so card templates can reference at load time.

const TRIGGER_CONDITIONS = {
  // ─── cardEntersBattlefield ───────────────────────────────────────────
  thisEnters: {
    events: ['cardEntersBattlefield'],
    label: 'this enters the battlefield',
    check: (self, evt) => evt.card.iid === self.iid,
  },
  anotherCreatureYouEntersStrict: {
    events: ['cardEntersBattlefield'],
    label: 'another creature (Creature type) enters under your control',
    check: (self, evt, who) => evt.controller === who && evt.card.iid !== self.iid && evt.card.type === 'Creature',
  },
  anotherCreatureYouEntersOfSubtype: {
    // Tribal lord ("another Goblin enters").
    events: ['cardEntersBattlefield'],
    paramSchema: ['sub'],
    label: 'another creature of subtype X enters under your control',
    check: (self, evt, who, params) =>
      evt.controller === who
      && evt.card.iid !== self.iid
      && evt.card.sub
      && evt.card.sub.indexOf(params.sub) !== -1,
  },

  // ─── attacks ─────────────────────────────────────────────────────────
  thisAttacks: {
    events: ['attacks'],
    label: 'this attacks',
    check: (self, evt) => evt.attacker.iid === self.iid,
  },
  thisAttacksAfterOppLifeLoss: {
    // Sengir Knight bloodlust: enabled by any intra-turn life loss.
    events: ['attacks'],
    label: 'this attacks while the opponent has lost life this turn',
    check: (self, evt, who) => {
      if (evt.attacker.iid !== self.iid) return false;
      const G = ENGINE.state();
      const them = who === 'you' ? 'opp' : 'you';
      return G[them].lifeLostThisTurn > 0;
    },
  },
  creatureYouAttacksOfSubtype: {
    // Tribal commander ("Whenever a Goblin attacks").
    events: ['attacks'],
    paramSchema: ['sub'],
    label: 'a creature of subtype X you control attacks',
    check: (self, evt, who, params) => {
      const f = ENGINE.findCard(evt.attacker.iid);
      return f && f.controller === who && f.card.sub && f.card.sub.indexOf(params.sub) !== -1;
    },
  },

  // ─── cardDies ────────────────────────────────────────────────────────
  thisDies: {
    events: ['cardDies'],
    label: 'this dies',
    check: (self, evt) => evt.card.iid === self.iid,
  },
  // Superset of thisDies (death + bounce + exile + shuffle + steal). Pick ONE of (thisDies, thisLeaves).
  thisLeaves: {
    events: ['cardLeavesBattlefield'],
    label: 'this leaves the battlefield',
    check: (self, evt) => evt.card.iid === self.iid,
  },
  anotherCreatureDies: {
    // Either side — tribal "yours OR theirs" payoffs.
    events: ['cardDies'],
    label: 'another creature (any side) dies',
    check: (self, evt) => evt.card.type === 'Creature' && evt.card.iid !== self.iid,
  },
  anyCardDies: {
    // Blood Artist — fires on ANY death incl. self.
    events: ['cardDies'],
    label: 'any card dies (including this)',
    check: () => true,
  },
  thisKillsCreature: {
    // Sengir/Endomorph — reads damagedBySources on the dying card.
    events: ['cardDies'],
    label: 'this creature kills another creature',
    check: (self, evt) =>
      evt.card.iid !== self.iid
      && evt.card.type === 'Creature'
      && (evt.card.damagedBySources instanceof Set)
      && evt.card.damagedBySources.has(self.iid),
  },

  // ─── lifeGained ──────────────────────────────────────────────────────
  youGainLife: {
    events: ['lifeGained'],
    label: 'you gain life',
    check: (self, evt, who) => evt.who === who,
  },

  // ─── spellCast ───────────────────────────────────────────────────────
  youCastSpell: {
    // Self-exclusion is defensive against future event-semantics shifts.
    events: ['spellCast'],
    label: 'you cast a spell (other than this)',
    check: (self, evt, who) => evt.controller === who && evt.card.iid !== self.iid,
  },
  youCastCounterspell: {
    // Counter Specialist — any spell with a counter effect.
    events: ['spellCast'],
    label: 'you cast a non-self spell with a counter effect',
    check: (self, evt, who) => {
      if (evt.controller !== who || evt.card.iid === self.iid) return false;
      return ENGINE.cardHasEffect(evt.card, e => e.kind === 'counter');
    },
  },
};

// ─── Composable atomic predicates (Slice 2 / DIVERGENCE E2) ──────────────
// New-vocabulary predicates over the unified event shapes (§3 of
// plan-zone-change-and-composable-predicates.md):
//   card_zone_change {kind, subject_iid, subject_card, controller, from_zone, to_zone, killed_by_iid?}
//   spell_cast       {kind, subject_iid, subject_card, controller}
//   attacks          {kind, subject_iid, subject_card, controller, defender_key}
//   life_changed     {kind, who, delta, source_iid?}
// Each atomic takes (ctx, args); ctx = {state, source, event, who} where `who`
// is the trigger source's controller (Godot resolves the same from
// source.controller_key — the per-engine signature detail; the evaluator
// shape is the parallel part). These run in PARALLEL with the legacy
// TRIGGER_CONDITIONS until card migration (step 6) retires condId.

function _predOtherPlayer(who) { return who === 'you' ? 'opp' : 'you'; }
function _predResolvePlayer(token, who) { return token === 'you' ? who : _predOtherPlayer(who); }

const ATOMIC_PREDICATES = {
  // Card predicates (events with a subject_card)
  this_card:        (ctx) => !!ctx.event.subject_card && ctx.event.subject_card.iid === ctx.source.iid,
  another_card:     (ctx) => !!ctx.event.subject_card && ctx.event.subject_card.iid !== ctx.source.iid,
  card_is_creature: (ctx) => !!ctx.event.subject_card && ctx.event.subject_card.type === 'Creature',
  controlled_by:    (ctx, args) => ctx.event.controller === _predResolvePlayer(args[0], ctx.who),
  card_moves:       (ctx, args) => {
    const from = args[0], to = args[1];
    const fromOk = from === 'anywhere' || ctx.event.from_zone === from;
    const toOk = to === 'anywhere' || ctx.event.to_zone === to;
    return fromOk && toOk;
  },
  card_has_subtype: (ctx, args) => {
    const c = ctx.event.subject_card;
    return !!c && Array.isArray(c.sub) && c.sub.indexOf(args[0]) !== -1;
  },
  card_damaged_by_this: (ctx) => {
    const c = ctx.event.subject_card;
    return !!c && (c.damagedBySources instanceof Set) && c.damagedBySources.has(ctx.source.iid);
  },
  card_has_effect:  (ctx, args) => {
    const c = ctx.event.subject_card;
    return !!c && ENGINE.cardHasEffect(c, (e) => e.kind === args[0]);
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

// ─── Boot validation (Slice 2 / E2) ─────────────────────────────────────
// Allowed trigger event kinds. New unified vocabulary + legacy kinds (the
// latter accepted during the migration window; removed in step 8).
const VALID_TRIGGER_EVENTS = new Set([
  'card_zone_change', 'spell_cast', 'attacks', 'life_changed',
  'cardEntersBattlefield', 'cardDies', 'cardLeavesBattlefield', 'lifeGained', 'spellCast',
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
// to console for the running app. Legacy condId triggers validate via their
// own registry lookup at eval time, so they're not re-checked here.
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

// Resolve: composable condition → condId registry → legacy closure → fire unconditionally.
function evalTriggerCondition(trig, self, evt, who) {
  // Codex-generated trigger guard: refuse to fire when source caused the event.
  if (trig.noSelfCascade && evt && evt.sourceIid != null && evt.sourceIid === self.iid) {
    return false;
  }
  // New composable `condition` (string / array / {op|name} dict). Distinguished
  // from the LEGACY `condition` FUNCTION (handled below) by type.
  if (trig.condition != null && typeof trig.condition !== 'function') {
    return evaluateCondition(trig.condition, {
      state: ENGINE.state(), source: self, event: evt, who: who,
    });
  }
  if (trig.condId) {
    const entry = TRIGGER_CONDITIONS[trig.condId];
    if (!entry) {
      console.warn('Unknown condId on trigger:', trig.condId, 'for', self.name);
      return false;
    }
    return entry.check(self, evt, who, trig.params || {});
  }
  if (typeof trig.condition === 'function') {
    return trig.condition(self, evt, who);
  }
  return true;
}
