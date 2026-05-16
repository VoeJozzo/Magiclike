class_name Action
extends RefCounted

# Action descriptor helpers. Actions are plain Dictionaries with a "kind" key —
# this class just provides constants and constructor helpers to keep call sites
# readable and prevent string typos.
#
# Mirrors the JS prototype's executeAction({kind, ...}) shape.
#
# Action shapes:
#   PASS_PRIORITY:    {kind}
#   ACTIVATE_ABILITY: {kind, source_iid, ability_index?}        (default ability_index=0)
#   PLAY_LAND:        {kind, source_iid}
#   CAST_SPELL:       {kind, source_iid, targets: Array[Dict]}
#
# A target descriptor is a Dictionary like:
#   {"kind": "player", "who": "you" | "opp"}
#   {"kind": "creature", "iid": int}        (Phase 2+)

const KIND_PASS_PRIORITY := "pass_priority"
const KIND_ACTIVATE_ABILITY := "activate_ability"
const KIND_PLAY_LAND := "play_land"
const KIND_CAST_SPELL := "cast_spell"
const KIND_DECLARE_ATTACKER := "declare_attacker"
const KIND_DECLARE_BLOCKER := "declare_blocker"
# Phase 4.5b: fills in the target for a queued triggered ability that's
# waiting on player input. Engine sets state.awaiting_target_for_trigger
# to signal which trigger is pending; this action supplies the chosen target.
const KIND_PICK_TRIGGER_TARGET := "pick_trigger_target"


static func make_pass_priority() -> Dictionary:
	return {"kind": KIND_PASS_PRIORITY}


static func make_activate_ability(source_iid: int, ability_index: int = 0) -> Dictionary:
	return {
		"kind": KIND_ACTIVATE_ABILITY,
		"source_iid": source_iid,
		"ability_index": ability_index,
	}


static func make_play_land(source_iid: int) -> Dictionary:
	return {"kind": KIND_PLAY_LAND, "source_iid": source_iid}


static func make_cast_spell(source_iid: int, targets: Array = []) -> Dictionary:
	return {"kind": KIND_CAST_SPELL, "source_iid": source_iid, "targets": targets}


static func make_declare_attacker(source_iid: int) -> Dictionary:
	return {"kind": KIND_DECLARE_ATTACKER, "source_iid": source_iid}


# Declare a blocker. blocker_iid is the defending player's creature; attacker_iid
# is the attacking creature it's blocking. State.blockers is a Dictionary
# mapping blocker_iid → attacker_iid.
static func make_declare_blocker(blocker_iid: int, attacker_iid: int) -> Dictionary:
	return {
		"kind": KIND_DECLARE_BLOCKER,
		"source_iid": blocker_iid,
		"attacker_iid": attacker_iid,
	}


static func target_player(who: String) -> Dictionary:
	return {"kind": "player", "who": who}


static func target_creature(iid: int) -> Dictionary:
	return {"kind": "creature", "iid": iid}


# Phase 4.5b: fill the pending trigger's target. The engine reads
# state.awaiting_target_for_trigger to know which trigger this completes.
static func make_pick_trigger_target(target: Dictionary) -> Dictionary:
	return {"kind": KIND_PICK_TRIGGER_TARGET, "target": target}
