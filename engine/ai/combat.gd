class_name AICombat
extends RefCounted

# AI combat helpers. Ported from js/ai.js's combat block. Pure: simulate_combat
# operates on a duplicate_deep of EngineState — real state never touched.
# Outcome dict from attacker POV: {dead_attackers, dead_blockers, damage_to_defender, *_life_gain}.

const EMPTY_OUTCOME := {
	"dead_attackers": [],
	"dead_blockers": [],
	"damage_to_defender": 0,
	"attacker_life_gain": 0,
	"defender_life_gain": 0,
}


# block_map: blocker_iid → attacker_iid (same shape as EngineState.blockers).
static func simulate_combat(
	state: EngineState,
	attacker_key: String,
	attacker_iids: Array,
	block_map: Dictionary
) -> Dictionary:
	if attacker_iids.is_empty():
		return EMPTY_OUTCOME.duplicate(true)
	var sim: EngineState = state.duplicate_deep()
	sim.attackers = []
	for iid in attacker_iids:
		sim.attackers.append(int(iid))
	sim.blockers = block_map.duplicate()
	var defender_key: String = sim.opponent_of(attacker_key)
	var defender_life_before: int = sim.player_by_key(defender_key).life
	var attacker_life_before: int = sim.player_by_key(attacker_key).life
	# Reuse the engine's damage resolver instead of forking the logic — keyword rules stay in one place.
	var saved_state = RulesEngine._state
	RulesEngine._state = sim
	sim.active_player_key = attacker_key
	RulesEngine._resolve_combat_damage()
	RulesEngine._state = saved_state
	var dead_attackers: Array[int] = []
	var dead_blockers: Array[int] = []
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
	var damage_to_defender: int = max(0, defender_life_before - defender_life_after)
	var defender_life_gain: int = max(0, defender_life_after - (defender_life_before - damage_to_defender))
	var attacker_life_gain: int = max(0, attacker_life_after - attacker_life_before)
	return {
		"dead_attackers": dead_attackers,
		"dead_blockers": dead_blockers,
		"damage_to_defender": damage_to_defender,
		"attacker_life_gain": attacker_life_gain,
		"defender_life_gain": defender_life_gain,
	}


static func _is_on_battlefield(player: Player, iid: int) -> bool:
	for c in player.battlefield:
		if c.instance_id == iid:
			return true
	return false


# ─── Attack decision ──────────────────────────────────────────────────────
# 1. Lethal (assumes no blocks). 2. Otherwise: attack creatures whose simulated trade is net-positive.
static func decide_attackers(state: EngineState, attacker_key: String) -> Array[int]:
	var attacker: Player = state.player_by_key(attacker_key)
	var defender: Player = state.player_by_key(state.opponent_of(attacker_key))
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
	var total_power: int = 0
	for c in eligible:
		total_power += c.current_power()
	if total_power >= defender.life:
		var lethal_iids: Array[int] = []
		for c in eligible:
			lethal_iids.append(c.instance_id)
		return lethal_iids
	var attack_iids: Array[int] = []
	for c in eligible:
		var predicted_block: Dictionary = _predict_block_for(state, attacker_key, c.instance_id)
		var outcome: Dictionary = simulate_combat(state, attacker_key, [c.instance_id], predicted_block)
		var i_died: bool = c.instance_id in outcome.dead_attackers
		var killed_blocker: bool = not outcome.dead_blockers.is_empty()
		var face_dmg: int = outcome.damage_to_defender
		if not i_died or killed_blocker or face_dmg > 0:
			attack_iids.append(c.instance_id)
	return attack_iids


# Heuristic: smallest blocker that survives, else smallest available.
static func _predict_block_for(state: EngineState, attacker_key: String, attacker_iid: int) -> Dictionary:
	var defender: Player = state.player_by_key(state.opponent_of(attacker_key))
	var atk_found = state.find_instance(attacker_iid)
	if atk_found == null or atk_found.card == null:
		return {}
	var attacker_card: CardInstance = atk_found.card
	if attacker_card.has_keyword("unblockable"):
		return {}
	var best_blocker: CardInstance = null
	for c in defender.battlefield:
		if c.template == null or not (c.template is CreatureResource):
			continue
		if c.tapped:
			continue
		if attacker_card.has_keyword("flying") \
				and not c.has_keyword("flying") \
				and not c.has_keyword("reach"):
			continue
		var survives: bool = c.current_toughness() > attacker_card.current_power()
		if best_blocker == null or (survives and c.current_power() < best_blocker.current_power()):
			best_blocker = c
	if best_blocker == null:
		return {}
	return {best_blocker.instance_id: attacker_iid}


# ─── Block decision ───────────────────────────────────────────────────────
# Greedy one-to-one (no chump-doubling). Walk attackers biggest-first, pick best blocker.
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
		if best_blocker != null and best_score > 0.0:
			block_map[best_blocker.instance_id] = attacker.instance_id
			available_blockers.erase(best_blocker)
	return block_map


# Defender POV: +atk_pow (prevented), -blocker (if dies), +attacker (if dies).
# Deathtouch/first-strike/indestructible flip kill calculus.
static func _score_block_pair(attacker: CardInstance, blocker: CardInstance) -> float:
	var score: float = 0.0
	var atk_pow: int = attacker.current_power()
	var atk_tough: int = attacker.current_toughness()
	var blk_pow: int = blocker.current_power()
	var blk_tough: int = blocker.current_toughness()
	score += float(atk_pow)
	var blocker_dies: bool = blk_tough <= atk_pow \
			or (attacker.has_keyword("deathtouch") and atk_pow > 0) \
			or (attacker.has_keyword("first_strike") and atk_pow >= blk_tough)
	if blocker.has_keyword("indestructible"):
		blocker_dies = false
	if blocker_dies:
		score -= float(blk_pow + blk_tough)
	var attacker_dies: bool = atk_tough <= blk_pow \
			or (blocker.has_keyword("deathtouch") and blk_pow > 0)
	if attacker.has_keyword("indestructible"):
		attacker_dies = false
	# Attacker first-strike kills blocker before it can swing back.
	if attacker.has_keyword("first_strike") and not blocker.has_keyword("first_strike"):
		if blocker_dies:
			attacker_dies = false
	if attacker_dies:
		score += float(atk_pow + atk_tough)
	return score
