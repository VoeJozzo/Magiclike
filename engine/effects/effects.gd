class_name Effects
extends RefCounted

# Universal effects dispatcher. Mirrors the JS prototype's EFFECTS table.
#
# Each effect kind has its own GDScript file under engine/effects/, with a
# static execute(effect: Dictionary, ctx: Dictionary) -> void method.
#
# ctx fields (assembled by Engine before dispatching):
#   ctx.controller  : Player        — who's casting/activating
#   ctx.source      : CardInstance  — the source card
#   ctx.source_name : String        — convenience for logs
#   ctx.source_iid  : int
#   ctx.state       : EngineState   — full game state
#   ctx.targets     : Array         — resolved at cast time, validated at resolution
#   ctx.log         : Array[String] — append log lines here
#
# Adding a new effect kind: write engine/effects/<kind>.gd with a static execute(),
# add to HANDLERS below.

const _Damage := preload("res://engine/effects/damage.gd")
const _AddMana := preload("res://engine/effects/add_mana.gd")
const _Pump := preload("res://engine/effects/pump.gd")
const _GainLife := preload("res://engine/effects/gain_life.gd")
const _CounterSpell := preload("res://engine/effects/counter_spell.gd")

const HANDLERS := {
	"damage": _Damage,
	"add_mana": _AddMana,
	"pump": _Pump,
	"gain_life": _GainLife,
	"counter_spell": _CounterSpell,
}


# Resolve a list of effects in order. Each effect runs to completion before the
# next; targets and ctx are shared.
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
