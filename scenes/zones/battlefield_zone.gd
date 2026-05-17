class_name BattlefieldZone
extends CardContainer

# Two-row layout: creatures (full-width, legible P/T+art) and lands (tight cascade).
# `creatures_on_top` flipped on opp's zone so both players' creatures cluster at screen center.

signal card_pressed(card: Card)

@export var creatures_on_top: bool = true

const _CREATURE_SPACING: float = 165.0
const _LAND_SPACING: float = 40.0
const _ROW_GAP: float = 230.0

# card-framework quirk: JsonCardFactory.create_card() calls this BEFORE populating card_info,
# so spawn-time card_info is empty. Trust the caller (game_board spawns into the right zone);
# only enforce the type filter on drag-drop from another zone.
func _card_can_be_added(cards: Array) -> bool:
	for card in cards:
		if card.card_info.is_empty():
			continue
		var card_id: String = card.card_info.get("card_id", "")
		if card_id == "":
			return false
		var template: CardResource = CardDatabase.get_card(card_id)
		if template == null or not template.is_permanent():
			return false
	return true


func on_card_pressed(card: Card) -> void:
	card_pressed.emit(card)


# Tap rotation passed via move() — Card's hover anim tweens rotation to 0, so setting
# rotation_degrees=90 directly won't stick.
func _update_target_positions() -> void:
	var creatures: Array = []
	var lands: Array = []
	for card in _held_cards:
		if _card_is_land(card):
			lands.append(card)
		else:
			creatures.append(card)
	var creature_y: float = 0.0 if creatures_on_top else _ROW_GAP
	var land_y: float = _ROW_GAP if creatures_on_top else 0.0
	_layout_row(creatures, Vector2(0.0, creature_y), _CREATURE_SPACING)
	_layout_row(lands, Vector2(0.0, land_y), _LAND_SPACING)


func _layout_row(cards: Array, offset_from_zone: Vector2, spacing: float) -> void:
	for i in range(cards.size()):
		var card: Card = cards[i]
		var target_pos: Vector2 = position + offset_from_zone + Vector2(i * spacing, 0.0)
		card.move(target_pos, _tap_rotation(card))
		card.can_be_interacted_with = true


# Tolerant of mid-spawn empty card_info (re-laid once it's populated).
func _card_is_land(card: Card) -> bool:
	var card_id: String = card.card_info.get("card_id", "")
	if card_id == "":
		return false
	var template: CardResource = CardDatabase.get_card(card_id)
	return template != null and template.is_land()


# Returns radians: 90° tapped, 0 untapped.
func _tap_rotation(card: Card) -> float:
	var iid: int = card.card_info.get("instance_id", -1)
	if iid == -1:
		return 0.0
	var s = RulesEngine.state()
	if s == null:
		return 0.0
	var found = s.find_instance(iid)
	if found != null and found.card != null and found.card.tapped:
		return deg_to_rad(90.0)
	return 0.0
