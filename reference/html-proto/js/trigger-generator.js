// Procedural trigger generator — Architect's Codex and Mercurial Adept use this
// to roll (condition × effect) trigger combinations at runtime. Filter is
// hard-breaks-only (crashes / silent no-ops); soft breaks intentional.

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
    // Lifegain less swingy than damage — gentler curve.
    roll: () => [{kind: 'gainLife', target: 'self', amount: _genWeightedInt([4, 3, 2])}],
    describe: (eff) => `gain ${eff.amount} life`,
  },
  {
    id: 'drawSelf',
    weight: 3,
    needsLiveSource: false,
    // Card draw snowballs; keep high-end rare.
    roll: () => [{kind: 'draw', target: 'self', amount: _genWeightedInt([7, 1])}],
    describe: (eff) => eff.amount === 1 ? `draw a card` : `draw ${eff.amount} cards`,
  },
  {
    id: 'pumpSelf',
    weight: 3,
    needsLiveSource: true,
    roll: () => {
      const power = _genWeightedInt([4, 2]);
      const tou = _genWeightedInt([5, 3], 0);
      return [{kind: 'pump', target: 'self', power, toughness: tou}];
    },
    describe: (eff) => `~ gets +${eff.power}/+${eff.toughness} EOT`,
  },
  {
    id: 'addCounterSelf',
    weight: 2,
    needsLiveSource: true,
    // Always +1/+1; counters are permanent — bigger would snowball.
    roll: () => [{kind: 'addCounter', target: 'self', power: 1, toughness: 1}],
    describe: () => `~ gets a +1/+1 counter`,
  },
  {
    id: 'createTokenSoldier',
    weight: 2,
    needsLiveSource: false,
    // TOKENS keyed by full descriptor; bare 'soldier' would fizzle.
    roll: () => [{kind: 'createTokens', tokenId: 'soldier_w_1_1', count: _genWeightedInt([5, 2])}],
    describe: (eff) => eff.count === 1 ? `create a 1/1 Soldier token` : `create ${eff.count} 1/1 Soldier tokens`,
  },
  {
    id: 'createTokenGoblin',
    weight: 2,
    needsLiveSource: false,
    roll: () => [{kind: 'createTokens', tokenId: 'goblin_r_1_1', count: _genWeightedInt([5, 2])}],
    // Goblin tokens have intrinsic haste — surface in description.
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

// Excludes parameterized conditions (no basis for picking subtype).
// sourceLive gates needsLiveSource effects. Each entry carries the composable
// {event, condition} shape directly (Slice 2 / E2) — no condId indirection.
const GENERATOR_CONDITIONS = [
  {id: 'thisEnters',     weight: 3, sourceLive: true,  text: '~ enters',
   event: 'card_zone_change', condition: ['this_card', 'card_moves(anywhere, battlefield)']},
  {id: 'thisAttacks',    weight: 3, sourceLive: true,  text: '~ attacks',
   event: 'attacks', condition: ['this_card']},
  {id: 'thisDies',       weight: 2, sourceLive: false, text: '~ dies',
   event: 'card_zone_change', condition: ['this_card', 'card_moves(battlefield, graveyard)']},
  {id: 'anotherCreatureYouEntersStrict', weight: 2, sourceLive: true, text: 'another creature enters under your control',
   event: 'card_zone_change', condition: ['another_card', 'card_is_creature', 'controlled_by(you)', 'card_moves(anywhere, battlefield)']},
  {id: 'anotherCreatureDies', weight: 2, sourceLive: true,  text: 'another creature dies',
   event: 'card_zone_change', condition: ['another_card', 'card_is_creature', 'card_moves(battlefield, graveyard)']},
  {id: 'anyCardDies',    weight: 1, sourceLive: false, text: 'any creature dies',
   event: 'card_zone_change', condition: ['card_is_creature', 'card_moves(battlefield, graveyard)']},
  {id: 'youGainLife',    weight: 2, sourceLive: true,  text: 'you gain life',
   event: 'life_changed', condition: ['is_life_gain', 'affected_player_is(you)']},
  {id: 'youCastSpell',   weight: 3, sourceLive: true,  text: 'you cast a spell',
   event: 'spell_cast', condition: ['another_card', 'controlled_by(you)']},
];

function _genWeightedPick(entries) {
  const total = entries.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= (e.weight || 1);
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

// Roll a (cond, eff) pair. Only hard-break: needsLiveSource effect + dead-source cond.
function generateRandomTrigger() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const cond = _genWeightedPick(GENERATOR_CONDITIONS);
    const eff = _genWeightedPick(GENERATOR_EFFECTS);
    if (eff.needsLiveSource && !cond.sourceLive) continue;
    const effects = eff.roll();
    const text = `When ${cond.text}, ${eff.describe(effects[0])}.`;
    return {
      event: cond.event,
      condition: cond.condition.slice(),
      text,
      effects,
      generated: true,
    };
  }
  return {
    event: 'card_zone_change',
    condition: ['this_card', 'card_moves(anywhere, battlefield)'],
    text: 'When ~ enters, gain 1 life.',
    effects: [{kind: 'gainLife', target: 'self', amount: 1}],
    generated: true,
  };
}

// Mercurial Adept two-step: generateConditionOptions → generateEffectOptions → assembleTrigger.
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

function generateConditionOptions() {
  return _genWeightedPickN(GENERATOR_CONDITIONS, 3);
}

// 3 effect candidates filtered by chosen cond's sourceLive. Params re-rolled per offer.
function generateEffectOptions(chosenCondition) {
  const eligible = GENERATOR_EFFECTS.filter(e =>
    !e.needsLiveSource || chosenCondition.sourceLive);
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

// Finalize (cond, eff) → trigger object, same shape as generateRandomTrigger.
function assembleTrigger(chosenCondition, chosenEffect) {
  return {
    event: chosenCondition.event,
    condition: chosenCondition.condition.slice(),
    text: `When ${chosenCondition.text}, ${chosenEffect.describe}.`,
    effects: chosenEffect.effects.map(e => ({...e})),
    generated: true,
    // Stops self-cascade loops (e.g. enter→create-tokens cascading via the
    // tokens). The created tokens' card_zone_change carries source_iid = this
    // trigger's source; evalTriggerCondition's noSelfCascade guard reads it.
    noSelfCascade: true,
  };
}
