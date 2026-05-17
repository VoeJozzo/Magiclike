extends Node

# Phase 5c smoke test. Validates the AI port — both opp's behaviour during
# normal play and full-game AI-vs-AI completion.
#
# Scenarios:
#   1. AI.decide on a blank/idle state returns pass_priority cleanly.
#   2. AI.decide picks a target for a Pyromaniac ETB trigger when opp
#      controls Pyromaniac.
#   3. simulate_combat returns sensible damage/death numbers for a
#      2/2 vs 2/2 trade.
#   4. AI-vs-AI: both sides driven by AI.decide, played from init_phase5_demo
#      until winner or 200-turn cap. Game must reach a winner.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 5c smoke test ===\n")
	_test_decide_idle_pass()
	_test_decide_trigger_target()
	_test_simulate_combat_trade()
	_test_ai_vs_ai_completes()

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 5c smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 5c smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# ─── Tests ────────────────────────────────────────────────────────────────

func _test_decide_idle_pass() -> void:
	# Fresh state, opp's main phase but opp has nothing to do (empty hand +
	# battlefield except a Mountain). AI should pass priority.
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	s.opp.hand.clear()
	s.opp.battlefield.clear()
	# Give opp a tapped Mountain (no mana ability available).
	var mtn := s.make_instance(CardDatabase.get_card("mountain"), "opp")
	mtn.tapped = true
	s.opp.battlefield.append(mtn)
	var action := AI.decide(s, "opp")
	_assert_eq(action.kind, Action.KIND_PASS_PRIORITY, "AI.decide passes when no actions available")


func _test_decide_trigger_target() -> void:
	# Synthesize state.awaiting_target_for_trigger as if opp's Pyromaniac
	# just entered and needs a target.
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	var pyro := s.make_instance(CardDatabase.get_card("pyromaniac"), "opp")
	pyro.summoning_sick = false
	s.opp.battlefield.append(pyro)
	# Manually set the awaiting state.
	s.awaiting_target_for_trigger = {
		"source_iid": pyro.instance_id,
		"controller_key": "opp",
		"ability_index": 0,
		"filter": "creature_or_player",
	}
	var action := AI.decide(s, "opp")
	_assert_eq(action.kind, Action.KIND_PICK_TRIGGER_TARGET, "AI picks a trigger target")
	_assert_eq(action.target.kind, "player", "AI picks player target (face damage)")
	_assert_eq(action.target.who, "you", "AI targets opponent (you)")


func _test_simulate_combat_trade() -> void:
	# Two 2/2 vanilla bears trade — both should die.
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	s.you.battlefield.clear()
	s.opp.battlefield.clear()
	var atk := s.make_instance(CardDatabase.get_card("grizzly_bears"), "you")
	atk.summoning_sick = false
	s.you.battlefield.append(atk)
	var blk := s.make_instance(CardDatabase.get_card("grizzly_bears"), "opp")
	blk.summoning_sick = false
	s.opp.battlefield.append(blk)
	var outcome := AICombat.simulate_combat(
		s, "you", [atk.instance_id], {blk.instance_id: atk.instance_id}
	)
	_assert_true(atk.instance_id in outcome.dead_attackers, "simulate: 2/2 attacker dies in trade")
	_assert_true(blk.instance_id in outcome.dead_blockers, "simulate: 2/2 blocker dies in trade")
	_assert_eq(outcome.damage_to_defender, 0, "simulate: no face damage on full trade")


func _test_ai_vs_ai_completes() -> void:
	# AI-vs-AI from the Phase 5 showcase deck. Play until winner or hard cap.
	RulesEngine.init_phase5_demo()
	var s: EngineState = RulesEngine.state()
	# Drive both sides via AI. We loop over execute_action, alternating
	# explicit AI.decide calls for "you" since _settle_state only drives opp.
	var action_count: int = 0
	var max_actions: int = 5000  # generous — 40-card decks, AI takes many small actions
	while s.winner == "" and action_count < max_actions:
		# When _current_actor would be "you", drive you via AI too (this is
		# the AI-vs-AI mode).
		var actor: String = _current_actor(s)
		var action: Dictionary = AI.decide(s, actor)
		if action.is_empty():
			action = Action.make_pass_priority()
		var ok = RulesEngine.execute_action(action)
		if not ok:
			# Action was rejected. Log and force a pass to avoid livelock.
			RulesEngine.execute_action(Action.make_pass_priority())
		action_count += 1
	_assert_true(s.winner != "", "AI vs AI reached a winner (took %d actions)" % action_count)
	_assert_true(s.you.life <= 0 or s.opp.life <= 0 or _is_decked(s),
		"winner condition is life≤0 OR deck-out")
	print("    Winner: %s — actions: %d  life: you=%d opp=%d" % [
		s.winner, action_count, s.you.life, s.opp.life
	])


# Mirror of RulesEngine._current_actor for test-driver use.
func _current_actor(s: EngineState) -> String:
	if not s.awaiting_target_for_trigger.is_empty():
		return s.awaiting_target_for_trigger.get("controller_key", s.priority_player_key)
	# Mirror engine's _current_actor: when awaiting block declaration, the
	# defender is the actor regardless of (absent) priority.
	if s.awaiting_block_declaration:
		return s.opponent_of(s.active_player_key)
	return s.priority_player_key


func _is_decked(s: EngineState) -> bool:
	return s.you.library.is_empty() or s.opp.library.is_empty()


func _assert_eq(actual, expected, name: String) -> void:
	if actual == expected:
		print("  ✓ %s = %s" % [name, str(actual)])
	else:
		print("  ✗ %s: expected %s, got %s" % [name, str(expected), str(actual)])
		failures += 1


func _assert_true(condition: bool, name: String) -> void:
	if condition:
		print("  ✓ %s" % name)
	else:
		print("  ✗ %s (expected true)" % name)
		failures += 1
