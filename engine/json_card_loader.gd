class_name JsonCardLoader
extends RefCounted

# Reads html-proto card.json files from res://reference/html-proto/cards/ and
# materializes them as CardResource instances. The wire format is canonical
# snake_case (docs/PROTOCOL.md §2); this loader is the ingest boundary that
# translates JS-isms (camelCase effect/event kinds, "any" target, single-string
# subtypes, "Creature"/"Instant" type strings) into the snake_case shape the
# Godot engine expects.
#
# Two entry points:
#   load_card(folder_id)   — single card by manifest folder name
#   load_all()             — full manifest, returns {card_id: CardResource}
#
# Plus supportability_report(cards) which counts how many cards' effect kinds,
# event kinds, and predicate ids are recognized by this Godot build. The
# engine autoload calls it at boot and prints a one-line summary.
#
# Resource subclass selection by JSON `type` field:
#   "Creature"               → CreatureResource
#   "Land"                   → LandResource
#   "Instant" / "Sorcery"    → SpellResource (requires_target inferred from effects)
#   "Artifact" / "Enchantment" / anything else → base CardResource
#
# Cards whose effects/triggers/predicates aren't implemented yet still LOAD —
# they're just flagged as unsupported in the report. No silent breakage; calling
# CardDatabase.get_json_card() on an unsupported card returns the resource (so
# UI can render it), but trying to cast it should fail legality checks.

const _MANIFEST_PATH := "res://reference/html-proto/cards/_manifest.json"
const _CARDS_DIR := "res://reference/html-proto/cards/"

# camelCase wire → snake_case Godot. Mirrors the JS engine's EFFECTS table
# (js/engine.js ~L1366). Add an entry when a new JS effect kind needs a
# snake_case translation. Single-word kinds (damage, pump, draw, etc.) need
# no entry — they're the same in both cases.
const _EFFECT_KIND_REMAP := {
	"gainLife": "gain_life",
	"addMana": "add_mana",
	"addCounter": "add_counter",
	"removeCreature": "remove_creature",
	"createTokens": "create_tokens",
	"grantKeyword": "grant_keyword",
	"destroyAndStickerSlot": "destroy_and_sticker_slot",
	"bargainStickerSelf": "bargain_sticker_self",
	"bargainStickerOther": "bargain_sticker_other",
	"shuffleIntoLibrary": "shuffle_into_library",
	"returnFromGraveyard": "return_from_graveyard",
	"ripPermanent": "rip_permanent",
	"damageAll": "damage_all",
	"removeAll": "remove_all",
	"gainControl": "gain_control",
	"exileUntilEOT": "exile_until_eot",
	"pumpAllYours": "pump_all_yours",
	"fightTarget": "fight_target",
	"searchLandTapped": "search_land_tapped",
	"searchCreature": "search_creature",
	"endomorphAbsorb": "endomorph_absorb",
	"applyInGameSplice": "apply_in_game_splice",
}

# camelCase event names → snake_case. Mirrors the JS engine's event-firing
# sites. The Godot engine fires `card_enters_battlefield`, `card_dies`, and
# `card_discarded` today; the loader uses this map to translate JSON
# triggers' `event` field.
const _EVENT_KIND_REMAP := {
	"cardEntersBattlefield": "card_enters_battlefield",
	"cardDies": "card_dies",
	"cardLeavesBattlefield": "card_leaves_battlefield",
	"lifeGained": "life_gained",
	"spellCast": "spell_cast",
	"cardDiscarded": "card_discarded",
}

# camelCase keyword → snake_case. Only multi-word keywords need translation.
const _KEYWORD_REMAP := {
	"firstStrike": "first_strike",
}

# JS "target" string values → Godot's target_filter taxonomy. Used to compute
# SpellResource.target_filter from the first targeted effect. The full
# target_mode / target_filter split is Pass 5; today we collapse to a single
# filter string compatible with the existing target-pick UI.
const _TARGET_FILTER_REMAP := {
	"any": "creature_or_player",
	"chosen": "any",  # legacy
}

