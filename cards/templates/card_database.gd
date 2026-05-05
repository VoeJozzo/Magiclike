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
		"lightning_bolt":
			return _make_lightning_bolt()
		_:
			push_error("CardDatabase: unknown card_id '%s'" % card_id)
			return null


# Returns all known card_ids. Used by Engine boot-time predicate validation.
static func all_card_ids() -> Array[String]:
	return ["mountain", "lightning_bolt"]


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
