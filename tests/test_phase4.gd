extends Node

# Phase 4 smoke test. Validates triggered abilities end-to-end:
#   - ETB trigger: Pyromaniac enters → fires "deal 1 to opp" trigger →
#     trigger queued → drains onto stack → resolves → opp takes 1.
#   - Death trigger with predicate: Bloodlust Berserker dies after opp has
#     lost life this turn → death trigger checks
#     cond_opp_lost_life_this_turn (true) → fires "deal 2 to opp" →
#     trigger queued → drains onto stack → resolves → opp takes 2.
#   - Predicate negative case: a fresh Berserker dying when the opponent
#     hasn't lost life this turn does NOT queue a trigger.
#
# This validates everything Phase 4 added: event firing, listener matching
# (self_only flag, predicate gating), APNAP-ordered drain, trigger stack
# entries, and the boot-time predicate registry.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 4 smoke test ===\n")

	# ─── Scenario A: Pyromaniac ETB trigger ─────────────────────────────────
	RulesEngine.init_phase4()
	var s: EngineState = RulesEngine.state()

	_assert_eq(s.you.battlefield.size(), 3, "starting you.battlefield (3 Mountains)")
	_assert_eq(s.you.hand.size(), 3, "starting you.hand (Pyromaniac + Berserker + Bolt)")
	_assert_eq(s.opp.life, 20, "opp starts at 20 life")
	_assert_eq(s.opp.life_lost_this_turn, 0, "opp lost 0 life this turn at start")

	# Find the cards we need
	var pyro: CardInstance = _find_in_hand(s.you, "pyromaniac")
	var berserker: CardInstance = _find_in_hand(s.you, "bloodlust_berserker")
	var bolt: CardInstance = _find_in_hand(s.you, "lightning_bolt")
	assert(pyro != null and berserker != null and bolt != null)

	# Tap 2 Mountains for RR (Pyromaniac costs 1R)
	_tap_for_color(s, "you", "mountain", "R")
	_tap_for_color(s, "you", "mountain", "R")
	_assert_eq(s.you.mana.pool["R"], 2, "have RR to cast Pyromaniac")

	# Cast Pyromaniac (creature, sorcery-speed)
	var ok = RulesEngine.execute_action(Action.make_cast_spell(pyro.instance_id, []))
	_assert_true(ok, "cast Pyromaniac")
	_assert_eq(s.stack.size(), 1, "stack has Pyromaniac spell")

	# Both players pass priority → Pyromaniac resolves, enters battlefield,
	# fires ETB trigger which queues and drains onto stack.
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "you pass priority")
	# Phase 4.5b: Pyromaniac's ETB ability needs a target (any target). After
	# resolution + ETB drain, the engine halts at awaiting_target_for_trigger.
	# The trigger is in pending_triggers but NOT yet on stack.
	_assert_eq(s.pending_triggers.size(), 1, "Pyromaniac ETB trigger pending a target")
	_assert_true(not s.awaiting_target_for_trigger.is_empty(), "engine awaits target pick")
	_assert_eq(s.stack.size(), 0, "stack empty until target is picked")

	# Find the Pyromaniac on battlefield (it resolved already)
	var pyro_in_play: CardInstance = null
	for c in s.you.battlefield:
		if c.template.card_id == "pyromaniac":
			pyro_in_play = c
			break
	_assert_true(pyro_in_play != null, "Pyromaniac is on the battlefield")

	# Pick the opp player as target — Pyromaniac shoots opp's face.
	ok = RulesEngine.execute_action(Action.make_pick_trigger_target(
		{"kind": "player", "who": "opp"}
	))
	_assert_true(ok, "pick opp as Pyromaniac's ETB target")
	_assert_eq(s.stack.size(), 1, "stack has Pyromaniac's ETB trigger after target picked")
	_assert_eq(s.pending_triggers.size(), 0, "pending_triggers drained")
	_assert_true(s.awaiting_target_for_trigger.is_empty(), "no more awaiting target")

	# Both pass on the trigger → it resolves, opp takes 1
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "you pass priority on ETB trigger")
	_assert_eq(s.stack.size(), 0, "trigger resolved, stack empty")
	_assert_eq(s.opp.life, 19, "opp took 1 damage from Pyromaniac ETB")
	_assert_eq(s.opp.life_lost_this_turn, 1, "opp.life_lost_this_turn = 1")

	# ─── Scenario B: Bloodlust Berserker death trigger (predicate TRUE) ─────
	# Cast Bloodlust Berserker (cost {R:2, C:1} = 3 mana total). We tapped 2
	# Mountains for Pyromaniac (cost {R:1, C:1} = 2 mana total); 0 mana left.
	_assert_eq(s.you.mana.pool.get("R", 0), 0, "mana pool empty after casting Pyromaniac")
	# Tap the last untapped Mountain (1 R available). For Berserker (3) + a
	# follow-up Bolt (1), need 4 R total. Inject 3 more.
	_tap_for_color(s, "you", "mountain", "R")
	s.you.mana.add("R", 3)
	_assert_eq(s.you.mana.pool["R"], 4, "have RRRR for Berserker + Bolt (test injected)")

	ok = RulesEngine.execute_action(Action.make_cast_spell(berserker.instance_id, []))
	_assert_true(ok, "cast Bloodlust Berserker")
	_assert_eq(s.stack.size(), 1, "stack has Berserker spell")

	# Resolve Berserker — both pass, it enters as a 3/2 creature.
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "you pass priority — Berserker resolves")
	# Berserker has no ETB triggers; stack should be empty after resolution.
	_assert_eq(s.stack.size(), 0, "stack empty after Berserker resolves (no ETB trigger)")
	_assert_eq(s.pending_triggers.size(), 0, "no pending triggers from Berserker ETB")

	var berserker_in_play: CardInstance = null
	for c in s.you.battlefield:
		if c.template.card_id == "bloodlust_berserker":
			berserker_in_play = c
			break
	_assert_true(berserker_in_play != null, "Berserker is on the battlefield as a 3/2")

	# Cast Lightning Bolt at our own Berserker to test the death trigger.
	# Cost is R; mana pool has R left (3 - 2 paid for Berserker = 1 R).
	_assert_eq(s.you.mana.pool["R"], 1, "have R for Bolt")
	var target = {"kind": "creature", "iid": berserker_in_play.instance_id}
	ok = RulesEngine.execute_action(Action.make_cast_spell(bolt.instance_id, [target]))
	_assert_true(ok, "cast Bolt at own Berserker")
	_assert_eq(s.stack.size(), 1, "stack has Bolt")

	# Pass priority. Opp won't respond (Phase 3 AI only responds to Bolts on
	# opp creatures). Bolt resolves → 3 damage to Berserker (toughness 2) →
	# SBA kills Berserker → death trigger queues (predicate: opp_lost_life_this_turn
	# is TRUE because Pyromaniac dealt 1 earlier) → drain → trigger on stack.
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "you pass priority — Bolt resolves, Berserker dies, death trigger queues")
	_assert_eq(s.stack.size(), 1, "death trigger on stack")
	# Berserker should be in graveyard now
	var berserker_in_gy: bool = false
	for c in s.you.graveyard:
		if c == berserker_in_play:
			berserker_in_gy = true
			break
	_assert_true(berserker_in_gy, "Berserker is in graveyard")

	# Resolve the death trigger
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "you pass priority — death trigger resolves")
	_assert_eq(s.stack.size(), 0, "stack empty after death trigger")
	_assert_eq(s.opp.life, 17, "opp took 2 more damage from Berserker death trigger (19 → 17)")

	# ─── Scenario C: Predicate negative case ────────────────────────────────
	# Fresh state, Berserker dies BEFORE opp has lost life → trigger should
	# NOT queue (predicate returns false).
	RulesEngine.init_phase4()
	s = RulesEngine.state()
	# Inject Berserker directly to battlefield + Bolt in hand
	var fresh_berserker := s.make_instance(CardDatabase.get_card("bloodlust_berserker"), "you")
	fresh_berserker.summoning_sick = false
	s.you.battlefield.append(fresh_berserker)
	# Make sure opp hasn't taken damage
	_assert_eq(s.opp.life_lost_this_turn, 0, "opp lost 0 life this turn (fresh)")
	# Tap a Mountain for R
	_tap_for_color(s, "you", "mountain", "R")
	var bolt2 := _find_in_hand(s.you, "lightning_bolt")
	var bolt_target = {"kind": "creature", "iid": fresh_berserker.instance_id}
	ok = RulesEngine.execute_action(Action.make_cast_spell(bolt2.instance_id, [bolt_target]))
	_assert_true(ok, "cast Bolt at Berserker (predicate-false scenario)")
	ok = RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(ok, "you pass priority — Bolt resolves, Berserker dies; predicate is false")
	_assert_eq(s.stack.size(), 0, "no death trigger queued (predicate false)")
	_assert_eq(s.opp.life, 20, "opp still at 20 (no death-trigger damage)")
	_assert_eq(s.pending_triggers.size(), 0, "no pending triggers")

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 4 smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 4 smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# ─── Helpers ─────────────────────────────────────────────────────────────

func _find_in_hand(player: Player, card_id: String) -> CardInstance:
	for c in player.hand:
		if c.template.card_id == card_id:
			return c
	return null


# Find first untapped land with matching card_id on player_key's battlefield
# and tap it for its color via the engine.
func _tap_for_color(s: EngineState, player_key: String, land_card_id: String, _expected_color: String) -> void:
	var p: Player = s.player_by_key(player_key)
	for c in p.battlefield:
		if c.template.card_id == land_card_id and not c.tapped:
			RulesEngine.execute_action(Action.make_tap_land_for_mana(c.instance_id))
			return
	push_error("test: no untapped %s on %s's battlefield" % [land_card_id, player_key])


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
