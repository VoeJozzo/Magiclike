class_name Predicates
extends RefCounted

# String-keyed condition registry for triggered abilities (decision B1 with
# future-proof seams — see docs/godot-port-plan.md).
#
# Each card with a non-trivial trigger condition references its predicate by
# string in the card resource:
#   triggered_abilities: [{"event": "card_dies", "condition_predicate": "creature_self_damaged_died", ...}]
#
# Today the predicates live here (or on the card's own GDScript class). If we
# later add procedural trigger generation, a shared library on this class fills
# the same slot — no resource format change needed.
#
# Calling convention (DOCUMENTED — DO NOT REACH FOR THE Engine AUTOLOAD):
#   func cond_<name>(state: EngineState, source: CardInstance, event: Dictionary) -> bool
# Pass the full state explicitly to keep predicates testable and pure.

# Phase 1 has no triggered abilities — registry is empty. Boot-time validation
# pass below catches typos in card resources.
const REGISTRY := {
	# "creature_self_damaged_died": Callable(_self, "cond_creature_self_damaged_died"),
}


# Boot-time validation: walks all card resources and asserts every
# condition_predicate string in their triggered_abilities is a key in REGISTRY.
# Called from RulesEngine._ready(). Fails loudly at startup so typos surface
# immediately, not at the moment the trigger first fires.
static func validate_all_card_predicates(card_resources: Array) -> void:
	var unknown: Array[String] = []
	for card in card_resources:
		if card == null:
			continue
		for trig in card.triggered_abilities:
			var pred: String = trig.get("condition_predicate", "")
			if pred == "":
				continue  # No predicate = trigger always fires (e.g., self ETB)
			if not REGISTRY.has(pred) and not _is_card_local_predicate(card, pred):
				unknown.append("%s.%s" % [card.card_id, pred])
	if not unknown.is_empty():
		push_error("Unknown condition_predicate(s): %s" % ", ".join(unknown))


# A predicate may be defined on the card's own GDScript class (B1 pattern).
# In Phase 1, no card scripts exist yet — always returns false.
static func _is_card_local_predicate(_card: CardResource, _pred: String) -> bool:
	# Phase 4+: check if the card has an attached script with method `cond_<pred>`.
	return false
