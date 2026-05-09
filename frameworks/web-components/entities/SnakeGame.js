// BEGIN mchatai-web-components: entities.snake-game (entities/SnakeGame.js)
import { GridBoard } from "./GridBoard.js";

/**
 * Classic Snake game on an NxN grid (default 20×20).
 *
 * Mechanics:
 *   - Snake = array of {row, col} cells; index 0 is the head, last is tail.
 *   - Direction is one of {row,col} velocity pairs: up=(-1,0), down=(1,0),
 *     left=(0,-1), right=(0,1).
 *   - tick() advances the snake one cell in the current direction:
 *       - Out of bounds OR collides with own body → gameOver=true.
 *       - Lands on food → grow (don't pop tail), spawn new food, +score.
 *       - Otherwise → pop tail (snake length unchanged).
 *   - setDirection(dir) rejects 180° reversals (would be instant self-kill).
 *   - Wrap mode (options.wrap=true) makes edges wrap toroidally instead of
 *     causing game-over.
 *
 * Cells store: 0 = empty, 1 = snake body, 2 = snake head, 3 = food.
 *
 * Caller drives the loop with setInterval(grid.tick, grid.tickMs()) and
 * handles input → grid.setDirection. Renderer reads cells.
 */

const DIRECTIONS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 }
};

const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

export class SnakeGame extends GridBoard {
  constructor(options = {}) {
    super({
      ...options,
      rows: options.size ?? 20,
      cols: options.size ?? 20,
      fill: 0
    });
    this.wrap = options.wrap === true;
    this.snake = []; // [{row, col}, ...] head first
    this.direction = "right";
    this.pendingDirection = "right";
    this.food = null;
    this.score = 0;
    this.gameOver = false;
    this.startSpeedMs = options.startSpeedMs ?? 220;
    this.minSpeedMs = options.minSpeedMs ?? 70;
    this.speedupPerFood = options.speedupPerFood ?? 4; // ms shaved per food
  }

  /** Reset to a fresh game. Snake starts in the middle moving right, length 3. */
  newGame() {
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) this.set(r, c, 0);
    }
    const midR = Math.floor(this.rows / 2);
    const midC = Math.floor(this.cols / 2);
    this.snake = [
      { row: midR, col: midC },
      { row: midR, col: midC - 1 },
      { row: midR, col: midC - 2 }
    ];
    this.direction = "right";
    this.pendingDirection = "right";
    this.score = 0;
    this.gameOver = false;
    this._renderSnake();
    this._spawnFood();
  }

  _renderSnake() {
    // Clear snake cells before redraw (food is left intact).
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(r, c) === 1 || this.get(r, c) === 2) this.set(r, c, 0);
      }
    }
    for (let i = 0; i < this.snake.length; i += 1) {
      const { row, col } = this.snake[i];
      this.set(row, col, i === 0 ? 2 : 1);
    }
  }

  _spawnFood() {
    const empty = [];
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(r, c) === 0) empty.push({ row: r, col: c });
      }
    }
    if (empty.length === 0) return null;
    const pick = empty[Math.floor(Math.random() * empty.length)];
    this.food = pick;
    this.set(pick.row, pick.col, 3);
    return pick;
  }

  /** Queue a direction change. Rejects 180° reversals. Called by input handlers. */
  setDirection(dir) {
    if (!DIRECTIONS[dir]) return false;
    if (OPPOSITE[this.direction] === dir) return false; // can't reverse
    this.pendingDirection = dir;
    return true;
  }

  /** One tick: move head one cell. Returns:
   *   { moved: true, ate: bool, died: bool, headRow, headCol }
   *   { moved: false, died: true }  if game already over */
  tick() {
    if (this.gameOver) return { moved: false, died: true };
    this.direction = this.pendingDirection;
    const { dr, dc } = DIRECTIONS[this.direction];
    const head = this.snake[0];
    let nr = head.row + dr;
    let nc = head.col + dc;
    if (this.wrap) {
      nr = (nr + this.rows) % this.rows;
      nc = (nc + this.cols) % this.cols;
    } else if (!this.inBounds(nr, nc)) {
      this.gameOver = true;
      return { moved: false, died: true, headRow: nr, headCol: nc };
    }
    // Self-collision: if (nr, nc) is body and not the very tail (which will move)
    const willEat = this.food && nr === this.food.row && nc === this.food.col;
    const tail = this.snake[this.snake.length - 1];
    for (let i = 0; i < this.snake.length; i += 1) {
      const seg = this.snake[i];
      if (seg.row === nr && seg.col === nc) {
        // Tail will vacate this turn unless we ate (snake grows)
        if (!willEat && i === this.snake.length - 1) continue;
        this.gameOver = true;
        return { moved: false, died: true, headRow: nr, headCol: nc };
      }
    }
    // Move
    this.snake.unshift({ row: nr, col: nc });
    if (willEat) {
      this.score += 10;
      this._renderSnake();
      this._spawnFood();
      return { moved: true, ate: true, died: false, headRow: nr, headCol: nc };
    } else {
      this.snake.pop();
      this._renderSnake();
      return { moved: true, ate: false, died: false, headRow: nr, headCol: nc };
    }
  }

  /** Speed scales with score: each food shaves `speedupPerFood` ms,
   *  bottoming out at minSpeedMs. */
  tickMs() {
    const eaten = this.score / 10;
    return Math.max(this.minSpeedMs, this.startSpeedMs - Math.floor(eaten) * this.speedupPerFood);
  }

  /** True if no moves possible (snake fills the board). */
  isFull() {
    return this.snake.length === this.rows * this.cols;
  }

  /** Convert pointer-swipe deltas into a direction. Useful for the touch
   *  control surface. Returns null below threshold. */
  static directionFromSwipe(startX, startY, endX, endY, threshold = 30) {
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }
}
// END mchatai-web-components: entities.snake-game
