extends Node

# Phase 3 smoke test. Headline scenario: opp's Giant Growth saves their bear
# from Lightning Bolt by pumping it to 5/5 in response. Tests the stack
# architecture (decision C1 from the port plan) end-to-end:
#   - Player casts Bolt at opp's bear → goes on stack
#   - Pass priority → opp's hardcoded AI casts Giant Growth in response
#   - Stack now has [Bolt, Giant Growth]
#   - Pass priority twice → Giant Growth resolves first (LIFO), bear becomes 5/5
#   - Pass priority twice more → Bolt resolves, bear takes 3 damage, survives
#   - State-based actions don't kill the bear (3 damage < 5 toughness)
#
# This validates everything Phase 3 added: pump effect, real damage to creatures,
# state-based actions, and the engine's stack/priority machinery actually doing
# work (Phase 1 had the stack but only one spell at a time; Phase 2 only had
# sorcery-speed casts).

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 3 smoke test ===\n")

	RulesEngine.init_phase3()
	var s: EngineState = RulesEngine.state()

	# Initial state
	_assert_eq(s.you.battlefield.size(), 2, "starting you.battlefield (Mountain + Forest)")
	_assert_eq(s.opp.battlefield.size(), 3, "starting opp.battlefield (Forest + 2 Bears)")
	_assert_eq(s.opp.hand.size(), 1, "starting opp.hand (Giant Growth)")

	# Find the cards we need
	var your_mountain: CardInstance = null
	for c in s.you.battlefield:
		if c.template.card_id == "mountain":
			your_mountain = c
			break
	var opp_bear: CardInstance = null
	for c in s.opp.battlefield:
		if c.template.card_id == "grizzly_bears":
			opp_bear = c
			break
	var bolt: CardInstance = null
	for c in s.you.hand:
		if c.template.card_id == "lightning_bolt":
			bolt = c
			break
	assert(your_mountain != null and opp_bear != null and bolt != null)

	# Step 1: tap Mountain for R
	var ok = RulesEngine.execute_action(Action.make_activate_ability(your_mountain.instance_id))
	_assert_true(ok, "tap mountain for R")
	_assert_eq(s.you.mana.pool["R"], 1, "R mana available")

	# Step 2: cast Lightning Bolt at opp's bear
	var cast := Action.make_cast_spell(
		bolt.instance_id,
		[{"kind": "creature", "iid": opp_bear.instance_id}]
	)
	ok = RulesEngine.execute_action(cast)
	_assert_true(ok, "cast Bolt at opp's bear")
	_assert_eq(s.stack.size(), 1, "stack has Bolt")

	# Step 3: pass priority — Phase 5c AI casts Giant Growth in response then
	# auto-passes (caster doesn't hold priority indefinitely — that was a
	# Phase-3 stub quirk). Net effect after one pass_priority from us:
	#   - opp tapped Forest for G, cast Giant Growth (stack=[Bolt, GG])
	#   - opp passed priority — now you have priority
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority (triggers opp Giant Growth response)")
	_assert_eq(s.stack.size(), 2, "stack now has [Bolt, Giant Growth]")
	_assert_eq(s.opp.hand.size(), 0, "opp's Giant Growth left their hand")
	_assert_eq(s.priority_player_key, "you", "you have priority after opp's response (opp passed)")

	# Step 4: pass priority — both passed, top (Giant Growth) resolves first
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority — resolve Giant Growth")
	# After GG resolves the stack has just [Bolt]. _settle_state then cycles
	# opp's instant-response check — they have nothing else to respond with,
	# so they pass; that leaves priority with you, NOT yet resolving Bolt.
	_assert_eq(s.stack.size(), 1, "Giant Growth resolved, only Bolt left")
	_assert_eq(opp_bear.temp_power, 3, "bear has +3 temp_power")
	_assert_eq(opp_bear.temp_toughness, 3, "bear has +3 temp_toughness")
	_assert_eq(opp_bear.current_power(), 5, "bear is now 5 power")
	_assert_eq(opp_bear.current_toughness(), 5, "bear is now 5 toughness")

	# Step 5: pass priority — both pass (opp has nothing left), Bolt resolves
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority — resolve Bolt")
	_assert_eq(s.stack.size(), 0, "stack empty")
	_assert_eq(opp_bear.damage_marked, 3, "bear took 3 damage from Bolt")
	# Bear has 5 toughness, 3 damage — should still be on battlefield (SBA didn't kill)
	var bear_alive := false
	for c in s.opp.battlefield:
		if c == opp_bear:
			bear_alive = true
			break
	_assert_true(bear_alive, "bear survived Bolt thanks to Giant Growth")

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 3 smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 3 smoke test: %d FAILURE(S) ✗ ===\n" % failures)
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
