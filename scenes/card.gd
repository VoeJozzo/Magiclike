@tool
extends Card

# Magiclike Card subclass: text overlays + addon hover/drag tweaks.
# - Drag disabled (engine drives moves; release-drop would bounce lands back).
# - Hover scale at 1.25x with compounding bug fixed via Vector2.ONE baseline.
# - Hover rotation opt-in via hover_animates_rotation (default false) — see
#   below; we use rotation for tap state, addon's tween-to-0° would flicker it.
# - Right-click → focus mode (3x scale, viewport center) for card inspection.
# See docs/BACKLOG.md for the upstream-to-card-framework PR these all enable.

const _PADDING := 6
const _NAME_HEIGHT := 22
const _TYPE_HEIGHT := 18
# Focus mode: card pops to 3x scale + high z when right-clicked. Lets the
# player read oracle text / P/T at full size without sacrificing the cramped
# board layout's small default. Click any card / press Esc to dismiss.
const _FOCUS_SCALE: float = 3.0
const _FOCUS_Z: int = 200

# Opt-in rotation animation on hover. Off by default because rotation is
# semantic state (tap) on battlefield cards. Flip to true on cards that
# live in a fanned hand layout so the addon's straighten-on-hover applies.
@export var hover_animates_rotation: bool = false

# Focus state. Toggled via enter_focus / exit_focus, called from game_board's
# right-click handler. _focus_orig_* hold the pre-focus values to restore.
var is_focused: bool = false
var _focus_orig_z: int = 0
var _focus_orig_position: Vector2

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
	# Override the addon's default hover_scale (1.1) — 1.25 makes hover-zoom
	# actually useful for reading P/T and oracle text at a glance.
	hover_scale = 1.25
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


# Right-click inspection mode. Scales 3x, lifts above neighbors, recenters
# globally so the giant card lands in the middle of the viewport regardless
# of which zone the source was in. Doesn't touch mouse_filter — the addon's
# state machine still sees mouse events; the _enter_state/_exit_state guards
# (is_focused checks) prevent it from clobbering our visuals.
func enter_focus() -> void:
	if is_focused:
		return
	is_focused = true
	_focus_orig_z = z_index
	# When the card is hovering, `position` is the lifted value (tweened up by
	# hover_distance), not the rest position. The addon's `original_position`
	# holds the pre-hover-lift base — captured in _start_hover_animation. Use
	# THAT when restoring on exit, otherwise each focus+dismiss cycle would
	# leave the card one hover_distance higher than before, accumulating with
	# every right-click. (Joe's "card crept up" report.)
	if current_state == DraggableState.HOVERING:
		_focus_orig_position = original_position
	else:
		_focus_orig_position = position
	pivot_offset = card_size / 2.0  # scale from center, not corner
	# Kill any in-flight tweens so they don't fight focus visuals. A hover
	# tween mid-flight would continue interpolating scale; a move tween
	# would continue interpolating global_position back to layout slot.
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null
	if move_tween and move_tween.is_valid():
		move_tween.kill()
		move_tween = null
	scale = Vector2.ONE * _FOCUS_SCALE
	z_index = _FOCUS_Z
	# Center in viewport via global_position so we don't fight with whatever
	# parent CardContainer's offset is. card_size is the base size; the
	# rendered footprint is card_size * _FOCUS_SCALE, so subtract half of
	# the SCALED size to center the visible card on the viewport center.
	var viewport_center := Vector2(960, 540)
	global_position = viewport_center - (card_size * _FOCUS_SCALE * 0.5)


# Short-circuit the addon's move() while focused. Layout passes (which fire
# on every state_changed signal) call card.move(target_slot) on every card
# in the zone, including the focused one — without this guard, the focused
# card would slide from viewport center toward its battlefield slot, then
# every subsequent pass-priority would re-fire the tween, producing the
# "card creeps up the screen" symptom Joe reported.
func move(target_destination: Vector2, degree: float) -> void:
	if is_focused:
		return
	super.move(target_destination, degree)


