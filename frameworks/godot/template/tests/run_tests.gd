extends SceneTree
## Headless checks: godot --headless --path . -s res://tests/run_tests.gd  (exit 0 = pass)

func _initialize() -> void:
	var fails: int = 0
	var ui: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/ui.json"))
	if not (ui is Dictionary and (ui as Dictionary).has("title")):
		fails += 1
		push_error("content/ui.json has no title")
	print("%d checks, %d failed" % [1, fails])
	quit(1 if fails > 0 else 0)
