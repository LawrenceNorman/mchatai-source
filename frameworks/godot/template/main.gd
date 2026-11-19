extends Control
## The smallest game in the Godot profile's shape: every word comes from content/ui.json, the screen is
## built in code with full-rect anchors, and the game can screenshot itself (--screenshot <path>).

var ui: Dictionary = {}


func _ready() -> void:
	ui = JSON.parse_string(FileAccess.get_file_as_string("res://content/ui.json"))
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color("e9ddc1")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	add_child(box)
	var title := Label.new()
	title.text = String(ui["title"])
	title.add_theme_font_size_override("font_size", 44)
	title.add_theme_color_override("font_color", Color("3b2f22"))
	box.add_child(title)
	if not OS.has_feature("web"):
		var quit := Button.new()
		quit.text = String(ui["quit"])
		quit.pressed.connect(get_tree().quit)
		box.add_child(quit)
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var at: int = args.find("--screenshot")
	if at >= 0 and at + 1 < args.size():
		_shot.call_deferred(args[at + 1])


func _shot(path: String) -> void:
	for i in range(6):
		await get_tree().process_frame
		RenderingServer.force_draw(true)
	get_viewport().get_texture().get_image().save_png(path)
	get_tree().quit()
