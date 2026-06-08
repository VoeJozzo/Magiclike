// AI — pure decision-maker. Swap by replacing `decide` with same signature.

// §7b coverage (cast path): every EFFECTS kind must be classified for the AI's
// per-target cast scorer (scoreSpellTargetForMode) — either it has a scoring
// branch (TARGET_SCORED), or it is consciously NOT target-scored (untargeted, a
// rider on a multi-effect spell, or scored via a different decision path).
// effectCoverageReport() (engine.js) checks this partition is exhaustive +
// disjoint over Object.keys(EFFECTS), the same way it checks valuation/card-text.
// This is what turns "added a targeted effect kind, forgot the cast scorer"
// (the bug that hid the bosses' removal + mind control) from silent to caught.
// Declared at module scope (outside the AI IIFE) so the coverage report can read
// them. Keep them in sync with the if-chain in scoreSpellTargetForMode.
const TARGET_SCORED_KINDS = new Set([
  'damage', 'affect_creature', 'pump', 'add_counter', 'gain_life', 'discard',
  'grant_keyword', 'fight', 'untap', 'move_card', 'sacrifice', 'annihilate',
  'rip', 'symmetricize', 'change_control', 'add_type', 'set_types', 'grant_cast_permission',
]);
const NOT_TARGET_SCORED_KINDS = new Set([
  'create_tokens',       // untargeted — mint tokens (scored via spellValueForEffects)
  'add_mana',            // untargeted ramp
  'draw',               // untargeted (generator-emitted)
  'counter',            // scored via the instant-response counter path, not main-phase
  'apply_sticker',      // a rider on embargo/bleach — the move_card half is scored
  'schedule_delayed',   // a rider (exile_until_eot's return) — the move_card half is scored
  'chooses',            // edict's pick step — the sacrifice/rip verb is scored
  'become_copy_of',      // False Witness ETB doppelganger — trigger mechanic, value dominated by the body
  'steal',              // internal helper dispatched by change_control
  'endomorph_absorb',    // creature ability, not a cast spell
  'bargain_sticker_self', 'bargain_sticker_other', // Archdemon trigger mechanic
  'apply_in_game_splice',  // Stapler ability (player-UI-driven), not AI-scored
]);

// AI spell valuation — RELOCATED from engine.js (review #6 — engine/AI layering).
// These read only shared/exported helpers (`ENGINE.sevToNum`, `TOKENS`,
// `ENGINE.getModes`) and
// are pure AI heuristics; the engine consumes none of them. Declared at module
// scope (outside the AI IIFE) so effectCoverageReport (engine.js) can read the
// classification sets lazily and tests can reach them via `AI.*`.

// Score a sorcery by best mode. Flash spells (incl. retired-Instant cards) get
// a flexibility premium — they can be held up for an instant-speed response.
function spellValue(card) {
  const modes = ENGINE.getModes ? ENGINE.getModes(card) : [card.effects || []];
  let bestModeValue = 0;
  for (const modeEffects of modes) {
    const v = spellValueForEffects(modeEffects);
    if (v > bestModeValue) bestModeValue = v;
  }
  if (card.keywords && card.keywords.includes('flash')) bestModeValue += 1;
  return bestModeValue;
}
function spellValueForEffects(effects) {
  let v = 0;
  for (const e of (effects || [])) {
    if (e.kind === 'affect_creature') {
      // tap < bounce < destroy < exile. `scope` = mass form.
      const sev = ENGINE.sevToNum(e.severity);
      if (e.scope) {
        const sevVal = sev === 1 ? 4 : sev === 2 ? 8 : sev === 3 ? 10 : 14;
        v += sevVal + ((e.scope === 'all_opps') ? 4 : 0);
      } else {
        // Single-target: tap < bounce < destroy < exile. Exile edges destroy —
        // same board result, but dodges death triggers / indestructible /
        // recursion / regeneration.
        v += sev === 1 ? 3 : sev === 2 ? 4 : sev === 3 ? 12 : 15;
      }
    }
    // damage with a mass scope values like the legacy damageAll.
    else if (e.kind === 'damage') v += (e.scope === 'all_creatures') ? (8 + (e.amount || 0) * 2) : (6 + (e.amount || 0));
    else if (e.kind === 'chooses') v += 6;   // edict idiom (target(player)→chooses→sacrifice)
    else if (e.kind === 'sacrifice') v += 0;
    else if (e.kind === 'counter') v += 8;
    else if (e.kind === 'change_control') {
      // Unified gainControl + steal valuation (parity).
      if (e.transfer_ownership) v += 16;        // steal
      else if (e.duration === 'eot') v += 6;     // threaten
      else v += 14;                              // mind control
    }
    else if (e.kind === 'apply_in_game_splice') v += 18;   // 2-for-1 with cross-game retention
    else if (e.kind === 'move_card') {
      // Collapsed draw (library→hand controller_top) / searchCreature
      // (library→hand library_search) / searchLandTapped (library→battlefield) /
      // shuffleIntoLibrary (battlefield→library) / returnFromGraveyard
      // (graveyard→hand) / flicker (battlefield→exile then exile→battlefield) —
      // valued at parity. The flicker return half adds 0 (the bf→exile half
      // carries the flicker's whole value).
      if (e.from_zone === 'library' && e.to_zone === 'hand') v += (e.selector === 'library_search') ? 4 : (e.amount || 1) * 3;
      else if (e.from_zone === 'library' && e.to_zone === 'battlefield') v += 4;  // land fetch
      else if (e.from_zone === 'hand' && e.to_zone === 'graveyard') v += 4;  // discard
      else if (e.from_zone === 'battlefield' && e.to_zone === 'hand') v += 4;  // bounce (embargo half)
      else if (e.from_zone === 'battlefield' && e.to_zone === 'library') v += 5;
      else if (e.from_zone === 'graveyard' && e.to_zone === 'hand') v += 4;
      else if (e.from_zone === 'battlefield' && e.to_zone === 'exile') v += 4;  // flicker outgoing / exile removal (bleach)
      else if (e.from_zone === 'exile' && e.to_zone === 'battlefield') v += 0;  // flicker return
      else v += 3;
    }
    // §3.8: apply_sticker (cost_mod / set_color / stat_boost snapshot) — the
    // Balancer family's persistent-tax half. Valued so embargo/bleach keep
    // their pre-decomposition value alongside the move_card half.
    else if (e.kind === 'apply_sticker') {
      const k = e.sticker && e.sticker.kind;
      v += (k === 'set_color') ? 4 : (k === 'cost_mod') ? 2 : 3;
    }
    else if (e.kind === 'rip') v += 8;                  // run-permanent slot strip (rip-edict trailing step)
    else if (e.kind === 'symmetricize') v += 8;
    else if (e.kind === 'grant_cast_permission') v += 4;
    else if (e.kind === 'draw') v += (e.amount || 1) * 3;
    else if (e.kind === 'discard') v += 4;
    else if (e.kind === 'gain_life') v += (e.amount || 0) < 0 ? (3 + Math.abs(e.amount) * 2) : 1;
    else if (e.kind === 'schedule_delayed') v += 1;  // exile_until_eot's return tail (the bf→exile half carries the value)
    else if (e.kind === 'pump') v += (e.power < 0 || e.toughness < 0) ? (3 + Math.abs(e.toughness || 0)) : 2;
    else if (e.kind === 'grant_keyword') {
      // mass-yours-eot Overrun-shape vs single-target permanent vs symmetric.
      const eot = e.duration === 'eot';
      if (e.scope === 'all_creatures') v += 0;
      else if (e.scope === 'all_yours') v += eot ? 6 : 8;
      else v += eot ? 2 : 3;
    }
    else if (e.kind === 'create_tokens') {
      const tpl = TOKENS[e.token_id];
      if (tpl) {
        const stat = (tpl.power || 0) + (tpl.toughness || 0);
        const kwBonus = (tpl.keywords || []).reduce((s, k) => s +
          ({flying: 2, haste: 2, lifelink: 2, deathtouch: 2, trample: 1, vigilance: 1, menace: 1, reach: 1}[k] || 0), 0);
        const perToken = stat + kwBonus;
        v += (e.count || 1) * perToken;
      }
    }
    else if (e.kind === 'add_mana') v += 3;
    else if (e.kind === 'fight') v += 5;
    // Type-change (best-guess valuation). add_type that animates (carries P/T)
    // is worth the body it makes; a bare add_type ("becomes an artifact") has no
    // payoff today, so ~1. set_types strips a creature's types → neutralization:
    // a permanent set is near-removal, an until-eot set is a tempo answer.
    else if (e.kind === 'add_type') v += ((e.power || 0) + (e.toughness || 0)) || 1;
    else if (e.kind === 'set_types') v += (e.duration === 'permanent') ? 11 : 5;
  }
  return v;
}

