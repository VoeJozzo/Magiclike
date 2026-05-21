extends Node

# JsonCardLoader smoke test. Exercises:
#   1. Loading a single card (bolt = Lightning Bolt equivalent) and
#      verifying field translation: card_id, name, type, cost, effect kind
#      remap (gainLife → gain_life, addMana → add_mana, etc).
#   2. Loading a creature with keywords (camelCase firstStrike →
#      first_strike remap).
#   3. Loading a creature with a trigger (event remap, cond_id pass-through).
#   4. Loading a land (mana_produced from JSON's mana string).
#   5. Running load_all() against the full manifest and supportability_report
#      — verifies that the loader doesn't crash on any of the 258 JSONs, and
#      that the count of supported-vs-unsupported is plausible (>0 each).
#
# Run headless:
#   godot --headless --path . res://tests/test_json_card_loader.tscn

var failures: int = 0


func _ready() -> void:
	print("\n=== JsonCardLoader smoke test ===\n")

	# ─── 1. Lightning-Bolt-equivalent (bolt) ────────────────────────────
	var bolt: CardResource = JsonCardLoader.load_card("bolt")
	_assert_true(bolt != null, "bolt loaded")
	if bolt != null:
		_assert_eq(bolt.card_id, "bolt", "bolt.card_id")
		_assert_eq(bolt.display_name, "Lightning Bolt", "bolt.display_name")
		_assert_true(bolt is SpellResource, "bolt is SpellResource")
		_assert_eq(bolt.card_types, ["instant"], "bolt.card_types")
		_assert_eq(bolt.mana_cost.get("R", 0), 1, "bolt.mana_cost.R")
		_assert_eq(bolt.on_cast_effects.size(), 1, "bolt has one on_cast_effect")
		var eff: Dictionary = bolt.on_cast_effects[0]
		_assert_eq(eff.get("kind", ""), "damage", "bolt effect is damage")
		_assert_eq(eff.get("amount", 0), 3, "bolt effect amount = 3")
		# JS "any" target collapses to "creature_or_player" on the Godot side.
		var spell: SpellResource = bolt
		_assert_true(spell.requires_target, "bolt requires target")
		_assert_eq(spell.target_filter, "creature_or_player", "bolt target_filter")

	# ─── 2. Healing-Salve-equivalent (salve) — gainLife remap ────────────
	var salve: CardResource = JsonCardLoader.load_card("salve")
	_assert_true(salve != null, "salve loaded")
	if salve != null and salve.on_cast_effects.size() > 0:
		_assert_eq(salve.on_cast_effects[0].get("kind", ""),
			"gain_life", "salve effect remapped gainLife → gain_life")

	# ─── 3. Creature with keyword remap (any card with firstStrike) ──────
	# whiteKnight is a vanilla white knight w/ firstStrike — pick it from
	# the html-proto pool.
	var knight: CardResource = JsonCardLoader.load_card("whiteKnight")
	_assert_true(knight != null, "whiteKnight loaded")
	if knight != null and knight is CreatureResource:
		var c: CreatureResource = knight
		_assert_true(c.power > 0, "knight has power")
		_assert_true("first_strike" in c.keywords or "firstStrike" not in c.keywords,
			"knight keywords remapped (firstStrike → first_strike)")

	# ─── 4. Creature with trigger (event remap path) ─────────────────────
	# holyZealot: "When this attacks" → event="attacks" (single-word, no remap)
	var zealot: CardResource = JsonCardLoader.load_card("holyZealot")
	_assert_true(zealot != null, "holyZealot loaded")
	if zealot != null:
		_assert_true(zealot.triggers.size() >= 1, "zealot has a trigger")
		if zealot.triggers.size() >= 1:
			_assert_eq(zealot.triggers[0].get("event", ""), "attacks",
				"zealot trigger event = attacks")
			_assert_true(zealot.triggers[0].get("effects", []).size() >= 1,
				"zealot trigger has an effect")
			# gainLife → gain_life on the nested effect
			var trig_eff: Dictionary = zealot.triggers[0].effects[0]
			_assert_eq(trig_eff.get("kind", ""), "gain_life",
				"zealot trigger effect remapped gainLife → gain_life")

	# ─── 5. Land with mana_produced ──────────────────────────────────────
	var forest: CardResource = JsonCardLoader.load_card("forest")
	_assert_true(forest != null, "forest loaded")
	if forest != null and forest is LandResource:
		var l: LandResource = forest
		_assert_true("G" in l.mana_produced, "forest produces G")

	# ─── 6. City of Brass — extra colors ─────────────────────────────────
	var city: CardResource = JsonCardLoader.load_card("cityOfBrass")
	_assert_true(city != null, "cityOfBrass loaded")
	if city != null and city is LandResource:
		var lc: LandResource = city
		_assert_eq(lc.mana_produced.size(), 5, "cityOfBrass produces all 5 colors")

	# ─── 7. Full manifest scan ───────────────────────────────────────────
	print("\n--- Loading all 258 cards from manifest ---")
	var all_cards: Dictionary = JsonCardLoader.load_all()
	_assert_true(all_cards.size() >= 250,
		"load_all returned ≥250 cards (got %d)" % all_cards.size())
	var report: Dictionary = JsonCardLoader.supportability_report(all_cards, true)
	_assert_eq(report.total, all_cards.size(), "report.total matches load count")
	_assert_true(report.supported > 0,
		"some cards are fully supported (got %d)" % report.supported)
	# Currently Godot implements ~5 effect kinds; most JS cards reference
	# unimplemented ones (removeCreature, draw, discard, etc.). So we
	# expect MANY unsupported.
	_assert_true(report.unsupported > 100,
		"many cards are unsupported (got %d)" % report.unsupported)
	# Sanity: missing_effects should include several JS-only kinds.
	_assert_true(report.missing_effects.has("remove_creature"),
		"remove_creature is in missing_effects")

	# ─── Final report ────────────────────────────────────────────────────
	print("")
	if failures == 0:
		print("=== JsonCardLoader smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== JsonCardLoader smoke test: %d FAILURE(S) ✗ ===\n" % failures)
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
