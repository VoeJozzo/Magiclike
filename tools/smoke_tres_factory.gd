extends Node

# Sanity check that TresCardFactory + cards/templates/*.tres + the
# scenes/card.tscn visual scaffolding still spawn together. Engine tests
# never exercise the factory; this script does.
#
# Iterates every card_id in CardDatabase, instantiates a Card via the factory
# into a throwaway Hand, verifies the Card is non-null and its card_info has
# the expected keys.
#
# Headless: godot --headless --path <repo> res://tools/smoke_tres_factory.tscn

const _FACTORY_SCENE: PackedScene = preload("res://scenes/tres_card_factory.tscn")


func _ready() -> void:
	var failures: int = 0
	var ids: Array[String] = CardDatabase.all_card_ids()
	print("=== Spawning %d cards via TresCardFactory ===" % ids.size())

	# Minimal CardManager + Hand harness — TresCardFactory needs a real
	# CardContainer with a Cards child node to add_card into.
	var mgr := CardManager.new()
	mgr.card_factory_scene = _FACTORY_SCENE
	add_child(mgr)
	var hand := Hand.new()
	hand.max_hand_size = 100  # default is 10 — too small for our 23 cards
	mgr.add_child(hand)
	# Hand needs a "Cards" child Control per card-framework conventions.
	var cards_node := Control.new()
	cards_node.name = "Cards"
	hand.add_child(cards_node)

	var factory: CardFactory = mgr.card_factory
	if factory == null:
		push_error("CardManager.card_factory is null")
		get_tree().quit(1)
		return

	for cid in ids:
		var card: Card = factory.create_card(cid, hand)
		if card == null:
			print("  ✗ %s: factory returned null" % cid)
			failures += 1
			continue
		var info: Dictionary = card.card_info
		var ok := info.has("card_id") and info.has("display_name") and info.has("name")
		if ok and info["card_id"] == cid:
			print("  ✓ %s -> %s" % [cid, info["display_name"]])
		else:
			print("  ✗ %s: card_info malformed = %s" % [cid, info])
			failures += 1

	print("=== %s ===" % ("ALL PASS" if failures == 0 else "%d FAILURES" % failures))
	get_tree().quit(0 if failures == 0 else 1)
