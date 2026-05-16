class_name CardDatabase
extends RefCounted

# Programmatic card definitions for Phase 1.
#
# Long-term, each card will be a .tres Resource file under cards/templates/
# authored in the Godot editor. For Phase 1 (just 2 cards), defining them in
# code is faster and avoids hand-writing .tres syntax. The migration to .tres
# files is a Phase 2+ task — call sites use get(card_id) regardless of where
# the data comes from.


# Returns a CardResource for the given card_id, or null if unknown.
static func get_card(card_id: String) -> CardResource:
	match card_id:
		"mountain":
			return _make_mountain()
		"forest":
			return _make_forest()
		"plains":
			return _make_plains()
		"island":
			return _make_island()
		"swamp":
			return _make_swamp()
		"lightning_bolt":
			return _make_lightning_bolt()
		"goblin_raider":
			return _make_goblin_raider()
		"grizzly_bears":
			return _make_grizzly_bears()
		"giant_growth":
			return _make_giant_growth()
		"pyromaniac":
			return _make_pyromaniac()
		"bloodlust_berserker":
			return _make_bloodlust_berserker()
		"bear_cub":
			return _make_bear_cub()
		"gray_ogre":
			return _make_gray_ogre()
		"hill_giant":
			return _make_hill_giant()
		"healing_salve":
			return _make_healing_salve()
		"counterspell":
			return _make_counterspell()
		"wind_drake":
			return _make_wind_drake()
		"giant_spider":
			return _make_giant_spider()
		"serra_angel":
			return _make_serra_angel()
		"trained_armodon":
			return _make_trained_armodon()
		"vampire_nighthawk":
			return _make_vampire_nighthawk()
		"raging_goblin":
			return _make_raging_goblin()
		"walking_wall":
			return _make_walking_wall()
		_:
			push_error("CardDatabase: unknown card_id '%s'" % card_id)
			return null


# Returns all known card_ids. Used by Engine boot-time predicate validation.
static func all_card_ids() -> Array[String]:
	return [
		"mountain", "forest", "plains", "island", "swamp",
		"lightning_bolt", "goblin_raider",
		"grizzly_bears", "giant_growth",
		"pyromaniac", "bloodlust_berserker",
		"bear_cub", "gray_ogre", "hill_giant",
		"healing_salve", "counterspell",
		"wind_drake", "giant_spider", "serra_angel", "trained_armodon",
		"vampire_nighthawk", "raging_goblin", "walking_wall",
	]


# Returns all card resources. Used by Engine boot-time predicate validation.
static func all_resources() -> Array:
	var arr: Array = []
	for cid in all_card_ids():
		arr.append(get_card(cid))
	return arr


# ─────────────────────────────────────────────────────────────────────────────
# Card definitions. Keep these terse — most cards are just data; only the
# shape of the on_cast / activated / triggered ability arrays carries logic.

static func _make_mountain() -> LandResource:
	var r := LandResource.new()
	r.card_id = "mountain"
	r.display_name = "Mountain"
	r.card_types = ["land"]
	r.subtypes = ["mountain"]
	r.mana_cost = {}  # Lands cost no mana
	r.oracle_text = "{T}: Add {R}."
	r.mana_produced = ["R"]
	# The tap ability is constructed automatically by Engine from mana_produced;
	# no need to populate activated_abilities by hand.
	return r


static func _make_lightning_bolt() -> SpellResource:
	var r := SpellResource.new()
	r.card_id = "lightning_bolt"
	r.display_name = "Lightning Bolt"
	r.card_types = ["instant"]
	r.subtypes = []
	r.mana_cost = {"R": 1}
	r.oracle_text = "Lightning Bolt deals 3 damage to any target."
	r.requires_target = true
	r.target_filter = "any"
	r.on_cast_effects = [
		{"kind": "damage", "amount": 3, "target": "chosen"},
	]
	return r


static func _make_goblin_raider() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "goblin_raider"
	r.display_name = "Goblin Raider"
	r.card_types = ["creature"]
	r.subtypes = ["goblin"]
	r.mana_cost = {"R": 1}
	r.oracle_text = "A vanilla 2/1 — no abilities."
	r.power = 2
	r.toughness = 1
	r.keywords = []
	# No on_cast_effects — when a creature spell resolves, the engine puts it
	# on the battlefield (its "effect" is becoming a permanent). Phase 2 will
	# handle this via a special-case in stack resolution, not via an effect kind.
	return r


static func _make_forest() -> LandResource:
	var r := LandResource.new()
	r.card_id = "forest"
	r.display_name = "Forest"
	r.card_types = ["land"]
	r.subtypes = ["forest"]
	r.mana_cost = {}
	r.oracle_text = "{T}: Add {G}."
	r.mana_produced = ["G"]
	return r


