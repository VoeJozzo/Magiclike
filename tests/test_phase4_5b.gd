extends Node

# Smoke test for the interactive trigger target picker: you-controlled
# triggers halt for a UI pick; opp-controlled triggers auto-pick the
# greedy default (engine.gd's _auto_pick_trigger_target) instead.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 4.5b smoke test ===\n")

	# ─── Scenario A: you-controlled trigger, target a creature ──────────────
	RulesEngine.init_phase4()
	var s: EngineState = RulesEngine.state()

	# Setup: init_phase4 puts an opp Grizzly Bears on the battlefield for hittability.
	var opp_bear: CardInstance = null
	for c in s.opp.battlefield:
		if c.template.card_id == "grizzly_bears":
			opp_bear = c
			break
	_assert_true(opp_bear != null, "opp has a Grizzly Bears we can target")

	# Pyromaniac costs R + 1 generic.
	var pyro: CardInstance = null
	for c in s.you.hand:
		if c.template.card_id == "pyromaniac":
			pyro = c
			break
	assert(pyro != null)
	for c in s.you.battlefield:
		if c.template.card_id == "mountain" and not c.tapped:
			RulesEngine.execute_action(Action.make_tap_land_for_mana(c.instance_id))
			if s.you.mana.pool["R"] >= 2:
				break
	_assert_eq(s.you.mana.pool["R"], 2, "tapped two Mountains for RR")

	var ok = RulesEngine.execute_action(Action.make_cast_spell(pyro.instance_id, []))
	_assert_true(ok, "cast Pyromaniac")
	_assert_eq(s.stack.size(), 1, "Pyromaniac spell on stack")

	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority — Pyromaniac resolves")
	_assert_true(not s.awaiting_target_for_trigger.is_empty(), "engine awaits target after ETB drain")
	_assert_eq(s.awaiting_target_for_trigger.controller_key, "you", "awaiting target for your-controlled trigger")
	_assert_eq(s.awaiting_target_for_trigger.filter, "creature_or_player", "filter is creature_or_player")
	_assert_eq(s.stack.size(), 0, "stack empty until target picked")
	_assert_eq(s.pending_triggers.size(), 1, "trigger sits in pending until target picked")

	var bad = RulesEngine.execute_action(Action.make_pick_trigger_target(
		{"kind": "creature", "iid": 99999}
	))
	_assert_true(not bad, "bogus creature iid rejected")
	_assert_true(not s.awaiting_target_for_trigger.is_empty(), "still awaiting after creature-rejection")
	bad = RulesEngine.execute_action(Action.make_pick_trigger_target(
		{"kind": "player", "who": "nobody"}
	))
	_assert_true(not bad, "bogus player name rejected")
	_assert_true(not s.awaiting_target_for_trigger.is_empty(), "still awaiting after player-rejection")

	ok = RulesEngine.execute_action(Action.make_pick_trigger_target(
		{"kind": "creature", "iid": opp_bear.instance_id}
	))
	_assert_true(ok, "legal pick — Bear")
	_assert_eq(s.stack.size(), 1, "trigger pushed to stack")
	_assert_true(s.awaiting_target_for_trigger.is_empty(), "no longer awaiting")

	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "pass priority on trigger")
	_assert_eq(opp_bear.damage_marked, 1, "Bear took 1 damage from Pyromaniac ETB")
	var bear_alive: bool = false
	for c in s.opp.battlefield:
		if c == opp_bear:
			bear_alive = true
			break
	_assert_true(bear_alive, "Bear survived (2 toughness vs 1 damage)")

	# ─── Scenario B: opp-controlled trigger auto-picks ──────────────────────
	# init_phase4 doesn't give opp a Pyromaniac, so we force one onto their
	# battlefield directly and synthesize the ETB event.
	RulesEngine.init_phase4()
	s = RulesEngine.state()
	var opp_pyro := s.make_instance(CardDatabase.get_card("pyromaniac"), "opp")
	opp_pyro.summoning_sick = false
	s.opp.battlefield.append(opp_pyro)
	# Fire the ETB event directly. This mirrors what happens during normal
	# spell resolution and exercises the auto-pick path without needing the
	# opp to actually have mana + cast.
	RulesEngine._fire_event({
		"kind": "card_enters_battlefield",
		"subject_iid": opp_pyro.instance_id,
		"subject_card": opp_pyro,
	})
	RulesEngine._drain_pending_triggers()
	_assert_true(s.awaiting_target_for_trigger.is_empty(), "opp triggers don't await target picks")
	_assert_eq(s.stack.size(), 1, "opp trigger on stack with auto-picked target")
	_assert_eq(s.pending_triggers.size(), 0, "no pending — drain completed")
	RulesEngine.execute_action(Action.make_pass_priority())
	RulesEngine.execute_action(Action.make_pass_priority())
	_assert_eq(s.stack.size(), 0, "opp's trigger resolved")
	_assert_eq(s.you.life, 19, "you took 1 damage from opp's auto-targeted Pyromaniac")

	print("")
	if failures == 0:
		print("=== Phase 4.5b smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 4.5b smoke test: %d FAILURE(S) ✗ ===\n" % failures)
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
