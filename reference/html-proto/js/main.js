
// Scope: module-level for data + pure helpers; ENGINE/DRAFT/RUN/CONTROLLER
// IIFEs hold state + its mutators. Cross-IIFE refs are ReferenceErrors at
// call time — pure helpers go to module scope, parameterized.

const VERSION = 'v1.0.129';

function opp(who) { return who === 'you' ? 'opp' : 'you'; }

// CARD TEMPLATES — pure data.

// TRIGGER_CONDITIONS: condId → named predicate. Closures still work as
// fallback. IMPORTANT: when adding an entry, also add to /tmp/trigger_vocab_test.js
// — forcing function that prevents silent gaps.
const TRIGGER_CONDITIONS = {
  // ─── ETB / cardEntersBattlefield ─────────────────────────────────────
  thisEnters: {
    events: ['cardEntersBattlefield'],
    label: 'this enters the battlefield',
    check: (self, evt) => evt.card.iid === self.iid,
  },
  anotherCreatureYouEntersStrict: {
    // Same as above with explicit type === 'Creature' check. Used where
    // the original closure had the type guard. Kept distinct so migration
    // is a faithful 1:1 translation rather than a behavior change.
    events: ['cardEntersBattlefield'],
    label: 'another creature (Creature type) enters under your control',
    check: (self, evt, who) => evt.controller === who && evt.card.iid !== self.iid && evt.card.type === 'Creature',
  },
  anotherCreatureYouEntersOfSubtype: {
    // Tribal lord triggers — e.g., "Whenever another Goblin enters, …"
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
    // Sengir Knight bloodlust: "When this attacks, if opp lost life this
    // turn, +1/+1 EOT." Coupled with how lifeLostThisTurn accumulates
    // intra-turn — a single source of life loss enables the trigger.
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
    // Tribal commander triggers — e.g., "Whenever a Goblin attacks, deal 1."
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
  // ─── cardLeavesBattlefield ───────────────────────────────────────────
  // Fires on any leave-play path: death, bounce, exile, shuffle-to-library,
  // exile-until-EOT, steal. A superset of thisDies. Cards should declare
  // ONE of (thisDies, thisLeaves) — declaring both will double-fire on
  // death.
  thisLeaves: {
    events: ['cardLeavesBattlefield'],
    label: 'this leaves the battlefield',
    check: (self, evt) => evt.card.iid === self.iid,
  },
  anotherCreatureDies: {
    // Either side of the table — tribal "one of yours OR theirs" payoffs.
    events: ['cardDies'],
    label: 'another creature (any side) dies',
    check: (self, evt) => evt.card.type === 'Creature' && evt.card.iid !== self.iid,
  },
  anyCardDies: {
    // Blood Artist — fires on EVERY card death including self. Aristocrats
    // payoff. Self-trigger included so a Blood Artist dying still pings.
    events: ['cardDies'],
    label: 'any card dies (including this)',
    check: () => true,
  },
  thisKillsCreature: {
    // Sengir Vampire / Endomorph — "When this kills a creature, …"
    // Implementation reads damagedBySources at death time; the dying
    // card carries a record of who damaged it.
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
    // Note: the `evt.card.iid !== self.iid` exclusion is defensive — the
    // spell-cast event fires when the spell goes onto the stack, but a
    // creature spell doesn't trigger as a "spell cast" by the creature
    // itself. The exclusion prevents pathological self-triggering even
    // if the event semantics shift later.
    events: ['spellCast'],
    label: 'you cast a spell (other than this)',
    check: (self, evt, who) => evt.controller === who && evt.card.iid !== self.iid,
  },
  youCastCounterspell: {
    // Counter Specialist — grows from your own counters. Filter by effect
    // kind: any spell whose effects include {kind: 'counter', ...}.
    events: ['spellCast'],
    label: 'you cast a non-self spell with a counter effect',
    check: (self, evt, who) => {
      if (evt.controller !== who || evt.card.iid === self.iid) return false;
      return ENGINE.cardHasEffect(evt.card, e => e.kind === 'counter');
    },
  },
};

// Resolve trigger condition: condId → registry lookup, else legacy closure,
// else fire unconditionally. Missing condId logs and refuses to fire.
function evalTriggerCondition(trig, self, evt, who) {
  // noSelfCascade: refuses to fire when the event was caused by own source.
  // Used by Codex-generated triggers to break loops (life-gain → gain life,
  // ETB → token-creation chains). Only events carrying sourceIid (lifeGained,
  // cardEntersBattlefield) can cascade; for others the guard no-ops.
  if (trig.noSelfCascade && evt && evt.sourceIid != null && evt.sourceIid === self.iid) {
    return false;
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

// PROCEDURAL TRIGGER GENERATOR — Architect's Codex.
// Filter is hard-breaks-only (crashes / silent no-ops); soft breaks intentional.

function _genWeightedInt(weights, min) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return (min || 1) + i;
  }
  return (min || 1) + weights.length - 1;
}

const GENERATOR_EFFECTS = [
  {
    id: 'damageFace',
    weight: 4,
    needsLiveSource: false,
    roll: () => [{kind: 'damage', target: 'player', amount: _genWeightedInt([5, 3, 1])}],
    describe: (eff) => `deal ${eff.amount} damage to opponent`,
  },
  {
    id: 'damageAny',
    weight: 3,
    needsLiveSource: false,
    roll: () => [{kind: 'damage', target: 'any', amount: _genWeightedInt([5, 3, 1])}],
    describe: (eff) => `deal ${eff.amount} damage to any target`,
  },
  {
    id: 'gainLifeSelf',
    weight: 3,
    needsLiveSource: false,
    // Lifegain less swingy than damage, so the curve is gentler — bigger
    // numbers are still rare but not as punishingly so.
    roll: () => [{kind: 'gainLife', target: 'self', amount: _genWeightedInt([4, 3, 2])}],
    describe: (eff) => `gain ${eff.amount} life`,
  },
  {
    id: 'drawSelf',
    weight: 3,
    needsLiveSource: false,
    // Card draw is the most snowball-y resource; keep the high-end rare.
    roll: () => [{kind: 'draw', target: 'self', amount: _genWeightedInt([7, 1])}],
    describe: (eff) => eff.amount === 1 ? `draw a card` : `draw ${eff.amount} cards`,
  },
  {
    id: 'pumpSelf',
    weight: 3,
    needsLiveSource: true,
    roll: () => {
      const power = _genWeightedInt([4, 2]);
      const tou = _genWeightedInt([5, 3], 0);   // tou starts at 0
      return [{kind: 'pump', target: 'self', power, toughness: tou}];
    },
    describe: (eff) => `~ gets +${eff.power}/+${eff.toughness} EOT`,
  },
  {
    id: 'addCounterSelf',
    weight: 2,
    needsLiveSource: true,
    // Counters are permanent so always +1/+1 — bigger would snowball hard.
    roll: () => [{kind: 'addCounter', target: 'self', power: 1, toughness: 1}],
    describe: () => `~ gets a +1/+1 counter`,
  },
  {
    id: 'createTokenSoldier',
    weight: 2,
    needsLiveSource: false,
    // TOKENS is keyed by the full descriptor (e.g. 'soldier_w_1_1'), not the
    // bare type. The createTokens handler lookups TOKENS[tokenId] directly,
    // so the bare 'soldier' fails to resolve and the trigger fizzles.
    roll: () => [{kind: 'createTokens', tokenId: 'soldier_w_1_1', count: _genWeightedInt([5, 2])}],
    describe: (eff) => eff.count === 1 ? `create a 1/1 Soldier token` : `create ${eff.count} 1/1 Soldier tokens`,
  },
  {
    id: 'createTokenGoblin',
    weight: 2,
    needsLiveSource: false,
    roll: () => [{kind: 'createTokens', tokenId: 'goblin_r_1_1', count: _genWeightedInt([5, 2])}],
    // Goblin tokens have intrinsic haste (the TOKENS entry has keywords:['haste']);
    // surface that in the generated description so the player knows what they
    // get without having to inspect the token template.
    describe: (eff) => eff.count === 1
      ? `create a 1/1 Goblin token with haste`
      : `create ${eff.count} 1/1 Goblin tokens with haste`,
  },
  {
    id: 'discardOpp',
    weight: 1,
    needsLiveSource: false,
    roll: () => [{kind: 'discard', target: 'opp', amount: 1}],
    describe: () => `opponent discards a card`,
  },
];

// Condition entries the generator knows how to use. Excludes parameterized
// conditions (subtype filters) since the generator has no basis for picking
// a subtype. Each entry references a condId in TRIGGER_CONDITIONS and adds
// generator-specific metadata: how to label the event, and whether the
// source is alive at trigger fire time (gates effects with needsLiveSource).
const GENERATOR_CONDITIONS = [
  {condId: 'thisEnters',                 weight: 3, sourceLive: true,  text: '~ enters'},
  {condId: 'thisAttacks',                weight: 3, sourceLive: true,  text: '~ attacks'},
  {condId: 'thisDies',                   weight: 2, sourceLive: false, text: '~ dies'},
  {condId: 'anotherCreatureYouEntersStrict', weight: 2, sourceLive: true, text: 'another creature enters under your control'},
  {condId: 'anotherCreatureDies',        weight: 2, sourceLive: true,  text: 'another creature dies'},
  {condId: 'anyCardDies',                weight: 1, sourceLive: false, text: 'any card dies'},
  {condId: 'youGainLife',                weight: 2, sourceLive: true,  text: 'you gain life'},
  {condId: 'youCastSpell',               weight: 3, sourceLive: true,  text: 'you cast a spell'},
];

// Pick from a weighted list, returning the chosen entry.
function _genWeightedPick(entries) {
  const total = entries.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= (e.weight || 1);
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

// Roll a single trigger. Loops until a coherent (cond, eff) pair is found —
// the only hard-break filter is "self-targeting effects on dead-source
// conditions." With ~70% of effects being source-agnostic, the rejection
// rate is low and the loop terminates quickly.
function generateRandomTrigger() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const cond = _genWeightedPick(GENERATOR_CONDITIONS);
    const eff = _genWeightedPick(GENERATOR_EFFECTS);
    // HARD BREAK: effects that need a live source can't fire when source
    // is in the graveyard. Skip and reroll.
    if (eff.needsLiveSource && !cond.sourceLive) continue;
    // Get the rolled effect instance and compute the event from condId.
    const effects = eff.roll();
    const condEntry = TRIGGER_CONDITIONS[cond.condId];
    if (!condEntry || !condEntry.events || condEntry.events.length === 0) continue;
    const event = condEntry.events[0];
    const text = `When ${cond.text}, ${eff.describe(effects[0])}.`;
    return {
      event,
      condId: cond.condId,
      text,
      effects,
      // Provenance: useful for debugging / logging which generator entries
      // produced this trigger. Not consumed by the engine.
      generated: true,
    };
  }
  // Fallback: should be unreachable but defensive.
  return {
    event: 'cardEntersBattlefield',
    condId: 'thisEnters',
    text: 'When ~ enters, gain 1 life.',
    effects: [{kind: 'gainLife', target: 'self', amount: 1}],
    generated: true,
  };
}

