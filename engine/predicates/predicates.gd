class_name Predicates
extends RefCounted

# String-keyed condition registry for triggered abilities (decision B1, see docs/godot-port-plan.md).
# Cards reference predicates by string: triggered_abilities: [{"condition_predicate": "name", ...}].
# Calling convention: cond_<name>(state, source, event) -> bool. Pass state explicitly (no autoload reach).

const _PRED_NAMES := [
	"opp_lost_life_this_turn",
]


# Empty name → true (no condition = always fires).
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


# Called from RulesEngine._ready(). Typos fail loudly at boot, not at trigger time.
static func validate_all_card_predicates(card_resources: Array) -> void:
	var unknown: Array[String] = []
	for card in card_resources:
		if card == null:
			continue
		for trig in card.triggered_abilities:
			var pred: String = trig.get("condition_predicate", "")
			if pred == "":
				continue
			if not _PRED_NAMES.has(pred) and not _is_card_local_predicate(card, pred):
				unknown.append("%s.%s" % [card.card_id, pred])
	if not unknown.is_empty():
		push_error("Unknown condition_predicate(s): %s" % ", ".join(unknown))


# Reserved hook for card-local cond_<name> methods (B1 pattern). No callers yet.
static func _is_card_local_predicate(_card: CardResource, _pred: String) -> bool:
	return false
