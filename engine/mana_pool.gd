class_name ManaPool
extends RefCounted

# Mana pool — a per-player accumulator emptied at end of each phase in real MTG,
# but Phase 1 keeps it simple and only clears at end of turn (handled by Engine).
#
# Keys: W, U, B, R, G (colored), C (colorless / generic).
# Values: int counts.
#
# Cost-paying convention:
# - Colored requirements ({R: 1}) must be paid in the matching color.
# - Generic requirements ({C: 2}) can be paid from any color.
# - When this pool's pay() is called, it satisfies colored exactly, then generic
#   greedily (prefers C, then alphabetical).

const COLORS := ["W", "U", "B", "R", "G", "C"]

var pool: Dictionary = {"W": 0, "U": 0, "B": 0, "R": 0, "G": 0, "C": 0}


func add(color: String, amount: int = 1) -> void:
	if not pool.has(color):
		push_warning("ManaPool.add: unknown color '%s'" % color)
		return
	pool[color] += amount


func add_dict(amounts: Dictionary) -> void:
	for color in amounts:
		add(color, amounts[color])


func clear() -> void:
	for color in COLORS:
		pool[color] = 0


# True if `cost` can be paid from this pool. Generic (C) is satisfied by any color.
func can_pay(cost: Dictionary) -> bool:
	var available: Dictionary = pool.duplicate()
	# Colored first
	for color in cost:
		if color == "C":
			continue
		if available.get(color, 0) < cost[color]:
			return false
		available[color] -= cost[color]
	# Generic from anything remaining
	var generic_needed: int = cost.get("C", 0)
	var total_remaining: int = 0
	for color in available:
		total_remaining += available[color]
	return total_remaining >= generic_needed


# Pays `cost`. Returns true on success (pool decremented), false if can't pay (pool unchanged).
func pay(cost: Dictionary) -> bool:
	if not can_pay(cost):
		return false
	# Pay colored exactly
	for color in cost:
		if color == "C":
			continue
		pool[color] -= cost[color]
	# Pay generic, preferring C then WUBRG
	var generic_needed: int = cost.get("C", 0)
	var pay_order := ["C", "W", "U", "B", "R", "G"]
	for color in pay_order:
		if generic_needed <= 0:
			break
		var take: int = min(pool[color], generic_needed)
		pool[color] -= take
		generic_needed -= take
	return true


func total() -> int:
	var t := 0
	for color in pool:
		t += pool[color]
	return t


# MTG mana-cost notation: colored mana is shown as repeated letters (RR for
# two reds), colorless/generic is shown as a leading number (1R for 1 generic
# + 1 red). Critically, "1R" never means "one red" — it always means
# 1 generic + 1 red. So we must NOT use "1R" to display a single red mana.
#
# Examples:
#   {R:1}         → "R"
#   {R:2}         → "RR"
#   {R:1, C:2}    → "2R"
#   {W:1, R:1}    → "WR"
#   {R:5}         → "RRRRR" (acceptable until we reach realistically large
#                            mana totals; revisit with icon-based UI later)
func to_string_short() -> String:
	var s := ""
	# Generic / colorless first (matches MTG card-text convention)
	if pool["C"] > 0:
		s += str(pool["C"])
	# Colored repeated by count
	for color in ["W", "U", "B", "R", "G"]:
		for i in range(pool[color]):
			s += color
	if s == "":
		return "(empty)"
	return s
