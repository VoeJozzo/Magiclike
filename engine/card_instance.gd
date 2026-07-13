class_name CardInstance
extends RefCounted

# A specific copy of a card in a specific zone with in-play state. CardResource is the
# printed design; CardInstance is the runtime copy. instance_id is the UI ↔ engine link.

var instance_id: int = 0
var template: CardResource = null

# Owner: who owns the card ("return to owner's hand"). Controller: who runs it now (diverges in Phase 3+).
var owner_key: String = ""
var controller_key: String = ""

var tapped: bool = false
var summoning_sick: bool = true
var counters: Dictionary = {}
var damage_marked: int = 0
# Pump bonuses accumulate additively across casts; cleared in CLEANUP.
var temp_power: int = 0
var temp_toughness: int = 0
var attacking: bool = false
var blocking_iid: int = -1  # -1 = not blocking; otherwise the attacker's iid

# Runtime keyword grants (pump, stickers). Combined w/ template baseline via effective_keywords().
var granted_keywords: Array[String] = []

# MTG 702.2: any damage from a deathtouch source flags lethal regardless of amount.
var lethal_marked: bool = false


func _init(p_template: CardResource = null, p_owner: String = "", p_controller: String = "") -> void:
	template = p_template
	owner_key = p_owner
	controller_key = p_controller


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


# Live P/T: base + pump + counters. Returns 0 for non-creatures.
func current_power() -> int:
	if template == null or not (template is CreatureResource):
		return 0
	var p: int = template.power + temp_power
	if counters.has("+1/+1"):
		p += counters["+1/+1"]
	return p


func current_toughness() -> int:
	if template == null or not (template is CreatureResource):
		return 0
	var t: int = template.toughness + temp_toughness
	if counters.has("+1/+1"):
		t += counters["+1/+1"]
	return t


# Called during CLEANUP for every creature.
func clear_eot_modifiers() -> void:
	temp_power = 0
	temp_toughness = 0
	damage_marked = 0
	lethal_marked = false
	attacking = false
	blocking_iid = -1
	granted_keywords.clear()


# template shared by ref (immutable per-game); counters deep-cloned.
func duplicate_deep() -> CardInstance:
	var copy := CardInstance.new(template, owner_key, controller_key)
	copy.instance_id = instance_id
	copy.tapped = tapped
	copy.summoning_sick = summoning_sick
	copy.counters = counters.duplicate()
	copy.damage_marked = damage_marked
	copy.lethal_marked = lethal_marked
	copy.temp_power = temp_power
	copy.temp_toughness = temp_toughness
	copy.attacking = attacking
	copy.blocking_iid = blocking_iid
	copy.granted_keywords = granted_keywords.duplicate()
	return copy


# Keywords implied by creature subtype — card data need not repeat these.
const SUBTYPE_KEYWORDS: Dictionary = {
	"angel": ["flying"],
	"dragon": ["flying"],
	"treefolk": ["reach"],
	"wall": ["defender"],
}


# Single seam for combat/target checks: template baseline + runtime grants + subtype-implied, deduped.
func effective_keywords() -> Array:
	if template == null:
		return granted_keywords
	var base: Array = []
	if template is CreatureResource:
		base = template.keywords
	var result: Array = []
	for kw in base:
		if not (kw in result):
			result.append(kw)
	for kw in granted_keywords:
		if not (kw in result):
			result.append(kw)
	if template is CreatureResource:
		for st: String in template.subtypes:
			for kw: String in SUBTYPE_KEYWORDS.get(st, []):
				if not (kw in result):
					result.append(kw)
	return result


func has_keyword(kw: String) -> bool:
	return kw in effective_keywords()
