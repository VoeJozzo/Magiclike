@tool
extends Card

# Magiclike Card subclass — adds text overlays (name, mana cost, type line,
# P/T) on top of the placeholder front face, AND disables card-framework's
# drag/hover quirks that fight with our click-to-execute flow.
#
# Why the drag/hover overrides exist:
#   - Drag conflicts with click actions: card-framework transitions cards to
#     HOLDING on press, registers them in _holding_cards, and on release
#     tries to "drop" them based on cursor position. Meanwhile our engine
#     action has already programmatically moved the card. The release-drop
#     can bounce a freshly-played land back to hand if the user releases
#     over the hand zone.
#   - Hover scale compounds: card-framework's _start_hover_animation captures
#     `original_scale = scale` AFTER each hover completes, so original_scale
#     creeps up by hover_scale (default 1.05) per hover. Cards balloon
#     visibly over a play session.
#   - Hover rotation flickers tapped cards: hover always tweens rotation to
#     deg_to_rad(0), so tapped cards (90°) briefly look untapped on hover.
#
# We don't actually USE drag for anything in this game — every move is via
# an engine action. So disabling drag entirely is the simplest correct fix.
# We keep the hover lift for visual feedback, just without the buggy scale
# and rotation animations.
#
# Text is populated AFTER instantiation by game_board calling apply_card_text(),
# because card-framework's JsonCardFactory sets card_info AFTER the Card's
# _ready runs. The labels are built in _ready (empty); apply_card_text() fills
# them in once card_info is available.

const _PADDING := 6
const _NAME_HEIGHT := 22
const _TYPE_HEIGHT := 18

var _name_label: Label
var _cost_label: Label
var _type_label: Label
var _pt_label: Label
var _color_tint: ColorRect


func _ready() -> void:
	super._ready()
	custom_minimum_size = card_size
	size = card_size
	if Engine.is_editor_hint():
		return
	_build_text_overlay()


# Builds the label nodes inside FrontFace. Called once at _ready; text stays
# blank until apply_card_text() populates it.
func _build_text_overlay() -> void:
	var front_face: Node = get_node_or_null("FrontFace")
	if front_face == null:
		return

	# Color tint — sits between the front art and the labels. Lets us shade
	# the card by color identity (red for R, blue for U, etc.) so even at a
	# distance you can tell what color a card is.
	_color_tint = ColorRect.new()
	_color_tint.size = card_size
	_color_tint.color = Color(0, 0, 0, 0)  # transparent until apply_card_text fills it
	_color_tint.mouse_filter = MOUSE_FILTER_IGNORE
	front_face.add_child(_color_tint)

	# Name banner — top of card
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

	# Mana cost — top right corner
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

	# Type line — near the bottom
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

	# P/T badge — bottom-right, only shown for creatures
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
		# P/T only for creatures (initial display from template — call
		# apply_creature_state to refresh with live current_power/toughness
		# and damage marker once the instance is in play).
		if template is CreatureResource:
			_pt_label.text = "%d/%d" % [template.power, template.toughness]
			_pt_label.visible = true
		else:
			_pt_label.visible = false
	else:
		_cost_label.text = ""
		_type_label.text = ""
		_color_tint.color = Color(0, 0, 0, 0)
		_pt_label.visible = false


# Refresh the P/T badge from a live CardInstance — shows current_power/
# current_toughness (base + temp + counters) and a "(-N)" damage marker
# when wounded. Pumped creatures show their boosted stats and the label
# turns green; damaged creatures show the marker and the label turns red.
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
		_pt_label.add_theme_color_override("font_color", Color(1.0, 0.5, 0.5))  # red-ish for damaged
	elif pumped:
		_pt_label.text = "%d/%d*" % [p, t]
		_pt_label.add_theme_color_override("font_color", Color(0.6, 1.0, 0.6))  # green-ish for pumped
	else:
		_pt_label.text = "%d/%d" % [p, t]
		_pt_label.add_theme_color_override("font_color", Color(1, 0.92, 0.6))  # default gold
	_pt_label.visible = true


# Mana cost as compact symbols, e.g. {"R":1} -> "R", {"W":1, "C":2} -> "2W".
# Generic mana goes first (matching MTG card-text convention).
func _fmt_cost(cost: Dictionary) -> String:
	if cost.is_empty():
		return ""
	var s := ""
	if cost.get("C", 0) > 0:
		s += str(cost["C"])  # generic shown as a number
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


# Color-identity tint (semi-transparent overlay over the placeholder art).
# Multi-color cards aren't a Phase 1 concern; we just look at the dominant
# color of the cost (or, for lands with empty cost, the produced color).
func _tint_for(t: CardResource) -> Color:
	var primary: String = _primary_color(t)
	match primary:
		"W": return Color(0.92, 0.88, 0.75, 0.18)  # cream
		"U": return Color(0.30, 0.55, 0.85, 0.22)  # blue
		"B": return Color(0.20, 0.18, 0.20, 0.30)  # near-black
		"R": return Color(0.85, 0.30, 0.20, 0.22)  # red
		"G": return Color(0.30, 0.65, 0.35, 0.22)  # green
		_:   return Color(0.5, 0.5, 0.5, 0.10)     # colorless / artifact


func _primary_color(t: CardResource) -> String:
	# Spell: read first colored cost
	for color in ["W", "U", "B", "R", "G"]:
		if t.mana_cost.get(color, 0) > 0:
			return color
	# Land: read first produced color (LandResource only)
	if t is LandResource and not t.mana_produced.is_empty():
		return t.mana_produced[0]
	return ""


# ─── Drag / hover overrides ────────────────────────────────────────────────

# Skip the HOLDING state transition entirely. We don't use drag-to-move; all
# card movement goes through engine actions. By not entering HOLDING:
#   - card_container.hold_card() never registers this card in _holding_cards
#   - On mouse release, release_holding_cards iterates an empty list (no drop)
#   - card-framework's _process drag-follow behavior never engages
# Click handlers still receive events via card_container.on_card_pressed and
# our gui_input listener in game_board.
func _handle_mouse_pressed() -> void:
	is_pressed = true
	if card_container:
		card_container.on_card_pressed(self)
	# Deliberately NOT calling super._handle_mouse_pressed — that would
	# transition us to HOLDING and engage the drag-drop machinery.


# Override hover animation to skip the compounding scale and rotation-reset
# bugs. We keep the position lift (cards rise on hover) for visual feedback,
# but don't touch scale or rotation — those are managed by us (rotation via
# BattlefieldZone tap state, scale stays at 1.0 always).
func _start_hover_animation() -> void:
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null

	original_position = position
	# Intentionally NOT updating original_scale or original_hover_rotation —
	# those would compound on each hover. We let scale/rotation stay where
	# they are; only position lifts.
	current_hover_position = position

	hover_tween = create_tween()
	hover_tween.set_parallel(true)
	var target_position := Vector2(position.x, position.y - hover_distance)
	hover_tween.tween_property(self, "position", target_position, hover_duration)
	hover_tween.tween_method(_update_hover_position, position, target_position, hover_duration)
	# Skip the scale and rotation tweens that card-framework's default does.


func _stop_hover_animation() -> void:
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null

	hover_tween = create_tween()
	hover_tween.set_parallel(true)
	hover_tween.tween_property(self, "position", original_position, hover_duration)
	hover_tween.tween_method(_update_hover_position, position, original_position, hover_duration)
	# Skip scale and rotation reset — we control those externally.
