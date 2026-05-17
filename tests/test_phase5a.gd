extends Node

# Phase 5a smoke test. One scenario per keyword:
#   - Defender: can't attack
#   - Haste: can attack the turn it enters (no summoning sickness gate)
#   - Vigilance: attacker doesn't tap
#   - Flying: only flying or reach may block
#   - Reach: can block flyer
#   - Unblockable: no blockers legal
#   - First strike: deals damage in pass 1, kills before retaliation
#   - Lifelink: controller gains life equal to damage dealt
#   - Deathtouch: any damage = lethal
#   - Trample: excess damage spills to face
#   - Indestructible: SBA ignores lethal damage
#   - Hexproof: opp can't target with spells
#
# Most scenarios bypass _resolve_combat_damage's full phase-cycle and call it
# directly after setting up state.attackers and state.blockers. That keeps
# the test focused on damage-rule correctness rather than priority dance.

var failures: int = 0


func _ready() -> void:
	print("\n=== Phase 5a smoke test ===\n")

	_test_defender_cant_attack()
	_test_haste_bypasses_sickness()
	_test_vigilance_doesnt_tap()
	_test_flying_blocking()
	_test_reach_blocks_flyer()
	_test_unblockable()
	_test_first_strike()
	_test_lifelink()
	_test_deathtouch()
	_test_trample()
	_test_indestructible()
	_test_hexproof()

	# Final report
	print("")
	if failures == 0:
		print("=== Phase 5a smoke test: ALL ASSERTIONS PASSED ✓ ===\n")
	else:
		print("=== Phase 5a smoke test: %d FAILURE(S) ✗ ===\n" % failures)
	get_tree().quit(0 if failures == 0 else 1)


# ─── Per-keyword scenarios ────────────────────────────────────────────────

func _test_defender_cant_attack() -> void:
	var s := _fresh_state()
	var wall := _put_creature(s, "you", "walking_wall")
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_ATTACK
	var action := Action.make_declare_attacker(wall.instance_id)
	var ok = RulesEngine.is_legal_action(action)
	_assert_true(not ok, "defender: Walking Wall can't attack")


func _test_haste_bypasses_sickness() -> void:
	var s := _fresh_state()
	# Place Raging Goblin on battlefield WITHOUT clearing summoning_sick.
	# A non-haste creature would be locked out.
	var rg := s.make_instance(CardDatabase.get_card("raging_goblin"), "you")
	rg.summoning_sick = true  # just entered this turn
	s.you.battlefield.append(rg)
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_ATTACK
	var action := Action.make_declare_attacker(rg.instance_id)
	_assert_true(RulesEngine.is_legal_action(action), "haste: Raging Goblin can attack with summoning sickness")
	# Sanity: same setup but no haste — Bear Cub should fail.
	var s2 := _fresh_state()
	var bc := s2.make_instance(CardDatabase.get_card("bear_cub"), "you")
	bc.summoning_sick = true
	s2.you.battlefield.append(bc)
	s2.phase_machine.current = PhaseMachine.Phase.COMBAT_ATTACK
	var action2 := Action.make_declare_attacker(bc.instance_id)
	_assert_true(not RulesEngine.is_legal_action(action2), "no haste: Bear Cub locked by summoning sickness")


func _test_vigilance_doesnt_tap() -> void:
	var s := _fresh_state()
	var angel := _put_creature(s, "you", "serra_angel")
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_ATTACK
	RulesEngine.execute_action(Action.make_declare_attacker(angel.instance_id))
	_assert_eq(angel.tapped, false, "vigilance: Serra Angel didn't tap after attacking")
	_assert_true(angel.instance_id in s.attackers, "Serra Angel is attacking")


func _test_flying_blocking() -> void:
	var s := _fresh_state()
	var drake := _put_creature(s, "you", "wind_drake")
	var ogre := _put_creature(s, "opp", "gray_ogre")
	s.attackers.append(drake.instance_id)
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_BLOCK
	# Ground Gray Ogre can't block Wind Drake (which has flying).
	var bad := Action.make_declare_blocker(ogre.instance_id, drake.instance_id)
	_assert_true(not RulesEngine.is_legal_action(bad), "flying: Gray Ogre can't block Wind Drake")


