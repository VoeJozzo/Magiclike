extends RefCounted

# Effect handler: gain_life. Mutates the controller's life upward.
#
# Effect dictionary shape:
#   {"kind": "gain_life", "amount": <int>}
#
# Target spec is always the controller — no chosen target needed. Phase 5+
# can extend with target: "chosen" for lifelink-style abilities that grant
# life to a chosen target's controller, but Healing Salve doesn't need it.
#
# ctx fields:
#   ctx.controller : Player        — who cast/activated the source
#   ctx.source     : CardInstance  — the card that produced this effect
#   ctx.state      : EngineState   — the full game state


static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var amount: int = effect.get("amount", 0)
	if amount <= 0:
		push_warning("gain_life: nonpositive amount %d — skipping" % amount)
		return
	ctx.controller.life += amount
	_log(ctx, "%s gains %d life (now %d) from %s" % [
		ctx.controller.name, amount, ctx.controller.life, ctx.source_name,
	])


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/gain_life] %s" % msg)
