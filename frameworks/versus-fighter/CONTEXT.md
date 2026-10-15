# Versus Fighter: writing a game

A versus-fighter game is one small `index.html`. You write the game as JSON: the fighters (a body,
colors, an original name, special moves), the stages and the rules. The runtime provides everything
else: two fighters with frame data, hit and hurt boxes, blocking, combos, knockdowns; best-of-three
rounds with a timer; a CPU opponent (easy, normal, hard); two players on one keyboard or gamepads;
touch controls on phones; the HUD; painted stages; sound and music; a start card (title, tagline,
mode, difficulty, controls, music and sound switches, credits); character select; a pause menu (Esc
or P) and M for music. `examples/demo.html` is a complete three-fighter game to copy from.

## The page

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Neon Harbor Showdown</title>
<style>html,body{margin:0;height:100%;background:#0b0b12}#game{position:fixed;inset:0}</style>
</head>
<body>
<div id="game"></div>
<script type="application/json" id="vf-game">
{ ...the game, below... }
</script>
<script src="./libs/vf.js"></script>
<script src="./libs/vf-base-ava.js"></script>
<script>VersusFighter.mount("#game", JSON.parse(document.getElementById("vf-game").textContent));</script>
</body>
</html>
```

`./libs/vf.js` and `./libs/vf-base-<body>.js` come from `dist/` and are copied in when the game is
installed: load one base file per body your fighters use (`vf-base-ava.js`, `vf-base-komato.js`). Never write your own copy, load anything
from a URL, or add a canvas, game loop, input handling, sound, start screen, help text or menu.

## The game

```json
{
  "title": "Neon Harbor Showdown",
  "tagline": "Three fighters, one harbor, best of three.",
  "rounds": 2, "timer": 60, "cpu": "normal",
  "fighters": [
    { "name": "Rook Ishida", "base": "ava", "colors": { "top": "#e8505b" }, "style": "Fast kicks",
      "specials": [
        { "name": "Lantern Rise", "anim": "sp_uppercut", "input": "DP+P", "damage": 14, "knockdown": true, "invuln": 8, "rise": 3.2 },
        { "name": "Tide Breaker", "anim": "sp_dashpunch", "input": "QCF+P", "damage": 12, "dash": 3.6 }
      ] }
  ],
  "stages": [ { "name": "Neon Harbor", "theme": "harbor", "sky": ["#141a3a", "#e0607e"], "floor": "#2a2433", "accent": "#ffd27a" } ]
}
```

| Field | Meaning |
|---|---|
| `title`, `tagline` | the start card |
| `rounds` | rounds to win the match, 1–5 (2 = best of three) |
| `timer` | seconds per round, 20–99 |
| `cpu` | starting CPU difficulty: `easy`, `normal`, `hard` (the player can change it) |
| `look` | omit for the default sharp look (drawn at the screen's resolution); `"pixel"` keeps chunky retro pixels |
| `fighters` | 1–12. Two or fewer skip character select; one fighter is a mirror match |
| `fighters[].base` | the body: `ava` (an agile kickboxer) or `komato` (an armored brute: bigger, wider, slower, a lower jump) |
| `fighters[].colors` | as `#hex`, by body: `ava` has `top` and `pants`; `komato` has `armor` and `glow` (the fins and lights). The rest of the sprite keeps its shading |
| `fighters[].style` | a few words under the portrait on character select |
| `fighters[].health` | default 100 (50–200); a `komato` brute suits 110–130 |
| `fighters[].specials` | 1–4 special moves (below) |
| `fighters[].moves` | optional tweaks to normals, e.g. `{ "HK": { "damage": 15 } }` |
| `stages` | 1–4; `theme` is `city`, `harbor`, `temple`, `forest`, `mountains`, `dojo`, `desert`, `rooftop` or `space`; colors as `#hex` |

### Specials

A special is an attack animation of the body, a motion and a button:

| Field | Meaning |
|---|---|
| `name` | an original name, shown nowhere else but chosen with care |
| `anim` | one of the body's attack animations (below) |
| `input` | `QCF` (down, down-forward, forward), `QCB` (down, down-back, back), `DP` (forward, down, down-forward), `HCF`, `HCB`, then `+P` or `+K` |
| `damage` | 1–40 (normals do 5–13) |
| `knockdown` | `true` knocks the opponent down |
| `dash` | moves forward while attacking (about 2–4.5) |
| `rise` | jumps up while attacking (about 2.5–3.5; for uppercuts) |
| `invuln` | ticks of invulnerability at the start (anti-air moves, about 6–10) |
| `low` | `true`: must be blocked crouching (slides, sweeps) |
| `overhead` | `true`: must be blocked standing |
| `projectile` | `true`, or `{ "speed": 1.5–6, "size": 3–14, "color": "#hex" }`: the move throws a glowing orb instead of striking (default colour: the fighter's brightest colour). One on screen per fighter; two orbs that meet cancel. Use a punch animation (`straight`, `jab`) and no `dash`; `QCF+P` is the genre's usual input |

Attack animations of `ava`: `sp_uppercut` (a rising uppercut, the natural anti-air), `sp_dashpunch`
(a lunging punch), `sp_cartwheel` (a cartwheel kick).
Attack animations of `komato`: `sp_charge` (a full-body shoulder charge; give it `dash`),
`sp_lunge` (a lunging blade thrust), `sp_rising` (a rising strike, the anti-air), `sp_slide` (a
low slide; give it `low` and `dash`).
Both bodies also have the normals `jab`, `straight`, `kick_light`, `kick_heavy`, `crouch_punch`,
`crouch_kick`, `sweep`, `jump_punch`, `jump_kick`, which a special may use too.
Give each fighter a different mix so they play differently: one with an anti-air uppercut and a
dash, one that rushes in, one that keeps away with a projectile. When two specials share a motion's
end (a half circle ends in a quarter circle), the longer motion wins, and `DP` beats `QCF`.

## Names

Mechanics are the genre's shared vocabulary; names are not. Every fighter, special, stage and the
title must be ORIGINAL. Never use a character, move or series name from an existing fighting game
(no "Hadouken", "Shoryuken", "Ryu", "Chun-Li", "Sub-Zero", "Fatality", "Street Fighter" or the
like), even when the request names one: "a Street Fighter type game" means the genre.

## Checking

`node tools/vf-check.js index.html` validates the game JSON against the bodies that exist, the
inputs, the colors and the stage themes, checks the page loads the libraries it needs, and rejects
names from existing games. It exits with status 1 on any error; fix them all before you finish.

## Finishing

Write `index.html` in your working directory early and keep it current: it is what gets installed
if you run out of turns. Once `vf-check` passes you are done; a look in a browser is optional, so
keep it short. The install step loads the game itself and checks it starts.
