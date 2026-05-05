extends Control

# game_board — top-level UI scene for the Phase 1 Lightning Bolt slice.
#
# Orchestrates: card-framework's CardManager + zone subclasses (Hand, Pile,
# BattlefieldZone) + PlayerPanels + a simple stack/log/action-button overlay.
# Subscribes to RulesEngine.state_changed to keep the visuals in sync after
# every state mutation.
#
# Construction is programmatic in _ready — the .tscn is just a Control with
# this script attached. Avoids hand-writing a deeply-nested .tscn that would
# need Godot's editor to clean up.
#
# Phase 1 interaction flow:
#   - Click a Mountain on your battlefield → tap for R mana
#   - Click Lightning Bolt in your hand → enter targeting mode
#   - Click opponent's life panel → cast Bolt at opp
#   - Click "Pass priority" button → resolve the stack, see life drop 20→17

# Card-framework refs
var _card_manager: CardManager
var _factory_scene: PackedScene = preload("res://scenes/json_card_factory.tscn")

# Zones
var _you_hand: Hand
var _you_battlefield: BattlefieldZone
var _you_library: Pile
var _you_graveyard: Pile
var _opp_hand: Hand
var _opp_battlefield: BattlefieldZone
var _opp_library: Pile
var _opp_graveyard: Pile

# UI overlay
var _you_panel: PlayerPanel
var _opp_panel: PlayerPanel
var _stack_display: VBoxContainer
var _log_display: RichTextLabel
var _action_button: Button
var _phase_label: Label

# Map of engine instance_id → visual Card node, for bidirectional UI ↔ engine.
var _iid_to_visual: Dictionary = {}

# Targeting-mode state. When non-null, a spell has been clicked and we're
# waiting for the player to choose a target.
var _pending_cast_iid: int = -1

# Number of engine-log lines we've already piped to the UI log. Tracked here
# (rather than relying on a log_appended signal that EngineState's RefCounted
# nature can't emit) so we can pull deltas on each state_changed.
var _engine_log_seen: int = 0


func _ready() -> void:
	_build_ui()
	_connect_engine_signals()
	# Boot the engine and spawn initial visuals.
	# Phase 2 demo: 1 Mountain in play, 3 in hand, plus Goblin Raider and Bolt.
	# (init_phase1 still works for the headless smoke test.)
	RulesEngine.init_phase2()
	_spawn_initial_visuals()
	_refresh_ui()


# ─── UI construction ───────────────────────────────────────────────────────

