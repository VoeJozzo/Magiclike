extends Control

# Overlay that draws connection lines between blockers and the attackers they
# block. Sits above CardManager in the scene tree so lines render on top of
# card visuals. Reads state.blockers from the engine and looks up visual
# positions via game_board's _iid_to_visual map.
#
# Redraws every frame while combat is active so lines follow card-framework's
# move tweens. Cheap at Phase 3 scale (≤ 5 active lines).

var game_board: Control = null


func _process(_delta: float) -> void:
	# Only redraw when in a combat phase to avoid wasted work the rest of the time.
	if game_board == null:
		return
	var s: EngineState = RulesEngine.state()
	if s == null:
		return
	if s.blockers.is_empty():
		# Nothing to draw — but if we *just* exited combat with stale lines,
		# request one final redraw to clear them, then idle.
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
		# Card visuals' global_position is the top-left; offset to the center.
		var b_size: Vector2 = blocker_visual.size
		var a_size: Vector2 = attacker_visual.size
		var b_center: Vector2 = blocker_visual.global_position + b_size * 0.5
		var a_center: Vector2 = attacker_visual.global_position + a_size * 0.5
		# Draw in this Control's local coordinates.
		var b_local: Vector2 = b_center - global_position
		var a_local: Vector2 = a_center - global_position
		# Line: green-ish, 4px, anti-aliased. End-circles for emphasis.
		var line_color := Color(0.30, 0.95, 0.55, 0.85)
		draw_line(b_local, a_local, line_color, 4.0, true)
		draw_circle(b_local, 7.0, Color(0.30, 0.95, 0.55, 0.95))  # blocker end
		draw_circle(a_local, 7.0, Color(0.95, 0.45, 0.40, 0.95))  # attacker end
