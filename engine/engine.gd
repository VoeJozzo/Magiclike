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


# Demo libraries: each init_phase* helper seeds both players with 20 buffer
# Mountains so the DRAW step (Phase 4.5+) doesn't deck them out on the first
# turn-cycle. The legacy demo helpers were authored before libraries existed;
# this keeps them runnable as smoke-test fixtures without rewriting them.
func _seed_demo_library(player: Player, count: int = 20) -> void:
	for i in range(count):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), player.key)
		player.library.append(mtn)


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

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
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

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
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

	_seed_demo_library(_state.you)
	_seed_demo_library(_state.opp)
	_state.append_log("Phase 3 demo: you have 2 lands in play + plenty of cards in hand. Opp has 1 Forest + 2 Grizzly Bears + Giant Growth.")
	state_changed.emit()


# Phase 4 demo: triggered abilities. Mountains in play, hand has Pyromaniac
# (ETB → 1 to opp), Bloodlust Berserker (death → +2 to opp if opp lost life
# this turn), and a Lightning Bolt to test the kill-your-own-creature
# scenario. Opp has 1 Grizzly Bears just to be hittable + a Lightning Bolt
# to send back at the Berserker for the death-trigger test.
func init_phase4() -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	# You: 3 Mountains in play (no sickness), Pyromaniac + Bloodlust + Bolt in hand
	for i in range(3):
		var mtn := _state.make_instance(CardDatabase.get_card("mountain"), "you")
		mtn.summoning_sick = false
		_state.you.battlefield.append(mtn)
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("pyromaniac"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("bloodlust_berserker"), "you"))
	_state.you.hand.append(_state.make_instance(CardDatabase.get_card("lightning_bolt"), "you"))

	# Opp: a Grizzly Bears (hittable target) and a Lightning Bolt + Forest +
	# Mountain so opp can return fire on the Berserker for the death-trigger test.
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


# ─── Phase 4.5: real-game init from decklists ──────────────────────────────
# Replaces the hardcoded init_phase* demo helpers when running an actual game.
# Each decklist is a Dictionary mapping card_id → count, e.g.:
#   {"mountain": 12, "lightning_bolt": 4, "goblin_raider": 4, "grizzly_bears": 4, ...}
# Cards are instantiated, shuffled into the player's library, and the opening
# hand is drawn. No mulligan in 4.5a — always draws the full hand_size.
# Active player is "you", current phase is MAIN1, priority "you".
#
# Caller is responsible for providing valid card_ids (CardDatabase.get_card
# logs an error and returns null for unknown ids; those slots are skipped).
# Phase 4.5 demo deck — a balanced two-color list playable end-to-end with
# the cards available so far. Used by the game_board scene as the default
# launch state. Both players get the same list (mirror match) for simplicity.
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


# Convenience wrapper: boot a game with the Phase 4.5 demo deck on both
# sides. Falls back gracefully if some Phase-4.5c cards aren't in CardDatabase
# yet (skip-unknown is handled inside _populate_library).
func init_phase4_5_demo() -> void:
	init_game(_PHASE4_5_DEMO_DECK, _PHASE4_5_DEMO_DECK)


func init_game(you_decklist: Dictionary, opp_decklist: Dictionary, hand_size: int = 7) -> void:
	_state = EngineState.new()
	_state.active_player_key = "you"
	_state.priority_player_key = "you"
	_state.phase_machine.current = PhaseMachine.Phase.MAIN1

	_populate_library(_state.you, you_decklist)
	_populate_library(_state.opp, opp_decklist)
	_shuffle_library(_state.you)
	_shuffle_library(_state.opp)
	# Opening hands — draw without firing the empty-library loss (a sub-7-card
	# starter shouldn't immediately end the game; the player gets a partial
	# hand and decks out on their first real draw).
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


# Fisher-Yates shuffle. Godot's Array.shuffle() uses the global RNG which is
# fine for now; if we ever need seeded shuffles (e.g., for replay testing),
# swap to a RandomNumberGenerator instance owned by EngineState.
func _shuffle_library(player: Player) -> void:
	player.library.shuffle()


