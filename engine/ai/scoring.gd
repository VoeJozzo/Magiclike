class_name AIScoring
extends RefCounted

# Card heuristic scoring. Ported from js/ai.js::getCardValue.
# Constants are playtested values — DO NOT round; that would shift AI decisions.
# Purpose: "kill" (board threat, cost is sunk) or "draft" (deckbuild, cost matters more).

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


static func card_value(template: CardResource, purpose: String = "draft") -> float:
	if template == null:
		return 0.0
	var cost: int = _converted_mana_cost(template.mana_cost)
	if template.is_land():
		return 5.0
	var score: float = 0.0
	if template is CreatureResource:
		var c: CreatureResource = template
		score += float(c.power + c.toughness)
		if purpose == "draft":
			score -= 2.0 * cost
		else:
			score -= 0.5 * cost
		for kw in c.keywords:
			score += KEYWORD_VALUES.get(kw, 0.0)
	else:
		score += 6.0
		score -= 1.5 * cost
		for effect in template.on_cast_effects:
			match effect.get("kind", ""):
				"damage":
					score += 2.0 + float(effect.get("amount", 0))
				"counter_spell":
					score += 6.0
				"gain_life":
					score += 1.0
				"pump":
					score += float(effect.get("amount_power", 0)) + float(effect.get("amount_toughness", 0))
	if not template.triggered_abilities.is_empty():
		score += 2.0
	return score


# Converted mana cost — sum of all pips, color-blind.
static func _converted_mana_cost(cost: Dictionary) -> int:
	var total: int = 0
	for k in cost:
		total += int(cost[k])
	return total
