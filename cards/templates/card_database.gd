class_name CardDatabase
extends RefCounted

# Programmatic card definitions for Phase 1.
#
# Long-term, each card will be a .tres Resource file under cards/templates/
# authored in the Godot editor. For Phase 1 (just 2 cards), defining them in
# code is faster and avoids hand-writing .tres syntax. The migration to .tres
# files is a Phase 2+ task — call sites use get(card_id) regardless of where
# the data comes from.


# Returns a CardResource for the given card_id, or null if unknown.
static func get_card(card_id: String) -> CardResource:
	match card_id:
		"mountain":
			return _make_mountain()
		"forest":
			return _make_forest()
		"lightning_bolt":
			return _make_lightning_bolt()
		"goblin_raider":
			return _make_goblin_raider()
		"grizzly_bears":
			return _make_grizzly_bears()
		"giant_growth":
			return _make_giant_growth()
		"pyromaniac":
			return _make_pyromaniac()
		"bloodlust_berserker":
			return _make_bloodlust_berserker()
		_:
			push_error("CardDatabase: unknown card_id '%s'" % card_id)
			return null


# Returns all known card_ids. Used by Engine boot-time predicate validation.
static func all_card_ids() -> Array[String]:
	return [
		"mountain", "forest",
		"lightning_bolt", "goblin_raider",
		"grizzly_bears", "giant_growth",
		"pyromaniac", "bloodlust_berserker",
	]


# Returns all card resources. Used by Engine boot-time predicate validation.
static func all_resources() -> Array:
	var arr: Array = []
	for cid in all_card_ids():
		arr.append(get_card(cid))
	return arr


# ─────────────────────────────────────────────────────────────────────────────
# Card definitions. Keep these terse — most cards are just data; only the
# shape of the on_cast / activated / triggered ability arrays carries logic.

static func _make_mountain() -> LandResource:
	var r := LandResource.new()
	r.card_id = "mountain"
	r.display_name = "Mountain"
	r.card_types = ["land"]
	r.subtypes = ["mountain"]
	r.mana_cost = {}  # Lands cost no mana
	r.oracle_text = "{T}: Add {R}."
	r.mana_produced = ["R"]
	# The tap ability is constructed automatically by Engine from mana_produced;
	# no need to populate activated_abilities by hand.
	return r


static func _make_lightning_bolt() -> SpellResource:
	var r := SpellResource.new()
	r.card_id = "lightning_bolt"
	r.display_name = "Lightning Bolt"
	r.card_types = ["instant"]
	r.subtypes = []
	r.mana_cost = {"R": 1}
	r.oracle_text = "Lightning Bolt deals 3 damage to any target."
	r.requires_target = true
	r.target_filter = "any"
	r.on_cast_effects = [
		{"kind": "damage", "amount": 3, "target": "chosen"},
	]
	return r


static func _make_goblin_raider() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "goblin_raider"
	r.display_name = "Goblin Raider"
	r.card_types = ["creature"]
	r.subtypes = ["goblin"]
	r.mana_cost = {"R": 1}
	r.oracle_text = "A vanilla 2/1 — no abilities."
	r.power = 2
	r.toughness = 1
	r.keywords = []
	# No on_cast_effects — when a creature spell resolves, the engine puts it
	# on the battlefield (its "effect" is becoming a permanent). Phase 2 will
	# handle this via a special-case in stack resolution, not via an effect kind.
	return r


static func _make_forest() -> LandResource:
	var r := LandResource.new()
	r.card_id = "forest"
	r.display_name = "Forest"
	r.card_types = ["land"]
	r.subtypes = ["forest"]
	r.mana_cost = {}
	r.oracle_text = "{T}: Add {G}."
	r.mana_produced = ["G"]
	return r


static func _make_grizzly_bears() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "grizzly_bears"
	r.display_name = "Grizzly Bears"
	r.card_types = ["creature"]
	r.subtypes = ["bear"]
	r.mana_cost = {"G": 1, "C": 1}
	r.oracle_text = "A vanilla 2/2 — no abilities."
	r.power = 2
	r.toughness = 2
	r.keywords = []
	return r


static func _make_giant_growth() -> SpellResource:
	var r := SpellResource.new()
	r.card_id = "giant_growth"
	r.display_name = "Giant Growth"
	r.card_types = ["instant"]
	r.subtypes = []
	r.mana_cost = {"G": 1}
	r.oracle_text = "Target creature gets +3/+3 until end of turn."
	r.requires_target = true
	r.target_filter = "creature"
	r.on_cast_effects = [
		{"kind": "pump", "amount_power": 3, "amount_toughness": 3, "target": "chosen", "duration": "eot"},
	]
	return r


# Phase 4: ETB trigger. When Pyromaniac enters the battlefield, it deals 1
# damage to the opponent of its controller. No predicate (always fires).
# Phase 4 simplification: hardcoded "opp" target rather than player-chosen.
# Phase 4.5+ will add interactive trigger target selection.
static func _make_pyromaniac() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "pyromaniac"
	r.display_name = "Pyromaniac"
	r.card_types = ["creature"]
	r.subtypes = ["human", "shaman"]
	r.mana_cost = {"R": 1, "C": 1}
	r.oracle_text = "When Pyromaniac enters, it deals 1 damage to the opponent."
	r.power = 1
	r.toughness = 1
	r.keywords = []
	r.triggered_abilities = [
		{
			"event": "card_etb",
			"self_only": true,                  # only fires for this creature's own ETB
			"condition_predicate": "",          # unconditional
			"effects": [
				{"kind": "damage", "amount": 1, "target": "opponent"},
			],
		},
	]
	return r


# Phase 4: death trigger with predicate. When Bloodlust Berserker dies, if the
# opponent has lost life this turn, deal 2 damage to the opponent. Exercises
# the predicate registry — the trigger is queued unconditionally, then the
# predicate is checked at queue time (and again at resolve time per MTG's
# "intervening if" rule, though Phase 4 only checks once at queue time).
static func _make_bloodlust_berserker() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "bloodlust_berserker"
	r.display_name = "Bloodlust Berserker"
	r.card_types = ["creature"]
	r.subtypes = ["human", "warrior"]
	r.mana_cost = {"R": 2, "C": 1}
	r.oracle_text = "When Bloodlust Berserker dies, if the opponent lost life this turn, it deals 2 damage to the opponent."
	r.power = 3
	r.toughness = 2
	r.keywords = []
	r.triggered_abilities = [
		{
			"event": "card_dies",
			"self_only": true,
			"condition_predicate": "opp_lost_life_this_turn",
			"effects": [
				{"kind": "damage", "amount": 2, "target": "opponent"},
			],
		},
	]
	return r
