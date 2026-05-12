Add sound effects to this game using the web-components addon recipe `recipe.with-sound-effects`{{recipeNote}}. Import `AudioManager` from `../../resources/AudioManager.js` and `MuteToggle` from `../../ui/MuteToggle.js`. At game start (NOT at module load — Safari requires a user-gesture before the first AudioContext resume), instantiate `const audio = new AudioManager()` and mount `MuteToggle.mount(host, { audio })` somewhere in the game-chrome layer. Wire the existing game events:

  - on score increment: `audio.sfx('score')`
  - on collision / death: `audio.sfx('hit')`
  - on game over: `audio.sfx('gameover')`
  - on level up: `audio.sfx('levelup')`

Add `recipe.with-sound-effects` to the marker `addons` array, and include `resources.audio-manager` + `ui.mute-toggle` in the marker `components` array. Persist mute state to localStorage so the player's choice survives reloads (AudioManager handles this automatically). Preserve ALL existing game behavior — sound is purely additive. If the existing game already has audio (look for `new Audio`, `AudioContext`, `.play()`), STOP and report "already-sonified" rather than layering AudioManager on top.
