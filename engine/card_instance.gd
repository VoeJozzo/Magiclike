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
var damage_marked: int = 0       # Combat damage held until cleanup
# Until-end-of-turn pump bonuses. Cleared during CLEANUP. Pump effects (Giant
# Growth and friends) accumulate here additively across multiple casts.
var temp_power: int = 0
var temp_toughness: int = 0
# Combat declaration. attacking_iid: this creature is attacking; for blockers,
# this is the iid of the creature it's blocking. For attackers, just the bool flag.
var attacking: bool = false
var blocking_iid: int = -1  # -1 = not blocking; otherwise the attacker's iid

# Phase 5a: runtime-granted keywords. Empty by default; populated by pump
# effects (later phases) and stickers (Phase 7). Combined with the template's
# baseline keywords via effective_keywords().
var granted_keywords: Array[String] = []

# Phase 5a: damage from a deathtouch source flags the recipient for death
# regardless of how little damage was dealt (MTG 702.2). Cleared in
# clear_eot_modifiers along with damage_marked.
var lethal_marked: bool = false


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


# Live power/toughness — base plus temp bonuses plus +1/+1 counters etc.
# Used by combat damage, state-based actions, and the UI's P/T display.
# Returns 0 for non-creatures.
func current_power() -> int:
	if template == null or not (template is CreatureResource):
		return 0
	var p: int = template.power + temp_power
	# +1/+1 counters
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


# Reset until-end-of-turn modifiers. Called during CLEANUP for every creature.
func clear_eot_modifiers() -> void:
	temp_power = 0
	temp_toughness = 0
	damage_marked = 0
	lethal_marked = false
	attacking = false
	blocking_iid = -1
	granted_keywords.clear()


# Phase 5a: combined keyword set — template's baseline + any runtime grants
# (pump effects, stickers). Single seam used by all combat / target checks.
# Non-creatures return their template keywords unchanged (lands can have
# defender on the template, but that's not modeled yet).
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
	return result


# Convenience: true iff this card has the given keyword (baseline or granted).
func has_keyword(kw: String) -> bool:
	return kw in effective_keywords()
