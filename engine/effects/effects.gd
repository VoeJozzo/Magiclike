class_name Effects
extends RefCounted

# Effects dispatcher. Each kind has a static execute(effect, ctx) in engine/effects/<kind>.gd.
# ctx assembled by Engine: {controller, source, source_name, source_iid, state, targets, log}.
# To add a kind: drop the file + register in HANDLERS below.

const _Damage := preload("res://engine/effects/damage.gd")
const _AddMana := preload("res://engine/effects/add_mana.gd")
const _Pump := preload("res://engine/effects/pump.gd")
const _GainLife := preload("res://engine/effects/gain_life.gd")
const _Counter := preload("res://engine/effects/counter.gd")

const HANDLERS := {
	"damage": _Damage,
	"add_mana": _AddMana,
	"pump": _Pump,
	"gain_life": _GainLife,
	"counter": _Counter,
}


# In-order resolution; targets and ctx shared.
static func resolve_list(effects: Array, ctx: Dictionary) -> void:
	for effect in effects:
		resolve_one(effect, ctx)


static func resolve_one(effect: Dictionary, ctx: Dictionary) -> void:
	var kind: String = effect.get("kind", "")
	if kind == "":
		push_warning("Effects.resolve_one: effect has no 'kind' key: %s" % effect)
		return
	var handler = HANDLERS.get(kind)
	if handler == null:
		push_error("Effects.resolve_one: no handler for kind '%s'" % kind)
		return
	handler.execute(effect, ctx)
