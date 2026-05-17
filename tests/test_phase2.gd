extends Node

# Phase 2 smoke test. Exercises the full path:
#   - play_land
#   - cast a creature spell (resolves to battlefield with summoning sickness)
#   - end turn (opp's turn auto-cycles via _settle_state)
#   - untap step clears summoning sickness
#   - declare_attacker action (taps the creature)
#   - combat damage resolution (deals 2 to opp)
#
# Scenario: starts from init_phase2 state (1 Mountain in play, 3 Mountains
# in hand, 1 Goblin Raider, 1 Lightning Bolt). We don't cast Bolt — just
# play a second Mountain, cast Goblin, end turn, attack with Goblin.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 2 smoke test ===\n")

	RulesEngine.init_phase2()
	var s: EngineState = RulesEngine.state()

	# Initial state assertions
	_assert_eq(s.you.battlefield.size(), 1, "starting you.battlefield (1 Mountain)")
	_assert_eq(s.you.hand.size(), 5, "starting you.hand (3 Mtn + Goblin + Bolt)")
	_assert_eq(s.opp.life, 20, "starting opp.life")
	_assert_eq(s.phase_machine.current, PhaseMachine.Phase.MAIN1, "starting phase")

	# Find the cards we need
	var existing_mtn: CardInstance = s.you.battlefield[0]
	var hand_mtn: CardInstance = null
	var goblin: CardInstance = null
	for c in s.you.hand:
		if c.template.card_id == "mountain" and hand_mtn == null:
			hand_mtn = c
		elif c.template.card_id == "goblin_raider":
			goblin = c
	assert(hand_mtn != null, "Expected a Mountain in hand")
	assert(goblin != null, "Expected Goblin Raider in hand")

	# Step 1: play a second Mountain
	var ok = RulesEngine.execute_action(Action.make_play_land(hand_mtn.instance_id))
	_assert_true(ok, "play Mountain succeeded")
	_assert_eq(s.you.battlefield.size(), 2, "battlefield now has 2 Mountains")
	_assert_true(s.you.land_played_this_turn, "land_played_this_turn flag set")

	# Step 2: tap the existing mountain for R
	ok = RulesEngine.execute_action(Action.make_activate_ability(existing_mtn.instance_id))
	_assert_true(ok, "tap mountain succeeded")
	_assert_eq(s.you.mana.pool["R"], 1, "mana.R after tap")

	# Step 3: cast Goblin Raider (sorcery-speed, no target needed)
	ok = RulesEngine.execute_action(Action.make_cast_spell(goblin.instance_id, []))
	_assert_true(ok, "cast Goblin succeeded")
	_assert_eq(s.stack.size(), 1, "Goblin on stack")
	_assert_eq(s.you.mana.pool["R"], 0, "mana paid")

	# Step 4: pass priority → resolves
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority (resolve Goblin)")
	_assert_eq(s.stack.size(), 0, "stack empty")
	_assert_eq(s.you.battlefield.size(), 3, "battlefield now has 2 Mtn + Goblin")
	_assert_true(goblin.summoning_sick, "Goblin has summoning sickness")
	_assert_eq(goblin.controller_key, "you", "Goblin controlled by you")

	# Step 5: pass through end of turn. Phase machine: MAIN1 → COMBAT_ATTACK
	# → COMBAT_BLOCK → COMBAT_DAMAGE → MAIN2 → END → CLEANUP → wrap → opp UNTAP
	# → opp's whole turn auto-cycles via _settle_state → wrap again → your UNTAP.
	# Each Pass advances one phase. Player needs to click through ~7 phases to
	# wrap. Let's verify the auto-cycle works by passing repeatedly until turn 2.
	# Phase 5c: AI-driven opp now stops at every priority-pass round instead
	# of auto-cycling through its whole turn, so we may need more iterations
	# AND we need to actually wait until we're back on the player's turn.
	var phase_passes: int = 0
	while not (s.turn >= 2 and s.active_player_key == "you") and phase_passes < 60:
		RulesEngine.execute_action(Action.make_pass_priority())
		phase_passes += 1
	_assert_true(s.turn >= 2 and s.active_player_key == "you", "advanced to your turn 2 (took %d passes)" % phase_passes)
	_assert_eq(s.active_player_key, "you", "back to your turn")

	# Step 6: untap step should have cleared summoning sickness on Goblin
	# and untapped both Mountains.
	_assert_true(not goblin.summoning_sick, "Goblin no longer summoning sick")
	for c in s.you.battlefield:
		if c.template.card_id == "mountain":
			_assert_true(not c.tapped, "Mountain untapped at start of turn 2")

	# Step 7: advance to COMBAT_ATTACK and declare Goblin as attacker
	while s.phase_machine.current != PhaseMachine.Phase.COMBAT_ATTACK:
		RulesEngine.execute_action(Action.make_pass_priority())
		# safety: bail if we've cycled back to MAIN1
		if s.phase_machine.current == PhaseMachine.Phase.UNTAP and s.turn > 2:
			break

	_assert_eq(s.phase_machine.current, PhaseMachine.Phase.COMBAT_ATTACK, "in COMBAT_ATTACK")

	ok = RulesEngine.execute_action(Action.make_declare_attacker(goblin.instance_id))
	_assert_true(ok, "declare Goblin as attacker")
	_assert_eq(s.attackers.size(), 1, "1 attacker declared")
	_assert_true(goblin.tapped, "Goblin tapped after attacking")

	# Step 8: pass priority to resolve combat damage
	# Expected: Goblin's 2 power → opp.life 20 → 18
	# Pass advances COMBAT_ATTACK → COMBAT_BLOCK → COMBAT_DAMAGE (which fires
	# _resolve_combat_damage on entry).
	var prev_opp_life: int = s.opp.life
	while s.phase_machine.current != PhaseMachine.Phase.MAIN2 and phase_passes < 50:
		RulesEngine.execute_action(Action.make_pass_priority())
		phase_passes += 1
	_assert_eq(s.opp.life, prev_opp_life - 2, "opp took 2 combat damage (now %d)" % s.opp.life)

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 2 smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 2 smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


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
