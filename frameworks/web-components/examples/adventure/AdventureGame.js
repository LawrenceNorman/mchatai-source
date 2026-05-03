import { GameManager } from "../../core/GameManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { GridMover } from "../../entities/GridMover.js";
import { AIPathfinder } from "../../entities/AIPathfinder.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
import { drawSprite } from "../../resources/SpriteRenderer.js";
import {
  KNIGHT, KNIGHT_PALETTE,
  DRAGON, DRAGON_PALETTE,
  TREASURE, TREASURE_PALETTE,
  KEY, KEY_PALETTE,
  GATE, GATE_PALETTE
} from "../../resources/SpritePresets.js";

const WIDTH = 560;
const HEIGHT = 420;
const TILE = 70;
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
const ROOMS = {
  keep: {
    name: "Keep",
    color: "#1d4ed8",
    exits: { right: "forest" },
    items: [{ id: "key", label: "Key", row: 2, col: 5, color: "#facc15" }],
    gate: null,
    dragon: null
  },
  forest: {
    name: "Forest",
    color: "#166534",
    exits: { left: "keep", right: "vault" },
    items: [],
    gate: { side: "right", requires: "key" },
    dragon: { row: 4, col: 3 }
  },
  vault: {
    name: "Vault",
    color: "#7c2d12",
    exits: { left: "forest" },
    items: [{ id: "treasure", label: "Treasure", row: 2, col: 2, color: "#fb923c" }],
    gate: null,
    dragon: null
  }
};

function adventureQuery(selector) {
  return document.querySelector(selector);
}

