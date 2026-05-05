extends RefCounted

# Effect handler: damage. Mutates the resolved target's life (player) or
# damage_marked (creature, Phase 2+).
#
# Effect dictionary shape:
#   {"kind": "damage", "amount": <int>, "target": "chosen" | "controller" | ...}
#
# In Phase 1, only target="chosen" matters — the cast-time target is read from
# ctx.targets[0].
#
# ctx fields:
#   ctx.controller : Player        — who cast/activated the source
#   ctx.source     : CardInstance  — the card that produced this effect
#   ctx.state      : EngineState   — the full game state (for resolving target refs)
#   ctx.targets    : Array         — targets chosen at cast time (each: {kind, who?, iid?})


static func execute(effect: Dictionary, ctx: Dictionary) -> void:
	var amount: int = effect.get("amount", 0)
	var target_spec: String = effect.get("target", "chosen")

	if target_spec == "chosen":
		if ctx.targets.is_empty():
			push_warning("damage: no chosen target on ctx; effect fizzles")
			return
		var t: Dictionary = ctx.targets[0]
		_apply_damage_to_target(t, amount, ctx)
	elif target_spec == "controller":
		ctx.controller.life -= amount
		_log(ctx, "%s takes %d damage from %s" % [ctx.controller.name, amount, ctx.source_name])
	else:
		push_warning("damage: unrecognized target spec '%s'" % target_spec)


static func _apply_damage_to_target(t: Dictionary, amount: int, ctx: Dictionary) -> void:
	match t.get("kind", ""):
		"player":
			var who: String = t.get("who", "")
			var p = ctx.state.player_by_key(who)
			if p == null:
				push_warning("damage: target player '%s' not found" % who)
				return
			p.life -= amount
			p.life_lost_this_turn += amount
			_log(ctx, "%s takes %d damage from %s (life: %d)" % [p.name, amount, ctx.source_name, p.life])
		"creature":
			# Phase 2+: deal damage to a creature on the battlefield.
			# For Phase 1, log and ignore — there are no creatures yet.
			push_warning("damage: creature target not implemented in Phase 1")
		_:
			push_warning("damage: unknown target kind '%s'" % t.get("kind", ""))


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/damage] %s" % msg)