# Target string values that mean "caster picks at cast time" — used to decide
# whether SpellResource.requires_target is true.
const _USER_PICKED_TARGETS := [
	"chosen", "any", "creature", "player", "spell",
	"opp_creature", "your_creature", "creature_or_player",
	"permanent", "permanentOrSpell", "graveyardCreature",
]

# Event kinds that the Godot engine actually fires today. The supportability
# scan uses this — a card whose trigger listens for an unfired event isn't
# fully playable even though the trigger registry would happily store it.
# Grow this list as the engine learns to fire new events.
const _FIRED_EVENT_KINDS := [
	"card_enters_battlefield",
	"card_dies",
	"card_discarded",
]


static func load_card(folder_id: String) -> CardResource:
	var path: String = _CARDS_DIR + folder_id + "/card.json"
	if not FileAccess.file_exists(path):
		push_error("JsonCardLoader: missing %s" % path)
		return null
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("JsonCardLoader: cannot open %s" % path)
		return null
	var raw: String = f.get_as_text()
	var parsed = JSON.parse_string(raw)
	if parsed == null or not (parsed is Dictionary):
		push_error("JsonCardLoader: invalid JSON in %s" % path)
		return null
	return _build_resource(parsed)


static func load_all() -> Dictionary:
	if not FileAccess.file_exists(_MANIFEST_PATH):
		push_error("JsonCardLoader: missing manifest %s" % _MANIFEST_PATH)
		return {}
	var f: FileAccess = FileAccess.open(_MANIFEST_PATH, FileAccess.READ)
	var manifest = JSON.parse_string(f.get_as_text())
	if not (manifest is Array):
		push_error("JsonCardLoader: invalid manifest (not array)")
		return {}
	var out: Dictionary = {}
	for folder_id in manifest:
		var card = load_card(folder_id)
		if card != null and card.card_id != "":
			out[card.card_id] = card
	return out


# Boot supportability summary — one line on stdout + a returned dict for
# programmatic consumers (tests). `{supported, unsupported, missing_effects,
# missing_events, missing_preds, total}`.
static func supportability_report(cards: Dictionary, print_summary: bool = true) -> Dictionary:
	var supported := 0
	var unsupported := 0
	var missing_effects: Dictionary = {}
	var missing_events: Dictionary = {}
	var missing_preds: Dictionary = {}
	for cid in cards:
		var card: CardResource = cards[cid]
		var card_missing := false
		for eff in card.on_cast_effects:
			if not Effects.HANDLERS.has(eff.get("kind", "")):
				missing_effects[eff.get("kind", "")] = missing_effects.get(eff.get("kind", ""), 0) + 1
				card_missing = true
		for trig in card.triggers:
			var ev: String = trig.get("event", "")
			if ev != "" and not (ev in _FIRED_EVENT_KINDS):
				missing_events[ev] = missing_events.get(ev, 0) + 1
				card_missing = true
			var pred: String = trig.get("cond_id", "")
			if pred != "" and not Predicates._PRED_NAMES.has(pred):
				missing_preds[pred] = missing_preds.get(pred, 0) + 1
				card_missing = true
			for eff in trig.get("effects", []):
				if not Effects.HANDLERS.has(eff.get("kind", "")):
					missing_effects[eff.get("kind", "")] = missing_effects.get(eff.get("kind", ""), 0) + 1
					card_missing = true
		if card_missing:
			unsupported += 1
		else:
			supported += 1
	var report := {
		"supported": supported,
		"unsupported": unsupported,
		"missing_effects": missing_effects,
		"missing_events": missing_events,
		"missing_preds": missing_preds,
		"total": cards.size(),
	}
	if print_summary:
		print("[JsonCardLoader] Loaded %d cards; %d fully supported, %d awaiting handlers"
			% [cards.size(), supported, unsupported])
		if not missing_effects.is_empty():
			print("[JsonCardLoader] Missing effect kinds (count): %s" % _sorted_kv(missing_effects))
		if not missing_events.is_empty():
			print("[JsonCardLoader] Missing event kinds (count): %s" % _sorted_kv(missing_events))
		if not missing_preds.is_empty():
			print("[JsonCardLoader] Missing predicate ids (count): %s" % _sorted_kv(missing_preds))
	return report


