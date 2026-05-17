class_name AICombat
extends RefCounted

# Phase 5c: AI combat helpers — simulate_combat plus attack/block deciders.
# Ported (~1:1 in shape) from reference/html-proto/js/ai.js's combat block.
#
# simulate_combat operates on a DEEP-COPIED EngineState so the real game
# state is never touched. Mirrors the JS prototype's "shallow worker"
# pattern but typed-correctly via EngineState.duplicate_deep.

# Outcome of a simulated combat. All counts/lists are in the attacker's
# point of view ("how does this combat plan look for the attacker").
#
#   dead_attackers    : Array[int]   — attacker iids that died
#   dead_blockers     : Array[int]   — blocker iids that died
#   damage_to_defender: int          — face damage that landed
#   attacker_life_gain: int          — life gained by attacker side (lifelink)
#   defender_life_gain: int          — life gained by defender side (lifelink)
const EMPTY_OUTCOME := {
	"dead_attackers": [],
	"dead_blockers": [],
	"damage_to_defender": 0,
	"attacker_life_gain": 0,
	"defender_life_gain": 0,
}


# Simulate one combat step given the attacker_iids and block_map. The state
# is deep-copied so this is pure of side effects on the real engine.
# Returns the outcome dictionary above.
#
# block_map: Dictionary mapping blocker_iid → attacker_iid (same shape as
#            EngineState.blockers).
static func simulate_combat(
	state: EngineState,
	attacker_key: String,
	attacker_iids: Array,
	block_map: Dictionary
) -> Dictionary:
	if attacker_iids.is_empty():
		return EMPTY_OUTCOME.duplicate(true)
	# Work on a deep copy.
	var sim: EngineState = state.duplicate_deep()
	sim.attackers = []
	for iid in attacker_iids:
		sim.attackers.append(int(iid))
	sim.blockers = block_map.duplicate()
	# Snapshot defender's life before damage so we can compute net face damage
	# regardless of lifelink swings.
	var defender_key: String = sim.opponent_of(attacker_key)
	var defender_life_before: int = sim.player_by_key(defender_key).life
	var attacker_life_before: int = sim.player_by_key(attacker_key).life
	# Run the actual combat damage path. This goes through the same engine
	# code that real combat uses, so all keyword rules are honored without
	# duplicating the logic here.
	#
	# We need to set sim as the engine's active state temporarily, run the
	# damage resolver, then swap back. Simpler: copy the resolver locally
	# into the sim — but that doubles maintenance. Instead, we use the
	# direct approach: replace _state, run, restore.
	var saved_state = RulesEngine._state
	RulesEngine._state = sim
	# Set the active player so opponent_of resolves correctly inside the
	# damage step.
	sim.active_player_key = attacker_key
	RulesEngine._resolve_combat_damage()
	RulesEngine._state = saved_state
	# Compute outcome by diffing sim against the original state.
	var dead_attackers: Array[int] = []
	var dead_blockers: Array[int] = []
	# An attacker is dead if it's no longer in attacker's battlefield
	# (moved to graveyard by SBA inside _resolve_combat_damage).
	var attacker_player: Player = sim.player_by_key(attacker_key)
	var defender_player: Player = sim.player_by_key(defender_key)
	for iid in attacker_iids:
		if not _is_on_battlefield(attacker_player, int(iid)):
			dead_attackers.append(int(iid))
	for blocker_iid in block_map:
		if not _is_on_battlefield(defender_player, int(blocker_iid)):
			dead_blockers.append(int(blocker_iid))
	var defender_life_after: int = sim.player_by_key(defender_key).life
	var attacker_life_after: int = sim.player_by_key(attacker_key).life
	# Net face damage = how much the defender's life dropped.
	var damage_to_defender: int = max(0, defender_life_before - defender_life_after)
	# Life gain is the positive delta (lifelink). The defender doesn't have
	# lifelink in normal combat unless they have a lifelinking blocker — track
	# both for completeness.
	var defender_life_gain: int = max(0, defender_life_after - (defender_life_before - damage_to_defender))
	var attacker_life_gain: int = max(0, attacker_life_after - attacker_life_before)
	return {
		"dead_attackers": dead_attackers,
		"dead_blockers": dead_blockers,
		"damage_to_defender": damage_to_defender,
		"attacker_life_gain": attacker_life_gain,
		"defender_life_gain": defender_life_gain,
	}


