# Retro FPS: writing a game

A retro-fps game is one small `index.html`. You write the levels as text; the runtime compiles them
into Doom-format maps and runs them on the Woof! engine with Freedoom's art and sound. Weapons,
monsters, doors, keys, secrets, the HUD, music, sound effects, touch controls and offline loading
are all provided. `examples/outpost-alpha/index.html` is a complete two-level game to copy from.

## The page

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Iron Vanguard</title>
</head>
<body>
<script type="text/x-retro-fps-map">
  ...level 1...
</script>
<script type="text/x-retro-fps-map">
  ...level 2 (optional; levels play in order)...
</script>
<script type="text/x-retro-fps-dehacked">
  ...optional text reskin...
</script>
<script src="./libs/rfps.js"></script>
<script src="./libs/rfps-data.js"></script>
<script>RetroFPS.start({ title: "Iron Vanguard" });</script>
</body>
</html>
```

`./libs/rfps.js` and `./libs/rfps-data.js` come from `dist/` and are copied in when the game is
installed. Never write your own copy, load anything from a URL, or add a canvas, game loop, input
handling or sound. `RetroFPS.start` also takes `skill` (1 easiest to 5, default 3) and `debug: true`,
which logs the engine's output.

## A level

```
name: Relay Station
music: D_STALKS
sky: SKY2
intertext: The relay is ours. | Next stop: the reactor.

zones:
  .  floor=0   ceil=128 floorflat=FLOOR4_8 ceilflat=CEIL3_5  wall=STARTAN3 light=176
  o  floor=-16 ceil=224 floorflat=FLOOR7_1 ceilflat=F_SKY1   wall=BROWN1   light=224
  n  floor=-40 ceil=224 floorflat=NUKAGE1  ceilflat=F_SKY1   wall=BROWN1   light=224 damage=10
  s  floor=0   ceil=96  floorflat=FLOOR5_1 ceilflat=CEIL3_5  wall=SILVER2  light=112 secret=1
  b  door=blue

things:
  P  player1 angle=east
  K  bluekey
  I  imp angle=west ambush=1

grid:
###########
#..P..#sss#
#.....Ds..#
#..K..#####
###b#######
#ooooooonX#
#ooIooooon#
###########
```

Header lines: `name`, `music`, `sky` (SKY1, SKY2 or SKY3), and optional `intertext`, which is shown
after the level (`|` breaks a line). `#` begins a comment everywhere except the grid.

### Grid

Each character is one 64×64 map-unit cell.

| Character | Meaning |
|---|---|
| `#` (or space) | solid |
| `D` | a door; it opens when the player presses USE |
| `X` | the exit; walking onto it ends the level |
| anything else | must be declared under `zones:` or `things:` |

The rules the compiler enforces:
- The map is surrounded by `#`.
- There is exactly one `player1`.
- The player can walk from the start to an exit.

### Zones

| Property | Meaning |
|---|---|
| `floor`, `ceil` | heights in map units (a player is 56 tall) |
| `floorflat`, `ceilflat`, `wall` | flat and texture names from the base art; `ceilflat=F_SKY1` is open sky |
| `light` | 0–255 |
| `damage` | 5, 10 or 20: hurts while standing on it (use on NUKAGE1, LAVA1, SLIME01) |
| `secret` | 1: counts toward the secrets total |
| `lightfx` | `flicker`, `blink`, `fastblink`, `slowblink`, `glow`, `strobe` |
| `door` | `blue`, `yellow` or `red`: cells of this zone are a door that needs that key |
| `exit` | 1: cells of this zone are an exit pad |

Door and exit zones take their heights from the rooms beside them, and doors are textured by
height automatically. Movement limits, which the compiler checks:
- A step up between neighboring cells is at most 24 units. Dropping down is fine.
- Every walkable cell has at least 56 units of headroom.

### Things

`<char> <type> [angle=east|north|west|south|degrees] [ambush=1] [skill=easy|medium|hard]`. A thing
cell takes its zone from its neighbors, so keep things inside rooms rather than in doorways.

| Group | Types |
|---|---|
| start | `player1` |
| monsters | `zombieman` `shotgunguy` `chaingunner` `imp` `demon` `spectre` `lostsoul` `cacodemon` `hellknight` `baron` `revenant` `mancubus` `arachnotron` `painelemental` `archvile` |
| weapons | `shotgun` `supershotgun` `chaingun` `rocketlauncher` `plasmagun` `chainsaw` `bfg` |
| ammo | `clip` `bullets` `shells` `shellbox` `rocket` `rocketbox` `cell` `cellpack` `backpack` |
| health, armor | `stimpack` `medikit` `healthbonus` `armorbonus` `greenarmor` `bluearmor` `soulsphere` `megasphere` `berserk` |
| keys | `bluekey` `yellowkey` `redkey` (and `blueskull` `yellowskull` `redskull`) |
| decoration | `barrel` `burningbarrel` `floorlamp` `techlamp` `shorttechlamp` `techcolumn` `tallgreencolumn` `tallredcolumn` `candelabra` `tallbluetorch` `tallredtorch` `tree` `deadplayer` `bloodpool` |

## Text reskin

The art is fixed, but the words are not. A `text/x-retro-fps-dehacked` block is a DeHackEd patch.
Its `[STRINGS]` section renames pickup and door messages:

```
Patch File for DeHackEd v3.0
Doom version = 21
Patch format = 6

[STRINGS]
GOTSHOTGUN = Combat shotgun acquired!
GOTBLUECARD = Blue access card.
PD_BLUEK = This hatch needs a blue access card.
```

The mnemonics, and the texture, flat and music names that exist, are listed in
`wisdom/packs/retro-fps.json`. `dist/rfps-names.json` has the complete name lists.

## Checking a level

`node tools/rfps-check.js index.html` compiles every level with the same compiler the page uses. It
reports mistakes by level, row and column, and warns about unknown texture, flat and music names.
The page shows the same messages on screen and logs them to the console.
