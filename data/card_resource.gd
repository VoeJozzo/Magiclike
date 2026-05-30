class_name CardResource
extends Resource

# Card template base — engine identity + visual data, one .tres per card under
# cards/templates/<id>.tres. Loaded via CardDatabase.get_card(card_id) for
# engine use and via TresCardFactory.create_card(card_id, zone) for visual
# spawning. front_image_path is a filename relative to the factory's
# card_asset_dir (currently res://cards/images).

@export var card_id: String = ""
@export var display_name: String = ""
@export var front_image_path: String = "card_front.png"

@export var card_types: Array[String] = []
@export var subtypes: Array[String] = []

# Cost keys: W/U/B/R/G + C (generic). Empty for lands / free spells.
@export var mana_cost: Dictionary = {}

@export var text: String = ""

# Each: {"kind": "<effect_kind>", ...}. Resolved through engine/effects/effects.gd.
@export var on_cast_effects: Array[Dictionary] = []

# Each: {"cost": {"tap": true, "mana": {...}}, "effects": [...]}.
@export var activated_abilities: Array[Dictionary] = []

# Each: {"event": ..., "cond_id": "<name>", "effects": [...]}. See engine/predicates/.
@export var triggers: Array[Dictionary] = []


func has_type(type_name: String) -> bool:
	return type_name in card_types


func is_land() -> bool:
	return has_type("land")


func is_spell() -> bool:
	return has_type("sorcery")


func is_permanent() -> bool:
	return has_type("creature") or has_type("land") or has_type("artifact")
