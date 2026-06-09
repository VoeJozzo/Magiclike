// Card data registry + async loader.
//
// Card templates used to live inline in this file as one giant CARDS = {...}
// object literal. They now live in cards/<tplId>/card.json — one folder per
// card. This file:
//   - declares CARDS as an empty object at module-load time
//   - exposes loadCards() which fetches cards/_manifest.json + each
//     card.json in parallel and populates CARDS
//   - keeps the supporting registries that don't fit the per-card model
//     (TOKENS, KEYWORDS, STICKERS, EMPOWER_FIELDS, KEYWORD_DISPLAY,
//     KEYWORD_STICKER_WEIGHTS, RUN_MODIFIERS) inline below
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
//   (derived) →  color, colors (computed from cost; not stored in JSON)
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
  // No-op for dict-form effects, so the current all-dict pool is unaffected.
  if (typeof normalizeCardEffects === 'function') normalizeCardEffects(card);
  // Intrinsic mana from a basic-land subtype (MTG 305.6): a Land with the
  // Plains/Island/Swamp/Mountain/Forest subtype gets the matching "{T}: Add {C}"
  // ability, unless it already produces that color. Lets artifact/nonbasic lands
  // DERIVE their mana from the subtype instead of hand-authoring a tap ability —
  // add the subtype, get the mana. (Basic lands carry sub "Basic Land", not a
  // color subtype, so they keep their explicit ability and are unaffected.)
  if (typeof typesOf === 'function' && typeof manaAbilityForColors === 'function' && hasType(card, 'Land')) {
    const BASIC_LAND_MANA = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
    const produced = new Set();
    for (const ab of (card.abilities || [])) {
      if (ab && ab.cost && ab.cost.tap && Array.isArray(ab.effects)) {
        for (const e of ab.effects) {
          if (e && e.kind === 'add_mana') for (const c of manaEffectColors(e)) produced.add(c);
        }
      }
    }
    for (const tag of typesOf(card)) {
      const color = BASIC_LAND_MANA[tag];
      if (color && !produced.has(color)) {
        if (!Array.isArray(card.abilities)) card.abilities = [];
        card.abilities.push(manaAbilityForColors([color]));
        produced.add(color);
      }
    }
  }
  return card;
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
  // Defensive: warn if the loaded count doesn't match the manifest. A
  // missing card.json (404) would resolve to a parse error and reject the
  // Promise.all, so reaching here with a mismatched count would only
  // happen if a manifest entry deserialized to something falsy.
  if (cards.length !== manifest.length) {
    console.warn('Card load count mismatch:', cards.length, 'vs', manifest.length);
  }
}

// TOKENS — minted by effects. Vanish on leave-play (dies-triggers still fire).
const TOKENS = {
  spirit_w_1_1:  {name:'Spirit',  types:['Creature','Spirit'],  power:1, toughness:1, art:'👻', color:'W', text:'Flying', keywords:['flying']},
  soldier_w_1_1: {name:'Soldier', types:['Creature','Human','Soldier'], power:1, toughness:1, art:'⚔', color:'W'},
  goblin_r_1_1:  {name:'Goblin',  types:['Creature','Goblin'],  power:1, toughness:1, art:'👺', color:'R', text:'Haste', keywords:['haste']},
  saproling_g_1_1: {name:'Saproling', types:['Creature','Saproling'], power:1, toughness:1, art:'🌱', color:'G'},
  bear_g_2_2:    {name:'Bear',    types:['Creature','Bear'],    power:2, toughness:2, art:'🐻', color:'G'},
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
  appliesTo: (c) => hasType(c, 'Land'),
  stackable: false,
  weight: 10,
  kind: 'keyword', keyword: 'innate',
};
// landColor stickers — extra color on a basic. Gated by deck color (c.deckColors).
for (const color of ['W','U','B','R','G']) {
  const id = 'land_color_' + color.toLowerCase();
  const colorName = { W:'Plains', U:'Island', B:'Swamp', R:'Mountain', G:'Forest' }[color];
  const colorAdj = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' }[color];
  STICKERS[id] = {
    id, name: 'Also a ' + colorName,
    text: 'This land also produces {' + color + '}.',
    appliesTo: (c) => {
      if (!hasType(c, 'Land')) return false;
      // Already produces this color (base or stickered)? Don't re-offer. §3.9:
      // production lives on the tap-ability, read via landProducibleColors.
      if (landProducibleColors(c).includes(color)) return false;
      if (c.deckColors && !c.deckColors.includes(color)) return false;
      return true;
    },
    stackable: false,
    weight: 10,
    kind: 'grant_mana_ability',
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
  // §3.8: unified onto the signed cost_mod kind (−1 reward / +1 embargo).
  kind: 'cost_mod',
  amount: -1,
};

// Empower bumps one buffable field per application. Roll recorded on slot.empowerRolls.
// Single source of truth for empowerable params, post-collapse (§3.5/§3.8):
// the mass kinds (damageAll/pumpAllYours/removeAll) folded into damage/pump/
// affect_creature + scope; weaken/add_counter into signed/permanent pump; draw
// into move_card(library→hand). `move_card` is empowerable ONLY in its draw
// shape (gated in isEmpowerableField).
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
  weight: 10,                  // baseline. Was 50 during early playtest to
                               // pump Empower into nearly every offer pool;
                               // dropped to baseline now that the mechanic
                               // is shipped and stable.
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
  trample: 'Combat damage beyond what would destroy its blockers is dealt to the defending player.',
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
  tap: 'The tap symbol — appears in activated-ability costs.',
};
// Per-keyword sticker offer weight. Higher = more common in pair offers.
// Keeping it minimal for now — tune as we get playtest signal.
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
      // Type-based eligibility:
      //   - Lifelink/Deathtouch/Trample: creatures, OR damaging spells.
      //   - Flash: creatures, OR sorceries (gives a sorcery instant speed).
      //   - All other keywords: creatures only.
      if (kw === 'lifelink' || kw === 'deathtouch' || kw === 'trample') {
        if (hasType(c, 'Creature')) {
          // OK
        } else if (hasType(c, 'Sorcery') && spellDealsDamage(c)) {
          // OK
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
  };
}
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
  weight: 0,               // not in random pools
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