func _build_ui() -> void:
	anchors_preset = Control.PRESET_FULL_RECT
	# Background
	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.06, 0.08)
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	add_child(bg)

	# Card manager (root of card-framework subtree)
	_card_manager = CardManager.new()
	_card_manager.name = "CardManager"
	_card_manager.card_factory_scene = _factory_scene
	_card_manager.anchors_preset = Control.PRESET_FULL_RECT
	_card_manager.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(_card_manager)

	# Zones — children of CardManager (per card-framework requirement).
	# Layout: opp at top, you at bottom; each side has hand, battlefield, library, graveyard.
	# Window is 1920x1080.

	# Opponent row (top)
	_opp_library = _make_pile("OppLibrary", Vector2(80, 60), false)
	_opp_battlefield = _make_battlefield("OppBattlefield", Vector2(560, 200))
	_opp_graveyard = _make_pile("OppGraveyard", Vector2(1700, 60), true)
	# Opp hand isn't shown in Phase 1 (we don't simulate opponent draws).
	_opp_hand = _make_hand("OppHand", Vector2(960, 80))
	_opp_hand.visible = false

	# Your row (bottom)
	_you_battlefield = _make_battlefield("YouBattlefield", Vector2(560, 600))
	_you_library = _make_pile("YouLibrary", Vector2(80, 880), false)
	_you_graveyard = _make_pile("YouGraveyard", Vector2(1700, 880), true)
	_you_hand = _make_hand("YouHand", Vector2(960, 950))

	# Wire battlefield clicks. Hand cards get per-card gui_input listeners
	# at spawn time (see _spawn_visual_for_instance) since Hand/CardContainer
	# don't expose a clean pressed signal we can listen to globally.
	_you_battlefield.card_pressed.connect(_on_your_battlefield_card_pressed)

	# UI overlay (children of game_board, not CardManager)
	_you_panel = PlayerPanel.new()
	_you_panel.player_key = "you"
	_you_panel.position = Vector2(40, 800)
	add_child(_you_panel)
	_you_panel.clicked.connect(_on_panel_clicked.bind("you"))

	_opp_panel = PlayerPanel.new()
	_opp_panel.player_key = "opp"
	_opp_panel.position = Vector2(40, 40)
	add_child(_opp_panel)
	_opp_panel.clicked.connect(_on_panel_clicked.bind("opp"))

	# Phase label (top center)
	_phase_label = Label.new()
	_phase_label.position = Vector2(840, 12)
	_phase_label.add_theme_font_size_override("font_size", 16)
	_phase_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.85))
	add_child(_phase_label)

	# Stack display (center-right)
	var stack_label := Label.new()
	stack_label.text = "Stack:"
	stack_label.position = Vector2(1450, 350)
	stack_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.85))
	add_child(stack_label)
	_stack_display = VBoxContainer.new()
	_stack_display.position = Vector2(1450, 380)
	_stack_display.add_theme_constant_override("separation", 4)
	add_child(_stack_display)

	# Log (right side, fairly tall)
	var log_label := Label.new()
	log_label.text = "Log:"
	log_label.position = Vector2(1450, 580)
	log_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.85))
	add_child(log_label)
	_log_display = RichTextLabel.new()
	_log_display.position = Vector2(1450, 610)
	_log_display.size = Vector2(440, 240)
	_log_display.bbcode_enabled = true
	_log_display.scroll_following = true
	_log_display.add_theme_color_override("default_color", Color(0.85, 0.85, 0.9))
	add_child(_log_display)

	# Action button (Pass priority)
	_action_button = Button.new()
	_action_button.text = "Pass priority"
	_action_button.position = Vector2(40, 930)
	_action_button.size = Vector2(180, 40)
	_action_button.pressed.connect(_on_pass_pressed)
	add_child(_action_button)


func _make_battlefield(name_str: String, pos: Vector2) -> BattlefieldZone:
	var zone := BattlefieldZone.new()
	zone.name = name_str
	zone.position = pos
	zone.size = Vector2(800, 220)
	zone.mouse_filter = Control.MOUSE_FILTER_PASS
	_card_manager.add_child(zone)
	return zone


func _make_hand(name_str: String, pos: Vector2) -> Hand:
	var zone := Hand.new()
	zone.name = name_str
	zone.position = pos
	zone.size = Vector2(700, 120)
	zone.mouse_filter = Control.MOUSE_FILTER_PASS
	_card_manager.add_child(zone)
	return zone


func _make_pile(name_str: String, pos: Vector2, face_up: bool) -> Pile:
	var zone := Pile.new()
	zone.name = name_str
	zone.position = pos
	zone.size = Vector2(150, 210)
	zone.card_face_up = face_up
	zone.layout = Pile.PileDirection.UP
	zone.mouse_filter = Control.MOUSE_FILTER_PASS
	_card_manager.add_child(zone)
	return zone


# ─── Engine signal connections ─────────────────────────────────────────────

func _connect_engine_signals() -> void:
	RulesEngine.state_changed.connect(_on_state_changed)
	RulesEngine.log_appended.connect(_on_log_appended)
	RulesEngine.game_over.connect(_on_game_over)


# ─── Initial visual spawn ──────────────────────────────────────────────────

