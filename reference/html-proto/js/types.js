// Unified type identity — the SOLE source of truth for a card's type line.
//
// Every card (data + runtime instance) carries a `types[]` tag array; the legacy
// `card.type` (single string) + `card.sub` (space-separated subtypes) fields were
// removed in the cutover, and ALL engine/render reads go through the accessors
// here — hasType / subtypesOf / governingType / isPermanent / typeLine. There is
// no parallel representation: a card's identity lives in one array.
//
// On top of the stored tags sits the live type-modifier layer (`card.typeGrants`:
// add_type / set_types), applied per-read so animate/neutralize effects are
// reflected everywhere without mutating the base array.

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

// A card's effective tag list. Base = the stored `card.types` array. The
// `Legendary` supertype (from the `legendary` boolean) is unioned in — never
// dropped — so the legend rule keeps firing for a legendary card. Then the live
// type-modifier layer
// (`card.typeGrants`: add_type / set_types) is applied: a 'set' grant replaces
// the working set, an 'add' grant unions tags in. Grants are applied in order;
// eot grants clear at end of turn, leave-play grants clear in resetInPlayState.
function typesOf(card) {
  if (!card) return [];
  let base = Array.isArray(card.types) ? card.types.slice() : [];
  if (card.legendary && !base.includes('Legendary')) base.unshift('Legendary');
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

// Append a tag to a card's PERMANENT stored `types[]`, deduped against the
// stored base. The single write helper for type identity, so callers (sticker
// subtype rolls, staple-merge unions) don't reach past the accessor layer with a
// raw `types.push` idiom. Dedup is against `card.types`, NOT the effective set
// (typesOf): the store is the card's permanent identity, so a tag that's only
// *temporarily* present via a `typeGrants` add/set must still be stored — else it
// would vanish when the grant clears. Returns the card for chaining.
function addType(card, tag) {
  if (!card || !tag) return card;
  if (!Array.isArray(card.types)) card.types = [];
  if (!card.types.includes(tag)) card.types.push(tag);
  return card;
}

// The card's subtype tags only (the right-of-em-dash set) in declaration order.
// The single replacement for the retired `card.sub.split(/\s+/)` idiom — subtype
// rolls, staple-merge unions, and lord-buff matching all read subtypes through
// this so there's one definition of "what are this card's subtypes."
function subtypesOf(card) {
  return typesOf(card).filter(t => typeCategory(t) === 'subtype');
}

// The single behavioral type that governs zone / cast / combat (see spec §3,
// "two forks"): a permanent type beats a spell type; among permanents,
// Creature > Land > Artifact (Artifact is a co-type). Identity comes from the
// `types[]` array; the legacy `card.type`/`card.sub` fields were removed in v2.0.70.
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

// The type line's ordered halves: {left: [supertypes, types], right: [subtypes]},
// deduped, canonical order. typeLine() joins them into the display string;
// render.js's typeLineHtml() walks the same parts to wrap sticker-added tags
// in a gold span — one ordering definition for both consumers.
function typeLineParts(card) {
  const seen = new Set();
  const tags = typesOf(card).filter(t => { if (seen.has(t)) return false; seen.add(t); return true; });
  return {
    left: [
      ...tags.filter(t => typeCategory(t) === 'supertype'),
      ...tags.filter(t => typeCategory(t) === 'type'),
    ],
    right: tags.filter(t => typeCategory(t) === 'subtype'),
  };
}

// The displayed type line: "<supertypes> <types> — <subtypes>", canonical order
// (supertypes then types left of the em-dash, subtypes right), deduped. For
// most cards this matches the old `type [— sub]` render — EXCEPT basics, whose
// types[] carries both "Basic" (supertype) and "Land" (type): the parser keeps
// "Basic" left of the dash, dedups, and renders the MTG-style "Basic Land".
function typeLine(card) {
  const parts = typeLineParts(card);
  let s = parts.left.join(' ');
  if (parts.right.length) s += ' — ' + parts.right.join(' ');
  return s;
}
