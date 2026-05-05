extends RefCounted

# Effect handler: add_mana. Adds mana to the controller's mana pool.
#
# Effect dictionary shape:
#   {"kind": "add_mana", "amounts": {"R": 1}}
#       or {"R": 1} as a flat shorthand on the effect (back-compat)
#
# ctx fields used: ctx.controller (Player with .mana: ManaPool), ctx.source_name


static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var amounts: Dictionary = effect.get("amounts", {})
	if amounts.is_empty():
		# Back-compat shorthand: take any color keys directly off the effect dict.
		amounts = {}
		for k in ["W", "U", "B", "R", "G", "C"]:
			if effect.has(k):
				amounts[k] = effect[k]
	if amounts.is_empty():
		push_warning("add_mana: effect has no amounts")
		return
	ctx.controller.mana.add_dict(amounts)
	_log(ctx, "%s adds %s (pool: %s)" % [ctx.source_name, _fmt(amounts), ctx.controller.mana.to_string_short()])


# MTG mana notation (see mana_pool.gd to_string_short for rationale): colored
# mana repeats letters, generic uses a leading number. "1R" means 1 generic +
# 1 red, never "one red".
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