# Draw opening hand without triggering the deck-out loss. If the library is
# smaller than hand_size we just draw what's there — the player has fewer
# cards but the game still starts.
func _draw_opening_hand(player: Player, hand_size: int) -> void:
	var to_draw: int = min(hand_size, player.library.size())
	for i in range(to_draw):
		var card: CardInstance = player.library.pop_back()
		player.hand.append(card)


# Counts cards across a decklist Dictionary (for log lines).
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


# Phase 5b: enumerate every legal action descriptor for `player_key` in the
# current state. Single read-only entry point used by Phase 5c's AI module.
# Returns an empty array if the player doesn't have priority (or the game is
# over). Casts with multiple legal targets fan out into one entry per target
# choice so the AI can score each individually.
#
# Performance note: walks the priority player's hand + battlefield + the
# combat phase declarations. At Phase 5 scale (~30-card decks, ~10 perms in
# play) this is microseconds; no optimisation needed.
func get_legal_actions(player_key: String) -> Array[Dictionary]:
	var actions: Array[Dictionary] = []
	if _state == null or _state.winner != "":
		return actions
	# Trigger target picker takes precedence — when the engine is waiting on
	# a target pick, the player's only legal action is to pick one.
	if not _state.awaiting_target_for_trigger.is_empty() \
			and _state.awaiting_target_for_trigger.get("controller_key", "") == player_key:
		var filter: String = _state.awaiting_target_for_trigger.get("filter", "")
		for target in _enumerate_filter_targets(filter, player_key):
			actions.append(Action.make_pick_trigger_target(target))
		return actions
	# Outside of trigger-target mode, the player needs priority for most
	# actions. Exception: block declaration during COMBAT_BLOCK is a special
	# action that doesn't gate on priority.
	var is_combat_block: bool = _state.phase_machine.current == PhaseMachine.Phase.COMBAT_BLOCK
	var is_defender: bool = player_key == _state.opponent_of(_state.active_player_key)
	if _state.priority_player_key != player_key and not (is_combat_block and is_defender):
		return actions
	# Pass priority is always available when you have priority.
	if _state.priority_player_key == player_key:
		actions.append(Action.make_pass_priority())
	# Lands — playable from hand if all legality checks pass.
	for card in _state.player_by_key(player_key).hand:
		if card.is_land():
			var play := Action.make_play_land(card.instance_id)
			if _legal_play_land(play):
				actions.append(play)
	# Mana abilities — tap untapped lands on your battlefield.
	for card in _state.player_by_key(player_key).battlefield:
		var ability := Action.make_activate_ability(card.instance_id)
		if _legal_activate_ability(ability):
			actions.append(ability)
	# Spells — fan out across legal target combinations.
	for card in _state.player_by_key(player_key).hand:
		if card.is_land():
			continue
		_enumerate_cast_actions(card, player_key, actions)
	# Combat declarations — only when the relevant combat phase is open.
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


# Helper: yield action descriptors for every legal target combination of
# casting `card`. Untargeted spells fan out to a single entry; targeted
# spells fan out one entry per legal target. Multi-target spells (Phase 6+)
# would do a Cartesian product here.
func _enumerate_cast_actions(card: CardInstance, player_key: String, out: Array[Dictionary]) -> void:
	if not (card.template is SpellResource):
		# Creatures, etc. — cast with no target list.
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


# Returns every legal target descriptor matching `filter` from the perspective
# of `picker_key` (used for hexproof checks — own creatures with hexproof are
# still legal targets for the picker's spells).
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
			# Counterspell-style: any spell currently on the stack.
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
		Action.KIND_PICK_TRIGGER_TARGET:
			return _legal_pick_trigger_target(action)
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
	# Lands ETB fires triggers in Phase 4+. Lands themselves don't have
	# triggered abilities yet, but a landfall card on the battlefield could
	# react. Fire the event and drain in case anything matches.
	_fire_event({"kind": "card_etb", "subject_iid": card.instance_id, "subject_card": card})
	_drain_pending_triggers()
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
		# Fire ETB event so triggered abilities can react.
		_fire_event({"kind": "card_etb", "subject_iid": card.instance_id, "subject_card": card})
	else:
		var owner: Player = _state.player_by_key(card.owner_key)
		owner.graveyard.append(card)
		_state.append_log("%s resolves" % card.name())
	_stack_held_cards.erase(iid)
	# State-based actions sweep up any deaths from this resolution (which may
	# fire more triggers via _fire_event from inside _run_sbas).
	_run_sbas()
	# Drain anything that triggered from the resolution or its SBAs.
	_drain_pending_triggers()
	_check_win_conditions()


