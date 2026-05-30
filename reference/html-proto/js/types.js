// Unified type identity — Phase 1 of docs/plan-unified-type-system.md.
//
// ADDITIVE FOUNDATION, zero behavior change: this module derives a card's type
// tags from the legacy `card.type` (single string) + `card.sub` (space-separated
// subtypes) and exposes the future single source of truth — hasType /
// governingType / typeLine. NOTHING in the engine reads these yet; Phase 2
// migrates the ~50 `card.type === X` / `card.sub` reads onto them. For now they
// run *alongside* the legacy fields and are proven equivalent by
// tests/test_types_identity.js (all 258 cards).
//
// Derivation is ON-DEMAND (no stored `card.types` field) so it can never go
// stale when a sticker mutates `sub`. The stored-array-as-source + the live
// type-modifier layer arrive in Phase 3, when `types[]` is authored directly.

// Registry: each known tag -> { category, behaviorClass? }.
//   category      : 'type' (left of the em-dash) | 'subtype' (right). 'supertype'
//                   reserved (e.g. a future Legendary tag).
//   behaviorClass : 'spell' | 'permanent' | 'land' — drives governingType().
// Unknown tags (Goblin, Forest, Cleric, ...) default to a behavior-less subtype.
const TYPE_REGISTRY = {
  Creature:    { category: 'type', behaviorClass: 'permanent' },
  Land:        { category: 'type', behaviorClass: 'land' },
  Artifact:    { category: 'type', behaviorClass: 'permanent' },
  Sorcery:     { category: 'type', behaviorClass: 'spell' },
  // Supertypes render left of the type, carry no behavior-class. 'Basic' (basic
  // lands) and 'Legendary' (the legend rule — a cast-time uniqueness check, read
  // via hasType, NOT a registry hook per §4) are the two today.
  Basic:       { category: 'supertype' },
  Legendary:   { category: 'supertype' },
};

function typeRegistryEntry(tag) { return TYPE_REGISTRY[tag] || { category: 'subtype' }; }
function typeCategory(tag) { return typeRegistryEntry(tag).category; }
function isCardTypeTag(tag) { return typeCategory(tag) === 'type'; }

// A card's effective tag list. Base = an explicit `card.types` array (multi-type
// cards, Phase 4+) when present, else derived from the legacy fields. The
// `Legendary` supertype (from the `legendary` boolean) is unioned in on BOTH
// paths — never dropped by an explicit types[] — so the legend rule keeps
// firing for a legendary multi-type card. Then the live type-modifier layer
// (`card.typeGrants`: add_type / set_types) is applied: a 'set' grant replaces
// the working set, an 'add' grant unions tags in. Grants are applied in order;
// eot grants clear at end of turn, leave-play grants clear in resetInPlayState.
function typesOf(card) {
  if (!card) return [];
  let base;
  if (Array.isArray(card.types)) {
    base = card.types.slice();
    if (card.legendary && !base.includes('Legendary')) base.unshift('Legendary');
  } else {
    base = [];
    if (card.legendary) base.push('Legendary');
    if (card.type) base.push(card.type);
    if (typeof card.sub === 'string') {
      for (const s of card.sub.split(/\s+/)) if (s) base.push(s);
    }
  }
  if (Array.isArray(card.typeGrants)) {
    for (const g of card.typeGrants) {
      if (!g || !Array.isArray(g.tags)) continue;
      if (g.op === 'set') base = g.tags.slice();
      else for (const t of g.tags) if (t && !base.includes(t)) base.push(t);
    }
  }
  return base;
}

// Membership over the effective type set (word-exact — same intent as the legacy
// `card_has_subtype` / matchFilter checks).
function hasType(card, tag) {
  return !!card && !!tag && typesOf(card).includes(tag);
}

// The single behavioral type that governs zone / cast / combat (see spec §3,
// "two forks"): a permanent type beats a spell type; among permanents,
// Creature > Land > Artifact (Artifact is a co-type). For today's
// single-type cards this is simply `card.type`.
const PERMANENT_PRECEDENCE = ['Creature', 'Land', 'Artifact'];
function governingType(card) {
  const tags = typesOf(card).filter(isCardTypeTag);
  for (const t of PERMANENT_PRECEDENCE) {       // permanents win the first fork
    if (tags.includes(t)) return t;
  }
  for (const t of tags) {                        // else a spell type governs
    if (typeRegistryEntry(t).behaviorClass === 'spell') return t;
  }
  return tags[0] || null;
}

// True if the card is a permanent (enters & stays) vs a one-shot spell.
function isPermanent(card) {
  const g = governingType(card);
  return !!g && typeRegistryEntry(g).behaviorClass !== 'spell';
}

// The displayed type line: "<supertypes> <types> — <subtypes>", canonical order
// (supertypes then types left of the em-dash, subtypes right), deduped. For
// today's single-type cards this equals the legacy
// `card.type + (card.sub ? ' — ' + card.sub : '')` (render.js) — EXCEPT the
// basic lands, whose legacy `sub` redundantly repeats the type word "Land"
// (`sub: "Basic Land"` rendered as "Land — Basic Land"). The parser classifies
// "Basic" as a supertype and "Land" as the type, dedups the repeat, and renders
// the corrected MTG-style "Basic Land" (City of Brass `sub: "Land"` → "Land").
function typeLine(card) {
  const seen = new Set();
  const tags = typesOf(card).filter(t => { if (seen.has(t)) return false; seen.add(t); return true; });
  const left = [
    ...tags.filter(t => typeCategory(t) === 'supertype'),
    ...tags.filter(t => typeCategory(t) === 'type'),
  ];
  const right = tags.filter(t => typeCategory(t) === 'subtype');
  let s = left.join(' ');
  if (right.length) s += ' — ' + right.join(' ');
  return s;
}
