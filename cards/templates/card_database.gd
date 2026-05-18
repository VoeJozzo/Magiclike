class_name CardDatabase
extends RefCounted

# Thin loader over the per-card .tres files in cards/templates/. Backing store
# is res://cards/templates/<card_id>.tres; the engine, scenes, and tests call
# CardDatabase.get_card(card_id) and don't know (or care) it's a load().
#
# Card pool is discovered by scanning the directory — no hand-maintained list.
# To add a card: drop a new <card_id>.tres in this folder. To remove: delete
# the file. all_card_ids() picks up changes automatically.
#
# To regenerate from scratch after structural changes: see tools/generate_card_tres.gd.

const _TEMPLATE_DIR := "res://cards/templates/"

# Cached card_id list — first call walks the directory, subsequent calls
# return the cached array. Cards are added/removed at edit time, not at
# runtime, so a single scan per session is the right tradeoff.
static var _cached_ids: Array[String] = []


static func get_card(card_id: String) -> CardResource:
	var path: String = _TEMPLATE_DIR + card_id + ".tres"
	var res: CardResource = load(path)
	if res == null:
		push_error("CardDatabase: failed to load '%s'" % path)
	return res


# Walks cards/templates/ for *.tres files. Self-maintaining: adding a new
# template under that directory automatically extends the pool without a
# manual edit here. Used by engine boot validation and any caller that needs
# to iterate the full pool.
static func all_card_ids() -> Array[String]:
	if not _cached_ids.is_empty():
		return _cached_ids
	var ids: Array[String] = []
	var dir := DirAccess.open(_TEMPLATE_DIR)
	if dir == null:
		push_error("CardDatabase: cannot open %s" % _TEMPLATE_DIR)
		return ids
	dir.list_dir_begin()
	var name: String = dir.get_next()
	while name != "":
		if name.ends_with(".tres"):
			ids.append(name.get_basename())
		name = dir.get_next()
	dir.list_dir_end()
	ids.sort()  # deterministic order so test logs / boot validation iterate predictably
	_cached_ids = ids
	return _cached_ids


static func all_resources() -> Array:
	var arr: Array = []
	for cid in all_card_ids():
		arr.append(get_card(cid))
	return arr
