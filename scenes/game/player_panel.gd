class_name PlayerPanel
extends Control

# Player panel — shows life total, mana pool, and player name. Acts as a
# clickable target sink during target-picking mode (e.g., clicking the
# opponent's life total to target them with Lightning Bolt).
#
# Construction is fully programmatic — no .tscn required. Owner adds as child:
#   var panel = PlayerPanel.new()
#   panel.player_key = "you"
#   add_child(panel)

signal clicked

@export var player_key: String = ""

var _name_label: Label
var _life_label: Label
var _mana_label: Label
var _highlight: ColorRect

# Set true to indicate this panel is a valid target during targeting mode.
var is_clickable: bool = false:
	set(value):
		is_clickable = value
		if _highlight != null:
			_highlight.visible = value
		mouse_filter = MOUSE_FILTER_STOP if value else MOUSE_FILTER_PASS


func _ready() -> void:
	custom_minimum_size = Vector2(280, 100)
	mouse_filter = MOUSE_FILTER_PASS

	# Background tint
	var bg := ColorRect.new()
	bg.color = Color(0.10, 0.10, 0.16, 0.85)
	bg.size = custom_minimum_size
	bg.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(bg)

	# Targeting-mode highlight (yellow tint, hidden by default)
	_highlight = ColorRect.new()
	_highlight.color = Color(1, 1, 0.2, 0.25)
	_highlight.size = custom_minimum_size
	_highlight.visible = false
	_highlight.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(_highlight)

	# Labels in a vbox
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
	_life_label.add_theme_color_override("font_color", Color(1, 0.85, 0.2))  # gold
	v.add_child(_life_label)

	_mana_label = Label.new()
	_mana_label.add_theme_font_size_override("font_size", 14)
	_mana_label.add_theme_color_override("font_color", Color(0.7, 0.85, 1))
	v.add_child(_mana_label)


func update_from_player(player: Player) -> void:
	if _name_label == null:
		return  # Not yet ready
	_name_label.text = player.name
	_life_label.text = "Life: %d" % player.life
	if player.mana.total() == 0:
		_mana_label.text = "Mana: (none)"
	else:
		_mana_label.text = "Mana: %s" % player.mana.to_string_short()


func _gui_input(event: InputEvent) -> void:
	if not is_clickable:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		clicked.emit()
		accept_event()