export class AdventureGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.board = new GridBoard({ rows: 6, cols: 8, tileSize: TILE });
    this.player = new GridMover({ row: 3, col: 1, moveDelay: 0.09, canEnter: () => true });
    this.pathfinder = new AIPathfinder({ canEnter: () => true });
    this.audio = new AudioManager({ masterVolume: 0.05 });
    this.scoreboard = new ScoreBoard({
      target: options.scoreboardTarget,
      storageKey: "mchatai.adventure.best",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.engine = new GameManager({
      canvas: this.canvas,
      width: WIDTH,
      height: HEIGHT,
      clearEachFrame: false,
      onUpdate: (dt) => this.update(dt),
      onDraw: () => this.draw()
    });
    this.roomID = "keep";
    this.inventory = null;
    this.itemsTaken = new Set();
    this.dragon = { row: 4, col: 3, elapsed: 0 };
    this.roomEl = adventureQuery("#roomName");
    this.inventoryEl = adventureQuery("#inventory");
    this.message = adventureQuery("#message");
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    window.addEventListener("keydown", (event) => {
      const dir = DIRS[event.key];
      if (!dir) return;
      event.preventDefault();
      this.move(dir);
    });
    adventureQuery("#restartButton").addEventListener("click", () => this.restart());
    this.engine.step(0);
    this.engine.start();
  }

  get room() {
    return ROOMS[this.roomID];
  }

  move(dir) {
    const next = { row: this.player.row + dir.row, col: this.player.col + dir.col };
    if (next.col < 0) return this.changeRoom("left");
    if (next.col >= this.board.cols) return this.changeRoom("right");
    if (next.row < 0) return this.changeRoom("up");
    if (next.row >= this.board.rows) return this.changeRoom("down");
    this.player.snapTo(next.row, next.col);
    this.collectItems();
    this.checkDragon();
  }

  changeRoom(side) {
    if (this.room.gate?.side === side && this.inventory !== this.room.gate.requires) {
      this.message.textContent = "Locked gate. Find the key.";
      this.audio.beep({ freq: 180, duration: 0.08, type: "square" });
      return;
    }
    const nextRoom = this.room.exits[side];
    if (!nextRoom) {
      return;
    }
    this.roomID = nextRoom;
    if (side === "right") this.player.snapTo(this.player.row, 0);
    if (side === "left") this.player.snapTo(this.player.row, this.board.cols - 1);
    this.dragon = { ...(this.room.dragon || { row: -1, col: -1 }), elapsed: 0 };
    this.message.textContent = `Entered ${this.room.name}.`;
    this.audio.beep({ freq: 440, duration: 0.06, type: "triangle" });
  }

  update(dt) {
    if (this.room.dragon) {
      this.dragon.elapsed += dt;
      if (this.dragon.elapsed > 0.5) {
        this.dragon.elapsed = 0;
        const step = this.pathfinder.nextStep(this.board, this.dragon, this.player);
        if (step) {
          this.dragon.row = step.row;
          this.dragon.col = step.col;
        }
      }
      this.checkDragon();
    }
    this.updateHUD();
  }

  collectItems() {
    for (const item of this.room.items) {
      const key = `${this.roomID}:${item.id}`;
      if (this.itemsTaken.has(key) || item.row !== this.player.row || item.col !== this.player.col) {
        continue;
      }
      this.itemsTaken.add(key);
      this.inventory = item.id;
      this.scoreboard.add(item.id === "treasure" ? 250 : 50);
      this.message.textContent = item.id === "treasure" ? "Treasure found. Bring it home." : "Key collected. Unlock the gate.";
      this.audio.beep({ freq: item.id === "treasure" ? 880 : 660, duration: 0.08, type: "triangle" });
    }
    if (this.roomID === "keep" && this.inventory === "treasure") {
      this.scoreboard.add(500);
      this.message.textContent = "Treasure returned. Quest complete.";
      this.inventory = null;
      this.itemsTaken.clear();
    }
  }

  checkDragon() {
    if (!this.room.dragon) {
      return;
    }
    if (this.dragon.row === this.player.row && this.dragon.col === this.player.col) {
      this.message.textContent = "Dragon bite. Back to the keep.";
      this.roomID = "keep";
      this.player.snapTo(3, 1);
      this.inventory = null;
      this.audio.noise({ duration: 0.1, volume: 0.04 });
    }
  }

  restart() {
    this.roomID = "keep";
    this.player.snapTo(3, 1);
    this.inventory = null;
    this.itemsTaken.clear();
    this.scoreboard.reset();
    this.message.textContent = "Arrow keys or WASD to move room to room.";
  }

  updateHUD() {
    this.roomEl.textContent = this.room.name;
    this.inventoryEl.textContent = this.inventory || "None";
  }

  draw() {
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.ctx.fillStyle = this.room.color;
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawGrid();
    this.drawExits();
    this.drawItems();
    this.drawDragon();
    this.drawPlayer();
  }

  drawGrid() {
    this.ctx.strokeStyle = "rgba(255,255,255,0.12)";
    for (let x = 0; x <= WIDTH; x += TILE) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, HEIGHT);
      this.ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += TILE) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(WIDTH, y);
      this.ctx.stroke();
    }
  }

  drawExits() {
    Object.keys(this.room.exits).forEach((side) => {
      const isGate = this.room.gate?.side === side;
      if (isGate) {
        // Render the GATE sprite at the right edge for "right" gates,
        // mirrored for left gates. The gate sprite is 12x14.
        const scale = 4;
        const spriteWidth = 12 * scale;
        const spriteHeight = 14 * scale;
        const y = HEIGHT / 2 - spriteHeight / 2;
        const x = side === "right" ? WIDTH - spriteWidth : 0;
        drawSprite(this.ctx, GATE, GATE_PALETTE, { x, y, scale });
      } else {
        // Open passage — light bar
        this.ctx.fillStyle = "#fff8e8";
        if (side === "right") this.ctx.fillRect(WIDTH - 12, HEIGHT / 2 - 48, 12, 96);
        if (side === "left") this.ctx.fillRect(0, HEIGHT / 2 - 48, 12, 96);
      }
    });
  }

  drawItems() {
    this.room.items.forEach((item) => {
      if (this.itemsTaken.has(`${this.roomID}:${item.id}`)) return;
      const cx = item.col * TILE + TILE / 2;
      const cy = item.row * TILE + TILE / 2;
      if (item.id === "key") {
        // KEY sprite is 8x4. Scale 5 = 40x20.
        drawSprite(this.ctx, KEY, KEY_PALETTE, { x: cx, y: cy, scale: 5, anchor: "center" });
      } else if (item.id === "treasure") {
        // TREASURE 10x8. Scale 5 = 50x40.
        drawSprite(this.ctx, TREASURE, TREASURE_PALETTE, { x: cx, y: cy, scale: 5, anchor: "center" });
      } else {
        // Fallback rectangle for any unknown item type.
        this.ctx.fillStyle = item.color;
        this.ctx.fillRect(cx - 16, cy - 16, 32, 32);
      }
    });
  }

  drawDragon() {
    if (!this.room.dragon) return;
    const cx = this.dragon.col * TILE + TILE / 2;
    const cy = this.dragon.row * TILE + TILE / 2;
    // DRAGON 16x11. Scale 4 = 64x44.
    drawSprite(this.ctx, DRAGON, DRAGON_PALETTE, { x: cx, y: cy, scale: 4, anchor: "center" });
  }

  drawPlayer() {
    const cx = this.player.col * TILE + TILE / 2;
    const cy = this.player.row * TILE + TILE / 2;
    // KNIGHT 12x14. Scale 4 = 48x56.
    drawSprite(this.ctx, KNIGHT, KNIGHT_PALETTE, { x: cx, y: cy, scale: 4, anchor: "center" });
  }
}
