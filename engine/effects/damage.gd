extends RefCounted

# {"kind": "damage", "amount": int, "target": "chosen"|"controller"|"opponent"}.

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
		ctx.controller.life_lost_this_turn += amount
		_log(ctx, "%s takes %d damage from %s (life: %d)" % [ctx.controller.name, amount, ctx.source_name, ctx.controller.life])
	elif target_spec == "opponent":
		var opp_key: String = ctx.state.opponent_of(ctx.controller.key)
		var opp_player = ctx.state.player_by_key(opp_key)
		if opp_player == null:
			push_warning("damage: opponent of %s not found" % ctx.controller.key)
			return
		opp_player.life -= amount
		opp_player.life_lost_this_turn += amount
		_log(ctx, "%s deals %d to %s (life: %d)" % [ctx.source_name, amount, opp_player.name, opp_player.life])
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
			# SBAs run after to clean up creatures w/ damage_marked >= toughness.
		_:
			push_warning("damage: unknown target kind '%s'" % t.get("kind", ""))


static func _log(ctx: Dictionary, msg: String) -> void:
	if ctx.has("log") and ctx.log != null:
		ctx.log.append(msg)
	print("[FX/damage] %s" % msg)