# A triggered ability resolves: runs that ability's effects with the source as
# context. Source may be in the graveyard (death triggers) or battlefield (ETB
# and "while in play" triggers); find_instance scans every zone.
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
	# SBAs and re-drain, just like spell resolution. A triggered effect that
	# kills something can fire a chain of death triggers; this catches them.
	_run_sbas()
	_drain_pending_triggers()
	_check_win_conditions()


# Find a card by instance_id across all zones AND the stack-held buffer.
# Used by trigger resolution because the source might be anywhere (e.g., a
# death trigger's source has already moved to the graveyard).
func _find_card_anywhere(iid: int) -> CardInstance:
	var found = _state.find_instance(iid)
	if found != null and found.card != null:
		return found.card
	if _stack_held_cards.has(iid):
		return _stack_held_cards[iid]
	return null


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
	if card.tapped:
		return false
	# Phase 5a: haste bypasses summoning sickness for attacks (and tap-for-
	# ability, handled inside _legal_activate_ability). Defender outright
	# prevents attacking.
	if card.summoning_sick and not card.has_keyword("haste"):
		return false
	if card.has_keyword("defender"):
		return false
	return true


func _do_declare_attacker(action: Dictionary) -> bool:
	var iid: int = action.source_iid
	var found = _state.find_instance(iid)
	var card: CardInstance = found.card
	# Phase 5a: vigilance — attacker doesn't tap.
	if not card.has_keyword("vigilance"):
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
	# Phase 5a: keyword-driven block legality.
	var attacker_found = _state.find_instance(attacker_iid)
	if attacker_found == null or attacker_found.card == null:
		return false
	var attacker: CardInstance = attacker_found.card
	# Unblockable — nothing legal.
	if attacker.has_keyword("unblockable"):
		return false
	# Flying — only flying or reach may block.
	if attacker.has_keyword("flying") \
			and not blocker.has_keyword("flying") \
			and not blocker.has_keyword("reach"):
		return false
	# Menace is a multi-blocker requirement (≥2 blockers), validated at the
	# COMBAT_DAMAGE step rather than per-block (one menace blocker is fine
	# during declaration so long as another joins before resolution). See
	# _resolve_combat_damage where menace-with-one-blocker is treated as
	# unblocked.
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
				# Phase 5a: indestructible creatures ignore lethal-damage SBAs
				# (but 0 toughness still kills them — rare edge case).
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
				# Fire dies event so triggered abilities (death triggers) can
				# react. We pass the card reference because by the time the
				# trigger resolves, source has moved to the graveyard — but
				# find_instance picks it up there.
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


# ─── Combat damage resolution (Phase 5a) ───────────────────────────────────
# Two-pass damage step driven by first_strike. Keyword handling:
#   - first_strike — sources with this deal damage in pass 1; without in pass 2
#   - lifelink     — source's controller gains life equal to damage dealt
#   - deathtouch   — any nonzero damage flags the target as lethal_marked
#   - trample      — excess damage on blocked attacker spills to defender
#   - indestructible — SBAs (in _run_sbas) ignore lethal damage on these
#   - menace       — attacker with menace and only one blocker is treated as
#                    unblocked (rule 702.110b — minimum 2 blockers required)
#   - unblockable / flying — enforced at _legal_declare_blocker, not here
# After each pass, SBAs sweep dead creatures so they don't deal pass-2 damage.
func _resolve_combat_damage() -> void:
	if _state.attackers.is_empty():
		return
	var defending: Player = _state.player_by_key(_state.opponent_of(_state.active_player_key))

	# Build attacker → list-of-blockers map. Menace re-classifies an attacker
	# with fewer than 2 blockers as unblocked.
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
			# The lone blocker (if any) is "ignored" — its damage assignment
			# is dropped. Record so we can log it.
			if attacker_blockers[atk_iid].size() == 1:
				_state.append_log("%s has menace — single blocker is illegal, ignored" % attacker.name())
			attacker_blockers[atk_iid] = []

	# Detect whether we need a first-strike pass at all (skip the work when no
	# combatant has first strike — most combats).
	var need_first_strike: bool = _combat_needs_first_strike_step(attacker_blockers)

	if need_first_strike:
		_combat_damage_pass(defending, attacker_blockers, true)
		_run_sbas()
		_check_win_conditions()
		if _state.winner != "":
			return
	# Normal damage step — sources without first_strike, plus first_strikers
	# that survived (which deal damage again only if they had double_strike;
	# we don't have double_strike in Phase 5a). For now: pass 2 covers all
	# living combatants that DIDN'T deal in pass 1.
	_combat_damage_pass(defending, attacker_blockers, false)
	_run_sbas()
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


