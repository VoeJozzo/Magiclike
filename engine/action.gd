class_name Action
extends RefCounted

# Actions are Dictionaries keyed by "kind". This class holds constants + constructors.
# Target descriptor: {"kind": "player"|"creature", "who": "you"|"opp"} or {"kind": "creature", "iid": int}.

const KIND_PASS_PRIORITY := "pass_priority"
const KIND_ACTIVATE_ABILITY := "activate_ability"
const KIND_PLAY_LAND := "play_land"
const KIND_CAST_SPELL := "cast_spell"
const KIND_DECLARE_ATTACKER := "declare_attacker"
const KIND_DECLARE_BLOCKER := "declare_blocker"
# Undo a declaration before the phase advances. Engine untaps undeclared attackers and clears blocker links.
const KIND_UNDECLARE_ATTACKER := "undeclare_attacker"
const KIND_UNDECLARE_BLOCKER := "undeclare_blocker"
# Defender commits block declarations: clears awaiting_block_declaration, opens APNAP priority window.
const KIND_CONFIRM_BLOCKS := "confirm_blocks"
# Supplies the target for a queued triggered ability awaiting input (see state.awaiting_target_for_trigger).
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


static func make_declare_blocker(blocker_iid: int, attacker_iid: int) -> Dictionary:
	return {
		"kind": KIND_DECLARE_BLOCKER,
		"source_iid": blocker_iid,
		"attacker_iid": attacker_iid,
	}


static func make_undeclare_attacker(source_iid: int) -> Dictionary:
	return {"kind": KIND_UNDECLARE_ATTACKER, "source_iid": source_iid}


static func make_undeclare_blocker(source_iid: int) -> Dictionary:
	return {"kind": KIND_UNDECLARE_BLOCKER, "source_iid": source_iid}


static func make_confirm_blocks() -> Dictionary:
	return {"kind": KIND_CONFIRM_BLOCKS}


static func target_player(who: String) -> Dictionary:
	return {"kind": "player", "who": who}


static func target_creature(iid: int) -> Dictionary:
	return {"kind": "creature", "iid": iid}


static func make_pick_trigger_target(target: Dictionary) -> Dictionary:
	return {"kind": KIND_PICK_TRIGGER_TARGET, "target": target}
