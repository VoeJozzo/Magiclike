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


# Phase 3 demo: introduces blockers, the first instant exercising the stack
# architecture, and basic opp behavior.
#
# You start with: 1 Mountain + 1 Forest in play, hand has Mountain, Forest,
# Goblin Raider, Lightning Bolt, Giant Growth.
# Opp starts with: 1 Forest + 2 Grizzly Bears in play (untapped, no sickness),
# Giant Growth in hand.
#
# Test scenarios available:
#   - Cast Bolt at an opp Bear → opp casts Giant Growth in response → bear
#     becomes 5/5 → Bolt resolves for 3 damage → bear survives at 5/5 with
#     3 marked → cleanup clears temp/damage → bear back to 2/2 next turn.
#   - Attack with Goblin (2/1) → opp blocks with a Bear (2/2) → mutual damage
#     → Goblin dies (2 damage = 1 toughness), Bear survives at 2/2 with
#     2 damage marked → cleanup clears damage → bear at 2/2 next turn.
#   - Opp's turn: opp attacks with both bears → you block with creatures or
#     take 4 damage to face.
func init_phase3() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	# You: 1 Mountain + 1 Forest in play (no sickness)
	var mtn0 := _state.make_instance(CardDatabase.get_card("mountain"), "you")
	mtn0.summoning_sick = false
	_state.you.battlefield.append(mtn0)
	var fst0 := _state.make_instance(CardDatabase.get_card("forest"), "you")
	fst0.summoning_sick = false
	_state.you.battlefield.append(fst0)
	# You: hand
	for i in range(2):
		_state.you.hand.append(_state.make_instance(CardDatabase.get_card("mountain"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("forest"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("goblin_raider"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("lightning_bolt"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("giant_growth"), "you"))

	# Opp: 1 Forest + 2 Grizzly Bears in play (no sickness, untapped)
	var opp_fst := _state.make_instance(CardDatabase.get_card("forest"), "opp")
	opp_fst.summoning_sick = false
	_state.opp.battlefield.append(opp_fst)
	for i in range(2):
		var bear := _state.make_instance(CardDatabase.get_card("grizzly_bears"), "opp")
		bear.summoning_sick = false
		_state.opp.battlefield.append(bear)
	# Opp: Giant Growth in hand for instant-response testing
	_state.opp.hand.append(_state.make_instance(CardDatabase.get_card("giant_growth"), "opp"))

	_state.append_log("Phase 3 demo: you have 2 lands in play + plenty of cards in hand. Opp has 1 Forest + 2 Grizzly Bears + Giant Growth.")
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
		Action.KIND_DECLARE_BLOCKER:
			ok = _do_declare_blocker(action)
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
		Action.KIND_DECLARE_BLOCKER:
			return _legal_declare_blocker(action)
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
	while _state.winner == "" and safety > 0:
		safety -= 1
		# On player's turn, stop auto-cycling — player needs to act.
		if _state.active_player_key != "opp":
			break
		# Phase 3: stop at opp's COMBAT_BLOCK so the player can declare blockers
		# AND cast combat tricks (Giant Growth on their blocker). Skip if
		# there are no attackers — empty COMBAT_BLOCK has nothing to do.
		# We also auto-pass opp's priority before stopping so the player has
		# priority to cast spells (otherwise priority sits on the active
		# player and the cast attempt is rejected by _legal_cast_spell).
		if _state.phase_machine.current == PhaseMachine.Phase.COMBAT_BLOCK \
				and not _state.attackers.is_empty():
			if _state.priority_player_key == "opp":
				_state.priority_passed["opp"] = true
				_state.priority_player_key = "you"
			break
		# Otherwise auto-advance opp's turn (no real AI yet for Phase 3).
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
		# Phase 3: when priority lands on opp, give them a chance to respond
		# (cast Giant Growth in response to Lightning Bolt). If they do nothing,
		# auto-pass so the player isn't stuck waiting.
		if _state.priority_player_key == "opp":
			if _opp_tries_to_respond_phase3():
				return true  # opp cast a spell; they retain priority
			_state.append_log("Opponent passes priority (stub)")
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
	# Run state-based actions after the spell resolves, then check win.
	_run_sbas()
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


# ─── Declare blocker (Phase 3) ─────────────────────────────────────────────

func _legal_declare_blocker(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.phase_machine.current != PhaseMachine.Phase.COMBAT_BLOCK:
		return false
	# Block declaration is a *special action* in MTG — it happens at the
	# start of COMBAT_BLOCK before priority opens, and doesn't require the
	# defender to currently hold priority. So we don't gate on priority here.
	var defending_key: String = _state.opponent_of(_state.active_player_key)
	var blocker_iid: int = action.get("source_iid", -1)
	var attacker_iid: int = action.get("attacker_iid", -1)
	if _state.blockers.has(blocker_iid):
		return false  # blocker already assigned
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


# ─── State-based actions (SBA) ────────────────────────────────────────────
# Run after every effect resolution and after combat damage. Walks the
# battlefield and moves dead creatures (toughness ≤ 0 or damage_marked ≥
# toughness) to graveyard. Also clears combat-state references to dead
# creatures so we don't carry stale iids in attackers/blockers maps.
#
# SBAs run in a loop because killing a creature might cascade (e.g.,
# removing a +1/+1 lord could push other creatures below toughness).
# Capped at 20 iterations as a runaway-loop safety belt.
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
				if c.current_toughness() <= 0 or c.damage_marked >= c.current_toughness():
					dying.append(c)
			for c in dying:
				player.battlefield.erase(c)
				player.graveyard.append(c)
				_state.append_log("%s dies" % c.name())
				_clear_combat_state_for_dead(c.instance_id)
				any_died = true
		if not any_died:
			break
		changed = true
	if changed:
		_check_win_conditions()


# When a creature leaves the battlefield, remove its iid from attackers
# and from any blockers entries (both as blocker and as the blocked target).
func _clear_combat_state_for_dead(dead_iid: int) -> void:
	if dead_iid in _state.attackers:
		_state.attackers.erase(dead_iid)
	_state.blockers.erase(dead_iid)
	# Also remove blockers that were blocking this creature
	for b_iid in _state.blockers.keys():
		if _state.blockers[b_iid] == dead_iid:
			_state.blockers.erase(b_iid)


# ─── Combat damage resolution (Phase 3) ───────────────────────────────────
# For each attacker:
#   - If unblocked: deal power damage to defending player (face damage).
#   - If blocked: attacker and its blocker(s) deal mutual damage. Phase 3
#     simplification — multi-block uses simple "all blockers deal full
#     damage to attacker; attacker deals all damage to first blocker."
#     Phase 4+ may add player-controlled damage assignment ordering.
# After damage assignment, SBAs sweep up any dead creatures.
func _resolve_combat_damage() -> void:
	if _state.attackers.is_empty():
		return
	var defending: Player = _state.player_by_key(_state.opponent_of(_state.active_player_key))

	# Build attacker → list-of-blockers map
	var attacker_blockers: Dictionary = {}
	for atk_iid in _state.attackers:
		attacker_blockers[atk_iid] = []
	for blk_iid in _state.blockers:
		var atk_iid: int = _state.blockers[blk_iid]
		if attacker_blockers.has(atk_iid):
			attacker_blockers[atk_iid].append(blk_iid)

	for atk_iid in _state.attackers:
		var atk_found = _state.find_instance(atk_iid)
		if atk_found == null or atk_found.card == null:
			continue
		var attacker: CardInstance = atk_found.card
		var atk_pow: int = attacker.current_power()
		var blockers: Array = attacker_blockers.get(atk_iid, [])

		if blockers.is_empty():
			# Unblocked — face damage
			defending.life -= atk_pow
			defending.life_lost_this_turn += atk_pow
			_state.append_log("%s deals %d to %s (life: %d)" % [
				attacker.name(), atk_pow, defending.name, defending.life,
			])
		else:
			# Blocked — mutual damage. Attacker dumps full power on first
			# blocker (Phase 3 simplification); each blocker deals their
			# power to the attacker.
			var first_blocker_iid: int = blockers[0]
			var first_blocker_found = _state.find_instance(first_blocker_iid)
			if first_blocker_found != null and first_blocker_found.card != null:
				first_blocker_found.card.damage_marked += atk_pow
			var total_blocker_dmg: int = 0
			for b_iid in blockers:
				var b_found = _state.find_instance(b_iid)
				if b_found != null and b_found.card != null:
					total_blocker_dmg += b_found.card.current_power()
			attacker.damage_marked += total_blocker_dmg
			_state.append_log("%s (%d) is blocked; mutual damage assigned" % [
				attacker.name(), atk_pow,
			])

	# Sweep up dead creatures
	_run_sbas()
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
		PhaseMachine.Phase.COMBAT_ATTACK:
			# Phase 3: opp's hardcoded "always attack" AI fires here on opp's turn.
			if _state.active_player_key == "opp":
				_opp_auto_declare_attackers_phase3()
		PhaseMachine.Phase.COMBAT_BLOCK:
			# Phase 3: opp's hardcoded "always block" AI fires here on player's turn.
			if _state.active_player_key == "you":
				_opp_auto_declare_blockers_phase3()
		PhaseMachine.Phase.COMBAT_DAMAGE:
			_resolve_combat_damage()
		PhaseMachine.Phase.CLEANUP:
			# Clear combat state and EOT modifiers on every creature.
			_state.attackers.clear()
			_state.blockers.clear()
			for player in [_state.you, _state.opp]:
				for c in player.battlefield:
					if c.template is CreatureResource:
						c.clear_eot_modifiers()

	# Reset priority for the new phase. Per MTG rule 117.1b, the active player
	# gets priority at the start of every step/phase. (Block declaration is
	# a special action that happens BEFORE priority opens — we handle that
	# above as the COMBAT_BLOCK entry hook for opp; for player as defender,
	# block declaration is gated on phase, not priority — see
	# _legal_declare_blocker.)
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


# ─── Phase 3 hardcoded opp AI ──────────────────────────────────────────────
# These three helpers stand in for a real AI module (Phase 5). They cover
# only what the Phase 3 demo needs: opp auto-attacks on their turn, auto-
# blocks on yours, and casts Giant Growth in response to a Lightning Bolt
# targeting one of their creatures. Phase 5 will replace these with the
# proper heuristic AI ported from the JS prototype.

func _opp_auto_declare_attackers_phase3() -> void:
	# Phase 3 simplification: attack with all untapped creatures EXCEPT
	# leave one back for defense if there are 2+ available. Pure "always
	# attack" leaves opp tapped and unable to block on your turn, which
	# (per Joe's playtest feedback) results in an unblockable game.
	var available: Array = []
	for c in _state.opp.battlefield:
		if not (c.template is CreatureResource):
			continue
		if c.tapped or c.summoning_sick:
			continue
		available.append(c)
	var to_attack: Array = available.duplicate()
	if available.size() >= 2:
		to_attack.pop_back()  # keep one creature untapped for blocking next turn
	for c in to_attack:
		c.tapped = true
		c.attacking = true
		_state.attackers.append(c.instance_id)
		_state.append_log("%s attacks (auto)" % c.name())


func _opp_auto_declare_blockers_phase3() -> void:
	# Pair each untapped opp creature with one attacker (one-to-one). Excess
	# attackers go unblocked; excess blockers stay home.
	var available_attackers := _state.attackers.duplicate()
	for c in _state.opp.battlefield:
		if available_attackers.is_empty():
			break
		if not (c.template is CreatureResource):
			continue
		if c.tapped or c.summoning_sick:
			continue
		var attacker_iid: int = available_attackers.pop_front()
		_state.blockers[c.instance_id] = attacker_iid
		c.blocking_iid = attacker_iid
		var atk_found = _state.find_instance(attacker_iid)
		if atk_found != null and atk_found.card != null:
			_state.append_log("%s blocks %s (auto)" % [c.name(), atk_found.card.name()])


# Returns true if opp cast Giant Growth in response (in which case caller
# should NOT also auto-pass priority for opp). Returns false if opp had
# nothing to do — caller should auto-pass.
func _opp_tries_to_respond_phase3() -> bool:
	if _state.stack.is_empty():
		return false
	var top = _state.stack.top()
	if top.controller_key != "you":
		return false  # not responding to player
	# Phase 3 only responds to Lightning Bolt
	var top_iid: int = top.source_iid
	var top_card: CardInstance = _stack_held_cards.get(top_iid)
	if top_card == null or top_card.template.card_id != "lightning_bolt":
		return false
	var top_targets: Array = top.get("targets", [])
	if top_targets.is_empty():
		return false
	var t: Dictionary = top_targets[0]
	if t.get("kind", "") != "creature":
		return false
	# Is the targeted creature one of opp's? (No point growing player's stuff.)
	var target_iid: int = t.get("iid", -1)
	var target_found = _state.find_instance(target_iid)
	if target_found == null or target_found.card == null:
		return false
	if target_found.controller.key != "opp":
		return false
	# Find Giant Growth in opp's hand
	var giant_growth: CardInstance = null
	for c in _state.opp.hand:
		if c.template.card_id == "giant_growth":
			giant_growth = c
			break
	if giant_growth == null:
		return false
	# Pay G mana — tap an untapped Forest if needed
	var cost: Dictionary = giant_growth.template.mana_cost
	if not _state.opp.mana.can_pay(cost):
		var forest: CardInstance = null
		for c in _state.opp.battlefield:
			if c.template is LandResource and c.template.mana_produced.has("G") and not c.tapped:
				forest = c
				break
		if forest == null:
			return false
		forest.tapped = true
		_state.opp.mana.add("G", 1)
		_state.append_log("Opponent taps %s for G" % forest.name())
	if not _state.opp.mana.pay(cost):
		return false
	# Cast Giant Growth on the target
	_state.opp.hand.erase(giant_growth)
	_state.stack.push({
		"kind": "spell",
		"source_iid": giant_growth.instance_id,
		"controller_key": "opp",
		"targets": [{"kind": "creature", "iid": target_iid}],
	})
	_stack_held_cards[giant_growth.instance_id] = giant_growth
	_state.append_log("Opponent casts Giant Growth targeting %s (in response)" % target_found.card.name())
	# Caster keeps priority after casting
	_state.priority_player_key = "opp"
	_reset_priority_passes()
	return true
