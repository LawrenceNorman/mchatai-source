import { GameManager } from "../../core/GameManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { GridMover } from "../../entities/GridMover.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
import {
  drawDragon,
  drawKnight,
  drawTreasure,
  drawKey,
  drawGate
} from "../../resources/VectorSprites.js";

const WIDTH = 800;
const HEIGHT = 500;
const COLS = 10;
const ROWS = 6;
const TILE_W = WIDTH / COLS;
const TILE_H = HEIGHT / ROWS;
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

// Adventure world map. Each room has:
//   exits: { left|right|up|down: targetRoomID }
//   gate:  { side, requires } — locks an exit
//   items: [{ id, row, col }]
//   theme: { bg: "#hex", fg: "#hex", pattern: "trees|stones|water|fire|none" }
//   dragonStartHere: bool — dragon spawns here on restart
const ROOMS = {
  keep: {
    name: "Keep",
    exits: { right: "courtyard" },
    items: [],
    theme: { bg: "#1e3a8a", accent: "#7dd3fc", pattern: "stones" },
    welcome: "The home keep. Quest items return here."
  },
  courtyard: {
    name: "Courtyard",
    exits: { left: "keep", right: "forest", down: "well" },
    items: [{ id: "key", row: 1, col: 7 }],
    theme: { bg: "#1f3d2c", accent: "#86efac", pattern: "stones" },
    welcome: "A walled courtyard. A key glints near the wall."
  },
  forest: {
    name: "Forest",
    exits: { left: "courtyard", right: "bridge", up: "ridge" },
    items: [],
    theme: { bg: "#14532d", accent: "#22c55e", pattern: "trees" },
    welcome: "Dense forest. The path forks."
  },
  ridge: {
    name: "Ridge",
    exits: { down: "forest", right: "cave" },
    items: [{ id: "potion", row: 2, col: 3 }],
    theme: { bg: "#3f3a1f", accent: "#facc15", pattern: "stones" },
    welcome: "Wind-blown ridge. A faintly glowing potion sits in the rocks."
  },
  bridge: {
    name: "Bridge",
    exits: { left: "forest", right: "vault" },
    items: [],
    gate: { side: "right", requires: "key" },
    theme: { bg: "#1e293b", accent: "#94a3b8", pattern: "water" },
    welcome: "An old bridge over a river. The door east is locked."
  },
  cave: {
    name: "Cave",
    exits: { left: "ridge", down: "lair" },
    items: [],
    theme: { bg: "#1c1917", accent: "#78716c", pattern: "stones" },
    welcome: "A damp cave. Something moves below."
  },
  well: {
    name: "Old Well",
    exits: { up: "courtyard" },
    items: [{ id: "potion", row: 3, col: 4 }],
    theme: { bg: "#0f172a", accent: "#67e8f9", pattern: "water" },
    welcome: "An old stone well. A potion floats on the water."
  },
  lair: {
    name: "Dragon Lair",
    exits: { up: "cave" },
    items: [],
    theme: { bg: "#3d0c0c", accent: "#fb7185", pattern: "fire" },
    dragonStartHere: true,
    welcome: "The dragon's lair. Heat rolls from the walls."
  },
  vault: {
    name: "Vault",
    exits: { left: "bridge" },
    items: [{ id: "treasure", row: 2, col: 5 }],
    theme: { bg: "#7c2d12", accent: "#fbbf24", pattern: "stones" },
    welcome: "A jeweled vault. The treasure rests on a pedestal."
  }
};

// Adjacency list for dragon pathfinding through the room graph.
function neighborRoomsOf(roomID) {
  const exits = ROOMS[roomID]?.exits || {};
  return Object.values(exits);
}

// BFS shortest room-path from startRoom to targetRoom.
function shortestRoomPath(startRoom, targetRoom) {
  if (startRoom === targetRoom) return [];
  const queue = [[startRoom, []]];
  const visited = new Set([startRoom]);
  while (queue.length) {
    const [room, path] = queue.shift();
    for (const next of neighborRoomsOf(room)) {
      if (visited.has(next)) continue;
      const newPath = [...path, next];
      if (next === targetRoom) return newPath;
      visited.add(next);
      queue.push([next, newPath]);
    }
  }
  return [];
}

function adventureQuery(selector) {
  return document.querySelector(selector);
}

