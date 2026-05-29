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
  Enchantment: { category: 'type', behaviorClass: 'permanent' },
  Sorcery:     { category: 'type', behaviorClass: 'spell' },
  Instant:     { category: 'type', behaviorClass: 'spell' },  // retired in Phase 3 (-> flash Sorcery)
};

function typeRegistryEntry(tag) { return TYPE_REGISTRY[tag] || { category: 'subtype' }; }
function typeCategory(tag) { return typeRegistryEntry(tag).category; }
function isCardTypeTag(tag) { return typeCategory(tag) === 'type'; }

// A card's tag list, derived from the legacy fields: the `type` string first,
// then the `sub` subtypes (split on whitespace). Order matches the type line.
function typesOf(card) {
  if (!card) return [];
  const tags = [];
  if (card.type) tags.push(card.type);
  if (typeof card.sub === 'string') {
    for (const s of card.sub.split(/\s+/)) if (s) tags.push(s);
  }
  return tags;
}

// Membership over the effective type set (word-exact — same intent as the legacy
// `card_has_subtype` / matchFilter checks).
function hasType(card, tag) {
  return !!card && !!tag && typesOf(card).includes(tag);
}

// The single behavioral type that governs zone / cast / combat (see spec §3,
// "two forks"): a permanent type beats a spell type; among permanents,
// Creature > Land > Artifact/Enchantment (the latter are co-types). For today's
// single-type cards this is simply `card.type`.
const PERMANENT_PRECEDENCE = ['Creature', 'Land', 'Artifact', 'Enchantment'];
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

// The displayed type line: "<types> — <subtypes>", canonical order (type tags
// left of the em-dash, subtype tags right), deduped. For today's single-type
// cards this equals the legacy `card.type + (card.sub ? ' — ' + card.sub : '')`
// (render.js:1322) — EXCEPT the handful of basic lands whose legacy `sub`
// redundantly repeats the word "Land" (e.g. `sub: "Basic Land"` rendered as
// "Land — Basic Land"); the parser hoists that type word left and dedups it to
// "Land — Basic", which is the corrected form. Inert until Phase 2 swaps the
// render site; the underlying basic-land data is cleaned in Phase 3.
function typeLine(card) {
  const seen = new Set();
  const tags = typesOf(card).filter(t => { if (seen.has(t)) return false; seen.add(t); return true; });
  const left = tags.filter(t => typeCategory(t) === 'type');     // (+ supertypes later)
  const right = tags.filter(t => typeCategory(t) === 'subtype');
  let s = left.join(' ');
  if (right.length) s += ' — ' + right.join(' ');
  return s;
}