static func _make_grizzly_bears() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "grizzly_bears"
	r.display_name = "Grizzly Bears"
	r.card_types = ["creature"]
	r.subtypes = ["bear"]
	r.mana_cost = {"G": 1, "C": 1}
	r.oracle_text = "A vanilla 2/2 — no abilities."
	r.power = 2
	r.toughness = 2
	r.keywords = []
	return r


static func _make_giant_growth() -> SpellResource:
	var r := SpellResource.new()
	r.card_id = "giant_growth"
	r.display_name = "Giant Growth"
	r.card_types = ["instant"]
	r.subtypes = []
	r.mana_cost = {"G": 1}
	r.oracle_text = "Target creature gets +3/+3 until end of turn."
	r.requires_target = true
	r.target_filter = "creature"
	r.on_cast_effects = [
		{"kind": "pump", "amount_power": 3, "amount_toughness": 3, "target": "chosen", "duration": "eot"},
	]
	return r


# Phase 4: ETB trigger. When Pyromaniac enters the battlefield, deals 1
# damage to any target. Phase 4.5b made this fully interactive — the
# controller picks the target via KIND_PICK_TRIGGER_TARGET (opp's auto-AI
# picks the opponent player by default).
static func _make_pyromaniac() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "pyromaniac"
	r.display_name = "Pyromaniac"
	r.card_types = ["creature"]
	r.subtypes = ["human", "shaman"]
	r.mana_cost = {"R": 1, "C": 1}
	r.oracle_text = "When Pyromaniac enters, it deals 1 damage to any target."
	r.power = 1
	r.toughness = 1
	r.keywords = []
	r.triggered_abilities = [
		{
			"event": "card_etb",
			"self_only": true,                       # only fires for this creature's own ETB
			"condition_predicate": "",               # unconditional
			"target_filter": "creature_or_player",   # any target
			"effects": [
				{"kind": "damage", "amount": 1, "target": "chosen"},
			],
		},
	]
	return r


# Phase 4: death trigger with predicate. When Bloodlust Berserker dies, if the
# opponent has lost life this turn, deal 2 damage to the opponent. Exercises
# the predicate registry — the trigger is queued unconditionally, then the
# predicate is checked at queue time (and again at resolve time per MTG's
# "intervening if" rule, though Phase 4 only checks once at queue time).
static func _make_bloodlust_berserker() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "bloodlust_berserker"
	r.display_name = "Bloodlust Berserker"
	r.card_types = ["creature"]
	r.subtypes = ["human", "warrior"]
	r.mana_cost = {"R": 2, "C": 1}
	r.oracle_text = "When Bloodlust Berserker dies, if the opponent lost life this turn, it deals 2 damage to the opponent."
	r.power = 3
	r.toughness = 2
	r.keywords = []
	r.triggered_abilities = [
		{
			"event": "card_dies",
			"self_only": true,
			"condition_predicate": "opp_lost_life_this_turn",
			"effects": [
				{"kind": "damage", "amount": 2, "target": "opponent"},
			],
		},
	]
	return r


# ─── Phase 4.5c: basic lands across remaining colors ──────────────────────

static func _make_plains() -> LandResource:
	var r := LandResource.new()
	r.card_id = "plains"
	r.display_name = "Plains"
	r.card_types = ["land"]
	r.subtypes = ["plains"]
	r.mana_cost = {}
	r.oracle_text = "{T}: Add {W}."
	r.mana_produced = ["W"]
	return r


static func _make_island() -> LandResource:
	var r := LandResource.new()
	r.card_id = "island"
	r.display_name = "Island"
	r.card_types = ["land"]
	r.subtypes = ["island"]
	r.mana_cost = {}
	r.oracle_text = "{T}: Add {U}."
	r.mana_produced = ["U"]
	return r


static func _make_swamp() -> LandResource:
	var r := LandResource.new()
	r.card_id = "swamp"
	r.display_name = "Swamp"
	r.card_types = ["land"]
	r.subtypes = ["swamp"]
	r.mana_cost = {}
	r.oracle_text = "{T}: Add {B}."
	r.mana_produced = ["B"]
	return r


# ─── Phase 4.5c: vanilla creature curve fillers ───────────────────────────

static func _make_bear_cub() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "bear_cub"
	r.display_name = "Bear Cub"
	r.card_types = ["creature"]
	r.subtypes = ["bear"]
	r.mana_cost = {"G": 1}
	r.oracle_text = "A vanilla 1/1 — no abilities."
	r.power = 1
	r.toughness = 1
	r.keywords = []
	return r


static func _make_gray_ogre() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "gray_ogre"
	r.display_name = "Gray Ogre"
	r.card_types = ["creature"]
	r.subtypes = ["ogre"]
	r.mana_cost = {"R": 1, "C": 1}
	r.oracle_text = "A vanilla 2/2 — no abilities."
	r.power = 2
	r.toughness = 2
	r.keywords = []
	return r


