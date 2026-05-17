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
# Top-level overlay that draws blocker→attacker connection lines.
var _combat_lines: Control

# Map of engine instance_id → visual Card node, for bidirectional UI ↔ engine.
var _iid_to_visual: Dictionary = {}

# Targeting-mode state. When non-null, a spell has been clicked and we're
# waiting for the player to choose a target.
var _pending_cast_iid: int = -1
# Target filter for the pending spell ("any", "creature", "player", etc.) —
# determines which clicks count as valid targets.
var _pending_target_filter: String = ""
# Phase 5c UI polish (per playtest #1): the auto-tap plan computed when
# the player clicked a spell. Lands aren't actually tapped until the
# cast commits (target picked, action dispatched). If the player cancels
# targeting, this is discarded and the lands stay untapped.
var _pending_cast_tap_plan: Array = []

# Block-declaration mode. When non-null, the player has clicked one of their
# creatures to be a blocker; we're waiting for them to click an attacker to
# block. Cleared after the block declares (or via the cancel button).
var _pending_block_blocker_iid: int = -1

# Atomic-block-commit flag for defender's COMBAT_BLOCK. In real MTG, all
# blocks are declared as a single turn-based action before priority opens for
# response casting. To preserve that structure, we make the player explicitly
# "Confirm blocks" before allowing them to cast Giant Growth or other instants
# during defender's combat. This way the attacker (in Phase 5+ when AI exists)
# reacts to a fully-known set of blocks.
# Only relevant when active_player == "opp" and phase == COMBAT_BLOCK; reset
# automatically when leaving that state.
#
# Phase 5c UI polish (strict ordering): now derived from engine state
# (`state.awaiting_block_declaration`) instead of a separate local flag.
# Defender-confirming fires KIND_CONFIRM_BLOCKS, which clears the engine
# flag — the UI just reads back. This getter keeps existing call sites
# working without refactoring every reference.
func _is_awaiting_blocks() -> bool:
	var s: EngineState = RulesEngine.state()
	return s != null and s.awaiting_block_declaration

# Phase 4.5b: tracks whether we're in the trigger target picker UI mode.
# Driven by state.awaiting_target_for_trigger; toggling is automatic in
# _refresh_ui. When true, panel clicks issue KIND_PICK_TRIGGER_TARGET
# instead of falling through to the spell-target path.
var _picking_trigger_target: bool = false

# Number of engine-log lines we've already piped to the UI log. Tracked here
# (rather than relying on a log_appended signal that EngineState's RefCounted
# nature can't emit) so we can pull deltas on each state_changed.
var _engine_log_seen: int = 0


func _ready() -> void:
	_build_ui()
	_connect_engine_signals()
	# Phase 5c UI polish: capture global keystrokes for pass-priority
	# (Enter/Space) and cancel-targeting (Escape).
	set_process_unhandled_input(true)
	# Boot the engine and spawn initial visuals.
	# Phase 5c: AI vs AI with a multi-color showcase deck so a manual playtest
	# can see Counterspell, Healing Salve, and every Phase 5a keyword card in
	# one session. Opp's turn is driven by AI.decide; player still drives
	# their own via UI. (Switch back to init_phase4_5_demo if you want the
	# tight R/G mirror without the keyword zoo.)
	RulesEngine.init_phase5_demo()
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

	# Opponent row (top). Battlefield grew taller in Phase 5c UI polish so
	# creatures and lands get separate rows. Opp's battlefield flips
	# creatures_on_top=false so opp's creatures sit at the BOTTOM of their
	# zone (closer to combat center) and opp's lands push to the top.
	# Library moved to X=340 to clear the player panel at (40, 40, w=280).
	_opp_library = _make_pile("OppLibrary", Vector2(340, 40), false)
	_opp_battlefield = _make_battlefield("OppBattlefield", Vector2(560, 120), false)
	_opp_graveyard = _make_pile("OppGraveyard", Vector2(1700, 60), true)
	_opp_hand = _make_hand("OppHand", Vector2(960, 60))

	# Your row (bottom). Creatures on top (closer to center, matching opp's
	# creatures sitting closer to center on their side). Library moved to
	# X=340 so it doesn't sit on top of the you-panel.
	_you_battlefield = _make_battlefield("YouBattlefield", Vector2(560, 560), true)
	_you_library = _make_pile("YouLibrary", Vector2(340, 800), false)
	_you_graveyard = _make_pile("YouGraveyard", Vector2(1700, 880), true)
	_you_hand = _make_hand("YouHand", Vector2(960, 980))

	# Wire battlefield clicks. Hand cards get per-card gui_input listeners
	# at spawn time (see _spawn_visual_for_instance) since Hand/CardContainer
	# don't expose a clean pressed signal we can listen to globally.
	_you_battlefield.card_pressed.connect(_on_your_battlefield_card_pressed)
	# Opp's battlefield: clicks are meaningful for creature-targeting (cast
	# Bolt at an opp Bear) and for block declaration (clicking opp's
	# attacker after selecting a blocker on your side).
	_opp_battlefield.card_pressed.connect(_on_opp_battlefield_card_pressed)

	# Combat-lines overlay: draws blocker→attacker connection lines on top
	# of card visuals. Added AFTER CardManager so it renders above the cards
	# in normal sibling order; z_index also bumped to ensure it stays on top
	# even when card-framework's hover system elevates a card's z_index.
	# Hardcoded position/size (rather than anchors) to guarantee global_pos =
	# (0,0) regardless of parent layout timing.
	var lines_script := preload("res://scenes/game/combat_lines.gd")
	_combat_lines = Control.new()
	_combat_lines.set_script(lines_script)
	_combat_lines.name = "CombatLines"
	_combat_lines.position = Vector2.ZERO
	_combat_lines.size = Vector2(1920, 1080)
	_combat_lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_combat_lines.z_index = 100
	_combat_lines.set("game_board", self)
	add_child(_combat_lines)

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
	# Phase 5c UI polish: disable keyboard focus so Space/Enter only fire
	# the global keybind path (game_board._unhandled_input) once. Previously
	# the button could grab focus from a click and then process ui_accept
	# in addition to our global handler, advancing two phases per press.
	_action_button.focus_mode = Control.FOCUS_NONE
	_action_button.pressed.connect(_on_pass_pressed)
	add_child(_action_button)


