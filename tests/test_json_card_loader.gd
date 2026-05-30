extends Node

# JsonCardLoader smoke test.
#
# Selects representative cards BY SHAPE from the loaded pool — never by a
# hardcoded id. This mirrors the html-proto de-brittling convention
# (tests/card_text_test.js's `pickByShape`): a card rename or stat retune can't
# break the test, because it asserts the loader's TRANSLATION INVARIANTS (type
# string → resource subclass, snake_case effect kinds, target inference, keyword
# / trigger / mana passthrough), not the identity of any one card.
#
# Run headless:
#   godot --headless --path . res://tests/test_json_card_loader.tscn

var failures: int = 0


func _ready() -> void:
	print("\n=== JsonCardLoader smoke test ===\n")

	var all_cards: Dictionary = JsonCardLoader.load_all()
	# Guard against vacuous passes: every "find a card shaped like X" assertion
	# below would silently go green on an empty pool, so anchor on a real count.
	_assert_true(all_cards.size() >= 250,
		"load_all returned ≥250 cards (got %d)" % all_cards.size())

	# Field translation: every card carries a non-empty id + display name.
	var any_card: CardResource = _pick(all_cards, func(_c): return true)
	if _assert_true(any_card != null, "pool is non-empty (picks are not vacuous)"):
		_assert_true(any_card.card_id != "" and any_card.display_name != "",
			"loaded card has card_id + display_name")

	# Type string → resource subclass. All three subclasses appear in the pool.
	_assert_true(_pick(all_cards, func(c): return c is SpellResource) != null,
		"a Sorcery/Instant loads as SpellResource")
	_assert_true(_pick(all_cards, func(c): return c is CreatureResource) != null,
		"a Creature loads as CreatureResource")
	_assert_true(_pick(all_cards, func(c): return c is LandResource) != null,
		"a Land loads as LandResource")

	# 1. Targeted spell → requires_target + a target_filter, inferred from the
	#    card-root "target" (bolt-shaped).
	var targeted: CardResource = _pick(all_cards,
		func(c): return c is SpellResource and (c as SpellResource).requires_target)
	if _assert_true(targeted != null, "found a targeted spell"):
		var s: SpellResource = targeted
		_assert_true(s.target_filter != "",
			"targeted spell has a target_filter (%s → %s)" % [s.card_id, s.target_filter])
		_assert_true(s.card_types.size() == 1 and s.card_types[0] == s.card_types[0].to_lower(),
			"spell card_types is one lowercased type (%s)" % str(s.card_types))

	# 2. Burn spell (damage effect) → cost + effect fields translate.
	var burn: CardResource = _pick(all_cards, func(c):
		if not (c is SpellResource):
			return false
		for e in (c as CardResource).on_cast_effects:
			if String(e.get("kind", "")) == "damage":
				return true
		return false)
	if _assert_true(burn != null, "found a damage spell"):
		_assert_true(burn.mana_cost is Dictionary and not burn.mana_cost.is_empty(),
			"damage spell has a mana_cost dict (%s)" % str(burn.mana_cost))
		var dmg: Dictionary = _first_effect(burn.on_cast_effects, "damage")
		_assert_true(int(dmg.get("amount", 0)) > 0, "damage effect carries a positive amount")

	# 3. Effect kinds load as canonical snake_case. The camelCase→snake_case
	#    remap tables were deleted (card data is authored snake_case); a camelCase
	#    leak here would mean the wire format drifted.
	var with_eff: CardResource = _pick(all_cards,
		func(c): return not (c as CardResource).on_cast_effects.is_empty())
	if _assert_true(with_eff != null, "found a card with on_cast_effects"):
		var all_snake := true
		for e in with_eff.on_cast_effects:
			var k: String = String(e.get("kind", ""))
			if k != k.to_lower():
				all_snake = false
		_assert_true(all_snake, "effect kinds are snake_case (no camelCase leak)")

	# 4. Creature keyword passthrough — first_strike (a canonical multi-word kw).
	var fs_creature: CardResource = _pick(all_cards,
		func(c): return c is CreatureResource and "first_strike" in (c as CreatureResource).keywords)
	if _assert_true(fs_creature != null, "found a first_strike creature"):
		_assert_true("first_strike" in (fs_creature as CreatureResource).keywords,
			"keyword loads as snake_case first_strike")

	# 5. Trigger passthrough — event + nested effects survive the load.
	var trig_card: CardResource = _pick(all_cards,
		func(c): return (c as CardResource).triggers.size() >= 1)
	if _assert_true(trig_card != null, "found a card with a trigger"):
		var t: Dictionary = trig_card.triggers[0]
		_assert_true(String(t.get("event", "")) != "",
			"trigger has an event (%s)" % str(t.get("event", "")))
		_assert_true(t.get("effects", []) is Array, "trigger carries an effects array")

	# 6. Land mana — mana_produced comes from the `mana` shorthand; entries are
	#    valid single-letter color codes.
	var land: CardResource = _pick(all_cards,
		func(c): return c is LandResource and not (c as LandResource).mana_produced.is_empty())
	if _assert_true(land != null, "found a mana-producing land"):
		var valid := true
		for col in (land as LandResource).mana_produced:
			if not (col in ["W", "U", "B", "R", "G", "C"]):
				valid = false
		_assert_true(valid,
			"land mana_produced are WUBRGC codes (%s)" % str((land as LandResource).mana_produced))

	# 7. Supportability scan over the whole manifest.
	print("\n--- Supportability report over the full manifest ---")
	var report: Dictionary = JsonCardLoader.supportability_report(all_cards, true)
	_assert_eq(report.total, all_cards.size(), "report.total matches load count")
	_assert_true(report.supported > 0,
		"some cards are fully supported (got %d)" % report.supported)
	# Most JS cards reference effect kinds Godot hasn't implemented yet
	# (affect_creature, move_card, draw, …), so expect many unsupported.
	_assert_true(report.unsupported > 100,
		"many cards are unsupported (got %d)" % report.unsupported)
	_assert_true(report.missing_effects.has("affect_creature"),
		"affect_creature is in missing_effects")

	# ─── Final report ────────────────────────────────────────────────────
	print("")
	if failures == 0:
		print("=== JsonCardLoader smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== JsonCardLoader smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# Pick the first loaded card matching `pred`, or null. Mirrors proto's
# card_text_test.js `pickByShape` — select a representative by structure, never
# by a hardcoded id that a rename would invalidate.
func _pick(cards: Dictionary, pred: Callable) -> CardResource:
	for id in cards:
		if pred.call(cards[id]):
			return cards[id]
	return null


func _first_effect(effects: Array, kind: String) -> Dictionary:
	for e in effects:
		if String(e.get("kind", "")) == kind:
			return e
	return {}


func _assert_eq(actual, expected, name: String) -> void:
	if actual == expected:
		print("  ✓ %s = %s" % [name, str(actual)])
	else:
		print("  ✗ %s: expected %s, got %s" % [name, str(expected), str(actual)])
		failures += 1


func _assert_true(condition: bool, name: String) -> bool:
	if condition:
		print("  ✓ %s" % name)
	else:
		print("  ✗ %s (expected true)" % name)
		failures += 1
	return condition
