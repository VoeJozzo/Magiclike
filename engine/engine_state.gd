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

# Combat state. attackers: Array of CardInstance.instance_id values for creatures
# declared as attacking this combat. Cleared during cleanup.
# blockers (Phase 3+): Dictionary mapping blocker_iid -> attacker_iid.
var attackers: Array[int] = []
var blockers: Dictionary = {}

# Phase 4: queue of triggers that have fired but haven't yet been pushed onto
# the stack. Drained between actions (after SBAs settle) in APNAP order, then
# each entry becomes a stack push. Mirrors the JS prototype's pendingTriggers.
# Each entry: {
#   "source_iid": int,           # the permanent whose ability triggered
#   "controller_key": String,    # who controls the trigger
#   "ability_index": int,        # index into source.template.triggered_abilities
#   "event": Dictionary,         # the event that caused this (for predicate inspection)
#   "targets": Array,            # any targets baked in at trigger time
# }
var pending_triggers: Array[Dictionary] = []

# Phase 4.5b: when a "you"-controlled trigger needs an interactive target
# pick, the drainer pauses and stuffs metadata here so the UI can prompt the
# player. Cleared once KIND_PICK_TRIGGER_TARGET fires. Empty Dictionary when
# nothing awaits a target.
# Shape: {"source_iid": int, "controller_key": "you", "ability_index": int,
#         "filter": String}
var awaiting_target_for_trigger: Dictionary = {}

# Phase 5c UI polish (strict COMBAT_BLOCK ordering — MTG rule 509.1a): true
# between the start of the COMBAT_BLOCK step and the moment the defender
# confirms blocks. While true, NO player has priority — the defender
# declares blocks as a turn-based action without spell casting. Cleared by
# the AI driver immediately at phase entry (AI defender) or by the human
# defender's CONFIRM_BLOCKS action (manual defender).
var awaiting_block_declaration: bool = false

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


# Phase 5b: deep copy for AI state snapshots. Used by simulate_combat and
# any other AI subroutine that needs to mutate state hypothetically. All
# RefCounted children are deep-copied via their duplicate_deep methods.
# CardResource templates are shared by reference (immutable per-game).
func duplicate_deep() -> EngineState:
	var copy := EngineState.new()
	# _init created fresh you/opp/phase_machine/stack; replace with deep copies.
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
	copy.log = log.duplicate()  # logs aren't deep but no mutation hazard
	copy.winner = winner
	copy._next_iid = _next_iid
	return copy
