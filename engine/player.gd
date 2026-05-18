class_name Player
extends RefCounted

var name: String = ""
var key: String = ""  # "you" or "opp"

var life: int = 20
var mana: ManaPool = null

var library: Array[CardInstance] = []
var hand: Array[CardInstance] = []
var battlefield: Array[CardInstance] = []
var graveyard: Array[CardInstance] = []
var exile: Array[CardInstance] = []

var land_played_this_turn: bool = false
# Cumulative damage-style life loss (excludes natural decay). Powers Bloodlust-style triggers.
var life_lost_this_turn: int = 0

# Maximum hand size enforced at the cleanup step (MTG 514.3). Default 7; can be
# pumped/cut by future effects (e.g. Reliquary Tower-style "no maximum").
var max_hand_size: int = 7


func _init(p_name: String = "", p_key: String = "") -> void:
	name = p_name
	key = p_key
	mana = ManaPool.new()


func find_battlefield(iid: int) -> Variant:
	for c in battlefield:
		if c.instance_id == iid:
			return c
	return null


func find_hand(iid: int) -> Variant:
	for c in hand:
		if c.instance_id == iid:
			return c
	return null


func move_card(card: CardInstance, from_zone: Array, to_zone: Array) -> bool:
	var idx: int = from_zone.find(card)
	if idx == -1:
		return false
	from_zone.remove_at(idx)
	to_zone.append(card)
	return true


func untap_step() -> void:
	for c in battlefield:
		c.tapped = false
		c.summoning_sick = false
	land_played_this_turn = false
	life_lost_this_turn = 0


# Zone arrays rebuilt from deep-copied CardInstances; nothing shared by ref.
func duplicate_deep() -> Player:
	var copy := Player.new(name, key)
	copy.life = life
	copy.mana = mana.duplicate_deep()
	for c in library:
		copy.library.append(c.duplicate_deep())
	for c in hand:
		copy.hand.append(c.duplicate_deep())
	for c in battlefield:
		copy.battlefield.append(c.duplicate_deep())
	for c in graveyard:
		copy.graveyard.append(c.duplicate_deep())
	for c in exile:
		copy.exile.append(c.duplicate_deep())
	copy.land_played_this_turn = land_played_this_turn
	copy.life_lost_this_turn = life_lost_this_turn
	copy.max_hand_size = max_hand_size
	return copy