# Apply one damage pass. If first_strike_only is true, only first-strike
# sources deal damage; otherwise only non-first-strike (and any that survived
# the first pass) deal damage. Skips creatures that have already left the
# battlefield (dead from a previous pass).
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
		# Filter by pass: pass 1 only first-strikers, pass 2 only non-first-strikers.
		if first_strike_only != atk_first_strike:
			# Still process blockers below — a non-first-strike attacker can be
			# damaged in pass 1 by a first-strike BLOCKER.
			pass
		var atk_pow: int = attacker.current_power()
		var blockers: Array = attacker_blockers.get(atk_iid, [])

		if blockers.is_empty():
			# Unblocked — face damage (only on this attacker's pass).
			if first_strike_only == atk_first_strike:
				_deal_combat_damage(attacker, atk_pow, _damage_target_player(defending))
		else:
			# Blocked — attacker hits the first blocker (or trample-style
			# split below); each blocker hits the attacker.
			# Attacker → first blocker (simplification: dump on slot 0).
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
		PhaseMachine.Phase.DRAW:
			# Phase 4.5: active player draws one card. If their library is
			# empty, they lose (MTG rule 704.5b — can't draw from an empty
			# library at the moment they're required to draw).
			_do_draw_card(_state.active_player_key)
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


# Phase 4.5c: remove a spell from the stack and send it to its owner's
# graveyard. Used by Counterspell's counter_spell effect handler. Returns
# true on success, false if the iid wasn't on the stack (target gone =
# fizzle). Public so engine/effects/counter_spell.gd can call it; the
# autoload is the only place that owns _stack_held_cards.
func counter_stack_entry(iid: int) -> bool:
	# Find the entry in state.stack by source_iid.
	var idx: int = -1
	for i in range(_state.stack.entries.size()):
		if _state.stack.entries[i].get("source_iid", -1) == iid:
			idx = i
			break
	if idx == -1:
		return false
	var entry: Dictionary = _state.stack.entries[idx]
	# Phase 4.5c: only spell entries can be countered. Trigger entries
	# represent triggered abilities, which Counterspell doesn't hit per
	# MTG rules (and Stifle isn't in our card pool yet).
	if entry.get("kind", "spell") != "spell":
		return false
	# Remove from stack (Stack.entries.remove_at handles the index shift).
	_state.stack.entries.remove_at(idx)
	# Move the held card to its owner's graveyard. Spells go to graveyard
	# regardless of whether they would normally enter the battlefield —
	# counterspell intercepts before resolution.
	var card: CardInstance = _stack_held_cards.get(iid)
	if card != null:
		var owner: Player = _state.player_by_key(card.owner_key)
		if owner != null:
			owner.graveyard.append(card)
		_stack_held_cards.erase(iid)
	return true


# Phase 4.5: draw a card during the DRAW step. Called from _advance_phase
# when the new phase is DRAW. If the player's library is empty, they lose
# the game (MTG 704.5b). The loss is processed through the standard winner
# pathway so _check_win_conditions and game_over signaling stay consistent.
func _do_draw_card(player_key: String) -> void:
	if _state.winner != "":
		return
	var p: Player = _state.player_by_key(player_key)
	if p == null:
		push_warning("_do_draw_card: unknown player_key '%s'" % player_key)
		return
	if p.library.is_empty():
		# Decked. Opponent wins immediately.
		_state.winner = _state.opponent_of(player_key)
		_state.append_log("%s tried to draw from an empty library — %s wins!" % [
			p.name, _state.player_by_key(_state.winner).name,
		])
		game_over.emit(_state.winner)
		return
	var card: CardInstance = p.library.pop_back()
	p.hand.append(card)
	_state.append_log("%s draws a card" % p.name)


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


