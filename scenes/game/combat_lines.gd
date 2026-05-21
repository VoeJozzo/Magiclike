extends Control

# Lines between gameplay entities. Sits above CardManager so lines render on top.
# Two kinds:
#   - Blocker → Attacker (green): drawn during COMBAT_BLOCK / COMBAT_DAMAGE.
#   - Stack entry → Target (magenta): drawn for any spell or trigger on the
#     stack that has a committed target (Lightning Bolt, Counterspell, etc.).
# Redraws each frame while anything is "live" to track move tweens; idles
# otherwise.

var game_board: Control = null
var visible_redraw_dirty: bool = false


func _process(_delta: float) -> void:
	if game_board == null:
		return
	var s: EngineState = RulesEngine.state()
	if s == null:
		return
	var has_lines: bool = not s.blockers.is_empty() or _stack_has_targets(s)
	if not has_lines:
		# One final redraw to clear stale lines when combat / stack empties, then idle.
		if visible_redraw_dirty:
			queue_redraw()
			visible_redraw_dirty = false
		return
	visible_redraw_dirty = true
	queue_redraw()


static func _stack_has_targets(s: EngineState) -> bool:
	for entry in s.stack.entries:
		var targets: Array = entry.get("targets", [])
		if not targets.is_empty():
			return true
	return false


func _draw() -> void:
	if game_board == null:
		return
	var s: EngineState = RulesEngine.state()
	if s == null:
		return
	_draw_combat_lines(s)
	_draw_stack_target_lines(s)


func _draw_combat_lines(s: EngineState) -> void:
	if s.blockers.is_empty():
		return
	var iid_to_visual: Dictionary = game_board._iid_to_visual
	for blocker_iid in s.blockers:
		var attacker_iid: int = s.blockers[blocker_iid]
		var blocker_visual = iid_to_visual.get(blocker_iid)
		var attacker_visual = iid_to_visual.get(attacker_iid)
		if blocker_visual == null or attacker_visual == null:
			continue
		# Full global transform — get_global_rect() ignores rotation, breaking tapped (90°) anchors.
		var b_center: Vector2 = blocker_visual.get_global_transform() * (blocker_visual.size * 0.5)
		var a_center: Vector2 = attacker_visual.get_global_transform() * (attacker_visual.size * 0.5)
		var b_local: Vector2 = b_center - global_position
		var a_local: Vector2 = a_center - global_position
		var line_color := Color(0.30, 0.95, 0.55, 0.85)
		draw_line(b_local, a_local, line_color, 4.0, true)
		draw_circle(b_local, 7.0, Color(0.30, 0.95, 0.55, 0.95))
		draw_circle(a_local, 7.0, Color(0.95, 0.45, 0.40, 0.95))


func _draw_stack_target_lines(s: EngineState) -> void:
	var iid_to_visual: Dictionary = game_board._iid_to_visual
	var line_color := Color(0.95, 0.45, 0.90, 0.85)         # magenta
	var source_dot := Color(0.95, 0.85, 0.40, 0.95)         # gold (source = caster)
	var target_dot := Color(0.95, 0.45, 0.90, 0.95)         # magenta (target)
	for entry in s.stack.entries:
		var targets: Array = entry.get("targets", [])
		if targets.is_empty():
			continue
		var source_iid: int = entry.get("source_iid", -1)
		var source_visual = iid_to_visual.get(source_iid)
		if source_visual == null:
			continue
		var source_center: Vector2 = source_visual.get_global_transform() * (source_visual.size * 0.5)
		var source_local: Vector2 = source_center - global_position
		for target in targets:
			var target_local: Variant = _resolve_target_pos(target, iid_to_visual)
			if target_local == null:
				continue
			draw_line(source_local, target_local, line_color, 3.0, true)
			draw_circle(source_local, 6.0, source_dot)
			draw_circle(target_local, 6.0, target_dot)


# Returns the target position in this Control's local coords, or null if it
# can't be resolved (e.g. a target creature that left play).
func _resolve_target_pos(target: Dictionary, iid_to_visual: Dictionary):
	match target.get("kind", ""):
		"creature", "stack":
			var iid: int = int(target.get("iid", -1))
			var v = iid_to_visual.get(iid)
			if v == null:
				return null
			var c: Vector2 = v.get_global_transform() * (v.size * 0.5)
			return c - global_position
		"player":
			var who: String = target.get("who", "")
			if who == "":
				return null
			var panel = game_board._you_panel if who == "you" else game_board._opp_panel
			if panel == null:
				return null
			# Center of panel rect.
			var c: Vector2 = panel.global_position + panel.size * 0.5
			return c - global_position
	return null