# True if the given iid is on the player's battlefield.
static func _is_on_battlefield(player: Player, iid: int) -> bool:
	for c in player.battlefield:
		if c.instance_id == iid:
			return true
	return false


# ─── Combat decision: pick the best attack subset ─────────────────────────
# Given the engine state and the AI's key, decides which attackers to
# declare. Returns an Array of CardInstance iids.
#
# Strategy (matches the JS prototype's shape, simplified):
#   1. If lethal attack exists (deal enough face damage to win this turn),
#      take it. Lethal recognition currently ignores potential blockers —
#      Phase 5+ refinement could weigh "what's the worst opp blocks could do
#      back to me."
#   2. Otherwise, attack with all eligible creatures whose simulated combat
#      is net-positive (we deal more value than we lose). Predicts opp's
#      blocks via a simple "best blocker per attacker" heuristic.
static func decide_attackers(state: EngineState, attacker_key: String) -> Array[int]:
	var attacker: Player = state.player_by_key(attacker_key)
	var defender: Player = state.player_by_key(state.opponent_of(attacker_key))
	# Eligible attackers: untapped, not summon-sick (unless haste), not defender.
	var eligible: Array[CardInstance] = []
	for c in attacker.battlefield:
		if c.template == null or not (c.template is CreatureResource):
			continue
		if c.tapped:
			continue
		if c.summoning_sick and not c.has_keyword("haste"):
			continue
		if c.has_keyword("defender"):
			continue
		eligible.append(c)
	if eligible.is_empty():
		return [] as Array[int]
	# Lethal check: if total unblocked power >= defender's life, swing.
	# This is a generous lethal — assumes opp doesn't block. Phase 5+ would
	# subtract predicted-blocked damage. For Phase 5c, simple-but-bold is fine.
	var total_power: int = 0
	for c in eligible:
		total_power += c.current_power()
	if total_power >= defender.life:
		var lethal_iids: Array[int] = []
		for c in eligible:
			lethal_iids.append(c.instance_id)
		return lethal_iids
	# Otherwise — attack with creatures whose simulated combat trade is
	# net positive. Simulate "this single attacker, predicted block from opp".
	var attack_iids: Array[int] = []
	for c in eligible:
		var predicted_block: Dictionary = _predict_block_for(state, attacker_key, c.instance_id)
		var outcome: Dictionary = simulate_combat(state, attacker_key, [c.instance_id], predicted_block)
		# Net positive if we deal face damage OR kill a blocker without dying.
		var i_died: bool = c.instance_id in outcome.dead_attackers
		var killed_blocker: bool = not outcome.dead_blockers.is_empty()
		var face_dmg: int = outcome.damage_to_defender
		if not i_died or killed_blocker or face_dmg > 0:
			attack_iids.append(c.instance_id)
	return attack_iids


# Predict what single block the defender would assign to a lone attacker.
# Heuristic: pick the smallest creature that can survive (or kill) the
# attacker. Returns a block_map dict (possibly empty).
static func _predict_block_for(state: EngineState, attacker_key: String, attacker_iid: int) -> Dictionary:
	var defender: Player = state.player_by_key(state.opponent_of(attacker_key))
	var atk_found = state.find_instance(attacker_iid)
	if atk_found == null or atk_found.card == null:
		return {}
	var attacker_card: CardInstance = atk_found.card
	# If attacker is unblockable, no block predicted.
	if attacker_card.has_keyword("unblockable"):
		return {}
	# Pick the smallest eligible blocker whose toughness ≥ attacker power,
	# or if none, the smallest blocker available.
	var best_blocker: CardInstance = null
	for c in defender.battlefield:
		if c.template == null or not (c.template is CreatureResource):
			continue
		if c.tapped:
			continue
		# Flying check: ground creatures can't block flyer (unless they have reach).
		if attacker_card.has_keyword("flying") \
				and not c.has_keyword("flying") \
				and not c.has_keyword("reach"):
			continue
		# Prefer a blocker that survives, else any chump.
		var survives: bool = c.current_toughness() > attacker_card.current_power()
		if best_blocker == null or (survives and c.current_power() < best_blocker.current_power()):
			best_blocker = c
	if best_blocker == null:
		return {}
	return {best_blocker.instance_id: attacker_iid}