func _make_battlefield(name_str: String, pos: Vector2, creatures_on_top: bool) -> BattlefieldZone:
	var zone := BattlefieldZone.new()
	zone.name = name_str
	zone.position = pos
	# Tall enough for two rows: creature row (~210) + gap + land row (~210).
	zone.size = Vector2(900, 440)
	zone.creatures_on_top = creatures_on_top
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

# Spawn a visual Card for every CardInstance in the engine's zones, both sides.
# Called once after RulesEngine.init_phase*().
func _spawn_initial_visuals() -> void:
	var s: EngineState = RulesEngine.state()
	# You
	for c in s.you.battlefield:
		_spawn_visual_for_instance(c, _you_battlefield)
	for c in s.you.hand:
		_spawn_visual_for_instance(c, _you_hand)
	for c in s.you.library:
		_spawn_visual_for_instance(c, _you_library)
	# Opp
	for c in s.opp.battlefield:
		_spawn_visual_for_instance(c, _opp_battlefield)
	for c in s.opp.hand:
		_spawn_visual_for_instance(c, _opp_hand)
	for c in s.opp.library:
		_spawn_visual_for_instance(c, _opp_library)


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
	# wired via the signal. For Hand, we connect the visual's gui_input
	# directly — but we connect it ALWAYS, not just when the card spawns in
	# a Hand. Cards spawned in the library will later be drawn into the
	# hand, and without an eager connection here those drawn cards would
	# silently swallow clicks. The handler itself checks
	# `found.zone_name != "hand"` and bails when called on a battlefield/
	# library/graveyard card, so it's safe to wire for every visual.
	visual.gui_input.connect(_on_hand_card_gui_input.bind(visual))
	return visual


# ─── State sync ────────────────────────────────────────────────────────────

func _on_state_changed() -> void:
	_refresh_ui()


func _refresh_ui() -> void:
	var s: EngineState = RulesEngine.state()
	# Phase 4.5b: enter / exit trigger-target picker mode based on engine state.
	var was_picking := _picking_trigger_target
	_picking_trigger_target = not s.awaiting_target_for_trigger.is_empty()
	if _picking_trigger_target and not was_picking:
		_enter_trigger_target_mode(s.awaiting_target_for_trigger)
	elif was_picking and not _picking_trigger_target:
		_exit_trigger_target_mode()
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


# Phase-aware label for the action button. Targeting/block-selection modes
# override; stack-non-empty overrides phase (passing priority resolves the
# top of stack rather than advancing the phase).
func _update_action_button(s: EngineState) -> void:
	if _picking_trigger_target:
		_action_button.text = "Pick a target…"
		return
	if _pending_cast_iid != -1:
		_action_button.text = "Cancel target"
		return
	if _pending_block_blocker_iid != -1:
		_action_button.text = "Cancel block"
		return
	if not s.stack.is_empty():
		_action_button.text = "Resolve"
		return
	# Defending player's COMBAT_BLOCK (we are defender = you, active = opp).
	# Two-stage button:
	#   - Pre-commit: "Confirm blocks" (or "Skip blocks" if none declared) —
	#     locks in the block declaration so the cast window can open.
	#   - Post-commit: "Pass priority" — actually passes priority and advances.
	if s.phase_machine.current == PhaseMachine.Phase.COMBAT_BLOCK and s.active_player_key == "opp":
		if _is_awaiting_blocks():
			_action_button.text = "Confirm blocks" if not s.blockers.is_empty() else "Skip blocks"
		else:
			_action_button.text = "Pass priority"
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
	# Top of stack at top of display (LIFO visual). Phase 5c UI polish (#6):
	# stack entries are now Buttons so the player can click them when in
	# "target a spell" mode (Counterspell). Buttons are visually clear when
	# the picker is active (highlighted) so the player knows what to click.
	var entries := s.stack.entries.duplicate()
	entries.reverse()
	var picking_spell_target: bool = _pending_cast_iid != -1 and _pending_target_filter == "spell"
	for entry in entries:
		var iid: int = entry.get("source_iid", -1)
		var name: String = "?"
		if _iid_to_visual.has(iid):
			name = str(_iid_to_visual[iid].card_info.get("display_name", "?"))
		var kind: String = entry.get("kind", "spell")
		var btn := Button.new()
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		btn.custom_minimum_size = Vector2(420, 0)
		btn.focus_mode = Control.FOCUS_NONE  # avoid Space-key shenanigans
		if kind == "trigger":
			btn.text = "⚡ %s\n   %s" % [name, _trigger_oracle_text(entry)]
			btn.add_theme_color_override("font_color", Color(1.0, 0.75, 0.30))
		else:
			btn.text = "▶ %s\n   %s%s" % [
				name,
				_spell_oracle_text(iid),
				_format_targets_for_log(entry.get("targets", [])),
			]
			btn.add_theme_color_override("font_color", Color(1, 0.9, 0.5))
		# When in spell-target mode, only spell entries are clickable
		# targets. Trigger entries can't be countered with a vanilla
		# Counterspell. Highlight clickable entries and connect handler.
		if picking_spell_target and kind == "spell":
			btn.disabled = false
			btn.add_theme_color_override("font_color", Color(1.0, 0.85, 0.30))  # gold = clickable target
			btn.pressed.connect(_on_stack_entry_clicked.bind(iid))
		else:
			# Disable visually so it doesn't look clickable when it isn't.
			# (Still readable — disabled buttons grey out the text slightly.)
			btn.disabled = true
		_stack_display.add_child(btn)


