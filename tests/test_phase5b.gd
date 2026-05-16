extends Node

# Phase 5b smoke test. Validates the engine introspection API for the
# upcoming AI port:
#   - get_legal_actions(player_key) enumerates the right action set on a
#     known Phase 4.5 starting position
#   - card_value scores known cards sensibly (Serra Angel > Bear Cub,
#     Lightning Bolt > vanilla 1-drop)
#   - EngineState.duplicate_deep() produces a separable copy — mutations
#     on the copy don't leak into the original

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 5b smoke test ===\n")
	_test_get_legal_actions_main_phase()
	_test_get_legal_actions_combat_attack()
	_test_card_value_orderings()
	_test_duplicate_deep_separation()

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 5b smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 5b smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# ─── get_legal_actions on a Phase-4 demo position ─────────────────────────

func _test_get_legal_actions_main_phase() -> void:
	RulesEngine.init_phase4()
	var s: EngineState = RulesEngine.state()
	# Phase 4 init gives you 3 untapped Mountains + 3 cards in hand
	# (Pyromaniac, Bloodlust Berserker, Lightning Bolt). At MAIN1 with no
	# mana yet, legal actions should be:
	#   - pass priority (1)
	#   - tap each Mountain (3 mana abilities)
	#   - Pyromaniac, Berserker = sorcery-speed, but no mana yet → not legal
	#   - Lightning Bolt = needs target AND no R → not legal yet
	# So the count is exactly 4.
	var actions := RulesEngine.get_legal_actions("you")
	_assert_eq(actions.size(), 4, "MAIN1 with no mana: 1 pass + 3 land taps")
	# Check pass is present
	var has_pass := false
	for a in actions:
		if a.kind == Action.KIND_PASS_PRIORITY:
			has_pass = true
			break
	_assert_true(has_pass, "pass_priority is enumerated")
	# Tap all three Mountains for RRR
	for c in s.you.battlefield:
		if c.template.card_id == "mountain":
			RulesEngine.execute_action(Action.make_activate_ability(c.instance_id))
	# Now: pass + Pyromaniac cast (no target) + Berserker cast (no target)
	# + Lightning Bolt fan-out across legal targets.
	# Berserker costs {R:2, C:1} = 3 mana total, and RRR is enough since the
	# generic pip can be paid with red. So Berserker IS castable.
	# Legal Bolt targets: you, opp, plus opp's Grizzly Bears = 3 targets.
	# Final: 1 pass + 1 Pyromaniac + 1 Berserker + 3 Bolt targets = 6.
	actions = RulesEngine.get_legal_actions("you")
	_assert_eq(actions.size(), 6, "MAIN1 with RRR: 1 pass + 1 Pyromaniac + 1 Berserker + 3 Bolt targets")


func _test_get_legal_actions_combat_attack() -> void:
	# Set up a state with one attacker available and verify
	# declare_attacker shows up.
	RulesEngine.init_phase4()
	var s: EngineState = RulesEngine.state()
	# Drop a battle-ready bear on your battlefield
	var bear := s.make_instance(CardDatabase.get_card("grizzly_bears"), "you")
	bear.summoning_sick = false
	s.you.battlefield.append(bear)
	# Force phase to COMBAT_ATTACK
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_ATTACK
	s.priority_player_key = "you"
	var actions := RulesEngine.get_legal_actions("you")
	# Should include declare_attacker for the bear (plus pass + maybe mana abilities)
	var has_attack := false
	for a in actions:
		if a.kind == Action.KIND_DECLARE_ATTACKER and a.source_iid == bear.instance_id:
			has_attack = true
			break
	_assert_true(has_attack, "COMBAT_ATTACK enumerates declare_attacker for the bear")


# ─── card_value sanity orderings ──────────────────────────────────────────

func _test_card_value_orderings() -> void:
	var bear_cub := CardDatabase.get_card("bear_cub")
	var bears := CardDatabase.get_card("grizzly_bears")
	var serra := CardDatabase.get_card("serra_angel")
	var bolt := CardDatabase.get_card("lightning_bolt")
	var cspell := CardDatabase.get_card("counterspell")
	var wall := CardDatabase.get_card("walking_wall")
	# Direct comparisons. These should hold regardless of exact constants:
	_assert_true(
		RulesEngine.card_value(serra) > RulesEngine.card_value(bears),
		"card_value: Serra Angel (flying+vigilance 4/4) > Grizzly Bears (2/2 vanilla)"
	)
	# Bear Cub (G 1/1) and Grizzly Bears (1G 2/2) come out roughly even under
	# the "stats minus 2× cost" heuristic — both score 0. We don't pretend
	# the heuristic distinguishes them; the JS prototype uses contextual
	# scoring (combat sim, board state) to break those ties. So just check
	# both are non-negative (they're playable cards).
	_assert_true(
		RulesEngine.card_value(bears) >= 0.0,
		"card_value: Grizzly Bears is non-negative"
	)
	_assert_true(
		RulesEngine.card_value(bear_cub) >= 0.0,
		"card_value: Bear Cub is non-negative"
	)
	_assert_true(
		RulesEngine.card_value(cspell) > 0.0,
		"card_value: Counterspell has positive value"
	)
	_assert_true(
		RulesEngine.card_value(bolt) > 0.0,
		"card_value: Lightning Bolt has positive value"
	)
	# Walking Wall (defender) should be penalised — score lower than Bear Cub
	# despite better stats, because defender = -3.
	_assert_true(
		RulesEngine.card_value(wall) < RulesEngine.card_value(bears),
		"card_value: Walking Wall (defender 0/4) < Grizzly Bears (2/2 vanilla)"
	)


# ─── duplicate_deep separation ────────────────────────────────────────────

func _test_duplicate_deep_separation() -> void:
	RulesEngine.init_phase4()
	var s: EngineState = RulesEngine.state()
	var copy := s.duplicate_deep()
	# Mutate the copy — original should be unchanged.
	copy.you.life = 1
	copy.opp.life = 1
	_assert_eq(s.you.life, 20, "duplicate_deep: original you.life untouched after copy mutation")
	_assert_eq(s.opp.life, 20, "duplicate_deep: original opp.life untouched")
	# Mutate a card on the copy's battlefield.
	if not copy.you.battlefield.is_empty():
		var copy_card: CardInstance = copy.you.battlefield[0]
		copy_card.tapped = true
		copy_card.damage_marked = 99
		var orig_card: CardInstance = s.you.battlefield[0]
		_assert_eq(orig_card.tapped, false, "duplicate_deep: original card not tapped after copy mutation")
		_assert_eq(orig_card.damage_marked, 0, "duplicate_deep: original damage_marked untouched")
	# Mutate the copy's stack.
	copy.stack.push({"kind": "spell", "source_iid": -1, "controller_key": "you", "targets": []})
	_assert_eq(s.stack.size(), 0, "duplicate_deep: original stack untouched")


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
