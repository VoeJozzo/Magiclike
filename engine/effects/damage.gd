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
			# Find the creature instance on the battlefield. If gone, fizzle.
			var iid: int = t.get("iid", -1)
			var found = ctx.state.find_instance(iid)
			if found == null or found.card == null or found.zone_name != "battlefield":
				_log(ctx, "%s fizzles (target gone)" % ctx.source_name)
				return
			var creature: CardInstance = found.card
			creature.damage_marked += amount
			_log(ctx, "%s deals %d to %s (marked: %d / toughness %d)" % [
				ctx.source_name, amount, creature.name(),
				creature.damage_marked, creature.current_toughness(),
			])
			# State-based actions will run after this effect to clean up
			# any creature with damage_marked >= toughness.
		_:
			push_warning("damage: unknown target kind '%s'" % t.get("kind", ""))


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/damage] %s" % msg)
