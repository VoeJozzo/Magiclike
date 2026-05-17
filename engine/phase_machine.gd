class_name PhaseMachine
extends RefCounted

# Tracks the current phase of the turn.

enum Phase {
	UNTAP,
	UPKEEP,
	DRAW,
	MAIN1,
	COMBAT_ATTACK,
	COMBAT_BLOCK,
	COMBAT_DAMAGE,
	MAIN2,
	END,
	CLEANUP,
}

const PHASE_NAMES := {
	Phase.UNTAP: "Untap",
	Phase.UPKEEP: "Upkeep",
	Phase.DRAW: "Draw",
	Phase.MAIN1: "Main 1",
	Phase.COMBAT_ATTACK: "Declare Attackers",
	Phase.COMBAT_BLOCK: "Declare Blockers",
	Phase.COMBAT_DAMAGE: "Combat Damage",
	Phase.MAIN2: "Main 2",
	Phase.END: "End Step",
	Phase.CLEANUP: "Cleanup",
}

var current: Phase = Phase.UNTAP


# Wraps CLEANUP→UNTAP. Returns true on wrap (caller bumps turn / swaps active player).
func advance() -> bool:
	if current == Phase.CLEANUP:
		current = Phase.UNTAP
		return true
	current = (current + 1) as Phase
	return false


func reset() -> void:
	current = Phase.UNTAP


func phase_name() -> String:
	return PHASE_NAMES.get(current, "?")


func is_main_phase() -> bool:
	return current == Phase.MAIN1 or current == Phase.MAIN2


func is_combat_phase() -> bool:
	return current >= Phase.COMBAT_ATTACK and current <= Phase.COMBAT_DAMAGE
