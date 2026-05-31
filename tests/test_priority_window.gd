extends Node

# Slice 0 (priority-window refactor) tests — B6 auto-pass + B7 end-turn.
#
# IMPORTANT: authored WITHOUT a Godot runtime (no godot binary in the dev
# container where this was written). The predicate-level cases below are
# deterministic pure-state reads and are high-confidence. The full
# fast-forward *behavior* scenarios from plan §6 step 5 (B7 end-turn cascade,
# trigger-interrupt-then-resume, flag-clear-on-next-turn, etc.) are NOT yet
# encoded here because their end-states depend on the live settle cascade and
# must be observed in a real run. See the [GODOT-QA] checklist at the bottom.
#
# Run via:
#   <godot> --headless --quit res://tests/test_priority_window.tscn

var failures: int = 0


func _ready() -> void:
	print("\n=== Priority-window (B6/B7) tests ===\n")
	_test_can_pay_potential()
	_test_has_no_meaningful_action()
	_test_should_auto_pass()
	_test_legal_end_turn()
	_test_end_turn_enumerated()

	print("")
	if failures == 0:
		print("=== Priority-window tests: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Priority-window tests: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# _can_pay_potential folds untapped lands into affordability (proto canPayPotential).
func _test_can_pay_potential() -> void:
	print("-- _can_pay_potential --")
	RulesEngine.init_phase1()  # you: 2 untapped Mountains, empty pool, Bolt in hand
	_assert_true(RulesEngine._can_pay_potential("you", {"R": 1}),
		"R:1 payable via 2 untapped Mountains (no floated mana)")
	_assert_true(RulesEngine._can_pay_potential("you", {"R": 2}),
		"R:2 payable via 2 untapped Mountains")
	_assert_true(not RulesEngine._can_pay_potential("you", {"R": 3}),
		"R:3 NOT payable (only 2 Mountains)")
	_assert_true(RulesEngine._can_pay_potential("you", {"C": 2}),
		"2 generic payable via 2 Mountains")

	# After tapping both Mountains, potential == floated (no untapped lands left).
	var s: EngineState = RulesEngine.state()
	for c in s.you.battlefield:
		c.tapped = true
	s.you.mana.add("R", 2)
	_assert_true(RulesEngine._can_pay_potential("you", {"R": 2}),
		"R:2 payable from floated pool when all lands tapped")
	_assert_true(not RulesEngine._can_pay_potential("you", {"R": 3}),
		"R:3 NOT payable (2 floated, 0 untapped lands)")


# B6 core + case "mana abilities alone do NOT prevent auto-pass".
func _test_has_no_meaningful_action() -> void:
	print("-- _has_no_meaningful_action --")
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	_assert_true(not RulesEngine._has_no_meaningful_action("you"),
		"Bolt (instant) castable via potential mana → has a meaningful action")

	# Empty hand, untapped Mountains, MAIN1: only mana taps remain → no action.
	s.you.hand.clear()
	_assert_true(RulesEngine._has_no_meaningful_action("you"),
		"empty hand + untapped lands → mana taps don't count, no meaningful action")


# B6 + B7 gating combined.
func _test_should_auto_pass() -> void:
	print("-- _should_auto_pass --")
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	_assert_true(not RulesEngine._should_auto_pass("you"),
		"MAIN1 with castable Bolt → no auto-pass")

	s.you.hand.clear()
	_assert_true(RulesEngine._should_auto_pass("you"),
		"MAIN1 empty hand → auto-pass (B6)")

	# AP empty-stack END step auto-passes even with a castable instant in hand.
	RulesEngine.init_phase1()
	s = RulesEngine.state()
	s.phase_machine.current = PhaseMachine.Phase.END
	_assert_true(RulesEngine._should_auto_pass("you"),
		"AP END step, empty stack → auto-pass even holding Bolt (proto skipApEndStep)")

	# end_turn_pending forces auto-pass for the AP on an empty stack mid-turn.
	RulesEngine.init_phase1()
	s = RulesEngine.state()
	s.end_turn_pending = true
	_assert_true(RulesEngine._should_auto_pass("you"),
		"end_turn_pending + empty stack → auto-pass even holding Bolt (B7)")


func _test_legal_end_turn() -> void:
	print("-- _legal_end_turn --")
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	_assert_true(RulesEngine._legal_end_turn({}),
		"end-turn legal: AP, MAIN1, empty stack, holds priority")

	s.stack.push({"kind": "spell", "source_iid": -1, "controller_key": "you", "targets": []})
	_assert_true(not RulesEngine._legal_end_turn({}),
		"end-turn illegal while stack non-empty")
	s.stack.entries.clear()

	s.priority_player_key = "opp"
	_assert_true(not RulesEngine._legal_end_turn({}),
		"end-turn illegal when not holding priority")


func _test_end_turn_enumerated() -> void:
	print("-- end-turn in legal actions --")
	RulesEngine.init_phase1()
	var has_end_turn := false
	for a in RulesEngine.get_legal_actions("you"):
		if a.get("kind", "") == Action.KIND_END_TURN:
			has_end_turn = true
	_assert_true(has_end_turn, "KIND_END_TURN enumerated for AP at MAIN1")


func _assert_true(condition: bool, name: String) -> void:
	if condition:
		print("  ✓ %s" % name)
	else:
		print("  ✗ %s (expected true)" % name)
		failures += 1


# [GODOT-QA] Behavioral scenarios needing a real run (plan §6 step 5):
#   - B7 cast KIND_END_TURN in MAIN1 → fast-forwards your turn to cleanup/opp.
#   - End-turn at COMBAT_ATTACK before declaring → empty attackers committed.
#   - End-turn with a trigger firing mid-fast-forward → pauses for instant
#     response; pass resumes, or acting (re-engagement) clears end_turn_pending.
#   - end_turn_pending clears on UNTAP of next turn.
#   - Existing test_phase1..5c: re-run and RECONCILE — B6 now auto-resolves
#     spells once the caster has no further action, so any test that cast a
#     spell and then asserted "stack has 1 entry" before an explicit pass needs
#     its intermediate assertions updated. Do this with the runner's output in
#     hand, not blind.