# Phase 5c UI polish (#6): handler for clicks on a stack entry when the
# player is choosing a spell to counter. Commits the deferred auto-tap
# plan and dispatches the cast.
func _on_stack_entry_clicked(stack_iid: int) -> void:
	if _pending_cast_iid == -1:
		return
	if _pending_target_filter != "spell":
		return
	var iid := _pending_cast_iid
	var plan := _pending_cast_tap_plan
	_pending_cast_iid = -1
	_pending_target_filter = ""
	_pending_cast_tap_plan = []
	var target := {"kind": "stack", "iid": stack_iid}
	_commit_taps_and_cast(iid, [target], plan)
	_exit_targeting_mode()


# Pull oracle text off the source CardResource for a trigger entry, with a
# fallback that names the triggered-ability event so the line isn't empty.
func _trigger_oracle_text(entry: Dictionary) -> String:
	var iid: int = entry.get("source_iid", -1)
	var s: EngineState = RulesEngine.state()
	var found = s.find_instance(iid)
	if found != null and found.card != null and found.card.template != null:
		var oracle: String = str(found.card.template.oracle_text)
		if oracle != "":
			return oracle
	return "(triggered ability)"


# Pull oracle text for a spell on the stack via its iid. Spell sources may be
# held in the engine's _stack_held_cards (not in any zone), so we use the
# engine's own find_anywhere helper indirectly via _iid_to_visual.
func _spell_oracle_text(iid: int) -> String:
	if _iid_to_visual.has(iid):
		var visual: Card = _iid_to_visual[iid]
		var card_id: String = str(visual.card_info.get("card_id", ""))
		if card_id != "":
			var template: CardResource = CardDatabase.get_card(card_id)
			if template != null and template.oracle_text != "":
				return str(template.oracle_text)
	return ""


# Formats target descriptors as a compact " → opp" or " → creature#5" suffix.
func _format_targets_for_log(targets: Array) -> String:
	if targets.is_empty():
		return ""
	var parts: Array[String] = []
	for t in targets:
		match t.get("kind", ""):
			"player": parts.append(str(t.get("who", "?")))
			"creature":
				var iid: int = t.get("iid", -1)
				if _iid_to_visual.has(iid):
					parts.append(str(_iid_to_visual[iid].card_info.get("display_name", "creature")))
				else:
					parts.append("creature#%d" % iid)
			"stack":
				parts.append("the spell on stack")
			_: parts.append("?")
	return "\n   → " + ", ".join(parts)


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
		# then cascade by stack index so multiple stack entries don't pile
		# on top of each other. Bottom-of-stack at the anchor; subsequent
		# items step up-and-right.
		if found.zone_name == "stack":
			if visual.card_container != null and visual.card_container.has_card(visual):
				visual.card_container.remove_card(visual)
			var stack_idx := _find_stack_index(s, iid)
			var cascade := Vector2(stack_idx * 30.0, -stack_idx * 25.0)
			visual.move(_stack_anchor_global_pos() + cascade, 0.0)
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
	# Refresh live P/T display (current_power/toughness, temp pumps, damage
	# markers) for every creature on either battlefield.
	for player_state in [s.you, s.opp]:
		for c in player_state.battlefield:
			if not (c.template is CreatureResource):
				continue
			var visual: Card = _iid_to_visual.get(c.instance_id)
			if visual != null and visual.has_method("apply_creature_state"):
				visual.apply_creature_state(c)
	# Apply combat-state highlights so the player can see at a glance which
	# creatures are pending blocker, in a committed block pair, or attacking
	# unblocked.
	_apply_combat_highlights(s)
	# Phase 5c UI polish: green glow on cards that are legal to act on
	# right now (castable spells, playable lands, mana-tappable lands,
	# attackable creatures, blockable creatures). Walks the priority
	# player's hand + battlefield against get_legal_actions().
	_apply_legality_glows(s)