# Spawn a visual Card for every CardInstance in the engine's zones.
# Called once after RulesEngine.init_phase1().
func _spawn_initial_visuals() -> void:
	var s: EngineState = RulesEngine.state()
	for c in s.you.battlefield:
		_spawn_visual_for_instance(c, _you_battlefield)
	for c in s.you.hand:
		_spawn_visual_for_instance(c, _you_hand)
	for c in s.you.library:
		_spawn_visual_for_instance(c, _you_library)
	# Opp side empty in Phase 1 demo.


func _spawn_visual_for_instance(inst: CardInstance, zone: CardContainer) -> Card:
	var card_id: String = inst.template.card_id
	var visual: Card = _card_manager.card_factory.create_card(card_id, zone)
	if visual == null:
		push_error("Failed to spawn visual for card_id=%s" % card_id)
		return null
	# IMPORTANT: card-framework's JsonCardFactory caches card_info dicts and
	# assigns the SAME Dictionary by reference to every visual sharing a
	# card_id. We must duplicate before stamping per-instance data, or every
	# Mountain ends up with the iid of whichever was spawned last.
	visual.card_info = visual.card_info.duplicate()
	visual.card_info["instance_id"] = inst.instance_id
	_iid_to_visual[inst.instance_id] = visual
	# Populate the name/cost/type overlay now that card_info is final.
	# (Card._ready already built the empty labels; this fills them.)
	if visual.has_method("apply_card_text"):
		visual.apply_card_text()
	# Hook click handling. card-framework's _handle_mouse_pressed calls
	# card_container.on_card_pressed, which for BattlefieldZone we already
	# wired via the signal. For Hand, we connect to the visual's signals
	# directly here as a fallback.
	if zone is Hand:
		# Connect this card's pressed event to our hand handler.
		# Card emits no direct "pressed" signal — we listen via gui_input on the card.
		visual.gui_input.connect(_on_hand_card_gui_input.bind(visual))
	return visual


# ─── State sync ────────────────────────────────────────────────────────────

func _on_state_changed() -> void:
	_refresh_ui()


func _refresh_ui() -> void:
	var s: EngineState = RulesEngine.state()
	# Player panels
	_you_panel.update_from_player(s.you)
	_opp_panel.update_from_player(s.opp)
	# Phase label
	_phase_label.text = "Turn %d — %s — Priority: %s" % [
		s.turn,
		s.phase_machine.phase_name(),
		s.priority_player().name,
	]
	# Stack display
	_refresh_stack_display(s)
	# Visual card sync
	_sync_card_visuals(s)
	# Action button label reflects current phase / mode
	_update_action_button(s)
	# Drain new engine log lines into the UI log
	while _engine_log_seen < s.log.size():
		_log_local("[color=#88aaff]%s[/color]" % s.log[_engine_log_seen])
		_engine_log_seen += 1


# Phase-aware label for the action button. Targeting mode overrides; stack-
# non-empty overrides phase (because passing priority resolves the top of
# stack rather than advancing the phase, regardless of which phase you're in).
func _update_action_button(s: EngineState) -> void:
	if _pending_cast_iid != -1:
		_action_button.text = "Cancel target"
		return
	if not s.stack.is_empty():
		_action_button.text = "Resolve"
		return
	match s.phase_machine.current:
		PhaseMachine.Phase.MAIN1:
			_action_button.text = "Move to combat"
		PhaseMachine.Phase.COMBAT_ATTACK:
			if s.attackers.is_empty():
				_action_button.text = "Skip attack"
			else:
				_action_button.text = "Confirm attack"
		PhaseMachine.Phase.COMBAT_BLOCK:
			_action_button.text = "Continue"
		PhaseMachine.Phase.COMBAT_DAMAGE:
			_action_button.text = "Continue"
		PhaseMachine.Phase.MAIN2:
			_action_button.text = "End turn"
		_:
			_action_button.text = "Pass priority"


