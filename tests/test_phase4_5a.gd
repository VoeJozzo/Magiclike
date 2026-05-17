extends Node

# Phase 4.5a smoke test. Validates the real-game init pathway:
#   - init_game(decklist, decklist) populates libraries from card_id counts,
#     shuffles, and draws an opening hand
#   - Tiny decks (≤ hand_size) draw what's there without crashing
#   - The DRAW phase fires _do_draw_card on entry, moving one card
#     library → hand
#   - Drawing from an empty library on the DRAW step ends the game with
#     the OPPONENT as winner (MTG rule 704.5b)
#
# Doesn't validate UI (which is a separate file). Pure engine assertions.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 4.5a smoke test ===\n")

	# ─── Scenario A: tiny deck (smaller than hand size) ─────────────────────
	# 7 cards on each side, hand_size = 7 → opening hand drains the library.
	var tiny_deck := {
		"mountain": 2,
		"lightning_bolt": 1,
		"goblin_raider": 1,
		"forest": 2,
		"grizzly_bears": 1,
	}
	RulesEngine.init_game(tiny_deck, tiny_deck)
	var s: EngineState = RulesEngine.state()
	_assert_eq(s.you.hand.size(), 7, "tiny: you.hand drew all 7")
	_assert_eq(s.you.library.size(), 0, "tiny: you.library emptied by opening hand")
	_assert_eq(s.opp.hand.size(), 7, "tiny: opp.hand drew all 7")
	_assert_eq(s.opp.library.size(), 0, "tiny: opp.library emptied")
	_assert_eq(s.active_player_key, "you", "active player is you")
	_assert_eq(s.phase_machine.current, PhaseMachine.Phase.MAIN1, "phase is MAIN1")
	_assert_eq(s.turn, 1, "turn 1")
	_assert_eq(s.you.life, 20, "you start at 20 life")

	# ─── Scenario B: 40-card deck, draw step fires on turn 2 ────────────────
	var demo_deck := {
		"mountain": 10, "forest": 10,
		"lightning_bolt": 4, "goblin_raider": 4, "grizzly_bears": 4,
		"giant_growth": 4, "pyromaniac": 2, "bloodlust_berserker": 2,
	}
	RulesEngine.init_game(demo_deck, demo_deck)
	s = RulesEngine.state()
	_assert_eq(s.you.hand.size(), 7, "demo: you.hand drew 7")
	_assert_eq(s.you.library.size(), 40 - 7, "demo: you.library has 33")
	_assert_eq(s.opp.library.size(), 33, "demo: opp.library has 33")

	# Cycle through phases until both opp's draw and your turn-2 draw have
	# fired. We walk forward by passing priority — _settle_state auto-passes
	# opp's priority during their turn so opp's full turn cycles in one shot.
	#
	# Each player draws ONCE per their own turn. Your turn N draw happens
	# during the DRAW phase of your turn (which is engine turn = 2*N - 1
	# since opp inhabits the even-numbered "half-turns").
	#
	# Track hand+library sizes before/after to confirm exactly one draw each.
	var your_lib_t1: int = s.you.library.size()
	var your_hand_t1: int = s.you.hand.size()
	var opp_lib_t1: int = s.opp.library.size()
	var safety := 60
	while safety > 0:
		safety -= 1
		# Stop once you've drawn (library shrunk by 1, hand grown by 1).
		# This guarantees we've passed through your turn-2 DRAW step.
		if s.you.library.size() == your_lib_t1 - 1 and s.you.hand.size() == your_hand_t1 + 1:
			break
		RulesEngine.execute_action(Action.make_pass_priority())
	_assert_true(safety > 0, "opp turn auto-cycled + your turn-2 draw fired without hitting safety cap")
	_assert_eq(s.you.library.size(), your_lib_t1 - 1, "you drew one card on your turn-2 draw step")
	_assert_eq(s.you.hand.size(), your_hand_t1 + 1, "you.hand grew by 1")
	# Opp drew one card during their turn too.
	_assert_eq(s.opp.library.size(), opp_lib_t1 - 1, "opp drew one card during their turn")

	# ─── Scenario C: deck-out loss ──────────────────────────────────────────
	# Reinit with a deck that's exactly hand_size cards. Forcing the DRAW
	# step to fire then ends the game.
	RulesEngine.init_game(tiny_deck, tiny_deck)
	s = RulesEngine.state()
	_assert_eq(s.you.library.size(), 0, "deck-out: you start with empty library")
	_assert_eq(s.winner, "", "deck-out: no winner yet at game start")
	# Manually advance to DRAW phase to trigger the loss. (We hop through
	# UNTAP→UPKEEP→DRAW using the phase machine directly so we don't have
	# to navigate through MAIN1's pass-priority cycle for this test.)
	s.phase_machine.current = PhaseMachine.Phase.UPKEEP
	# Pass priority through upkeep → draw fires next; the empty-library check
	# inside _do_draw_card sets state.winner.
	RulesEngine.execute_action(Action.make_pass_priority())
	# After advancing to DRAW, _do_draw_card should have detected the empty
	# library and set winner to "opp".
	_assert_eq(s.winner, "opp", "deck-out: you lost, opp wins")

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 4.5a smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 4.5a smoke test: %d FAILURE(S) ✗ ===\n" % failures)
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
