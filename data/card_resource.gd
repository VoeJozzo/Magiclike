class_name CardResource
extends Resource

# Base class for all card templates. Each *card design* is one CardResource
# instance; *each copy in a game* is a CardInstance that holds a reference to
# its template plus per-instance state (tapped, damage marked, etc.).
#
# Card data lives in two places, deliberately:
#   - This Resource carries the engine's view of a card (cost, effects, predicate names)
#   - cards/data/<id>.json carries the visual layer card-framework reads
#     (front_image, display name)
# The two are linked by `card_id`.

@export var card_id: String = ""
@export var display_name: String = ""

# Card type line. Matches MTG: ["land"], ["instant"], ["sorcery"], ["creature"]
# (or multi-type like ["artifact", "creature"]).
@export var card_types: Array[String] = []
@export var subtypes: Array[String] = []

# Mana cost as Dictionary {"R": 1, "C": 2}. Empty {} for lands and free spells.
# Keys: W, U, B, R, G (colored), C (colorless / generic).
@export var mana_cost: Dictionary = {}

# Player-facing rules text (copy on the printed card).
@export var oracle_text: String = ""

# Effects to run when this is cast (instants/sorceries) or enters the battlefield
# (permanents). Each entry: {"kind": "<effect_kind>", ...params}.
# Resolved through engine/effects/effects.gd.
@export var on_cast_effects: Array[Dictionary] = []

# Activated abilities. Each: {"cost": {"tap": true, "mana": {...}}, "effects": [...]}
@export var activated_abilities: Array[Dictionary] = []

# Triggered abilities. B1 with future-proof seams: condition is referenced by
# string predicate name, not by direct method binding. See engine/predicates/.
# Each: {"event": "card_dies", "condition_predicate": "<name>", "effects": [...]}
@export var triggered_abilities: Array[Dictionary] = []


func has_type(type_name: String) -> bool:
	return type_name in card_types


func is_land() -> bool:
	return has_type("land")


func is_spell() -> bool:
	return has_type("instant") or has_type("sorcery")


func is_permanent() -> bool:
	return has_type("creature") or has_type("land") or has_type("artifact") or has_type("enchantment")
