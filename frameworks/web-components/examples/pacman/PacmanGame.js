import { GameManager } from "../../core/GameManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { GridMover } from "../../entities/GridMover.js";
import { AIPathfinder } from "../../entities/AIPathfinder.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { VirtualJoystick } from "../../ui/VirtualJoystick.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const MAZE = [
  "##############",
  "#............#",
  "#.##.####.##.#",
  "#o#........#o#",
  "#.##.#..#.##.#",
  "#....#..#....#",
  "####.#..#.####",
  "#............#",
  "#.##.####.##.#",
  "#o...#..#...o#",
  "##############"
];

const DIRS = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
  w: { row: -1, col: 0 },
  s: { row: 1, col: 0 },
  a: { row: 0, col: -1 },
  d: { row: 0, col: 1 }
};

function pacmanQuery(selector) {
  return document.querySelector(selector);
}

export class PacmanGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.tileSize = Math.floor(this.canvas.width / MAZE[0].length);
    this.board = new GridBoard({
      rows: MAZE.length,
      cols: MAZE[0].length,
      tileSize: this.tileSize,
      fill: "."
    });
    this.audio = new AudioManager({ masterVolume: 0.045 });
    this.scoreboard = new ScoreBoard({
      target: options.scoreboardTarget,
      storageKey: "mchatai.pacman.best",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.joystick = new VirtualJoystick({
      target: options.joystickTarget,
      onChange: (value) => this.handleJoystick(value)
    });
    this.engine = new GameManager({
      canvas: this.canvas,
      width: MAZE[0].length * this.tileSize,
      height: MAZE.length * this.tileSize,
      clearEachFrame: false,
      onUpdate: (dt) => this.update(dt),
      onDraw: () => this.draw()
    });
    this.player = new GridMover({ row: 7, col: 7, moveDelay: 0.12, canEnter: (_, board) => board.get(_.row, _.col) !== "#" });
    this.ghosts = [
      { mover: new GridMover({ row: 1, col: 1, moveDelay: 0.22 }), color: "#fb7185", scatter: { row: 1, col: 12 } },
      { mover: new GridMover({ row: 9, col: 12, moveDelay: 0.26 }), color: "#22d3ee", scatter: { row: 9, col: 1 } }
    ];
    this.pathfinder = new AIPathfinder({ canEnter: (cell) => cell !== "#" });
    this.lives = 3;
    this.powerTimer = 0;
    this.message = pacmanQuery("#message");
    this.livesEl = pacmanQuery("#lives");
    this.pelletsEl = pacmanQuery("#pelletsLeft");
    this.pelletsLeft = 0;
    this.loadMaze();
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    window.addEventListener("keydown", (event) => {
      const dir = DIRS[event.key];
      if (dir) {
        event.preventDefault();
        this.player.setDirection(dir);
      }
    });
    pacmanQuery("#restartButton").addEventListener("click", () => this.restart());
    this.engine.step(0);
    this.engine.start();
  }

  loadMaze() {
    this.pelletsLeft = 0;
    MAZE.forEach((line, row) => {
      [...line].forEach((cell, col) => {
        this.board.set(row, col, cell);
        if (cell === "." || cell === "o") {
          this.pelletsLeft += 1;
        }
      });
    });
    this.updateHUD();
  }

  update(dt) {
    this.powerTimer = Math.max(0, this.powerTimer - dt);
    if (this.player.update(dt, this.board)) {
      this.consumeCell();
    }
    this.ghosts.forEach((ghost) => this.updateGhost(ghost, dt));
    this.checkGhosts();
    this.updateHUD();
  }

  updateGhost(ghost, dt) {
    ghost.mover.elapsed += dt;
    if (ghost.mover.elapsed < ghost.mover.moveDelay) {
      return;
    }
    const target = this.powerTimer > 0 ? ghost.scatter : { row: this.player.row, col: this.player.col };
    const next = this.pathfinder.nextStep(this.board, ghost.mover, target);
    if (next) {
      ghost.mover.snapTo(next.row, next.col);
    }
  }

  consumeCell() {
    const cell = this.board.get(this.player.row, this.player.col);
    if (cell === ".") {
      this.board.set(this.player.row, this.player.col, " ");
      this.pelletsLeft -= 1;
      this.scoreboard.add(10);
      this.audio.beep({ freq: 660, duration: 0.035, type: "square" });
    }
    if (cell === "o") {
      this.board.set(this.player.row, this.player.col, " ");
      this.pelletsLeft -= 1;
      this.powerTimer = 7;
      this.scoreboard.add(50);
      this.message.textContent = "Power pellet. Chase the ghosts.";
      this.audio.beep({ freq: 330, slideTo: 990, duration: 0.12, type: "triangle" });
    }
    if (this.pelletsLeft <= 0) {
      this.message.textContent = "Maze cleared. New board.";
      this.restart(true);
    }
  }

  checkGhosts() {
    this.ghosts.forEach((ghost) => {
      if (ghost.mover.row !== this.player.row || ghost.mover.col !== this.player.col) {
        return;
      }
      if (this.powerTimer > 0) {
        ghost.mover.snapTo(1, 1);
        this.scoreboard.add(200);
        return;
      }
      this.lives -= 1;
      this.message.textContent = this.lives > 0 ? "Caught by a ghost. Try again." : "Game over. Restarting.";
      this.player.snapTo(7, 7);
      this.ghosts[0].mover.snapTo(1, 1);
      this.ghosts[1].mover.snapTo(9, 12);
      if (this.lives <= 0) {
        this.restart();
      }
    });
  }

  handleJoystick(value) {
    if (!value.active) {
      return;
    }
    if (Math.abs(value.x) > Math.abs(value.y)) {
      this.player.setDirection({ row: 0, col: Math.sign(value.x) });
    } else {
      this.player.setDirection({ row: Math.sign(value.y), col: 0 });
    }
  }

  restart(keepScore = false) {
    this.loadMaze();
    this.player.snapTo(7, 7);
    this.ghosts[0].mover.snapTo(1, 1);
    this.ghosts[1].mover.snapTo(9, 12);
    this.lives = 3;
    this.powerTimer = 0;
    if (!keepScore) {
      this.scoreboard.reset();
    }
    this.message.textContent = "Arrow keys, WASD, or joystick to move.";
  }

  updateHUD() {
    this.livesEl.textContent = String(this.lives);
    this.pelletsEl.textContent = String(this.pelletsLeft);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.board.forEach((cell, row, col) => this.drawCell(cell, row, col));
    this.drawActor(this.player.row, this.player.col, "#facc15", 0.43);
    this.ghosts.forEach((ghost) => {
      this.drawActor(ghost.mover.row, ghost.mover.col, this.powerTimer > 0 ? "#93c5fd" : ghost.color, 0.38);
    });
  }

  drawCell(cell, row, col) {
    const { x, y } = this.board.cellToWorld(row, col, false);
    if (cell === "#") {
      this.ctx.fillStyle = "#1d4ed8";
      this.ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
      return;
    }
    this.ctx.fillStyle = "#020617";
    this.ctx.fillRect(x, y, this.tileSize, this.tileSize);
    if (cell === "." || cell === "o") {
      const radius = cell === "o" ? 5 : 2.5;
      this.ctx.fillStyle = cell === "o" ? "#fef3c7" : "#bfdbfe";
      this.ctx.beginPath();
      this.ctx.arc(x + this.tileSize / 2, y + this.tileSize / 2, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawActor(row, col, color, radiusScale) {
    const { x, y } = this.board.cellToWorld(row, col, true);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.tileSize * radiusScale, 0.18 * Math.PI, 1.82 * Math.PI);
    this.ctx.lineTo(x, y);
    this.ctx.fill();
  }
}
