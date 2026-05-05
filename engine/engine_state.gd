class_name EngineState
extends RefCounted

# Game state container. The RulesEngine autoload holds exactly one of these and
# exposes it via RulesEngine.state(). All mutations go through
# RulesEngine.execute_action(), which performs validation and emits
# state_changed afterward.
#
# Mirrors the JS prototype's `G` object (G.you, G.opp, G.activePlayer, ...).

var you: Player = null
var opp: Player = null

# Whose turn it is. Phase 1 always starts as "you".
var active_player_key: String = "you"

# Whose priority it is right now. May differ from active_player during instant-
# speed responses on opp's turn (Phase 3+).
var priority_player_key: String = "you"

# Tracks whether each player has passed priority since the last state-changing
# event. When both are true → resolve top of stack (or advance phase if empty).
var priority_passed: Dictionary = {"you": false, "opp": false}

var phase_machine: PhaseMachine = null
var turn: int = 1

var stack: Stack = null

# Log of human-readable lines describing what happened. UI subscribes to display.
var log: Array[String] = []

# Game-over state. Empty string = game ongoing; "you" or "opp" = winner key.
var winner: String = ""

# Monotonic counter for unique CardInstance ids.
var _next_iid: int = 1


func _init() -> void:
	you = Player.new("You", "you")
	opp = Player.new("Opponent", "opp")
	phase_machine = PhaseMachine.new()
	stack = Stack.new()


# Returns the Player for "you" or "opp". null if key is unrecognized.
func player_by_key(key: String) -> Variant:
	if key == "you":
		return you
	if key == "opp":
		return opp
	return null


func active_player() -> Player:
	return player_by_key(active_player_key)


func priority_player() -> Player:
	return player_by_key(priority_player_key)


func opponent_of(key: String) -> String:
	return "opp" if key == "you" else "you"


# Allocate the next instance id and create a CardInstance bound to a template.
func make_instance(template: CardResource, owner_key: String) -> CardInstance:
	var inst := CardInstance.new(template, owner_key, owner_key)
	inst.instance_id = _next_iid
	_next_iid += 1
	return inst


# Find a card instance anywhere by iid. Returns {card, controller, zone_name}
# or null if not found. Searches both players' zones and the stack.
func find_instance(iid: int) -> Variant:
	for p in [you, opp]:
		for zone_name in ["hand", "battlefield", "library", "graveyard", "exile"]:
			var zone: Array = p.get(zone_name)
			for c in zone:
				if c.instance_id == iid:
					return {"card": c, "controller": p, "zone_name": zone_name}
	# Not in a zone — might be on the stack.
	for entry in stack.entries:
		if entry.get("source_iid", -1) == iid:
			return {"card": null, "controller": player_by_key(entry.controller_key), "zone_name": "stack"}
	return null


func append_log(line: String) -> void:
	log.append(line)
	print("[ENG] %s" % line)
