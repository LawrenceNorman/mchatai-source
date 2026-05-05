# SFX Pack License

All sound effects in this directory are sourced from **Kenney** (https://kenney.nl)
and licensed under **Creative Commons Zero (CC0 1.0 Universal)**:

> http://creativecommons.org/publicdomain/zero/1.0/

You may use these assets in personal AND commercial projects, no attribution
required. Crediting "Kenney" or "www.kenney.nl" is appreciated but not mandatory.

## Source packs

| File prefix       | Kenney pack         | URL                                       |
|-------------------|---------------------|-------------------------------------------|
| `ui-*`            | UI Audio            | https://kenney.nl/assets/ui-audio         |
| `puzzle-*`        | Casino Audio + Impact Sounds | https://kenney.nl/assets/casino-audio , https://kenney.nl/assets/impact-sounds |
| `card-*`, `chip-*`, `dice-*` | Casino Audio | https://kenney.nl/assets/casino-audio |
| `arcade-*`        | Sci-Fi Sounds       | https://kenney.nl/assets/sci-fi-sounds    |
| `impact-*`        | Impact Sounds       | https://kenney.nl/assets/impact-sounds    |
| `victory`, `level-up`, `game-over` | Casino + Sci-Fi | (see above) |

## Files

See `effects.sound-pack-manifest` (the SFX enum in `SoundEngine.swift`) for the
canonical list of semantic names → files. Generated apps should reference SFX
events by enum case (e.g. `SFX.match3Pop`) rather than by filename so the
mapping can evolve.
