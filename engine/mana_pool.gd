class_name ManaPool
extends RefCounted

# Per-player mana pool. Keys: W/U/B/R/G (colored), C (generic).
# pay() satisfies colored exactly, then generic greedily (C first, then WUBRG).

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


# Generic (C) satisfied by any color.
func can_pay(cost: Dictionary) -> bool:
	var available: Dictionary = pool.duplicate()
	for color in cost:
		if color == "C":
			continue
		if available.get(color, 0) < cost[color]:
			return false
		available[color] -= cost[color]
	var generic_needed: int = cost.get("C", 0)
	var total_remaining: int = 0
	for color in available:
		total_remaining += available[color]
	return total_remaining >= generic_needed


# Atomic: returns false and leaves pool unchanged if it can't pay.
func pay(cost: Dictionary) -> bool:
	if not can_pay(cost):
		return false
	for color in cost:
		if color == "C":
			continue
		pool[color] -= cost[color]
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


# Inner Dictionary duplicated explicitly — default RefCounted.duplicate() shares it by ref.
func duplicate_deep() -> ManaPool:
	var copy := ManaPool.new()
	copy.pool = pool.duplicate()
	return copy


# MTG notation: generic as leading number, colored as repeated letters.
# {R:1}→"R", {R:2}→"RR", {R:1,C:2}→"2R". "1R" is ALWAYS 1 generic + 1 red, never one red.
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