# ─── Defender's block decision ─────────────────────────────────────────────
# Given the attacker's declared attackers, returns a block_map for the
# defending player. One-to-one pairing only (no chump-doubling) — Phase 5+
# could add multi-block + menace logic.
#
# Strategy: for each attacker, find the blocker that best minimises damage.
# Greedy walk; doesn't optimise the joint plan but cheap and correct.
static func decide_blockers(state: EngineState, defender_key: String) -> Dictionary:
	var defender: Player = state.player_by_key(defender_key)
	var block_map: Dictionary = {}
	var available_blockers: Array[CardInstance] = []
	for c in defender.battlefield:
		if c.template == null or not (c.template is CreatureResource):
			continue
		if c.tapped:
			continue
		available_blockers.append(c)
	# Walk attackers in descending power order — block the biggest first.
	var attacker_list: Array[CardInstance] = []
	for atk_iid in state.attackers:
		var found = state.find_instance(atk_iid)
		if found != null and found.card != null:
			attacker_list.append(found.card)
	attacker_list.sort_custom(func(a, b): return a.current_power() > b.current_power())
	for attacker in attacker_list:
		var best_blocker: CardInstance = null
		var best_score: float = -INF
		for blocker in available_blockers:
			# Flying check.
			if attacker.has_keyword("flying") \
					and not blocker.has_keyword("flying") \
					and not blocker.has_keyword("reach"):
				continue
			if attacker.has_keyword("unblockable"):
				continue
			var score: float = _score_block_pair(attacker, blocker)
			if score > best_score:
				best_score = score
				best_blocker = blocker
		# Only commit the block if it's net good for us (positive score).
		if best_blocker != null and best_score > 0.0:
			block_map[best_blocker.instance_id] = attacker.instance_id
			available_blockers.erase(best_blocker)
	return block_map


# Score a single blocker-vs-attacker matchup from the DEFENDER's perspective.
# Higher score = better for defender. Considers:
#   - We avoid the face damage (good)
#   - We might lose the blocker (bad)
#   - We might kill the attacker (good)
#   - Deathtouch flips kill calculus
static func _score_block_pair(attacker: CardInstance, blocker: CardInstance) -> float:
	var score: float = 0.0
	var atk_pow: int = attacker.current_power()
	var atk_tough: int = attacker.current_toughness()
	var blk_pow: int = blocker.current_power()
	var blk_tough: int = blocker.current_toughness()
	# Damage prevented: we don't take atk_pow to face. Worth ~atk_pow.
	score += float(atk_pow)
	# Blocker dies? Cost = blocker's stats baseline.
	var blocker_dies: bool = blk_tough <= atk_pow \
			or (attacker.has_keyword("deathtouch") and atk_pow > 0) \
			or (attacker.has_keyword("first_strike") and atk_pow >= blk_tough)
	# Indestructible blocker doesn't actually die from damage.
	if blocker.has_keyword("indestructible"):
		blocker_dies = false
	if blocker_dies:
		score -= float(blk_pow + blk_tough)
	# Attacker dies?
	var attacker_dies: bool = atk_tough <= blk_pow \
			or (blocker.has_keyword("deathtouch") and blk_pow > 0)
	if attacker.has_keyword("indestructible"):
		attacker_dies = false
	# If attacker has first strike and blocker doesn't, blocker dies BEFORE
	# blocker deals damage. Then attacker doesn't die.
	if attacker.has_keyword("first_strike") and not blocker.has_keyword("first_strike"):
		if blocker_dies:
			attacker_dies = false
	if attacker_dies:
		score += float(atk_pow + atk_tough)
	return score