# Walk attackers + blockers and tag each visual with its combat state.
# Highlight states (see scenes/card.gd set_combat_highlight):
#   "pending"   — your creature you've clicked to begin blocking with
#   "committed" — already paired (either side: blocker or its blocked attacker)
#   "none"      — clear (includes attackers not yet paired with a blocker)
#
# Per playtest feedback: attackers don't glow until a blocker is declared
# against them. "Unblocked" attackers get no highlight — they're just normal
# creatures heading for face damage.
func _apply_combat_highlights(s: EngineState) -> void:
	# Build the set of attackers that have at least one blocker.
	var blocked_attackers: Dictionary = {}
	for blk_iid in s.blockers:
		blocked_attackers[s.blockers[blk_iid]] = true
	# Walk every battlefield creature and decide its highlight.
	for player_state in [s.you, s.opp]:
		for c in player_state.battlefield:
			if not (c.template is CreatureResource):
				continue
			var visual: Card = _iid_to_visual.get(c.instance_id)
			if visual == null or not visual.has_method("set_combat_highlight"):
				continue
			var iid: int = c.instance_id
			var state_name: String
			if iid == _pending_block_blocker_iid:
				state_name = "pending"
			elif s.blockers.has(iid):
				state_name = "committed"  # blocker
			elif blocked_attackers.has(iid):
				state_name = "committed"  # attacker that's been blocked
			else:
				state_name = "none"
			visual.set_combat_highlight(state_name)


# Phase 5c UI polish: edge glow on cards that are legal actions right now.
# Has two modes:
#   - Default: green on every "you"-side card whose iid appears in
#     get_legal_actions("you"). Covers castable spells, playable lands,
#     tappable mana abilities, declarable attackers, declarable blockers.
#   - Spell-target mode: when _pending_cast_iid is set, glow shifts to
#     yellow on legal TARGETS of the spell being cast (the castable cards
#     and other actions are not relevant because targeting is in progress).
func _apply_legality_glows(s: EngineState) -> void:
	var glow_state: Dictionary = {}  # iid -> "playable" or "target"
	if _pending_cast_iid != -1:
		_collect_legal_target_iids(s, _pending_target_filter, glow_state)
	elif _picking_trigger_target:
		var filter: String = s.awaiting_target_for_trigger.get("filter", "")
		_collect_legal_target_iids(s, filter, glow_state)
	else:
		# Strict-legal actions (current mana exactly covers).
		for action in RulesEngine.get_legal_actions("you"):
			var iid: int = int(action.get("source_iid", -1))
			if iid != -1:
				glow_state[iid] = "playable"
		# Phase 5c UI polish (per playtest #2): also glow hand cards that
		# would be castable AFTER auto-tap. Player shouldn't have to
		# manually tap lands to see what they can cast.
		for card in s.you.hand:
			if card.template == null:
				continue
			if glow_state.has(card.instance_id):
				continue  # already counted as currently-legal
			if _can_potentially_cast(card, s):
				glow_state[card.instance_id] = "playable"
	# Apply to every tracked visual. Anything not in the glow set gets
	# cleared. This keeps the glow in sync with mana / phase / priority
	# changes without us needing to track previous-frame state.
	for iid in _iid_to_visual.keys():
		var visual: Card = _iid_to_visual[iid]
		if visual == null or not visual.has_method("set_legality_glow"):
			continue
		visual.set_legality_glow(glow_state.get(iid, "none"))


# Phase 5c UI polish: walk the current state and add every iid that's a
# legal target under the given filter. Used by both the spell-cast target
# picker and the trigger target picker.
func _collect_legal_target_iids(s: EngineState, filter: String, out: Dictionary) -> void:
	# Filters that allow creature targets: glow legal creatures on either
	# battlefield (modulo hexproof). Player-only or spell-only filters
	# don't need a creature glow — player panels handle their own.
	if filter != "any" and filter != "creature" and filter != "creature_or_player":
		return
	for player in [s.you, s.opp]:
		for c in player.battlefield:
			if c.template == null or not (c.template is CreatureResource):
				continue
			# Hexproof on opponent's creatures means you can't target them.
			if c.has_keyword("hexproof") and c.controller_key != "you":
				continue
			out[c.instance_id] = "target"


# Where stack-held card visuals appear on screen. Center-ish, between the
# two battlefields. Returned as global position so card.move() can use it
# directly (move() works in global coordinates).
func _stack_anchor_global_pos() -> Vector2:
	return Vector2(900, 440)


# Index of the stack entry with the given source_iid (0 = bottom of stack,
# size-1 = top). -1 if not on stack.
func _find_stack_index(s: EngineState, iid: int) -> int:
	for i in range(s.stack.entries.size()):
		if s.stack.entries[i].get("source_iid", -1) == iid:
			return i
	return -1


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
	var iid: int = visual.card_info.get("instance_id", -1)
	if iid == -1:
		return

	# Phase 4.5b: trigger target picker. Creatures on either battlefield are
	# legal under creature_or_player / creature filters.
	if _picking_trigger_target:
		_try_pick_creature_as_trigger_target(iid)
		return

	# Targeting mode: clicks on creatures may set the spell's target.
	if _pending_cast_iid != -1:
		if _is_valid_creature_target(iid):
			_execute_pending_cast_with_target({"kind": "creature", "iid": iid})
		return

	var s: EngineState = RulesEngine.state()
	var phase = s.phase_machine.current

	# Defending player's COMBAT_BLOCK: clicking your creature picks it as a
	# pending blocker, OR un-declares it if it's already a blocker.
	# Only return if the click was actually consumed by block-selection logic;
	# otherwise fall through (e.g., clicking a Land should still tap for mana).
	if phase == PhaseMachine.Phase.COMBAT_BLOCK and s.active_player_key == "opp":
		# Phase 5c UI polish: clicking a creature that's already blocking
		# un-declares it (lets the player change their mind before
		# committing). Only allowed pre-commit.
		if s.blockers.has(iid) and _is_awaiting_blocks():
			var undo := Action.make_undeclare_blocker(iid)
			if RulesEngine.is_legal_action(undo):
				RulesEngine.execute_action(undo)
				return
		var found = s.find_instance(iid)
		if found != null and found.card != null \
				and found.card.template is CreatureResource \
				and not found.card.tapped \
				and not s.blockers.has(iid) \
				and _is_awaiting_blocks():
			_pending_block_blocker_iid = iid
			_log_local("[color=#ffd866]Selected %s as blocker — click an attacker.[/color]" % found.card.name())
			_refresh_ui()  # update button label
			return
		# Fall through: click on land (tap for mana), or any non-blocker click

	# Active player's COMBAT_ATTACK: click your creature to declare attacker,
	# OR un-declare it if it's already attacking.
	if phase == PhaseMachine.Phase.COMBAT_ATTACK and s.active_player_key == "you":
		# Phase 5c UI polish: clicking an attacking creature un-declares it.
		if iid in s.attackers:
			var undo := Action.make_undeclare_attacker(iid)
			if RulesEngine.is_legal_action(undo):
				RulesEngine.execute_action(undo)
				return
		var attack := Action.make_declare_attacker(iid)
		if RulesEngine.is_legal_action(attack):
			RulesEngine.execute_action(attack)
			return
		# Fall through if not legal (e.g., land clicked during combat)

	# Default: try to activate ability (taps land for mana)
	var action := Action.make_activate_ability(iid)
	if RulesEngine.is_legal_action(action):
		RulesEngine.execute_action(action)


