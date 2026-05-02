import { GameManager } from "../../core/GameManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { GridMover } from "../../entities/GridMover.js";
import { PathFollower } from "../../entities/PathFollower.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { VirtualJoystick } from "../../ui/VirtualJoystick.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const ROWS = 12;
const COLS = 12;
const TILE = 60;
const HOME_COLS = [1, 3, 5, 7, 10];

function $(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

class LaneActor extends PathFollower {
  constructor(options) {
    super({
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      speed: options.speed,
      path: [{ x: options.endX, y: options.y }],
      loop: false,
      centered: true,
      zIndex: options.zIndex ?? 3
    });
    this.kind = options.kind;
    this.color = options.color;
    this.startX = options.x;
    this.endX = options.endX;
    this.direction = Math.sign(options.endX - options.x) || 1;
  }

  update(dt) {
    super.update(dt);
    if (this.arrived) {
      this.x = this.startX;
      this.targetIndex = 0;
      this.arrived = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;

    if (this.kind === "log") {
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.fillStyle = "rgba(70, 32, 12, 0.35)";
      for (let x = -this.width / 2 + 18; x < this.width / 2; x += 34) {
        ctx.beginPath();
        ctx.arc(x, 0, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const r = 8;
      ctx.beginPath();
      ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, r);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(-this.width / 2 + 10, -this.height / 2 + 6, 24, 8);
      ctx.fillRect(this.width / 2 - 34, -this.height / 2 + 6, 24, 8);
    }

    ctx.restore();
  }
}

export class FroggerGame {
  constructor(options = {}) {
    this.canvas = document.getElementById(options.canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.board = new GridBoard({ rows: ROWS, cols: COLS, tileSize: TILE });
    this.player = new GridMover({ row: ROWS - 1, col: Math.floor(COLS / 2), moveDelay: 0 });
    this.scoreboard = new ScoreBoard({
      target: options.scoreboardTarget,
      storageKey: "frogger-best-score",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.audio = new AudioManager();
    this.messageEl = $(options.messageTarget);
    this.livesEl = $(options.livesTarget);
    this.homesEl = $(options.homesTarget);
    this.restartButton = $(options.restartButton);
    this.homes = new Set();
    this.lives = 3;
    this.score = 0;
    this.carLanes = [6, 7, 8, 9];
    this.waterLanes = [1, 2, 3, 4];
    this.safeRows = [0, 5, 10, 11];
    this.actors = this.createActors();
    this.rideLog = null;
    this.lastJoystickMove = 0;

    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));

    this.engine = new GameManager({
      canvas: this.canvas,
      width: COLS * TILE,
      height: ROWS * TILE,
      clearColor: "#07130f",
      onUpdate: (dt) => this.update(dt),
      onDraw: (ctx) => this.draw(ctx)
    });

    this.installInput();
    this.installJoystick(options.joystickTarget);
    this.restartButton?.addEventListener("click", () => this.resetGame());
    this.renderHUD();
    this.engine.step(0);
  }

  start() {
    this.engine.start();
  }

  createActors() {
    const actors = [];
    const carColors = ["#ff5c7a", "#ffd166", "#5ee1ff", "#f97316"];
    const logColors = ["#8b5a2b", "#a66a2f", "#7c4a24"];

    this.carLanes.forEach((row, laneIndex) => {
      const y = row * TILE + TILE / 2;
      const speed = 90 + laneIndex * 18;
      const direction = laneIndex % 2 === 0 ? 1 : -1;
      for (let i = 0; i < 3; i += 1) {
        const startX = direction > 0 ? -120 - i * 250 : COLS * TILE + 120 + i * 250;
        const endX = direction > 0 ? COLS * TILE + 120 : -120;
        actors.push(new LaneActor({
          kind: "car",
          x: startX,
          y,
          endX,
          width: 86,
          height: 34,
          speed,
          color: carColors[laneIndex % carColors.length]
        }));
      }
    });

    this.waterLanes.forEach((row, laneIndex) => {
      const y = row * TILE + TILE / 2;
      const speed = 55 + laneIndex * 14;
      const direction = laneIndex % 2 === 0 ? -1 : 1;
      for (let i = 0; i < 3; i += 1) {
        const startX = direction > 0 ? -150 - i * 280 : COLS * TILE + 150 + i * 280;
        const endX = direction > 0 ? COLS * TILE + 150 : -150;
        actors.push(new LaneActor({
          kind: "log",
          x: startX,
          y,
          endX,
          width: 132,
          height: 34,
          speed,
          color: logColors[laneIndex % logColors.length]
        }));
      }
    });

    return actors;
  }

  installInput() {
    document.addEventListener("keydown", (event) => {
      const keyMap = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        w: [-1, 0],
        s: [1, 0],
        a: [0, -1],
        d: [0, 1]
      };
      const move = keyMap[event.key];
      if (!move) {
        return;
      }
      event.preventDefault();
      this.tryMove(move[0], move[1]);
    });
  }

  installJoystick(target) {
    const mount = $(target);
    if (!mount) {
      return;
    }
    this.joystick = new VirtualJoystick({
      target: mount,
      onChange: (value) => {
        if (!value.active || performance.now() - this.lastJoystickMove < 170) {
          return;
        }
        this.lastJoystickMove = performance.now();
        if (Math.abs(value.x) > Math.abs(value.y)) {
          this.tryMove(0, value.x > 0 ? 1 : -1);
        } else {
          this.tryMove(value.y > 0 ? 1 : -1, 0);
        }
      }
    });
  }

  tryMove(dr, dc) {
    const nextRow = this.player.row + dr;
    const nextCol = this.player.col + dc;
    if (!this.board.inBounds(nextRow, nextCol)) {
      return;
    }
    this.player.snapTo(nextRow, nextCol);
    this.score += dr < 0 ? 10 : 0;
    this.scoreboard.setScore(this.score);
    this.audio.beep({ freq: 460, duration: 0.04, type: "triangle" });
    this.checkHome();
  }

  update(dt) {
    for (const actor of this.actors) {
      actor.update(dt);
    }

    const playerRect = this.playerRect();
    this.rideLog = null;

    for (const actor of this.actors) {
      if (!rectsOverlap(playerRect, actor.getAABB())) {
        continue;
      }
      if (actor.kind === "car") {
        this.loseLife("Traffic got you. Try the shoulder gaps.");
        return;
      }
      if (actor.kind === "log") {
        this.rideLog = actor;
      }
    }

    if (this.waterLanes.includes(this.player.row)) {
      if (!this.rideLog) {
        this.loseLife("Splash. Ride a log across the river.");
        return;
      }
      const drift = this.rideLog.direction * this.rideLog.speed * dt;
      const pos = this.board.cellToWorld(this.player.row, this.player.col);
      const nextCol = Math.round((pos.x + drift - TILE / 2) / TILE);
      if (nextCol !== this.player.col && this.board.inBounds(this.player.row, nextCol)) {
        this.player.snapTo(this.player.row, nextCol);
      }
    }
  }

  checkHome() {
    if (this.player.row !== 0) {
      return;
    }
    const nearestHome = HOME_COLS.find((col) => Math.abs(col - this.player.col) <= 0);
    if (nearestHome === undefined || this.homes.has(nearestHome)) {
      this.loseLife("Land on an open home pad.");
      return;
    }
    this.homes.add(nearestHome);
    this.score += 250;
    this.scoreboard.setScore(this.score);
    this.setMessage("Home reached. Fill all five pads.");
    this.audio.beep({ freq: 760, duration: 0.1, type: "sine" });
    if (this.homes.size >= HOME_COLS.length) {
      this.score += 1000;
      this.scoreboard.setScore(this.score);
      this.setMessage("Level clear. Fresh traffic pattern loaded.");
      this.homes.clear();
    }
    this.resetPlayer();
    this.renderHUD();
  }

  loseLife(message) {
    this.lives -= 1;
    this.audio.noise({ duration: 0.12, volume: 0.05 });
    if (this.lives <= 0) {
      this.setMessage("Game over. Restart or keep hopping for a new run.");
      this.resetGame();
      return;
    }
    this.setMessage(message);
    this.resetPlayer();
    this.renderHUD();
  }

  resetPlayer() {
    this.player.snapTo(ROWS - 1, Math.floor(COLS / 2));
  }

  resetGame() {
    this.lives = 3;
    this.score = 0;
    this.homes.clear();
    this.scoreboard.reset();
    this.resetPlayer();
    this.setMessage("Arrow keys or swipe pad to hop.");
    this.renderHUD();
  }

  playerRect() {
    const pos = this.board.cellToWorld(this.player.row, this.player.col);
    return {
      x: pos.x - 18,
      y: pos.y - 18,
      width: 36,
      height: 36
    };
  }

  renderHUD() {
    if (this.livesEl) {
      this.livesEl.textContent = String(this.lives);
    }
    if (this.homesEl) {
      this.homesEl.textContent = `${this.homes.size}/${HOME_COLS.length}`;
    }
  }

  setMessage(message) {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
  }

  draw(ctx) {
    this.drawBoard(ctx);
    for (const actor of this.actors) {
      actor.draw(ctx);
    }
    this.drawHomes(ctx);
    this.drawPlayer(ctx);
  }

  drawBoard(ctx) {
    for (let row = 0; row < ROWS; row += 1) {
      const y = row * TILE;
      let fill = "#173c2d";
      if (this.waterLanes.includes(row)) {
        fill = "#0a3452";
      } else if (this.carLanes.includes(row)) {
        fill = "#20242b";
      } else if (this.safeRows.includes(row)) {
        fill = "#1d5d36";
      }
      ctx.fillStyle = fill;
      ctx.fillRect(0, y, COLS * TILE, TILE);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(COLS * TILE, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (const row of this.carLanes) {
      const y = row * TILE + TILE / 2;
      for (let x = 0; x < COLS * TILE; x += 90) {
        ctx.fillRect(x + 10, y - 2, 42, 4);
      }
    }
  }

  drawHomes(ctx) {
    for (const col of HOME_COLS) {
      const pos = this.board.cellToWorld(0, col);
      ctx.fillStyle = this.homes.has(col) ? "#9cff63" : "rgba(156, 255, 99, 0.18)";
      ctx.beginPath();
      ctx.roundRect(pos.x - 24, pos.y - 22, 48, 44, 12);
      ctx.fill();
    }
  }

  drawPlayer(ctx) {
    const pos = this.board.cellToWorld(this.player.row, this.player.col);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = "#9cff63";
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#07130f";
    ctx.beginPath();
    ctx.arc(-7, -7, 3, 0, Math.PI * 2);
    ctx.arc(7, -7, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
