class_name CardDatabase
extends RefCounted

# Thin loader over the per-card .tres files in this directory. Backing store
# is res://cards/templates/<card_id>.tres; the engine, scenes, and tests call
# CardDatabase.get_card(card_id) and don't know (or care) it's a load().
#
# To add a card: drop a new <card_id>.tres in this folder and add the card_id
# to all_card_ids() below. To remove: delete the file and remove the entry.
# To regenerate from scratch after structural changes: see tools/generate_card_tres.gd.

const _TEMPLATE_DIR := "res://cards/templates/"


static func get_card(card_id: String) -> CardResource:
	var path: String = _TEMPLATE_DIR + card_id + ".tres"
	var res: CardResource = load(path)
	if res == null:
		push_error("CardDatabase: failed to load '%s'" % path)
	return res


# Used by Engine boot-time predicate validation and any caller that needs to
# iterate the full pool. Manually maintained; add new card_ids here when you
# add a .tres in this directory.
static func all_card_ids() -> Array[String]:
	return [
		"mountain", "forest", "plains", "island", "swamp",
		"lightning_bolt", "goblin_raider",
		"grizzly_bears", "giant_growth",
		"pyromaniac", "bloodlust_berserker",
		"bear_cub", "gray_ogre", "hill_giant",
		"healing_salve", "counterspell",
		"wind_drake", "giant_spider", "serra_angel", "trained_armodon",
		"vampire_nighthawk", "raging_goblin", "walking_wall",
	]


static func all_resources() -> Array:
	var arr: Array = []
	for cid in all_card_ids():
		arr.append(get_card(cid))
	return arr