func _test_reach_blocks_flyer() -> void:
	var s := _fresh_state()
	var drake := _put_creature(s, "you", "wind_drake")
	var spider := _put_creature(s, "opp", "giant_spider")
	s.attackers.append(drake.instance_id)
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_BLOCK
	var good := Action.make_declare_blocker(spider.instance_id, drake.instance_id)
	_assert_true(RulesEngine.is_legal_action(good), "reach: Giant Spider blocks Wind Drake")


func _test_unblockable() -> void:
	# We don't have an unblockable card yet — synthesize one by granting the
	# keyword at runtime via granted_keywords. Exercises the runtime-grant
	# path that stickers (Phase 7) will use.
	var s := _fresh_state()
	var ogre := _put_creature(s, "you", "gray_ogre")
	ogre.granted_keywords.append("unblockable")
	var bear := _put_creature(s, "opp", "grizzly_bears")
	s.attackers.append(ogre.instance_id)
	s.phase_machine.current = PhaseMachine.Phase.COMBAT_BLOCK
	var bad := Action.make_declare_blocker(bear.instance_id, ogre.instance_id)
	_assert_true(not RulesEngine.is_legal_action(bad), "unblockable: nothing can block")


func _test_first_strike() -> void:
	# Synthesize first_strike on a 2/2: it should kill the unbuffed 2/2 in
	# pass 1 before taking damage.
	var s := _fresh_state()
	var atk := _put_creature(s, "you", "grizzly_bears")
	atk.granted_keywords.append("first_strike")
	var blk := _put_creature(s, "opp", "grizzly_bears")
	s.attackers.append(atk.instance_id)
	s.blockers[blk.instance_id] = atk.instance_id
	RulesEngine._resolve_combat_damage()
	# Blocker should be in opp's graveyard; attacker still alive on battlefield.
	_assert_true(_in_zone(s, atk, "battlefield"), "first_strike: attacker survived")
	_assert_true(_in_zone(s, blk, "graveyard"), "first_strike: blocker died before retaliating")


func _test_lifelink() -> void:
	var s := _fresh_state()
	var nighthawk := _put_creature(s, "you", "vampire_nighthawk")
	# Unblocked attack — 2 face damage, +2 life from lifelink.
	var pre_life: int = s.you.life
	s.attackers.append(nighthawk.instance_id)
	RulesEngine._resolve_combat_damage()
	_assert_eq(s.you.life, pre_life + 2, "lifelink: you gained 2 life")
	_assert_eq(s.opp.life, 18, "lifelink: opp took 2 face damage")


func _test_deathtouch() -> void:
	# Deathtouch 1/1 hits a 4/4 — the 4/4 should die from the 1 damage.
	var s := _fresh_state()
	var nighthawk := _put_creature(s, "you", "vampire_nighthawk")  # 2/3 with deathtouch
	# Give opp a Hill Giant (3/3 vanilla) to chump-block with.
	var giant := _put_creature(s, "opp", "hill_giant")
	s.attackers.append(nighthawk.instance_id)
	s.blockers[giant.instance_id] = nighthawk.instance_id
	RulesEngine._resolve_combat_damage()
	# Giant takes 2 from nighthawk's power but deathtouch flags it lethal anyway.
	# Nighthawk takes 3 from Giant; toughness 3 = also dies (no margin from lifelink in 1v1).
	_assert_true(_in_zone(s, giant, "graveyard"), "deathtouch: Giant died from nighthawk's hit")


func _test_trample() -> void:
	# Trampling 3/3 into 1/1 chump blocker — 2 damage spills to face.
	var s := _fresh_state()
	var armodon := _put_creature(s, "you", "trained_armodon")  # 3/3 trample
	var cub := _put_creature(s, "opp", "bear_cub")  # 1/1
	s.attackers.append(armodon.instance_id)
	s.blockers[cub.instance_id] = armodon.instance_id
	RulesEngine._resolve_combat_damage()
	_assert_true(_in_zone(s, cub, "graveyard"), "trample: chump blocker died")
	_assert_eq(s.opp.life, 18, "trample: 2 damage spilled to face (20 → 18)")


