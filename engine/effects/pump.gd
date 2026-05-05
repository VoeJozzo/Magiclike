extends RefCounted

# Effect handler: pump. Adds temporary +N/+M to a target creature until end
# of turn (or for "permanent" duration, accumulates as +N/+M counters — but
# Phase 3 only does EOT pumps).
#
# Effect dictionary shape:
#   {"kind": "pump", "amount_power": <int>, "amount_toughness": <int>,
#    "target": "chosen", "duration": "eot"}
#
# Targets a creature picked at cast time (ctx.targets[0] with kind=="creature").
# Phase 4+ may add "any creature you control" or other filters.


static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var dp: int = effect.get("amount_power", 0)
	var dt: int = effect.get("amount_toughness", 0)
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
		# Permanent +1/+1 counters (Phase 4+ for cards that grant these).
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