# ── Internal ───────────────────────────────────────────────────────────────

static func _build_resource(json: Dictionary) -> CardResource:
	var type_string: String = String(json.get("type", "")).to_lower()
	var card: CardResource
	if type_string == "creature":
		var c := CreatureResource.new()
		c.power = int(json.get("power", 0))
		c.toughness = int(json.get("toughness", 0))
		var kws: Array[String] = []
		for kw in json.get("keywords", []):
			kws.append(_KEYWORD_REMAP.get(kw, kw))
		c.keywords = kws
		card = c
	elif type_string == "land":
		var l := LandResource.new()
		var produced: Array[String] = []
		if json.has("mana"):
			produced.append(String(json["mana"]))
		for extra in json.get("extraManaColors", []):
			if not (extra in produced):
				produced.append(extra)
		l.mana_produced = produced
		card = l
	elif type_string == "instant" or type_string == "sorcery":
		card = SpellResource.new()
	else:
		# artifact, enchantment, or unknown
		card = CardResource.new()

	card.card_id = String(json.get("card_id", ""))
	card.display_name = String(json.get("name", ""))
	card.text = String(json.get("text", ""))
	var cost_raw = json.get("cost", null)
	card.mana_cost = cost_raw if cost_raw is Dictionary else {}
	if type_string != "":
		card.card_types = [type_string]
	var subs: Array[String] = []
	var sub_raw: String = String(json.get("sub", ""))
	if sub_raw != "":
		for w in sub_raw.to_lower().split(" "):
			if w != "":
				subs.append(w)
	card.subtypes = subs

	var effects: Array[Dictionary] = []
	var eff_in = json.get("effects", null)
	if eff_in is Array:
		for e in eff_in:
			effects.append(_remap_effect(e))
	# Modal cards (eff_in is Dictionary with "modes") aren't supported yet —
	# leave on_cast_effects empty so they show as unsupported in the scan.
	card.on_cast_effects = effects

	var triggers: Array[Dictionary] = []
	for t in json.get("triggers", []):
		triggers.append(_remap_trigger(t))
	card.triggers = triggers

	if card is SpellResource:
		var spell: SpellResource = card
		var rt := false
		var tf := ""
		for e in effects:
			var tgt: String = String(e.get("target", ""))
			if tgt in _USER_PICKED_TARGETS:
				rt = true
				tf = _TARGET_FILTER_REMAP.get(tgt, tgt)
				break
		spell.requires_target = rt
		spell.target_filter = tf

	return card


static func _remap_effect(eff: Variant) -> Dictionary:
	if not (eff is Dictionary):
		return {}
	var out: Dictionary = eff.duplicate(true)
	var kind: String = String(out.get("kind", ""))
	if _EFFECT_KIND_REMAP.has(kind):
		out.kind = _EFFECT_KIND_REMAP[kind]
	return out


static func _remap_trigger(trig: Variant) -> Dictionary:
	if not (trig is Dictionary):
		return {}
	var out: Dictionary = trig.duplicate(true)
	var ev: String = String(out.get("event", ""))
	if _EVENT_KIND_REMAP.has(ev):
		out.event = _EVENT_KIND_REMAP[ev]
	if out.get("effects") is Array:
		var rem: Array[Dictionary] = []
		for e in out.effects:
			rem.append(_remap_effect(e))
		out.effects = rem
	return out


static func _sorted_kv(d: Dictionary) -> String:
	var keys: Array = d.keys()
	keys.sort()
	var parts: Array[String] = []
	for k in keys:
		parts.append("%s=%d" % [k, d[k]])
	return ", ".join(parts)
