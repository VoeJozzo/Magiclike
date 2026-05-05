extends Node

# Phase 1 smoke test. Runs headlessly — no UI required.
#
# Scenario (per docs/godot-port-plan.md):
#   1. Boot engine: you = {life:20, hand:[Bolt], battlefield:[Mtn, Mtn]},
#      opp = {life:20, no permanents}.
#   2. Activate Mountain 0 → mana pool R == 1.
#   3. Activate Mountain 1 → mana pool R == 2.
#   4. Cast Lightning Bolt at opp → stack has 1 entry, mana drops to R == 1.
#   5. Both auto-pass priority → stack empties, opp.life == 17, Bolt in graveyard,
#      both Mountains tapped.
#
# Run via:
#   "/c/Program Files (x86)/Steam/steamapps/common/Godot Engine/godot.windows.opt.tools.64.exe" \
#     --headless --quit res://tests/test_phase1.tscn

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 1 smoke test ===\n")

	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()

	# Step 0: initial state
	_assert_eq(s.you.life, 20, "starting you.life")
	_assert_eq(s.opp.life, 20, "starting opp.life")
	_assert_eq(s.you.hand.size(), 1, "you.hand size")
	_assert_eq(s.you.battlefield.size(), 2, "you.battlefield size")
	_assert_eq(s.you.mana.pool["R"], 0, "starting mana.R")
	_assert_eq(s.stack.size(), 0, "starting stack size")
	_assert_eq(s.priority_player_key, "you", "starting priority")

	var mtn0: CardInstance = s.you.battlefield[0]
	var mtn1: CardInstance = s.you.battlefield[1]
	var bolt: CardInstance = s.you.hand[0]

	# Step 1: tap Mountain 0
	var ok = RulesEngine.execute_action(Action.make_activate_ability(mtn0.instance_id))
	_assert_true(ok, "tap mtn0 succeeded")
	_assert_true(mtn0.tapped, "mtn0 is now tapped")
	_assert_eq(s.you.mana.pool["R"], 1, "mana.R after first tap")

	# Step 2: tap Mountain 1
	ok = RulesEngine.execute_action(Action.make_activate_ability(mtn1.instance_id))
	_assert_true(ok, "tap mtn1 succeeded")
	_assert_true(mtn1.tapped, "mtn1 is now tapped")
	_assert_eq(s.you.mana.pool["R"], 2, "mana.R after second tap")

	# Step 3: cast Lightning Bolt at opp
	var cast_action := Action.make_cast_spell(
		bolt.instance_id,
		[Action.target_player("opp")]
	)
	ok = RulesEngine.execute_action(cast_action)
	_assert_true(ok, "cast Bolt succeeded")
	_assert_eq(s.stack.size(), 1, "stack has 1 entry after cast")
	_assert_eq(s.you.mana.pool["R"], 1, "mana.R drops to 1 after paying R")
	_assert_eq(s.you.hand.size(), 0, "Bolt left hand")

	# Step 4: pass priority — your pass triggers opp auto-pass and resolution.
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority succeeded")
	_assert_eq(s.stack.size(), 0, "stack empty after resolution")
	_assert_eq(s.opp.life, 17, "opp life dropped to 17 (took 3 damage)")
	_assert_eq(s.you.graveyard.size(), 1, "Bolt moved to your graveyard")
	_assert_eq(s.you.graveyard[0].name(), "Lightning Bolt", "graveyard top is Bolt")

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 1 smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 1 smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	# Quit with non-zero on failure so the headless run signals it
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