func exit_focus() -> void:
	if not is_focused:
		return
	is_focused = false
	scale = Vector2.ONE
	z_index = _focus_orig_z
	position = _focus_orig_position
	# State machine could have drifted while focused (mouse_entered / exited
	# fired during focus, our guards prevented visual side effects but
	# change_state still updated current_state internally). Snap to IDLE
	# explicitly so the next mouse_entered cleanly fires HOVERING.
	is_mouse_inside = false
	if current_state != DraggableState.IDLE:
		change_state(DraggableState.IDLE)
	# Godot doesn't auto-refire mouse_entered when a control moves under a
	# stationary cursor. After we restore position, hit-test the cursor; if
	# it's over us right now, explicitly transition to HOVERING so hover
	# resumes without requiring the user to mouse-off-and-back-on.
	var mouse_global: Vector2 = get_global_mouse_position()
	if get_global_rect().has_point(mouse_global):
		is_mouse_inside = true
		change_state(DraggableState.HOVERING)


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


# Position + scale hover, with rotation gated by `hover_animates_rotation`.
# Compounding fix: snap to Vector2.ONE before starting a new tween, so a
# rapid in-out sequence can't capture a mid-flight scale as the baseline.
# Pivot is set to card center so the scale grows from the middle, not the
# top-left. Skipped entirely when the card is focused — focus owns the
# visual transform.
func _start_hover_animation() -> void:
	if is_focused:
		return
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null
		scale = Vector2.ONE  # discard any in-flight scale value

	original_position = position
	original_hover_rotation = rotation  # only used when hover_animates_rotation
	current_hover_position = position
	pivot_offset = card_size / 2.0  # scale from center, not corner

	hover_tween = create_tween()
	hover_tween.set_parallel(true)
	var target_position := Vector2(position.x, position.y - hover_distance)
	hover_tween.tween_property(self, "position", target_position, hover_duration)
	hover_tween.tween_property(self, "scale", Vector2.ONE * hover_scale, hover_duration)
	if hover_animates_rotation:
		hover_tween.tween_property(self, "rotation", deg_to_rad(hover_rotation), hover_duration)
	hover_tween.tween_method(_update_hover_position, position, target_position, hover_duration)


func _stop_hover_animation() -> void:
	if is_focused:
		return
	if hover_tween and hover_tween.is_valid():
		hover_tween.kill()
		hover_tween = null

	hover_tween = create_tween()
	hover_tween.set_parallel(true)
	hover_tween.tween_property(self, "position", original_position, hover_duration)
	hover_tween.tween_property(self, "scale", Vector2.ONE, hover_duration)
	if hover_animates_rotation:
		hover_tween.tween_property(self, "rotation", original_hover_rotation, hover_duration)
	hover_tween.tween_method(_update_hover_position, position, original_position, hover_duration)


# State transitions during focus: ALWAYS let super run (it does important
# bookkeeping like Card.hovering_card_count which is a global guard on
# whether ANY card can start hovering). Then re-apply focus visuals
# afterward to undo whatever super's transition did to z_index / scale.
#
# Without letting super run during focus, hovering_card_count gets stuck
# at 1 (incremented on HOVERING entry pre-focus, never decremented because
# we'd skip the HOVERING → IDLE exit). After focus dismisses, every future
# mouse_entered fails the `_can_start_hovering()` check (which is
# `hovering_card_count == 0 and holding_card_count == 0`), permanently
# disabling hover scale.
#
# Addon bug workaround (MOVING entry, separate issue): when a card is
# mid-hover and the engine calls move() on it, MOVING entry kills
# hover_tween without resetting scale. Snap to Vector2.ONE.
func _enter_state(state, from_state) -> void:
	var was_focused: bool = is_focused
	super._enter_state(state, from_state)
	if was_focused:
		# super may have reset z_index (HOVERING entry adds DRAG_Z_OFFSET to
		# stored_z_index; IDLE entry sets z_index to stored_z_index). Force
		# focus visuals back on. _start_hover_animation also gets called
		# from HOVERING entry, but its own is_focused guard early-returns.
		scale = Vector2.ONE * _FOCUS_SCALE
		z_index = _FOCUS_Z
	elif state == DraggableState.MOVING:
		scale = Vector2.ONE


func _exit_state(state) -> void:
	var was_focused: bool = is_focused
	super._exit_state(state)
	if was_focused:
		# Same dance as _enter_state — super resets z_index and may start
		# a stop-hover tween (skipped by _stop_hover_animation's guard);
		# re-apply focus visuals.
		scale = Vector2.ONE * _FOCUS_SCALE
		z_index = _FOCUS_Z
