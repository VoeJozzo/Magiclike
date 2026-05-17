class_name BattlefieldZone
extends CardContainer

# Battlefield zone — a CardContainer subclass that lays cards out in two
# rows: creatures (spaced full-width so P/T and art are legible) and lands
# (cascaded tight, only the title bar matters for ID at a glance).
#
# `creatures_on_top` (default true) puts creatures at Y=0 within the zone
# and lands at the lower row. game_board sets it false for opp's zone so
# opp's creatures sit at the BOTTOM of opp's area (closer to combat center)
# and lands push to the TOP. This keeps creatures from both sides in the
# middle of the screen where combat happens.
#
# Validation: _card_can_be_added consults CardDatabase to check whether each
# card is a permanent (land or creature).
#
# Click handling: when a card is pressed, we forward up via the card_pressed
# signal so game_board.gd can decide what to do.

signal card_pressed(card: Card)

# Phase 5c UI polish: which side of the zone holds creatures. Opp's zone
# flips this so creatures of both players cluster in the screen center.
@export var creatures_on_top: bool = true

# Layout constants. Card_size on the base Card class is ~150x210 (varies a
# bit by overrides); creature spacing equals roughly that width plus padding
# so creatures don't overlap. Land cascade is much tighter — only the title
# bar matters at a glance.
const _CREATURE_SPACING: float = 165.0
const _LAND_SPACING: float = 40.0
const _ROW_GAP: float = 230.0  # vertical gap between creature and land rows

# Phase 2: lands and creatures (and any other permanent — artifacts /
# enchantments later). Instants and sorceries should never end up here.
#
# IMPORTANT — card-framework quirk: JsonCardFactory.create_card() calls this
# BEFORE populating card.card_info, so during initial spawn the card_info dict
# is empty. We treat empty card_info as "spawn-time, trust the caller" and
# only enforce the type filter when card_info is populated (drag-drop path
# from another zone). This is fine because spawn locations are owned by our
# own code (game_board._spawn_initial_visuals chooses the right zone per
# template type), so spawn-time validation isn't load-bearing.
func _card_can_be_added(cards: Array) -> bool:
	for card in cards:
		# Empty card_info = spawn-time call — let it through.
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


# Layout: two rows. Creatures get full-width spacing (legible art + P/T);
# lands cascade tight (only the title-bar info matters for ID). Reads tap
# state from the engine to pass the correct rotation to card.move() — needed
# because Card's hover animation tweens rotation to 0 on hover, so we can't
# just set rotation_degrees=90 and have it stick.
func _update_target_positions() -> void:
	var creatures: Array = []
	var lands: Array = []
	for card in _held_cards:
		if _card_is_land(card):
			lands.append(card)
		else:
			creatures.append(card)  # creatures + any other permanent we add later
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


# True if the card's template is a land. Tolerant: cards mid-spawn may have
# empty card_info; treat those as not-land (they'll be re-laid on the next
# _update_target_positions call once card_info is populated).
func _card_is_land(card: Card) -> bool:
	var card_id: String = card.card_info.get("card_id", "")
	if card_id == "":
		return false
	var template: CardResource = CardDatabase.get_card(card_id)
	return template != null and template.is_land()


# Tap state → 90° rotation (or 0 for untapped). Returns radians.
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