func _on_opp_battlefield_card_pressed(visual: Card) -> void:
	var iid: int = visual.card_info.get("instance_id", -1)
	if iid == -1:
		return

	# Phase 4.5b: trigger target picker — same rule, either side legal.
	if _picking_trigger_target:
		_try_pick_creature_as_trigger_target(iid)
		return

	# Targeting mode: this opp creature could be the target.
	if _pending_cast_iid != -1:
		if _is_valid_creature_target(iid):
			_execute_pending_cast_with_target({"kind": "creature", "iid": iid})
		return

	# Block declaration: if a blocker is selected and this is an attacker,
	# the click finalizes the block.
	var s: EngineState = RulesEngine.state()
	if _pending_block_blocker_iid != -1 \
			and s.phase_machine.current == PhaseMachine.Phase.COMBAT_BLOCK \
			and s.active_player_key == "opp" \
			and iid in s.attackers:
		var action := Action.make_declare_blocker(_pending_block_blocker_iid, iid)
		if RulesEngine.is_legal_action(action):
			RulesEngine.execute_action(action)
		_pending_block_blocker_iid = -1
		_refresh_ui()


# True if `iid` is a legal creature target for the currently-pending cast.
# Phase 3 supports filters "any" (creature or player; here we just check
# creature-ness) and "creature".
func _is_valid_creature_target(iid: int) -> bool:
	if _pending_target_filter != "any" and _pending_target_filter != "creature":
		return false
	var s: EngineState = RulesEngine.state()
	var found = s.find_instance(iid)
	if found == null or found.card == null:
		return false
	if found.zone_name != "battlefield":
		return false
	return found.card.template is CreatureResource


# Execute a cast with the given target. Used by both panel clicks (player
# targets) and battlefield clicks (creature targets). Commits the deferred
# auto-tap plan first, then dispatches the cast.
func _execute_pending_cast_with_target(target: Dictionary) -> void:
	var iid := _pending_cast_iid
	var plan := _pending_cast_tap_plan
	# Clear pending state BEFORE committing so a failed cast doesn't
	# leave us in a weird half-state.
	_pending_cast_iid = -1
	_pending_target_filter = ""
	_pending_cast_tap_plan = []
	if not _commit_taps_and_cast(iid, [target], plan):
		# Cast failed for some reason — already logged by inner. Restore
		# targeting cleanup so UI doesn't think we're still picking.
		_exit_targeting_mode()
		return
	_exit_targeting_mode()


# Phase 5c UI polish (per playtest #1): atomically tap the planned lands
# and dispatch the cast. If the cast is rejected, this is the LAST step
# before any state changes, so reverting taps is unnecessary (we'd never
# get here if the cast would fail — pre-checks already ran). But if the
# cast somehow fails post-tap, log it and let the player retry.
func _commit_taps_and_cast(spell_iid: int, targets: Array, lands_to_tap: Array) -> bool:
	# Tap planned lands first (each is a normal mana ability).
	for land in lands_to_tap:
		RulesEngine.execute_action(Action.make_activate_ability(land.instance_id))
	# Confirm we can actually pay after the taps.
	var s: EngineState = RulesEngine.state()
	var found = s.find_instance(spell_iid)
	if found == null or found.card == null:
		_log_local("[color=#ff8888]Cast failed: card no longer in hand.[/color]")
		return false
	var card: CardInstance = found.card
	if not found.controller.mana.can_pay(card.template.mana_cost):
		_log_local("[color=#ff8888]Auto-tap completed but can't pay %s for %s.[/color]" % [
			_fmt_cost(card.template.mana_cost), card.name(),
		])
		return false
	var action := Action.make_cast_spell(spell_iid, targets)
	if RulesEngine.execute_action(action):
		return true
	_log_local("[color=#ff8888]Cast rejected for %s — %s[/color]" % [card.name(), _diagnose_cast_failure(card, s)])
	return false


