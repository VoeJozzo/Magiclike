@tool
extends Card

# Magiclike Card subclass: text overlays + selective card-framework drag/hover overrides.
# - Drag disabled — engine drives all moves; release-drop would bounce played lands back.
# - Hover scale: kept (1.1x by default). Compounding bug from the addon (which
#   captured `original_scale = scale` at each hover-start, so rapid mouse in/out
#   captured a mid-tween value and ballooned the card) is fixed by snapping
#   scale to Vector2.ONE before starting a new hover.
# - Hover rotation disabled — addon tweens rotation to 0° on hover, which
#   flickers our tap-rotated (90°) battlefield cards back to upright.
# Text populated by apply_card_text() after card_info lands (post-_ready).

const _PADDING := 6
const _NAME_HEIGHT := 22
const _TYPE_HEIGHT := 18

var _name_label: Label
var _cost_label: Label
var _type_label: Label
var _pt_label: Label
var _oracle_label: Label
var _oracle_bg: ColorRect  # opaque backer so placeholder art's "description" doesn't bleed through
var _color_tint: ColorRect
# Yellow=pending, green=committed, dim-red=unblocked attacker.
var _combat_highlight: ColorRect
# Hollow border = "legal to act on". Drawn via _draw so art+labels stay visible.
var _legality_glow: _CardBorderGlow


# Hollow-rect outline Control. Update glow_color to retint; alpha=0 to hide.
class _CardBorderGlow extends Control:
	var glow_color: Color = Color(0, 0, 0, 0):
		set(value):
			glow_color = value
			queue_redraw()
	var glow_width: float = 4.0
	func _ready() -> void:
		mouse_filter = MOUSE_FILTER_IGNORE
	func _draw() -> void:
		if glow_color.a <= 0.0:
			return
		# Four filled rects (outline mode subpixels at small widths).
		var w: float = glow_width
		var s: Vector2 = size
		draw_rect(Rect2(0, 0, s.x, w), glow_color)
		draw_rect(Rect2(0, s.y - w, s.x, w), glow_color)
		draw_rect(Rect2(0, 0, w, s.y), glow_color)
		draw_rect(Rect2(s.x - w, 0, w, s.y), glow_color)


func _ready() -> void:
	super._ready()
	custom_minimum_size = card_size
	size = card_size
	if Engine.is_editor_hint():
		return
	_build_text_overlay()


# Build label nodes; apply_card_text() populates them post-card_info.
func _build_text_overlay() -> void:
	var front_face: Node = get_node_or_null("FrontFace")
	if front_face == null:
		return

	# Color tint — shade by color identity (R/U/etc).
	_color_tint = ColorRect.new()
	_color_tint.size = card_size
	_color_tint.color = Color(0, 0, 0, 0)
	_color_tint.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_color_tint)

	# Combat highlight — above tint, below labels.
	_combat_highlight = ColorRect.new()
	_combat_highlight.size = card_size
	_combat_highlight.color = Color(0, 0, 0, 0)
	_combat_highlight.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_combat_highlight)

	# Legality glow on top of all overlays.
	_legality_glow = _CardBorderGlow.new()
	_legality_glow.size = card_size
	front_face.add_child(_legality_glow)

	_name_label = Label.new()
	_name_label.position = Vector2(_PADDING, _PADDING)
	_name_label.size = Vector2(card_size.x - _PADDING * 2, _NAME_HEIGHT)
	_name_label.add_theme_font_size_override("font_size", 12)
	_name_label.add_theme_color_override("font_color", Color(0.98, 0.95, 0.82))
	_name_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_name_label.add_theme_constant_override("shadow_outline_size", 3)
	_name_label.clip_text = true
	_name_label.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_name_label)

	_cost_label = Label.new()
	_cost_label.position = Vector2(card_size.x - 50, _PADDING)
	_cost_label.size = Vector2(44, _NAME_HEIGHT)
	_cost_label.add_theme_font_size_override("font_size", 14)
	_cost_label.add_theme_color_override("font_color", Color(1, 0.85, 0.4))
	_cost_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_cost_label.add_theme_constant_override("shadow_outline_size", 3)
	_cost_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_cost_label.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_cost_label)

	_type_label = Label.new()
	_type_label.position = Vector2(_PADDING, card_size.y - _TYPE_HEIGHT - _PADDING)
	_type_label.size = Vector2(card_size.x - _PADDING * 2, _TYPE_HEIGHT)
	_type_label.add_theme_font_size_override("font_size", 10)
	_type_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95))
	_type_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_type_label.add_theme_constant_override("shadow_outline_size", 3)
	_type_label.clip_text = true
	_type_label.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_type_label)

	# Oracle text overlay — backer hides placeholder description, label wraps oracle text.
	var oracle_top: float = 40.0
	var oracle_bottom: float = card_size.y - _TYPE_HEIGHT - _PADDING - 4.0
	var oracle_height: float = oracle_bottom - oracle_top
	_oracle_bg = ColorRect.new()
	_oracle_bg.position = Vector2(_PADDING, oracle_top)
	_oracle_bg.size = Vector2(card_size.x - _PADDING * 2, oracle_height)
	_oracle_bg.color = Color(0.05, 0.05, 0.08, 0.85)
	_oracle_bg.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_oracle_bg)
	_oracle_label = Label.new()
	_oracle_label.position = Vector2(_PADDING + 4, oracle_top + 4)
	_oracle_label.size = Vector2(card_size.x - _PADDING * 2 - 8, oracle_height - 8)
	_oracle_label.add_theme_font_size_override("font_size", 10)
	_oracle_label.add_theme_color_override("font_color", Color(0.92, 0.92, 0.96))
	_oracle_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_oracle_label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	_oracle_label.clip_text = true
	_oracle_label.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_oracle_label)

	# P/T badge — bottom-right; creatures only.
	_pt_label = Label.new()
	_pt_label.position = Vector2(card_size.x - 48, card_size.y - 36)
	_pt_label.size = Vector2(40, 28)
	_pt_label.add_theme_font_size_override("font_size", 18)
	_pt_label.add_theme_color_override("font_color", Color(1, 0.92, 0.6))
	_pt_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
	_pt_label.add_theme_constant_override("shadow_outline_size", 4)
	_pt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_pt_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_pt_label.mouse_filter = MOUSE_FILTER_IGNORE
	_pt_label.visible = false
	front_face.add_child(_pt_label)


