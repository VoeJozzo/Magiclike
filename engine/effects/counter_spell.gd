extends RefCounted

# {"kind": "counter_spell", "target": "chosen"} — target must be {"kind": "stack", "iid": int}.
# Routes to RulesEngine.counter_stack_entry (touches the autoload-only _stack_held_cards buffer).
# Fizzles cleanly if target spell left the stack.

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
	var ok: bool = RulesEngine.counter_stack_entry(iid)
	if ok:
		_log(ctx, "%s counters the targeted spell" % ctx.source_name)
	else:
		_log(ctx, "%s fizzles (target spell no longer on the stack)" % ctx.source_name)


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/counter_spell] %s" % msg)
