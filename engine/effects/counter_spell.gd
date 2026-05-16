extends RefCounted

# Effect handler: counter_spell. Removes a spell from the stack and sends it
# to its owner's graveyard. Phase 4.5c's first "card targets the stack"
# effect — required for Counterspell, the prototypical hard-counter.
#
# Effect dictionary shape:
#   {"kind": "counter_spell", "target": "chosen"}
#
# The chosen target must be a stack descriptor:
#   {"kind": "stack", "iid": <spell_iid>}
#
# Engine-side: the actual removal lives on RulesEngine.counter_stack_entry
# because the engine's _stack_held_cards buffer (cards-in-flight while on
# the stack) isn't exposed to the effect dispatcher. The effect just routes.
#
# Fizzles cleanly if the target is gone (e.g., the spell already resolved or
# was countered by another card earlier in the same effect chain).


static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var target_spec: String = effect.get("target", "chosen")
	if target_spec != "chosen":
		push_warning("counter_spell: only target='chosen' supported; got '%s'" % target_spec)
		return
	if ctx.targets.is_empty():
		push_warning("counter_spell: no chosen target on ctx; effect fizzles")
		return
	var t: Dictionary = ctx.targets[0]
	if t.get("kind", "") != "stack":
		push_warning("counter_spell: target kind must be 'stack', got '%s'" % t.get("kind", ""))
		return
	var iid: int = t.get("iid", -1)
	# Hand off to RulesEngine for the actual stack-entry removal — this needs
	# to touch _stack_held_cards which lives on the autoload.
	var ok: bool = RulesEngine.counter_stack_entry(iid)
	if ok:
		_log(ctx, "%s counters the targeted spell" % ctx.source_name)
	else:
		_log(ctx, "%s fizzles (target spell no longer on the stack)" % ctx.source_name)


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/counter_spell] %s" % msg)
