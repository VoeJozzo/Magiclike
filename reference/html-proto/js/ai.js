// AI — pure decision-maker. Reads engine state, returns one action.
// Swap by replacing `decide` with same-signature function (heuristic/MCTS/LLM).

const AI = (function() {

// Feature flag for A/B testing. When false, flash creatures are treated as
// sorcery-speed creatures (cast on own main only). When true, the AI also
// considers ambush-blocking during opp's combat and tempo casts on opp's
// end step. Default true.
let FLASH_AI_ENABLED = true;

function decide(state, who) {
  // Defensive: if the game ended between when this AI dispatch was scheduled
  // and when the setTimeout fired, just pass. executeAction will refuse the
  // pass anyway (gameOver short-circuits), but returning a well-formed action
  // avoids crashing in any of the deciders below that read stack/board state
  // assuming a live game.
  if (!state || state.gameOver) return {type:'pass'};

  const actions = ENGINE.getLegalActions(who);

  // Pending trigger target prompt (sim mode only — in production 'you' resolves
  // via UI clicks). Use the engine's exposed pickBestTriggerTarget heuristic.
  if (state.pendingTriggerTarget && state.pendingTriggerTarget.controller === who) {
    const ptt = state.pendingTriggerTarget;
    if (Array.isArray(ptt.valid) && ptt.valid.length > 0 && ENGINE.pickBestTriggerTarget) {
      const target = ENGINE.pickBestTriggerTarget(ptt.promptEff, ptt.valid, who) || ptt.valid[0];
      return {type: 'triggerTargetPick', target};
    }
  }

  // Pending search prompt (sim mode only — same reasoning).
  if (state.pendingSearch && state.pendingSearch.who === who) {
    const searchActs = actions.filter(a => a.type === 'searchPick');
    if (searchActs.length > 0) return searchActs[0];
  }

  // Pending trigger-build prompt (sim mode only — Codex picker).
  if (state.pendingTriggerBuild && state.pendingTriggerBuild.who === who) {
    const buildActs = actions.filter(a => a.type === 'triggerBuildPick');
    if (buildActs.length > 0) return buildActs[0];
  }

  // Pending rip-select prompt — Vile Edict and similar. Pick the lowest-
  // value permanent on the player's battlefield (using sacValueOnBoard,
  // which is the right metric: cost is sunk, only board-presence value
  // matters now). Lands rip just as easily as creatures, so include them.
  // We score lands as cheap by default (sacValueOnBoard returns 0 for
  // non-creatures), which means the AI rips a land if it has spare ones.
  // That's typically the right call: lands lost mid-game hurt less than
  // creatures lost.
  if (state.pendingRipSelect && state.pendingRipSelect.who === who) {
    const ripActs = actions.filter(a => a.type === 'ripSelect');
    if (ripActs.length === 0) return {type:'pass'};
    let best = ripActs[0], bestValue = Infinity;
    for (const a of ripActs) {
      const card = state[who].battlefield.find(c => c.iid === a.target.iid);
      if (!card) continue;
      // Lands score lower than creatures via sacValueOnBoard (returns 0
      // for type != Creature). Untapped land = small utility cost. A
      // creature with full body value is preserved over an untapped land.
      let v = ENGINE.sacValueOnBoard(card);
      // Small penalty for tapped lands (they're already spent this turn,
      // less valuable than untapped lands).
      if (card.type === 'Land' && card.tapped) v -= 1;
      if (v < bestValue) { bestValue = v; best = a; }
    }
    return best;
  }

  // Pending number-choice prompt — Archdemon of Bargains. The chooser is
  // always 'you' in production (player-as-dealmaker design), but in sim
  // mode the AI may be playing both sides and need to pick. Heuristic:
  // pick the SMALLEST number (1). Rationale:
  //   - Low N = small buff to boss, small compensation to player on death
  //   - High N = big buff to boss, big compensation to player on death
  // Net zero in expectation. But the variance is bad — the player gains
  // disproportionately on death (they expected to gain nothing). Picking
  // low minimizes variance, which is the right play for an AI that
  // doesn't know its own win probability. For player-side play, the human
  // chooses; this is just a sim-mode fallback.
  if (state.pendingNumberChoice && state.pendingNumberChoice.who === who) {
    return {type:'numberChoice', number: state.pendingNumberChoice.min};
  }

  // Symmetricize choice — target's controller picks power/toughness/cost.
  // Strategy: pick the value that yields the best outcome for the
  // controller (which is the AI here). For OWN creatures, maximize the
  // beneficial stat: if cost was the highest of the three, picking
  // power=cost or toughness=cost stretches it into a bigger creature.
  // If power was already largest (a beater), picking power leaves stats
  // alone but slashes cost (if cost was small).
  //
  // Simple heuristic: pick MAX of the three. The card becomes maxValue/
  // maxValue costing {maxValue}. This is usually the best outcome — you
  // get the biggest creature, even if cost goes up. Cost up isn't great
  // for replays this game (creature is already on battlefield), but it
  // matters for run-persistent slot impact.
  //
  // Refinement: if cost is already the max (oversized creature, e.g.
  // Bloodthirster 6/6 for {5}, cost=5+pip), picking cost makes it a 5/5
  // for 5 — worse stats, same cost. Picking power or toughness keeps
  // stats and lowers cost. So actually: pick the value that's the
  // LARGEST of (power, toughness), then if cost is also higher, pick
  // cost (cheaper card always good).
  if (state.pendingSymmetricizeChoice && state.pendingSymmetricizeChoice.who === who) {
    const v = state.pendingSymmetricizeChoice.values;
    // Pick the maximum of the three. Ties broken arbitrary but stable.
    let which = 'power', best = v.power;
    if (v.toughness > best) { which = 'toughness'; best = v.toughness; }
    if (v.cost > best) { which = 'cost'; best = v.cost; }
    return {type:'symmetricizeChoice', which};
  }

  // Forced discard (e.g., Mind Rot, Grave Charm mode 1). The engine assumes
  // 'you' is human and handles forced discards via UI in production, so the
  // production AI never reaches this state. In sim mode (AI vs AI) BOTH
  // sides go through this AI module, and 'you' may need to discard. Pick
  // the LOWEST-VALUE card (was: cheapest-cost). A cheap removal spell or
  // strong 2-drop is often more valuable than an expensive off-color filler
  // we can't cast; getCardValue captures this directly via its full
  // intrinsic-value calc rather than mana-cost as a proxy.
  if (state.forcedDiscard && state.forcedDiscard.who === who && state.forcedDiscard.remaining > 0) {
    const discardActs = actions.filter(a => a.type === 'discard');
    if (discardActs.length === 0) return {type:'pass'};
    let best = discardActs[0], bestValue = Infinity;
    for (const a of discardActs) {
      const card = state[who].hand.find(c => c.iid === a.cardIid);
      if (!card) continue;
      const v = ENGINE.getCardValue(card, 'draft');
      if (v < bestValue) { bestValue = v; best = a; }
    }
    return best;
  }

  // Cleanup discard.
  if (state.cleanupDiscarding && state.activePlayer === who) {
    return decideCleanupDiscard(state, who, actions);
  }

  // Pending declarations come before priority rounds.
  if (state.phase === 'COMBAT_ATTACK' && who === state.activePlayer && !state.attackersDeclared) {
    return decideAttackers(state, who);
  }
  if (state.phase === 'COMBAT_BLOCK' && who === opp(state.activePlayer) && !state.blockersDeclared) {
    return decideBlockers(state, who);
  }

  // Priority round: stack non-empty → reaction; stack empty → main / pass.
  if (state.priority && state.priorityHolder === who) {
    if (state.stack.length > 0) {
      return decideReaction(state, who, actions);
    }
    // Empty-stack priority round. Active player on a main phase plays out
    // turn actions normally.
    if ((state.phase === 'MAIN1' || state.phase === 'MAIN2') && who === state.activePlayer) {
      return decideMain(state, who, actions);
    }
    // Off-turn or non-main-phase priority. The AI used to just pass here.
    // It now considers instant-speed plays during opp-controlled combat —
    // specifically, removing an attacker before blockers (or after blockers,
    // before damage). Lets the AI defend itself when its creatures are about
    // to die in combat or when face damage would be lethal.
    if (state.phase === 'COMBAT_ATTACK' || state.phase === 'COMBAT_BLOCK') {
      const reactive = decideOffTurnCombat(state, who, actions);
      if (reactive) return reactive;
    }
    // Opp's end step: cast flash creatures for tempo. Mana spent on opp's
    // end step is "free" — the creature ETBs sick on opp's turn, then our
    // untap step un-sicks it, so it can attack next turn. Cost-equivalent
    // to casting on our own main, but it leaves our main mana free for
    // other plays. (Strictly better than holding the flash creature
    // unless we're saving it for a specific later play, which the AI
    // doesn't currently reason about.)
    if (FLASH_AI_ENABLED && state.phase === 'END' && who !== state.activePlayer) {
      const tempo = decideEndStepFlash(state, who, actions);
      if (tempo) return tempo;
    }
    return {type:'pass'};
  }

  return {type:'pass'};
}

// Off-turn combat reaction. We're the defender (or attacker waiting on opp's
// declared blockers) — looks for an instant-speed cast that improves our
// position. Common pattern: opp attacks with a creature that'd kill us or
// trade favorably; we instant-remove the attacker first.
function decideOffTurnCombat(state, who, actions) {
  // Gather instant-speed castable removals, damage spells, pumps. We only
  // consider spells where the score would be positive given the current
  // board. pickBestTargetForSpell already does this — reuse it.
  const spellsByCard = new Map();
  for (const a of actions) {
    if (a.type !== 'castSpell') continue;
    const card = state[who].hand.find(c => c.iid === a.cardIid);
    if (!card) continue;
    // Only instants and flash creatures are legal here, but be defensive.
    if (card.type !== 'Instant' && !(card.keywords && card.keywords.includes('flash'))) continue;
    if (!spellsByCard.has(a.cardIid)) spellsByCard.set(a.cardIid, []);
    spellsByCard.get(a.cardIid).push(a);
  }
  // Activated abilities are also live during this window — Carrion Feeder
  // wanting to sac a chump to win a fight, ping-from-creature aiming at an
  // attacker, etc. pickBestActivation scores each candidate; if it returns
  // an action with positive score, that's our reaction. Combat-aware bonuses
  // in the addCounter scorer (combatBuffSwingValue + isCreatureDoomedInCombat)
  // make sac-cost activations meaningful here without firing in main phases.
  const abilityActs = actions.filter(a => a.type === 'activateAbility');
  let bestAbility = null, bestAbilityScore = -Infinity;
  if (abilityActs.length) {
    const ab = pickBestActivation(state, who, abilityActs);
    if (ab) {
      bestAbility = ab;
      // pickBestActivation returned us its top pick, but we don't have the
      // raw score — re-score this one action for cross-comparison with
      // spells. Cheap: just compute it inline. We tag with a lower threshold
      // (3) than instants because positive-net activated abilities are
      // generally worth it during the relevant window; the activated
      // scorer's combat bonus is what gates it from firing in dead moments.
      bestAbilityScore = 5;   // placeholder — pickBestActivation's threshold
                              // is score > 0, so we know this is at least 1.
    }
  }
  if (spellsByCard.size === 0 && !bestAbility) return null;
  // Score each candidate. Pick the best ONE — only one cast per priority
  // round; we'll get more chances if more priority rounds open.
  // Track flash creatures separately because they use a lower threshold:
  // their value is split between "ambush blocking" (which is small in
  // absolute score) and "having the body in play next turn" (which
  // doesn't show up in combat sim). A 4/4 flash blocking a 2/2 attacker
  // scores ~+11 — below the 15 instant-utility threshold but well worth
  // the cast when the alternative is sorcery-speed casting next turn.
  let bestInst = null, bestInstScore = -Infinity;
  let bestFlash = null, bestFlashScore = -Infinity;
  for (const [iid, options] of spellsByCard) {
    const card = state[who].hand.find(c => c.iid === iid);
    if (!card) continue;
    const chosen = pickBestTargetForSpell(state, who, card, options);
    if (!chosen) continue;
    const isFlashCreature = card.type === 'Creature' && (card.keywords || []).includes('flash');
    // Use the same scoring pickBestTargetForSpell internally produced.
    // Re-score the chosen target so we can compare across cards.
    const tgt = chosen.targets ? chosen.targets[0] : null;
    let score;
    if (tgt) {
      score = scoreSpellTarget(state, who, card, tgt);
    } else {
      // Untargeted: score AOE effects specially, otherwise neutral 0.
      // Read effects from the chosen mode for modal cards (chosen has
      // modeIdx threaded through from pickBestTargetForSpell).
      const effs = ENGINE.effectsForMode(card, chosen.modeIdx);
      const eff0 = effs[0];
      if (eff0 && eff0.kind === 'removeAll') {
        // Unified mass removal — severity 3+ is "wipe" territory worth ~30.
        const sev = eff0.severity || 3;
        score = sev >= 3 ? 30 : sev === 2 ? 18 : 8;
      } else if (eff0 && eff0.kind === 'damageAll') {
        score = scoreDamageAll(state, who, eff0.amount || 0);
      } else {
        score = 0;
      }
    }
    // Flash creature ambush bonus: a flash creature flashed in BEFORE
    // blockers are declared adds itself to the available block pool and
    // can save face damage or trade for an attacker. Without this, vanilla
    // flash creatures (Quickdraw Mage, Ambush Djinn) score 0 and never
    // get cast off-turn, wasting the entire point of the flash keyword.
    // For ETB-trigger flash creatures (Quickling), we ADD this on top of
    // the targeted score — bouncing one attacker AND blocking another
    // is genuinely double value.
    if (isFlashCreature) {
      if (FLASH_AI_ENABLED) score += scoreFlashAmbush(state, who, card);
      if (score > bestFlashScore) { bestFlashScore = score; bestFlash = chosen; }
    } else {
      if (score > bestInstScore) { bestInstScore = score; bestInst = chosen; }
    }
  }
  // Thresholds: instant utility needs ≥15 (Bolt face is 28, killing a real
  // threat is ~50; below 15 means we're fishing). Flash creature ambush
  // uses a lower threshold (5) — the body persists post-combat, so even a
  // small positive swing is real value compared to casting on our own main
  // next turn (where the same card gets us the body without the ambush).
  if (bestInst && bestInstScore >= 15) return bestInst;
  if (bestFlash && bestFlashScore >= 5) return bestFlash;
  // Activated ability fallback: if pickBestActivation found a positive
  // candidate, use it. The ability scorer's own threshold (score > 0)
  // already gates trivial activations; we trust its judgment here.
  // Particularly relevant for combat-aware sac abilities (Carrion Feeder
  // saving its own life by eating a token blocker — the combat swing
  // bonus only fires during combat phases, so the dead activation in
  // main phases doesn't reach here).
  if (bestAbility) return bestAbility;
  return null;
}

// Combat swing if we flash `card` in as a defender. Clones onto BF temporarily,
// re-runs predictOppBlocks + simulateCombat, compares to baseline. Original
// hand card untouched.
function scoreFlashAmbush(state, who, card) {
  if (state.phase !== 'COMBAT_ATTACK') return 0;
  if (state.activePlayer === who) return 0;
  if (!state.attackersDeclared) return 0;
  if (!state.attackers || state.attackers.length === 0) return 0;
  const them = opp(who);
  const attackerIids = state.attackers.slice();
  // Sanity: at least one attacker still exists (declared attackers can be
  // removed mid-priority — e.g., a removal spell killed one before flash
  // priority). Filter to live ones.
  const liveAttackers = attackerIids.filter(iid => ENGINE.findCard(iid));
  if (liveAttackers.length === 0) return 0;

  // Defender's score = -(attacker's combat score). Higher is better for us.
  const evalDefense = () => {
    const blocks = predictOppBlocks(state, them, liveAttackers);
    const outcome = simulateCombat(state, them, liveAttackers, blocks);
    return -scoreCombatOutcome(state, them, outcome, liveAttackers);
  };

  const baseline = evalDefense();

  // Clone the hand card with battlefield-runtime fields. Same iid; original
  // hand card untouched. Shallow-spread keeps the keyword/effects refs
  // (combat sim only reads, never mutates them).
  const simCard = Object.assign({}, card, {
    controller: who,
    sick: false,
    tapped: false,
    damage: 0,
  });
  state[who].battlefield.push(simCard);
  let withFlash;
  try {
    withFlash = evalDefense();
  } finally {
    const idx = state[who].battlefield.findIndex(c => c === simCard);
    if (idx >= 0) state[who].battlefield.splice(idx, 1);
  }
  return withFlash - baseline;
}

// Cast flash creatures on opp's end step — spends mana that would otherwise
// empty at cleanup. Pick the most expensive playable (mirrors curve-up logic).
function decideEndStepFlash(state, who, actions) {
  const them = opp(who);
  const flashCasts = new Map();
  for (const a of actions) {
    if (a.type !== 'castSpell') continue;
    const card = state[who].hand.find(c => c.iid === a.cardIid);
    if (!card) continue;
    if (card.type !== 'Creature') continue;
    if (!(card.keywords && card.keywords.includes('flash'))) continue;
    // Skip flash creatures with mandatory ETB-bounce that would self-bounce
    // (Quickling with no valid bounce target) — net zero cast.
    if (flashETBWouldFizzle(state, who, card)) continue;
    if (!flashCasts.has(a.cardIid)) flashCasts.set(a.cardIid, []);
    flashCasts.get(a.cardIid).push(a);
  }
  if (flashCasts.size === 0) return null;
  const sorted = Array.from(flashCasts.keys())
    .map(iid => ({ iid, card: state[who].hand.find(c => c.iid === iid), options: flashCasts.get(iid) }))
    .filter(x => x.card)
    .sort((a, b) => ENGINE.cardCost(b.card) - ENGINE.cardCost(a.card));
  for (const { card, options } of sorted) {
    const chosen = pickBestTargetForSpell(state, who, card, options);
    if (chosen) return chosen;
  }
  return null;
}

// Returns true if `card` has a mandatory ETB-bounce trigger whose only
// valid target would be itself (self-bounce wastes the cast). Also catches
// the broader case where the only valid bounce targets are our own creatures
// we don't want to bounce — for the current pool we treat "no opp creature
// to bounce" as the disqualifier; future cards (a self-bounce-for-protection
// trigger, e.g.) might want a different rule. Conservative by design — only
// fizzles flash casts when there's clearly nothing good to bounce.
function flashETBWouldFizzle(state, who, card) {
  const them = opp(who);
  const triggers = card.triggers || [];
  for (const trig of triggers) {
    if (trig.event !== 'cardEntersBattlefield') continue;
    const effects = trig.effects || [];
    for (const eff of effects) {
      if (eff.kind === 'removeCreature' && eff.target === 'creature') {
        // Count opp creatures on the battlefield. The trigger fires on
        // ETB, so the just-cast card will also be on the battlefield, but
        // we're asking the question pre-cast — the card is still in hand.
        const oppCreatures = state[them].battlefield.filter(c => c.type === 'Creature');
        if (oppCreatures.length === 0) return true;
      }
    }
  }
  return false;
}

function decideMain(state, who, actions) {
  // Decision order:
  // 1. Burn-out lethal: if we can cast burn spells/abilities to push opp to 0
  //    this turn (combined with attacks that already happened), do it.
  // 2. Play land if we have one and haven't yet.
  // 3. Cast biggest playable spell (curve up — bombs first; little stuff later).
  // 4. Activate non-mana ability if useful.
  // 5. Pass (advances to next phase).

  // Tier 2: burn lethal recognition. Checks if any burn-to-face spell would
  // kill opp directly.
  const burnLethal = findBurnLethal(state, who, actions);
  if (burnLethal) return burnLethal;

  // MAIN1-only: check if attack-with-everything plus burn-in-hand totals lethal.
  // If so, identify which burn cards we want to save for the post-combat finish
  // and skip casting them now. Without this, the AI would cast its Bolt at face
  // for the +30 burn-range bonus during MAIN1, then attack and pass the turn —
  // missing lethal that combat damage + saved burn would have produced.
  // MAIN2 is post-combat, so this analysis is only needed at MAIN1.
  let reservedBurnIids = null;
  if (state.phase === 'MAIN1') {
    reservedBurnIids = computeReservedBurnForLethal(state, who);
  }

  const lands = actions.filter(a => a.type === 'playLand');
  if (lands.length) {
    // Pick land that produces the color we most need for cards in hand.
    return pickBestLand(state, who, lands);
  }

  // Group cast actions by cardIid (each card may have multiple targets).
  const spellsByCard = new Map();
  for (const a of actions) {
    if (a.type !== 'castSpell') continue;
    // Skip burn cards we've reserved for post-combat lethal — casting them
    // now would consume the mana and the spell, breaking the lethal line.
    if (reservedBurnIids && reservedBurnIids.has(a.cardIid)) continue;
    // Defer VANILLA flash creatures to opp's turn. Casting a vanilla flash
    // creature on our own MAIN gives an identical attack-readiness timeline
    // to casting it on opp's end step (sick on opp's end, unsick by our
    // untap step) while preserving our mana for the entirety of opp's turn
    // — counters, removal, ambush blocks. The decideOffTurnCombat (ambush)
    // and decideEndStepFlash (tempo) arms pick these up at the right phase.
    //
    // CRITICAL: only defer flash creatures whose value is body-only. Flash
    // creatures with ETB triggers (Quickling, etc.) want their trigger to
    // fire NOW — bouncing a blocker on MAIN1 clears the way for a profitable
    // attack, while bouncing on opp's end step is post-combat and just
    // denies opp's next-turn defense (a much smaller effect). Empirically
    // (mirror A/B), deferring ALL flash creatures lost ~3pp; deferring only
    // vanilla bodies is the right scope.
    if (FLASH_AI_ENABLED) {
      const card = state[who].hand.find(c => c.iid === a.cardIid);
      if (card && card.type === 'Creature'
          && card.keywords && card.keywords.includes('flash')
          && (!card.triggers || card.triggers.length === 0)) {
        continue;
      }
    }
    if (!spellsByCard.has(a.cardIid)) spellsByCard.set(a.cardIid, []);
    spellsByCard.get(a.cardIid).push(a);
  }
  // CURVE UP: sort by cost DESCENDING. Cast the biggest playable thing first.
  // Reasoning: if you can afford a 5-drop, casting your 1-drop instead leaves
  // tempo on the table — the 1-drop can come down later when you have less mana.
  //
  // FLASH-HOLD: filter out flash creatures from MAIN-phase candidates. Casting
  // a flash creature on our own main phase is strictly worse than casting it
  // on opp's end step or as an ambush block during opp's combat:
  //   - Tempo is identical (flash creatures in the current pool don't have
  //     haste, so they ETB sick and attack the following turn either way).
  //   - Holding preserves mana optionality through opp's turn — we can
  //     redirect the mana to a counterspell or removal if opp threatens
  //     something, and end-step-cast the flash creature only if not.
  //   - In hand, the flash creature is invulnerable to removal; on the
  //     battlefield since our MAIN1, it's a target for opp's whole turn.
  // The off-turn pathways (scoreFlashAmbush during opp's combat,
  // decideEndStepFlash during opp's end step) handle deployment. If we
  // really have nothing else to spend mana on, we just pass MAIN with
  // mana up — that mana gets used on opp's turn instead.
  //
  // Gated by FLASH_AI_ENABLED so the A/B harness can compare against the
  // sorcery-speed-everything baseline.
  const candidateCards = Array.from(spellsByCard.keys()).map(iid => ({
    iid, card: state[who].hand.find(c => c.iid === iid),
  })).filter(x => {
    if (!x.card) return false;
    if (FLASH_AI_ENABLED && x.card.type === 'Creature' &&
        x.card.keywords && x.card.keywords.includes('flash')) {
      return false;
    }
    return true;
  });
  candidateCards.sort((a, b) => ENGINE.cardCost(b.card) - ENGINE.cardCost(a.card));
  for (const {iid, card} of candidateCards) {
    const options = spellsByCard.get(iid);
    const chosen = pickBestTargetForSpell(state, who, card, options);
    if (chosen) return chosen;
  }

  // Activated abilities. Also skip reserved burn-source activations
  // (e.g., a ping ability that's part of the lethal line).
  let abilityActs = actions.filter(a => a.type === 'activateAbility');
  if (reservedBurnIids) {
    abilityActs = abilityActs.filter(a => !reservedBurnIids.has(a.cardIid));
  }
  if (abilityActs.length) {
    const chosen = pickBestActivation(state, who, abilityActs);
    if (chosen) return chosen;
  }

  return {type:'pass'};
}

// Enumerate spells/abilities in `actions` that deal damage to opp's face.
// Shared by findBurnLethal (single-spell kill check) and
// computeReservedBurnForLethal (multi-spell reserved-burn planner).
function getDirectBurnSources(state, who, actions) {
  const them = opp(who);
  const sources = [];
  for (const a of actions) {
    if (a.type !== 'castSpell' && a.type !== 'activateAbility') continue;
    const tgt = a.targets && a.targets[0];
    if (!tgt || tgt.kind !== 'player' || tgt.who !== them) continue;
    let amount = 0;
    let cost = 0;
    if (a.type === 'castSpell') {
      const card = state[who].hand.find(c => c.iid === a.cardIid);
      if (!card) continue;
      // effectsForMode handles modal cards transparently (modeIdx defaults to 0).
      const dmg = ENGINE.effectsForMode(card, a.modeIdx).find(e => e.kind === 'damage');
      if (!dmg) continue;
      amount = dmg.amount;
      cost = ENGINE.cardCost(card);
    } else {
      const card = state[who].battlefield.find(c => c.iid === a.cardIid);
      if (!card || !card.abilities) continue;
      const ab = card.abilities[a.abilityIdx];
      const dmg = ab && ab.effects && ab.effects.find(e => e.kind === 'damage');
      if (!dmg) continue;
      amount = dmg.amount;
    }
    sources.push({ action: a, iid: a.cardIid, amount, cost });
  }
  return sources;
}

// MAIN1 multi-spell lethal projection: attack damage + post-combat burn-to-face.
// Returns iids to reserve for burn during MAIN1, or null if no lethal.
// Conservative — only kind:'damage' at player, no pump combos or X-spells.
function computeReservedBurnForLethal(state, who) {
  const them = opp(who);
  const oppLife = state[them].life;
  if (oppLife <= 0) return null;
  // Project attack damage. Use the same eligible-attacker set decideAttackers
  // would use, and same predicted-blocks model. This is a rough estimate —
  // the actual attack might differ if decideAttackers picks a subset, but
  // for lethal-projection we want the optimistic case.
  const eligible = state[who].battlefield
    .filter(c => ENGINE.canCreatureAttack(c))
    .map(c => c.iid);
  let projectedDamage = 0;
  if (eligible.length > 0) {
    const blocks = predictOppBlocks(state, who, eligible);
    const out = simulateCombat(state, who, eligible, blocks);
    projectedDamage = Math.max(0, out.damageToDefender - out.defenderLifeGain);
  }
  const sources = getDirectBurnSources(state, who, ENGINE.getLegalActions(who));
  if (sources.length === 0) return null;
  // Sort cheapest-first so we use minimal mana to achieve lethal — leaves
  // the maximum chance the line is mana-feasible post-combat.
  sources.sort((a, b) => a.cost - b.cost);
  // Greedily accumulate burn until lethal achieved.
  let acc = projectedDamage;
  const reserved = new Set();
  for (const src of sources) {
    if (acc >= oppLife) break;
    acc += src.amount;
    reserved.add(src.iid);
  }
  if (acc >= oppLife && reserved.size > 0) return reserved;
  return null;
}

// Single-spell lethal: any one burn source that kills opp on its own.
// Multi-spell sequencing is computeReservedBurnForLethal's job.
function findBurnLethal(state, who, actions) {
  const oppLife = state[opp(who)].life;
  if (oppLife <= 0) return null;
  const killer = getDirectBurnSources(state, who, actions).find(s => s.amount >= oppLife);
  return killer ? killer.action : null;
}

// Pick the land that fixes us most. If our hand has an unplayable card due
// to a missing color, play that land. Otherwise default to first option.
//
// Reads `card.mana` (primary color string) plus `card.extraManaColors`
// (additional colors from landColor stickers). Pre-v0.96 this read a non-
// existent `card.produces` array and always silently fell through to the
// first option. The fix was caught during a code audit.
function pickBestLand(state, who, landActs) {
  if (landActs.length === 1) return landActs[0];
  const p = state[who];
  // Tally needed colors from cards in hand.
  const needed = {W:0, U:0, B:0, R:0, G:0};
  for (const c of p.hand) {
    if (!c.cost) continue;
    for (const k of ['W','U','B','R','G']) {
      if (c.cost[k]) needed[k] += c.cost[k];
    }
  }
  // Tally colors we already produce from lands in play.
  const produces = {W:0, U:0, B:0, R:0, G:0};
  for (const c of p.battlefield) {
    if (c.type !== 'Land') continue;
    for (const k of ENGINE.landProducibleColors(c)) if (k in produces) produces[k]++;
  }
  // Score each land option: prefer producing a color we need but have no source for.
  let bestAct = landActs[0], bestScore = -Infinity;
  for (const a of landActs) {
    const card = p.hand.find(c => c.iid === a.cardIid);
    if (!card) continue;
    let score = 0;
    for (const k of ENGINE.landProducibleColors(card)) {
      if (!(k in needed)) continue;
      const haveNoSource = produces[k] === 0;
      const wantThisColor = needed[k] > 0;
      if (wantThisColor && haveNoSource) score += 100;
      else if (wantThisColor) score += 1;
    }
    if (score > bestScore) { bestScore = score; bestAct = a; }
  }
  return bestAct;
}

function decideReaction(state, who, actions) {
  // Look for a counterspell + the top of stack is a player spell we want to stop.
  // ENGINE.cardHasEffect handles modal vs flat effects shapes uniformly —
  // a card "is a counterspell" if any of its modes contains a counter effect.
  const counters = actions.filter(a =>
    a.type === 'castSpell' &&
    ENGINE.cardHasEffect(state[who].hand.find(c => c.iid === a.cardIid),
                         e => e.kind === 'counter'));
  if (counters.length && shouldCounter(state, who)) {
    // The counter action's targets array should target the top of stack.
    const top = state.stack[state.stack.length - 1];
    const counterAction = counters.find(a =>
      a.targets && a.targets[0] && a.targets[0].kind === 'stack' && a.targets[0].stackItem === top);
    if (counterAction) return counterAction;
  }
  return {type:'pass'};
}

function shouldCounter(state, who) {
  const top = state.stack[state.stack.length - 1];
  if (!top || top.controller === who) return false;
  // Triggers don't have a card; counter target spell can't hit them anyway,
  // and reading top.card would crash. Bail.
  if (top.kind === 'trigger' || !top.card) return false;
  const card = top.card;
  // Counter removal aimed at us. (removeCreature severity ≥ 3 is real removal;
  // tap/bounce are tempo plays we'd usually let through.) Steal is also worth
  // countering — losing a permanent permanently to the opponent is roughly
  // as bad as having it destroyed, and worse if our deck has a strong card
  // they'd benefit from acquiring.
  // For modal cards on the stack, the chosen mode is locked in via top.modeIdx,
  // so we only need to consider THAT mode's effects — not all possible modes.
  // (Earlier this checked ALL modes as a conservative heuristic, leading the
  // AI to waste counters on Sanctuary-mode Charms that pose no threat.)
  const relevantEffects = ENGINE.effectsForMode(card, top.modeIdx);
  if (relevantEffects.some(e =>
    e.kind === 'damage' ||
    e.kind === 'counter' ||
    e.kind === 'steal' ||
    (e.kind === 'removeCreature' && (e.severity || 1) >= 3)
  )) return true;
  // Counter expensive creatures.
  if (card.type === 'Creature' && ENGINE.cardCost(card) >= 4) return true;
  // Sometimes counter draw/discard. (Pre-fix this referenced an undefined
  // `allEffects` variable left over from an earlier refactor — the throw
  // was being swallowed by AI's outer try/catch, silently turning this
  // branch into a no-op for over a year.)
  if (relevantEffects.some(e => e.kind === 'draw' || e.kind === 'discard')) return Math.random() < 0.5;
  return false;
}

// ============================================================
// COMBAT SIMULATION — pure function for attack/block AI prediction.
// Returns {deadAttackers, deadBlockers, damageToDefender, attackerLifeGain,
// defenderLifeGain}. Mirrors resolveCombatDamage exactly using shallow copies
// of damage counters; never mutates real state.
// ============================================================
function simulateCombat(state, attackerWho, attackerIids, blockMap) {
  const workingByIid = new Map();
  function snap(iid) {
    if (workingByIid.has(iid)) return workingByIid.get(iid);
    const real = ENGINE.findCard(iid);
    if (!real) return null;
    const copy = {
      iid,
      card: real.card,
      controller: real.controller,
      damage: real.card.damage || 0,
      dealtDeathtouch: false,
    };
    workingByIid.set(iid, copy);
    return copy;
  }
  // Map attacker iid → array of blocker iids assigned to it.
  const blockedByAtk = {};
  for (const [bIid, aIid] of (blockMap || new Map())) {
    if (!blockedByAtk[aIid]) blockedByAtk[aIid] = [];
    blockedByAtk[aIid].push(bIid);
  }
  // Make sure every attacker and blocker has a working copy.
  for (const aIid of attackerIids) snap(aIid);
  for (const aIid of Object.keys(blockedByAtk)) {
    for (const bIid of blockedByAtk[aIid]) snap(bIid);
  }

  let damageToDefender = 0;
  let attackerLifeGain = 0;
  let defenderLifeGain = 0;

  // First-strike step detection.
  const allCombatants = [];
  for (const aIid of attackerIids) {
    const w = snap(aIid); if (w) allCombatants.push(w.card);
  }
  for (const aIid of Object.keys(blockedByAtk)) {
    for (const bIid of blockedByAtk[aIid]) {
      const w = snap(bIid); if (w) allCombatants.push(w.card);
    }
  }
  const hasFirstStrike = allCombatants.some(c => c.keywords.includes('firstStrike'));

  const isDead = (w) => {
    if (!w) return true;
    if (w.card.keywords.includes('indestructible')) return false;
    const [, tou] = ENGINE.getStats(w.card);
    return w.damage >= tou || w.dealtDeathtouch;
  };

  const oneStrike = (dealsDamage) => {
    for (const aIid of attackerIids) {
      const wAtk = snap(aIid); if (!wAtk) continue;
      const atk = wAtk.card;
      if (isDead(wAtk)) continue;
      const [aPow] = ENGINE.getStats(atk);
      const wasBlocked = !!blockedByAtk[aIid] && blockedByAtk[aIid].length > 0;
      const livingBlockers = (blockedByAtk[aIid] || [])
        .map(bIid => snap(bIid))
        .filter(b => b && !isDead(b));
      const atkDeals = dealsDamage(atk);

      if (!wasBlocked) {
        if (atkDeals && aPow > 0) {
          damageToDefender += aPow;
          if (atk.keywords.includes('lifelink')) attackerLifeGain += aPow;
        }
        continue;
      }
      if (livingBlockers.length === 0) {
        // Blocked but all blockers died first — trample carries through.
        if (atkDeals && atk.keywords.includes('trample') && aPow > 0) {
          damageToDefender += aPow;
          if (atk.keywords.includes('lifelink')) attackerLifeGain += aPow;
        }
        continue;
      }
      // Trample requires at-least-lethal-damage to EVERY blocker before
      // any can carry to defender. Mirrors engine's dealCombatDamage —
      // sim and engine must agree or AI plans diverge from reality. Same
      // indestructible-deprioritization logic: piling damage on indestructibles
      // is wasted, so sort them last within damage-assignment order.
      const atkDeathtouch = atk.keywords.includes('deathtouch');
      const orderedBlockers = livingBlockers.slice().sort((a, b) => {
        const aInd = a.card.keywords.includes('indestructible');
        const bInd = b.card.keywords.includes('indestructible');
        if (aInd !== bInd) return aInd ? 1 : -1;
        return ENGINE.getCardValue(b.card, 'kill') - ENGINE.getCardValue(a.card, 'kill');
      });
      let remaining = atkDeals ? aPow : 0;
      let attackerDamage = 0;
      const unsatisfied = [];
      for (const wBlk of orderedBlockers) {
        const blk = wBlk.card;
        const [bPow, bTou] = ENGINE.getStats(blk);
        const indestructible = blk.keywords.includes('indestructible');
        const lethalNeeded = (atkDeathtouch && !indestructible)
          ? Math.min(1, Math.max(0, bTou - wBlk.damage))
          : Math.max(0, bTou - wBlk.damage);
        if (atkDeals && remaining >= lethalNeeded && lethalNeeded > 0) {
          wBlk.damage += lethalNeeded;
          if (atkDeathtouch && !indestructible) wBlk.dealtDeathtouch = true;
          if (atk.keywords.includes('lifelink')) attackerLifeGain += lethalNeeded;
          remaining -= lethalNeeded;
        } else {
          unsatisfied.push(wBlk);
        }
        if (dealsDamage(blk) && bPow > 0) {
          attackerDamage += bPow;
          if (blk.keywords.includes('deathtouch')) wAtk.dealtDeathtouch = true;
          if (blk.keywords.includes('lifelink')) defenderLifeGain += bPow;
        }
      }
      wAtk.damage += attackerDamage;
      // Leftover: trample only carries with no unsatisfied blockers.
      if (atkDeals && remaining > 0) {
        if (unsatisfied.length === 0 && atk.keywords.includes('trample')) {
          damageToDefender += remaining;
          if (atk.keywords.includes('lifelink')) attackerLifeGain += remaining;
        } else if (unsatisfied.length > 0) {
          unsatisfied[0].damage += remaining;
          if (atk.keywords.includes('lifelink')) attackerLifeGain += remaining;
        }
      }
    }
  };

  if (hasFirstStrike) {
    oneStrike(c => c.keywords.includes('firstStrike'));
    oneStrike(c => !c.keywords.includes('firstStrike'));
  } else {
    oneStrike(() => true);
  }

  const deadAttackers = new Set();
  const deadBlockers = new Set();
  for (const aIid of attackerIids) {
    const w = snap(aIid);
    if (w && isDead(w)) deadAttackers.add(aIid);
  }
  for (const aIid of Object.keys(blockedByAtk)) {
    for (const bIid of blockedByAtk[aIid]) {
      const w = snap(bIid);
      if (w && isDead(w)) deadBlockers.add(bIid);
    }
  }

  return { deadAttackers, deadBlockers, damageToDefender, attackerLifeGain, defenderLifeGain };
}

// Will current combat kill this creature when it resolves? Used by sac-ability
// scorer (doomed body has zero sac cost). Only meaningful in COMBAT_BLOCK /
// COMBAT_DAMAGE phases.
function isCreatureDoomedInCombat(state, who, iid) {
  if (state.phase !== 'COMBAT_BLOCK' && state.phase !== 'COMBAT_DAMAGE') return false;
  const attackerWho = state.activePlayer;
  const attackerIids = state.attackers || [];
  if (attackerIids.length === 0) return false;
  // Is the creature an attacker, a blocker, or neither?
  const isAttacker = attackerIids.includes(iid);
  let isBlocker = false;
  if (state.blockers instanceof Map) {
    for (const [bIid] of state.blockers) {
      if (bIid === iid) { isBlocker = true; break; }
    }
  }
  if (!isAttacker && !isBlocker) return false;
  // Simulate combat with current state and check if iid is in the dead set.
  const out = simulateCombat(state, attackerWho, attackerIids, state.blockers || new Map());
  if (isAttacker && out.deadAttackers.has(iid)) return true;
  if (isBlocker && out.deadBlockers.has(iid)) return true;
  return false;
}

// Would adding a temporary counter to the source change the combat outcome
// for it specifically — i.e., turn its death into survival? Used by the
// activated-ability scorer to detect "sac to win the fight" moments. Big
// positive return only when the buff flips the source's fate; otherwise 0.
//
// Approach: simulate combat as-is, then mutate source with the buff,
// simulate again, restore. Compare source's state in deadAttackers /
// deadBlockers between the two simulations.
function combatBuffSwingValue(state, who, sourceIid, buffPow, buffTou) {
  if (state.phase !== 'COMBAT_BLOCK' && state.phase !== 'COMBAT_DAMAGE') return 0;
  const attackerWho = state.activePlayer;
  const attackerIids = state.attackers || [];
  if (attackerIids.length === 0) return 0;
  const isAttacker = attackerIids.includes(sourceIid);
  let isBlocker = false;
  if (state.blockers instanceof Map) {
    for (const [bIid] of state.blockers) {
      if (bIid === sourceIid) { isBlocker = true; break; }
    }
  }
  if (!isAttacker && !isBlocker) return 0;
  const before = simulateCombat(state, attackerWho, attackerIids, state.blockers || new Map());
  const wasDying = (isAttacker && before.deadAttackers.has(sourceIid))
                || (isBlocker && before.deadBlockers.has(sourceIid));
  // Mutate source temporarily — simulateCombat reads the live card via
  // ENGINE.findCard, so the buff has to live there. We restore on exit.
  const f = ENGINE.findCard(sourceIid);
  if (!f) return 0;
  const card = f.card;
  const oldTempPow = card.tempPower || 0;
  const oldTempTou = card.tempTou || 0;
  card.tempPower = oldTempPow + (buffPow || 0);
  card.tempTou = oldTempTou + (buffTou || 0);
  let after;
  try {
    after = simulateCombat(state, attackerWho, attackerIids, state.blockers || new Map());
  } finally {
    card.tempPower = oldTempPow;
    card.tempTou = oldTempTou;
  }
  const stillDying = (isAttacker && after.deadAttackers.has(sourceIid))
                  || (isBlocker && after.deadBlockers.has(sourceIid));
  // Big bonus if the buff flips dying → surviving. Also check: did the
  // buff additionally turn a non-killing combat into a killing one
  // (source kills its target now where it didn't before)? That's also
  // valuable but smaller than saving the source's life.
  let swing = 0;
  if (wasDying && !stillDying) swing += 15;   // saved the source — huge
  // Source was attacking and now kills more blockers (or attacker now dies less)
  let extraBlockerKills = 0;
  for (const bIid of after.deadBlockers) {
    if (!before.deadBlockers.has(bIid)) extraBlockerKills++;
  }
  let extraAttackerKills = 0;
  for (const aIid of after.deadAttackers) {
    if (!before.deadAttackers.has(aIid)) extraAttackerKills++;
  }
  // From player perspective: more enemy deaths is good, more own deaths is bad.
  // The `who` parameter is the AI player; their "enemy" combatants are the
  // ones in the OTHER player's army.
  if (attackerWho === who) {
    // We're attacking — extra blocker kills are wins, extra attacker deaths
    // mean OUR attackers are dying more (shouldn't happen from a buff, but defensive).
    swing += extraBlockerKills * 4;
    swing -= extraAttackerKills * 4;
  } else {
    // We're defending — extra attacker kills (enemy attackers dying) are wins.
    swing += extraAttackerKills * 4;
    swing -= extraBlockerKills * 4;
  }
  // Face-damage delta. If the buff results in more damage getting through to
  // the defender (typically: buffing an unblocked attacker), that's value
  // proportional to how close it brings opp to lethal. Scale of 4 per
  // damage matches roughly half a Bolt's face value (Bolt-to-face scores
  // 25-28 for 1-3 damage; +2 face damage from Giant Growth here scores 8,
  // about half a real burn spell — appropriate for a card spent on
  // incremental damage rather than a kill spell). Lethal triggers a huge
  // bonus. Only the active-player side benefits from face damage; defending-
  // player buffs don't deal face damage in the standard combat model.
  if (attackerWho === who) {
    const damageDelta = (after.damageToDefender || 0) - (before.damageToDefender || 0);
    if (damageDelta > 0) {
      const them = attackerWho === 'you' ? 'opp' : 'you';
      const oppLifeAfterBefore = state[them].life - (before.damageToDefender || 0);
      swing += damageDelta * 4;
      if ((after.damageToDefender || 0) >= state[them].life) swing += 60;       // lethal this combat — overwhelming bonus
      else if (oppLifeAfterBefore - damageDelta <= 4) swing += 8;                // pushes into burn range
    }
  }
  return swing;
}

// Score combat outcome from attacker's perspective. Higher = better.
// Components: face damage (+), lethal bonus (+), dead opp creatures stats (+),
// dead our creatures stats (-), lifelink delta.
function scoreCombatOutcome(state, attackerWho, outcome, attackerIids) {
  const defenderWho = opp(attackerWho);
  let score = 0;
  // Damage weight ramps when defender's life drops (panic multiplier):
  // ≥15 life → 2; below ramps via 30/defLife (at 5 → 6; at 1 → 30).
  const defLife = Math.max(1, state[defenderWho].life);
  const dmgWeight = Math.max(2, 30 / defLife);
  score += outcome.damageToDefender * dmgWeight;
  score += outcome.attackerLifeGain;
  score -= outcome.defenderLifeGain;
  // Dead creature value — scored by getCardValue with 'kill' purpose so we
  // correctly model that a creature with a dies-trigger is worth less to kill
  // (it'll fire the trigger when it dies). Recurring threats stay valuable.
  // The +6/+7 base reflects "losing a card costs more than its in-play stats
  // suggest" — chumping is a real resource sink, not just a stat trade.
  // The +0.5*power factor breaks ties toward losing smaller creatures
  // (cheap chumps preferred over big-body sacrifices). Attacker death
  // costs slightly more (+7 vs +6) because the attacker chose the engagement;
  // this asymmetry biases the AI away from attacking into bad trades while
  // still letting it defensively trade when the math favors it.
  for (const iid of outcome.deadBlockers) {
    const f = ENGINE.findCard(iid);
    if (!f) continue;
    const [pow] = ENGINE.getStats(f.card);
    score += ENGINE.getCardValue(f.card, 'kill') + 6 + 0.5 * pow;
  }
  for (const iid of outcome.deadAttackers) {
    const f = ENGINE.findCard(iid);
    if (!f) continue;
    const [pow] = ENGINE.getStats(f.card);
    score -= ENGINE.getCardValue(f.card, 'kill') + 7 + 0.5 * pow;
  }
  // Lethal — overwhelming bonus. Attacker should always take it if possible.
  if (state[defenderWho].life - outcome.damageToDefender + outcome.defenderLifeGain <= 0) {
    score += 10000;
  }
  // Don't kill yourself: factor in damage we'd take if opp's surviving
  // creatures attacked us next turn. Account for our own remaining
  // blockers — only excess attacker power gets through.
  //
  // Defending blockers next turn: our creatures that AREN'T tapped from
  // attacking. That's: non-attackers + vigilance attackers, minus those
  // that died in combat. attackerIids may be undefined in legacy callers
  // (defaults to empty — degrades gracefully to the old "ignore blockers"
  // approximation).
  const attackerSet = new Set(attackerIids || []);
  const survivingOppPower = state[defenderWho].battlefield
    .filter(c => c.type === 'Creature' && !outcome.deadBlockers.has(c.iid))
    .reduce((s, c) => s + ENGINE.getStats(c)[0], 0);
  const ourDefensiveTough = state[attackerWho].battlefield
    .filter(c => c.type === 'Creature')
    .filter(c => !outcome.deadAttackers.has(c.iid))   // didn't die in combat
    .filter(c => !attackerSet.has(c.iid)
                 || c.keywords.includes('vigilance'))   // not tapped from attacking
    .reduce((s, c) => s + ENGINE.getStats(c)[1], 0);    // sum toughness
  const incoming = Math.max(0, survivingOppPower - ourDefensiveTough);
  if (state[attackerWho].life - incoming <= 0) {
    score -= 50;  // we'd be in serious trouble next turn
  }
  return score;
}

// Predict opp's BEST blocking response to a given attacker subset.
// Used during attack planning to know what trade we're walking into.
// Mirrors what our own decideBlockers will do.
function predictOppBlocks(state, attackerWho, attackerIids) {
  const defenderWho = opp(attackerWho);
  const blockers = state[defenderWho].battlefield.filter(c => ENGINE.canCreatureBlock(c));
  // Defender wants to MINIMIZE our combat score. Try several block configs,
  // pick the one with the lowest attacker score.
  return findBestBlocks(state, attackerWho, attackerIids, blockers);
}

// Search for a good block assignment. We don't enumerate all possibilities
// (factorial blowup) — instead we use a greedy heuristic that's "good
// enough" for prediction and matches what real players usually do.
//
// Strategy: for each attacker (biggest power first), consider whether to
// block. For each block decision, pick the blocker that produces the best
// outcome for the defender (lowest attacker score).
function findBestBlocks(state, attackerWho, attackerIids, availableBlockers) {
  // Defensive: filter attackers that have left the battlefield since
  // declaration (e.g., bounced by a flash spell during the response window
  // after attackers were declared). G.attackers is set on declareAttackers
  // and only reset at end-of-combat; it can carry stale iids mid-combat.
  // Engine combat code already guards against this (see dealCombatDamage),
  // but our sort comparator below dereferences findCard(...).card directly.
  const liveAttackerIids = attackerIids.filter(iid => ENGINE.findCard(iid));
  // Sort attackers by power descending (biggest threats first).
  const sortedAtks = liveAttackerIids.slice().sort((a, b) => {
    const fa = ENGINE.findCard(a), fb = ENGINE.findCard(b);
    return ENGINE.getStats(fb.card)[0] - ENGINE.getStats(fa.card)[0];
  });
  const used = new Set();
  const blockMap = new Map();
  for (const aIid of sortedAtks) {
    const fAtk = ENGINE.findCard(aIid); if (!fAtk) continue;
    const atk = fAtk.card;
    const eligibleBlockers = availableBlockers.filter(b =>
      !used.has(b.iid) && ENGINE.canCreatureBlock(b, atk));
    if (eligibleBlockers.length === 0) continue;
    if (atk.keywords.includes('menace') && eligibleBlockers.length < 2) continue;

    // Try: don't block, vs. block with various candidates. Pick what
    // minimizes attacker score (best for defender).
    let best = { mapDelta: null, score: Infinity };
    // Option: don't block this attacker.
    {
      const trial = new Map(blockMap);
      const out = simulateCombat(state, attackerWho, sortedAtks, trial);
      const sc = scoreCombatOutcome(state, attackerWho, out, sortedAtks);
      if (sc < best.score) best = { mapDelta: [], score: sc };
    }
    // Option: block with each eligible blocker (or pair, for menace).
    if (atk.keywords.includes('menace')) {
      // Try each pair of blockers.
      for (let i = 0; i < eligibleBlockers.length; i++) {
        for (let j = i + 1; j < eligibleBlockers.length; j++) {
          const b1 = eligibleBlockers[i], b2 = eligibleBlockers[j];
          const trial = new Map(blockMap);
          trial.set(b1.iid, aIid);
          trial.set(b2.iid, aIid);
          const out = simulateCombat(state, attackerWho, sortedAtks, trial);
          const sc = scoreCombatOutcome(state, attackerWho, out, sortedAtks);
          if (sc < best.score) best = { mapDelta: [b1.iid, b2.iid], score: sc };
        }
      }
    } else {
      // Singles.
      for (const b of eligibleBlockers) {
        const trial = new Map(blockMap);
        trial.set(b.iid, aIid);
        const out = simulateCombat(state, attackerWho, sortedAtks, trial);
        const sc = scoreCombatOutcome(state, attackerWho, out, sortedAtks);
        if (sc < best.score) best = { mapDelta: [b.iid], score: sc };
      }
      // Pairs (multi-block) for non-menace too. Catches scenarios where
      // neither single blocker can kill the attacker but two together can
      // (e.g., 2/2 + 2/2 vs 3/3 — single block trades 2/2 for nothing,
      // but multi-block kills the attacker for one 2/2). The loop is
      // O(k²) but k is small (typically 2–6 eligible blockers).
      if (eligibleBlockers.length >= 2) {
        for (let i = 0; i < eligibleBlockers.length; i++) {
          for (let j = i + 1; j < eligibleBlockers.length; j++) {
            const b1 = eligibleBlockers[i], b2 = eligibleBlockers[j];
            const trial = new Map(blockMap);
            trial.set(b1.iid, aIid);
            trial.set(b2.iid, aIid);
            const out = simulateCombat(state, attackerWho, sortedAtks, trial);
            const sc = scoreCombatOutcome(state, attackerWho, out, sortedAtks);
            if (sc < best.score) best = { mapDelta: [b1.iid, b2.iid], score: sc };
          }
        }
      }
    }
    if (best.mapDelta && best.mapDelta.length > 0) {
      for (const bIid of best.mapDelta) {
        blockMap.set(bIid, aIid);
        used.add(bIid);
      }
    }
  }
  return blockMap;
}

// =====================================================================
// Smart attacker selection.
//
// Enumerate attack subsets (capped for performance), simulate opp's best
// blocks, score each outcome, pick the highest-scoring subset.
// =====================================================================
function decideAttackers(state, who) {
  const eligible = state[who].battlefield
    .filter(ENGINE.canCreatureAttack)
    .map(c => c.iid);
  if (eligible.length === 0) return {type:'declareAttackers', cardIids: []};

  // Look for lethal first — if we can kill them by attacking with all unblockable
  // creatures, do that regardless of trades.
  const lethal = findLethalAttack(state, who, eligible);
  if (lethal) {
    debugVerifyAttackers(state, who, lethal, 'lethal');
    return {type:'declareAttackers', cardIids: lethal};
  }

  // Subset enumeration. 2^8 = 256 subsets is the practical cap.
  // For larger boards, use greedy: try "all," then drop creatures one at a time.
  let bestSubset = [];
  let bestScore = -Infinity;

  const tryAttack = (subset) => {
    if (subset.length === 0) {
      // Attacking with nothing has score 0 (no progress, no losses).
      if (0 > bestScore) { bestScore = 0; bestSubset = []; }
      return;
    }
    const blocks = predictOppBlocks(state, who, subset);
    const out = simulateCombat(state, who, subset, blocks);
    let sc = scoreCombatOutcome(state, who, out, subset);
    // Bonus for attack-trigger creatures (Hypnotic Specter, Bloodthirster, etc.)
    // since the sim doesn't model these but they have real value.
    for (const iid of subset) {
      const f = ENGINE.findCard(iid);
      if (f && hasAttackTrigger(f.card)) sc += 4;
    }
    if (sc > bestScore) { bestScore = sc; bestSubset = subset; }
  };

  if (eligible.length <= 8) {
    // Full enumeration.
    const total = 1 << eligible.length;
    for (let mask = 0; mask < total; mask++) {
      const subset = [];
      for (let i = 0; i < eligible.length; i++) {
        if (mask & (1 << i)) subset.push(eligible[i]);
      }
      tryAttack(subset);
    }
  } else {
    // Greedy fallback: try "all attackers," then drop each one in turn,
    // keep the best. Repeat once on the result for second-order improvements.
    tryAttack(eligible.slice());
    for (let i = 0; i < eligible.length; i++) {
      const subset = eligible.filter((_, idx) => idx !== i);
      tryAttack(subset);
    }
    tryAttack([]);
  }
  debugVerifyAttackers(state, who, bestSubset, 'enumeration');
  return {type:'declareAttackers', cardIids: bestSubset};
}

// Sanity check the chosen attackers before returning. If any iid doesn't
// belong to `who`, log loudly so we can debug the source. Returns nothing —
// the AI proceeds either way (engine will reject illegal actions).
function debugVerifyAttackers(state, who, iids, source) {
  for (const iid of iids) {
    const f = ENGINE.findCard(iid);
    if (!f) {
      console.warn(`AI bug: attacker iid ${iid} not found (source: ${source})`);
      continue;
    }
    if (f.controller !== who) {
      console.warn(`AI bug: attacker iid ${iid} belongs to ${f.controller}, not ${who} (source: ${source})`,
        'card:', f.card.name);
    }
    if (f.card.tapped) console.warn(`AI bug: attacker iid ${iid} is tapped (source: ${source}) card:`, f.card.name);
    if (f.card.sick && !f.card.keywords.includes('haste')) console.warn(`AI bug: attacker iid ${iid} is sick (source: ${source}) card:`, f.card.name);
    if (f.card.keywords.includes('defender')) console.warn(`AI bug: attacker iid ${iid} has defender (source: ${source}) card:`, f.card.name);
  }
}

// Some creatures have triggers when they attack — Hypnotic Specter (discard),
// Bloodthirster (1 damage), Sengir Vampire (technically just lifelink not
// attack-triggered). We don't want to lose this value in attack decisions.
function hasAttackTrigger(card) {
  if (!card.triggers) return false;
  return card.triggers.some(t => t.event === 'attacks');
}

// Lethal attack search: if there's a subset of attackers that, even with
// optimal opp blocks, deals enough damage to face to kill them, return it.
function findLethalAttack(state, who, eligible) {
  const them = opp(who);
  const oppLife = state[them].life;
  // Quick filter: if total power of all eligible is less than opp life,
  // no way to lethal via attack alone.
  const totalPower = eligible.reduce((s, iid) => {
    const f = ENGINE.findCard(iid);
    return s + (f ? ENGINE.getStats(f.card)[0] : 0);
  }, 0);
  if (totalPower < oppLife) return null;
  // Try the full attack — most common lethal scenario.
  const blocks = predictOppBlocks(state, who, eligible);
  const out = simulateCombat(state, who, eligible, blocks);
  if (state[them].life + out.defenderLifeGain - out.damageToDefender <= 0) {
    return eligible.slice();
  }
  return null;
}

// =====================================================================
// Smart blocker selection. Same engine as predictOppBlocks but applied
// to ourselves as defender.
// =====================================================================
function decideBlockers(state, who) {
  const attackerWho = opp(who);
  const attackerIids = state.attackers.slice();
  const blockers = state[who].battlefield.filter(c => ENGINE.canCreatureBlock(c));
  // Same logic as predictOppBlocks, but we ARE the defender. Reuses
  // findBestBlocks — that function picks the blocking config that minimizes
  // attacker score, which is exactly what defender wants.
  const blockMap = findBestBlocks(state, attackerWho, attackerIids, blockers);
  return {type:'declareBlockers', blockMap};
}

function decideCleanupDiscard(state, who, actions) {
  // Discard the LOWEST-VALUE card in hand. Previously discarded the most-
  // expensive card on the theory that big mana costs are unplayable late —
  // but the cleanup window only fires when we're already over hand-size,
  // i.e., we have surplus to choose from. The right call is to keep the
  // best cards regardless of mana cost (we'll cast the bomb eventually) and
  // discard whatever is cheapest/most-redundant. getCardValue handles this
  // via its full intrinsic score, so it correctly prefers to discard a
  // 4th-copy off-color filler over a 6-cost bomb in our colors.
  const discardActs = actions.filter(a => a.type === 'discard');
  if (!discardActs.length) return {type:'pass'};
  let best = discardActs[0], bestValue = Infinity;
  for (const a of discardActs) {
    const card = state[who].hand.find(c => c.iid === a.cardIid);
    if (!card) continue;
    const v = ENGINE.getCardValue(card, 'draft');
    if (v < bestValue) { bestValue = v; best = a; }
  }
  return best;
}

function pickBestTargetForSpell(state, who, card, options) {
  // Defensive: skip if casting this spell would deal lethal damage to us.
  // Some spells have non-targeted self-damage effects (e.g., Final Strike:
  // "destroy creature, you lose 2 life") — the targeted scoring below
  // ignores the self-damage line, so we'd happily suicide on opp's bomb
  // when at 1 life. Sum any damage-to-self in the card's effects and bail
  // if it equals or exceeds our life total. Phylactery owners are exempt
  // from the bail since damage past 0 rips slots instead of losing — but
  // opp can never have Phylactery (special:true), so this is mostly a
  // future-proofing note rather than a real branch.
  // For modal cards: bail at the OPTION level if the chosen mode has
  // lethal self-damage. We can't bail at the card level (other modes
  // might be safe), so we tag those individual options as -100 below.
  const selfDamageOf = (effs) => (effs || []).reduce((sum, e) =>
    sum + ((e.kind === 'damage' && e.target === 'self') ? (e.amount || 0) : 0), 0);
  if (!ENGINE.isModal(card)) {
    if (selfDamageOf(card.effects) >= state[who].life) return null;
  }
  // Score every option (option = a specific (mode, target) combination).
  // Untargeted options (no targets field) get scored via shouldCastUntargeted
  // for the relevant mode; targeted options get scoreSpellTarget. Pick the
  // highest-scoring overall.
  const scored = options.map(opt => {
    const modeIdx = opt.modeIdx || 0;
    const modeEffects = ENGINE.effectsForMode(card, modeIdx);
    if (!opt.targets) {
      // Untargeted (or untargeted mode of a modal card). Score by
      // shouldCastUntargeted result; convert boolean → score so it ranks
      // against targeted options.
      //   - not-ok      → -100 (never cast)
      //   - ok, creature → fixed positive (creatures don't have card.effects;
      //     they're worth playing if shouldCastUntargeted said yes — we
      //     want them to win the > 0 filter at the bottom)
      //   - ok, spell   → spellValueForEffects (real per-mode score)
      const ok = shouldCastUntargeted(state, who, card, modeIdx);
      if (!ok) return {opt, score: -100};
      if (card.type === 'Creature') {
        // Creatures pass straight through — they're always cast on curve.
        // 100 is well above any reasonable spell-mode score so they
        // dominate untargeted-spell options when tied (which we want:
        // a creature on curve usually beats a flexible spell mode).
        return {opt, score: 100};
      }
      // Static base score from effect kinds (gainLife=1, draw=3, etc).
      let score = ENGINE.spellValueForEffects(modeEffects);
      // Dynamic bonuses based on current state. The static score is a
      // reasonable card-evaluation baseline (used by the drafter), but
      // at cast time we know board, life, and hand. Apply situation
      // bonuses so the AI picks the right MODE of a modal spell when
      // one mode is clearly better given the current state.
      score += scoreUntargetedSituation(state, who, modeEffects);
      return {opt, score};
    }
    return {opt, score: scoreMultiTargetSpell(state, who, card, opt.targets, modeIdx)};
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score <= 0) return null;
  return scored[0].opt;
}

// Score a multi-target spell by summing per-slot scores. Single-target
// collapses to scoreSpellTargetForMode. Approximate when effects interact.
function scoreMultiTargetSpell(state, who, card, targets, modeIdx) {
  if (!Array.isArray(targets) || targets.length === 0) return 0;
  const modeEffects = ENGINE.effectsForMode(card, modeIdx);
  const slotsUsed = new Set();
  for (const eff of modeEffects) {
    if (ENGINE.effectNeedsTarget && ENGINE.effectNeedsTarget(eff)) {
      slotsUsed.add(eff.targetSlot || 0);
    }
  }
  if (slotsUsed.size === 0) return 0;
  if (slotsUsed.size === 1) {
    return scoreSpellTargetForMode(state, who, card, targets[0], modeIdx);
  }
  let total = 0;
  for (const slot of slotsUsed) {
    const t = targets[slot];
    if (!t) continue;
    total += scoreSpellTargetForMode(state, who, card, t, modeIdx);
  }
  return total;
}

// Situational bonus for untargeted spell modes. Adds to the static-effect
// baseline based on board/life pressure. Critical for modal spells where
// the AI must pick between modes that score similarly statically but
// differ wildly in current value (gain-3-life is worthless at 20 life,
// a critical save at 4).
function scoreUntargetedSituation(state, who, effects) {
  const us = who, them = opp(who);
  let bonus = 0;
  for (const e of (effects || [])) {
    if (e.kind === 'gainLife') {
      const myLife = state[us].life;
      const oppLife = state[them].life;
      const amount = e.amount || 0;
      // Lifegain at full life is near-worthless; critical at low life.
      // Tiered scale calibrated against face-burn scoring (which awards
      // ~40-70 for putting opp in danger zone). At ≤4 life, gaining 3 is
      // a save and should beat face-burn that won't actually win the
      // race — score scales accordingly.
      // Extra bonus when racing-but-losing: opp life > our life means
      // we'd lose a damage race, so each life-point gained is worth more
      // (we need life to outlast them, not damage to outpace them).
      const losing = oppLife > myLife;
      if (myLife <= 4) {
        // Critical: each life gained is huge. +12 per point at 4-life or below;
        // +18 per point if losing a race. Caps at amount * 18 = 54 for gain-3.
        bonus += amount * (losing ? 18 : 12);
      } else if (myLife <= 8) {
        bonus += amount * (losing ? 8 : 5);
      } else if (myLife <= 14) {
        bonus += amount * 2;
      }
      // Subtract the +1-per-gainLife static baseline so we don't double-count.
      // (spellValueForEffects added 1 already for the gainLife kind.)
      if (myLife <= 14 && amount > 0) bonus -= 1;
    }
  }
  return bonus;
}

function shouldCastUntargeted(state, who, card, modeIdx) {
  const us = who, them = opp(who);
  // Read effects from the chosen mode (or flat list for non-modal cards).
  const modeEffects = ENGINE.effectsForMode(card, modeIdx || 0);
  const eff = modeEffects[0];
  if (!eff) return true;
  if (eff.kind === 'damageAll') {
    // Cast only if the asymmetric trade favors us. scoreDamageAll returns
    // (their loss) - (our loss); positive means we come out ahead.
    return scoreDamageAll(state, who, eff.amount || 0) >= 8;
  }
  if (eff.kind === 'removeAll') {
    // Unified mass removal. Asymmetric (opp-only) is always a win when opp
    // has a real board. Symmetric needs the "we're losing the board" check
    // — destroying our own stuff alongside theirs only makes sense if we're
    // already behind.
    const sev = eff.severity || 3;
    const whose = eff.whose || 'all';
    if (whose === 'opp') {
      // Asymmetric — score by opp's board value alone.
      return scoreBounceAll(state, who, 'opp') >= 8;
    }
    // Symmetric. For sev 1 (tap) the cost-benefit is small — only worth it
    // if opp has untapped attackers and we don't. For sev 2+ (bounce/destroy/
    // exile) the same "are we losing" check applies.
    if (sev === 1) {
      const oppUntapped = state[them].battlefield
        .filter(c => c.type === 'Creature' && !c.tapped).length;
      const ourUntapped = state[us].battlefield
        .filter(c => c.type === 'Creature' && !c.tapped).length;
      return oppUntapped > ourUntapped + 1;
    }
    const ourPower = state[us].battlefield
      .filter(c => c.type === 'Creature').reduce((s, c) => s + ENGINE.getStats(c)[0], 0);
    const theirPower = state[them].battlefield
      .filter(c => c.type === 'Creature').reduce((s, c) => s + ENGINE.getStats(c)[0], 0);
    return theirPower > ourPower + 2;
  }
  if (eff.kind === 'edict') {
    // Cast only if opp has at least one creature worth removing. The edict
    // forces opp to choose, and they'll pick their lowest-value creature —
    // so we're paying mana for whatever their cheapest creature is. Worth
    // it if their cheapest is meaningful (≥1 power AND ≥2 toughness, OR
    // any creature with a relevant keyword/trigger).
    const oppC = state[them].battlefield.filter(c => c.type === 'Creature');
    if (oppC.length === 0) return false;     // fizzle
    // What will they sac? Their lowest-value. If even that is worth taking
    // off the board (more than the spell's cost), cast.
    const sortedByValue = oppC.slice().sort((a, b) =>
      ENGINE.getCardValue(a, 'kill') - ENGINE.getCardValue(b, 'kill'));
    const sacCandidate = sortedByValue[0];
    const minWorthwhile = 3;  // a 1/1 with no abilities scores ~0; a 2/2 ~2; a real threat ≥4.
    return ENGINE.getCardValue(sacCandidate, 'kill') >= minWorthwhile;
  }
  if (eff.kind === 'pumpAllYours') {
    // Cast only when we have multiple creatures to pump (Overrun-style).
    const ours = state[us].battlefield.filter(c => c.type === 'Creature').length;
    return ours >= 2;
  }
  if (eff.kind === 'grantKeyword' && (eff.whose === 'allYours' || eff.whose === 'all')) {
    // Mass keyword grant (Aerial Maneuver-style). Cast when we have ≥2
    // creatures to benefit. For 'all' (symmetric, rare), require we have
    // strictly more creatures than opp so we benefit more.
    const ours = state[us].battlefield.filter(c => c.type === 'Creature').length;
    if (eff.whose === 'all') {
      const theirs = state[them].battlefield.filter(c => c.type === 'Creature').length;
      return ours >= 2 && ours > theirs;
    }
    return ours >= 2;
  }
  // Default: cast cheap utility (draw, ramp).
  return true;
}

// Lane-opening bonus: face damage we'd deal next attack if `removedIid`
// weren't blocking. Drives "kill the chump, attack lethal" plans. Simulates
// combat twice (real vs hypothetical blockers); if removal flips non-lethal
// to lethal, returns 1000. O(attackers×blockers) — fine since few removal
// targets are scored per turn.
function laneOpeningBonus(state, who, removedIid) {
  const them = opp(who);
  // Eligible attackers: untapped non-summoning-sick creatures we control.
  const attackers = state[who].battlefield
    .filter(c => ENGINE.canCreatureAttack(c))
    .map(c => c.iid);
  if (attackers.length === 0) return 0;
  // Real vs hypothetical blockers (with `removedIid` removed).
  const realBlockers = state[them].battlefield.filter(c => ENGINE.canCreatureBlock(c));
  const hypoBlockers = realBlockers.filter(c => c.iid !== removedIid);
  if (realBlockers.length === hypoBlockers.length) return 0;
  const blocksReal = findBestBlocks(state, who, attackers, realBlockers);
  const outReal = simulateCombat(state, who, attackers, blocksReal);
  const blocksHypo = findBestBlocks(state, who, attackers, hypoBlockers);
  const outHypo = simulateCombat(state, who, attackers, blocksHypo);
  // If removing this creature flips a non-lethal attack into lethal, huge
  // bonus — outweighs face-burn scoring that would otherwise win.
  const oppLifeAfterReal = state[them].life - outReal.damageToDefender;
  const oppLifeAfterHypo = state[them].life - outHypo.damageToDefender;
  if (oppLifeAfterReal > 0 && oppLifeAfterHypo <= 0) return 1000;
  const delta = outHypo.damageToDefender - outReal.damageToDefender;
  if (delta <= 0) return 0;
  // 3x weight per face-damage point; cap 30 prevents tiny lanes from dominating.
  return Math.min(30, delta * 3);
}

// Score a damageAll spell from `who`'s perspective. Asymmetric: hits every
// creature on both battlefields. Calculates net advantage as (opp creatures
// killed) - (our creatures killed) weighted by getCardValue. Negative score
// = we'd lose more than they would; positive = we sweep them. Indestructibles
// don't die but still take damage (currently no relevant interaction).
function scoreDamageAll(state, who, amount) {
  const us = who, them = opp(who);
  let ourLoss = 0, theirLoss = 0;
  for (const c of state[us].battlefield) {
    if (c.type !== 'Creature') continue;
    if (c.keywords.includes('indestructible')) continue;
    const [, tou] = ENGINE.getStats(c);
    const remaining = tou - c.damage;
    if (amount >= remaining) ourLoss += ENGINE.getCardValue(c, 'kill');
  }
  for (const c of state[them].battlefield) {
    if (c.type !== 'Creature') continue;
    if (c.keywords.includes('indestructible')) continue;
    const [, tou] = ENGINE.getStats(c);
    const remaining = tou - c.damage;
    if (amount >= remaining) theirLoss += ENGINE.getCardValue(c, 'kill');
  }
  return theirLoss - ourLoss;
}

// Score bounceAll. Asymmetric (whose='opp'): full opp value. Symmetric
// ('all'): theirLoss - ourLoss × 0.6. Uses 'bounce' purpose (weaker than
// destroy — opp redeploys).
function scoreBounceAll(state, who, whose) {
  const us = who, them = opp(who);
  let theirValue = 0;
  for (const c of state[them].battlefield) {
    if (c.type !== 'Creature') continue;
    theirValue += ENGINE.getCardValue(c, 'bounce');
  }
  if (whose === 'opp') return theirValue;
  // Symmetric: count our own losses too. We get to recast our stuff, but
  // the tempo cost is real. Weight our loss at 0.6 (we recover the cards;
  // opp also recovers; but we paid mana for the bounce on top).
  let ourValue = 0;
  for (const c of state[us].battlefield) {
    if (c.type !== 'Creature') continue;
    ourValue += ENGINE.getCardValue(c, 'bounce');
  }
  return theirValue - ourValue * 0.6;
}

function scoreSpellTarget(state, who, card, target) {
  return scoreSpellTargetForMode(state, who, card, target, 0);
}
function scoreSpellTargetForMode(state, who, card, target, modeIdx) {
  const us = who, them = opp(who);
  // Read effects from the chosen mode (or flat list for non-modal cards).
  const modeEffects = ENGINE.effectsForMode(card, modeIdx);
  const eff = modeEffects.find(e => e.target);
  if (!eff) return 0;
  if (eff.kind === 'damage') {
    const amount = eff.amount;
    if (target.kind === 'creature') {
      const c = ENGINE.findCard(target.iid);
      if (!c) return -100;
      if (c.controller === us) return -100;       // never burn our own
      if (c.card.keywords.includes('indestructible')
          && !c.card.keywords.includes('flying')) {
        // indestructible blocks lethal damage; spell would be wasted
        return -50;
      }
      const [pow, tou] = ENGINE.getStats(c.card);
      const remaining = tou - c.card.damage;
      const wouldKill = amount >= remaining;
      if (!wouldKill) {
        // Partial damage. Worth it only if creature is big and we have follow-up,
        // otherwise we'd rather go to face.
        return Math.max(2, pow + tou - amount);
      }
      // Killing a creature. Value scales with how dangerous it is to leave
      // alive (uses getCardValue with 'kill' purpose — accounts for evasion,
      // recurring threats, and dies-trigger penalty).
      // BUT: if amount >> remaining, this is overkill. Heavily penalize.
      const overkill = amount - remaining;
      let score = 50 + ENGINE.getCardValue(c.card, 'kill');
      if (overkill >= 2) score -= overkill * 5;
      // Lane-opening bonus: if killing this creature meaningfully increases
      // the face damage we deal next combat, that's strategic value the
      // standard kill-score misses. Helps the AI see "Bolt the chump, then
      // attack lethal" — pre-v0.99 it'd often Bolt face for the immediate
      // burn-range bonus and then chump-block its way out of lethal.
      score += laneOpeningBonus(state, us, target.iid);
      return score;
    }
    if (target.kind === 'player') {
      if (target.who !== them) return -100;
      // Face damage scales with how close it gets us to the kill.
      const oppLife = state[them].life;
      let score = 25 + amount;
      if (amount >= oppLife) return 1000;        // lethal — always go for it
      if (oppLife - amount <= 4) score += 30;    // putting them in burn range
      if (oppLife <= 8) score += 15;              // already in danger zone
      return score;
    }
    return 0;
  }
  if (eff.kind === 'removeCreature') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;       // never remove our own
    if (c.card.keywords.includes('hexproof')) return -100;
    const sev = eff.severity || 1;
    const [pow, tou] = ENGINE.getStats(c.card);
    let score;
    if (sev === 1) {
      // Tap: only matters if creature is untapped. Light value.
      if (c.card.tapped) return -50;
      score = 12 + pow;
    }
    else if (sev === 2) {
      // Bounce: tempo, scales with opp's investment (bigger = more setback).
      // Tokens bounced cease to exist (no library to be cast from again),
      // so bouncing a token is strictly better than bouncing a real card —
      // it's permanent removal at bounce-spell cost. Bonus reflects this.
      score = 25 + pow + Math.floor(tou / 2);
      if (c.card.isToken) score += 8;
    }
    else if (sev === 3) {
      // Destroy: blocked by indestructible.
      if (c.card.keywords.includes('indestructible')) return -100;
      score = 40 + ENGINE.getCardValue(c.card, 'kill');
    }
    else {
      // Severity 4: exile. Bypasses indestructible.
      score = 45 + pow + tou;
    }
    // Lane-opening bonus for any "kills the creature" severity (2-4 always
    // remove from board; 1 just taps). Tap doesn't open a lane in the
    // attacker-walks-past sense — taps a defender FROM blocking ONLY in
    // some rules. Conservatively, scale only for severity ≥ 2.
    if (sev >= 2) score += laneOpeningBonus(state, us, target.iid);
    return score;
  }
  if (eff.kind === 'pump' || eff.kind === 'addCounter') {
    // Pump spells (EOT) and addCounter spells (permanent) both target
    // friendly creatures. The historic scoring returned a flat 30 for any
    // friendly target, which led to the AI casting Giant Growth on
    // creatures that weren't even attacking — same shape of bug as the
    // pre-v1.0.7 Carrion Feeder issue. Real combat tricks land for one of
    // two reasons:
    //   (A) The buff changes the combat outcome — saves a creature's
    //       life, kills an extra blocker, or pushes face damage that
    //       matters (especially lethal).
    //   (B) For addCounter specifically, the permanent stat boost is
    //       worth a small static value even outside combat — counters
    //       persist, unlike EOT pumps. We score this conservatively (3)
    //       so addCounter tricks fire for development when nothing better
    //       is happening but DON'T fire for pump spells in dead phases.
    //
    // combatBuffSwingValue handles case A directly via combat simulation.
    // Off-turn instants are gated by the 15-threshold in decideOffTurnCombat,
    // so a small swing won't trigger fishing casts. On-turn (decideMain)
    // uses a > 0 threshold, so positive swings cast normally during the
    // AI's own combat.
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller !== us) return -100;
    const buffPow = eff.power || 0;
    const buffTou = eff.toughness || 0;
    const swing = combatBuffSwingValue(state, us, target.iid, buffPow, buffTou);
    if (eff.kind === 'addCounter') {
      // Permanent buff baseline — small but positive so addCounter spells
      // fire for stat development when no combat is active. Pump spells
      // (EOT) get no baseline; they should fire only when combat is real.
      return 3 + swing;
    }
    return swing;
  }
  if (eff.kind === 'gainLife') {
    if (target.who !== us) return -100;
    // Lifegain on a targeted spell (e.g., Healing Salve) — value scales with
    // how much we need life. At full life, gaining 3 is wasted mana; at 4
    // life facing a damage race, it's a save. Mirrors the situational
    // scoring used for untargeted gainLife modes (see scoreUntargetedSituation).
    // Without this, the AI happily cast Salve at 20 life on turn 1, throwing
    // away mana for 3 useless points.
    const myLife = state[us].life;
    const oppLife = state[them].life;
    const amount = eff.amount || 0;
    const losing = oppLife > myLife;
    if (myLife <= 4) return amount * (losing ? 18 : 12);
    if (myLife <= 8) return amount * (losing ? 8 : 5);
    if (myLife <= 14) return amount * 2;
    // At >14 life, lifegain is rarely worth a card. Returning a small
    // negative ensures we don't cast it speculatively, but doesn't go
    // below the -100 sentinels used elsewhere — a non-cast (pass) is
    // always preferred over a negative-EV cast.
    return -2;
  }
  if (eff.kind === 'discard') {
    if (target.who !== them) return -100;
    // Discard fizzles if opp's hand is empty — don't cast Mind Rot into
    // an empty hand. Scale with hand size: hitting a 5-card hand is much
    // better than hitting a 1-card hand (more options, more cards seen).
    // Amount field on the effect tells us how many cards opp will lose.
    const handSize = state[them].hand.length;
    if (handSize === 0) return -100;
    const amount = eff.amount || 1;
    const actualLoss = Math.min(amount, handSize);
    // 8 per card lost — opp's best card scales with hand depth, but we
    // can't see it, so flat-per-card is the right heuristic. Fizzle-prone
    // (1-card hand vs 2-card discard) gets less value.
    return actualLoss * 8 + 4;
  }
  if (eff.kind === 'restrict') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;
    // Already neutered? (Bonds-style cantAttack+cantBlock on top of a
    // previous Pacifism = pure waste.) Score very low so we strongly
    // prefer casting on a different threat or not at all.
    const cantAtk = c.card.cantAttack || c.card.keywords.includes('defender');
    const cantBlk = c.card.cantBlock;
    if (eff.cantAttack && eff.cantBlock && cantAtk && cantBlk) return -50;
    if (eff.cantAttack && !eff.cantBlock && cantAtk) return -50;
    const [pow, tou] = ENGINE.getStats(c.card);
    // 0-power creatures aren't threats to attack — Pacifism on them is
    // mostly wasted since they can't attack anyway. Only the cantBlock
    // half might matter (forcing through an attacker), and even that's
    // worth less than locking down a real threat. Flat low score.
    if (pow === 0 && eff.cantAttack) {
      return eff.cantBlock ? 8 : 2;   // some value if we want to push through, none otherwise
    }
    return 35 + pow + tou;                        // permanent shutdown is good
  }
  if (eff.kind === 'grantKeyword') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    // Negative-keyword grants (defender) — only cast on opp creatures.
    // Positive keywords (flying, haste, etc) — only cast on our own.
    // For now Bindspeaker grants defender; broaden when we add others.
    const kw = eff.keyword;
    const isDebuff = (kw === 'defender');
    if (isDebuff && c.controller === us) return -100;
    if (!isDebuff && c.controller !== us) return -100;
    // Already has the keyword? Spell is wasted.
    if (c.card.keywords.includes(kw)) return -50;
    if (isDebuff) {
      // Already locked down by other means? Skip.
      if (c.card.cantAttack) return -50;
      const [pow, tou] = ENGINE.getStats(c.card);
      // Bigger threats = better lockdown targets. Mirrors restrict scoring
      // but shifted slightly because this lasts past source death.
      return 35 + pow * 2 + tou;
    }
    // Buff grant on our own creature — value scales with what we're adding.
    const [pow] = ENGINE.getStats(c.card);
    return 20 + pow;
  }
  if (eff.kind === 'fightTarget') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;
    // Pick our biggest creature to estimate the fight result.
    const ours = state[us].battlefield.filter(x => x.type === 'Creature' && !x.tapped);
    if (!ours.length) return -100;
    ours.sort((a, b) => ENGINE.getStats(b)[0] - ENGINE.getStats(a)[0]);
    const ourBig = ours[0];
    const [ourPow, ourTou] = ENGINE.getStats(ourBig);
    const [theirPow, theirTou] = ENGINE.getStats(c.card);
    let score = 0;
    if (ourPow >= theirTou) score += 30 + theirPow + theirTou;   // we kill
    if (theirPow >= ourTou) score -= 25 + ourPow + ourTou;       // we die
    return score;
  }
  if (eff.kind === 'untap') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller !== us) return -100;            // only useful on our own
    if (!c.card.tapped) return -50;
    const [pow] = ENGINE.getStats(c.card);
    return 10 + pow;
  }
  if (eff.kind === 'weaken') {
    // Black's -X/-X EOT. Lethal if effective toughness drops to 0 or less,
    // otherwise just a debuff. Indestructibles survive (state-based death
    // from t≤0 is gated by indestructible too).
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;            // never weaken our own
    if (c.card.keywords.includes('hexproof')) return -100;
    const [pow, tou] = ENGINE.getStats(c.card);
    const newTou = tou - (eff.toughness || 0);
    const wouldKill = newTou <= 0 || (newTou - c.card.damage) <= 0;
    if (wouldKill) {
      if (c.card.keywords.includes('indestructible')) return -50;
      let score = 35 + ENGINE.getCardValue(c.card, 'kill');
      score += laneOpeningBonus(state, us, target.iid);
      return score;
    }
    // Non-lethal: just a debuff. Worth it on big threats we can't outright kill.
    return 5 + Math.max(0, pow - (eff.power || 0));
  }
  if (eff.kind === 'shuffleIntoLibrary') {
    // White's "shuffle into library" — like bounce but harder to recover from
    // (random library position vs. immediate hand). Comparable to severity 2-3.
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;
    if (c.card.keywords.includes('hexproof')) return -100;
    const [pow, tou] = ENGINE.getStats(c.card);
    let score = 30 + pow + Math.floor(tou / 2);
    score += laneOpeningBonus(state, us, target.iid);
    return score;
  }
  if (eff.kind === 'returnFromGraveyard') {
    // Recursion target — looking up the card in our graveyard. Value scales
    // with the recurred card's intrinsic strength: bringing back a Sengir
    // Vampire is worth more than bringing back a 1/1.
    if (target.kind !== 'graveyardCreature') return -100;
    const grave = state[us].graveyard || [];
    const card = grave.find(c => c.iid === target.iid);
    if (!card) return -100;
    return 10 + ENGINE.getCardValue(card, 'play');
  }
  if (eff.kind === 'flicker') {
    // Flickering only makes sense on our own creatures. Best targets:
    //   1. ETB-trigger creatures we want to re-fire (Wall of Omens, Grave
    //      Digger) — high value, the whole point of flicker.
    //   2. Damaged creatures about to die — flicker resets damage.
    //   3. Creatures targeted by a stack effect — flicker dodges removal.
    //      We don't track "currently targeted" here; the AI rarely needs
    //      that level of foresight in v1.
    // Avoid flickering tokens (they cease to exist) and creatures that gain
    // ongoing benefit from staying put (counters, attached stickers — though
    // stickers persist through flicker, so that's fine).
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c || c.controller !== us) return -100;
    if (c.card.isToken) return -100;        // would cease to exist
    let score = 5;
    // Heavy bonus for ETB-trigger creatures.
    if (Array.isArray(c.card.triggers)) {
      const etbTriggers = c.card.triggers.filter(t => t.event === 'cardEntersBattlefield');
      score += etbTriggers.length * 12;
    }
    // Damage-dodge bonus: if creature has marked damage, flicker is
    // basically a small heal that ALSO does whatever else flicker does.
    if (c.card.damage > 0) score += c.card.damage * 2;
    // Counters lost penalty: a creature with permanent counters loses them.
    score -= (c.card.permPower || 0) + (c.card.permTou || 0);
    return score;
  }
  if (eff.kind === 'exileUntilEOT') {
    // Two valid targeting modes:
    //   1. Own creature → re-fire ETB triggers when it returns at EOT,
    //      dodge removal on the stack, reset damage. Same logic as flicker
    //      but with a turn delay before the ETB re-fires.
    //   2. Opp's creature → tempo removal. Take a threat off the board
    //      for one turn — they can't attack with it, can't block with it,
    //      can't tap it for an ability. Value scales with what we're
    //      removing. Best on big threats, attackers, sac outlets.
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.card.isToken && c.controller === us) return -100;  // would lose our own token
    if (c.controller !== us) {
      // Opp's creature. Tempo-removal valuation: scales with stats and
      // keywords. Bigger bonus during their attack window (we're about to
      // be hit) than during ours. Tokens removed PERMANENTLY (they cease
      // to exist on EOT return) — extra value.
      let score = 8 + ENGINE.getCardValue(c.card, 'kill');
      if (c.card.isToken) score += 4;  // token doesn't return; permanent removal
      return score;
    }
    // Own creature. Same logic as flicker but slightly less valuable since
    // the re-ETB happens at EOT (delayed) rather than immediately.
    let score = 3;
    if (Array.isArray(c.card.triggers)) {
      const etbTriggers = c.card.triggers.filter(t => t.event === 'cardEntersBattlefield');
      score += etbTriggers.length * 8;  // less than flicker's 12 since delayed
    }
    if (c.card.damage > 0) score += c.card.damage * 2;
    score -= (c.card.permPower || 0) + (c.card.permTou || 0);
    return score;
  }
  return 0;
}

