extends RefCounted

# {"kind": "pump", "power": int, "toughness": int, "target": "chosen", "duration": "eot"}.
# duration != "eot" → permanent +1/+1 counters (using max of dp/dt).

static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var dp: int = effect.get("power", 0)
	var dt: int = effect.get("toughness", 0)
	var duration: String = effect.get("duration", "eot")

	if ctx.targets.is_empty():
		_log(ctx, "%s fizzles (no target)" % ctx.source_name)
		return
	var t: Dictionary = ctx.targets[0]
	if t.get("kind", "") != "creature":
		push_warning("pump: target kind is '%s', expected 'creature'" % t.get("kind", ""))
		return
	var target_iid: int = t.get("iid", -1)
	var found = ctx.state.find_instance(target_iid)
	if found == null or found.card == null or found.zone_name != "battlefield":
		_log(ctx, "%s fizzles (target gone)" % ctx.source_name)
		return
	var creature: CardInstance = found.card

	if duration == "eot":
		creature.temp_power += dp
		creature.temp_toughness += dt
	else:
		var key := "+1/+1"
		var current: int = creature.counters.get(key, 0)
		creature.counters[key] = current + max(dp, dt)

	_log(ctx, "%s gives %s +%d/+%d (now %d/%d)" % [
		ctx.source_name, creature.name(), dp, dt,
		creature.current_power(), creature.current_toughness(),
	])


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/pump] %s" % msg)