# ─── Phase 4: triggered abilities ──────────────────────────────────────────
# Fire an event into the trigger system. Walks battlefield permanents (plus
# the event's own subject card, for leaves-the-battlefield triggers) and
# queues any matching triggered abilities into _state.pending_triggers.
#
# Triggers don't go on the stack here — they wait in the queue until a
# subsequent _drain_pending_triggers call (which APNAP-orders them and pushes
# to the stack). This matches MTG rule 603.2: triggers wait until "the next
# time a player would receive priority."
#
# Event shape:
#   {"kind": "card_etb" | "card_dies" | ..., "subject_iid": int,
#    "subject_card": CardInstance, ...other event-specific fields}
func _fire_event(event: Dictionary) -> void:
	var event_kind: String = event.get("kind", "")
	if event_kind == "":
		push_warning("_fire_event: event has no 'kind'; ignoring")
		return
	var subject_iid: int = event.get("subject_iid", -1)
	# Build the candidate listener set: every battlefield permanent, plus the
	# event's subject (so a card's own leave-play trigger can see itself even
	# after moving to the graveyard).
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
			# self_only: only fires when this source IS the event subject.
			# Used for "When ~ enters" / "When ~ dies" style triggers.
			if trig.get("self_only", false) and source.instance_id != subject_iid:
				continue
			# Predicate gate (B1). Empty predicate = always fires.
			var pred: String = trig.get("condition_predicate", "")
			if not Predicates.evaluate(pred, _state, source, event):
				_state.append_log("Trigger condition false for %s — skipping" % source.name())
				continue
			# Phase 4: triggers have no chosen targets (their effects use
			# hardcoded target specs like "opponent"). Phase 4.5+ will add
			# interactive target picking when trigger.effects need them.
			_state.pending_triggers.append({
				"source_iid": source.instance_id,
				"controller_key": source.controller_key,
				"ability_index": i,
				"event": event.duplicate(),
				"targets": [],
			})
			_state.append_log("Trigger queued: %s (%s)" % [source.name(), event_kind])


# Drain pending_triggers onto the stack in APNAP order.
# Per MTG 603.3b: each player, in APNAP order, puts their triggers on the
# stack in any order. So AP's triggers go on first (becoming the BOTTOM of
# the newly-pushed batch), then NAP's go on top — meaning NAP's resolve
# first (LIFO). Phase 4 simplification: within each player, triggers push
# in queue order.
#
# After pushing, priority resets to the active player and passes clear, so
# both players can respond before any trigger resolves.
# Phase 4.5b: pick the target for a queued trigger that's awaiting one.
# Legal only when state.awaiting_target_for_trigger is set AND the supplied
# target matches the trigger's declared filter.
func _legal_pick_trigger_target(action: Dictionary) -> bool:
	if _state == null or _state.winner != "":
		return false
	if _state.awaiting_target_for_trigger.is_empty():
		return false
	var target: Dictionary = action.get("target", {})
	if target.is_empty():
		return false
	return _target_matches_filter(target, _state.awaiting_target_for_trigger.filter)


# Validates a target descriptor against a filter string. Phase 4.5b supports:
#   - "creature_or_player": any player or any battlefield creature
#   - "creature":           any battlefield creature
#   - "player":             either player
# Future filters (hexproof, controller-restricted, etc.) extend this.
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
	# The awaiting trigger is at the head of pending_triggers (the drainer
	# halted there). Fill in its targets, then resume draining.
	if _state.pending_triggers.is_empty():
		push_warning("_do_pick_trigger_target: no pending trigger to fill")
		return false
	var trig: Dictionary = _state.pending_triggers[0]
	trig.targets = [target]
	_state.awaiting_target_for_trigger = {}
	var src: CardInstance = _find_card_anywhere(trig.source_iid)
	var src_name: String = src.name() if src != null else "?"
	_state.append_log("%s targets %s" % [src_name, _describe_targets([target])])
	# Resume the drain. The trig at index 0 now has targets so it'll push
	# this iteration. Any further triggers continue per APNAP.
	_drain_continue()
	return true


