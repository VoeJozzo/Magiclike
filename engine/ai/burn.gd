class_name AIBurn
extends RefCounted

# Phase 5c: lethal burn detection — would casting all our face-damaging
# spells (cumulatively) take the opponent's life to 0 or below?
#
# Ported from reference/html-proto/js/ai.js::findBurnLethal. Phase 5c keeps
# it tight: walks hand looking for direct-damage spells targeting players,
# sums their damage potential, compares to opp life. Doesn't sequence the
# casts (i.e., doesn't check if you have mana for the WHOLE chain).
#
# Returns the total face-damage available from instants/sorceries in hand
# that target players (whether actually castable this turn or not — caller
# decides whether to trust the lethal call given current mana).


# Walk player's hand. For each spell that deals damage to a player target,
# add its potential damage to the total. Targets that are creature-only
# (like Pump effects) are excluded.
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
		# Heuristic: only direct-damage spells. We check on_cast_effects
		# for a damage effect whose target spec is "chosen" or "opponent"
		# AND the target_filter allows player targets.
		var spell: SpellResource = card.template
		var deals_face: bool = false
		var amount: int = 0
		for effect in spell.on_cast_effects:
			if effect.get("kind", "") != "damage":
				continue
			# "opponent" target spec — always face damage.
			# "chosen" — only if filter allows player.
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


# True if the player can plausibly deal lethal damage to the opponent this
# turn: total unblocked attack power + burn damage from hand >= opp.life.
# Assumes opponent has no blockers (optimistic), so this is the "go for
# lethal" trigger rather than a guaranteed-kill check. AI should still
# sequence carefully.
static func has_lethal(state: EngineState, attacker_key: String) -> bool:
	var defender_key: String = state.opponent_of(attacker_key)
	var defender: Player = state.player_by_key(defender_key)
	if defender == null:
		return false
	var attacker: Player = state.player_by_key(attacker_key)
	# Sum power of every creature that could attack right now.
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
