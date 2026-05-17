class_name AI
extends RefCounted

# Phase 5c: top-level AI entry point. Ported from
# reference/html-proto/js/ai.js::decide. Pure function — reads the state,
# returns one action descriptor. Engine consumes via execute_action.
#
# Single entry point: AI.decide(state, player_key) -> Dictionary action.
# Returns a pass_priority action if nothing better to do.
#
# Decision tree (matches JS prototype's order):
#   1. Trigger target pick (highest priority — engine is paused)
#   2. Block declaration (if defender, during COMBAT_BLOCK)
#   3. Attack declaration (if active, during COMBAT_ATTACK)
#   4. Cast spells in response (if stack non-empty, instant-speed reaction)
#   5. Main phase actions (play land, tap mana, cast biggest spell)
#   6. Pass priority (fallback)


static func decide(state: EngineState, player_key: String) -> Dictionary:
	if state == null or state.winner != "":
		return Action.make_pass_priority()
	# 1. Trigger target pick — engine halts here so it's the only legal move.
	if not state.awaiting_target_for_trigger.is_empty() \
			and state.awaiting_target_for_trigger.get("controller_key", "") == player_key:
		return _decide_trigger_target(state, player_key)
	# 2 & 3. Combat phase actions.
	var phase = state.phase_machine.current
	if phase == PhaseMachine.Phase.COMBAT_BLOCK and player_key != state.active_player_key:
		var next_block: Dictionary = _next_block_action(state, player_key)
		if not next_block.is_empty():
			return next_block
		# All wanted blocks committed — pass.
		return Action.make_pass_priority()
	if phase == PhaseMachine.Phase.COMBAT_ATTACK and player_key == state.active_player_key:
		var next_attack: Dictionary = _next_attack_action(state, player_key)
		if not next_attack.is_empty():
			return next_attack
		return Action.make_pass_priority()
	# 4. Instant-speed response to opponent's spell.
	if not state.stack.is_empty():
		var response: Dictionary = _decide_instant_response(state, player_key)
		if not response.is_empty():
			return response
		return Action.make_pass_priority()
	# 5. Main phase actions.
	if state.phase_machine.is_main_phase() and player_key == state.active_player_key:
		var main_action: Dictionary = _decide_main(state, player_key)
		if not main_action.is_empty():
			return main_action
	# 6. Default: pass priority.
	return Action.make_pass_priority()


# ─── Trigger target pick ──────────────────────────────────────────────────
# Engine is waiting on a target — pick the most-damaging legal one. For
# "creature_or_player" (Pyromaniac), prefer opp's life (face damage trumps
# trading a 1-dmg ping for a 2-power creature). For "creature" filters,
# pick the highest-value opposing creature.
static func _decide_trigger_target(state: EngineState, player_key: String) -> Dictionary:
	var meta: Dictionary = state.awaiting_target_for_trigger
	var filter: String = meta.get("filter", "")
	var opp_key: String = state.opponent_of(player_key)
	match filter:
		"creature_or_player", "player":
			return Action.make_pick_trigger_target({"kind": "player", "who": opp_key})
		"creature":
			# Highest-value opposing creature.
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
	# Fallback: pass to avoid hanging the engine (should never happen).
	return Action.make_pass_priority()


# ─── Combat: incremental attack/block decisions ───────────────────────────
# The engine declares attackers/blockers one at a time. AI.decide returns
# the NEXT one to declare each call, or empty when there's nothing left to
# do (caller passes priority).
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


# ─── Instant-speed response (Phase 3 stub replacement) ────────────────────
# When opp has cast something and we hold priority, decide whether to counter
# or buff. Phase 5c handles two cases:
#   - Counterspell on opponent's spell (always good when we have UU)
#   - Giant Growth on our creature when opp's Bolt targets it (saves it)
# Otherwise pass.
static func _decide_instant_response(state: EngineState, player_key: String) -> Dictionary:
	var top = state.stack.top()
	if top == null:
		return {}
	var top_kind: String = top.get("kind", "spell")
	var top_controller: String = top.get("controller_key", "")
	# Counterspell check — only if their spell is on top, not our own.
	if top_kind == "spell" and top_controller != player_key:
		var cspell: CardInstance = _find_in_hand_by_id(state, player_key, "counterspell")
		if cspell != null and _can_cast(state, player_key, cspell):
			var ctarget := {"kind": "stack", "iid": int(top.source_iid)}
			return Action.make_cast_spell(cspell.instance_id, [ctarget])
	# Giant Growth defense: if opp's spell targets one of our creatures
	# with damage, pump that creature so it survives. Heuristic — we
	# don't check damage amount precisely; +3/+3 saves most things.
	if top_kind == "spell" and top_controller != player_key:
		var top_targets: Array = top.get("targets", [])
		if not top_targets.is_empty():
			var t: Dictionary = top_targets[0]
			if t.get("kind", "") == "creature":
				var target_iid: int = int(t.get("iid", -1))
				var tfound = state.find_instance(target_iid)
				if tfound != null and tfound.card != null \
						and tfound.controller.key == player_key:
					# It's one of our creatures being targeted — try to save it.
					var growth: CardInstance = _find_in_hand_by_id(state, player_key, "giant_growth")
					if growth != null and _can_cast_with_mana_search(state, player_key, growth):
						# We may need to tap a land for G first — return that
						# action, AI will resume next call.
						var tap_action: Dictionary = _find_mana_tap_for(state, player_key, "G")
						if not tap_action.is_empty() and not state.player_by_key(player_key).mana.can_pay(growth.template.mana_cost):
							return tap_action
						var gtarget := {"kind": "creature", "iid": target_iid}
						return Action.make_cast_spell(growth.instance_id, [gtarget])
	return {}