func _drain_pending_triggers() -> void:
	if _state.pending_triggers.is_empty():
		return
	# If we're already paused waiting on a target pick, don't double-drain.
	if not _state.awaiting_target_for_trigger.is_empty():
		return
	# Reorder the entire queue in APNAP order so that AP's triggers come
	# first (push first → bottom of stack → resolve last). Phase 4.5b adds
	# a sub-step: each trigger that needs an interactive target either picks
	# automatically (opp-controlled) or pauses the drain (you-controlled).
	var ap_key: String = _state.active_player_key
	var ap_triggers: Array[Dictionary] = []
	var nap_triggers: Array[Dictionary] = []
	for trig in _state.pending_triggers:
		if trig.controller_key == ap_key:
			ap_triggers.append(trig)
		else:
			nap_triggers.append(trig)
	# Single queue in resolution order: AP first, then NAP. We pop from the
	# front (FIFO) and push to the stack one at a time so a pause leaves the
	# tail in pending_triggers for the next drain. Rebuild the typed array
	# explicitly — concatenation widens the type and trips Godot's typed
	# assignment check.
	_state.pending_triggers.clear()
	for trig in ap_triggers:
		_state.pending_triggers.append(trig)
	for trig in nap_triggers:
		_state.pending_triggers.append(trig)
	_drain_continue()


# Phase 4.5b: pull triggers off the pending queue one at a time, resolving
# target picks as we go. Stops if a "you"-controlled trigger needs an
# interactive target (UI will issue KIND_PICK_TRIGGER_TARGET to resume).
func _drain_continue() -> void:
	while not _state.pending_triggers.is_empty():
		var trig: Dictionary = _state.pending_triggers[0]
		var filter: String = _trigger_target_filter(trig)
		if filter == "":
			# No target needed — push to stack directly.
			_state.pending_triggers.pop_front()
			_push_trigger_to_stack(trig)
			continue
		# Trigger needs a target. Two paths based on controller.
		if trig.controller_key == "you":
			# Pause drain; record what's awaiting for the UI.
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
			# Opp-controlled: AI picks the first legal target. Phase 5c will
			# replace this with the real AI; for now we mirror the Phase-3
			# stubs and target the player (since opp's only Phase-4.5 trigger
			# card, Pyromaniac, is "deal 1 to any target" — face damage is
			# the safe greedy pick).
			var auto_target := _auto_pick_trigger_target(filter, trig.controller_key)
			if auto_target.is_empty():
				# No legal target available — trigger fizzles silently.
				_state.pending_triggers.pop_front()
				_state.append_log("Trigger fizzles (no legal target)")
				continue
			trig.targets = [auto_target]
			_state.pending_triggers.pop_front()
			_push_trigger_to_stack(trig)
	# All triggers drained. Reset priority to AP so both players can respond
	# to whatever just hit the stack (MTG 116.5).
	_state.priority_player_key = _state.active_player_key
	_reset_priority_passes()


# Returns the target_filter string for this trigger, or "" if the ability
# doesn't need a chosen target. The filter lives on the trigger ability
# definition (CardResource.triggered_abilities[i].target_filter).
func _trigger_target_filter(trig: Dictionary) -> String:
	var source: CardInstance = _find_card_anywhere(trig.source_iid)
	if source == null or source.template == null:
		return ""
	var abilities: Array = source.template.triggered_abilities
	var idx: int = trig.ability_index
	if idx < 0 or idx >= abilities.size():
		return ""
	var ability: Dictionary = abilities[idx]
	# If targets are already filled (e.g., from auto-pick), no need to ask
	# again.
	if not trig.get("targets", []).is_empty():
		return ""
	return ability.get("target_filter", "")


# Phase 4.5b: simple opp-AI target picker. Returns the first legal target
# matching the filter, or an empty Dictionary if nothing is legal. For
# "creature_or_player" we prefer the opponent (Pyromaniac-style face-damage
# triggers) — Phase 5c's AI replaces this with real scoring.
func _auto_pick_trigger_target(filter: String, controller_key: String) -> Dictionary:
	var opp_key: String = _state.opponent_of(controller_key)
	match filter:
		"creature_or_player":
			# Greedy: target the opponent's life total.
			return {"kind": "player", "who": opp_key}
		"creature":
			# Greedy: target the first opposing creature on battlefield.
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