# Hand cards don't go through CardContainer.on_card_pressed cleanly because
# Hand's drag system intercepts. We hook gui_input on each spawned hand card.
# Phase 5c UI polish: this handler logs every reason it bails, so when a
# click "does nothing" the player can see why in the log.
func _on_hand_card_gui_input(event: InputEvent, visual: Card) -> void:
	if not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return
	var iid: int = visual.card_info.get("instance_id", -1)
	if iid == -1:
		return
	# If we're already in spell-targeting mode, this 2nd click is ignored.
	# Log so the player knows targeting is pending (most likely cause of
	# "nothing happens when I click").
	if _pending_cast_iid != -1:
		_log_local("[color=#888]Already picking a target — click a creature/player, or press Cancel.[/color]")
		return
	# If we're awaiting a trigger target, hand clicks are also ignored.
	if _picking_trigger_target:
		_log_local("[color=#888]Pick a target for the pending trigger first.[/color]")
		return
	# Look up the card instance
	var s: EngineState = RulesEngine.state()
	var found = s.find_instance(iid)
	if found == null:
		_log_local("[color=#ff8888]Click on stale card visual (iid %d not found in state).[/color]" % iid)
		return
	if found.zone_name != "hand":
		_log_local("[color=#ff8888]Clicked card is in %s, not hand — ignoring.[/color]" % found.zone_name)
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

	# Defender's COMBAT_BLOCK: must commit blocks before casting spells.
	# Engine now enforces this via priority_player_key = "" while awaiting,
	# but we keep a friendly log message so the player knows why their click
	# didn't enter targeting mode.
	if _is_awaiting_blocks():
		_log_local("[color=#ffd866]Confirm blocks before casting spells.[/color]")
		return

	# Phase 5c UI polish (per playtest #1): check phase/priority/stack
	# legality BEFORE attempting auto-tap. Otherwise clicking a sorcery
	# during your upkeep would tap lands needlessly before bailing.
	var ctrl: Player = found.controller
	var reason: String = _diagnose_cast_failure(card, s)
	if reason != "":
		_log_local("[color=#ff8888]Can't cast %s — %s[/color]" % [card.name(), reason])
		return

	# Phase 5c UI polish (per playtest #1): plan auto-tap but defer the
	# actual tap to the moment the cast commits. For targeted spells this
	# means we don't tap lands until the player picks a target.
	var lands_to_tap: Array = []
	if not ctrl.mana.can_pay(card.template.mana_cost):
		lands_to_tap = _plan_lands_to_tap(ctrl, card.template.mana_cost)
		if lands_to_tap.is_empty():
			_log_local("[color=#ff8888]Can't pay %s for %s — pool is %s, not enough untapped lands[/color]" % [
				_fmt_cost(card.template.mana_cost),
				card.name(),
				ctrl.mana.to_string_short(),
			])
			return

	# Targeted spells enter targeting mode (now including "spell" filter
	# which routes clicks through the clickable stack panel — see #6).
	# Untargeted ones tap + cast atomically right here.
	if card.template is SpellResource and card.template.requires_target:
		# Filter "spell" still needs SOMETHING on the stack to target —
		# bail early with a clear message if the stack is empty.
		if card.template.target_filter == "spell" and s.stack.is_empty():
			_log_local("[color=#ff8888]Can't cast %s: no spell on the stack to target.[/color]" % card.name())
			return
		# Defer auto-tap: stash the plan and enter targeting mode. Lands
		# stay untapped until the target is picked or the player cancels
		# (in which case the plan is discarded).
		_pending_cast_tap_plan = lands_to_tap
		_enter_targeting_mode(iid, card.template.target_filter)
	else:
		# Untargeted spell — commit the auto-tap now and cast.
		_commit_taps_and_cast(iid, [], lands_to_tap)


# Phase 5c UI polish: returns true if the player could cast this hand card
# right now, given that auto-tap would handle mana. Mirrors the cast-time
# logic in _on_hand_card_gui_input. Lands are not "casts" — they're played
# directly; play_land legality already shows up in get_legal_actions.
func _can_potentially_cast(card: CardInstance, s: EngineState) -> bool:
	if card.is_land():
		return false  # lands go through play_land, not cast
	if not (card.template is SpellResource or card.template is CreatureResource):
		return false
	# Phase / priority / stack check (same as _diagnose_cast_failure but
	# returns bool instead of a reason string).
	if s.priority_player_key != "you":
		return false
	if not card.template.has_type("instant"):
		if s.active_player_key != "you":
			return false
		if not s.phase_machine.is_main_phase():
			return false
		if not s.stack.is_empty():
			return false
	# Defender's COMBAT_BLOCK pre-commit blocks all casts. (Engine enforces
	# this too by closing priority during the awaiting window; the glow
	# check just mirrors the rule so we don't tease castable cards.)
	if _is_awaiting_blocks():
		return false
	# Target filter: spells that need targets require at least one legal
	# target to exist. "spell" filter requires something on the stack.
	if card.template is SpellResource and card.template.requires_target:
		var filter: String = card.template.target_filter
		if filter == "spell":
			if s.stack.is_empty():
				return false
		# Other filters: we don't pre-validate target existence (a creature
		# might exist by cast time; player gets the glow as a hint that the
		# spell is otherwise legal).
	# Mana: current pool can pay OR auto-tap plan covers it.
	if s.you.mana.can_pay(card.template.mana_cost):
		return true
	return not _plan_lands_to_tap(s.you, card.template.mana_cost).is_empty()


