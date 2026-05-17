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

// Resolve: condId registry → legacy closure → fire unconditionally.
function evalTriggerCondition(trig, self, evt, who) {
  // Codex-generated trigger guard: refuse to fire when source caused the event.
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