// §7b coverage assertion (plan-effects-refactor §8.1): every kind in the
// EFFECTS dispatch table must be CLASSIFIED for AI valuation — either it has a
// real scoring branch (spellValueForEffects / abilityValue), or it is
// consciously unscored. This partition makes the silent-regression class loud:
// add an EFFECTS handler and forget to score it → effectCoverageReport flags it
// (a test fails, a boot warning prints), instead of the AI silently valuing it 0.
// Keep these two sets exhaustive + disjoint over Object.keys(EFFECTS).
const VALUED_EFFECT_KINDS = new Set([
  'damage', 'pump', 'add_counter', 'affect_creature',
  'symmetricize', 'apply_sticker', 'counter', 'add_mana', 'gain_life', 'draw',
  'move_card', 'discard', 'grant_keyword', 'create_tokens', 'rip',
  'chooses', 'schedule_delayed', 'change_control', 'fight',
  'apply_in_game_splice', 'sacrifice', 'add_type', 'set_types', 'grant_cast_permission',
]);
const UNVALUED_EFFECT_KINDS = new Set([
  'steal',              // internal helper dispatched by change_control; not a card kind
  'annihilate',         // trailing edict verb; value carried by the edict scoring (sacrifice/annihilate branch)
  'endomorph_absorb',    // creature ability; value dominated by the body, not separately scored
  'untap',              // minor utility on abilities; abilityValue default suffices
  'bargain_sticker_self', // Archdemon of Bargains trigger mechanic; not separately scored
  'bargain_sticker_other',
  'become_copy_of',      // False Witness ETB doppelganger trigger; value dominated by the witness body
]);

