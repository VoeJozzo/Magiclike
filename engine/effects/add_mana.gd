extends RefCounted

# {"kind": "add_mana", "amounts": {"R": 1}} OR flat shorthand: {"kind": "add_mana", "R": 1}.

static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var amounts: Dictionary = effect.get("amounts", {})
	if amounts.is_empty():
		amounts = {}
		for k in ["W", "U", "B", "R", "G", "C"]:
			if effect.has(k):
				amounts[k] = effect[k]
	if amounts.is_empty():
		push_warning("add_mana: effect has no amounts")
		return
	ctx.controller.mana.add_dict(amounts)
	_log(ctx, "%s adds %s (pool: %s)" % [ctx.source_name, _fmt(amounts), ctx.controller.mana.to_string_short()])


# MTG notation: colored repeats letters, generic uses leading number. See mana_pool.to_string_short.
static func _fmt(amounts: Dictionary) -> String:
	var s := ""
	if amounts.get("C", 0) > 0:
		s += str(amounts["C"])
	for color in ["W", "U", "B", "R", "G"]:
		for i in range(amounts.get(color, 0)):
			s += color
	return s if s != "" else "(none)"


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/add_mana] %s" % msg)