static func _make_hill_giant() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "hill_giant"
	r.display_name = "Hill Giant"
	r.card_types = ["creature"]
	r.subtypes = ["giant"]
	r.mana_cost = {"R": 1, "C": 2}
	r.oracle_text = "A vanilla 3/3 — no abilities."
	r.power = 3
	r.toughness = 3
	r.keywords = []
	return r


# ─── Phase 4.5c: instants with new effect kinds ───────────────────────────

# Exercises the new gain_life effect handler.
static func _make_healing_salve() -> SpellResource:
	var r := SpellResource.new()
	r.card_id = "healing_salve"
	r.display_name = "Healing Salve"
	r.card_types = ["instant"]
	r.subtypes = []
	r.mana_cost = {"W": 1}
	r.oracle_text = "You gain 3 life."
	r.requires_target = false  # gain_life applies to controller — no chosen target
	r.target_filter = ""
	r.on_cast_effects = [
		{"kind": "gain_life", "amount": 3},
	]
	return r


# Exercises the new counter_spell effect handler. First card whose target is
# a stack entry rather than a creature/player. Validation of the stack target
# is partly deferred to Phase 5b's get_legal_actions — currently the legality
# check only requires that targets be non-empty, and the effect itself
# fizzles cleanly when the target spell is no longer on the stack.
static func _make_counterspell() -> SpellResource:
	var r := SpellResource.new()
	r.card_id = "counterspell"
	r.display_name = "Counterspell"
	r.card_types = ["instant"]
	r.subtypes = []
	r.mana_cost = {"U": 2}
	r.oracle_text = "Counter target spell."
	r.requires_target = true
	r.target_filter = "spell"  # target must be a stack entry of kind "spell"
	r.on_cast_effects = [
		{"kind": "counter_spell", "target": "chosen"},
	]
	return r


# ─── Phase 5a: keyword-bearing creatures ──────────────────────────────────

# Flying — 2/2 evasive flyer for UU.
static func _make_wind_drake() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "wind_drake"
	r.display_name = "Wind Drake"
	r.card_types = ["creature"]
	r.subtypes = ["drake"]
	r.mana_cost = {"U": 1, "C": 1}
	r.oracle_text = "Flying."
	r.power = 2
	r.toughness = 2
	r.keywords = ["flying"]
	return r


# Reach — defensive 2/4 spider that can block flyers.
static func _make_giant_spider() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "giant_spider"
	r.display_name = "Giant Spider"
	r.card_types = ["creature"]
	r.subtypes = ["spider"]
	r.mana_cost = {"G": 1, "C": 2}
	r.oracle_text = "Reach. (This creature can block creatures with flying.)"
	r.power = 2
	r.toughness = 4
	r.keywords = ["reach"]
	return r


# Flying + vigilance — premium aerial defender / attacker, 5cc 4/4.
static func _make_serra_angel() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "serra_angel"
	r.display_name = "Serra Angel"
	r.card_types = ["creature"]
	r.subtypes = ["angel"]
	r.mana_cost = {"W": 2, "C": 3}
	r.oracle_text = "Flying. Vigilance."
	r.power = 4
	r.toughness = 4
	r.keywords = ["flying", "vigilance"]
	return r


# Trample — 3/3 elephant that pushes excess damage through blockers.
static func _make_trained_armodon() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "trained_armodon"
	r.display_name = "Trained Armodon"
	r.card_types = ["creature"]
	r.subtypes = ["elephant"]
	r.mana_cost = {"G": 1, "C": 2}
	r.oracle_text = "Trample."
	r.power = 3
	r.toughness = 3
	r.keywords = ["trample"]
	return r


# Lifelink + deathtouch + flying — vampire that drains AND kills anything it
# touches. Exercises three combat keywords on one source.
static func _make_vampire_nighthawk() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "vampire_nighthawk"
	r.display_name = "Vampire Nighthawk"
	r.card_types = ["creature"]
	r.subtypes = ["vampire", "shaman"]
	r.mana_cost = {"B": 1, "C": 2}
	r.oracle_text = "Flying. Deathtouch. Lifelink."
	r.power = 2
	r.toughness = 3
	r.keywords = ["flying", "deathtouch", "lifelink"]
	return r


# Haste — 1/1 goblin that can attack the turn it enters.
static func _make_raging_goblin() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "raging_goblin"
	r.display_name = "Raging Goblin"
	r.card_types = ["creature"]
	r.subtypes = ["goblin"]
	r.mana_cost = {"R": 1}
	r.oracle_text = "Haste."
	r.power = 1
	r.toughness = 1
	r.keywords = ["haste"]
	return r


# Defender — 0/4 wall that can't attack.
static func _make_walking_wall() -> CreatureResource:
	var r := CreatureResource.new()
	r.card_id = "walking_wall"
	r.display_name = "Walking Wall"
	r.card_types = ["creature"]
	r.subtypes = ["wall"]
	r.mana_cost = {"C": 2}
	r.oracle_text = "Defender. (This creature can't attack.)"
	r.power = 0
	r.toughness = 4
	r.keywords = ["defender"]
	return r