func _refresh_stack_display(s: EngineState) -> void:
	# Clear previous
	for c in _stack_display.get_children():
		c.queue_free()
	if s.stack.is_empty():
		var empty := Label.new()
		empty.text = "(empty)"
		empty.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6))
		_stack_display.add_child(empty)
		return
	# Top of stack at top of display (LIFO visual)
	var entries := s.stack.entries.duplicate()
	entries.reverse()
	for entry in entries:
		var iid: int = entry.get("source_iid", -1)
		var name: String = "?"
		if _iid_to_visual.has(iid):
			# Best effort — visual still has card_info with display_name
			name = str(_iid_to_visual[iid].card_info.get("display_name", "?"))
		var lbl := Label.new()
		lbl.text = "▶ %s" % name
		lbl.add_theme_color_override("font_color", Color(1, 0.9, 0.5))
		_stack_display.add_child(lbl)


func _sync_card_visuals(s: EngineState) -> void:
	# For each tracked iid, ensure its visual is in the right zone.
	# A card may be:
	#   - In a zone (hand/battlefield/graveyard/library/exile) on either player
	#   - On the stack (find_instance returns zone_name="stack", card=null —
	#     the actual CardInstance is held in Engine._stack_held_cards)
	#   - Removed entirely (shouldn't happen in Phase 1/2)
	for iid in _iid_to_visual.keys():
		var visual: Card = _iid_to_visual[iid]
		var found = s.find_instance(iid)
		if found == null:
			# Untracked — hide. Shouldn't happen in normal play.
			visual.visible = false
			continue
		visual.visible = true
		# Stack visual: detach from any container so layout doesn't reposition,
		# then move to the stack anchor position.
		if found.zone_name == "stack":
			if visual.card_container != null and visual.card_container.has_card(visual):
				visual.card_container.remove_card(visual)
			visual.move(_stack_anchor_global_pos(), 0.0)
			continue
		# Normal zones: ensure the visual is in the right CardContainer.
		var target_zone: CardContainer = _zone_for(found.controller.key, found.zone_name)
		if target_zone != null and visual.card_container != target_zone:
			target_zone.move_cards([visual], -1, false)
	# Refresh battlefield layouts so tap state (rotation) is re-applied via
	# card.move() — the canonical pathway that survives hover-animation
	# interference from card-framework.
	_you_battlefield.update_card_ui()
	_opp_battlefield.update_card_ui()


# Where stack-held card visuals appear on screen. Center-ish, between the
# two battlefields. Returned as global position so card.move() can use it
# directly (move() works in global coordinates).
func _stack_anchor_global_pos() -> Vector2:
	return Vector2(900, 440)


func _zone_for(controller_key: String, zone_name: String) -> CardContainer:
	var prefix := _you_battlefield if controller_key == "you" else _opp_battlefield
	match zone_name:
		"hand":      return _you_hand if controller_key == "you" else _opp_hand
		"battlefield": return _you_battlefield if controller_key == "you" else _opp_battlefield
		"library":   return _you_library if controller_key == "you" else _opp_library
		"graveyard": return _you_graveyard if controller_key == "you" else _opp_graveyard
		_: return null


# ─── Click handling ────────────────────────────────────────────────────────

func _on_your_battlefield_card_pressed(visual: Card) -> void:
	# In targeting mode, ignore battlefield clicks (Phase 1/2 has no creature targets)
	if _pending_cast_iid != -1:
		return
	var iid: int = visual.card_info.get("instance_id", -1)
	if iid == -1:
		return

	# During COMBAT_ATTACK, clicking a creature declares it as an attacker.
	var phase = RulesEngine.state().phase_machine.current
	if phase == PhaseMachine.Phase.COMBAT_ATTACK:
		var attack := Action.make_declare_attacker(iid)
		if RulesEngine.is_legal_action(attack):
			RulesEngine.execute_action(attack)
			return
		# Fall through if not legal (e.g., land clicked during combat)

	# Default: try to activate ability (taps land for mana)
	var action := Action.make_activate_ability(iid)
	if RulesEngine.is_legal_action(action):
		RulesEngine.execute_action(action)


