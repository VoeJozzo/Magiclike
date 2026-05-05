class_name CreatureResource
extends CardResource

# Creature template. In addition to base CardResource fields, creatures have
# power, toughness, and an intrinsic keyword set (flying, haste, vigilance,
# trample, etc. — populated as we add cards that need them).
#
# Note: keywords on the *template* are baseline; runtime keyword grants/removes
# (e.g., from pump effects or sticker buffs) are stored on the CardInstance,
# not here.

@export var power: int = 0
@export var toughness: int = 0
@export var keywords: Array[String] = []
