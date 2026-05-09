// BEGIN mchatai-web-components: entities.flappy-bird (entities/FlappyBird.js)

/**
 * Flappy-Bird-style arcade game state machine.
 *
 * Mechanics:
 *   - Bird at fixed X, vertical position governed by gravity + flap impulses.
 *   - Pipes scroll left at constant speed; each pipe has a random vertical gap.
 *   - tick(dt) advances physics by dt seconds; integrates gravity, moves pipes,
 *     spawns new pipes when needed, detects collisions.
 *   - flap() instantly sets vertical velocity to a fixed upward impulse.
 *   - Each pipe successfully passed = +1 score. Game ends on collision with
 *     pipe / ground / ceiling.
 *
 * Coordinates: world is `width × height` (caller's choice; e.g. 360×640 for
 * mobile portrait). Bird is at fixed X (default 80), animated vertical position.
 *
 * Caller drives the loop with requestAnimationFrame and renders bird + pipes
 * each frame. Input handler calls grid.flap() on tap or pointerdown.
 */
export class FlappyBird {
  constructor(options = {}) {
    this.width = options.width ?? 360;
    this.height = options.height ?? 640;
    this.gravity = options.gravity ?? 1400; // px/s² downward
    this.flapImpulse = options.flapImpulse ?? -360; // px/s instantaneous
    this.pipeSpeed = options.pipeSpeed ?? 140; // px/s
    this.pipeWidth = options.pipeWidth ?? 60;
    this.pipeGap = options.pipeGap ?? 160;
    this.pipeIntervalSeconds = options.pipeIntervalSeconds ?? 1.6;
    this.birdX = options.birdX ?? Math.floor(this.width * 0.22);
    this.birdRadius = options.birdRadius ?? 16;
    this.groundHeight = options.groundHeight ?? 60;

    this.bird = { y: 0, vy: 0 };
    this.pipes = []; // [{x, gapTop, gapBottom, scored}]
    this.score = 0;
    this.gameOver = false;
    this.timeSinceLastPipe = 0;
    this.state = "idle"; // "idle" | "playing" | "gameover"
  }

  /** Reset to a fresh game. State goes to "playing" but caller can hold a
   *  "tap to start" overlay until the first flap. */
  newGame() {
    this.bird = { y: this.height * 0.4, vy: 0 };
    this.pipes = [];
    this.score = 0;
    this.gameOver = false;
    this.timeSinceLastPipe = 0;
    this.state = "playing";
  }

  /** Apply a flap (upward impulse). Only works when state="playing". */
  flap() {
    if (this.state !== "playing") return false;
    this.bird.vy = this.flapImpulse;
    return true;
  }

  /** Advance physics by `dt` seconds. Returns:
   *  { died: bool, scored: number, headY: number } */
  tick(dt) {
    if (this.state !== "playing") return { died: false, scored: 0, headY: this.bird.y };

    // Bird physics
    this.bird.vy += this.gravity * dt;
    this.bird.y += this.bird.vy * dt;

    // Pipe physics
    for (const pipe of this.pipes) pipe.x -= this.pipeSpeed * dt;
    // Remove off-screen pipes
    this.pipes = this.pipes.filter(p => p.x + this.pipeWidth > 0);

    // Spawn new pipe?
    this.timeSinceLastPipe += dt;
    if (this.timeSinceLastPipe >= this.pipeIntervalSeconds) {
      this.timeSinceLastPipe = 0;
      this._spawnPipe();
    }

    // Score: any pipe whose right edge crossed birdX in this tick
    let scored = 0;
    for (const pipe of this.pipes) {
      if (!pipe.scored && pipe.x + this.pipeWidth < this.birdX) {
        pipe.scored = true;
        scored += 1;
      }
    }
    this.score += scored;

    // Collision: ground / ceiling
    if (this.bird.y + this.birdRadius >= this.height - this.groundHeight) {
      this.bird.y = this.height - this.groundHeight - this.birdRadius;
      this.gameOver = true;
      this.state = "gameover";
      return { died: true, scored, headY: this.bird.y };
    }
    if (this.bird.y - this.birdRadius < 0) {
      this.bird.y = this.birdRadius;
      this.bird.vy = 0;
      // Hitting the ceiling is a soft cap (not death) by convention.
    }

    // Collision: pipes (treat bird as circle vs rectangle)
    for (const pipe of this.pipes) {
      if (this._birdHitsPipe(pipe)) {
        this.gameOver = true;
        this.state = "gameover";
        return { died: true, scored, headY: this.bird.y };
      }
    }

    return { died: false, scored, headY: this.bird.y };
  }

  _birdHitsPipe(pipe) {
    // Circle (birdX, bird.y, birdRadius) vs two rectangles:
    //   top pipe:    (pipe.x, 0, pipeWidth, pipe.gapTop)
    //   bottom pipe: (pipe.x, pipe.gapBottom, pipeWidth, height - groundHeight - pipe.gapBottom)
    if (this.birdX + this.birdRadius < pipe.x) return false;
    if (this.birdX - this.birdRadius > pipe.x + this.pipeWidth) return false;
    if (this.bird.y - this.birdRadius < pipe.gapTop) return true;
    if (this.bird.y + this.birdRadius > pipe.gapBottom) return true;
    return false;
  }

  _spawnPipe() {
    // Gap vertical center is randomly between [margin, height - groundHeight - margin].
    const margin = 80;
    const playableTop = margin;
    const playableBottom = this.height - this.groundHeight - margin;
    const gapCenter = playableTop + Math.random() * (playableBottom - playableTop);
    const gapTop = gapCenter - this.pipeGap / 2;
    const gapBottom = gapCenter + this.pipeGap / 2;
    this.pipes.push({
      x: this.width,
      gapTop,
      gapBottom,
      scored: false
    });
  }

  /** True if game has ended. */
  isGameOver() {
    return this.state === "gameover";
  }
}
// END mchatai-web-components: entities.flappy-bird
