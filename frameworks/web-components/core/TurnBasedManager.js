export class TurnBasedManager {
  constructor(options = {}) {
    this.players = Array.isArray(options.players) && options.players.length > 0
      ? options.players.slice()
      : ["player1", "player2"];
    this.turnIndex = options.turnIndex ?? 0;
    this.phase = options.phase || "idle";
    this.round = options.round ?? 1;
    this.history = [];
    this.maxHistory = options.maxHistory ?? 200;
    this.rules = new Map();
    this.listeners = new Map();
  }

  get currentPlayer() {
    return this.players[this.turnIndex % this.players.length];
  }

  setPhase(phase, payload = {}) {
    const previousPhase = this.phase;
    this.phase = phase;
    this.emit("phasechange", { previousPhase, phase, ...payload });
    return this;
  }

  nextTurn(payload = {}) {
    const previousPlayer = this.currentPlayer;
    this.turnIndex = (this.turnIndex + 1) % this.players.length;
    if (this.turnIndex === 0) {
      this.round += 1;
    }
    this.emit("turnchange", {
      previousPlayer,
      currentPlayer: this.currentPlayer,
      turnIndex: this.turnIndex,
      round: this.round,
      ...payload
    });
    return this;
  }

  registerRule(name, fn) {
    if (typeof fn !== "function") {
      throw new TypeError(`Rule '${name}' must be a function.`);
    }
    this.rules.set(name, fn);
    return this;
  }

  runRule(name, context = {}) {
    const fn = this.rules.get(name);
    if (!fn) {
      return { ok: false, reason: `Missing rule: ${name}` };
    }
    return fn({ manager: this, ...context });
  }

  record(action) {
    const entry = {
      timestamp: Date.now(),
      player: this.currentPlayer,
      phase: this.phase,
      round: this.round,
      ...action
    };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.emit("action", entry);
    return entry;
  }

  on(eventName, fn) {
    if (typeof fn !== "function") {
      return () => {};
    }
    const listeners = this.listeners.get(eventName) || new Set();
    listeners.add(fn);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(fn);
  }

  emit(eventName, payload = {}) {
    for (const fn of this.listeners.get(eventName) || []) {
      fn(payload);
    }
  }

  reset(options = {}) {
    this.turnIndex = options.turnIndex ?? 0;
    this.round = options.round ?? 1;
    this.phase = options.phase || "idle";
    this.history = [];
    this.emit("reset", { currentPlayer: this.currentPlayer, phase: this.phase });
    return this;
  }
}