# Like _can_cast but allows tapping an unused land of the right color to make
# up the mana shortfall. Returns true if we COULD cast given one more tap.
static func _can_cast_with_mana_search(state: EngineState, player_key: String, card: CardInstance) -> bool:
	var p: Player = state.player_by_key(player_key)
	if p.mana.can_pay(card.template.mana_cost):
		return true
	# Try counting untapped land production by color.
	var cost: Dictionary = card.template.mana_cost
	for c in p.battlefield:
		if c.tapped or not c.is_land():
			continue
		if not (c.template is LandResource):
			continue
		# Crude: does any required color match a producible color?
		for color in c.template.mana_produced:
			if cost.get(color, 0) > p.mana.pool.get(color, 0):
				return true
			if cost.get("C", 0) > 0:
				return true
	return false


# Find an untapped land that produces `color` and return the activate_ability
# action. Empty dict if no such land.
static func _find_mana_tap_for(state: EngineState, player_key: String, color: String) -> Dictionary:
	for c in state.player_by_key(player_key).battlefield:
		if c.tapped or not c.is_land():
			continue
		if c.template is LandResource and color in c.template.mana_produced:
			return Action.make_activate_ability(c.instance_id)
	return {}


# ─── Main phase: play land, tap mana, cast best spell ─────────────────────
# Greedy curve-up: cast the highest-cost spell we can afford. If nothing
# castable, play a land (if we haven't this turn), tap mana abilities
# that haven't been used. Pass when nothing left.
static func _decide_main(state: EngineState, player_key: String) -> Dictionary:
	var p: Player = state.player_by_key(player_key)
	# 1. Play a land if we haven't yet this turn and one's in hand.
	if not p.land_played_this_turn:
		for card in p.hand:
			if card.is_land():
				return Action.make_play_land(card.instance_id)
	# 2. Try casting the best castable non-land spell.
	var best_castable: CardInstance = _best_castable_spell(state, player_key)
	if best_castable != null:
		# Targeted spells need a target picked — choose greedily.
		if best_castable.template is SpellResource and best_castable.template.requires_target:
			var target: Dictionary = _pick_spell_target(state, player_key, best_castable)
			if target.is_empty():
				# No legal target — skip this spell.
				pass
			else:
				return Action.make_cast_spell(best_castable.instance_id, [target])
		else:
			return Action.make_cast_spell(best_castable.instance_id, [])
	# 3. Tap a land if we have spells we COULD cast with more mana.
	for card in p.battlefield:
		if not card.is_land():
			continue
		if card.tapped:
			continue
		# Only tap if it would actually help — i.e., we have spells in hand we
		# couldn't cast yet. Phase 5c heuristic: always tap if we have ANY
		# uncast spell, since spare mana doesn't hurt.
		if _has_uncast_spell(state, player_key):
			return Action.make_activate_ability(card.instance_id)
	# Nothing to do.
	return {}


# Find the highest-cost spell in hand that we can pay for right now.
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


# Pick a target for a casting spell. Greedy: face damage to opp, otherwise
# best opp creature.
static func _pick_spell_target(state: EngineState, player_key: String, card: CardInstance) -> Dictionary:
	if not (card.template is SpellResource):
		return {}
	var spell: SpellResource = card.template
	var opp_key: String = state.opponent_of(player_key)
	match spell.target_filter:
		"creature_or_player", "any":
			# Prefer opp face (Lightning Bolt should usually go to face).
			return {"kind": "player", "who": opp_key}
		"creature":
			# Highest-value opposing creature.
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
			# Counterspell — target the top of stack if it's opp's.
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
	# Simple check: mana, phase, stack. Doesn't replicate full _legal_cast_spell
	# (which also checks specific target legality) — AI calls this before
	# choosing a target, so target check happens later. The engine's
	# is_legal_action will re-validate when we actually execute.
	var p: Player = state.player_by_key(player_key)
	if not p.mana.can_pay(card.template.mana_cost):
		return false
	if not card.template.has_type("instant"):
		# Sorcery-speed restrictions.
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