function distance(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export class AdventureGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.board = new GridBoard({ rows: ROWS, cols: COLS, tileSize: Math.min(TILE_W, TILE_H) });
    this.player = new GridMover({ row: 3, col: 1, moveDelay: 0.09, canEnter: () => true });
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
    // Persistent inventory: array of item ids. Player keeps potions across rooms.
    this.inventory = [];
    this.itemsTaken = new Set();
    // Dragon is global — has its own room and tile. It pathfinds across rooms toward the player.
    this.dragon = {
      roomID: "lair",
      row: 3,
      col: 5,
      moveElapsed: 0,
      roomElapsed: 0,
      facingLeft: true
    };
    this.health = 3;

    this.roomEl = adventureQuery("#roomName");
    this.inventoryEl = adventureQuery("#inventory");
    this.message = adventureQuery("#message");
    this.healthEl = adventureQuery("#health");
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    window.addEventListener("keydown", (event) => {
      const dir = DIRS[event.key];
      if (!dir) return;
      event.preventDefault();
      this.move(dir);
    });
    adventureQuery("#restartButton")?.addEventListener("click", () => this.restart());
    this.message.textContent = ROOMS.keep.welcome;
    this.engine.step(0);
    this.engine.start();
  }

  get room() {
    return ROOMS[this.roomID];
  }

  move(dir) {
    const next = { row: this.player.row + dir.row, col: this.player.col + dir.col };
    if (next.col < 0) return this.changeRoom("left");
    if (next.col >= COLS) return this.changeRoom("right");
    if (next.row < 0) return this.changeRoom("up");
    if (next.row >= ROWS) return this.changeRoom("down");
    this.player.snapTo(next.row, next.col);
    if (dir.col !== 0) this.player.facingLeft = dir.col < 0;
    this.collectItems();
    this.checkDragonContact();
  }

  changeRoom(side) {
    if (this.room.gate?.side === side && !this.hasItem("key")) {
      this.message.textContent = "Locked gate. Find the key.";
      this.audio.beep({ freq: 180, duration: 0.08, type: "square" });
      return;
    }
    const nextRoom = this.room.exits[side];
    if (!nextRoom) return;
    this.roomID = nextRoom;
    if (side === "right") this.player.snapTo(this.player.row, 0);
    if (side === "left") this.player.snapTo(this.player.row, COLS - 1);
    if (side === "up") this.player.snapTo(ROWS - 1, this.player.col);
    if (side === "down") this.player.snapTo(0, this.player.col);
    this.message.textContent = this.room.welcome || `Entered ${this.room.name}.`;
    this.audio.beep({ freq: 440, duration: 0.06, type: "triangle" });
    this.checkDragonContact();
  }

  hasItem(id) {
    return this.inventory.includes(id);
  }

  consumeItem(id) {
    const idx = this.inventory.indexOf(id);
    if (idx >= 0) this.inventory.splice(idx, 1);
  }

  // Dragon AI: every `roomMoveInterval`, the dragon takes one step on the room graph
  // toward the player's room. Within its current room, the dragon moves a tile every
  // `tileMoveInterval` toward the player (if same room) or toward the nearest exit
  // (if pathing to player's room).
  update(dt) {
    this.dragon.moveElapsed += dt;
    this.dragon.roomElapsed += dt;
    const tileMoveInterval = 0.55;
    const roomMoveInterval = 1.6;

    if (this.dragon.moveElapsed >= tileMoveInterval) {
      this.dragon.moveElapsed = 0;
      this._stepDragonTile();
    }
    if (this.dragon.roomElapsed >= roomMoveInterval) {
      this.dragon.roomElapsed = 0;
      this._maybeMoveDragonRoom();
    }
    this.checkDragonContact();
    this.updateHUD();
  }

  _stepDragonTile() {
    if (this.dragon.roomID !== this.roomID) {
      // Dragon in a different room — drift toward the exit that leads toward the player's room.
      const path = shortestRoomPath(this.dragon.roomID, this.roomID);
      if (path.length === 0) return;
      const targetRoom = path[0];
      const exits = ROOMS[this.dragon.roomID]?.exits || {};
      const exitSide = Object.keys(exits).find((side) => exits[side] === targetRoom);
      if (!exitSide) return;
      // Move toward the exit edge of this room.
      const target = this._exitTile(exitSide);
      this._stepDragonTowards(target);
      return;
    }
    // Same room as player — chase player tile-by-tile.
    this._stepDragonTowards({ row: this.player.row, col: this.player.col });
  }

  _stepDragonTowards(target) {
    const dr = Math.sign(target.row - this.dragon.row);
    const dc = Math.sign(target.col - this.dragon.col);
    // Prefer the axis with the bigger gap.
    if (Math.abs(target.col - this.dragon.col) >= Math.abs(target.row - this.dragon.row) && dc !== 0) {
      this.dragon.col += dc;
      this.dragon.facingLeft = dc < 0;
    } else if (dr !== 0) {
      this.dragon.row += dr;
    } else if (dc !== 0) {
      this.dragon.col += dc;
      this.dragon.facingLeft = dc < 0;
    }
    this.dragon.col = Math.max(0, Math.min(COLS - 1, this.dragon.col));
    this.dragon.row = Math.max(0, Math.min(ROWS - 1, this.dragon.row));
  }

  _exitTile(side) {
    if (side === "left") return { row: this.dragon.row, col: 0 };
    if (side === "right") return { row: this.dragon.row, col: COLS - 1 };
    if (side === "up") return { row: 0, col: this.dragon.col };
    if (side === "down") return { row: ROWS - 1, col: this.dragon.col };
    return { row: this.dragon.row, col: this.dragon.col };
  }

  _maybeMoveDragonRoom() {
    if (this.dragon.roomID === this.roomID) return;
    // If dragon is on an edge tile, attempt to traverse through that exit toward the player.
    const path = shortestRoomPath(this.dragon.roomID, this.roomID);
    if (path.length === 0) return;
    const targetRoom = path[0];
    const exits = ROOMS[this.dragon.roomID]?.exits || {};
    const exitSide = Object.keys(exits).find((side) => exits[side] === targetRoom);
    if (!exitSide) return;
    const onEdge =
      (exitSide === "left" && this.dragon.col === 0) ||
      (exitSide === "right" && this.dragon.col === COLS - 1) ||
      (exitSide === "up" && this.dragon.row === 0) ||
      (exitSide === "down" && this.dragon.row === ROWS - 1);
    if (!onEdge) return;
    // Cross into next room. Place dragon on the opposite edge.
    this.dragon.roomID = targetRoom;
    if (exitSide === "right") this.dragon.col = 0;
    else if (exitSide === "left") this.dragon.col = COLS - 1;
    else if (exitSide === "up") this.dragon.row = ROWS - 1;
    else if (exitSide === "down") this.dragon.row = 0;
    if (this.dragon.roomID === this.roomID) {
      this.message.textContent = "The dragon enters the room!";
      this.audio.noise({ duration: 0.15, volume: 0.05 });
    }
  }

  collectItems() {
    for (const item of this.room.items) {
      const key = `${this.roomID}:${item.id}:${item.row}:${item.col}`;
      if (this.itemsTaken.has(key) || item.row !== this.player.row || item.col !== this.player.col) continue;
      this.itemsTaken.add(key);
      this.inventory.push(item.id);
      const points = item.id === "treasure" ? 250 : item.id === "potion" ? 80 : 50;
      this.scoreboard.add(points);
      const messages = {
        key: "Key collected. Use it to unlock the bridge gate.",
        treasure: "Treasure! Carry it home to the Keep.",
        potion: "Potion collected. It can ward off one dragon strike."
      };
      this.message.textContent = messages[item.id] || "Item collected.";
      this.audio.beep({ freq: item.id === "treasure" ? 880 : 660, duration: 0.08, type: "triangle" });
    }
    if (this.roomID === "keep" && this.hasItem("treasure")) {
      this.scoreboard.add(500);
      this.message.textContent = "Treasure returned. Quest complete!";
      this.consumeItem("treasure");
      // Reset the run for replay.
      this.itemsTaken.clear();
      this.dragon = { roomID: "lair", row: 3, col: 5, moveElapsed: 0, roomElapsed: 0, facingLeft: true };
      this.health = 3;
    }
  }

  checkDragonContact() {
    if (this.dragon.roomID !== this.roomID) return;
    if (this.dragon.row === this.player.row && this.dragon.col === this.player.col) {
      if (this.hasItem("potion")) {
        this.consumeItem("potion");
        this.message.textContent = "The potion repels the dragon!";
        this.audio.beep({ freq: 760, duration: 0.1, type: "triangle" });
        // Knock dragon back to its lair.
        this.dragon.roomID = "lair";
        this.dragon.row = 3;
        this.dragon.col = 5;
      } else {
        this.health -= 1;
        this.audio.noise({ duration: 0.12, volume: 0.05 });
        if (this.health <= 0) {
          this.message.textContent = "Dragon bite. Defeated. Resetting quest.";
          this.restart();
        } else {
          this.message.textContent = `Dragon bite! ${this.health} health left. Back to the Keep.`;
          this.roomID = "keep";
          this.player.snapTo(3, 1);
        }
      }
    }
  }

  restart() {
    this.roomID = "keep";
    this.player.snapTo(3, 1);
    this.inventory = [];
    this.itemsTaken.clear();
    this.scoreboard.reset();
    this.health = 3;
    this.dragon = { roomID: "lair", row: 3, col: 5, moveElapsed: 0, roomElapsed: 0, facingLeft: true };
    this.message.textContent = "Find the key, unlock the bridge, claim the treasure, return to the Keep.";
  }

  updateHUD() {
    if (this.roomEl) this.roomEl.textContent = this.room.name;
    if (this.inventoryEl) {
      this.inventoryEl.textContent = this.inventory.length === 0
        ? "None"
        : this.inventory.map((id) => id[0].toUpperCase() + id.slice(1)).join(", ");
    }
    if (this.healthEl) this.healthEl.textContent = "♥".repeat(this.health) + "·".repeat(Math.max(0, 3 - this.health));
  }

  draw() {
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this._drawBackground();
    this._drawExits();
    this._drawItems();
    if (this.dragon.roomID === this.roomID) this._drawDragon();
    this._drawPlayer();
  }

  _drawBackground() {
    const theme = this.room.theme;
    // Base color
    this.ctx.fillStyle = theme.bg;
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Gradient overlay
    const grad = this.ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 50, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7);
    grad.addColorStop(0, "rgba(255,255,255,0.06)");
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Pattern
    this._drawPattern(theme.pattern, theme.accent);
  }

  _drawPattern(pattern, accent) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accent;
    if (pattern === "trees") {
      for (let i = 0; i < 18; i += 1) {
        const x = (i * 71 + 23) % WIDTH;
        const y = (i * 53 + 37) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 2, y, 4, 12);
      }
    } else if (pattern === "stones") {
      for (let i = 0; i < 22; i += 1) {
        const x = (i * 67 + 31) % WIDTH;
        const y = (i * 47 + 19) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 8 + (i % 3) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pattern === "water") {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 1.5;
      for (let y = 30; y < HEIGHT; y += 36) {
        ctx.beginPath();
        for (let x = 0; x < WIDTH; x += 16) {
          if (x === 0) ctx.moveTo(x, y);
          else ctx.quadraticCurveTo(x - 8, y - 6, x, y);
        }
        ctx.stroke();
      }
    } else if (pattern === "fire") {
      for (let i = 0; i < 14; i += 1) {
        const x = (i * 73 + 11) % WIDTH;
        const y = HEIGHT - ((i * 31 + 17) % 80) - 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 10, y - 30, x, y - 50);
        ctx.quadraticCurveTo(x + 10, y - 30, x, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawExits() {
    Object.keys(this.room.exits).forEach((side) => {
      const isGate = this.room.gate?.side === side;
      if (isGate) {
        const cx = side === "right" ? WIDTH - 36 : side === "left" ? 36 : WIDTH / 2;
        const cy = side === "down" ? HEIGHT - 40 : side === "up" ? 40 : HEIGHT / 2;
        drawGate(this.ctx, cx, cy, { scale: 1.6, unlocked: this.hasItem("key") });
      } else {
        // Open passage — soft glow at the edge
        this.ctx.save();
        this.ctx.fillStyle = "rgba(255, 248, 232, 0.35)";
        if (side === "right") this.ctx.fillRect(WIDTH - 8, HEIGHT / 2 - 50, 8, 100);
        if (side === "left") this.ctx.fillRect(0, HEIGHT / 2 - 50, 8, 100);
        if (side === "up") this.ctx.fillRect(WIDTH / 2 - 50, 0, 100, 8);
        if (side === "down") this.ctx.fillRect(WIDTH / 2 - 50, HEIGHT - 8, 100, 8);
        this.ctx.restore();
      }
    });
  }

  _drawItems() {
    this.room.items.forEach((item) => {
      const key = `${this.roomID}:${item.id}:${item.row}:${item.col}`;
      if (this.itemsTaken.has(key)) return;
      const cx = item.col * TILE_W + TILE_W / 2;
      const cy = item.row * TILE_H + TILE_H / 2;
      if (item.id === "key") drawKey(this.ctx, cx, cy, { scale: 1.6 });
      else if (item.id === "treasure") drawTreasure(this.ctx, cx, cy, { scale: 1.6 });
      else if (item.id === "potion") this._drawPotion(cx, cy);
    });
  }

  _drawPotion(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    // Bottle
    ctx.fillStyle = "#86efac";
    ctx.strokeStyle = "#1c2917";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-7, 12);
    ctx.quadraticCurveTo(-7, 18, 0, 18);
    ctx.quadraticCurveTo(7, 18, 7, 12);
    ctx.lineTo(7, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Neck
    ctx.fillStyle = "#86efac";
    ctx.fillRect(-3, -10, 6, 8);
    ctx.strokeRect(-3, -10, 6, 8);
    // Cork
    ctx.fillStyle = "#a16207";
    ctx.fillRect(-4, -14, 8, 4);
    // Liquid shine
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(-3, 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawDragon() {
    const cx = this.dragon.col * TILE_W + TILE_W / 2;
    const cy = this.dragon.row * TILE_H + TILE_H / 2;
    drawDragon(this.ctx, cx, cy, { scale: 1.5, flipX: !this.dragon.facingLeft });
  }

  _drawPlayer() {
    const cx = this.player.col * TILE_W + TILE_W / 2;
    const cy = this.player.row * TILE_H + TILE_H / 2;
    drawKnight(this.ctx, cx, cy, { scale: 1.4 });
  }
}
