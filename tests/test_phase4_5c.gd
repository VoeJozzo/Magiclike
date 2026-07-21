extends Node

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 4.5c smoke test ===\n")

	# ─── Scenario A: Healing Salve gains 3 life ─────────────────────────────
	# Start at 17 life so the +3 gain from Healing Salve is visibly distinct.
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	s.you.life = 17
	var plains := s.make_instance(CardDatabase.get_card("plains"), "you")
	plains.summoning_sick = false
	s.you.battlefield.append(plains)
	var salve := s.make_instance(CardDatabase.get_card("healing_salve"), "you")
	s.you.hand.append(salve)

	var ok = RulesEngine.execute_action(Action.make_tap_land_for_mana(plains.instance_id))
	_assert_true(ok, "tap Plains for W")
	_assert_eq(s.you.mana.pool["W"], 1, "have W in pool")

	# gain_life applies to controller — no target needed.
	ok = RulesEngine.execute_action(Action.make_cast_spell(salve.instance_id, []))
	_assert_true(ok, "cast Healing Salve")
	_assert_eq(s.stack.size(), 1, "Salve on stack")

	# Pass priority twice → resolves
	RulesEngine.execute_action(Action.make_pass_priority())
	_assert_eq(s.stack.size(), 0, "Salve resolved")
	_assert_eq(s.you.life, 20, "you gained 3 life (17 → 20)")

	# ─── Scenario B: Counterspell removes opp's Lightning Bolt ──────────────
	RulesEngine.init_phase1()
	s = RulesEngine.state()
	s.you.battlefield.clear()
	s.you.hand.clear()
	s.opp.battlefield.clear()
	s.opp.hand.clear()
	for i in range(2):
		var isl := s.make_instance(CardDatabase.get_card("island"), "you")
		isl.summoning_sick = false
		s.you.battlefield.append(isl)
	var cspell := s.make_instance(CardDatabase.get_card("counterspell"), "you")
	s.you.hand.append(cspell)
	var opp_mtn := s.make_instance(CardDatabase.get_card("mountain"), "opp")
	opp_mtn.summoning_sick = false
	s.opp.battlefield.append(opp_mtn)
	var opp_bolt := s.make_instance(CardDatabase.get_card("lightning_bolt"), "opp")
	s.opp.hand.append(opp_bolt)

	# cast_spell requires priority + mana we haven't set up here, so mimic
	# _do_cast_spell directly to inject the Bolt onto the stack.
	_simulate_cast_for(s, "opp", opp_bolt, [{"kind": "player", "who": "you"}])
	_assert_eq(s.stack.size(), 1, "opp's Bolt on stack (simulated)")

	RulesEngine.execute_action(Action.make_tap_land_for_mana(s.you.battlefield[0].instance_id))
	RulesEngine.execute_action(Action.make_tap_land_for_mana(s.you.battlefield[1].instance_id))
	_assert_eq(s.you.mana.pool["U"], 2, "have UU for Counterspell")

	var target := {"kind": "stack", "iid": opp_bolt.instance_id}
	ok = RulesEngine.execute_action(Action.make_cast_spell(cspell.instance_id, [target]))
	_assert_true(ok, "cast Counterspell at opp's Bolt")
	_assert_eq(s.stack.size(), 2, "stack now has [Bolt, Counterspell]")

	# Stack resolves LIFO — Counterspell is on top. Passing here triggers
	# opp's auto-pass, resolving Counterspell.
	RulesEngine.execute_action(Action.make_pass_priority())
	_assert_eq(s.stack.size(), 0, "Counterspell countered Bolt — both off the stack")
	_assert_eq(s.you.life, 20, "you took no damage — Bolt was countered before resolution")
	# Countered spells go to the owner's graveyard.
	var bolt_in_gy: bool = false
	for c in s.opp.graveyard:
		if c == opp_bolt:
			bolt_in_gy = true
			break
	_assert_true(bolt_in_gy, "Bolt landed in opp's graveyard after being countered")

	# ─── Scenario C: card pool members instantiate correctly ────────────────
	var bear_cub := CardDatabase.get_card("bear_cub")
	_assert_eq(bear_cub.power, 1, "Bear Cub is 1 power")
	_assert_eq(bear_cub.toughness, 1, "Bear Cub is 1 toughness")
	var gray_ogre := CardDatabase.get_card("gray_ogre")
	_assert_eq(gray_ogre.power, 2, "Gray Ogre is 2 power")
	_assert_eq(gray_ogre.toughness, 2, "Gray Ogre is 2 toughness")
	var hill_giant := CardDatabase.get_card("hill_giant")
	_assert_eq(hill_giant.power, 3, "Hill Giant is 3 power")
	_assert_eq(hill_giant.toughness, 3, "Hill Giant is 3 toughness")
	_assert_eq(CardDatabase.get_card("plains").mana_produced, ["W"], "Plains produces W")
	_assert_eq(CardDatabase.get_card("island").mana_produced, ["U"], "Island produces U")
	_assert_eq(CardDatabase.get_card("swamp").mana_produced, ["B"], "Swamp produces B")
	_assert_eq(CardDatabase.get_card("mountain").mana_produced, ["R"], "Mountain produces R")
	_assert_eq(CardDatabase.get_card("forest").mana_produced, ["G"], "Forest produces G")

	print("")
	if failures == 0:
		print("=== Phase 4.5c smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 4.5c smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# Forces a card onto the stack as a spell entry, bypassing normal cast
# legality checks — lets a test inject a cast without driving a full turn.
func _simulate_cast_for(
	s: EngineState,
	controller_key: String,
	card: CardInstance,
	targets: Array
) -> void:
	var controller: Player = s.player_by_key(controller_key)
	controller.hand.erase(card)
	s.stack.push({
		"kind": "spell",
		"source_iid": card.instance_id,
		"controller_key": controller_key,
		"targets": targets,
	})
	# RulesEngine owns the held-cards buffer; reach in via its API.
	RulesEngine._stack_held_cards[card.instance_id] = card


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
