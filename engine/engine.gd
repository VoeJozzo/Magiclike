extends Node

# Engine — central game-state authority. Autoloaded as `RulesEngine` (Godot has built-in `Engine`).
# Public API: init_phase{1,2,3}, state(), execute_action(action), is_legal_action(action).
# Signals: state_changed, log_appended, game_over.
# Action shapes in engine/action.gd. action.kind dispatches to _do_<kind>.
# Failed actions return false without mutating; successful actions emit state_changed.

signal state_changed
signal log_appended(line: String)
signal game_over(winner_key: String)

var _state: EngineState = null


func _ready() -> void:
	# Predicate validation at boot — catches typos in card resources.
	Predicates.validate_all_card_predicates(CardDatabase.all_resources())


# Reentrancy guard for opp-turn auto-cycle (Phase 2 has no AI).
var _settling: bool = false


func state() -> EngineState:
	return _state


# Seed buffer Mountains so legacy demo helpers don't deck out on first DRAW step.
func _seed_demo_library(player: Player, count: int = 20) -> void:
	for i in range(count):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), player.key)
		player.library.append(mtn)


# Phase 1: 2 Mountains in play, 1 Lightning Bolt in hand.
func init_phase1() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	for i in range(2):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), "you")
		mtn.summoning_sick = false
		_state.you.battlefield.append(mtn)
	var bolt := _state.make_instance(CardDatabase.get_card("lightning_bolt"), "you")
	_state.you.hand.append(bolt)

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
	_state.append_log("Phase 1 demo initialized: 2 Mountains, 1 Lightning Bolt in hand. Opp at 20.")
	state_changed.emit()


# Phase 2: 1 Mountain in play, 3 in hand + Goblin Raider + Lightning Bolt.
func init_phase2() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	var mtn0 := _state.make_instance(CardDatabase.get_card("mountain"), "you")
	mtn0.summoning_sick = false
	_state.you.battlefield.append(mtn0)
	for i in range(3):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), "you")
		_state.you.hand.append(mtn)
	var gob := _state.make_instance(CardDatabase.get_card("goblin_raider"), "you")
	_state.you.hand.append(gob)
	var bolt := _state.make_instance(CardDatabase.get_card("lightning_bolt"), "you")
	_state.you.hand.append(bolt)

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
	_state.append_log("Phase 2 demo: 1 Mountain in play, 3 in hand, plus Goblin Raider and Lightning Bolt. Opp at 20.")
	state_changed.emit()