const AI = (function() {


// Rough position read (life + board power, board weighted heavier) mapped to a
// 1-5 Archdemon-of-Bargains pick. The AI is the demon's NON-controller: it picks
// N stickers for the controller now and collects N when it kills the demon. So
// pick high when ahead (the buff is affordable and the kill-reward extends the
// lead) and low when behind (don't grow an opponent that's already pressuring).
function bargainPick(state, who) {
  const them = opp(who);
  const boardPow = (w) => state[w].battlefield
    .filter(c => hasType(c, 'Creature'))
    .reduce((s, c) => s + Math.max(0, ENGINE.getStats(c)[0]), 0);
  const adv = (state[who].life - state[them].life) + (boardPow(who) - boardPow(them)) * 2;
  if (adv >= 12) return 5;
  if (adv >= 5)  return 4;
  if (adv >= -4) return 3;
  if (adv >= -11) return 2;
  return 1;
}

function decide(state, who) {
  if (!state || state.gameOver) return {type:'pass'};

  const actions = ENGINE.getLegalActions(who);

  // Sim-mode prompt resolution paths (production UI handles 'you').
  if (state.pendingTriggerTarget && state.pendingTriggerTarget.controller === who) {
    const ptt = state.pendingTriggerTarget;
    if (Array.isArray(ptt.valid) && ptt.valid.length > 0 && ENGINE.pickBestTriggerTarget) {
      const target = ENGINE.pickBestTriggerTarget(ptt.promptEff, ptt.valid, who) || ptt.valid[0];
      return {type: 'triggerTargetPick', target};
    }
  }

  if (state.pendingSearch && state.pendingSearch.who === who) {
    const searchActs = actions.filter(a => a.type === 'searchPick');
    if (searchActs.length > 0) return searchActs[0];
  }

  if (state.pendingTriggerBuild && state.pendingTriggerBuild.who === who) {
    const buildActs = actions.filter(a => a.type === 'triggerBuildPick');
    if (buildActs.length > 0) return buildActs[0];
  }

  // Archdemon bargain: tie N to position (ahead → high, behind → low) instead
  // of always picking the minimum. Other number-choices fall back to min.
  if (state.pendingNumberChoice && state.pendingNumberChoice.who === who) {
    const p = state.pendingNumberChoice;
    const n = (p.onChoose === 'bargainEtb') ? bargainPick(state, who) : p.min;
    return {type: 'numberChoice', number: Math.max(p.min, Math.min(p.max, n))};
  }

  // Symmetricize: pick MAX of (power, toughness, cost). Yields the biggest body.
  if (state.pendingSymmetricizeChoice && state.pendingSymmetricizeChoice.who === who) {
    const v = state.pendingSymmetricizeChoice.values;
    let which = 'power', best = v.power;
    if (v.toughness > best) { which = 'toughness'; best = v.toughness; }
    if (v.cost > best) { which = 'cost'; best = v.cost; }
    return {type:'symmetricizeChoice', which};
  }

  // Edict forced-sacrifice (GAP 2): pick the lowest sac-value permanent —
  // mirrors the engine's former auto-pick, so AI-vs-AI edicts resolve
  // identically to before the human-prompt path existed.
  if (state.pendingEdictChoice && state.pendingEdictChoice.who === who) {
    const pool = state.pendingEdictChoice.pool;
    let bestIid = pool.length ? pool[0].iid : null, bestVal = Infinity;
    for (const d of pool) {
      const f = ENGINE.findCard(d.iid);
      const val = f ? ENGINE.sacValueOnBoard(f.card) : 0;
      if (val < bestVal) { bestVal = val; bestIid = d.iid; }
    }
    return {type:'edictChoice', iid: bestIid};
  }

  // Optional-cost trigger (Land+Spell staple ETB): the prompt only opens when
  // affordable, so pay whenever the stapled effect carries positive value.
  if (state.pendingOptionalCost && state.pendingOptionalCost.who === who) {
    const trig = state.pendingOptionalCost.item && state.pendingOptionalCost.item.trig;
    const effs = (trig && trig.effects) || [];
    return {type: 'optionalCost', pay: spellValueForEffects(effs) > 0};
  }

  // Sim-mode forced discard (production routes 'you' through UI).
  // Discard lowest getCardValue (not cheapest-cost — a cheap removal beats expensive filler).
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

  // Priority: stack non-empty → reaction; main phase → main; off-turn combat → reactive.
  if (state.priority && state.priorityHolder === who) {
    if (state.stack.length > 0) {
      return decideReaction(state, who, actions);
    }
    if ((state.phase === 'MAIN1' || state.phase === 'MAIN2') && who === state.activePlayer) {
      return decideMain(state, who, actions);
    }
    if (state.phase === 'COMBAT_ATTACK' || state.phase === 'COMBAT_BLOCK') {
      const reactive = decideOffTurnCombat(state, who, actions);
      if (reactive) return reactive;
    }
    // Opp's end step: free tempo for flash creatures (ETBs sick on opp's turn, untaps for us).
    if (state.phase === 'END' && who !== state.activePlayer) {
      const tempo = decideEndStepFlash(state, who, actions);
      if (tempo) return tempo;
    }
    return {type:'pass'};
  }

  return {type:'pass'};
}

// Off-turn combat reaction — instant-speed removal/pump to improve defense.
function decideOffTurnCombat(state, who, actions) {
  const spellsByCard = new Map();
  for (const a of actions) {
    if (a.type !== 'castSpell') continue;
    const card = state[who].hand.find(c => c.iid === a.cardIid);
    if (!card) continue;
    if (!(card.keywords && card.keywords.includes('flash'))) continue;
    if (!spellsByCard.has(a.cardIid)) spellsByCard.set(a.cardIid, []);
    spellsByCard.get(a.cardIid).push(a);
  }
  // Activated abilities also live here (Carrion Feeder sac, ping from creature, etc.).
  const abilityActs = actions.filter(a => a.type === 'activateAbility');
  // pickBestActivation returns null when nothing scores > 0.
  const bestAbility = abilityActs.length ? pickBestActivation(state, who, abilityActs) : null;
  if (spellsByCard.size === 0 && !bestAbility) return null;
  // Track flash separately — lower threshold since body persists post-combat (not just ambush value).
  let bestInst = null, bestInstScore = -Infinity;
  let bestFlash = null, bestFlashScore = -Infinity;
  for (const [iid, options] of spellsByCard) {
    const card = state[who].hand.find(c => c.iid === iid);
    if (!card) continue;
    const chosen = pickBestTargetForSpell(state, who, card, options);
    if (!chosen) continue;
    const isFlashCreature = hasType(card, 'Creature') && (card.keywords || []).includes('flash');
    const tgt = chosen.targets ? chosen.targets[0] : null;
    let score;
    if (tgt) {
      score = scoreSpellTarget(state, who, card, tgt);
    } else {
      const effs = ENGINE.effectsForMode(card, chosen.modeIdx);
      const eff0 = effs[0];
      const mass0 = massEffectInfo(eff0);
      if (mass0 && mass0.type === 'remove') {
        const sev = mass0.severity;
        score = sev >= 3 ? 30 : sev === 2 ? 18 : 8;
      } else if (mass0 && mass0.type === 'damage') {
        score = scoreDamageAll(state, who, mass0.amount);
      } else {
        score = 0;
      }
    }
    // Flash gets an ambush bonus — body persists post-combat, so small +score still beats waiting.
    if (isFlashCreature) {
      score += scoreFlashAmbush(state, who, card);
      if (score > bestFlashScore) { bestFlashScore = score; bestFlash = chosen; }
    } else {
      if (score > bestInstScore) { bestInstScore = score; bestInst = chosen; }
    }
  }
  // Thresholds: instant utility ≥15 (Bolt-face is 28); flash ambush ≥5 (body persists).
  if (bestInst && bestInstScore >= 15) return bestInst;
  if (bestFlash && bestFlashScore >= 5) return bestFlash;
  if (bestAbility) return bestAbility;
  return null;
}

// Score flashing `card` in as a defender — clone onto bf, simulate combat, compare to baseline.
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
    if (!hasType(card, 'Creature')) continue;
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
  const triggers = card.triggers || [];
  for (const trig of triggers) {
    if (!triggerFiresOnEnter(trig)) continue;
    const targetKind = trig.target
      || ((trig.effects || []).find(e => e.target && e.target !== 'self') || {}).target;
    const targetFilter = trig.target_filter
      || ((trig.effects || []).find(e => e.target && e.target !== 'self') || {}).filter;
    if (targetKind && ENGINE.targetsForFilter(targetKind, who, targetFilter).length === 0) return true;
  }
  return false;
}

function decideMain(state, who, actions) {
  // Order: burn lethal → land → biggest spell (curve-up) → non-mana ability → pass.
  const burnLethal = findBurnLethal(state, who, actions);
  if (burnLethal) return burnLethal;

  // MAIN1: reserve burn cards needed for attack+burn lethal so we don't burn face now.
  let reservedBurnIids = null;
  if (state.phase === 'MAIN1') {
    reservedBurnIids = computeReservedBurnForLethal(state, who);
  }

  const lands = actions.filter(a => a.type === 'playLand');
  if (lands.length) {
    return pickBestLand(state, who, lands);
  }

  const spellsByCard = new Map();
  for (const a of actions) {
    if (a.type !== 'castSpell') continue;
    if (reservedBurnIids && reservedBurnIids.has(a.cardIid)) continue;
    // Defer VANILLA flash to opp's turn — body-only value is preserved by ambush/end-step paths.
    // Trigger-flash (Quickling) wants to fire NOW (pre-combat bounce).
    const flashCard = state[who].hand.find(c => c.iid === a.cardIid);
    if (flashCard && hasType(flashCard, 'Creature')
        && flashCard.keywords && flashCard.keywords.includes('flash')
        && (!flashCard.triggers || flashCard.triggers.length === 0)) {
      continue;
    }
    if (!spellsByCard.has(a.cardIid)) spellsByCard.set(a.cardIid, []);
    spellsByCard.get(a.cardIid).push(a);
  }
  // Curve-up: biggest playable first. Flash-hold: vanilla flash bodies deferred to off-turn.
  const candidateCards = Array.from(spellsByCard.keys()).map(iid => ({
    iid, card: state[who].hand.find(c => c.iid === iid),
  })).filter(x => {
    if (!x.card) return false;
    if (hasType(x.card, 'Creature') &&
        x.card.keywords && x.card.keywords.includes('flash')) {
      return false;
    }
    return true;
  });
  // Rank by play VALUE, not raw cost: a cheap, high-impact play (e.g. removal on
  // a real threat, score ~40-50) should beat expensive filler (a vanilla body,
  // getCardValue ~8). Cost-descending pre-sort is just the tiebreak among equal
  // values (so creatures still curve out biggest-first). All castable plays
  // still get made — across successive priority passes — just in value order.
  candidateCards.sort((a, b) => ENGINE.cardCost(b.card) - ENGINE.cardCost(a.card));
  let bestPlay = null, bestVal = -Infinity;
  for (const {iid, card} of candidateCards) {
    const play = bestSpellPlay(state, who, card, spellsByCard.get(iid));
    if (!play) continue;
    const val = spellPlayValue(state, who, card, play.opt);
    if (val > bestVal) { bestVal = val; bestPlay = play.opt; }
  }
  if (bestPlay) return bestPlay;

  // Activated abilities. Skip reserved-burn sources (part of the lethal line).
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

// Enumerate spells/abilities dealing damage to opp face.
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

// MAIN1 lethal projection: attack damage + post-combat burn. Returns iids to reserve, or null.
// Conservative — only damage-at-player, no pump combos.
function computeReservedBurnForLethal(state, who) {
  const them = opp(who);
  const oppLife = state[them].life;
  if (oppLife <= 0) return null;
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
  // Cheapest-first so the post-combat line is most mana-feasible.
  sources.sort((a, b) => a.cost - b.cost);
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

// Single-spell lethal — one burn source ≥ opp life.
function findBurnLethal(state, who, actions) {
  const oppLife = state[opp(who)].life;
  if (oppLife <= 0) return null;
  const killer = getDirectBurnSources(state, who, actions).find(s => s.amount >= oppLife);
  return killer ? killer.action : null;
}

// Best land = the one that fixes us. Score producible colors against hand needs.
function pickBestLand(state, who, landActs) {
  if (landActs.length === 1) return landActs[0];
  const p = state[who];
  const needed = {W:0, U:0, B:0, R:0, G:0};
  for (const c of p.hand) {
    if (!c.cost) continue;
    for (const k of ['W','U','B','R','G']) {
      if (c.cost[k]) needed[k] += c.cost[k];
    }
  }
  const produces = {W:0, U:0, B:0, R:0, G:0};
  for (const c of p.battlefield) {
    if (!hasType(c, 'Land')) continue;
    for (const k of ENGINE.landProducibleColors(c)) if (k in produces) produces[k]++;
  }
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
  // Counter the top of stack if it's an opp spell worth stopping.
  const counters = actions.filter(a =>
    a.type === 'castSpell' &&
    ENGINE.cardHasEffect(state[who].hand.find(c => c.iid === a.cardIid),
                         e => e.kind === 'counter'));
  if (counters.length && shouldCounter(state, who)) {
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
  if (top.kind === 'trigger' || !top.card) return false;
  const card = top.card;
  // Check the chosen mode only (top.modeIdx locked in) — not all modes.
  const relevantEffects = ENGINE.effectsForMode(card, top.modeIdx);
  if (relevantEffects.some(e =>
    e.kind === 'damage' ||
    e.kind === 'counter' ||
    (e.kind === 'change_control' && e.transfer_ownership) ||
    (e.kind === 'affect_creature' && ENGINE.sevToNum(e.severity) >= 3)
  )) return true;
  if (hasType(card, 'Creature') && ENGINE.cardCost(card) >= 4) return true;
  if (relevantEffects.some(e => e.kind === 'draw' || e.kind === 'discard'
      || (e.kind === 'move_card' && e.from_zone === 'library' && e.to_zone === 'hand')
      || (e.kind === 'move_card' && e.from_zone === 'hand' && e.to_zone === 'graveyard'))) return Math.random() < 0.5;
  return false;
}

// Combat sim — pure, mirrors resolveCombatDamage. Returns
// {deadAttackers, deadBlockers, damageToDefender, attackerLifeGain, defenderLifeGain}.
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
  const hasFirstStrike = allCombatants.some(c => c.keywords.includes('first_strike'));

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
        // Blockers died first-strike → trample carries through.
        if (atkDeals && atk.keywords.includes('trample') && aPow > 0) {
          damageToDefender += aPow;
          if (atk.keywords.includes('lifelink')) attackerLifeGain += aPow;
        }
        continue;
      }
      // Trample requires lethal damage to EVERY blocker before carrying. Sort indestructibles last.
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
      // Trample only carries when no blockers are still unsatisfied.
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
    oneStrike(c => c.keywords.includes('first_strike'));
    oneStrike(c => !c.keywords.includes('first_strike'));
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

// Will combat kill this creature? Used by sac-scorer (doomed = free sac).
function isCreatureDoomedInCombat(state, who, iid) {
  if (state.phase !== 'COMBAT_BLOCK' && state.phase !== 'COMBAT_DAMAGE') return false;
  const attackerWho = state.activePlayer;
  const attackerIids = state.attackers || [];
  if (attackerIids.length === 0) return false;
  const isAttacker = attackerIids.includes(iid);
  let isBlocker = false;
  if (state.blockers instanceof Map) {
    for (const [bIid] of state.blockers) {
      if (bIid === iid) { isBlocker = true; break; }
    }
  }
  if (!isAttacker && !isBlocker) return false;
  const out = simulateCombat(state, attackerWho, attackerIids, state.blockers || new Map());
  if (isAttacker && out.deadAttackers.has(iid)) return true;
  if (isBlocker && out.deadBlockers.has(iid)) return true;
  return false;
}

// Would buffing source flip its combat death → survival? Sim twice, compare.
// Used by activated-ability scorer for "sac to win the fight" moments.
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
  // Face-damage delta. +4/dmg ≈ half a Bolt's face value; +60 for lethal, +8 for burn-range.
  if (attackerWho === who) {
    const damageDelta = (after.damageToDefender || 0) - (before.damageToDefender || 0);
    if (damageDelta > 0) {
      const them = attackerWho === 'you' ? 'opp' : 'you';
      const oppLifeAfterBefore = state[them].life - (before.damageToDefender || 0);
      swing += damageDelta * 4;
      if ((after.damageToDefender || 0) >= state[them].life) swing += 60;
      else if (oppLifeAfterBefore - damageDelta <= 4) swing += 8;
    }
  }
  return swing;
}

// Score combat from attacker's view. Higher = better. Damage weight scales 2x→30x as defLife→0.
function scoreCombatOutcome(state, attackerWho, outcome, attackerIids) {
  const defenderWho = opp(attackerWho);
  let score = 0;
  const defLife = Math.max(1, state[defenderWho].life);
  const dmgWeight = Math.max(2, 30 / defLife);
  score += outcome.damageToDefender * dmgWeight;
  score += outcome.attackerLifeGain;
  score -= outcome.defenderLifeGain;
  // +6/+7 base for "losing a card costs more than its stats"; attacker pays slightly more (chose engagement).
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
  if (state[defenderWho].life - outcome.damageToDefender + outcome.defenderLifeGain <= 0) {
    score += 10000;
  }
  // Don't suicide-attack: subtract if opp could lethal next turn (incoming = survivingPow - ourTough).
  const attackerSet = new Set(attackerIids || []);
  const survivingOppPower = state[defenderWho].battlefield
    .filter(c => hasType(c, 'Creature') && !outcome.deadBlockers.has(c.iid))
    .reduce((s, c) => s + ENGINE.getStats(c)[0], 0);
  const ourDefensiveTough = state[attackerWho].battlefield
    .filter(c => hasType(c, 'Creature'))
    .filter(c => !outcome.deadAttackers.has(c.iid))
    .filter(c => !attackerSet.has(c.iid) || c.keywords.includes('vigilance'))
    .reduce((s, c) => s + ENGINE.getStats(c)[1], 0);
  const incoming = Math.max(0, survivingOppPower - ourDefensiveTough);
  if (state[attackerWho].life - incoming <= 0) {
    score -= 50;
  }
  return score;
}

// Predict opp's best blocks. Mirrors decideBlockers from defender's POV.
function predictOppBlocks(state, attackerWho, attackerIids) {
  const defenderWho = opp(attackerWho);
  const blockers = state[defenderWho].battlefield.filter(c => ENGINE.canCreatureBlock(c));
  return findBestBlocks(state, attackerWho, attackerIids, blockers);
}

// Greedy: biggest attacker first, try unblocked vs single/pair blocks, minimize attacker score.
function findBestBlocks(state, attackerWho, attackerIids, availableBlockers) {
  // Filter dead attackers (stack response window may have removed them post-declare).
  const liveAttackerIids = attackerIids.filter(iid => ENGINE.findCard(iid));
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

    let best = { mapDelta: null, score: Infinity };
    {
      const trial = new Map(blockMap);
      const out = simulateCombat(state, attackerWho, sortedAtks, trial);
      const sc = scoreCombatOutcome(state, attackerWho, out, sortedAtks);
      if (sc < best.score) best = { mapDelta: [], score: sc };
    }
    if (atk.keywords.includes('menace')) {
      // Pairs only (menace needs ≥2).
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
      for (const b of eligibleBlockers) {
        const trial = new Map(blockMap);
        trial.set(b.iid, aIid);
        const out = simulateCombat(state, attackerWho, sortedAtks, trial);
        const sc = scoreCombatOutcome(state, attackerWho, out, sortedAtks);
        if (sc < best.score) best = { mapDelta: [b.iid], score: sc };
      }
      // Multi-block: 2/2+2/2 vs 3/3 kills the attacker for one 2/2.
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

// Enumerate attack subsets, sim opp's best blocks, pick highest-scoring subset.
function decideAttackers(state, who) {
  const eligible = state[who].battlefield
    .filter(ENGINE.canCreatureAttack)
    .map(c => c.iid);
  if (eligible.length === 0) return {type:'declareAttackers', cardIids: []};

  const lethal = findLethalAttack(state, who, eligible);
  if (lethal) {
    debugVerifyAttackers(state, who, lethal, 'lethal');
    return {type:'declareAttackers', cardIids: lethal};
  }

  // 2^8=256 subsets cap. Larger → greedy drop-one fallback.
  let bestSubset = [];
  let bestScore = -Infinity;

  const tryAttack = (subset) => {
    if (subset.length === 0) {
      if (0 > bestScore) { bestScore = 0; bestSubset = []; }
      return;
    }
    const blocks = predictOppBlocks(state, who, subset);
    const out = simulateCombat(state, who, subset, blocks);
    let sc = scoreCombatOutcome(state, who, out, subset);
    // +4 for attack-trigger creatures (sim doesn't model these).
    for (const iid of subset) {
      const f = ENGINE.findCard(iid);
      if (f && hasAttackTrigger(f.card)) sc += 4;
    }
    if (sc > bestScore) { bestScore = sc; bestSubset = subset; }
  };

  if (eligible.length <= 8) {
    const total = 1 << eligible.length;
    for (let mask = 0; mask < total; mask++) {
      const subset = [];
      for (let i = 0; i < eligible.length; i++) {
        if (mask & (1 << i)) subset.push(eligible[i]);
      }
      tryAttack(subset);
    }
  } else {
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

// Sanity-check attackers; warn but don't block (engine rejects illegal).
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

// Attack-triggers (Specter, Bloodthirster) — extra +4 bonus during attack scoring.
function hasAttackTrigger(card) {
  if (!card.triggers) return false;
  return card.triggers.some(t => t.event === 'attacks');
}

// Lethal if attacking with everything (even with best blocks) lethals opp.
function findLethalAttack(state, who, eligible) {
  const them = opp(who);
  const oppLife = state[them].life;
  const totalPower = eligible.reduce((s, iid) => {
    const f = ENGINE.findCard(iid);
    return s + (f ? ENGINE.getStats(f.card)[0] : 0);
  }, 0);
  if (totalPower < oppLife) return null;
  const blocks = predictOppBlocks(state, who, eligible);
  const out = simulateCombat(state, who, eligible, blocks);
  if (state[them].life + out.defenderLifeGain - out.damageToDefender <= 0) {
    return eligible.slice();
  }
  return null;
}

function decideBlockers(state, who) {
  const attackerWho = opp(who);
  const attackerIids = state.attackers.slice();
  const blockers = state[who].battlefield.filter(c => ENGINE.canCreatureBlock(c));
  const blockMap = findBestBlocks(state, attackerWho, attackerIids, blockers);
  return {type:'declareBlockers', blockMap};
}

function decideCleanupDiscard(state, who, actions) {
  // Discard lowest getCardValue (not cheapest cost — getCardValue handles redundancy).
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

// Pick the best (mode, target) option for casting `card` and return it WITH its
// score: {opt, score} or null. The score is the cast-worthiness gate value
// (creature=100 flat so a body always clears >0) — NOT a cross-card ranking
// scale; decideMain uses spellPlayValue() for that.
function bestSpellPlay(state, who, card, options) {
  // Bail if non-modal self-damage would lethal us (modal: per-option below).
  const selfDamageOf = (effs) => (effs || []).reduce((sum, e) =>
    sum + ((e.kind === 'damage' && e.scope === 'self') ? (e.amount || 0) : 0), 0);
  if (!ENGINE.isModal(card)) {
    if (selfDamageOf(card.effects) >= state[who].life) return null;
  }
  const scored = options.map(opt => {
    const modeIdx = opt.modeIdx || 0;
    const modeEffects = ENGINE.effectsForMode(card, modeIdx);
    if (!opt.targets) {
      const ok = shouldCastUntargeted(state, who, card, modeIdx);
      if (!ok) return {opt, score: -100};
      if (hasType(card, 'Creature')) {
        return {opt, score: 100};
      }
      let score = spellValueForEffects(modeEffects);
      score += scoreUntargetedSituation(state, who, modeEffects);
      return {opt, score};
    }
    return {opt, score: scoreMultiTargetSpell(state, who, card, opt.targets, modeIdx)};
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score <= 0) return null;
  return scored[0];
}

function pickBestTargetForSpell(state, who, card, options) {
  const best = bestSpellPlay(state, who, card, options);
  return best ? best.opt : null;
}

// Cross-card play value for MAIN-phase sequencing — a shared scale so removal,
// creature bodies, and utility spells compare sanely (vs raw mana cost). Used
// only to ORDER casts; the worth-casting gate already lives in bestSpellPlay.
function spellPlayValue(state, who, card, opt) {
  if (opt.targets && opt.targets.length) {
    return scoreMultiTargetSpell(state, who, card, opt.targets, opt.modeIdx || 0);
  }
  if (hasType(card, 'Creature')) {
    return Math.max(1, ENGINE.getCardValue(card, 'play'));
  }
  const modeEffects = ENGINE.effectsForMode(card, opt.modeIdx || 0);
  return spellValueForEffects(modeEffects) + scoreUntargetedSituation(state, who, modeEffects);
}

// Score a `fight` as ONE combatant-vs-combatant exchange off its operands (not
// per-slot — a fighter slot is our own creature, which the per-target scorer would
// reject). Mirrors the fight handler's operand resolution against `state` (slots
// from the action targets, {select} = our biggest). `statBySlot` folds in any
// same-spell stat boost landing on a combatant's slot (Predate's pump), so the
// AI scores the fight WITH the buff it's about to apply.
function scoreFightExchange(state, who, fightEff, targets, statBySlot) {
  const us = who;
  const find = (iid) => {
    for (const w of ['you', 'opp']) {
      const c = state[w].battlefield.find(x => x.iid === iid);
      if (c) return { card: c, controller: w };
    }
    return null;
  };
  const ops = Array.isArray(fightEff.operands) ? fightEff.operands : [];
  const out = new Array(ops.length).fill(null);
  const used = new Set();
  ops.forEach((op, i) => {
    if (op && op.slot != null) {
      const t = targets && targets[op.slot];
      const r = (t && t.kind === 'creature') ? find(t.iid) : null;
      if (r) r.bonus = (statBySlot && statBySlot[op.slot]) || null;   // same-spell pump on this slot
      out[i] = r; if (r) used.add(r.card.iid);
    }
  });
  ops.forEach((op, i) => {
    if (out[i]) return;
    const ours = state[us].battlefield.filter(c => hasType(c, 'Creature') && !used.has(c.iid));
    if (!ours.length) return;
    ours.sort((a, b) => ENGINE.getStats(b)[0] - ENGINE.getStats(a)[0]);
    out[i] = { card: ours[0], controller: us }; used.add(ours[0].iid);
  });
  const [r0, r1] = out;
  if (!r0 || !r1) return -100;
  const ourR = r0.controller === us ? r0 : r1;
  const theirR = r0.controller === us ? r1 : r0;
  const stats = (r) => {
    const [p, t] = ENGINE.getStats(r.card);
    return [p + (r.bonus ? r.bonus.power : 0), t + (r.bonus ? r.bonus.toughness : 0)];
  };
  const [ourPow, ourTou] = stats(ourR);
  const [theirPow, theirTou] = stats(theirR);
  let score = 0;
  if (ourPow >= theirTou) score += 30 + theirPow + theirTou;   // we kill
  if (theirPow >= ourTou) score -= 25 + ourPow + ourTou;       // we die
  return score;
}

// Score a multi-target spell by summing per-slot scores. Single-target
// collapses to scoreSpellTargetForMode. Approximate when effects interact.
function scoreMultiTargetSpell(state, who, card, targets, modeIdx) {
  if (!Array.isArray(targets) || targets.length === 0) return 0;
  const modeEffects = ENGINE.effectsForMode(card, modeIdx);
  // Same-spell stat boosts (pump / add_counter) that land on a slot — folded into
  // the fight estimate so a buff-then-fight (Predate) is scored post-buff.
  const statBySlot = {};
  for (const eff of modeEffects) {
    if (eff && (eff.kind === 'pump' || eff.kind === 'add_counter')
        && eff.target_slot != null && !eff.scope) {
      const s = statBySlot[eff.target_slot] || { power: 0, toughness: 0 };
      s.power += eff.power || 0; s.toughness += eff.toughness || 0;
      statBySlot[eff.target_slot] = s;
    }
  }
  // fight scores as a single exchange off its operands (additive — 0 if absent).
  let fightScore = 0, hasFight = false;
  for (const eff of modeEffects) {
    if (eff && eff.kind === 'fight' && Array.isArray(eff.operands)) {
      hasFight = true; fightScore += scoreFightExchange(state, who, eff, targets, statBySlot);
    }
  }
  const slotsUsed = new Set();
  for (const eff of modeEffects) {
    if (eff && eff.kind === 'fight') continue;   // scored above, not per-slot
    if (ENGINE.effectNeedsTarget && ENGINE.effectNeedsTarget(eff)) {
      slotsUsed.add(eff.target_slot || 0);
    }
  }
  if (slotsUsed.size === 0) {
    if (hasFight) return fightScore;
    // New model (§3.5): a top-level `target` step (bare effects) is a single
    // target — score it like the legacy single-target path.
    if (card.target) return scoreSpellTargetForMode(state, who, card, targets[0], modeIdx);
    return 0;
  }
  if (slotsUsed.size === 1 && !hasFight) {
    return scoreSpellTargetForMode(state, who, card, targets[0], modeIdx);
  }
  let total = fightScore;
  for (const slot of slotsUsed) {
    const t = targets[slot];
    if (!t) continue;
    total += scoreSpellTargetForMode(state, who, card, t, modeIdx);
  }
  return total;
}

// Situational adjustment for modal pick. Lifegain tiered by life total; "losing race" boost.
function scoreUntargetedSituation(state, who, effects) {
  const us = who, them = opp(who);
  let bonus = 0;
  for (const e of (effects || [])) {
    if (e.kind === 'gain_life') {
      const myLife = state[us].life;
      const oppLife = state[them].life;
      const amount = e.amount || 0;
      const losing = oppLife > myLife;
      if (myLife <= 4) {
        bonus += amount * (losing ? 18 : 12);
      } else if (myLife <= 8) {
        bonus += amount * (losing ? 8 : 5);
      } else if (myLife <= 14) {
        bonus += amount * 2;
      }
      // Subtract spellValueForEffects' +1 baseline to avoid double-count.
      if (myLife <= 14 && amount > 0) bonus -= 1;
    }
  }
  return bonus;
}

// Recognize a MASS effect (damage / affect_creature / pump +
// a mass `scope`) and return a normalized descriptor, or null. Drives the AI's
// mass-cast valuation.
function massEffectInfo(e) {
  if (!e) return null;
  if (e.kind === 'damage' && e.scope === 'all_creatures') return { type: 'damage', amount: e.amount || 0 };
  if (e.kind === 'affect_creature' && e.scope) {
    return { type: 'remove', severity: ENGINE.sevToNum(e.severity), whose: e.scope === 'all_opps' ? 'opp' : 'all' };
  }
  if (e.kind === 'pump' && e.scope === 'all_yours') return { type: 'pump' };
  return null;
}

function shouldCastUntargeted(state, who, card, modeIdx) {
  const us = who, them = opp(who);
  // Read effects from the chosen mode (or flat list for non-modal cards).
  const modeEffects = ENGINE.effectsForMode(card, modeIdx || 0);
  const eff = modeEffects[0];
  if (!eff) return true;
  const mass = massEffectInfo(eff);
  if (mass && mass.type === 'damage') {
    return scoreDamageAll(state, who, mass.amount) >= 8;
  }
  if (mass && mass.type === 'remove') {
    const sev = mass.severity;
    const whose = mass.whose;
    if (whose === 'opp') {
      return scoreBounceAll(state, who, 'opp') >= 8;
    }
    // Symmetric — only worth it if we're losing the board.
    if (sev === 1) {
      const oppUntapped = state[them].battlefield
        .filter(c => hasType(c, 'Creature') && !c.tapped).length;
      const ourUntapped = state[us].battlefield
        .filter(c => hasType(c, 'Creature') && !c.tapped).length;
      return oppUntapped > ourUntapped + 1;
    }
    const ourPower = state[us].battlefield
      .filter(c => hasType(c, 'Creature')).reduce((s, c) => s + ENGINE.getStats(c)[0], 0);
    const theirPower = state[them].battlefield
      .filter(c => hasType(c, 'Creature')).reduce((s, c) => s + ENGINE.getStats(c)[0], 0);
    return theirPower > ourPower + 2;
  }
  if (mass && mass.type === 'pump') {
    const ours = state[us].battlefield.filter(c => hasType(c, 'Creature')).length;
    return ours >= 2;
  }
  if (eff.kind === 'grant_keyword' && (eff.scope === 'all_yours' || eff.scope === 'all_creatures')) {
    const ours = state[us].battlefield.filter(c => hasType(c, 'Creature')).length;
    if (eff.scope === 'all_creatures') {
      const theirs = state[them].battlefield.filter(c => hasType(c, 'Creature')).length;
      return ours >= 2 && ours > theirs;
    }
    return ours >= 2;
  }
  return true;
}

// "Kill chump, attack lethal" bonus. Sim with/without removedIid; +1000 if it flips to lethal.
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
  const oppLifeAfterReal = state[them].life - outReal.damageToDefender;
  const oppLifeAfterHypo = state[them].life - outHypo.damageToDefender;
  if (oppLifeAfterReal > 0 && oppLifeAfterHypo <= 0) return 1000;
  const delta = outHypo.damageToDefender - outReal.damageToDefender;
  if (delta <= 0) return 0;
  return Math.min(30, delta * 3);
}

// (theirLoss - ourLoss) by getCardValue. Indestructibles excluded.
function scoreDamageAll(state, who, amount) {
  const us = who, them = opp(who);
  let ourLoss = 0, theirLoss = 0;
  for (const c of state[us].battlefield) {
    if (!hasType(c, 'Creature')) continue;
    if (c.keywords.includes('indestructible')) continue;
    const [, tou] = ENGINE.getStats(c);
    const remaining = tou - c.damage;
    if (amount >= remaining) ourLoss += ENGINE.getCardValue(c, 'kill');
  }
  for (const c of state[them].battlefield) {
    if (!hasType(c, 'Creature')) continue;
    if (c.keywords.includes('indestructible')) continue;
    const [, tou] = ENGINE.getStats(c);
    const remaining = tou - c.damage;
    if (amount >= remaining) theirLoss += ENGINE.getCardValue(c, 'kill');
  }
  return theirLoss - ourLoss;
}

// Symmetric bounceAll discounts our loss at 0.6× (we recover, but tempo cost).
function scoreBounceAll(state, who, whose) {
  const us = who, them = opp(who);
  let theirValue = 0;
  for (const c of state[them].battlefield) {
    if (!hasType(c, 'Creature')) continue;
    theirValue += ENGINE.getCardValue(c, 'bounce');
  }
  if (whose === 'opp') return theirValue;
  let ourValue = 0;
  for (const c of state[us].battlefield) {
    if (!hasType(c, 'Creature')) continue;
    ourValue += ENGINE.getCardValue(c, 'bounce');
  }
  return theirValue - ourValue * 0.6;
}

function scoreSpellTarget(state, who, card, target) {
  return scoreSpellTargetForMode(state, who, card, target, 0);
}
function scoreSpellTargetForMode(state, who, card, target, modeIdx) {
  const us = who, them = opp(who);
  const modeEffects = ENGINE.effectsForMode(card, modeIdx);
  // Legacy: the targeted effect carries its own `target`. New model (§3.5): a
  // top-level `target` step on the card, with bare effects — value the first
  // target-operating effect (skip chooses(), mass-scoped effects, and the
  // apply_sticker rider so embargo/bleach score their move_card removal half,
  // not the persistent-tax sticker).
  // Score the effect that consumes the CHOSEN target — skip target:'self'
  // effects (they hit the source/controller, not the pick: e.g. Grave Charm's
  // "you gain 4 life AND that opponent loses 2" — the drain is the targeted half).
  let eff = modeEffects.find(e => e.target && e.target !== 'self');
  if (!eff && card.target) eff = modeEffects.find(e => e.kind !== 'chooses' && e.kind !== 'apply_sticker' && e.scope == null);
  if (!eff && card.target) {
    const stickerSetTypes = modeEffects.find(e => e.kind === 'apply_sticker'
      && e.sticker && e.sticker.kind === 'set_types');
    // Artifice Triumphant's sticker looks permanent at the run layer, but the
    // granted reactivation ability makes it a soft tempo neutralize in-game.
    // Leave duration absent so the set_types scorer uses its tempo base.
    if (stickerSetTypes) eff = { ...stickerSetTypes.sticker, kind: 'set_types' };
  }
  if (!eff) return 0;
  if (eff.kind === 'sacrifice' || eff.kind === 'annihilate') {
    // Edict: target(player) → chooses → sacrifice/annihilate (→ rip). The targeted
    // player loses their lowest-value creature; never edict ourselves. A trailing
    // `rip` step (Vile Edict) also strips that card's deck-slot — harsher, so it
    // earns a premium — and its chooses(permanent) lets it hit lands/artifacts too.
    if (target.kind !== 'player' || target.who === us) return -100;
    const hasRip = modeEffects.some(e => e.kind === 'rip');
    const choosesEff = modeEffects.find(e => e.kind === 'chooses');
    const wantsPermanent = choosesEff && choosesEff.filter === 'permanent';
    const pool = state[target.who].battlefield.filter(c => wantsPermanent
      ? isPermanent(c)
      : hasType(c, 'Creature'));
    if (pool.length === 0) return -100;
    const lowest = pool.slice().sort((a, b) =>
      ENGINE.getCardValue(a, 'kill') - ENGINE.getCardValue(b, 'kill'))[0];
    return (hasRip ? 16 : 10) + ENGINE.getCardValue(lowest, 'kill');
  }
  if (eff.kind === 'symmetricize') {
    // The Balancer's equalizer: the target's controller picks power/toughness/
    // cost and the other two snap to it. The opponent minimizes harm, so it's a
    // soft answer — only worth aiming at an opp creature whose stats are uneven
    // enough that equalizing shrinks it. Value the likely shrink on their board.
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c || c.controller === us) return -100;
    if (c.card.keywords.includes('hexproof')) return -100;
    const [pow, tou] = ENGINE.getStats(c.card);
    // Bigger + more lopsided creatures are better targets (more to flatten).
    return 8 + Math.floor(Math.abs(pow - tou) / 2) + Math.floor((pow + tou) / 4);
  }
  if (eff.kind === 'change_control') {
    // Mind Control (creature) / Threaten (creature, eot) / Steal (any permanent,
    // surfaced as kind 'permanent'). Take control of an opp permanent.
    if (target.kind !== 'creature' && target.kind !== 'permanent') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c || c.controller === us) return -100;        // already ours
    if (c.card.keywords.includes('hexproof')) return -100;
    if (eff.duration === 'eot') {
      // Threaten: temporary control — value the alpha-strike/sac swing, not the
      // body (it goes back at end of turn).
      const [pow] = ENGINE.getStats(c.card);
      return 8 + pow;
    }
    // Permanent control (mind control) or run-slot theft (steal): we BOTH remove
    // it from their side AND gain it — strictly above a straight kill. Steal's
    // permanent deck-theft is worth a touch more. Lane bonus only for creatures.
    const base = eff.transfer_ownership ? 42 : 35;
    const lane = (hasType(c.card, 'Creature')) ? laneOpeningBonus(state, us, target.iid) : 0;
    return base + ENGINE.getCardValue(c.card, 'kill') + lane;
  }
  if (eff.kind === 'set_types') {
    // Neutralize: stripping a creature's card types stops it attacking/blocking
    // (it’s no longer a creature). Aim at the opponent's best creature; never
    // our own. A permanent set is near-removal; an until-eot set is a tempo
    // answer. The creature stays on the board (not destroyed), so it's valued a
    // notch below hard removal.
    if (target.kind !== 'creature' && target.kind !== 'permanent') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c || c.controller === us) return -100;
    if (c.card.keywords.includes('hexproof')) return -100;
    if (!hasType(c.card, 'Creature')) return -100;        // only a creature is worth neutralizing
    // Artifice Triumphant grants "pay one mana of each of this card's colors:
    // become a creature until EOT." On an originally colorless creature that
    // costs zero, so neutralizing it is usually a mistake. Keep a score floor
    // of 1: the boss prefers colored targets, but can still give the player the
    // amusing free-reactivation mutation when no better target is available.
    if (modeEffects.some(e => e.kind === 'apply_sticker'
          && e.sticker && e.sticker.kind === 'grant_activated_ability')
        && (!Array.isArray(c.card.colors) || c.card.colors.length === 0)) return 1;
    const base = (eff.duration === 'permanent') ? 20 : 8;
    return base + ENGINE.getCardValue(c.card, 'kill') + laneOpeningBonus(state, us, target.iid);
  }
  if (eff.kind === 'add_type') {
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    const animate = (eff.power || 0) || (eff.toughness || 0);
    if (animate) {
      // Animating a permanent (a land, per the cards' filter) into a creature is
      // only good on one WE control — it becomes an attacker. Animating the
      // opponent's permanent would just gift them a body.
      if (c.controller !== us) return -100;
      return (eff.power || 0) + (eff.toughness || 0);
    }
    // Bare add_type ("becomes an artifact"): no payoff today — castable but
    // deprioritized, and only on our own permanent.
    return (c.controller === us) ? 1 : -100;
  }
  if (eff.kind === 'damage') {
    const amount = eff.amount;
    if (target.kind === 'creature') {
      const c = ENGINE.findCard(target.iid);
      if (!c) return -100;
      if (c.controller === us) return -100;
      // Damage never destroys an indestructible creature (flying is
      // irrelevant) — burning one is wasted.
      if (c.card.keywords.includes('indestructible')) {
        return -50;
      }
      const [pow, tou] = ENGINE.getStats(c.card);
      const remaining = tou - c.card.damage;
      const wouldKill = amount >= remaining;
      if (!wouldKill) {
        return Math.max(2, pow + tou - amount);
      }
      const overkill = amount - remaining;
      let score = 50 + ENGINE.getCardValue(c.card, 'kill');
      if (overkill >= 2) score -= overkill * 5;
      score += laneOpeningBonus(state, us, target.iid);
      return score;
    }
    if (target.kind === 'player') {
      if (target.who !== them) return -100;
      const oppLife = state[them].life;
      let score = 25 + amount;
      if (amount >= oppLife) return 1000;
      if (oppLife - amount <= 4) score += 30;
      if (oppLife <= 8) score += 15;
      return score;
    }
    return 0;
  }
  if (eff.kind === 'affect_creature') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;
    if (c.card.keywords.includes('hexproof')) return -100;
    const sev = ENGINE.sevToNum(eff.severity);
    const [pow, tou] = ENGINE.getStats(c.card);
    let score;
    if (sev === 1) {
      if (c.card.tapped) return -50;
      score = 12 + pow;
    }
    else if (sev === 2) {
      // Bounced tokens cease to exist — strictly better than bouncing a real card.
      score = 25 + pow + Math.floor(tou / 2);
      if (c.card.isToken) score += 8;
    }
    else if (sev === 3) {
      if (c.card.keywords.includes('indestructible')) return -100;
      score = 40 + ENGINE.getCardValue(c.card, 'kill');
    }
    else {
      score = 45 + pow + tou;
    }
    if (sev >= 2) score += laneOpeningBonus(state, us, target.iid);
    return score;
  }
  if (eff.kind === 'pump' || eff.kind === 'add_counter') {
    // pump/add_counter only fire when combat-relevant (combatBuffSwingValue).
    // add_counter gets +3 baseline (permanent buff) so it can fire for stat development.
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    const buffPow = eff.power || 0;
    const buffTou = eff.toughness || 0;
    // Negative deltas = weaken (debuff): target OPP creatures, not our own
    // (collapsed from the legacy `weaken` kind, decision 3). buffTou is the
    // signed delta (e.g. -2).
    if (buffPow < 0 || buffTou < 0) {
      if (c.controller === us) return -100;            // never weaken our own
      if (c.card.keywords.includes('hexproof')) return -100;
      const [pow, tou] = ENGINE.getStats(c.card);
      const newTou = tou + buffTou;                    // buffTou negative
      const wouldKill = newTou <= 0 || (newTou - c.card.damage) <= 0;
      if (wouldKill) {
        if (c.card.keywords.includes('indestructible')) return -50;
        return 35 + ENGINE.getCardValue(c.card, 'kill') + laneOpeningBonus(state, us, target.iid);
      }
      return 5 + Math.max(0, pow + buffPow);            // buffPow negative
    }
    if (c.controller !== us) return -100;              // positive buff → own creatures
    const swing = combatBuffSwingValue(state, us, target.iid, buffPow, buffTou);
    if (eff.kind === 'add_counter' || eff.duration === 'permanent') {
      return 3 + swing;
    }
    return swing;
  }
  if (eff.kind === 'gain_life') {
    const amount = eff.amount || 0;
    if (amount < 0) {
      // Life loss (drain). Good aimed at the opponent; never at ourselves.
      if (target.who !== them) return -100;
      const loss = -amount;
      const oppLife = state[them].life;
      if (loss >= oppLife) return 1000;            // lethal drain
      let score = 18 + loss * 4;
      if (oppLife - loss <= 4) score += 20;
      if (oppLife <= 8) score += 10;
      return score;
    }
    if (target.who !== us) return -100;            // life gain — to self
    const myLife = state[us].life;
    const oppLife = state[them].life;
    const losing = oppLife > myLife;
    if (myLife <= 4) return amount * (losing ? 18 : 12);
    if (myLife <= 8) return amount * (losing ? 8 : 5);
    if (myLife <= 14) return amount * 2;
    return -2;
  }
  if (eff.kind === 'discard') {
    if (target.who !== them) return -100;
    const handSize = state[them].hand.length;
    if (handSize === 0) return -100;
    const amount = eff.amount || 1;
    const actualLoss = Math.min(amount, handSize);
    return actualLoss * 8 + 4;
  }
  if (eff.kind === 'grant_keyword') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    // Negative-keyword grants (defender) — only cast on opp creatures.
    // Positive keywords (flying, haste, etc) — only cast on our own.
    // For now Bindspeaker grants defender; broaden when we add others.
    const kw = eff.keyword;
    const isDebuff = (kw === 'defender' || kw === 'no_block');
    if (isDebuff && c.controller === us) return -100;
    if (!isDebuff && c.controller !== us) return -100;
    // Already has the keyword? Spell is wasted.
    if (c.card.keywords.includes(kw)) return -50;
    if (isDebuff) {
      // Already locked down by other means? Skip.
      if (c.card.cantAttack) return -50;
      const [pow, tou] = ENGINE.getStats(c.card);
      // Bigger threats = better lockdown targets.
      return 35 + pow * 2 + tou;
    }
    // Buff grant on our own creature — value scales with what we're adding.
    const [pow] = ENGINE.getStats(c.card);
    return 20 + pow;
  }
  if (eff.kind === 'fight') {
    if (target.kind !== 'creature') return -100;
    const c = ENGINE.findCard(target.iid);
    if (!c) return -100;
    if (c.controller === us) return -100;
    // Pick our biggest creature to estimate the fight result.
    const ours = state[us].battlefield.filter(x => hasType(x, 'Creature') && !x.tapped);
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
  if (eff.kind === 'grant_cast_permission') {
    if (target.kind !== 'graveyard_card') return -100;
    const graveOwner = target.controller || them;
    const grave = state[graveOwner].graveyard || [];
    const card = grave.find(c => c.iid === target.iid);
    if (!card) return -100;
    return 8 + ENGINE.getCardValue(card, 'play');
  }
  if (eff.kind === 'move_card') {
    // Collapsed discard (hand→graveyard) targeting a player — duress/mind_rot.
    // Only worth aiming at the opponent; value scales with cards stripped.
    if (eff.from_zone === 'hand' && eff.to_zone === 'graveyard') {
      if (target.kind !== 'player' || target.who !== them) return -100;
      const handSize = state[them].hand.length;
      if (handSize === 0) return -100;
      return Math.min(eff.amount || 1, handSize) * 8 + 4;
    }
    // Collapsed returnFromGraveyard / shuffleIntoLibrary — value at parity.
    if (eff.from_zone === 'graveyard' && eff.to_zone === 'hand') {
      if (target.kind !== 'graveyard_card') return -100;
      const grave = state[target.controller || us].graveyard || [];
      const card = grave.find(c => c.iid === target.iid);
      if (!card) return -100;
      return 10 + ENGINE.getCardValue(card, 'play');
    }
    if (eff.from_zone === 'battlefield' && eff.to_zone === 'library') {
      if (target.kind !== 'creature') return -100;
      const c = ENGINE.findCard(target.iid);
      if (!c) return -100;
      if (c.controller === us) return -100;
      if (c.card.keywords.includes('hexproof')) return -100;
      const [pow, tou] = ENGINE.getStats(c.card);
      return 30 + pow + Math.floor(tou / 2) + laneOpeningBonus(state, us, target.iid);
    }
    if (eff.from_zone === 'battlefield' && eff.to_zone === 'exile'
        && modeEffects.some(e => e.kind === 'schedule_delayed')) {
      // Collapsed exile_until_eot (exile now + a scheduled return at EOT).
      //   1. Opp's creature → tempo removal (off the board for a turn).
      //   2. Own creature → delayed flicker (re-fire ETB at EOT).
      if (target.kind !== 'creature') return -100;
      const c = ENGINE.findCard(target.iid);
      if (!c) return -100;
      if (c.card.isToken && c.controller === us) return -100;
      if (c.controller !== us) {
        let score = 8 + ENGINE.getCardValue(c.card, 'kill');
        if (c.card.isToken) score += 4;  // token doesn't return — permanent removal
        return score;
      }
      let score = 3;
      if (Array.isArray(c.card.triggers)) {
        score += c.card.triggers.filter(triggerFiresOnEnter).length * 8;  // less than flicker (delayed)
      }
      if (c.card.damage > 0) score += c.card.damage * 2;
      score -= (c.card.permPower || 0) + (c.card.permTou || 0);
      return score;
    }
    if (eff.from_zone === 'battlefield' && eff.to_zone === 'exile'
        && modeEffects.some(e => e.kind === 'move_card' && e.from_zone === 'exile' && e.to_zone === 'battlefield')) {
      // Collapsed flicker (exile + immediate return). Flickering only makes
      // sense on our own creatures. Best targets:
      //   1. ETB-trigger creatures we want to re-fire (Wall of Omens, Grave
      //      Digger) — high value, the whole point of flicker.
      //   2. Damaged creatures about to die — flicker resets damage.
      // Avoid flickering tokens (they cease to exist) and creatures that lose
      // ongoing benefit from staying put (counters).
      if (target.kind !== 'creature') return -100;
      const c = ENGINE.findCard(target.iid);
      if (!c || c.controller !== us) return -100;
      if (c.card.isToken) return -100;        // would cease to exist
      let score = 5;
      if (Array.isArray(c.card.triggers)) {
        const etbTriggers = c.card.triggers.filter(triggerFiresOnEnter);
        score += etbTriggers.length * 12;
      }
      if (c.card.damage > 0) score += c.card.damage * 2;
      score -= (c.card.permPower || 0) + (c.card.permTou || 0);
      return score;
    }
    if (eff.from_zone === 'battlefield' && eff.to_zone === 'hand') {
      // Bounce (embargo's removal half — the apply_sticker cost-tax rides
      // along). Tempo removal on an opp creature; a bounced token ceases.
      if (target.kind !== 'creature') return -100;
      const c = ENGINE.findCard(target.iid);
      if (!c || c.controller === us) return -100;
      if (c.card.keywords.includes('hexproof')) return -100;
      const [pow, tou] = ENGINE.getStats(c.card);
      let score = 20 + pow + Math.floor(tou / 2);
      if (c.card.isToken) score += 10;   // bounced token ceases to exist
      return score + laneOpeningBonus(state, us, target.iid);
    }
    if (eff.from_zone === 'battlefield' && eff.to_zone === 'exile') {
      // Plain exile with no return (bleach's removal half — the set_color
      // sticker rides along; flicker + exile_until_eot returns were handled
      // above and already returned). Hardest removal: permanent, dodges
      // regeneration/death-trigger value. Token exile is still just removal.
      if (target.kind !== 'creature') return -100;
      const c = ENGINE.findCard(target.iid);
      if (!c || c.controller === us) return -100;
      if (c.card.keywords.includes('hexproof')) return -100;
      const [pow, tou] = ENGINE.getStats(c.card);
      return 45 + ENGINE.getCardValue(c.card, 'kill') + laneOpeningBonus(state, us, target.iid);
    }
    return 0;
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
    } else if (eff.kind === 'gain_life') {
      // Signed life on an ability. Negative = drain (Wicked Acolyte: tap, target
      // player loses 1) — good aimed at the opponent. Positive = lifegain to self.
      const amt = eff.amount || 0;
      const t = act.targets && act.targets[0];
      if (amt < 0) {
        if (!t) score = 8;                                  // implicit-opponent drain
        else score = (t.kind === 'player' && t.who === opp(who)) ? 8 + (-amt) * 3 : -100;
      } else {
        const toSelf = !t || (t.kind === 'player' && t.who === who);
        score = toSelf ? (state[who].life <= 10 ? 2 + amt : -2) : -100;
      }
    } else if (eff.kind === 'damage' && eff.target === 'player' && !act.targets) {
      // Drain-tax abilities (legacy damage-to-player shape).
      score = 8;
    } else if (eff.kind === 'affect_creature' && act.targets) {
      const t = act.targets[0];
      if (t.kind === 'creature') {
        const c = ENGINE.findCard(t.iid);
        if (c && c.controller !== who) {
          const sev = ENGINE.sevToNum(eff.severity);
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
    } else if (eff.kind === 'pump' && eff.scope === 'self') {
      // Self-pump (firebreathing) — only useful pre-attack. MAIN2/END = waste.
      const validPhase = (state.phase === 'MAIN1' || state.phase === 'COMBAT_ATTACK')
                         && state.activePlayer === who;
      if (!validPhase) {
        score = -100;
      } else {
        score = 3 + (eff.power || 0) + (eff.toughness || 0);
      }
    } else if (eff.kind === 'draw'
        || (eff.kind === 'move_card' && eff.from_zone === 'library' && eff.to_zone === 'hand')) {
      // Drawing is always positive (looter discard is filtered as net upside).
      score = 5 + (eff.amount || 1);
    } else if (eff.kind === 'discard'
        || (eff.kind === 'move_card' && eff.from_zone === 'hand' && eff.to_zone === 'graveyard')) {
      // Self-discard with no paired draw — skip. Opp-discard would score, but
      // no current activated abilities have that shape.
      const isSelf = !eff.target || eff.scope === 'self';
      score = isSelf ? -50 : 8;
    } else if (eff.kind === 'move_card' && eff.from_zone === 'library'
        && (eff.to_zone === 'battlefield' || (eff.to_zone === 'hand' && eff.selector === 'library_search'))) {
      // Tutoring / land-fetch is consistently strong (collapsed search*).
      score = 8;
    } else if (eff.kind === 'move_card' && eff.from_zone === 'graveyard' && eff.to_zone === 'hand') {
      // Recall a creature card from our graveyard to hand (Hymnwright's verse
      // ability). Value the returned body at parity — mirrors the spell scorer.
      const t = act.targets && act.targets[0];
      const grave = state[who].graveyard || [];
      const recalled = t && grave.find(c => c.iid === t.iid);
      score = recalled ? 10 + ENGINE.getCardValue(recalled, 'play') : -100;
    } else if (eff.kind === 'move_card' && eff.from_zone === 'graveyard' && eff.to_zone === 'battlefield') {
      // Reanimate a creature straight onto the battlefield (Deepseam Quarry). The
      // target may sit in either graveyard (graveyards: ['self','opp']), so search
      // both. The sac/mana cost is folded in by the generic sac-penalty block below.
      const t = act.targets && act.targets[0];
      let reanimated = null;
      if (t) {
        for (const g of [state.you.graveyard || [], state.opp.graveyard || []]) {
          const f = g.find(c => c.iid === t.iid);
          if (f) { reanimated = f; break; }
        }
      }
      score = reanimated ? 12 + ENGINE.getCardValue(reanimated, 'play') : -100;
    } else if ((eff.kind === 'add_counter' || (eff.kind === 'pump' && eff.duration === 'permanent')) && eff.scope === 'self') {
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
        // Self-sac is strictly worse than sacing a chump WHEN it's accidental —
        // losing the source gains nothing and Carrion Feeder's +1/+1 fizzles if
        // it eats itself. But a `sacrifice:'self'` cost is the ability's intended
        // price (Deepseam Quarry sacs itself to reanimate), so charge only the
        // body's board value, not the anti-waste penalty.
        const selfSacByDesign = ab.cost && ab.cost.sacrifice === 'self';
        if (sacF.card.iid === act.cardIid && !selfSacByDesign) score -= 30;
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
  // Spell valuation relocated from engine.js (review #6) — exposed for tests
  // (test_ai_targeting, test_effect_coverage) and the engine coverage report.
  spellValueForEffects, VALUED_EFFECT_KINDS, UNVALUED_EFFECT_KINDS,
};
})();
// END HEURISTIC AI
