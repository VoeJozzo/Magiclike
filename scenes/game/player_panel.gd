class_name PlayerPanel
extends Control

# Life/mana/zone counts plus clickable target sink (e.g. for Lightning Bolt's opponent).
# Programmatic — no .tscn needed.

signal clicked

@export var player_key: String = ""

var _name_label: Label
var _life_label: Label
var _mana_label: Label
var _zones_label: Label
var _highlight: ColorRect

var is_clickable: bool = false:
	set(value):
		is_clickable = value
		if _highlight != null:
			_highlight.visible = value
		mouse_filter = MOUSE_FILTER_STOP if value else MOUSE_FILTER_PASS


func _ready() -> void:
	custom_minimum_size = Vector2(280, 120)
	mouse_filter = MOUSE_FILTER_PASS

	var bg := ColorRect.new()
	bg.color = Color(0.10, 0.10, 0.16, 0.85)
	bg.size = custom_minimum_size
	bg.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(bg)

	_highlight = ColorRect.new()
	_highlight.color = Color(1, 1, 0.2, 0.25)
	_highlight.size = custom_minimum_size
	_highlight.visible = false
	_highlight.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(_highlight)

	var v := VBoxContainer.new()
	v.position = Vector2(12, 8)
	v.size = Vector2(custom_minimum_size.x - 24, custom_minimum_size.y - 16)
	add_child(v)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", 14)
	_name_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95))
	v.add_child(_name_label)

	_life_label = Label.new()
	_life_label.add_theme_font_size_override("font_size", 36)
	_life_label.add_theme_color_override("font_color", Color(1, 0.85, 0.2))
	v.add_child(_life_label)

	_mana_label = Label.new()
	_mana_label.add_theme_font_size_override("font_size", 14)
	_mana_label.add_theme_color_override("font_color", Color(0.7, 0.85, 1))
	v.add_child(_mana_label)

	_zones_label = Label.new()
	_zones_label.add_theme_font_size_override("font_size", 12)
	_zones_label.add_theme_color_override("font_color", Color(0.65, 0.65, 0.75))
	v.add_child(_zones_label)


func update_from_player(player: Player) -> void:
	if _name_label == null:
		return
	_name_label.text = player.name
	_life_label.text = "Life: %d" % player.life
	if player.mana.total() == 0:
		_mana_label.text = "Mana: (none)"
	else:
		_mana_label.text = "Mana: %s" % player.mana.to_string_short()
	# Library warning glyph below 5 cards = decking-out alert.
	var lib_size: int = player.library.size()
	var lib_marker: String = "" if lib_size > 5 else "⚠ "
	_zones_label.text = "Hand: %d  •  %sLibrary: %d  •  GY: %d" % [
		player.hand.size(), lib_marker, lib_size, player.graveyard.size(),
	]


func _gui_input(event: InputEvent) -> void:
	if not is_clickable:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		clicked.emit()
		accept_event()
