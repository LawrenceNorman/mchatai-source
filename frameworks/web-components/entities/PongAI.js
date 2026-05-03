// PongAI — beatable opponent paddle for Pong-style games.
//
// Tracks the ball's Y position with a configurable reaction delay + per-decision
// error so the human can win. Without delay+error a ball-tracking paddle is
// unbeatable. Defaults: delay 110ms, error 12% of paddle height.
//
// Usage (with Paddle.js + Ball.js):
//   const ai = new PongAI({ paddle: cpuPaddle, ball: ball, bounds: { minY: 0, maxY: HEIGHT - cpu.height } });
//   // In game loop:
//   ai.update(dt);  // dt in seconds
//
// Or call ai.computeDirection() yourself if you want to drive the paddle move().

export class PongAI {
  constructor(options = {}) {
    if (!options.paddle) throw new Error("PongAI requires { paddle } option");
    if (!options.ball) throw new Error("PongAI requires { ball } option");
    this.paddle = options.paddle;
    this.ball = options.ball;
    this.bounds = options.bounds || {};
    this.delay = typeof options.delay === "number" ? options.delay : 110; // ms
    this.errorFraction = typeof options.error === "number" ? options.error : 0.12;
    this.deadZone = typeof options.deadZone === "number" ? options.deadZone : 8;
    this.now = typeof options.now === "function" ? options.now : (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this._lastDecision = 0;
    this._target = this.paddle.y + this.paddle.height / 2;
  }

  /**
   * Recompute the AI's tracked target Y (the ball-Y plus a random error). Called
   * automatically by update() once per `delay` ms.
   */
  retarget() {
    const errorPx = this.paddle.height * this.errorFraction * (Math.random() * 2 - 1);
    this._target = this.ball.y + errorPx;
    this._lastDecision = this.now();
  }

  /**
   * Returns -1 (move up), 0 (hold), or 1 (move down) toward the current target.
   */
  computeDirection() {
    const paddleCenter = this.paddle.y + this.paddle.height / 2;
    const delta = this._target - paddleCenter;
    if (Math.abs(delta) < this.deadZone) return 0;
    return Math.sign(delta);
  }

  /**
   * Drive the paddle toward the current target. Calls paddle.move(direction, dt, bounds).
   * Re-targets every `delay` ms.
   */
  update(dt) {
    if (this.now() - this._lastDecision >= this.delay) {
      this.retarget();
    }
    const direction = this.computeDirection();
    if (typeof this.paddle.move === "function") {
      this.paddle.move(direction, dt, this.bounds);
    } else if (this.paddle.axis === "x") {
      this.paddle.x += direction * (this.paddle.speed || 300) * dt;
    } else {
      this.paddle.y += direction * (this.paddle.speed || 300) * dt;
    }
  }

  /**
   * Force re-decision now (useful right after a serve or score).
   */
  reset() {
    this._lastDecision = 0;
    this._target = this.paddle.y + this.paddle.height / 2;
  }
}
