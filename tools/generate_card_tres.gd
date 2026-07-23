extends Node

# Run after CardResource structural changes to regenerate cards/templates/*.tres
# from CardDatabase (see cards/templates/card_database.gd).
#
# Headless: godot --headless --path <repo> res://tools/generate_card_tres.tscn

func _ready() -> void:
	var ids: Array[String] = CardDatabase.all_card_ids()
	print("=== Generating %d card .tres files ===" % ids.size())
	var written: int = 0
	var failed: int = 0
	for cid in ids:
		var res: CardResource = CardDatabase.get_card(cid)
		if res == null:
			print("  ✗ %s: CardDatabase returned null" % cid)
			failed += 1
			continue
		var path: String = "res://cards/templates/%s.tres" % cid
		var err := ResourceSaver.save(res, path)
		if err == OK:
			print("  ✓ %s -> %s" % [cid, path])
			written += 1
		else:
			print("  ✗ %s: ResourceSaver.save returned error %d" % [cid, err])
			failed += 1
	print("=== Wrote %d / %d (failed: %d) ===" % [written, ids.size(), failed])
	get_tree().quit(0 if failed == 0 else 1)