# Phase 5c UI polish: plan a set of untapped lands to tap to cover `cost`,
# accounting for mana already in the pool. Returns the list of lands (in
# tap order) or an empty Array if the cost can't be paid even with full
# tap-out.
#
# Algorithm: colored pips first (each requires a land producing that
# color), then generic pips (any remaining untapped land). Greedy —
# doesn't backtrack. Works correctly for single-color basic lands; will
# need extension when multi-color lands enter the pool (e.g., dual lands,
# City of Brass).
func _plan_lands_to_tap(controller: Player, cost: Dictionary) -> Array:
	# Pool already has some mana — only need to make up the difference.
	var still_needed: Dictionary = {}
	for color in ["W", "U", "B", "R", "G", "C"]:
		var c: int = int(cost.get(color, 0)) - int(controller.mana.pool.get(color, 0))
		still_needed[color] = max(0, c)
	# Available untapped lands.
	var available: Array = []
	for card in controller.battlefield:
		if card.tapped:
			continue
		if card.template == null or not (card.template is LandResource):
			continue
		if card.summoning_sick:  # haste etc — but lands don't get sickness; defensive
			continue
		available.append(card)
	var planned: Array = []
	# Pass 1: colored requirements. For each color we still need, find a
	# land producing that color.
	for color in ["W", "U", "B", "R", "G"]:
		var count: int = still_needed.get(color, 0)
		for i in range(count):
			var land: CardInstance = _find_land_producing(available, color)
			if land == null:
				return []  # Can't satisfy this color
			planned.append(land)
			available.erase(land)
	# Pass 2: generic. Any remaining untapped land works. Mana in pool of
	# any color can also pay generic, so let can_pay decide after taps.
	var generic_needed: int = still_needed.get("C", 0)
	# Generic can be paid by extra colored mana already in pool too —
	# count how much surplus we have after colored requirements.
	var surplus_in_pool: int = 0
	for color in ["W", "U", "B", "R", "G"]:
		surplus_in_pool += max(0, int(controller.mana.pool.get(color, 0)) - int(cost.get(color, 0)))
	generic_needed = max(0, generic_needed - surplus_in_pool)
	for i in range(generic_needed):
		if available.is_empty():
			return []
		planned.append(available.pop_front())
	return planned


# Find an untapped land in `available` that produces `color`, or null.
func _find_land_producing(available: Array, color: String) -> CardInstance:
	for land in available:
		if land.template is LandResource and color in land.template.mana_produced:
			return land
	return null


# Phase 5c UI polish: pick the "top of stack" spell entry to target with
# Counterspell. Prefers opponent's spells (the usual counter target);
# falls back to top-of-stack regardless of controller if there's no opp
# spell on the stack (unlikely but handles "counter your own spell" cases
# like saving stack-slot for the opp). Returns a {kind: "stack", iid}
# target dict or {} if no spell entries exist.
func _top_targetable_spell(s: EngineState, caster_key: String) -> Dictionary:
	# Walk stack top-to-bottom, prefer opp's spells first.
	var entries: Array = s.stack.entries
	for i in range(entries.size() - 1, -1, -1):
		var e: Dictionary = entries[i]
		if e.get("kind", "") == "spell" and e.get("controller_key", "") != caster_key:
			return {"kind": "stack", "iid": int(e.source_iid)}
	# No opp spell — fall back to any spell on stack.
	for i in range(entries.size() - 1, -1, -1):
		var e: Dictionary = entries[i]
		if e.get("kind", "") == "spell":
			return {"kind": "stack", "iid": int(e.source_iid)}
	return {}


# Phase 5c UI polish: when a cast is rejected by is_legal_action, produce a
# specific reason string so the player isn't left guessing.
func _diagnose_cast_failure(card: CardInstance, s: EngineState) -> String:
	if s.winner != "":
		return "game is over"
	if not card.template.has_type("instant"):
		if s.active_player_key != "you":
			return "sorcery-speed only on your turn"
		if not s.phase_machine.is_main_phase():
			return "sorcery-speed only in your main phase"
		if not s.stack.is_empty():
			return "sorcery-speed requires an empty stack"
	if s.priority_player_key != "you":
		return "you don't have priority right now"
	# All timing/legality checks passed — empty string means "castable
	# right now if you can pay the mana." Callers can then proceed to
	# auto-tap and cast.
	return ""


func _on_panel_clicked(panel_key: String) -> void:
	# Phase 4.5b: trigger target picker takes precedence over spell-cast targeting.
	if _picking_trigger_target:
		var s: EngineState = RulesEngine.state()
		var filter: String = s.awaiting_target_for_trigger.get("filter", "")
		# Player targets are legal under creature_or_player and player filters.
		if filter == "creature_or_player" or filter == "player":
			var action := Action.make_pick_trigger_target(Action.target_player(panel_key))
			if RulesEngine.execute_action(action):
				_log_local("[color=#88dd88]Trigger targets %s[/color]" % panel_key)
		return
	if _pending_cast_iid == -1:
		return
	# Player targets are only valid for "any" or "player" filters.
	if _pending_target_filter != "any" and _pending_target_filter != "player":
		return
	_execute_pending_cast_with_target(Action.target_player(panel_key))


