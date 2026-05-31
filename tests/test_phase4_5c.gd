extends Node

# Phase 4.5c smoke test. Validates the new card pool additions:
#   - Healing Salve (W instant: gain 3 life) — exercises the gain_life
#     effect handler.
#   - Counterspell (UU instant: counter target spell) — exercises the
#     counter effect, stack-as-target, and the engine's
#     counter_stack_entry helper.
#   - Basic lands across all five colors (Plains/Island/Swamp added).
#   - Vanilla creature curve (Bear Cub 1/1, Gray Ogre 2/2, Hill Giant 3/3)
#     all instantiate via CardDatabase and the new card_ids.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 4.5c smoke test ===\n")

	# ─── Scenario A: Healing Salve gains 3 life ─────────────────────────────
	# Build a minimal state — you've got a Plains in play, a Healing Salve in
	# hand, you start at 17 life so a +3 gain is visibly distinct.
	RulesEngine.init_phase1()  # gives us a base state; we'll mutate
	var s: EngineState = RulesEngine.state()
	s.you.life = 17
	# Drop a Plains on you's battlefield + Healing Salve in hand.
	var plains := s.make_instance(CardDatabase.get_card("plains"), "you")
	plains.summoning_sick = false
	s.you.battlefield.append(plains)
	var salve := s.make_instance(CardDatabase.get_card("healing_salve"), "you")
	s.you.hand.append(salve)

	# Tap Plains for W
	var ok = RulesEngine.execute_action(Action.make_tap_land_for_mana(plains.instance_id))
	_assert_true(ok, "tap Plains for W")
	_assert_eq(s.you.mana.pool["W"], 1, "have W in pool")

	# Cast Healing Salve (no target — gain_life applies to controller)
	ok = RulesEngine.execute_action(Action.make_cast_spell(salve.instance_id, []))
	_assert_true(ok, "cast Healing Salve")
	_assert_eq(s.stack.size(), 1, "Salve on stack")

	# Pass priority twice → resolves
	RulesEngine.execute_action(Action.make_pass_priority())
	_assert_eq(s.stack.size(), 0, "Salve resolved")
	_assert_eq(s.you.life, 20, "you gained 3 life (17 → 20)")

	# ─── Scenario B: Counterspell removes opp's Lightning Bolt ──────────────
	# Set up: opp casts Bolt at you; you counter it. Opp's Bolt should land in
	# their graveyard, no damage dealt.
	RulesEngine.init_phase1()
	s = RulesEngine.state()
	# Reshape: we need opp to be active and casting at us.
	# Simplest: hand-craft the state. Opp has 1 Mountain in play and Bolt in
	# hand. You have 2 Islands and a Counterspell. You start with priority.
	# We'll simulate the opp's cast by directly pushing onto the stack, then
	# you counter it.
	s.you.battlefield.clear()
	s.you.hand.clear()
	s.opp.battlefield.clear()
	s.opp.hand.clear()
	# You: 2 Islands + Counterspell
	for i in range(2):
		var isl := s.make_instance(CardDatabase.get_card("island"), "you")
		isl.summoning_sick = false
		s.you.battlefield.append(isl)
	var cspell := s.make_instance(CardDatabase.get_card("counterspell"), "you")
	s.you.hand.append(cspell)
	# Opp: 1 Mountain + Bolt
	var opp_mtn := s.make_instance(CardDatabase.get_card("mountain"), "opp")
	opp_mtn.summoning_sick = false
	s.opp.battlefield.append(opp_mtn)
	var opp_bolt := s.make_instance(CardDatabase.get_card("lightning_bolt"), "opp")
	s.opp.hand.append(opp_bolt)

	# Inject opp's Bolt onto the stack (simulating mid-resolution). We can't
	# just call cast_spell as opp because that requires priority + mana etc.
	# Instead, mimic what _do_cast_spell does. Use a small helper.
	_simulate_cast_for(s, "opp", opp_bolt, [{"kind": "player", "who": "you"}])
	_assert_eq(s.stack.size(), 1, "opp's Bolt on stack (simulated)")

	# Tap both Islands for UU
	RulesEngine.execute_action(Action.make_tap_land_for_mana(s.you.battlefield[0].instance_id))
	RulesEngine.execute_action(Action.make_tap_land_for_mana(s.you.battlefield[1].instance_id))
	_assert_eq(s.you.mana.pool["U"], 2, "have UU for Counterspell")

	# Cast Counterspell targeting opp's Bolt
	var target := {"kind": "stack", "iid": opp_bolt.instance_id}
	ok = RulesEngine.execute_action(Action.make_cast_spell(cspell.instance_id, [target]))
	_assert_true(ok, "cast Counterspell at opp's Bolt")
	_assert_eq(s.stack.size(), 2, "stack now has [Bolt, Counterspell]")

	# Resolve Counterspell (LIFO — top of stack is Counterspell)
	# Both players pass — but opp is going to auto-pass via the phase-3 stub.
	# Player passes first, opp auto-passes, Counterspell resolves.
	RulesEngine.execute_action(Action.make_pass_priority())
	_assert_eq(s.stack.size(), 0, "Counterspell countered Bolt — both off the stack")
	_assert_eq(s.you.life, 20, "you took no damage — Bolt was countered before resolution")
	# Bolt should be in opp's graveyard (countered spells go to owner's graveyard)
	var bolt_in_gy: bool = false
	for c in s.opp.graveyard:
		if c == opp_bolt:
			bolt_in_gy = true
			break
	_assert_true(bolt_in_gy, "Bolt landed in opp's graveyard after being countered")

	# ─── Scenario C: new card pool members all instantiate ──────────────────
	# Spot-check the new vanillas and basic lands have correct stats.
	var bear_cub := CardDatabase.get_card("bear_cub")
	_assert_eq(bear_cub.power, 1, "Bear Cub is 1 power")
	_assert_eq(bear_cub.toughness, 1, "Bear Cub is 1 toughness")
	var gray_ogre := CardDatabase.get_card("gray_ogre")
	_assert_eq(gray_ogre.power, 2, "Gray Ogre is 2 power")
	_assert_eq(gray_ogre.toughness, 2, "Gray Ogre is 2 toughness")
	var hill_giant := CardDatabase.get_card("hill_giant")
	_assert_eq(hill_giant.power, 3, "Hill Giant is 3 power")
	_assert_eq(hill_giant.toughness, 3, "Hill Giant is 3 toughness")
	# Basic lands across the 5 colors
	_assert_eq(CardDatabase.get_card("plains").mana_produced, ["W"], "Plains produces W")
	_assert_eq(CardDatabase.get_card("island").mana_produced, ["U"], "Island produces U")
	_assert_eq(CardDatabase.get_card("swamp").mana_produced, ["B"], "Swamp produces B")
	_assert_eq(CardDatabase.get_card("mountain").mana_produced, ["R"], "Mountain produces R")
	_assert_eq(CardDatabase.get_card("forest").mana_produced, ["G"], "Forest produces G")

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 4.5c smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 4.5c smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# Force a card onto the stack as a spell entry, bypassing the normal cast
# legality checks. Used in Scenario B to inject opp's Bolt without having
# to drive opp's whole turn cycle.
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
