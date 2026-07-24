// Card data registry + async loader. Card templates live in
// cards/<tplId>/card.json — one folder per card; this file declares CARDS as
// an empty object, exposes loadCards() to populate it from the manifest, and
// holds the supporting registries that don't fit the per-card model (TOKENS,
// KEYWORDS, STICKERS, EMPOWER_FIELDS, KEYWORD_DISPLAY, KEYWORD_STICKER_WEIGHTS).
//
// CARDS starts empty. Every consumer reads it via `CARDS[tplId]` at runtime
// (never at module-load), so the empty-initial state is fine — by the time
// any game logic runs, main.js has awaited loadCards().
//
// Tests sync-load the same JSON files via tests/_setup.js (Node fs) rather
// than going through the async fetch path.
//
// tplId persists in saves/PICKLOG — renames need save migration.
const CARDS = {};

// Wire format is canonical snake_case (docs/STANDARDIZATION-PLAN.md §4). The
// loader rebinds to the JS-internal camelCase names the engine has used since
// day one, so engine code stays unchanged while the JSON files become the
// cross-engine source of truth (Godot reads the same shape).
//
// Wire    →  JS-internal
//   card_id  →  tplId
//   (derived) →  color, colors (from cost; authored values are kept but discouraged — see cards/CLAUDE.md)
function ingestCard(card) {
  if (card == null || typeof card !== 'object') return card;
  if (Object.prototype.hasOwnProperty.call(card, 'card_id')) {
    card.tplId = card.card_id;
    delete card.card_id;
  }
  if (!Object.prototype.hasOwnProperty.call(card, 'color')
      || !Object.prototype.hasOwnProperty.call(card, 'colors')) {
    const colors = [];
    if (card.cost) {
      for (const c of ['W', 'U', 'B', 'R', 'G']) {
        if ((card.cost[c] || 0) > 0) colors.push(c);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(card, 'color')) card.color = colors[0] || null;
    if (!Object.prototype.hasOwnProperty.call(card, 'colors')) card.colors = colors;
  }
  // Normalize any function-call-shorthand effects to canonical dicts (§5.1/§5.2).
  // No-op for dict-form effects.
  if (typeof normalizeCardEffects === 'function') normalizeCardEffects(card);
  grantBasicLandMana(card);
  return card;
}

// The five basic land types and the color each conveys (MTG 305.6), declared
// in WUBRG order (basicLandTypeColors' iteration relies on it). Shared by the
// autogrant below and by the display layer (card-text's mana-ability
// suppression + render's big-mana-symbol gate), so "which colors does the type
// line promise?" has exactly one definition.
const BASIC_LAND_MANA = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

// Colors conveyed by a card's basic-land subtypes, in canonical WUBRG order
// (walks BASIC_LAND_MANA, not types[], so subtype-ADD order — e.g. an "Also a
// Plains" sticker landing after Forest — can't leak into the result). Today's
// consumers only do membership checks, but a stable identity order keeps the
// function safe for display use. Empty for non-lands and for lands with no
// basic-land subtype.
function basicLandTypeColors(card) {
  if (typeof typesOf !== 'function' || !hasType(card, 'Land')) return [];
  const out = [];
  for (const [tag, color] of Object.entries(BASIC_LAND_MANA)) {
    if (hasType(card, tag)) out.push(color);
  }
  return out;
}

// Intrinsic mana from a basic-land subtype (MTG 305.6): a Land with the
// Plains/Island/Swamp/Mountain/Forest subtype produces the matching color. Lets
// artifact/nonbasic lands — AND runtime land-type STICKERS ("Also a Mountain") —
// DERIVE their mana from the subtype instead of hand-authoring a tap ability:
// add the subtype, get the mana. Routed through grantManaAbility so a land with
// MORE than one mana source folds into a single "{T}: Add one of …" choose-
// ability (the shape landProducibleColors and the tap action expect) rather than
// several competing {T} abilities — that's what makes a stickered dual land tap
// for both colors. grantManaAbility no-ops when the color is already produced, so
// re-running after a sticker adds a land type is safe. (Basic lands carry both
// their color subtype AND an explicit authored ability — the autogrant no-ops on
// them; the explicit ability stays so the Godot JSON loader, which has no §305.6
// autogrant, still reads a complete card.)
function grantBasicLandMana(card) {
  if (!(typeof typesOf === 'function' && typeof grantManaAbility === 'function' && hasType(card, 'Land'))) return;
  for (const tag of typesOf(card)) {
    const color = BASIC_LAND_MANA[tag];
    if (color) grantManaAbility(card, color);
  }
}

async function loadCards() {
  const base = 'cards/';
  const manifest = await fetch(base + '_manifest.json').then(r => r.json());
  const cards = await Promise.all(
    manifest.map(id => fetch(base + id + '/card.json').then(r => r.json()))
  );
  for (const card of cards) {
    ingestCard(card);
    CARDS[card.tplId] = card;
    // The ~ character is a reserved placeholder for the card's own name
    // in trigger / effect templates (formatTriggerText in card-text.js).
    // A literal ~ in a name would get silently substituted later; a literal
    // ~ in text would do the same. Warn on either so we catch authoring slips.
    if (typeof card.name === 'string' && card.name.includes('~')) {
      console.warn('Card name contains reserved ~ placeholder:', card.tplId, JSON.stringify(card.name));
    }
    if (typeof card.text === 'string' && card.text.includes('~') && !card.custom_text) {
      console.warn('Card text contains ~ outside custom_text flag:', card.tplId);
    }
  }
}

// TOKENS — minted by effects. Vanish on leave-play (dies-triggers still fire).
const TOKENS = {
  spirit_w_1_1:  {name:'Spirit',  types:['Creature','Spirit'],  power:1, toughness:1, art:'👻', color:'W', keywords:['flying']},
  soldier_w_1_1: {name:'Soldier', types:['Creature','Human','Soldier'], power:1, toughness:1, art:'⚔', color:'W'},
  goblin_r_1_1:  {name:'Goblin',  types:['Creature','Goblin'],  power:1, toughness:1, art:'👺', color:'R', keywords:['haste']},
};

// SHARED CONSTANTS — new keywords here auto-become available stickers.
const KEYWORDS = [
  'flying', 'vigilance', 'trample', 'haste',
  'first_strike', 'reach', 'defender', 'indestructible',
  'lifelink', 'deathtouch', 'menace', 'hexproof', 'flash',
  'unblockable',
  // Non-combat marker keyword: a card with `innate` starts in the opening
  // hand. Generally lives on lands. Like flash it does nothing in combat —
  // it's a status keyword, excluded from the combat keyword preamble and
  // rendered via its own status line/badge. Source of truth lives in
  // `keywords` (no separate boolean); the lands-only `innate` sticker below
  // grants it, and the kw_* auto-loop skips it so it's never offered on
  // creatures.
  'innate',
];

// STICKERS — run-long card mods. Shape: {id, name, text, appliesTo, stackable, kind, weight, ...payload}.
const STICKERS = {};
STICKERS['plus1_plus1'] = {
  id: 'plus1_plus1', name: '+1/+1',
  text: '+1 power and +1 toughness.',
  appliesTo: (c) => hasType(c, 'Creature'),
  stackable: true,
  weight: 20,
  kind: 'stat_boost', power: 1, toughness: 1,
};
// Innate is a keyword-granting sticker like the kw_* family, but hand-defined
// (rather than auto-generated by the loop below) so it can be lands-only:
// `innate` is generally a land keyword, and we never want it offered on
// creatures. It's mechanically compatible with any card if granted some other
// way, but no normal pipeline puts it on a non-land.
STICKERS['innate'] = {
  id: 'innate', name: 'Innate',
  text: 'Starts in your opening hand.',
  appliesTo: (c) => hasType(c, 'Land') && !(c.keywords || []).includes('innate'),
  stackable: false,
  weight: 10,
  kind: 'keyword', keyword: 'innate',
};
// landColor stickers — add a basic-land subtype (so the name "Also a Mountain"
// is literally true), and the matching mana falls out of the §305.6 autogrant
// (grantBasicLandMana). The land becomes a real typed Plains/Mountain/etc., so
// it also answers type-matters effects ("search for a Mountain"). Gated by deck
// color (c.deckColors).
for (const color of ['W','U','B','R','G']) {
  const id = 'land_color_' + color.toLowerCase();
  const colorName = { W:'Plains', U:'Island', B:'Swamp', R:'Mountain', G:'Forest' }[color];
  const colorAdj = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' }[color];
  STICKERS[id] = {
    id, name: 'Also a ' + colorName,
    text: 'This land is also a ' + colorName + ' (it also produces {' + color + '}).',
    appliesTo: (c) => {
      if (!hasType(c, 'Land')) return false;
      // Already produces this color (native, autogranted, or via a prior
      // land-type sticker)? Don't re-offer. Production is read via
      // landProducibleColors off the (auto)granted tap-ability.
      if (landProducibleColors(c).includes(color)) return false;
      if (c.deckColors && !c.deckColors.includes(color)) return false;
      return true;
    },
    stackable: false,
    weight: 10,
    kind: 'add_type',
    type: colorName,   // the basic-land subtype to add; grantBasicLandMana yields the mana
    color,
    colorAdj,
  };
}
// Cost reduction — strips 1 generic; floors at total ≥ 2 (no free 1-drops).
STICKERS['cost_minus_1'] = {
  id: 'cost_minus_1', name: 'Costs 1 Less',
  text: 'This costs {1} less to cast.',
  appliesTo: (c) => {
    if (hasType(c, 'Land')) return false;
    if (!c.cost) return false;
    const generic = c.cost.C || 0;
    if (generic < 1) return false;
    let total = generic;
    for (const k of ['W','U','B','R','G']) total += (c.cost[k] || 0);
    if (total < 2) return false;
    return true;
  },
  stackable: true,
  weight: 1,
  // cost_mod: signed amount (−1 reward, +1 embargo).
  kind: 'cost_mod',
  amount: -1,
};

// Empower bumps one buffable field per application. Roll recorded on
// slot.empowerRolls. Single source of truth for empowerable params.
// `move_card` is empowerable only in its draw shape (gated in
// isEmpowerableField).
const EMPOWER_FIELDS = {
  damage:         ['amount'],
  pump:           ['power', 'toughness'],
  gain_life:       ['amount'],
  affect_creature: ['severity'],
  create_tokens:   ['count'],
  move_card:      ['amount'],
};
function isEmpowerableField(eff, field) {
  if (!eff || !eff.kind) return false;
  const fields = EMPOWER_FIELDS[eff.kind];
  if (!fields || !fields.includes(field)) return false;
  // move_card is only empowerable as a draw (library→hand) — bumping a bounce/
  // mill/discard count isn't a meaningful "empower".
  if (eff.kind === 'move_card' && !(eff.from_zone === 'library' && eff.to_zone === 'hand')) return false;
  if (eff.kind === 'affect_creature' && field === 'severity') {
    return ENGINE.sevToNum(eff.severity) < 4;  // can't escalate past exile
  }
  // Skip {from:...} expressions (can't bump without losing semantics).
  const v = eff[field];
  if (typeof v === 'object' && v !== null && 'from' in v) return false;
  return true;
}
// Enumerate eligible (location, subIdx, effIdx, modeIdx, field) targets.
function enumerateEmpowerTargets(c) {
  const targets = [];
  const walkEffectsArray = (effs, location, subIdx, modeIdx) => {
    if (!Array.isArray(effs)) return;
    effs.forEach((e, effIdx) => {
      const fields = EMPOWER_FIELDS[e.kind];
      if (!fields) return;
      for (const f of fields) {
        if (isEmpowerableField(e, f)) {
          targets.push({location, subIdx, effIdx, modeIdx, field: f});
        }
      }
    });
  };
  const e = c.effects;
  if (Array.isArray(e)) {
    walkEffectsArray(e, 'effects', null, null);
  } else if (e && Array.isArray(e.modes)) {
    e.modes.forEach((modeEffs, modeIdx) => {
      walkEffectsArray(modeEffs, 'effects', null, modeIdx);
    });
  }
  if (Array.isArray(c.triggers)) {
    c.triggers.forEach((t, subIdx) => {
      walkEffectsArray(t.effects, 'triggers', subIdx, null);
    });
  }
  if (Array.isArray(c.abilities)) {
    c.abilities.forEach((a, subIdx) => {
      walkEffectsArray(a.effects, 'abilities', subIdx, null);
    });
  }
  return targets;
}
function hasEmpowerableEffect(c) {
  return enumerateEmpowerTargets(c).length > 0;
}
// Roll one empower target uniformly. Returns descriptor or null. Caller gates on hasEmpowerableEffect.
function rollEmpowerTarget(tpl) {
  const targets = enumerateEmpowerTargets(tpl);
  if (targets.length === 0) return null;
  return targets[Math.floor(Math.random() * targets.length)];
}
STICKERS['empower'] = {
  id: 'empower', name: 'Empower',
  text: 'A single number on this card is increased by 1 — rolled when applied. Stack for more rolls.',
  appliesTo: (c) => hasEmpowerableEffect(c),
  stackable: true,
  weight: 10,
  kind: 'empower',
  amount: 1,
};
// One sticker per keyword. "Has Flying", "Has First strike", etc.
// Display names use sentence case for multi-word keywords (matches MtG's
// modern card-text formatting: "First strike", not "First Strike").
const KEYWORD_DISPLAY = {
  flying: 'Flying', vigilance: 'Vigilance', trample: 'Trample', haste: 'Haste',
  first_strike: 'First strike', reach: 'Reach', defender: 'Defender',
  indestructible: 'Indestructible', lifelink: 'Lifelink', deathtouch: 'Deathtouch',
  menace: 'Menace', hexproof: 'Hexproof', flash: 'Flash',
  unblockable: 'Unblockable', innate: 'Innate',
};
// Reminder text for each keyword — short rules-gloss surfaced as the tooltip
// when a keyword icon is shown on a card (the icon replaces the keyword word
// on the small in-play frame; the tooltip reads "Flying: <reminder>"). Kept in
// sync with KEYWORDS / KEYWORD_DISPLAY.
const KEYWORD_REMINDER = {
  flying: 'Can only be blocked by creatures with flying or reach.',
  vigilance: "Attacking doesn't cause it to tap.",
  // Magiclike trample covers combat AND effect damage from a trampling
  // source (trample stickers on damaging sorceries are deliberate design) —
  // but never fights (audit A4-9 design ruling; see applyDamageFrom).
  trample: 'Damage beyond what would destroy the creature it hits (all blockers, in combat) carries over to that creature\'s controller. Fights never carry over.',
  haste: 'It can attack and use tap abilities the turn it comes under your control.',
  first_strike: 'It deals combat damage before creatures without first strike.',
  reach: 'It can block creatures with flying.',
  defender: "It can't attack.",
  indestructible: "It can't be destroyed by lethal damage or “destroy” effects.",
  lifelink: 'Damage it deals also causes you to gain that much life.',
  deathtouch: 'Any amount of combat damage it deals to a creature is enough to destroy it.',
  menace: "It can't be blocked except by two or more creatures.",
  hexproof: "It can't be the target of spells or abilities your opponents control.",
  flash: 'You may cast it any time you could cast an instant.',
  unblockable: "It can't be blocked.",
  innate: 'It starts in your opening hand.',
};
// Per-keyword sticker offer weight. Higher = more common in pair offers.
//   1 = rare/strong (game-warping when stuck)
//   10 = baseline (everything else)
const KEYWORD_STICKER_WEIGHTS = {
  indestructible: 1, hexproof: 1, unblockable: 1,
  // All other keywords default to 10 below.
};
// Helper for keyword-sticker eligibility on instants/sorceries: does this
// card have any damage-dealing effect? Used to gate lifelink/deathtouch
// stickers — those only make sense on cards that actually deal damage.
// Modal-aware: walks all modes for modal cards, so a Charm with one
// damage mode is eligible for damage-tied stickers.
function spellDealsDamage(c) {
  return ENGINE.cardHasEffect(c, e => e.kind === 'damage');
}

for (const kw of KEYWORDS) {
  // Defender is a downside keyword — never offered as a sticker reward.
  if (kw === 'defender') continue;
  // Innate has its own hand-defined, lands-only sticker (STICKERS['innate']
  // above); the generic loop would wrongly make it creature-eligible.
  if (kw === 'innate') continue;
  const id = 'kw_' + kw;
  const displayName = KEYWORD_DISPLAY[kw] || (kw.charAt(0).toUpperCase() + kw.slice(1));
  STICKERS[id] = {
    id, name: 'Has ' + displayName,
    text: 'Gains ' + displayName + '.',
    appliesTo: (c) => {
      // Don't offer a keyword the card already has (native or stickered).
      if ((c.keywords || []).includes(kw)) return false;
      if ((c.stickers || []).some(sId => STICKERS[sId] && STICKERS[sId].keyword === kw)) return false;
      // Flash is also offered on sorceries (gives them instant speed).
      if (kw === 'lifelink' || kw === 'deathtouch' || kw === 'trample') {
        if (hasType(c, 'Creature')) {
        } else if (hasType(c, 'Sorcery') && spellDealsDamage(c)) {
        } else {
          return false;
        }
      } else if (kw === 'flash') {
        if (!hasType(c, 'Creature') && !hasType(c, 'Sorcery')) return false;
      } else {
        if (!hasType(c, 'Creature')) return false;
      }
      // Reach is only useful as a defensive ground-blocker upgrade — fliers
      // already block fliers, so reach is strictly redundant on them.
      if (kw === 'reach' && (c.keywords || []).includes('flying')) return false;
      return true;
    },
    stackable: false,
    weight: KEYWORD_STICKER_WEIGHTS[kw] || 10,
    kind: 'keyword',
    keyword: kw,
    // Only combat-trophy keyword stickers require this keyword to have been
    // claimed in the game that produced the reward. Application kind is not
    // provenance: Innate is also kind:'keyword' but is a normal land mod.
    claimKeyword: kw,
  };
}
// Lose Defender — the one keyword-REMOVAL sticker. Defender is pure downside
// (a creature that can't attack), so stripping it is a clean upgrade. Offered
// only on creatures that actually have defender (native). Mirror of the keyword
// add-stickers above, routed through the 'remove_keyword' kind. Defender is the
// only keyword worth a removal sticker today; generalize if that changes.
STICKERS['lose_defender'] = {
  id: 'lose_defender', name: 'Loses Defender',
  text: 'This creature loses Defender (it can attack).',
  appliesTo: (c) => hasType(c, 'Creature') && (c.keywords || []).includes('defender'),
  stackable: false,
  weight: 10,
  kind: 'remove_keyword',
  keyword: 'defender',
};
// Subtype sticker — adds a creature subtype rolled from the player's deck,
// weighted by token frequency. Roll excludes subtypes the target already
// has, so it can't be inert. Storage mirrors Empower: rolls live on
// slot.subtypeRolls in parallel to 'subtype' occurrences in slot.stickers.
//
// Use cases: triggering tribal lord buffs, satisfying tribal search/recursion.
// Subs are space-joined and word-boundary-matched, so "Human Wizard" can
// gain "Goblin" and pick up Goblin lord buffs while still being a Wizard.
STICKERS['subtype'] = {
  id: 'subtype', name: 'Subtype',
  text: 'This creature gains a random creature subtype drawn from your deck.',
  appliesTo: (c) => hasType(c, 'Creature'),
  stackable: true,
  weight: 10,
  kind: 'subtype',
};
// Scarified — boss-only sticker applied by Scarification. Adds an ETB
// trigger to the creature: each time it enters the battlefield, the
// controller loses 1 life. Persistent across the run (sticker lives on
// the slot), so a scarred creature haunts the player for many games.
// weight: 0 — never appears in normal reward pools, only applied by the
// dedicated effect. appliesTo restricts to Creatures for safety.
STICKERS['scarified'] = {
  id: 'scarified', name: 'Scarred',
  text: 'When this enters the battlefield, its controller loses 1 life.',
  appliesTo: (c) => hasType(c, 'Creature'),
  stackable: true,         // multiple scarifications stack — each fires on ETB
  weight: 0,
  kind: 'trigger',
  trigger: {
    event: 'card_zone_change',
    condition: ['this_card', 'card_moves(anywhere, battlefield)'],
    text: '~ enters: its controller loses 1 life.',
    // scope:'self' for player-operating effects (damage/gain_life/discard/
    // draw) resolves to the source's controller at trigger time. Pushed
    // onto card.triggers when the sticker applies via the standard
    // sticker-trigger path in stickers.js (the sticker-apply trigger push).
    effects: [{ kind: 'gain_life', scope: 'self', amount: -1 }],
  },
};



