@tool
class_name TresCardFactory
extends JsonCardFactory

# Card-framework factory that reads CardResource .tres templates from
# res://cards/templates/<card_id>.tres instead of the per-card JSON files
# JsonCardFactory wants. Inherits JsonCardFactory's visual scaffolding
# (default_card_scene, back_image, card_size, _create_card_node, _load_image)
# and only swaps out the data-source step.
#
# Wired in scenes/tres_card_factory.tscn; assigned to CardManager via
# scenes/game/game_board.gd's _factory_scene preload.

const _TEMPLATE_DIR := "res://cards/templates/"


# Override the JSON-based loader. card_name is the card_id (same shape callers
# already use). card_asset_dir is the inherited @export — front_image_path on
# the resource is a filename within that dir.
func create_card(card_name: String, target: CardContainer) -> Card:
	# Lazy load only — preload_card_data is a no-op for now (lazy is fast
	# enough for current pool size; revisit if startup becomes laggy).
	if preloaded_cards.has(card_name):
		var cached: Dictionary = preloaded_cards[card_name]
		return _create_card_node(cached["info"]["name"], cached["texture"], target, cached["info"])

	var tpl_path: String = _TEMPLATE_DIR + card_name + ".tres"
	var template: CardResource = load(tpl_path)
	if template == null:
		push_error("TresCardFactory: failed to load %s" % tpl_path)
		return null

	var card_info: Dictionary = _card_info_from_resource(template)
	var image_path: String = card_asset_dir + "/" + template.front_image_path
	var front_image: Texture2D = _load_image(image_path)
	if front_image == null:
		return null

	return _create_card_node(template.card_id, front_image, target, card_info)


# Build the card_info dict the existing visual layer expects. Mirrors what
# JsonCardFactory used to read from JSON: {name, card_id, display_name,
# front_image}. game_board.gd and battlefield_zone.gd consume these fields.
static func _card_info_from_resource(tpl: CardResource) -> Dictionary:
	return {
		"name": tpl.card_id,
		"card_id": tpl.card_id,
		"display_name": tpl.display_name,
		"front_image": tpl.front_image_path,
	}