# Populates the labels and tint from card_info. Call this AFTER setting
# card_info on the visual (game_board does so right after spawn + duplicate).
func apply_card_text() -> void:
	if _name_label == null:
		return  # _ready hasn't built the overlay yet

	# Display name — fall back to "name" then card_id then "?"
	_name_label.text = str(card_info.get("display_name",
		card_info.get("name", card_info.get("card_id", "?"))))

	# Cost + type come from the engine's CardResource (card_info is just visuals).
	var card_id: String = str(card_info.get("card_id", ""))
	var template: CardResource = null
	if card_id != "":
		template = CardDatabase.get_card(card_id)

	if template != null:
		_cost_label.text = _fmt_cost(template.mana_cost)
		_type_label.text = _fmt_type_line(template)
		_color_tint.color = _tint_for(template)
		# Empty oracle hides the backer so placeholder art shows through.
		var oracle: String = str(template.oracle_text)
		_oracle_label.text = oracle
		_oracle_bg.visible = oracle != ""
		# Template P/T; apply_creature_state refreshes with live values + damage.
		if template is CreatureResource:
			_pt_label.text = "%d/%d" % [template.power, template.toughness]
			_pt_label.visible = true
		else:
			_pt_label.visible = false
	else:
		_cost_label.text = ""
		_type_label.text = ""
		_color_tint.color = Color(0, 0, 0, 0)
		_oracle_label.text = ""
		_oracle_bg.visible = false
		_pt_label.visible = false


# Live P/T from inst (base+temp+counters), "(-N)" damage marker, color: red=damaged, green=pumped, gold=default.
func apply_creature_state(inst: CardInstance) -> void:
	if _pt_label == null:
		return
	if inst == null or inst.template == null or not (inst.template is CreatureResource):
		_pt_label.visible = false
		return
	var p: int = inst.current_power()
	var t: int = inst.current_toughness()
	var dmg: int = inst.damage_marked
	var pumped: bool = inst.temp_power > 0 or inst.temp_toughness > 0
	if dmg > 0:
		_pt_label.text = "%d/%d (-%d)" % [p, t, dmg]
		_pt_label.add_theme_color_override("font_color", Color(1.0, 0.5, 0.5))
	elif pumped:
		_pt_label.text = "%d/%d*" % [p, t]
		_pt_label.add_theme_color_override("font_color", Color(0.6, 1.0, 0.6))
	else:
		_pt_label.text = "%d/%d" % [p, t]
		_pt_label.add_theme_color_override("font_color", Color(1, 0.92, 0.6))
	_pt_label.visible = true


