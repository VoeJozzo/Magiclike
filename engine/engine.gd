extends Node

# Engine — the central game-state authority.
#
# Registered as autoload "Engine" in project.godot. Closest GDScript analog of
# the JS prototype's IIFE-singleton ENGINE module.
#
# Public API:
#   RulesEngine.init_phase1()                              — set up Phase 1 demo state
#   RulesEngine.state() -> EngineState                     — read-only state accessor
#   RulesEngine.execute_action(action: Dictionary) -> bool — single mutation entry point
#   RulesEngine.is_legal_action(action) -> bool            — check without mutating
#   RulesEngine signals: state_changed, log_appended, game_over
#
# (Autoload name is `RulesEngine` rather than `Engine` because Godot has a
# built-in global named `Engine` already. The script file is still engine.gd.)
#
# Action shapes are documented in engine/action.gd. The action's `kind` dispatches
# to a private _do_<kind> method below.
#
# State mutation policy:
#   - All mutations route through execute_action.
#   - Each successful action emits state_changed at the end.
#   - Failed/illegal actions return false WITHOUT mutating state.

signal state_changed
signal log_appended(line: String)
signal game_over(winner_key: String)

var _state: EngineState = null


func _ready() -> void:
	# Predicate validation runs at engine boot — catches typos in card resources.
	# Phase 1 has no triggers so this is mostly scaffolding for Phase 4+.
	Predicates.validate_all_card_predicates(CardDatabase.all_resources())


# ─── State access ──────────────────────────────────────────────────────────

func state() -> EngineState:
	return _state


# ─── Phase 1 demo setup ────────────────────────────────────────────────────

# Initialize state for the Phase 1 demo: you have 2 Mountains in play and
# 1 Lightning Bolt in hand. Opp does nothing. It's your Main 1, you have
# priority.
func init_phase1() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	# Build your starting position
	for i in range(2):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), "you")
		mtn.summoning_sick = false  # Demo: lands enter battle-ready
		_state.you.battlefield.append(mtn)
	var bolt := _state.make_instance(CardDatabase.get_card("lightning_bolt"), "you")
	_state.you.hand.append(bolt)

	_state.append_log("Phase 1 demo initialized: 2 Mountains, 1 Lightning Bolt in hand. Opp at 20.")
	state_changed.emit()


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
		Action.KIND_PASS_PRIORITY:
			ok = _do_pass_priority(action)
		_:
			push_warning("execute_action: unknown kind '%s'" % kind)

	if ok:
		state_changed.emit()
	return ok


func is_legal_action(action: Dictionary) -> bool:
	var kind: String = action.get("kind", "")
	match kind:
		Action.KIND_PASS_PRIORITY:
			# Always legal as long as the player has priority.
			return _state != null and _state.winner == ""
		Action.KIND_ACTIVATE_ABILITY:
			return _legal_activate_ability(action)
		Action.KIND_PLAY_LAND:
			return _legal_play_land(action)
		Action.KIND_CAST_SPELL:
			return _legal_cast_spell(action)
		_:
			return false


# ─── Activate ability (Phase 1: only mana abilities — taps a land for mana) ─