func _test_indestructible() -> void:
	# Synthesize indestructible on a 2/2 — it should survive lethal damage.
	var s := _fresh_state()
	var bear := _put_creature(s, "you", "grizzly_bears")
	bear.granted_keywords.append("indestructible")
	bear.damage_marked = 10  # would kill any normal creature
	RulesEngine._run_sbas()
	_assert_true(_in_zone(s, bear, "battlefield"), "indestructible: survived 10 marked damage")


func _test_hexproof() -> void:
	# Synthesize hexproof on opp's Bear — your Bolt can't target it.
	var s := _fresh_state()
	# You: Mountain + Bolt.
	var mtn := _put_land(s, "you", "mountain")
	var bolt := s.make_instance(CardDatabase.get_card("lightning_bolt"), "you")
	s.you.hand.append(bolt)
	# Opp: Bear with hexproof.
	var bear := _put_creature(s, "opp", "grizzly_bears")
	bear.granted_keywords.append("hexproof")
	# Tap Mountain for R.
	RulesEngine.execute_action(Action.make_activate_ability(mtn.instance_id))
	# Try to cast Bolt at the hexproof Bear — should be illegal.
	var cast := Action.make_cast_spell(
		bolt.instance_id,
		[{"kind": "creature", "iid": bear.instance_id}]
	)
	_assert_true(not RulesEngine.is_legal_action(cast), "hexproof: opp's Bear can't be targeted by your Bolt")
	# Sanity: your own creature with hexproof CAN be targeted by your Bolt
	# (hexproof only blocks opponents).
	var your_bear := _put_creature(s, "you", "grizzly_bears")
	your_bear.granted_keywords.append("hexproof")
	var cast2 := Action.make_cast_spell(
		bolt.instance_id,
		[{"kind": "creature", "iid": your_bear.instance_id}]
	)
	_assert_true(RulesEngine.is_legal_action(cast2), "hexproof: your own bear targetable by your Bolt")


# ─── Helpers ───────────────────────────────────────────────────────────────

func _fresh_state() -> EngineState:
	RulesEngine.init_phase1()
	var s: EngineState = RulesEngine.state()
	# Wipe to a clean slate — we'll inject state manually per test.
	s.you.hand.clear()
	s.you.battlefield.clear()
	s.you.library.clear()
	s.you.graveyard.clear()
	s.opp.hand.clear()
	s.opp.battlefield.clear()
	s.opp.library.clear()
	s.opp.graveyard.clear()
	s.attackers.clear()
	s.blockers.clear()
	s.you.life = 20
	s.opp.life = 20
	s.you.mana = ManaPool.new()
	s.opp.mana = ManaPool.new()
	return s


func _put_creature(s: EngineState, key: String, card_id: String) -> CardInstance:
	var inst := s.make_instance(CardDatabase.get_card(card_id), key)
	inst.summoning_sick = false
	s.player_by_key(key).battlefield.append(inst)
	return inst


func _put_land(s: EngineState, key: String, card_id: String) -> CardInstance:
	var inst := s.make_instance(CardDatabase.get_card(card_id), key)
	inst.summoning_sick = false
	s.player_by_key(key).battlefield.append(inst)
	return inst


func _in_zone(s: EngineState, card: CardInstance, zone: String) -> bool:
	var p: Player = s.player_by_key(card.owner_key)
	match zone:
		"battlefield": return card in p.battlefield
		"graveyard":   return card in p.graveyard
		"hand":        return card in p.hand
		_: return false


func _assert_eq(actual, expected, name: String) -> void:
	if actual == expected:
		print("  ✓ %s = %s" % [name, str(actual)])
	else:
		print("  ✗ %s: expected %s, got %s" % [name, str(expected), str(actual)])
		failures += 1


func _assert_true(condition: bool, name: String) -> void:
	if condition:
		print("  ✓ %s" % name)
	else:
		print("  ✗ %s (expected true)" % name)
		failures += 1
