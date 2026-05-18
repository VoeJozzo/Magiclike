class_name AI
extends RefCounted

# AI entry point. Pure: reads state, returns one action descriptor. Engine consumes via execute_action.
# Ported from reference/html-proto/js/ai.js::decide. Order: trigger target, block, attack,
# instant-speed response, main, pass.

static func decide(state: EngineState, player_key: String) -> Dictionary:
	if state == null or state.winner != "":
		return Action.make_pass_priority()
	if not state.awaiting_target_for_trigger.is_empty() \
			and state.awaiting_target_for_trigger.get("controller_key", "") == player_key:
		return _decide_trigger_target(state, player_key)
	if not state.awaiting_discard.is_empty() \
			and state.awaiting_discard.get("player_key", "") == player_key:
		return _decide_discard(state, player_key)
	var phase = state.phase_machine.current
	if phase == PhaseMachine.Phase.COMBAT_BLOCK and player_key != state.active_player_key:
		var next_block: Dictionary = _next_block_action(state, player_key)
		if not next_block.is_empty():
			return next_block
		# awaiting_block_declaration = turn-based window, no priority open, so passing would be illegal.
		if state.awaiting_block_declaration:
			return Action.make_confirm_blocks()
		return Action.make_pass_priority()
	if phase == PhaseMachine.Phase.COMBAT_ATTACK and player_key == state.active_player_key:
		var next_attack: Dictionary = _next_attack_action(state, player_key)
		if not next_attack.is_empty():
			return next_attack
		return Action.make_pass_priority()
	if not state.stack.is_empty():
		var response: Dictionary = _decide_instant_response(state, player_key)
		if not response.is_empty():
			return response
		return Action.make_pass_priority()
	if state.phase_machine.is_main_phase() and player_key == state.active_player_key:
		var main_action: Dictionary = _decide_main(state, player_key)
		if not main_action.is_empty():
			return main_action
	return Action.make_pass_priority()


# ─── Trigger target pick ──────────────────────────────────────────────────
# For player-or-creature filters: prefer opp's face (1-dmg ping > trading for a 2-power).
static func _decide_trigger_target(state: EngineState, player_key: String) -> Dictionary:
	var meta: Dictionary = state.awaiting_target_for_trigger
	var filter: String = meta.get("filter", "")
	var opp_key: String = state.opponent_of(player_key)
	match filter:
		"creature_or_player", "player":
			return Action.make_pick_trigger_target({"kind": "player", "who": opp_key})
		"creature":
			var best: CardInstance = null
			var best_score: float = -INF
			for c in state.player_by_key(opp_key).battlefield:
				if c.template == null or not (c.template is CreatureResource):
					continue
				if c.has_keyword("hexproof"):
					continue
				var s: float = AIScoring.card_value(c.template, "kill")
				if s > best_score:
					best_score = s
					best = c
			if best != null:
				return Action.make_pick_trigger_target({"kind": "creature", "iid": best.instance_id})
	# Should never happen — fallback prevents engine hang.
	return Action.make_pass_priority()


# ─── Cleanup-step discard ─────────────────────────────────────────────────
# Pick the lowest-value card in hand by AIScoring.card_value. Ties go to the
# first one encountered. Lands tend to score low so a flooded AI dumps them
# first, which is the right call in most mana-screw-then-stabilize scenarios.
static func _decide_discard(state: EngineState, player_key: String) -> Dictionary:
	var p: Player = state.player_by_key(player_key)
	if p.hand.is_empty():
		# Shouldn't happen — engine wouldn't set awaiting_discard with empty hand
		# — but bail safely rather than hang.
		return Action.make_pass_priority()
	var worst: CardInstance = p.hand[0]
	var worst_score: float = AIScoring.card_value(worst.template, "keep_in_hand")
	for i in range(1, p.hand.size()):
		var c: CardInstance = p.hand[i]
		var s: float = AIScoring.card_value(c.template, "keep_in_hand")
		if s < worst_score:
			worst_score = s
			worst = c
	return Action.make_discard_card(worst.instance_id)


# ─── Combat ───────────────────────────────────────────────────────────────
# Engine declares one at a time. Returns NEXT declaration, or empty when done.
static func _next_attack_action(state: EngineState, attacker_key: String) -> Dictionary:
	var planned: Array[int] = AICombat.decide_attackers(state, attacker_key)
	for iid in planned:
		if not (iid in state.attackers):
			return Action.make_declare_attacker(iid)
	return {}


static func _next_block_action(state: EngineState, defender_key: String) -> Dictionary:
	var plan: Dictionary = AICombat.decide_blockers(state, defender_key)
	for blocker_iid in plan:
		if not state.blockers.has(blocker_iid):
			return Action.make_declare_blocker(blocker_iid, plan[blocker_iid])
	return {}


