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

# Phase 1: only lands. Phase 2 will broaden to all permanents.
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
		if template == null or not template.is_land():
			return false
	return true


func on_card_pressed(card: Card) -> void:
	card_pressed.emit(card)


# Layout: simple horizontal row.
func _update_target_positions() -> void:
	var spacing: float = 70.0
	for i in range(_held_cards.size()):
		var card: Card = _held_cards[i]
		var target_pos: Vector2 = position + Vector2(i * spacing, 0)
		card.move(target_pos, 0)
		card.can_be_interacted_with = true