# {"R":1} → "R"; {"W":1, "C":2} → "2W". Generic first per MTG convention.
func _fmt_cost(cost: Dictionary) -> String:
	if cost.is_empty():
		return ""
	var s := ""
	if cost.get("C", 0) > 0:
		s += str(cost["C"])
	for color in ["W", "U", "B", "R", "G"]:
		var n: int = cost.get(color, 0)
		for i in range(n):
			s += color
	return s


# "Land — Mountain", "Instant", "Creature — Goblin"
func _fmt_type_line(t: CardResource) -> String:
	if t.card_types.is_empty():
		return ""
	var head: String = t.card_types[0].capitalize()
	if t.subtypes.is_empty():
		return head
	var tail: Array[String] = []
	for s in t.subtypes:
		tail.append(s.capitalize())
	return "%s — %s" % [head, " ".join(tail)]


# Color-identity tint over placeholder art.
func _tint_for(t: CardResource) -> Color:
	var primary: String = _primary_color(t)
	match primary:
		"W": return Color(0.92, 0.88, 0.75, 0.18)
		"U": return Color(0.30, 0.55, 0.85, 0.22)
		"B": return Color(0.20, 0.18, 0.20, 0.30)
		"R": return Color(0.85, 0.30, 0.20, 0.22)
		"G": return Color(0.30, 0.65, 0.35, 0.22)
		_:   return Color(0.5, 0.5, 0.5, 0.10)


func _primary_color(t: CardResource) -> String:
	for color in ["W", "U", "B", "R", "G"]:
		if t.mana_cost.get(color, 0) > 0:
			return color
	if t is LandResource and not t.mana_produced.is_empty():
		return t.mana_produced[0]
	return ""


# State: "pending" (yellow), "committed" (green), "unblocked" (dim red), else clear.
func set_combat_highlight(state: String) -> void:
	if _combat_highlight == null:
		return
	match state:
		"pending":
			_combat_highlight.color = Color(1.0, 0.95, 0.30, 0.40)
		"committed":
			_combat_highlight.color = Color(0.30, 0.85, 0.45, 0.32)
		"unblocked":
			_combat_highlight.color = Color(0.95, 0.35, 0.30, 0.25)
		_:
			_combat_highlight.color = Color(0, 0, 0, 0)


# State: "playable" (green border), "target" (yellow), else clear.
func set_legality_glow(state: String) -> void:
	if _legality_glow == null:
		return
	match state:
		"playable":
			_legality_glow.glow_color = Color(0.30, 0.95, 0.45, 0.95)
		"target":
			_legality_glow.glow_color = Color(1.0, 0.85, 0.30, 0.95)
		_:
			_legality_glow.glow_color = Color(0, 0, 0, 0)


# Skip HOLDING transition (drag-drop unused). Clicks still flow via on_card_pressed/gui_input.
func _handle_mouse_pressed() -> void:
	is_pressed = true
	if card_container:
		card_container.on_card_pressed(self)


# Position + scale hover (rotation skipped — see header comment).
# Compounding fix: snap to Vector2.ONE before starting a new tween, so a
# rapid in-out sequence can't capture a mid-flight scale as the baseline.
# Pivot is set to card center so the scale grows from the middle, not the
# top-left.
func _start_hover_animation() -> void:
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null
		scale = Vector2.ONE  # discard any in-flight scale value

	original_position = position
	current_hover_position = position
	pivot_offset = card_size / 2.0  # scale from center, not corner

	hover_tween = create_tween()
	hover_tween.set_parallel(true)
	var target_position := Vector2(position.x, position.y - hover_distance)
	hover_tween.tween_property(self, "position", target_position, hover_duration)
	hover_tween.tween_property(self, "scale", Vector2.ONE * hover_scale, hover_duration)
	hover_tween.tween_method(_update_hover_position, position, target_position, hover_duration)


func _stop_hover_animation() -> void:
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null

	hover_tween = create_tween()
	hover_tween.set_parallel(true)
	hover_tween.tween_property(self, "position", original_position, hover_duration)
	hover_tween.tween_property(self, "scale", Vector2.ONE, hover_duration)
	hover_tween.tween_method(_update_hover_position, position, original_position, hover_duration)
