class_name CardInstance
extends RefCounted

# A specific copy of a card in a specific zone with specific in-play state.
# Distinguished from CardResource (the printed card design) — every Mountain
# in a deck shares one CardResource but has its own CardInstance.
#
# instance_id is unique per game; the bidirectional UI ↔ engine link uses it.

var instance_id: int = 0
var template: CardResource = null

# Owner = player who owns the card (for "return to owner's hand" effects).
# Controller = player who controls it right now (matters when cards change
# control in Phase 3+; in Phase 1 owner == controller always).
var owner_key: String = ""       # "you" or "opp"
var controller_key: String = ""  # same as above

# In-play state.
var tapped: bool = false
var summoning_sick: bool = true  # Set true on entry, cleared at controller's untap step
var counters: Dictionary = {}    # e.g., {"+1/+1": 2} for Phase 2+
var damage_marked: int = 0       # Combat damage held until cleanup (Phase 3+)


func _init(p_template: CardResource = null, p_owner: String = "", p_controller: String = "") -> void:
	template = p_template
	owner_key = p_owner
	controller_key = p_controller


# Convenience accessors that delegate to the template.
func name() -> String:
	return template.display_name if template != null else "(no template)"


func card_types() -> Array:
	return template.card_types if template != null else []


func is_land() -> bool:
	return template != null and template.is_land()


func is_spell() -> bool:
	return template != null and template.is_spell()


func is_permanent() -> bool:
	return template != null and template.is_permanent()


func mana_cost() -> Dictionary:
	return template.mana_cost if template != null else {}


func to_string_short() -> String:
	var tap_str := "T" if tapped else "U"
	return "%s[#%d %s]" % [tap_str, instance_id, name()]
