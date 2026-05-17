class_name AIBurn
extends RefCounted

# Lethal burn detection. Ported from js/ai.js::findBurnLethal.
# Doesn't sequence — sums potential face damage regardless of mana to cast the whole chain.

static func face_damage_in_hand(state: EngineState, player_key: String) -> int:
	var p: Player = state.player_by_key(player_key)
	if p == null:
		return 0
	var total: int = 0
	for card in p.hand:
		if card.template == null:
			continue
		if not (card.template is SpellResource):
			continue
		var spell: SpellResource = card.template
		var deals_face: bool = false
		var amount: int = 0
		for effect in spell.on_cast_effects:
			if effect.get("kind", "") != "damage":
				continue
			var target_spec: String = effect.get("target", "")
			if target_spec == "opponent":
				deals_face = true
				amount += int(effect.get("amount", 0))
			elif target_spec == "chosen":
				if spell.target_filter == "creature_or_player" \
						or spell.target_filter == "player" \
						or spell.target_filter == "any":
					deals_face = true
					amount += int(effect.get("amount", 0))
		if deals_face:
			total += amount
	return total


# Optimistic: assumes opp has no blockers. "Go for lethal" trigger, not a guaranteed kill.
static func has_lethal(state: EngineState, attacker_key: String) -> bool:
	var defender_key: String = state.opponent_of(attacker_key)
	var defender: Player = state.player_by_key(defender_key)
	if defender == null:
		return false
	var attacker: Player = state.player_by_key(attacker_key)
	var attack_power: int = 0
	for c in attacker.battlefield:
		if c.template == null or not (c.template is CreatureResource):
			continue
		if c.tapped:
			continue
		if c.summoning_sick and not c.has_keyword("haste"):
			continue
		if c.has_keyword("defender"):
			continue
		attack_power += c.current_power()
	var burn: int = face_damage_in_hand(state, attacker_key)
	return (attack_power + burn) >= defender.life
