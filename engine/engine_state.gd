class_name EngineState
extends RefCounted

# Game state. RulesEngine holds one; mutations go via execute_action().
# Mirrors the JS prototype's G object.

var you: Player = null
var opp: Player = null

var active_player_key: String = "you"
# May differ from active_player during instant-speed responses.
var priority_player_key: String = "you"
# Both true → resolve top of stack (or advance phase if empty).
var priority_passed: Dictionary = {"you": false, "opp": false}

var phase_machine: PhaseMachine = null
var turn: int = 1

var stack: Stack = null

var attackers: Array[int] = []  # declared this combat; cleared at cleanup
var blockers: Dictionary = {}   # blocker_iid → attacker_iid

# Queue of fired triggers awaiting stack push. APNAP-drained between actions.
# Entry: {source_iid, controller_key, ability_index, event, targets}.
var pending_triggers: Array[Dictionary] = []

# Trigger target picker pause state. {source_iid, controller_key, ability_index, filter}.
var awaiting_target_for_trigger: Dictionary = {}

# MTG 509.1a: true during COMBAT_BLOCK turn-based block declaration. No priority while true.
var awaiting_block_declaration: bool = false

var log: Array[String] = []
var winner: String = ""  # "" | "you" | "opp"
var _next_iid: int = 1


func _init() -> void:
	you = Player.new("You", "you")
	opp = Player.new("Opponent", "opp")
	phase_machine = PhaseMachine.new()
	stack = Stack.new()


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


func make_instance(template: CardResource, owner_key: String) -> CardInstance:
	var inst := CardInstance.new(template, owner_key, owner_key)
	inst.instance_id = _next_iid
	_next_iid += 1
	return inst


# {card, controller, zone_name} or null. Searches zones + stack.
func find_instance(iid: int) -> Variant:
	for p in [you, opp]:
		for zone_name in ["hand", "battlefield", "library", "graveyard", "exile"]:
			var zone: Array = p.get(zone_name)
			for c in zone:
				if c.instance_id == iid:
					return {"card": c, "controller": p, "zone_name": zone_name}
	for entry in stack.entries:
		if entry.get("source_iid", -1) == iid:
			return {"card": null, "controller": player_by_key(entry.controller_key), "zone_name": "stack"}
	return null


func append_log(line: String) -> void:
	log.append(line)
	print("[ENG] %s" % line)


# Deep clone for AI state simulation. CardResource templates shared by ref (immutable per-game).
func duplicate_deep() -> EngineState:
	var copy := EngineState.new()
	copy.you = you.duplicate_deep()
	copy.opp = opp.duplicate_deep()
	copy.active_player_key = active_player_key
	copy.priority_player_key = priority_player_key
	copy.priority_passed = priority_passed.duplicate()
	copy.phase_machine = PhaseMachine.new()
	copy.phase_machine.current = phase_machine.current
	copy.turn = turn
	copy.stack = stack.duplicate_deep()
	copy.attackers = attackers.duplicate()
	copy.blockers = blockers.duplicate()
	copy.pending_triggers = []
	for trig in pending_triggers:
		copy.pending_triggers.append(trig.duplicate(true))
	copy.awaiting_target_for_trigger = awaiting_target_for_trigger.duplicate(true)
	copy.log = log.duplicate()
	copy.winner = winner
	copy._next_iid = _next_iid
	return copy
