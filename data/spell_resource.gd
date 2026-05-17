class_name SpellResource
extends CardResource

# Instant or sorcery. UI enters target-picking mode when requires_target is true.
@export var requires_target: bool = false

# Filter values: "any" | "creature" | "player" | "opp_creature" | "your_creature" | "spell".
@export var target_filter: String = "any"
