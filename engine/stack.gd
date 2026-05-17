class_name Stack
extends RefCounted

# The MTG stack. Entries are Dictionaries (flexible shape, easy serialization):
#   Spell:   {"kind": "spell",   "source_iid", "controller_key", "targets"}
#   Trigger: {"kind": "trigger", "source_iid", "controller_key", "trigger", "targets"}

var entries: Array[Dictionary] = []


func push(entry: Dictionary) -> void:
	entries.append(entry)


# null if empty.
func top() -> Variant:
	if entries.is_empty():
		return null
	return entries[entries.size() - 1]


# null if empty.
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


func duplicate_deep() -> Stack:
	var copy := Stack.new()
	for entry in entries:
		var entry_copy: Dictionary = entry.duplicate()
		if entry_copy.has("targets"):
			var targets_copy: Array = []
			for t in entry_copy.targets:
				targets_copy.append(t.duplicate() if t is Dictionary else t)
			entry_copy.targets = targets_copy
		copy.entries.append(entry_copy)
	return copy