// =========================================================================
// RUN MODIFIERS — Neow-style run-defining choices presented before draft.
// Each modifier: {id, name, text, apply()}. apply() returns {extras: [{tplId,
// stickers}, ...]} for bonus deck slots; pure (no runState mutation).
// Future hooks (stickerBias, lifeOffset, etc) can be added similarly.
// =========================================================================
const RUN_MODIFIERS = {};
// NOTE: no `art:` field on these. The boon picker derives the visual
// from CARDS[m.id].art (every boon's id matches the tplId of the card
// it grants). A boon CAN set an explicit `art:` to override, but
// shouldn't need to in normal cases — keeping the boon and the card
// visually in sync as art changes is the whole point.
RUN_MODIFIERS['architects_codex'] = {
  id: 'architects_codex',
  name: "The Architect's Codex",
  text: "Begin your run with The Architect's Codex — a 4-mana 2/3. The first time you draw it each game, choose one of three procedurally-generated abilities (or keep the current one).",
  apply: () => ({
    extras: [{ tplId: 'architects_codex', stickers: [] }],
  }),
};
RUN_MODIFIERS['city_of_brass'] = {
  id: 'city_of_brass',
  name: 'Polychrome Pact',
  text: 'Begin your run with a City of Brass already in hand. Taps for any color.',
  // Pinned during early development to guarantee a universally-applicable
  // boon was always available. Now unpinned — competes with other boons
  // in the random rotation. Re-pin if a future round of playtest signals
  // that the boon pool has grown disjoint enough that a stable fallback
  // is needed again.
  apply: () => ({
    extras: [{ tplId: 'city_of_brass', stickers: ['innate'] }],
  }),
};
RUN_MODIFIERS['endomorph'] = {
  id: 'endomorph',
  name: 'The Hungering Mimic',
  text: 'Begin your run with Endomorph in your deck — a 2-mana 2/2 that permanently absorbs a keyword from each creature it kills (or +1/+1 if it can\'t).',
  apply: () => ({
    extras: [{ tplId: 'endomorph', stickers: [] }],
  }),
};
RUN_MODIFIERS['steal'] = {
  id: 'steal',
  name: 'The Long Heist',
  text: 'Begin your run with Steal in your deck — a 5-mana instant that counters target spell or takes target permanent, putting it into your library forever.',
  apply: () => ({
    extras: [{ tplId: 'steal', stickers: [] }],
  }),
};
RUN_MODIFIERS['phylactery'] = {
  id: 'phylactery',
  name: 'Phylactery',
  text: "Begin your run with a Phylactery (Swamp, in opening hand). You can't lose to 0 life or to decking out — each damage past zero or would-be overdraw rips a slot from your deck instead. Phylactery itself is always ripped last.",
  apply: () => ({
    extras: [{ tplId: 'phylactery', stickers: ['innate'] }],
  }),
};
RUN_MODIFIERS['elystra_the_immortal'] = {
  id: 'elystra_the_immortal',
  name: 'Elystra the Immortal',
  text: "Begin your run with Elystra in your deck — a 3-mana 1/1. End-of-turn effects on her last forever, but every spell that targets her is ripped from its caster's deck after it resolves.",
  // v1.0.48: unpinned. Was pinned because Elystra was the headline build-around
  // and players wanted reliable access; with the pool grown (Codex, Mercurial,
  // others now competitive), guaranteed visibility crowds out exploration of
  // the other boons. Re-pin if the pool shrinks or Elystra-stacking runs
  // become so dominant that players regularly skip whatever boon got rolled.
  apply: () => ({
    extras: [{ tplId: 'elystra_the_immortal', stickers: [] }],
  }),
};

RUN_MODIFIERS['stapler'] = {
  id: 'stapler',
  name: 'Stapler',
  text: "Begin your run with Stapler — a {3} Artifact with 3 per-run charges. {3}, T: choose two target permanents, staple the second onto the first. When out of charges, ripped from the run.",
  // Charges initialize from CARDS.stapler.charges_at_run_start (= 3) via the
  // extras-loop in start(). Persist across games on slot.charges.
  // v1.0.68: unpinned. Was pinned during initial playtesting (v1.0.52) to
  // collect feedback on the in-game splice flow; mechanic is now stable
  // across many versions (charges/persistence/all 4 splice cases including
  // lands, double-staple guard, live-text updates, combat-state transfer).
  // Re-pin if the splice rewrite uncovers regressions.
  apply: () => ({
    extras: [{ tplId: 'stapler', stickers: [] }],
  }),
};