function pickBestActivation(state, who, abilityActs) {
  // Score each activation. Same-shape logic as spells. Handles all effect
  // kinds an activated ability might have. Untargeted self-pumps, draws,
  // and discards used to fall through to score 0 (silently never activated)
  // — the audit caught this as a real AI dead zone for cards like Shivan
  // Dragon's pump, Archmage of Veils, and Merfolk Looter.
  const scored = abilityActs.map(act => {
    const card = state[who].battlefield.find(c => c.iid === act.cardIid);
    if (!card) return {act, score: -100};
    const ab = card.abilities[act.abilityIdx];
    const eff = ab.effects[0];
    let score = 0;
    if (eff.kind === 'damage' && act.targets) {
      const t = act.targets[0];
      if (t.kind === 'creature') {
        const c = ENGINE.findCard(t.iid);
        if (c) {
          const isOurs = c.controller === who;
          if (isOurs) score = -50;
          else {
            const [, tou] = ENGINE.getStats(c.card);
            const wouldKill = c.card.damage + eff.amount >= tou;
            score = wouldKill
              ? 30 + ENGINE.getCardValue(c.card, 'kill')
              : 5;
          }
        }
      } else if (t.kind === 'player') {
        score = t.who === opp(who) ? 15 : -100;
      }
    } else if (eff.kind === 'damage' && eff.target === 'player' && !act.targets) {
      // Drain-tax abilities (Wicked Acolyte: tap, target opp loses 1).
      // 'player' target with no UI prompt — implicit-opponent.
      score = 8;
    } else if (eff.kind === 'removeCreature' && act.targets) {
      const t = act.targets[0];
      if (t.kind === 'creature') {
        const c = ENGINE.findCard(t.iid);
        if (c && c.controller !== who) {
          const sev = eff.severity || 1;
          if (sev >= 3 && c.card.keywords.includes('indestructible') && sev < 4) {
            score = -100;
          } else {
            // Severity-graded: tap < bounce < destroy < exile.
            const sevBonus = sev === 1 ? 5 : sev === 2 ? 15 : sev === 3 ? 30 : 35;
            score = sevBonus + ENGINE.getCardValue(c.card, 'kill');
          }
        } else {
          score = -100;
        }
      }
    } else if (eff.kind === 'pump' && eff.target === 'self') {
      // Self-pump (firebreathing) — only useful pre-attack. MAIN2/END = waste.
      const validPhase = (state.phase === 'MAIN1' || state.phase === 'COMBAT_ATTACK')
                         && state.activePlayer === who;
      if (!validPhase) {
        score = -100;
      } else {
        score = 3 + (eff.power || 0) + (eff.toughness || 0);
      }
    } else if (eff.kind === 'draw') {
      // Drawing is always positive (looter discard is filtered as net upside).
      score = 5 + (eff.amount || 1);
    } else if (eff.kind === 'discard') {
      // Self-discard with no paired draw — skip. Opp-discard would score, but
      // no current activated abilities have that shape.
      const isSelf = !eff.target || eff.target === 'self';
      score = isSelf ? -50 : 8;
    } else if (eff.kind === 'gainLife') {
      // Worth it only when low.
      const ourLife = state[who].life;
      score = ourLife <= 6 ? 6 : ourLife <= 12 ? 2 : 0;
    } else if (eff.kind === 'searchCreature' || eff.kind === 'searchLandTapped') {
      // Tutoring is consistently strong.
      score = 8;
    } else if (eff.kind === 'addCounter' && eff.target === 'self') {
      // Self-counter pump (Carrion Feeder-shape). The general principle:
      // sacrificing creatures just to grow a counter is wrong play. Real
      // sac decisions happen for one of two reasons:
      //   (A) Victim is about to die anyway — chumping a doomed blocker
      //       is free value. Handled below in the sac-penalty branch.
      //   (B) The buff matters in the current moment — typically combat,
      //       where the counter saves the source's life or improves a
      //       trade. combatBuffSwingValue computes this directly.
      //
      // Baseline benefit is intentionally tiny (1) so that "grow for fun"
      // returns negative net after the sac penalty. The combat swing
      // bonus is what makes the ability fire when it should.
      const validPhase = state.activePlayer === who
        ? (state.phase === 'MAIN1' || state.phase === 'COMBAT_ATTACK' || state.phase === 'COMBAT_BLOCK' || state.phase === 'COMBAT_DAMAGE' || state.phase === 'MAIN2')
        : true;  // any phase on opp's turn = response usage, fine
      if (!validPhase) {
        score = -100;
      } else {
        const baseline = 1;   // tiny; sacking just to grow is bad
        const combatSwing = combatBuffSwingValue(state, who, act.cardIid,
          eff.power || 0, eff.toughness || 0);
        score = baseline + combatSwing;
      }
    }
    // Sac-cost adjustment: if this ability requires sacrificing a creature,
    // factor in the value of what we're losing. Use sacValueOnBoard rather
    // than getCardValue — the former asks "what is this body worth right
    // now on the battlefield?" while the latter asks "is this card good?"
    // and subtracts mana cost. For sac decisions, the cost is sunk; what
    // matters is what we lose by removing the body.
    //
    // Doomed-victim discount: if the victim is already going to die in
    // current combat, sacrificing them costs almost nothing — the body
    // is gone either way. Multiply sac penalty by 0.1 (still slightly
    // > 0 to discourage doomed-self-sac edge cases). This is what makes
    // "chump blocker fed to Carrion Feeder" the right play.
    if (act.sacIid != null) {
      const sacF = ENGINE.findCard(act.sacIid);
      if (sacF) {
        let sacValue = ENGINE.sacValueOnBoard(sacF.card);
        if (isCreatureDoomedInCombat(state, who, act.sacIid)) {
          sacValue *= 0.1;
        }
        // Self-sac is strictly worse than sacing a chump — losing the
        // ability source gains us nothing future, and the +1/+1 from
        // Carrion Feeder fizzles if we sac Carrion Feeder itself.
        if (sacF.card.iid === act.cardIid) score -= 30;
        else score -= sacValue;
      }
    }
    return {act, score};
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score <= 0) return null;
  return scored[0].act;
}

return {
  decide,
  // Test/A-B harness hook. Production always leaves this enabled.
  setFlashAIEnabled(v) { FLASH_AI_ENABLED = !!v; },
  isFlashAIEnabled() { return FLASH_AI_ENABLED; },
};
})();
// END HEURISTIC AI

