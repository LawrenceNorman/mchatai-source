function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function resolveCanvas(options = {}) {
  if (options.canvas) {
    return options.canvas;
  }

  if (options.canvasId && typeof document !== "undefined") {
    return document.getElementById(options.canvasId);
  }

  if (options.autoAttach && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const mountTarget = resolveMountTarget(options.mountTarget) || document.body;
    mountTarget.appendChild(canvas);
    return canvas;
  }

  return null;
}

function resolveMountTarget(target) {
  if (!target || typeof document === "undefined") {
    return null;
  }

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  return target;
}

export class GameManager {
  constructor(options = {}) {
    this.canvas = resolveCanvas(options);
    this.ctx = this.canvas
      ? this.canvas.getContext("2d", options.contextAttributes || {})
      : null;

    this.width = isFiniteNumber(options.width) ? options.width : 800;
    this.height = isFiniteNumber(options.height) ? options.height : 600;
    this.pixelRatio = isFiniteNumber(options.pixelRatio)
      ? Math.max(1, options.pixelRatio)
      : this._getDevicePixelRatio();
    this.maxDelta = isFiniteNumber(options.maxDelta)
      ? Math.max(0.001, options.maxDelta)
      : 1 / 15;
    this.timeScale = isFiniteNumber(options.timeScale)
      ? Math.max(0, options.timeScale)
      : 1;
    this.clearEachFrame = options.clearEachFrame !== false;
    this.clearColor = options.clearColor || null;
    this.autoResize = options.autoResize === true;
    this.sortEntities = options.sortEntities !== false;
    this.running = false;
    this.paused = false;
    this.frame = 0;
    this.elapsedTime = 0;
    this.lastTimestamp = 0;
    this.entities = [];
    this._pendingAdd = [];
    this._pendingRemove = new Set();
    this._frameHandle = null;
    this._boundFrame = (timestamp) => this._frame(timestamp);
    this._onUpdate = typeof options.onUpdate === "function" ? options.onUpdate : null;
    this._onDraw = typeof options.onDraw === "function" ? options.onDraw : null;
    this._onError = typeof options.onError === "function" ? options.onError : null;
    this._resizeHandler = null;

    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = options.imageSmoothingEnabled !== false;
    }

