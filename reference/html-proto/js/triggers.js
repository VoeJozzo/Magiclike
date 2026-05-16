// Trigger vocabulary — named predicates for `condId`-based triggers.
// Each entry maps a condId to (events it can fire on, human label, check predicate).
// Lives outside the ENGINE IIFE so card templates can reference condIds at
// module-load time without a circular dependency.

// IMPORTANT: when adding an entry, also add to /tmp/trigger_vocab_test.js
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
    // The `evt.card.iid !== self.iid` exclusion is defensive — a creature
    // spell shouldn't trigger as a "spell cast" by the creature itself.
    // Guards against pathological self-triggering if event semantics shift.
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