func _on_pass_pressed() -> void:
	# Cancel targeting if active. Phase 5c UI polish (per playtest #1):
	# discard the deferred auto-tap plan so the player's lands stay
	# untapped when they bail on a cast.
	if _pending_cast_iid != -1:
		_pending_cast_iid = -1
		_pending_target_filter = ""
		_pending_cast_tap_plan = []
		_exit_targeting_mode()
		_log_local("[color=#888]Cancelled targeting (lands stayed untapped)[/color]")
		return
	# Cancel block-selection if active
	if _pending_block_blocker_iid != -1:
		_pending_block_blocker_iid = -1
		_log_local("[color=#888]Cancelled block selection[/color]")
		_refresh_ui()
		return
	# Defender's COMBAT_BLOCK: first press commits blocks (CONFIRM_BLOCKS
	# engine action — clears state.awaiting_block_declaration, opens APNAP
	# priority window). Second press passes priority. This preserves the
	# MTG structure where blocks are declared atomically before any cast
	# window opens.
	if _is_awaiting_blocks():
		RulesEngine.execute_action(Action.make_confirm_blocks())
		_log_local("[color=#88ddff]Blocks committed. Cast spells or pass priority to advance.[/color]")
		return
	RulesEngine.execute_action(Action.make_pass_priority())


# ─── Targeting mode ────────────────────────────────────────────────────────

func _enter_targeting_mode(spell_iid: int, target_filter: String) -> void:
	_pending_cast_iid = spell_iid
	_pending_target_filter = target_filter
	# Mark player panels clickable if filter allows player targets.
	# (Creature targets are handled via battlefield click handlers; no extra
	# highlight in Phase 3 — player just clicks a creature on either side.)
	var allows_player := (target_filter == "any" or target_filter == "player")
	_you_panel.is_clickable = allows_player
	_opp_panel.is_clickable = allows_player
	_action_button.text = "Cancel target"
	_log_local("[color=#ffd866]Pick a target...[/color]")
	# Phase 5c UI polish (per playtest #2): refresh UI so the legality
	# glow swaps from "castable cards" to "legal targets" immediately.
	# Without this, the glow stayed in its previous state until the next
	# engine state_changed signal — which wouldn't fire just from
	# entering targeting mode.
	_refresh_ui()


func _exit_targeting_mode() -> void:
	_you_panel.is_clickable = false
	_opp_panel.is_clickable = false
	_action_button.text = "Pass priority"
	# Refresh so the legality glow returns to "castable cards" state.
	_refresh_ui()


# ─── Trigger target picker (Phase 4.5b) ────────────────────────────────────

func _enter_trigger_target_mode(meta: Dictionary) -> void:
	# Both panels become clickable for filters that allow player targets.
	var filter: String = meta.get("filter", "")
	var allows_player := (filter == "creature_or_player" or filter == "player")
	_you_panel.is_clickable = allows_player
	_opp_panel.is_clickable = allows_player
	# Find the source card's name for the prompt.
	var iid: int = meta.get("source_iid", -1)
	var source_name := "?"
	if _iid_to_visual.has(iid):
		source_name = str(_iid_to_visual[iid].card_info.get("display_name", "?"))
	_log_local("[color=#ffd866]Pick a target for %s's ability…[/color]" % source_name)


func _exit_trigger_target_mode() -> void:
	_you_panel.is_clickable = false
	_opp_panel.is_clickable = false


# Try to use the clicked creature as the trigger target. Filter-aware: a
# creature is legal under creature_or_player or creature filters.
func _try_pick_creature_as_trigger_target(iid: int) -> void:
	var s: EngineState = RulesEngine.state()
	var filter: String = s.awaiting_target_for_trigger.get("filter", "")
	if filter != "creature_or_player" and filter != "creature":
		return
	var found = s.find_instance(iid)
	if found == null or found.card == null:
		return
	if found.zone_name != "battlefield":
		return
	if not (found.card.template is CreatureResource):
		return
	var action := Action.make_pick_trigger_target({"kind": "creature", "iid": iid})
	if RulesEngine.execute_action(action):
		_log_local("[color=#88dd88]Trigger targets %s[/color]" % found.card.name())


# ─── Global keybinds (Phase 5c UI polish) ──────────────────────────────────
# Routes Enter/Space to the action button (typically "Pass priority") and
# Escape to "cancel targeting / cancel block" so the player isn't stuck
# hunting for the cancel button. Triggers the same code path as clicking
# the button or pressing the right widget — no duplicated logic.
func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	if not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			_on_pass_pressed()
			get_viewport().set_input_as_handled()
		KEY_ESCAPE:
			# Cancel spell-targeting or block-selection. (Trigger-target
			# picks can't be cancelled — the trigger is on the queue and
			# must resolve with some target.)
			if _pending_cast_iid != -1 or _pending_block_blocker_iid != -1:
				_on_pass_pressed()
				get_viewport().set_input_as_handled()


# ─── Misc helpers ──────────────────────────────────────────────────────────

func _on_log_appended(line: String) -> void:
	_log_local(line)


func _on_game_over(winner_key: String) -> void:
	_log_local("[color=#ffd700][b]GAME OVER — %s wins[/b][/color]" % winner_key)
	_action_button.disabled = true


func _log_local(line: String) -> void:
	_log_display.append_text(line + "\n")


# MTG mana notation: colored mana repeats letters ("RR" = 2 reds), generic
# uses a leading number ("1R" = 1 generic + 1 red, NEVER "one red").
# See engine/mana_pool.gd to_string_short for the canonical implementation.
func _fmt_cost(cost: Dictionary) -> String:
	if cost.is_empty():
		return "(free)"
	var s := ""
	if cost.get("C", 0) > 0:
		s += str(cost["C"])
	for color in ["W", "U", "B", "R", "G"]:
		for i in range(cost.get(color, 0)):
			s += color
	return s if s != "" else "(free)"