    if (this.canvas) {
      this.resize(this.width, this.height);
      if (this.autoResize) {
        this._installResizeHandler();
      }
    }
  }

  addEntity(entity) {
    if (!entity) {
      return null;
    }

    if (this.entities.includes(entity) || this._pendingAdd.includes(entity)) {
      return entity;
    }

    this._pendingRemove.delete(entity);
    this._pendingAdd.push(entity);
    return entity;
  }

  removeEntity(entity) {
    if (!entity) {
      return false;
    }

    this._pendingAdd = this._pendingAdd.filter((item) => item !== entity);

    if (!this.entities.includes(entity)) {
      return false;
    }

    this._pendingRemove.add(entity);
    return true;
  }

  hasEntity(entity) {
    return this.entities.includes(entity) || this._pendingAdd.includes(entity);
  }

  clearEntities() {
    for (const entity of this.entities) {
      this._pendingRemove.add(entity);
    }
    this._pendingAdd = [];
  }

  getEntities() {
    return this.entities.slice();
  }

  start() {
    if (this.running && !this.paused) {
      return this;
    }

    this.running = true;
    this.paused = false;
    this.lastTimestamp = 0;
    this._queueNextFrame();
    return this;
  }

  pause() {
    if (!this.running || this.paused) {
      return this;
    }

    this.paused = true;
    this._cancelFrame();
    return this;
  }

  resume() {
    if (!this.running) {
      return this.start();
    }

    if (!this.paused) {
      return this;
    }

    this.paused = false;
    this.lastTimestamp = 0;
    this._queueNextFrame();
    return this;
  }

  stop() {
    this.running = false;
    this.paused = false;
    this.lastTimestamp = 0;
    this._cancelFrame();
    return this;
  }

  restart() {
    this.frame = 0;
    this.elapsedTime = 0;
    this.lastTimestamp = 0;
    return this;
  }

  step(dt = 1 / 60) {
    const clampedDt = Math.max(0, Math.min(this.maxDelta, dt)) * this.timeScale;
    this._tick(clampedDt);
    return this;
  }

  resize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));

    if (!this.canvas || !this.ctx) {
      return this;
    }

    const ratio = this.pixelRatio;
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    return this;
  }

  resizeToContainer() {
    if (!this.canvas) {
      return this;
    }

    const container = this.canvas.parentElement;
    const fallbackWidth =
      typeof window !== "undefined" ? window.innerWidth : this.width;
    const fallbackHeight =
      typeof window !== "undefined" ? window.innerHeight : this.height;
    const nextWidth = container?.clientWidth || fallbackWidth;
    const nextHeight = container?.clientHeight || fallbackHeight;
    return this.resize(nextWidth, nextHeight);
  }

  clearCanvas() {
    if (!this.ctx) {
      return;
    }

    this.ctx.clearRect(0, 0, this.width, this.height);
    if (this.clearColor) {
      this.ctx.save();
      this.ctx.fillStyle = this.clearColor;
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    }
  }

  destroy() {
    this.stop();
    this.entities = [];
    this._pendingAdd = [];
    this._pendingRemove.clear();

    if (this._resizeHandler && typeof window !== "undefined") {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
  }

  _frame(timestamp) {
    if (!this.running || this.paused) {
      return;
    }

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }

    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    const clampedDt = Math.max(0, Math.min(this.maxDelta, rawDt)) * this.timeScale;
    this.lastTimestamp = timestamp;

    try {
      this._tick(clampedDt);
      this._queueNextFrame();
    } catch (error) {
      this.stop();
      this._handleError(error);
    }
  }

  _tick(dt) {
    this._flushEntityQueues();

    if (this._onUpdate) {
      this._onUpdate(dt, this);
    }

    for (const entity of this.entities.slice()) {
      if (entity && entity.active === false) {
        continue;
      }

      if (typeof entity?.update === "function") {
        entity.update(dt, this);
      }
    }

    this._flushEntityQueues();

    if (this.ctx) {
      if (this.clearEachFrame) {
        this.clearCanvas();
      }

      const drawableEntities = this.sortEntities
        ? this.entities.slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
        : this.entities;

      for (const entity of drawableEntities) {
        if (entity && entity.visible === false) {
          continue;
        }

        if (typeof entity?.draw === "function") {
          entity.draw(this.ctx, this);
        }
      }

      if (this._onDraw) {
        this._onDraw(this.ctx, this);
      }
    }

    this.frame += 1;
    this.elapsedTime += dt;
  }

  _flushEntityQueues() {
    if (this._pendingRemove.size > 0) {
      const removals = this._pendingRemove;
      this.entities = this.entities.filter((entity) => {
        if (!removals.has(entity)) {
          return true;
        }

        if (entity && entity.game === this) {
          delete entity.game;
        }

        if (typeof entity?.onRemove === "function") {
          entity.onRemove(this);
        }

        return false;
      });
      removals.clear();
    }

    if (this._pendingAdd.length > 0) {
      for (const entity of this._pendingAdd) {
        entity.game = this;
        this.entities.push(entity);

        if (typeof entity?.onAdd === "function") {
          entity.onAdd(this);
        }
      }

      this._pendingAdd = [];
    }
  }

  _queueNextFrame() {
    if (typeof requestAnimationFrame !== "function") {
      throw new Error("GameManager requires requestAnimationFrame in the current runtime.");
    }

    this._cancelFrame();
    this._frameHandle = requestAnimationFrame(this._boundFrame);
  }

  _cancelFrame() {
    if (this._frameHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this._frameHandle);
    }
    this._frameHandle = null;
  }

  _installResizeHandler() {
    if (typeof window === "undefined") {
      return;
    }

    this._resizeHandler = () => this.resizeToContainer();
    window.addEventListener("resize", this._resizeHandler);
    this.resizeToContainer();
  }

  _getDevicePixelRatio() {
    if (typeof window === "undefined" || !isFiniteNumber(window.devicePixelRatio)) {
      return 1;
    }
    return Math.max(1, window.devicePixelRatio);
  }

  _handleError(error) {
    if (this._onError) {
      this._onError(error, this);
      return;
    }

    throw error;
  }
}