# ─── Instant-speed response ───────────────────────────────────────────────
# Counterspell opp's spell, or Giant Growth one of ours that's being targeted.
static func _decide_instant_response(state: EngineState, player_key: String) -> Dictionary:
	var top = state.stack.top()
	if top == null:
		return {}
	var top_kind: String = top.get("kind", "spell")
	var top_controller: String = top.get("controller_key", "")
	if top_kind == "spell" and top_controller != player_key:
		var cspell: CardInstance = _find_in_hand_by_id(state, player_key, "counterspell")
		if cspell != null and _can_cast(state, player_key, cspell):
			var ctarget := {"kind": "stack", "iid": int(top.source_iid)}
			return Action.make_cast_spell(cspell.instance_id, [ctarget])
	# Heuristic save: +3/+3 rescues most things, no precision damage check.
	if top_kind == "spell" and top_controller != player_key:
		var top_targets: Array = top.get("targets", [])
		if not top_targets.is_empty():
			var t: Dictionary = top_targets[0]
			if t.get("kind", "") == "creature":
				var target_iid: int = int(t.get("iid", -1))
				var tfound = state.find_instance(target_iid)
				if tfound != null and tfound.card != null \
						and tfound.controller.key == player_key:
					var growth: CardInstance = _find_in_hand_by_id(state, player_key, "giant_growth")
					if growth != null and _can_cast_with_mana_search(state, player_key, growth):
						# Tap a land for G first if needed; AI resumes next call.
						var tap_action: Dictionary = _find_mana_tap_for(state, player_key, "G")
						if not tap_action.is_empty() and not state.player_by_key(player_key).mana.can_pay(growth.template.mana_cost):
							return tap_action
						var gtarget := {"kind": "creature", "iid": target_iid}
						return Action.make_cast_spell(growth.instance_id, [gtarget])
	return {}


# True if one more land tap could cover the shortfall.
static func _can_cast_with_mana_search(state: EngineState, player_key: String, card: CardInstance) -> bool:
	var p: Player = state.player_by_key(player_key)
	if p.mana.can_pay(card.template.mana_cost):
		return true
	var cost: Dictionary = card.template.mana_cost
	for c in p.battlefield:
		if c.tapped or not c.is_land():
			continue
		if not (c.template is LandResource):
			continue
		for color in c.template.mana_produced:
			if cost.get(color, 0) > p.mana.pool.get(color, 0):
				return true
			if cost.get("C", 0) > 0:
				return true
	return false


static func _find_mana_tap_for(state: EngineState, player_key: String, color: String) -> Dictionary:
	for c in state.player_by_key(player_key).battlefield:
		if c.tapped or not c.is_land():
			continue
		if c.template is LandResource and color in c.template.mana_produced:
			return Action.make_activate_ability(c.instance_id)
	return {}


# ─── Main phase ───────────────────────────────────────────────────────────
# Greedy curve-up: land first, then highest-cost castable spell, then tap if any uncast spell.
static func _decide_main(state: EngineState, player_key: String) -> Dictionary:
	var p: Player = state.player_by_key(player_key)
	if not p.land_played_this_turn:
		for card in p.hand:
			if card.is_land():
				return Action.make_play_land(card.instance_id)
	var best_castable: CardInstance = _best_castable_spell(state, player_key)
	if best_castable != null:
		if best_castable.template is SpellResource and best_castable.template.requires_target:
			var target: Dictionary = _pick_spell_target(state, player_key, best_castable)
			if target.is_empty():
				pass
			else:
				return Action.make_cast_spell(best_castable.instance_id, [target])
		else:
			return Action.make_cast_spell(best_castable.instance_id, [])
	for card in p.battlefield:
		if not card.is_land():
			continue
		if card.tapped:
			continue
		if _has_uncast_spell(state, player_key):
			return Action.make_activate_ability(card.instance_id)
	return {}


static func _best_castable_spell(state: EngineState, player_key: String) -> CardInstance:
	var p: Player = state.player_by_key(player_key)
	var best: CardInstance = null
	var best_cost: int = -1
	for card in p.hand:
		if card.is_land():
			continue
		if not _can_cast(state, player_key, card):
			continue
		var cost: int = _total_cost(card.template.mana_cost)
		if cost > best_cost:
			best_cost = cost
			best = card
	return best


# Greedy: opp face for any-target spells, highest-value opp creature for creature-only.
static func _pick_spell_target(state: EngineState, player_key: String, card: CardInstance) -> Dictionary:
	if not (card.template is SpellResource):
		return {}
	var spell: SpellResource = card.template
	var opp_key: String = state.opponent_of(player_key)
	match spell.target_filter:
		"creature_or_player", "any":
			return {"kind": "player", "who": opp_key}
		"creature":
			var best: CardInstance = null
			var best_score: float = -INF
			for c in state.player_by_key(opp_key).battlefield:
				if c.template == null or not (c.template is CreatureResource):
					continue
				if c.has_keyword("hexproof"):
					continue
				var s: float = AIScoring.card_value(c.template, "kill")
				if s > best_score:
					best_score = s
					best = c
			if best != null:
				return {"kind": "creature", "iid": best.instance_id}
		"player":
			return {"kind": "player", "who": opp_key}
		"spell":
			var top = state.stack.top()
			if top != null and top.controller_key != player_key:
				return {"kind": "stack", "iid": int(top.source_iid)}
	return {}


# ─── Helpers ───────────────────────────────────────────────────────────────

static func _find_in_hand_by_id(state: EngineState, player_key: String, card_id: String) -> CardInstance:
	for c in state.player_by_key(player_key).hand:
		if c.template != null and c.template.card_id == card_id:
			return c
	return null


static func _can_cast(state: EngineState, player_key: String, card: CardInstance) -> bool:
	# Mana + phase + stack only. Target legality checked later by engine.is_legal_action.
	var p: Player = state.player_by_key(player_key)
	if not p.mana.can_pay(card.template.mana_cost):
		return false
	if not card.template.has_type("instant"):
		if state.active_player_key != player_key:
			return false
		if not state.phase_machine.is_main_phase():
			return false
		if not state.stack.is_empty():
			return false
	return true


static func _has_uncast_spell(state: EngineState, player_key: String) -> bool:
	var p: Player = state.player_by_key(player_key)
	for card in p.hand:
		if not card.is_land():
			return true
	return false


static func _total_cost(cost: Dictionary) -> int:
	var total: int = 0
	for k in cost:
		total += int(cost[k])
	return total
