# Retro FPS: writing a game

A retro-fps game is one small `index.html`. You write the levels as text; the runtime compiles them
into Doom-format maps and runs them on the Woof! engine with Freedoom's art and sound. Weapons,
monsters, doors, keys, secrets, the HUD, music, sound effects, touch controls and offline loading
are all provided, and so is everything around the game: a start card with the title, a briefing,
the controls and difficulty, music and sound switches; a pause menu (Esc or ☰); M for music; and a
"press E to try again" hint after the player dies. `examples/outpost-alpha/index.html` is a complete
two-level game to copy from.

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
handling, sound, start screen, help text or menu.

`RetroFPS.start` options:

| Option | Meaning |
|---|---|
| `title` | the game's name, on the start card and the browser tab |
| `briefing` | one or two sentences for the start card, such as the mission (default: level 1's name) |
| `skill` | starting difficulty, 1 easiest to 5 (default 3); the player can change it on the card |
| `debug: true` | logs the engine's output to the console |

The player's controls, which the start card lists: W/S or ↑/↓ move, A/D step sideways, ←/→ turn
(or the mouse, once the player clicks the game where the browser allows it), Space, Ctrl or a
click fires, E opens doors and flips switches, 1–7, Q or the mouse wheel change weapon, Tab shows
the map. In a DeHackEd reskin or a briefing, call the use action "E", never Space.

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
| `D` | a door; it opens when the player presses E (USE on a phone) |
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

## Making it fair

New players have just found the controls, so the first seconds matter:
- **The start is safe.** No monster may have a clear line to the player's starting spot. The first
  monsters wait behind a door or around a corner. `rfps-check` fails on this with a DESIGN line. (The
  page turns such monsters to face away as a stopgap, but fix the level.)
- **Ramp up.** The first fight is one to three weak monsters (`zombieman`, `shotgunguy`, `imp`).
  Tougher ones come in later rooms; `baron`, `revenant`, `mancubus`, `arachnotron` and `archvile`
  belong in later levels.
- **Arm the player.** Put a `shotgun` and some ammo within the first room or two of level 1, and
  health near the hard fights.
- Mark monsters that should wait in their room `ambush=1`; they stay put until they see the player.

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
reports mistakes by level, row and column, DESIGN problems (such as monsters that can see the
start), and warns about unknown texture, flat and music names. It exits with status 1 on a mistake
or a DESIGN line; fix both before you finish. The page shows mistakes on screen and logs the rest to
the console.

## Finishing

Write `index.html` in your working directory early and keep it current: it is what gets installed
if you run out of turns. Once `rfps-check` passes you are done; a look in a browser is optional,
so keep it short. The install step loads the game itself and checks it starts.
