class_name AIScoring
extends RefCounted

# Phase 5b: heuristic scoring of card resources. Ported (~1:1 in shape, with
# Godot-typed signatures) from reference/html-proto/js/ai.js's getCardValue.
#
# Returns a float — higher is "better." The exact magnitudes mirror the JS
# table so that Phase 5c's AI port lands at parity decisions without
# re-tuning. The constants here are intentionally not "nice round numbers" —
# they're the values the JS heuristic settled on after playtesting.
#
# Two purpose modes:
#   - "kill": valuing a creature for removal/blocking decisions (its threat
#     level on the battlefield). Discount mana cost less because the cost is
#     already sunk; what matters is what it does now.
#   - "draft": valuing a card for deck construction. Mana cost matters more.
#
# Future extensions (Phase 5c+):
#   - Triggered-ability scoring depth (currently a thin estimate)
#   - Lord/static-anthem buffs (need card-pool context)
#   - Subtype-tribal synergy

const KEYWORD_VALUES := {
	"flying": 4.0,
	"lifelink": 3.0,
	"deathtouch": 3.0,
	"haste": 2.0,
	"vigilance": 2.0,
	"first_strike": 2.0,
	"indestructible": 4.0,
	"hexproof": 3.0,
	"unblockable": 5.0,
	"menace": 1.0,
	"reach": 1.0,
	"trample": 2.0,
	"defender": -3.0,
}


# Score a CardResource. Returns a float; higher = better card for `purpose`.
static func card_value(template: CardResource, purpose: String = "draft") -> float:
	if template == null:
		return 0.0
	var cost: int = _converted_mana_cost(template.mana_cost)
	# Land baseline: lands are valuable for mana but don't fit the same curve.
	# Phase 5b uses a flat value for any land; later we'd score multi-color
	# producers higher.
	if template.is_land():
		return 5.0
	var score: float = 0.0
	if template is CreatureResource:
		var c: CreatureResource = template
		# Stats baseline: power + toughness, discounted by 2× cost (the
		# prototype's "creature efficiency" heuristic).
		score += float(c.power + c.toughness)
		if purpose == "draft":
			score -= 2.0 * cost
		else:
			# "kill" purpose: cost is sunk, weight stats more directly.
			score -= 0.5 * cost
		# Keyword bonuses.
		for kw in c.keywords:
			score += KEYWORD_VALUES.get(kw, 0.0)
	else:
		# Instants/sorceries: value comes from effects, not stats. A rough
		# pass — Phase 5c will tune this when the AI actually evaluates
		# situational targets.
		score += 6.0  # base "card-worth-having"
		score -= 1.5 * cost
		# Look for damage / counter / draw signatures in on_cast_effects.
		for effect in template.on_cast_effects:
			match effect.get("kind", ""):
				"damage":
					score += 2.0 + float(effect.get("amount", 0))
				"counter_spell":
					score += 6.0  # premium effect
				"gain_life":
					score += 1.0
				"pump":
					score += float(effect.get("amount_power", 0)) + float(effect.get("amount_toughness", 0))
	# Triggered-ability presence is worth a small bump even without scoring
	# the actual effects (Phase 5c will replace this with per-effect scoring).
	if not template.triggered_abilities.is_empty():
		score += 2.0
	return score


# Sum of all mana_cost entries (colored + generic). Treats every pip as one
# point of cost regardless of color — equivalent to converted mana cost.
static func _converted_mana_cost(cost: Dictionary) -> int:
	var total: int = 0
	for k in cost:
		total += int(cost[k])
	return total
