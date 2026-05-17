class_name Stack
extends RefCounted

# The MTG stack — last-in-first-out queue of spells and triggered abilities
# waiting to resolve. Per plan decision C1, this is real from day one.
#
# Each entry is a Dictionary:
#   Spell:   {"kind": "spell",   "source_iid": int, "controller_key": String, "targets": Array}
#   Trigger: {"kind": "trigger", "source_iid": int, "controller_key": String, "trigger": Dictionary, "targets": Array}
#
# Phase 1 only ever has Spell entries; trigger entries land in Phase 4.
# We use Dictionaries (not a typed StackEntry class) for forward-compat with
# the JS prototype's flexible shape and to keep serialization simple.

var entries: Array[Dictionary] = []


func push(entry: Dictionary) -> void:
	entries.append(entry)


# Top of the stack (the next thing that will resolve). null if empty.
func top() -> Variant:
	if entries.is_empty():
		return null
	return entries[entries.size() - 1]


# Pop and return the top entry. null if empty.
func pop_top() -> Variant:
	if entries.is_empty():
		return null
	return entries.pop_back()


func is_empty() -> bool:
	return entries.is_empty()


func size() -> int:
	return entries.size()


func clear() -> void:
	entries.clear()


# Phase 5b: deep copy. Each entry Dictionary is duplicated (including its
# nested targets array) so mutations on the copy don't leak.
func duplicate_deep() -> Stack:
	var copy := Stack.new()
	for entry in entries:
		var entry_copy: Dictionary = entry.duplicate()
		# targets is a nested Array of Dictionaries — deep-clone each.
		if entry_copy.has("targets"):
			var targets_copy: Array = []
			for t in entry_copy.targets:
				targets_copy.append(t.duplicate() if t is Dictionary else t)
			entry_copy.targets = targets_copy
		copy.entries.append(entry_copy)
	return copy