# Hand cards don't go through CardContainer.on_card_pressed cleanly because
# Hand's drag system intercepts. We hook gui_input on each spawned hand card.
func _on_hand_card_gui_input(event: InputEvent, visual: Card) -> void:
	if not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return
	var iid: int = visual.card_info.get("instance_id", -1)
	if iid == -1:
		return
	# If we're already targeting, this is a 2nd click — ignore.
	if _pending_cast_iid != -1:
		return
	# Look up the card instance
	var s: EngineState = RulesEngine.state()
	var found = s.find_instance(iid)
	if found == null or found.zone_name != "hand":
		return
	var card: CardInstance = found.card

	# Lands: special action, doesn't use stack.
	if card.is_land():
		var play := Action.make_play_land(iid)
		if RulesEngine.is_legal_action(play):
			RulesEngine.execute_action(play)
		else:
			_log_local("[color=#ff8888]Can't play %s right now[/color]" % card.name())
		return

	# Spells (instant/sorcery/creature): pay mana, push to stack.
	var ctrl: Player = found.controller
	if not ctrl.mana.can_pay(card.template.mana_cost):
		_log_local("[color=#ff8888]Can't pay %s for %s[/color]" % [
			_fmt_cost(card.template.mana_cost),
			card.name(),
		])
		return

	# Targeted spells enter targeting mode; untargeted ones cast directly.
	if card.template is SpellResource and card.template.requires_target:
		_enter_targeting_mode(iid, card.template.target_filter)
	else:
		var cast := Action.make_cast_spell(iid, [])
		if RulesEngine.is_legal_action(cast):
			RulesEngine.execute_action(cast)
		else:
			_log_local("[color=#ff8888]Can't cast %s right now (wrong phase?)[/color]" % card.name())


func _on_panel_clicked(panel_key: String) -> void:
	if _pending_cast_iid == -1:
		return
	# Player chose a target
	var action := Action.make_cast_spell(_pending_cast_iid, [Action.target_player(panel_key)])
	var ok: bool = RulesEngine.execute_action(action)
	if ok:
		_pending_cast_iid = -1
		_exit_targeting_mode()


func _on_pass_pressed() -> void:
	# If in targeting mode, cancel it instead of passing priority.
	if _pending_cast_iid != -1:
		_pending_cast_iid = -1
		_exit_targeting_mode()
		_log_local("[color=#888]Cancelled targeting[/color]")
		return
	RulesEngine.execute_action(Action.make_pass_priority())


# ─── Targeting mode ────────────────────────────────────────────────────────

func _enter_targeting_mode(spell_iid: int, target_filter: String) -> void:
	_pending_cast_iid = spell_iid
	# Mark valid targets clickable. Phase 1 supports "any" and "player".
	if target_filter == "any" or target_filter == "player":
		_you_panel.is_clickable = true
		_opp_panel.is_clickable = true
	# Visual cue in the action button
	_action_button.text = "Cancel target"
	_log_local("[color=#ffd866]Pick a target...[/color]")


func _exit_targeting_mode() -> void:
	_you_panel.is_clickable = false
	_opp_panel.is_clickable = false
	_action_button.text = "Pass priority"


# ─── Misc helpers ──────────────────────────────────────────────────────────

func _on_log_appended(line: String) -> void:
	_log_local(line)


func _on_game_over(winner_key: String) -> void:
	_log_local("[color=#ffd700][b]GAME OVER — %s wins[/b][/color]" % winner_key)
	_action_button.disabled = true


func _log_local(line: String) -> void:
	_log_display.append_text(line + "\n")


func _fmt_cost(cost: Dictionary) -> String:
	var parts: Array[String] = []
	for color in ["W", "U", "B", "R", "G", "C"]:
		if cost.get(color, 0) > 0:
			parts.append("%d%s" % [cost[color], color])
	if parts.size() == 0:
		return "(free)"
	return ", ".join(parts)
