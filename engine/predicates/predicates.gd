class_name Predicates
extends RefCounted

# String-keyed condition registry for triggered abilities (decision B1 with
# future-proof seams — see docs/godot-port-plan.md).
#
# Each card with a non-trivial trigger condition references its predicate by
# string in the card resource:
#   triggered_abilities: [{"event": "card_dies", "condition_predicate": "opp_lost_life_this_turn", ...}]
#
# Today the predicates live here (and optionally on a card's own GDScript class).
# If we later add procedural trigger generation, a shared library on this class
# fills the same slot — no resource format change needed.
#
# Calling convention (DOCUMENTED — DO NOT REACH FOR THE RulesEngine AUTOLOAD):
#   func cond_<name>(state: EngineState, source: CardInstance, event: Dictionary) -> bool
# Pass the full state explicitly to keep predicates testable and pure.

# Phase 4 predicate registry. Entries:
#   - "opp_lost_life_this_turn" — Bloodlust Berserker's death trigger condition:
#     true iff the opponent of the source's controller has lost ≥1 life this turn.
const _PRED_NAMES := [
	"opp_lost_life_this_turn",
]


# Evaluate a predicate by name. Returns true if the predicate's condition is
# satisfied for this source + event. Empty/missing name → true (no condition
# means the trigger always fires).
static func evaluate(
	pred_name: String,
	state: EngineState,
	source: CardInstance,
	event: Dictionary
) -> bool:
	if pred_name == "":
		return true
	match pred_name:
		"opp_lost_life_this_turn":
			return cond_opp_lost_life_this_turn(state, source, event)
		_:
			push_warning("Predicates.evaluate: unknown predicate '%s' — treating as false" % pred_name)
			return false


# True iff the opponent of `source.controller_key` has life_lost_this_turn > 0.
# Used by Bloodlust Berserker's death trigger.
static func cond_opp_lost_life_this_turn(
	state: EngineState,
	source: CardInstance,
	_event: Dictionary
) -> bool:
	if state == null or source == null:
		return false
	var opp_key: String = state.opponent_of(source.controller_key)
	var opp: Player = state.player_by_key(opp_key)
	if opp == null:
		return false
	return opp.life_lost_this_turn > 0


# Boot-time validation: walks all card resources and asserts every
# condition_predicate string in their triggered_abilities is a known predicate
# name. Called from RulesEngine._ready(). Fails loudly at startup so typos
# surface immediately, not at the moment the trigger first fires.
static func validate_all_card_predicates(card_resources: Array) -> void:
	var unknown: Array[String] = []
	for card in card_resources:
		if card == null:
			continue
		for trig in card.triggered_abilities:
			var pred: String = trig.get("condition_predicate", "")
			if pred == "":
				continue  # No predicate = trigger always fires (e.g., self ETB)
			if not _PRED_NAMES.has(pred) and not _is_card_local_predicate(card, pred):
				unknown.append("%s.%s" % [card.card_id, pred])
	if not unknown.is_empty():
		push_error("Unknown condition_predicate(s): %s" % ", ".join(unknown))


# A predicate may be defined on the card's own GDScript class (B1 pattern).
# Reserved for future use — when individual cards carry their own script with
# `cond_<name>` methods, this lookup unblocks them without bloating the central
# registry. Phase 4 has no card-local predicates yet.
static func _is_card_local_predicate(_card: CardResource, _pred: String) -> bool:
	return false