func _legal_activate_ability(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	var iid: int = action.get("source_iid", -1)
	var found = _state.find_instance(iid)
	if found == null:
		return false
	var card: CardInstance = found.card
	# Phase 1: only land-tap mana abilities. Card must be in priority player's
	# battlefield, untapped, and a land with mana_produced.
	if card == null or not card.is_land():
		return false
	if found.controller.key != _state.priority_player_key:
		return false
	if card.tapped:
		return false
	# Must be a LandResource with non-empty mana_produced.
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
	# Phase 1 mana ability: tap and add mana.
	card.tapped = true
	# Add the first produced color (Phase 1 — no choice; multi-color lands are Phase 2+).
	var color: String = card.template.mana_produced[0]
	var ctx := _build_ctx(controller, card, [])
	Effects.resolve_one({"kind": "add_mana", "amounts": {color: 1}}, ctx)
	# Mana abilities don't pass priority — caster retains it.
	return true


# ─── Play land (Phase 1 doesn't exercise this, but legal-shape hook is here) ─

func _legal_play_land(_action: Dictionary) -> bool:
	# Phase 1 demo starts with Mountains already in play, so we don't need to
	# exercise this path. Stub allows the action shape to be valid for future use.
	return false  # Disabled in Phase 1


func _do_play_land(_action: Dictionary) -> bool:
	push_warning("play_land not implemented in Phase 1")
	return false


# ─── Cast spell ────────────────────────────────────────────────────────────

func _legal_cast_spell(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	var iid: int = action.get("source_iid", -1)
	var found = _state.find_instance(iid)
	if found == null:
		return false
	var card: CardInstance = found.card
	# Card must be in priority player's hand.
	if card == null or found.zone_name != "hand":
		return false
	if found.controller.key != _state.priority_player_key:
		return false
	# Sorcery-speed spells require active player + main phase + empty stack.
	# Phase 1 only has Lightning Bolt (instant), so this is permissive.
	if card.template.has_type("sorcery"):
		var is_active = (found.controller.key == _state.active_player_key)
		var is_main = _state.phase_machine.is_main_phase()
		var stack_empty = _state.stack.is_empty()
		if not (is_active and is_main and stack_empty):
			return false
	# Caster must be able to pay the mana cost.
	if not found.controller.mana.can_pay(card.template.mana_cost):
		return false
	# If the card requires a target, action must supply one.
	if card.template is SpellResource and card.template.requires_target:
		var targets: Array = action.get("targets", [])
		if targets.is_empty():
			return false
		# Phase 1: only validate target shape; legality of who/what is light.
		# Phase 4+ would validate target_filter against current state.
	return true


func _do_cast_spell(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	var controller: Player = found.controller
	var targets: Array = action.get("targets", [])

	# Pay cost
	if not controller.mana.pay(card.template.mana_cost):
		_state.append_log("ERROR: cast_spell pay() failed after legality check")
		return false

	# Move from hand to stack-limbo (no zone array — it's "on the stack")
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
	# Casting a spell resets priority to the active player and clears passes.
	_state.priority_player_key = _state.active_player_key
	_reset_priority_passes()

	# Hold the CardInstance so we can graveyard it on resolution. We tuck it
	# in a private map keyed by iid, since it's not in any zone right now.
	_stack_held_cards[card.instance_id] = card
	return true


# ─── Pass priority ─────────────────────────────────────────────────────────

func _do_pass_priority(_action: Dictionary) -> bool:
	# Mark current priority holder as passed.
	_state.priority_passed[_state.priority_player_key] = true

	# If both passed: resolve top of stack (if any) or advance phase (if empty).
	if _state.priority_passed["you"] and _state.priority_passed["opp"]:
		if not _state.stack.is_empty():
			_resolve_top_of_stack()
			# After resolution, priority returns to active player; passes reset.
			_state.priority_player_key = _state.active_player_key
			_reset_priority_passes()
		else:
			# Nobody had anything to do; advance phase.
			_advance_phase()
	else:
		# Hand priority to the other player.
		_state.priority_player_key = _state.opponent_of(_state.priority_player_key)
		# Phase 1: opponent is a do-nothing stub. If priority just landed on opp,
		# auto-pass for them so the player isn't stuck waiting.
		if _state.priority_player_key == "opp":
			_state.append_log("Opponent passes priority (stub)")
			# Recursive call — opp's pass will either flip back or trigger resolution.
			return _do_pass_priority({})
	return true


# ─── Stack resolution ──────────────────────────────────────────────────────

# Cards on the stack don't live in any player's zone; we hold them here keyed
# by iid so we can move them to graveyard on resolution.
var _stack_held_cards: Dictionary = {}


func _resolve_top_of_stack() -> void:
	var entry = _state.stack.pop_top()
	if entry == null:
		return
	var iid: int = entry.source_iid
	var controller_key: String = entry.controller_key
	var controller: Player = _state.player_by_key(controller_key)
	var card: CardInstance = _stack_held_cards.get(iid)
	if card == null:
		_state.append_log("ERROR: stack entry iid=%d has no held card" % iid)
		return
	var ctx := _build_ctx(controller, card, entry.get("targets", []))
	# Run all on_cast_effects in order.
	var effects: Array = card.template.on_cast_effects
	if effects.is_empty():
		_state.append_log("%s resolves (no effects)" % card.name())
	else:
		_state.append_log("%s resolves" % card.name())
		Effects.resolve_list(effects, ctx)
	# Move the card to its owner's graveyard.
	var owner: Player = _state.player_by_key(card.owner_key)
	owner.graveyard.append(card)
	_stack_held_cards.erase(iid)
	# Check win conditions (Phase 1: life ≤ 0).
	_check_win_conditions()


# ─── Phase machine ─────────────────────────────────────────────────────────

func _advance_phase() -> void:
	var wrapped: bool = _state.phase_machine.advance()
	if wrapped:
		# New turn — switch active player, increment turn count.
		_state.active_player_key = _state.opponent_of(_state.active_player_key)
		_state.turn += 1
		_state.append_log("Turn %d — active: %s" % [_state.turn, _state.active_player().name])
	# Untap step actions on entry.
	if _state.phase_machine.current == PhaseMachine.Phase.UNTAP:
		_state.active_player().untap_step()
	# Reset priority for the new phase.
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