# Phase 3: blockers + stack instants + basic opp behavior.
# You: 2 lands + hand with Goblin, Bolt, Giant Growth. Opp: 1 Forest + 2 Bears + Giant Growth.
func init_phase3() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	var mtn0 := _state.make_instance(CardDatabase.get_card("mountain"), "you")
	mtn0.summoning_sick = false
	_state.you.battlefield.append(mtn0)
	var fst0 := _state.make_instance(CardDatabase.get_card("forest"), "you")
	fst0.summoning_sick = false
	_state.you.battlefield.append(fst0)
	for i in range(2):
		_state.you.hand.append(_state.make_instance(CardDatabase.get_card("mountain"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("forest"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("goblin_raider"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("lightning_bolt"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("giant_growth"), "you"))

	var opp_fst := _state.make_instance(CardDatabase.get_card("forest"), "opp")
	opp_fst.summoning_sick = false
	_state.opp.battlefield.append(opp_fst)
	for i in range(2):
		var bear := _state.make_instance(CardDatabase.get_card("grizzly_bears"), "opp")
		bear.summoning_sick = false
		_state.opp.battlefield.append(bear)
	_state.opp.hand.append(_state.make_instance(CardDatabase.get_card("giant_growth"), "opp"))

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
	_state.append_log("Phase 3 demo: you have 2 lands in play + plenty of cards in hand. Opp has 1 Forest + 2 Grizzly Bears + Giant Growth.")
	state_changed.emit()


# Phase 4: triggered abilities. You: Pyromaniac (ETB→1), Bloodlust (death→+2 if life lost), Bolt.
# Opp: Grizzly Bears + Bolt for return-fire on the Berserker's death trigger.
func init_phase4() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	for i in range(3):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), "you")
		mtn.summoning_sick = false
		_state.you.battlefield.append(mtn)
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("pyromaniac"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("bloodlust_berserker"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("lightning_bolt"), "you"))

	var fst := _state.make_instance(CardDatabase.get_card("forest"), "opp")
	fst.summoning_sick = false
	_state.opp.battlefield.append(fst)
	var opp_mtn := _state.make_instance(CardDatabase.get_card("mountain"), "opp")
	opp_mtn.summoning_sick = false
	_state.opp.battlefield.append(opp_mtn)
	var bear := _state.make_instance(CardDatabase.get_card("grizzly_bears"), "opp")
	bear.summoning_sick = false
	_state.opp.battlefield.append(bear)
	_state.opp.hand.append(_state.make_instance(CardDatabase.get_card("lightning_bolt"), "opp"))

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
	_state.append_log("Phase 4 demo: triggered abilities. Cast Pyromaniac → ETB deals 1 to opp. Cast Bloodlust Berserker, then Bolt your own Berserker → death trigger checks 'opp lost life this turn' and fires +2 to opp.")
	state_changed.emit()


# ─── Real-game init from decklists ──────────────────────────────────────────
# init_game(decklist_you, decklist_opp) → MAIN1, hand drawn. Unknown card_ids skipped.
# No mulligan; player starts with whatever is shorter than hand_size.
const _PHASE4_5_DEMO_DECK := {
	"mountain": 10,
	"forest": 10,
	"lightning_bolt": 4,
	"goblin_raider": 4,
	"grizzly_bears": 4,
	"giant_growth": 3,
	"pyromaniac": 3,
	"bloodlust_berserker": 2,
}


# Multi-color showcase deck — exercises every Phase 4.5c/5a addition.
const _PHASE5_SHOWCASE_DECK := {
	"mountain": 4, "forest": 4, "island": 4, "plains": 3, "swamp": 3,
	"counterspell": 2,
	"healing_salve": 2,
	"wind_drake": 2,
	"giant_spider": 1,
	"serra_angel": 1,
	"trained_armodon": 1,
	"vampire_nighthawk": 1,
	"raging_goblin": 2,
	"walking_wall": 1,
	"pyromaniac": 1,
	"bloodlust_berserker": 1,
	"lightning_bolt": 2,
	"giant_growth": 2,
	"grizzly_bears": 1,
	"bear_cub": 1,
}


func init_phase4_5_demo() -> void:
	init_game(_PHASE4_5_DEMO_DECK, _PHASE4_5_DEMO_DECK)


func init_phase5_demo() -> void:
	init_game(_PHASE5_SHOWCASE_DECK, _PHASE5_SHOWCASE_DECK)


func init_game(you_decklist: Dictionary, opp_decklist: Dictionary, hand_size: int = 7) -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	_populate_library(_state.you, you_decklist)
	_populate_library(_state.opp, opp_decklist)
	_shuffle_library(_state.you)
	_shuffle_library(_state.opp)
	_draw_opening_hand(_state.you, hand_size)
	_draw_opening_hand(_state.opp, hand_size)

	_state.append_log("Game starts. You: %d-card deck. Opp: %d-card deck." % [
		_total_count(you_decklist), _total_count(opp_decklist),
	])
	state_changed.emit()


func _populate_library(player: Player, decklist: Dictionary) -> void:
	for card_id in decklist:
		var count: int = decklist[card_id]
		for i in range(count):
			var tmpl: CardResource = CardDatabase.get_card(card_id)
			if tmpl == null:
				continue
			var inst := _state.make_instance(tmpl, player.key)
			player.library.append(inst)


# Global-RNG shuffle (swap for seeded RandomNumberGenerator if replays needed).
func _shuffle_library(player: Player) -> void:
	player.library.shuffle()


# Sub-hand-size libraries get a partial hand, no deck-out loss.
func _draw_opening_hand(player: Player, hand_size: int) -> void:
	var to_draw: int = min(hand_size, player.library.size())
	for i in range(to_draw):
		var card: CardInstance = player.library.pop_back()
		player.hand.append(card)


func _total_count(decklist: Dictionary) -> int:
	var total: int = 0
	for k in decklist:
		total += decklist[k]
	return total


# ─── Action execution ──────────────────────────────────────────────────────

func execute_action(action: Dictionary) -> bool:
	if not is_legal_action(action):
		_state.append_log("Illegal action: %s" % action)
		return false

	var kind: String = action.get("kind", "")
	var ok: bool = false
	match kind:
		Action.KIND_ACTIVATE_ABILITY:
			ok = _do_activate_ability(action)
		Action.KIND_PLAY_LAND:
			ok = _do_play_land(action)
		Action.KIND_CAST_SPELL:
			ok = _do_cast_spell(action)
		Action.KIND_DECLARE_ATTACKER:
			ok = _do_declare_attacker(action)
		Action.KIND_DECLARE_BLOCKER:
			ok = _do_declare_blocker(action)
		Action.KIND_UNDECLARE_ATTACKER:
			ok = _do_undeclare_attacker(action)
		Action.KIND_UNDECLARE_BLOCKER:
			ok = _do_undeclare_blocker(action)
		Action.KIND_CONFIRM_BLOCKS:
			ok = _do_confirm_blocks(action)
		Action.KIND_PASS_PRIORITY:
			ok = _do_pass_priority(action)
		Action.KIND_PICK_TRIGGER_TARGET:
			ok = _do_pick_trigger_target(action)
		_:
			push_warning("execute_action: unknown kind '%s'" % kind)

	if ok:
		_settle_state()
		state_changed.emit()
	return ok


# Phase 5b: AI scoring. Thin wrapper around AIScoring.card_value so callers
# can stay on the autoload surface (mirrors JS prototype's ENGINE.getCardValue
# shape). Phase 5c's AI module will call this from its hand-evaluator.
func card_value(template: CardResource, purpose: String = "draft") -> float:
	return AIScoring.card_value(template, purpose)


# Every legal action descriptor for `player_key`. Casts fan out per target.
# Used by the AI module. Empty if no priority or game over.
func get_legal_actions(player_key: String) -> Array[Dictionary]:
	var actions: Array[Dictionary] = []
	if _state == null or _state.winner != "":
		return actions
	# Trigger-target mode is exclusive — only target picks are legal.
	if not _state.awaiting_target_for_trigger.is_empty() \
			and _state.awaiting_target_for_trigger.get("controller_key", "") == player_key:
		var filter: String = _state.awaiting_target_for_trigger.get("filter", "")
		for target in _enumerate_filter_targets(filter, player_key):
			actions.append(Action.make_pick_trigger_target(target))
		return actions
	# Need priority (exception: defender's COMBAT_BLOCK is a special action).
	var is_combat_block: bool = _state.phase_machine.current == PhaseMachine.Phase.COMBAT_BLOCK
	var is_defender: bool = player_key == _state.opponent_of(_state.active_player_key)
	if _state.priority_player_key != player_key and not (is_combat_block and is_defender):
		return actions
	if _state.priority_player_key == player_key:
		actions.append(Action.make_pass_priority())
	for card in _state.player_by_key(player_key).hand:
		if card.is_land():
			var play := Action.make_play_land(card.instance_id)
			if _legal_play_land(play):
				actions.append(play)
	for card in _state.player_by_key(player_key).battlefield:
		var ability := Action.make_activate_ability(card.instance_id)
		if _legal_activate_ability(ability):
			actions.append(ability)
	for card in _state.player_by_key(player_key).hand:
		if card.is_land():
			continue
		_enumerate_cast_actions(card, player_key, actions)
	if _state.phase_machine.current == PhaseMachine.Phase.COMBAT_ATTACK \
			and player_key == _state.active_player_key:
		for card in _state.player_by_key(player_key).battlefield:
			var atk := Action.make_declare_attacker(card.instance_id)
			if _legal_declare_attacker(atk):
				actions.append(atk)
	if is_combat_block and is_defender:
		for blocker in _state.player_by_key(player_key).battlefield:
			for attacker_iid in _state.attackers:
				var blk := Action.make_declare_blocker(blocker.instance_id, attacker_iid)
				if _legal_declare_blocker(blk):
					actions.append(blk)
	return actions


# One descriptor per legal target. Multi-target spells deferred to Phase 6+.
func _enumerate_cast_actions(card: CardInstance, player_key: String, out: Array[Dictionary]) -> void:
	if not (card.template is SpellResource):
		var cast := Action.make_cast_spell(card.instance_id, [])
		if _legal_cast_spell(cast):
			out.append(cast)
		return
	var spell: SpellResource = card.template
	if not spell.requires_target:
		var cast := Action.make_cast_spell(card.instance_id, [])
		if _legal_cast_spell(cast):
			out.append(cast)
		return
	for target in _enumerate_filter_targets(spell.target_filter, player_key):
		var cast := Action.make_cast_spell(card.instance_id, [target])
		if _legal_cast_spell(cast):
			out.append(cast)


# Legal targets matching `filter`. picker_key drives hexproof check.
func _enumerate_filter_targets(filter: String, picker_key: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	match filter:
		"any", "creature_or_player":
			out.append({"kind": "player", "who": "you"})
			out.append({"kind": "player", "who": "opp"})
			for p in [_state.you, _state.opp]:
				for c in p.battlefield:
					if c.template is CreatureResource:
						if c.has_keyword("hexproof") and c.controller_key != picker_key:
							continue
						out.append({"kind": "creature", "iid": c.instance_id})
		"creature":
			for p in [_state.you, _state.opp]:
				for c in p.battlefield:
					if c.template is CreatureResource:
						if c.has_keyword("hexproof") and c.controller_key != picker_key:
							continue
						out.append({"kind": "creature", "iid": c.instance_id})
		"player":
			out.append({"kind": "player", "who": "you"})
			out.append({"kind": "player", "who": "opp"})
		"spell":
			for entry in _state.stack.entries:
				if entry.get("kind", "spell") == "spell":
					out.append({"kind": "stack", "iid": entry.get("source_iid", -1)})
		_:
			pass  # unknown filter → empty list
	return out


func is_legal_action(action: Dictionary) -> bool:
	var kind: String = action.get("kind", "")
	match kind:
		Action.KIND_PASS_PRIORITY:
			# Illegal when awaiting block declaration (priority is "" — defender must CONFIRM_BLOCKS first).
			return _state != null and _state.winner == "" \
				and _state.priority_player_key != ""
		Action.KIND_ACTIVATE_ABILITY:
			return _legal_activate_ability(action)
		Action.KIND_PLAY_LAND:
			return _legal_play_land(action)
		Action.KIND_CAST_SPELL:
			return _legal_cast_spell(action)
		Action.KIND_DECLARE_ATTACKER:
			return _legal_declare_attacker(action)
		Action.KIND_DECLARE_BLOCKER:
			return _legal_declare_blocker(action)
		Action.KIND_UNDECLARE_ATTACKER:
			return _legal_undeclare_attacker(action)
		Action.KIND_UNDECLARE_BLOCKER:
			return _legal_undeclare_blocker(action)
		Action.KIND_CONFIRM_BLOCKS:
			return _legal_confirm_blocks(action)
		Action.KIND_PICK_TRIGGER_TARGET:
			return _legal_pick_trigger_target(action)
		_:
			return false


# Settle after each action — auto-cycles opp's turn (no AI yet).
func _settle_state() -> void:
	if _settling:
		return
	_settling = true
	# AI drives opp's turn + opp's blocks on player's turn. Stops when actor → "you".
	var safety: int = 200
	while _state.winner == "" and safety > 0:
		safety -= 1
		var actor: String = _current_actor()
		if actor == "you":
			break
		var action: Dictionary = AI.decide(_state, "opp")
		if action.is_empty():
			action = Action.make_pass_priority()
		_dispatch_action(action)
	if safety == 0:
		push_warning("_settle_state: hit iteration cap; possible infinite loop or AI livelock")
	_settling = false


# Order: pending trigger-target controller → awaiting-block-declaration defender → priority holder.
func _current_actor() -> String:
	if not _state.awaiting_target_for_trigger.is_empty():
		return _state.awaiting_target_for_trigger.get("controller_key", _state.priority_player_key)
	if _state.awaiting_block_declaration:
		return _state.opponent_of(_state.active_player_key)
	return _state.priority_player_key


# Loop AI block declarations at COMBAT_BLOCK entry. Skips _dispatch_action since
# priority doesn't match yet (we apply blocks directly).
func _drive_ai_block_declarations(defender_key: String) -> void:
	var safety: int = 50
	while safety > 0:
		safety -= 1
		var action: Dictionary = AI.decide(_state, defender_key)
		if action.is_empty() or action.get("kind", "") != Action.KIND_DECLARE_BLOCKER:
			break
		if _legal_declare_blocker(action):
			_do_declare_blocker(action)
		else:
			break


# Like execute_action but skips settle (caller is already settling).
func _dispatch_action(action: Dictionary) -> bool:
	if not is_legal_action(action):
		_state.append_log("AI illegal action: %s" % action)
		return false
	var kind: String = action.get("kind", "")
	match kind:
		Action.KIND_ACTIVATE_ABILITY:
			return _do_activate_ability(action)
		Action.KIND_PLAY_LAND:
			return _do_play_land(action)
		Action.KIND_CAST_SPELL:
			return _do_cast_spell(action)
		Action.KIND_DECLARE_ATTACKER:
			return _do_declare_attacker(action)
		Action.KIND_DECLARE_BLOCKER:
			return _do_declare_blocker(action)
		Action.KIND_UNDECLARE_ATTACKER:
			return _do_undeclare_attacker(action)
		Action.KIND_UNDECLARE_BLOCKER:
			return _do_undeclare_blocker(action)
		Action.KIND_CONFIRM_BLOCKS:
			return _do_confirm_blocks(action)
		Action.KIND_PASS_PRIORITY:
			return _do_pass_priority(action)
		Action.KIND_PICK_TRIGGER_TARGET:
			return _do_pick_trigger_target(action)
	push_warning("_dispatch_action: unknown kind '%s'" % kind)
	return false


# Phase 1: only mana abilities (tap land).
func _legal_activate_ability(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	var iid: int = action.get("source_iid", -1)
	var found = _state.find_instance(iid)
	if found == null:
		return false
	var card: CardInstance = found.card
	if card == null or not card.is_land():
		return false
	if found.controller.key != _state.priority_player_key:
		return false
	if card.tapped:
		return false
	if not (card.template is LandResource):
		return false
	var produced: Array = card.template.mana_produced
	if produced.is_empty():
		return false
	return true


func _do_activate_ability(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	var controller: Player = found.controller
	card.tapped = true
	# Multi-color lands are Phase 2+; for now first produced color.
	var color: String = card.template.mana_produced[0]
	var ctx := _build_ctx(controller, card, [])
	Effects.resolve_one({"kind": "add_mana", "amounts": {color: 1}}, ctx)
	# Mana abilities retain priority.
	return true


# Lands skip the stack — hand → battlefield, untapped, no sickness.
func _legal_play_land(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	var iid: int = action.get("source_iid", -1)
	var found = _state.find_instance(iid)
	if found == null:
		return false
	var card: CardInstance = found.card
	if card == null or not card.is_land() or found.zone_name != "hand":
		return false
	if found.controller.key != _state.priority_player_key:
		return false
	if found.controller.key != _state.active_player_key:
		return false
	if not _state.phase_machine.is_main_phase():
		return false
	if not _state.stack.is_empty():
		return false
	if found.controller.land_played_this_turn:
		return false
	return true


func _do_play_land(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	var controller: Player = found.controller
	controller.hand.erase(card)
	controller.battlefield.append(card)
	controller.land_played_this_turn = true
	card.summoning_sick = false
	_state.append_log("%s plays %s" % [controller.name, card.name()])
	# Lands ETB fires triggers in Phase 4+. Lands themselves don't have
	# triggered abilities yet, but a landfall card on the battlefield could
	# react. Fire the event and drain in case anything matches.
	_fire_event({"kind": "card_etb", "subject_iid": card.instance_id, "subject_card": card})
	_drain_pending_triggers()
	return true


func _legal_cast_spell(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	var iid: int = action.get("source_iid", -1)
	var found = _state.find_instance(iid)
	if found == null:
		return false
	var card: CardInstance = found.card
	if card == null or found.zone_name != "hand":
		return false
	if found.controller.key != _state.priority_player_key:
		return false
	# Non-instants are sorcery-speed: own main phase, empty stack.
	if not card.template.has_type("instant"):
		var is_active = (found.controller.key == _state.active_player_key)
		var is_main = _state.phase_machine.is_main_phase()
		var stack_empty = _state.stack.is_empty()
		if not (is_active and is_main and stack_empty):
			return false
	if not found.controller.mana.can_pay(card.template.mana_cost):
		return false
	if card.template is SpellResource and card.template.requires_target:
		var targets: Array = action.get("targets", [])
		if targets.is_empty():
			return false
		# Phase 5a: hexproof gates opponent-cast targets. A creature with
		# hexproof can't be targeted by spells controlled by an opposing
		# player. (Your own spells can still target it.)
		for t in targets:
			if t.get("kind", "") == "creature":
				var tfound = _state.find_instance(t.get("iid", -1))
				if tfound != null and tfound.card != null \
						and tfound.card.has_keyword("hexproof") \
						and tfound.controller.key != found.controller.key:
					return false
	return true


func _do_cast_spell(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	var controller: Player = found.controller
	var targets: Array = action.get("targets", [])

	if not controller.mana.pay(card.template.mana_cost):
		_state.append_log("ERROR: cast_spell pay() failed after legality check")
		return false

	controller.hand.erase(card)
	_state.stack.push({
		"kind": "spell",
		"source_iid": card.instance_id,
		"controller_key": controller.key,
		"targets": targets,
	})
	_state.append_log("%s casts %s%s" % [
		controller.name,
		card.name(),
		"" if targets.is_empty() else " targeting " + _describe_targets(targets),
	])
	# MTG 117.1c: caster retains priority (not active player — would break opp instants).
	_state.priority_player_key = controller.key
	_reset_priority_passes()

	# Held off-zone keyed by iid; routed to graveyard on resolution.
	_stack_held_cards[card.instance_id] = card
	return true


func _do_pass_priority(_action: Dictionary) -> bool:
	_state.priority_passed[_state.priority_player_key] = true

	if _state.priority_passed["you"] and _state.priority_passed["opp"]:
		if not _state.stack.is_empty():
			_resolve_top_of_stack()
			_state.priority_player_key = _state.active_player_key
			_reset_priority_passes()
		else:
			_advance_phase()
	else:
		# Hand priority; _settle_state's AI driver picks it up on next iteration.
		_state.priority_player_key = _state.opponent_of(_state.priority_player_key)
	return true


# Stack-held instances (off any zone) keyed by iid.
var _stack_held_cards: Dictionary = {}


func _resolve_top_of_stack() -> void:
	var entry = _state.stack.pop_top()
	if entry == null:
		return
	var kind: String = entry.get("kind", "spell")
	if kind == "trigger":
		_resolve_trigger_entry(entry)
	else:
		_resolve_spell_entry(entry)


func _resolve_spell_entry(entry: Dictionary) -> void:
	var iid: int = entry.source_iid
	var controller_key: String = entry.controller_key
	var controller: Player = _state.player_by_key(controller_key)
	var card: CardInstance = _stack_held_cards.get(iid)
	if card == null:
		_state.append_log("ERROR: stack entry iid=%d has no held card" % iid)
		return
	var ctx := _build_ctx(controller, card, entry.get("targets", []))
	var effects: Array = card.template.on_cast_effects
	if not effects.is_empty():
		Effects.resolve_list(effects, ctx)
	# Permanents → battlefield; instants/sorceries → owner graveyard.
	if card.template.is_permanent():
		controller.battlefield.append(card)
		card.controller_key = controller.key
		if card.template is CreatureResource:
			card.summoning_sick = true
		else:
			card.summoning_sick = false
		_state.append_log("%s enters the battlefield under %s" % [card.name(), controller.name])
		# Fire ETB event so triggered abilities can react.
		_fire_event({"kind": "card_etb", "subject_iid": card.instance_id, "subject_card": card})
	else:
		var owner: Player = _state.player_by_key(card.owner_key)
		owner.graveyard.append(card)
		_state.append_log("%s resolves" % card.name())
	_stack_held_cards.erase(iid)
	_run_sbas()
	_drain_pending_triggers()
	_check_win_conditions()


# Source may be in any zone (death triggers fire from graveyard).
func _resolve_trigger_entry(entry: Dictionary) -> void:
	var iid: int = entry.source_iid
	var controller_key: String = entry.controller_key
	var controller: Player = _state.player_by_key(controller_key)
	var ability_index: int = entry.get("ability_index", 0)
	var source: CardInstance = _find_card_anywhere(iid)
	if source == null or source.template == null:
		_state.append_log("Trigger fizzles: source card missing")
		return
	var abilities: Array = source.template.triggered_abilities
	if ability_index < 0 or ability_index >= abilities.size():
		_state.append_log("Trigger fizzles: ability_index out of range")
		return
	var trig: Dictionary = abilities[ability_index]
	var ctx := _build_ctx(controller, source, entry.get("targets", []))
	_state.append_log("%s's triggered ability resolves" % source.name())
	var effects: Array = trig.get("effects", [])
	if not effects.is_empty():
		Effects.resolve_list(effects, ctx)
	_run_sbas()
	_drain_pending_triggers()
	_check_win_conditions()


# Scan zones + stack-held buffer (death-trigger sources may already be in graveyard).
func _find_card_anywhere(iid: int) -> CardInstance:
	var found = _state.find_instance(iid)
	if found != null and found.card != null:
		return found.card
	if _stack_held_cards.has(iid):
		return _stack_held_cards[iid]
	return null


# Phase 2 incremental attacker declaration (click + Pass to confirm).
func _legal_declare_attacker(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_ATTACK:
		return false
	if _state.priority_player_key != _state.active_player_key:
		return false
	var iid: int = action.get("source_iid", -1)
	if iid in _state.attackers:
		return false
	var found = _state.find_instance(iid)
	if found == null or found.card == null:
		return false
	var card: CardInstance = found.card
	if found.controller.key != _state.active_player_key:
		return false
	if found.zone_name != "battlefield":
		return false
	if not (card.template is CreatureResource):
		return false
	if card.tapped:
		return false
	# Haste bypasses summoning sickness; defender forbids attacks entirely.
	if card.summoning_sick and not card.has_keyword("haste"):
		return false
	if card.has_keyword("defender"):
		return false
	return true


func _do_declare_attacker(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	if not card.has_keyword("vigilance"):
		card.tapped = true
	_state.attackers.append(iid)
	_state.append_log("%s attacks" % card.name())
	return true


# Special action — happens at COMBAT_BLOCK start before priority opens.
func _legal_declare_blocker(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_BLOCK:
		return false
	var defending_key: String = _state.opponent_of(_state.active_player_key)
	var blocker_iid: int = action.get("source_iid", -1)
	var attacker_iid: int = action.get("attacker_iid", -1)
	if _state.blockers.has(blocker_iid):
		return false
	var found = _state.find_instance(blocker_iid)
	if found == null or found.card == null:
		return false
	var blocker: CardInstance = found.card
	if found.controller.key != defending_key:
		return false
	if found.zone_name != "battlefield":
		return false
	if not (blocker.template is CreatureResource):
		return false
	if blocker.tapped:
		return false
	if not (attacker_iid in _state.attackers):
		return false
	var attacker_found = _state.find_instance(attacker_iid)
	if attacker_found == null or attacker_found.card == null:
		return false
	var attacker: CardInstance = attacker_found.card
	if attacker.has_keyword("unblockable"):
		return false
	if attacker.has_keyword("flying") \
			and not blocker.has_keyword("flying") \
			and not blocker.has_keyword("reach"):
		return false
	# Menace's ≥2 requirement is validated at damage resolution (single blocker → unblocked).
	return true


func _do_declare_blocker(action: Dictionary) -> bool:
	var blocker_iid: int = action.source_iid
	var attacker_iid: int = action.attacker_iid
	_state.blockers[blocker_iid] = attacker_iid
	var blocker_found = _state.find_instance(blocker_iid)
	var attacker_found = _state.find_instance(attacker_iid)
	if blocker_found != null and attacker_found != null:
		var b: CardInstance = blocker_found.card
		var a: CardInstance = attacker_found.card
		b.blocking_iid = attacker_iid
		_state.append_log("%s blocks %s" % [b.name(), a.name()])
	return true


# Reverse declare_attacker/blocker so player can undo before phase advances.

func _legal_undeclare_attacker(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_ATTACK:
		return false
	if _state.priority_player_key != _state.active_player_key:
		return false
	var iid: int = action.get("source_iid", -1)
	if not (iid in _state.attackers):
		return false
	# Must belong to the active player (the attacker).
	var found = _state.find_instance(iid)
	if found == null or found.controller.key != _state.active_player_key:
		return false
	return true


func _do_undeclare_attacker(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	_state.attackers.erase(iid)
	# Clear any blockers that were pointing at this attacker.
	for b_iid in _state.blockers.keys():
		if _state.blockers[b_iid] == iid:
			_state.blockers.erase(b_iid)
			var b_found = _state.find_instance(b_iid)
			if b_found != null and b_found.card != null:
				b_found.card.blocking_iid = -1
	var found = _state.find_instance(iid)
	if found != null and found.card != null:
		var card: CardInstance = found.card
		card.attacking = false
		# Untap unless vigilance (vigilance never tapped in the first place,
		# but untapping a vigilance creature is a no-op so this is harmless).
		if not card.has_keyword("vigilance"):
			card.tapped = false
		_state.append_log("%s no longer attacks" % card.name())
	return true


func _legal_undeclare_blocker(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_BLOCK:
		return false
	var iid: int = action.get("source_iid", -1)
	if not _state.blockers.has(iid):
		return false
	# Must be the defender's creature.
	var defending_key: String = _state.opponent_of(_state.active_player_key)
	var found = _state.find_instance(iid)
	if found == null or found.controller.key != defending_key:
		return false
	return true


func _do_undeclare_blocker(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	_state.blockers.erase(iid)
	var found = _state.find_instance(iid)
	if found != null and found.card != null:
		found.card.blocking_iid = -1
		_state.append_log("%s no longer blocks" % found.card.name())
	return true


# Defender signals "done blocking" → opens APNAP priority (active player first).
func _legal_confirm_blocks(_action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if not _state.awaiting_block_declaration:
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_BLOCK:
		return false
	return true


func _do_confirm_blocks(_action: Dictionary) -> bool:
	_state.awaiting_block_declaration = false
	# MTG 117.1b: AP gets priority first.
	_state.priority_player_key = _state.active_player_key
	_reset_priority_passes()
	_state.append_log("Blocks confirmed — %s gets priority" % _state.active_player().name)
	return true


# SBAs: move dead creatures to graveyard, clear combat refs. Loops for cascade kills.
func _run_sbas() -> void:
	var changed := false
	var safety := 20
	while safety > 0:
		safety -= 1
		var any_died := false
		for player in [_state.you, _state.opp]:
			var dying: Array = []
			for c in player.battlefield:
				if not (c.template is CreatureResource):
					continue
				# Indestructible ignores lethal damage but 0 toughness still kills.
				if c.has_keyword("indestructible"):
					if c.current_toughness() <= 0:
						dying.append(c)
					continue
				if c.current_toughness() <= 0 \
						or c.damage_marked >= c.current_toughness() \
						or c.lethal_marked:
					dying.append(c)
			for c in dying:
				player.battlefield.erase(c)
				player.graveyard.append(c)
				_state.append_log("%s dies" % c.name())
				_clear_combat_state_for_dead(c.instance_id)
				# Pass subject_card — death triggers fire from graveyard.
				_fire_event({
					"kind": "card_dies",
					"subject_iid": c.instance_id,
					"subject_card": c,
					"from_zone": "battlefield",
				})
				any_died = true
		if not any_died:
			break
		changed = true
	if changed:
		_check_win_conditions()


# Clear dead iid from attackers/blockers maps (both as blocker and as blocked target).
func _clear_combat_state_for_dead(dead_iid: int) -> void:
	if dead_iid in _state.attackers:
		_state.attackers.erase(dead_iid)
	_state.blockers.erase(dead_iid)
	for b_iid in _state.blockers.keys():
		if _state.blockers[b_iid] == dead_iid:
			_state.blockers.erase(b_iid)


# Two-pass damage (first_strike pass 1, rest pass 2). Keywords: first_strike, lifelink,
# deathtouch, trample, indestructible, menace (needs ≥2 blockers else unblocked).
# Unblockable/flying enforced at _legal_declare_blocker. SBAs sweep between passes.
func _resolve_combat_damage() -> void:
	if _state.attackers.is_empty():
		return
	var defending: Player = _state.player_by_key(_state.opponent_of(_state.active_player_key))

	# attacker → blockers map. Menace + <2 blockers collapses to unblocked.
	var attacker_blockers: Dictionary = {}
	for atk_iid in _state.attackers:
		attacker_blockers[atk_iid] = []
	for blk_iid in _state.blockers:
		var atk_iid: int = _state.blockers[blk_iid]
		if attacker_blockers.has(atk_iid):
			attacker_blockers[atk_iid].append(blk_iid)
	# Menace: collapse single-blocker assignments back to "unblocked".
	for atk_iid in _state.attackers:
		var atk_found = _state.find_instance(atk_iid)
		if atk_found == null or atk_found.card == null:
			continue
		var attacker: CardInstance = atk_found.card
		if attacker.has_keyword("menace") and attacker_blockers[atk_iid].size() < 2:
			if attacker_blockers[atk_iid].size() == 1:
				_state.append_log("%s has menace — single blocker is illegal, ignored" % attacker.name())
			attacker_blockers[atk_iid] = []

	var need_first_strike: bool = _combat_needs_first_strike_step(attacker_blockers)

	if need_first_strike:
		_combat_damage_pass(defending, attacker_blockers, true)
		_run_sbas()
		_drain_pending_triggers()  # death triggers from first-strike pass
		_check_win_conditions()
		if _state.winner != "":
			return
	# Pass 2: non-first-strikers (and any survivors of pass 1; no double-strike in Phase 5a).
	_combat_damage_pass(defending, attacker_blockers, false)
	_run_sbas()
	# Drain death triggers HERE so they don't leak into an unrelated next spell.
	_drain_pending_triggers()
	_check_win_conditions()


# Returns true if any current attacker or assigned blocker has first_strike.
func _combat_needs_first_strike_step(attacker_blockers: Dictionary) -> bool:
	for atk_iid in attacker_blockers:
		var atk_found = _state.find_instance(atk_iid)
		if atk_found != null and atk_found.card != null \
				and atk_found.card.has_keyword("first_strike"):
			return true
		for b_iid in attacker_blockers[atk_iid]:
			var b_found = _state.find_instance(b_iid)
			if b_found != null and b_found.card != null \
					and b_found.card.has_keyword("first_strike"):
				return true
	return false


# One damage pass; first_strike_only=true → pass 1, false → pass 2.
func _combat_damage_pass(
	defending: Player,
	attacker_blockers: Dictionary,
	first_strike_only: bool
) -> void:
	for atk_iid in _state.attackers:
		var atk_found = _state.find_instance(atk_iid)
		if atk_found == null or atk_found.card == null:
			continue
		if atk_found.zone_name != "battlefield":
			continue
		var attacker: CardInstance = atk_found.card
		var atk_first_strike: bool = attacker.has_keyword("first_strike")
		# Pass 1: first-strikers only. (Non-first-strike still process blockers below,
		# since a first-strike BLOCKER could damage them in pass 1.)
		if first_strike_only != atk_first_strike:
			pass
		var atk_pow: int = attacker.current_power()
		var blockers: Array = attacker_blockers.get(atk_iid, [])

		if blockers.is_empty():
			if first_strike_only == atk_first_strike:
				_deal_combat_damage(attacker, atk_pow, _damage_target_player(defending))
		else:
			# Attacker → first blocker only (dump on slot 0); blockers → attacker.
			if first_strike_only == atk_first_strike:
				var first_blocker_iid: int = blockers[0]
				var first_blocker_found = _state.find_instance(first_blocker_iid)
				if first_blocker_found != null and first_blocker_found.card != null \
						and first_blocker_found.zone_name == "battlefield":
					var first_blocker: CardInstance = first_blocker_found.card
					var blocker_t: int = first_blocker.current_toughness() - first_blocker.damage_marked
					var assigned: int = min(atk_pow, blocker_t) if attacker.has_keyword("trample") else atk_pow
					# Deal assigned damage to blocker.
					_deal_combat_damage(attacker, assigned, {"kind": "creature", "iid": first_blocker_iid})
					# Trample spill: any leftover goes to defender.
					if attacker.has_keyword("trample"):
						var spill: int = atk_pow - assigned
						if spill > 0:
							_deal_combat_damage(attacker, spill, _damage_target_player(defending))
			# Blockers → attacker (each blocker's pass).
			for b_iid in blockers:
				var b_found = _state.find_instance(b_iid)
				if b_found == null or b_found.card == null:
					continue
				if b_found.zone_name != "battlefield":
					continue
				var blocker: CardInstance = b_found.card
				var b_first_strike: bool = blocker.has_keyword("first_strike")
				if first_strike_only != b_first_strike:
					continue
				_deal_combat_damage(blocker, blocker.current_power(), {"kind": "creature", "iid": atk_iid})


# Apply `amount` damage to `target` from `source`. Centralises lifelink and
# deathtouch handling so every combat damage assignment routes through here.
# target shape: {"kind": "player", "who": "..."} or {"kind": "creature", "iid": int}
func _deal_combat_damage(source: CardInstance, amount: int, target: Dictionary) -> void:
	if amount <= 0:
		return
	match target.get("kind", ""):
		"player":
			var p: Player = _state.player_by_key(target.who)
			if p == null:
				return
			p.life -= amount
			p.life_lost_this_turn += amount
			_state.append_log("%s deals %d to %s (life: %d)" % [
				source.name(), amount, p.name, p.life,
			])
		"creature":
			var found = _state.find_instance(target.iid)
			if found == null or found.card == null or found.zone_name != "battlefield":
				return
			var target_card: CardInstance = found.card
			target_card.damage_marked += amount
			if source.has_keyword("deathtouch"):
				target_card.lethal_marked = true
			_state.append_log("%s deals %d to %s%s" % [
				source.name(), amount, target_card.name(),
				" (deathtouch)" if source.has_keyword("deathtouch") else "",
			])
	# Lifelink — source's controller gains life equal to damage dealt.
	if source.has_keyword("lifelink"):
		var controller: Player = _state.player_by_key(source.controller_key)
		if controller != null:
			controller.life += amount
			_state.append_log("%s lifelink: %s gains %d (life: %d)" % [
				source.name(), controller.name, amount, controller.life,
			])


# Build a "player target" descriptor referring to the defending player.
func _damage_target_player(defending: Player) -> Dictionary:
	return {"kind": "player", "who": defending.key}


# ─── Phase machine ─────────────────────────────────────────────────────────

func _advance_phase() -> void:
	# MTG 106.4: mana empties at end of each step/phase.
	if _state.you.mana.total() > 0:
		_state.you.mana.clear()
	if _state.opp.mana.total() > 0:
		_state.opp.mana.clear()

	var wrapped: bool = _state.phase_machine.advance()
	if wrapped:
		_state.active_player_key = _state.opponent_of(_state.active_player_key)
		_state.turn += 1
		_state.append_log("Turn %d — active: %s" % [_state.turn, _state.active_player().name])

	match _state.phase_machine.current:
		PhaseMachine.Phase.UNTAP:
			_state.active_player().untap_step()
		PhaseMachine.Phase.DRAW:
			# MTG 704.5b: empty-library draw = loss.
			_do_draw_card(_state.active_player_key)
		PhaseMachine.Phase.COMBAT_ATTACK:
			pass
		PhaseMachine.Phase.COMBAT_BLOCK:
			# Block declaration is turn-based — runs BEFORE priority opens.
			# AI defender: drive sync; human: flag stays until KIND_CONFIRM_BLOCKS.
			if not _state.attackers.is_empty():
				_state.awaiting_block_declaration = true
				if _state.active_player_key == "you":
					_drive_ai_block_declarations("opp")
					_state.awaiting_block_declaration = false
		PhaseMachine.Phase.COMBAT_DAMAGE:
			_resolve_combat_damage()
		PhaseMachine.Phase.CLEANUP:
			_state.attackers.clear()
			_state.blockers.clear()
			for player in [_state.you, _state.opp]:
				for c in player.battlefield:
					if c.template is CreatureResource:
						c.clear_eot_modifiers()

	# MTG 117.1b: AP priority on phase start. Exception: awaiting_block_declaration → "" sentinel.
	if _state.awaiting_block_declaration:
		_state.priority_player_key = ""
	else:
		_state.priority_player_key = _state.active_player_key
	_reset_priority_passes()
	_state.append_log("Phase: %s" % _state.phase_machine.phase_name())


func _reset_priority_passes() -> void:
	_state.priority_passed = {"you": false, "opp": false}


# ─── Helpers ───────────────────────────────────────────────────────────────

func _build_ctx(controller: Player, source: CardInstance, targets: Array) -> Dictionary:
	return {
		"controller": controller,
		"source": source,
		"source_name": source.name() if source != null else "?",
		"source_iid": source.instance_id if source != null else -1,
		"state": _state,
		"targets": targets,
		"log": _state.log,
	}


func _describe_targets(targets: Array) -> String:
	var parts: Array[String] = []
	for t in targets:
		match t.get("kind", ""):
			"player":
				parts.append(t.get("who", "?"))
			"creature":
				parts.append("creature#%d" % t.get("iid", -1))
			_:
				parts.append("?")
	return ", ".join(parts)


func _check_win_conditions() -> void:
	if _state.winner != "":
		return
	for p in [_state.you, _state.opp]:
		if p.life <= 0:
			_state.winner = _state.opponent_of(p.key)
			_state.append_log("Game over — %s wins" % _state.player_by_key(_state.winner).name)
			game_over.emit(_state.winner)
			return


# Counter a stack spell → owner's graveyard. False if iid not on stack (target gone).
# Public so counter_spell.gd can call; autoload owns _stack_held_cards.
func counter_stack_entry(iid: int) -> bool:
	var idx: int = -1
	for i in range(_state.stack.entries.size()):
		if _state.stack.entries[i].get("source_iid", -1) == iid:
			idx = i
			break
	if idx == -1:
		return false
	var entry: Dictionary = _state.stack.entries[idx]
	# Only spells (triggers aren't counterable per MTG; no Stifle in pool).
	if entry.get("kind", "spell") != "spell":
		return false
	_state.stack.entries.remove_at(idx)
	# Countered spells go to graveyard, never battlefield.
	var card: CardInstance = _stack_held_cards.get(iid)
	if card != null:
		var owner: Player = _state.player_by_key(card.owner_key)
		if owner != null:
			owner.graveyard.append(card)
		_stack_held_cards.erase(iid)
	return true


# DRAW step — empty library → loss (MTG 704.5b).
func _do_draw_card(player_key: String) -> void:
	if _state.winner != "":
		return
	var p: Player = _state.player_by_key(player_key)
	if p == null:
		push_warning("_do_draw_card: unknown player_key '%s'" % player_key)
		return
	if p.library.is_empty():
		_state.winner = _state.opponent_of(player_key)
		_state.append_log("%s tried to draw from an empty library — %s wins!" % [
			p.name, _state.player_by_key(_state.winner).name,
		])
		game_over.emit(_state.winner)
		return
	var card: CardInstance = p.library.pop_back()
	p.hand.append(card)
	_state.append_log("%s draws a card" % p.name)


# Queue triggered abilities into _state.pending_triggers. They go on the stack
# only via _drain_pending_triggers (MTG 603.2 — wait until next priority).
# event = {kind, subject_iid, subject_card, ...event-specific fields}.
func _fire_event(event: Dictionary) -> void:
	var event_kind: String = event.get("kind", "")
	if event_kind == "":
		push_warning("_fire_event: event has no 'kind'; ignoring")
		return
	var subject_iid: int = event.get("subject_iid", -1)
	# Listeners = battlefield + event subject (for leaves-play triggers on the dead source).
	var listeners: Array[CardInstance] = []
	for p in [_state.you, _state.opp]:
		for c in p.battlefield:
			listeners.append(c)
	var subject_card = event.get("subject_card", null)
	if subject_card != null and subject_card is CardInstance and not listeners.has(subject_card):
		listeners.append(subject_card)

	for source in listeners:
		if source == null or source.template == null:
			continue
		var abilities: Array = source.template.triggered_abilities
		for i in range(abilities.size()):
			var trig: Dictionary = abilities[i]
			if trig.get("event", "") != event_kind:
				continue
			# self_only: source IS event subject ("When ~ enters/dies").
			if trig.get("self_only", false) and source.instance_id != subject_iid:
				continue
			var pred: String = trig.get("condition_predicate", "")
			if not Predicates.evaluate(pred, _state, source, event):
				_state.append_log("Trigger condition false for %s — skipping" % source.name())
				continue
			# Phase 4: no chosen targets (effects use hardcoded specs).
			_state.pending_triggers.append({
				"source_iid": source.instance_id,
				"controller_key": source.controller_key,
				"ability_index": i,
				"event": event.duplicate(),
				"targets": [],
			})
			_state.append_log("Trigger queued: %s (%s)" % [source.name(), event_kind])


# MTG 603.3b APNAP order: AP first (bottom of batch), NAP on top (resolves first LIFO).
# Phase 4 simplification: queue order within each player.
func _legal_pick_trigger_target(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.awaiting_target_for_trigger.is_empty():
		return false
	var target: Dictionary = action.get("target", {})
	if target.is_empty():
		return false
	return _target_matches_filter(target, _state.awaiting_target_for_trigger.filter)


# filter: "creature_or_player"|"creature"|"player".
func _target_matches_filter(target: Dictionary, filter: String) -> bool:
	var kind: String = target.get("kind", "")
	match filter:
		"creature_or_player":
			if kind == "player":
				return target.get("who", "") in ["you", "opp"]
			if kind == "creature":
				var iid: int = target.get("iid", -1)
				var found = _state.find_instance(iid)
				return found != null and found.card != null \
					and found.card.template is CreatureResource \
					and found.zone_name == "battlefield"
			return false
		"creature":
			if kind != "creature":
				return false
			var iid: int = target.get("iid", -1)
			var found = _state.find_instance(iid)
			return found != null and found.card != null \
				and found.card.template is CreatureResource \
				and found.zone_name == "battlefield"
		"player":
			return kind == "player" and target.get("who", "") in ["you", "opp"]
		_:
			return false


func _do_pick_trigger_target(action: Dictionary) -> bool:
	var target: Dictionary = action.target
	# Head of pending_triggers is the paused one; fill its target and resume.
	if _state.pending_triggers.is_empty():
		push_warning("_do_pick_trigger_target: no pending trigger to fill")
		return false
	var trig: Dictionary = _state.pending_triggers[0]
	trig.targets = [target]
	_state.awaiting_target_for_trigger = {}
	var src: CardInstance = _find_card_anywhere(trig.source_iid)
	var src_name: String = src.name() if src != null else "?"
	_state.append_log("%s targets %s" % [src_name, _describe_targets([target])])
	_drain_continue()
	return true


func _drain_pending_triggers() -> void:
	if _state.pending_triggers.is_empty():
		return
	if not _state.awaiting_target_for_trigger.is_empty():
		return
	# Reorder APNAP: AP first → bottom of stack → resolves last.
	var ap_key: String = _state.active_player_key
	var ap_triggers: Array[Dictionary] = []
	var nap_triggers: Array[Dictionary] = []
	for trig in _state.pending_triggers:
		if trig.controller_key == ap_key:
			ap_triggers.append(trig)
		else:
			nap_triggers.append(trig)
	# Rebuild explicitly — concat widens the type past Godot's typed-assign check.
	_state.pending_triggers.clear()
	for trig in ap_triggers:
		_state.pending_triggers.append(trig)
	for trig in nap_triggers:
		_state.pending_triggers.append(trig)
	_drain_continue()


# Drain queue one at a time; pause on "you"-controlled needing target (UI resumes via KIND_PICK_TRIGGER_TARGET).
func _drain_continue() -> void:
	while not _state.pending_triggers.is_empty():
		var trig: Dictionary = _state.pending_triggers[0]
		var filter: String = _trigger_target_filter(trig)
		if filter == "":
			_state.pending_triggers.pop_front()
			_push_trigger_to_stack(trig)
			continue
		if trig.controller_key == "you":
			_state.awaiting_target_for_trigger = {
				"source_iid": trig.source_iid,
				"controller_key": trig.controller_key,
				"ability_index": trig.ability_index,
				"filter": filter,
			}
			var src: CardInstance = _find_card_anywhere(trig.source_iid)
			var src_name: String = src.name() if src != null else "?"
			_state.append_log("%s's triggered ability needs a target" % src_name)
			return
		else:
			# Opp auto-pick (Phase 3 stub).
			var auto_target := _auto_pick_trigger_target(filter, trig.controller_key)
			if auto_target.is_empty():
				_state.pending_triggers.pop_front()
				_state.append_log("Trigger fizzles (no legal target)")
				continue
			trig.targets = [auto_target]
			_state.pending_triggers.pop_front()
			_push_trigger_to_stack(trig)
	# MTG 116.5: priority resets to AP after drain.
	_state.priority_player_key = _state.active_player_key
	_reset_priority_passes()


# triggered_abilities[i].target_filter; "" if no target needed.
func _trigger_target_filter(trig: Dictionary) -> String:
	var source: CardInstance = _find_card_anywhere(trig.source_iid)
	if source == null or source.template == null:
		return ""
	var abilities: Array = source.template.triggered_abilities
	var idx: int = trig.ability_index
	if idx < 0 or idx >= abilities.size():
		return ""
	var ability: Dictionary = abilities[idx]
	if not trig.get("targets", []).is_empty():
		return ""
	return ability.get("target_filter", "")


# Greedy auto-pick: face damage / first opp creature. Phase 5c replaces with real AI.
func _auto_pick_trigger_target(filter: String, controller_key: String) -> Dictionary:
	var opp_key: String = _state.opponent_of(controller_key)
	match filter:
		"creature_or_player":
			return {"kind": "player", "who": opp_key}
		"creature":
			for c in _state.player_by_key(opp_key).battlefield:
				if c.template is CreatureResource:
					return {"kind": "creature", "iid": c.instance_id}
			return {}
		"player":
			return {"kind": "player", "who": opp_key}
		_:
			push_warning("_auto_pick_trigger_target: unknown filter '%s'" % filter)
			return {}


func _push_trigger_to_stack(trig: Dictionary) -> void:
	_state.stack.push({
		"kind": "trigger",
		"source_iid": trig.source_iid,
		"controller_key": trig.controller_key,
		"ability_index": trig.ability_index,
		"event": trig.event,
		"targets": trig.get("targets", []),
	})
	var source: CardInstance = _find_card_anywhere(trig.source_iid)
	var src_name: String = source.name() if source != null else "?"
	_state.append_log("%s's triggered ability goes on the stack" % src_name)
