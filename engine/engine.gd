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


# Reentrancy guard for the opp-turn auto-cycle. Phase 2 has no AI, so when
# active_player swaps to opp we need to immediately advance through opp's
# turn back to player's UNTAP. The cycle is bounded by phase count + a
# safety belt to prevent infinite loops if state goes weird.
var _settling: bool = false


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


# Phase 2 demo: 1 Mountain in play, 3 more in hand, plus a Goblin Raider
# and a Lightning Bolt. Lets the player exercise the full Phase 2 path —
# play another land, tap mountains, cast Goblin (hits battlefield, summoning
# sick), end turn (opp's turn auto-cycles), untap your stuff (Goblin loses
# sickness), attack opp on turn 2 for 2 damage.
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

	_state.append_log("Phase 2 demo: 1 Mountain in play, 3 in hand, plus Goblin Raider and Lightning Bolt. Opp at 20.")
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
		Action.KIND_DECLARE_ATTACKER:
			ok = _do_declare_attacker(action)
		Action.KIND_PASS_PRIORITY:
			ok = _do_pass_priority(action)
		_:
			push_warning("execute_action: unknown kind '%s'" % kind)

	if ok:
		_settle_state()
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
		Action.KIND_DECLARE_ATTACKER:
			return _legal_declare_attacker(action)
		_:
			return false


# After every successful action, settle the state. In Phase 2 the only
# settlement work is auto-cycling opp's turn (no AI yet). This iterates
# phase advancement until the active player is back to "you" (or until
# game-over). Phase 3 will replace this with real opponent priority for
# instants.
func _settle_state() -> void:
	if _settling:
		return  # avoid recursion if a sub-action triggers state changes
	_settling = true
	var safety: int = 50  # cap iterations to detect infinite loops
	while _state.active_player_key == "opp" and _state.winner == "" and safety > 0:
		safety -= 1
		# On opp's turn with no AI, auto-pass priority and advance phases
		# (or resolve top of stack — though stack should be empty for Phase 2).
		if not _state.stack.is_empty():
			_resolve_top_of_stack()
			_state.priority_player_key = _state.active_player_key
			_reset_priority_passes()
		else:
			_advance_phase()
	if safety == 0:
		push_warning("_settle_state: hit iteration cap; possible infinite loop in phase machine")
	_settling = false


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


# ─── Play land ─────────────────────────────────────────────────────────────
# Lands are a special action — they don't use the stack. They go directly
# from hand to battlefield, untapped, no summoning sickness.

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
	# Must be your card and you must have priority and be the active player.
	if found.controller.key != _state.priority_player_key:
		return false
	if found.controller.key != _state.active_player_key:
		return false
	# Must be a main phase with empty stack.
	if not _state.phase_machine.is_main_phase():
		return false
	if not _state.stack.is_empty():
		return false
	# One land per turn.
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
	card.summoning_sick = false  # lands don't get summoning sickness
	_state.append_log("%s plays %s" % [controller.name, card.name()])
	return true


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
	# Sorcery-speed restrictions: anything that's not an instant must be cast
	# during the controller's main phase with an empty stack. Creatures, lands,
	# sorceries, artifacts, enchantments all fall under sorcery-speed.
	if not card.template.has_type("instant"):
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
	if not effects.is_empty():
		Effects.resolve_list(effects, ctx)
	# Where does the card go after resolution?
	#   - Permanents (creatures, lands, artifacts, enchantments) → battlefield
	#   - Non-permanents (instants, sorceries) → owner's graveyard
	if card.template.is_permanent():
		# Spell becomes a permanent on the controller's battlefield.
		controller.battlefield.append(card)
		card.controller_key = controller.key
		# Creatures enter with summoning sickness; lands and other types don't.
		if card.template is CreatureResource:
			card.summoning_sick = true
		else:
			card.summoning_sick = false
		_state.append_log("%s enters the battlefield under %s" % [card.name(), controller.name])
	else:
		var owner: Player = _state.player_by_key(card.owner_key)
		owner.graveyard.append(card)
		_state.append_log("%s resolves" % card.name())
	_stack_held_cards.erase(iid)
	# Check win conditions (life ≤ 0).
	_check_win_conditions()


# ─── Declare attacker (Phase 2 combat) ─────────────────────────────────────
# Adds a creature to state.attackers and taps it. Real MTG handles this
# in batches with a single confirm; for Phase 2 we let the player click
# attackers one at a time and confirm via Pass priority.

func _legal_declare_attacker(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_ATTACK:
		return false
	if _state.priority_player_key != _state.active_player_key:
		return false
	var iid: int = action.get("source_iid", -1)
	if iid in _state.attackers:
		return false  # already declared
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
	if card.tapped or card.summoning_sick:
		return false
	# Defender keyword (Phase 4+) would block here too.
	return true


func _do_declare_attacker(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	card.tapped = true
	_state.attackers.append(iid)
	_state.append_log("%s attacks" % card.name())
	return true


# Combat damage resolution. Phase 2: each attacker deals its power to the
# defending player (no blockers, no first-strike, no trample). Phase 3 will
# add full combat damage with blockers, multi-damage assignment, and
# first/double strike.
func _resolve_combat_damage() -> void:
	if _state.attackers.is_empty():
		return
	var defending: Player = _state.player_by_key(_state.opponent_of(_state.active_player_key))
	for iid in _state.attackers:
		var found = _state.find_instance(iid)
		if found == null or found.card == null:
			continue
		var attacker: CardInstance = found.card
		var damage: int = attacker.template.power
		defending.life -= damage
		defending.life_lost_this_turn += damage
		_state.append_log("%s deals %d to %s (life: %d)" % [
			attacker.name(), damage, defending.name, defending.life])
	# Attackers stay tapped after combat damage; they're not removed from
	# state.attackers until cleanup. (Real MTG: attackers list cleared at end
	# of combat — Phase 3 will handle this. Phase 2 just clears at cleanup.)
	_check_win_conditions()


# ─── Phase machine ─────────────────────────────────────────────────────────

func _advance_phase() -> void:
	var wrapped: bool = _state.phase_machine.advance()
	if wrapped:
		# New turn — switch active player, increment turn count.
		_state.active_player_key = _state.opponent_of(_state.active_player_key)
		_state.turn += 1
		_state.append_log("Turn %d — active: %s" % [_state.turn, _state.active_player().name])

	# On-entry actions per phase
	match _state.phase_machine.current:
		PhaseMachine.Phase.UNTAP:
			# Untap permanents, clear summoning sickness, reset land-per-turn.
			_state.active_player().untap_step()
		PhaseMachine.Phase.COMBAT_DAMAGE:
			# Resolve combat damage. Phase 2: face damage only, no blockers.
			_resolve_combat_damage()
		PhaseMachine.Phase.CLEANUP:
			# Clear combat state at end of turn.
			_state.attackers.clear()
			_state.blockers.clear()

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
