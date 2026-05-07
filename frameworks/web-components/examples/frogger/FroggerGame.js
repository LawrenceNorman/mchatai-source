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

    if (this.kind === "log") {
      // Log: dark wood base + lighter top stripe (sun-kissed) + grain
      // ridges + darker end caps so the logs read as solid 3D objects on
      // the water rather than flat brown rectangles.
      const w = this.width;
      const h = this.height;
      const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      grad.addColorStop(0, "#a36a3a");
      grad.addColorStop(0.5, "#7a4a26");
      grad.addColorStop(1, "#4f2f17");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      // top highlight
      ctx.fillStyle = "rgba(255, 220, 170, 0.18)";
      ctx.fillRect(-w / 2 + 12, -h / 2 + 4, w - 24, 4);
      // grain ridges
      ctx.strokeStyle = "rgba(40, 22, 8, 0.5)";
      ctx.lineWidth = 1;
      for (let x = -w / 2 + 24; x < w / 2 - 12; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2 + 6);
        ctx.lineTo(x, h / 2 - 6);
        ctx.stroke();
      }
      // end-cap rings
      ctx.fillStyle = "rgba(50, 28, 12, 0.55)";
      [-w / 2 + 8, w / 2 - 8].forEach((cx) => {
        ctx.beginPath();
        ctx.arc(cx, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      // Car: rounded body, contrasting roof, headlights pointing in the
      // direction of travel, wheels at the corners. Distinct from the
      // simple roundRect so each lane reads as moving traffic.
      const w = this.width;
      const h = this.height;
      const r = 10;
      // body shadow
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, r);
      ctx.fill();
      // body
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      ctx.fill();
      // roof / cabin (darker, set in)
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 14, -h / 2 + 6, w - 28, h - 12, 6);
      ctx.fill();
      // window highlights
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(-w / 2 + 18, -h / 2 + 9, 16, 5);
      ctx.fillRect(w / 2 - 34, -h / 2 + 9, 16, 5);
      // wheels (front + back)
      ctx.fillStyle = "#0a0a0a";
      [-w / 2 + 12, w / 2 - 12].forEach((cx) => {
        ctx.beginPath();
        ctx.arc(cx, h / 2 - 2, 5, 0, Math.PI * 2);
        ctx.arc(cx, -h / 2 + 2, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      // headlights at the leading edge (direction-aware)
      const headX = this.direction > 0 ? w / 2 - 4 : -w / 2 + 4;
      ctx.fillStyle = "rgba(255, 240, 180, 0.95)";
      ctx.beginPath();
      ctx.arc(headX, -h / 2 + 6, 3, 0, Math.PI * 2);
      ctx.arc(headX, h / 2 - 6, 3, 0, Math.PI * 2);
      ctx.fill();
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
    // Null-AudioManager fallback: when the inline assembler drops
    // resources/AudioManager.js, an unguarded `new AudioManager()` throws
    // ReferenceError → constructor fails → game never instantiates → board
    // never renders (user sees HUD with default values but empty canvas).
    // Mirror every method this example uses (beep, noise) plus the standard
    // shape so future audio calls don't trip the same wedge.
    this.audio = (typeof AudioManager === "function")
      ? new AudioManager()
      : {
          beep: () => {},
          noise: () => {},
          fadeIn: () => {},
          fadeOut: () => {},
          stop: () => {},
          loop: () => {},
          stopMusic: () => {},
          play: () => {}
        };
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

    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    }
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
    // Robust keyboard binding pattern: window scope + capture phase +
    // canvas focus. Without these, WebView/iframe hosts (mChatAI+
    // in-app preview, embedded Safari without a click) can eat the
    // keystroke before our page-level listener fires.
    if (this.canvas) {
      this.canvas.tabIndex = 0;
      try { this.canvas.focus({ preventScroll: true }); } catch (_) { this.canvas.focus(); }
    }
    window.addEventListener("keydown", (event) => {
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
    }, { capture: true });
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
        this._waterDriftPx = 0;
        this.loseLife("Splash. Ride a log across the river.");
        return;
      }
      // Accumulate sub-pixel drift across frames; snap the player to the
      // next column whenever the accumulator crosses a tile boundary. The
      // previous implementation recomputed `nextCol` each frame from the
      // PLAYER's snapped cell-center plus a single-frame drift (≈1px), so
      // the round() always landed on the same column — the player visually
      // stayed put while the log slid out from under them.
      this._waterDriftPx = (this._waterDriftPx || 0) + this.rideLog.direction * this.rideLog.speed * dt;
      while (Math.abs(this._waterDriftPx) >= TILE) {
        const dir = Math.sign(this._waterDriftPx);
        const newCol = this.player.col + dir;
        if (!this.board.inBounds(this.player.row, newCol)) {
          this._waterDriftPx = 0;
          this.loseLife("Carried off the river.");
          return;
        }
        this.player.snapTo(this.player.row, newCol);
        this._waterDriftPx -= dir * TILE;
      }
    } else {
      // Player is no longer on water — reset drift so a fresh log mount
      // doesn't inherit stale offset from a previous water trip.
      this._waterDriftPx = 0;
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
    // Tighten the collision AABB to ~half the tile (frog looks ~26px wide
    // visually; using 28 here gives a forgiving margin without letting a
    // car's edge phantom-clip you). Also add the water-drift offset so
    // the collision rect tracks the VISUAL position of the frog while it
    // glides on a log between tile snaps. Without this offset the AABB
    // would lag the visible frog by up to TILE/2 px on water rows.
    const dx = this.waterLanes.includes(this.player.row) ? (this._waterDriftPx || 0) : 0;
    return {
      x: pos.x - 14 + dx,
      y: pos.y - 14,
      width: 28,
      height: 28
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
    const time = (this.engine?.elapsedTime ?? performance.now() / 1000);
    for (let row = 0; row < ROWS; row += 1) {
      const y = row * TILE;
      if (this.waterLanes.includes(row)) {
        // Water: deep-to-shallow gradient + animated wavelets + scrolling
        // glints so the river clearly reads as moving water vs flat tile.
        const grad = ctx.createLinearGradient(0, y, 0, y + TILE);
        grad.addColorStop(0, "#072a45");
        grad.addColorStop(0.5, "#0d4666");
        grad.addColorStop(1, "#072a45");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, COLS * TILE, TILE);
        ctx.strokeStyle = "rgba(180, 220, 255, 0.18)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= COLS * TILE; x += 4) {
          const yy = y + TILE / 2 + Math.sin((x + time * 60 + row * 30) * 0.06) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      } else if (this.carLanes.includes(row)) {
        // Road: asphalt gradient + lighter shoulder lines top + bottom.
        const grad = ctx.createLinearGradient(0, y, 0, y + TILE);
        grad.addColorStop(0, "#1a1d23");
        grad.addColorStop(0.5, "#26292f");
        grad.addColorStop(1, "#1a1d23");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, COLS * TILE, TILE);
        ctx.fillStyle = "rgba(255, 220, 80, 0.65)";
        for (let x = 0; x < COLS * TILE; x += 60) {
          ctx.fillRect(x + 8, y + TILE / 2 - 2, 32, 4);
        }
      } else if (this.safeRows.includes(row)) {
        // Grass: layered greens with darker bands so the safe rows feel
        // like a pleasant rest stop.
        const grad = ctx.createLinearGradient(0, y, 0, y + TILE);
        grad.addColorStop(0, "#1f6e3f");
        grad.addColorStop(1, "#164e2c");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, COLS * TILE, TILE);
        // grass tufts
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        for (let x = 8; x < COLS * TILE; x += 24) {
          ctx.fillRect(x + ((row * 7) % 12), y + TILE - 6, 6, 2);
        }
      } else {
        ctx.fillStyle = "#173c2d";
        ctx.fillRect(0, y, COLS * TILE, TILE);
      }
      ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(COLS * TILE, y);
      ctx.stroke();
    }
  }

  drawHomes(ctx) {
    for (const col of HOME_COLS) {
      const pos = this.board.cellToWorld(0, col);
      const filled = this.homes.has(col);
      // pad recess
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.roundRect(pos.x - 26, pos.y - 24, 52, 48, 14);
      ctx.fill();
      // pad glow / fill
      ctx.fillStyle = filled ? "#9cff63" : "rgba(156, 255, 99, 0.14)";
      ctx.beginPath();
      ctx.roundRect(pos.x - 22, pos.y - 20, 44, 40, 10);
      ctx.fill();
      if (filled) {
        // mini frog icon to mark the secured home
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = "#0a3a14";
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0a3a14";
        ctx.beginPath();
        ctx.arc(-4, -4, 2, 0, Math.PI * 2);
        ctx.arc(4, -4, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawPlayer(ctx) {
    const pos = this.board.cellToWorld(this.player.row, this.player.col);
    // Visual drift on water: render the frog at the cell-center PLUS the
    // sub-tile drift accumulator so it slides smoothly with the log
    // between tile-boundary snaps. Without this the frog appeared stuck
    // at the cell while the log slid out from under it.
    const dx = this.waterLanes.includes(this.player.row) ? (this._waterDriftPx || 0) : 0;
    ctx.save();
    ctx.translate(pos.x + dx, pos.y);
    // soft drop shadow under the frog
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 12, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // back legs (peek out from sides)
    ctx.fillStyle = "#5fcd3d";
    ctx.beginPath();
    ctx.ellipse(-15, 6, 7, 5, -0.4, 0, Math.PI * 2);
    ctx.ellipse(15, 6, 7, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // body — gradient for depth
    const bodyGrad = ctx.createRadialGradient(0, -4, 4, 0, 0, 22);
    bodyGrad.addColorStop(0, "#c0ff86");
    bodyGrad.addColorStop(0.6, "#8fe75a");
    bodyGrad.addColorStop(1, "#3f8f1e");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // belly highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // eye sockets (raised bumps)
    ctx.fillStyle = "#7fd84a";
    ctx.beginPath();
    ctx.arc(-7, -10, 6, 0, Math.PI * 2);
    ctx.arc(7, -10, 6, 0, Math.PI * 2);
    ctx.fill();
    // eye whites
    ctx.fillStyle = "#fefefe";
    ctx.beginPath();
    ctx.arc(-7, -10, 4, 0, Math.PI * 2);
    ctx.arc(7, -10, 4, 0, Math.PI * 2);
    ctx.fill();
    // pupils
    ctx.fillStyle = "#0a1a05";
    ctx.beginPath();
    ctx.arc(-6, -10, 2.4, 0, Math.PI * 2);
    ctx.arc(8, -10, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // pupil shine
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(-5.4, -10.6, 0.9, 0, Math.PI * 2);
    ctx.arc(8.6, -10.6, 0.9, 0, Math.PI * 2);
    ctx.fill();
    // mouth hint
    ctx.strokeStyle = "rgba(20, 50, 10, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }
}
