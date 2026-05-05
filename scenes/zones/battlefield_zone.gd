class_name BattlefieldZone
extends CardContainer

# Battlefield zone — a CardContainer subclass that lays out cards in a row
# and (in Phase 1) only accepts lands.
#
# Validation: _card_can_be_added consults CardDatabase to check whether each
# card is a land. This is enforced both at initial spawn (JsonCardFactory
# checks via _card_can_be_added before adding) and at drop-time (drag-from-
# elsewhere attempts).
#
# Click handling: when a card is pressed, we forward up via the card_pressed
# signal so game_board.gd can decide what to do (typically: try to activate
# the land's mana ability).

signal card_pressed(card: Card)

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


# Layout: simple horizontal row. Reads tap state from engine to pass the
# correct rotation to card.move() — needed because Card's hover animation
# tweens rotation to 0 every time the mouse enters, so we can't simply set
# rotation_degrees=90 and have it stick. Going through the proper move()
# pathway keeps rotation correct across hover transitions.
func _update_target_positions() -> void:
	var spacing: float = 70.0
	# Spacing changes when cards are tapped (rotated 90°) — they take more
	# horizontal room. For Phase 1 with at most 2 mountains, fixed spacing is fine.
	for i in range(_held_cards.size()):
		var card: Card = _held_cards[i]
		var target_pos: Vector2 = position + Vector2(i * spacing, 0)
		var rotation_rad: float = 0.0
		# Look up tap state from the rules engine via instance_id.
		var iid: int = card.card_info.get("instance_id", -1)
		if iid != -1:
			var s = RulesEngine.state()
			if s != null:
				var found = s.find_instance(iid)
				if found != null and found.card != null and found.card.tapped:
					rotation_rad = deg_to_rad(90.0)
		card.move(target_pos, rotation_rad)
		card.can_be_interacted_with = true