// Two-step build flow: rollConditionOptions (3 distinct) → rollEffectOptions
// (3 compatible with chosen cond). Player picks one of each. Then
// assembleTrigger combines into a complete trigger.

// Pick N distinct entries from a weighted list (no duplicates).
function _genWeightedPickN(entries, n) {
  const pool = entries.slice();
  const out = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const total = pool.reduce((s, e) => s + (e.weight || 1), 0);
    let r = Math.random() * total;
    let pickIdx = 0;
    for (let j = 0; j < pool.length; j++) {
      r -= (pool[j].weight || 1);
      if (r < 0) { pickIdx = j; break; }
    }
    out.push(pool[pickIdx]);
    pool.splice(pickIdx, 1);
  }
  return out;
}

// Roll 3 condition candidates for step 1. Returns array of GENERATOR_CONDITIONS
// entries (NOT pre-built triggers — the effect comes later). Distinct picks.
function generateConditionOptions() {
  return _genWeightedPickN(GENERATOR_CONDITIONS, 3);
}

// Roll 3 effect candidates for step 2, scoped to the chosen condition's
// liveness. If condition has sourceLive=false (e.g., thisDies), filter out
// effects with needsLiveSource=true (self-targeting effects that crash on
// graveyard sources). With chosenCondition.sourceLive=true, all effects
// are valid. Each returned entry is a fully-rolled effect instance:
// {effId, effects, describe, label} — describe is computed at roll time
// so the UI can show the parameterized description without rerolling.
function generateEffectOptions(chosenCondition) {
  const eligible = GENERATOR_EFFECTS.filter(e =>
    !e.needsLiveSource || chosenCondition.sourceLive);
  // _genWeightedPickN rolls up to 3 distinct effect templates; for each, we
  // call .roll() to instantiate parameters. The effect templates themselves
  // are picked without replacement (no duplicate kinds in a single offer),
  // but the parameters are rolled fresh per offer — so two players seeing
  // the same effect set get different numerical values.
  const picked = _genWeightedPickN(eligible, 3);
  return picked.map(eff => {
    const effects = eff.roll();
    return {
      effId: eff.id,
      effects,
      describe: eff.describe(effects[0]),
    };
  });
}

// Combine a chosen condition and a chosen effect into a finalized trigger
// object — the same shape produced by generateRandomTrigger, ready to slot
// into card.triggers / slot.bonusTrigger.
function assembleTrigger(chosenCondition, chosenEffect) {
  const condEntry = TRIGGER_CONDITIONS[chosenCondition.condId];
  const event = (condEntry && condEntry.events && condEntry.events[0]) || 'cardEntersBattlefield';
  return {
    event,
    condId: chosenCondition.condId,
    text: `When ${chosenCondition.text}, ${chosenEffect.describe}.`,
    effects: chosenEffect.effects.map(e => ({...e})),
    generated: true,
    // Procedurally-generated triggers don't fire from their own card's
    // effects. Stops self-cascade loops in the (condition × effect) space
    // (e.g., "creature enters → create tokens" cascading through the tokens
    // themselves; "you gain life → gain life" feeding back). The guard is
    // evaluated in evalTriggerCondition. Surfaced to the player as a
    // sentence on the Codex's own card text rather than on each generated
    // ability — keeps the generated text uncluttered.
    noSelfCascade: true,
  };
}




// Bootstrap — PICKLOG exposed to window for console inspection.
window.PICKLOG = PICKLOG;
CONTROLLER.init();
