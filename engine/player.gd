class_name Player
extends RefCounted

# A player. Two of these live on the EngineState — `you` and `opp`.
# Mirrors the JS prototype's per-player record (G.you, G.opp).

var name: String = ""
var key: String = ""  # "you" or "opp" — used for target resolution

var life: int = 20
var mana: ManaPool = null

# Zone arrays (CardInstance refs).
var library: Array[CardInstance] = []
var hand: Array[CardInstance] = []
var battlefield: Array[CardInstance] = []
var graveyard: Array[CardInstance] = []
var exile: Array[CardInstance] = []

# Per-turn flags. Reset at each player's untap step (or end-of-turn cleanup).
var land_played_this_turn: bool = false
# For triggers like Bloodlust Berserker — increments whenever this player
# loses life (not via natural decay).
var life_lost_this_turn: int = 0


func _init(p_name: String = "", p_key: String = "") -> void:
	name = p_name
	key = p_key
	mana = ManaPool.new()


# Find a card on the battlefield by instance_id. null if not found.
func find_battlefield(iid: int) -> Variant:
	for c in battlefield:
		if c.instance_id == iid:
			return c
	return null


# Find a card in hand by instance_id. null if not found.
func find_hand(iid: int) -> Variant:
	for c in hand:
		if c.instance_id == iid:
			return c
	return null


# Move a card from one of this player's zones to another. Returns true on success.
func move_card(card: CardInstance, from_zone: Array, to_zone: Array) -> bool:
	var idx: int = from_zone.find(card)
	if idx == -1:
		return false
	from_zone.remove_at(idx)
	to_zone.append(card)
	return true


# Untap all permanents and reset per-turn flags. Called by Engine at this
# player's untap step.
func untap_step() -> void:
	for c in battlefield:
		c.tapped = false
		c.summoning_sick = false  # cards become "battle-ready" on controller's untap
	land_played_this_turn = false
	life_lost_this_turn = 0
