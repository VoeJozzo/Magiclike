class_name CardResource
extends Resource

# Card-template base. Engine state lives here; visual layer (front_image etc.)
# lives in cards/data/<id>.json. Linked by card_id.

@export var card_id: String = ""
@export var display_name: String = ""

@export var card_types: Array[String] = []
@export var subtypes: Array[String] = []

# Cost keys: W/U/B/R/G + C (generic). Empty for lands / free spells.
@export var mana_cost: Dictionary = {}

@export var oracle_text: String = ""

# Each: {"kind": "<effect_kind>", ...}. Resolved through engine/effects/effects.gd.
@export var on_cast_effects: Array[Dictionary] = []

# Each: {"cost": {"tap": true, "mana": {...}}, "effects": [...]}.
@export var activated_abilities: Array[Dictionary] = []

# Each: {"event": ..., "condition_predicate": "<name>", "effects": [...]}. See engine/predicates/.
@export var triggered_abilities: Array[Dictionary] = []


func has_type(type_name: String) -> bool:
	return type_name in card_types


func is_land() -> bool:
	return has_type("land")


func is_spell() -> bool:
	return has_type("instant") or has_type("sorcery")


func is_permanent() -> bool:
	return has_type("creature") or has_type("land") or has_type("artifact") or has_type("enchantment")
