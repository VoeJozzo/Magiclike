class_name SpellResource
extends CardResource

# Spell template (instant or sorcery). In addition to base CardResource fields,
# spells declare whether they need a target picked at cast time, and what
# targeting filter applies.

# Whether the spell requires the player to pick a target at cast time.
# When true, the UI enters target-picking mode after the player clicks the
# card in hand; the chosen target is passed in the action descriptor.
@export var requires_target: bool = false

# What kinds of things are legal targets. Recognized values in Phase 1:
#   "any"           — any target (player or creature)
#   "creature"      — any creature on the battlefield
#   "player"        — any player
#   "opp_creature"  — only opponent's creatures
#   "your_creature" — only your creatures
@export var target_filter: String = "any"
