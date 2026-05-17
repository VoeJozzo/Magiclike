extends Control

# Lines between blockers and the attackers they block. Sits above CardManager
# so lines render on top. Redraws each frame during combat to track move tweens.

var game_board: Control = null


func _process(_delta: float) -> void:
	if game_board == null:
		return
	var s: EngineState = RulesEngine.state()
	if s == null:
		return
	if s.blockers.is_empty():
		# One final redraw to clear stale lines on combat exit, then idle.
		if visible_redraw_dirty:
			queue_redraw()
			visible_redraw_dirty = false
		return
	visible_redraw_dirty = true
	queue_redraw()


var visible_redraw_dirty: bool = false


func _draw() -> void:
	if game_board == null:
		return
	var s: EngineState = RulesEngine.state()
	if s == null or s.blockers.is_empty():
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
