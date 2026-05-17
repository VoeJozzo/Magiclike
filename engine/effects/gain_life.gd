extends RefCounted

# {"kind": "gain_life", "amount": int} — always applies to ctx.controller.

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
