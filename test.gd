@tool
extends CardManager

@onready var hand = $Hand
@onready var pile = $Pile

func _ready() -> void:
	super._ready()
	# Build the deck — 10 placeholder cards in the Pile
	for i in range(10):
		card_factory.create_card("placeholder", pile)
	
	# Draw opening hand of 7
	for i in range(7):
		draw_card()

func draw_card() -> void:
	var top_cards = pile.get_top_cards(1)
	if top_cards.is_empty():
		return
	hand.move_cards(top_cards)
