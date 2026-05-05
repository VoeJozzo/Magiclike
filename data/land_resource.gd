class_name LandResource
extends CardResource

# Land template. In addition to the base CardResource fields, lands have
# `mana_produced` (which colors they tap to add). The tap ability is
# constructed automatically from this field; callers don't need to populate
# `activated_abilities` for plain mana-producing lands.

# Colors this land produces when tapped. e.g., ["R"] for Mountain,
# ["W", "U", "B", "R", "G"] for City of Brass-style 5-color lands.
@export var mana_produced: Array[String] = []
