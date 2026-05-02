function resolveScoreBoardTarget(target) {
  if (!target || typeof document === "undefined") {
    return null;
  }

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  return target;
}

function canUseLocalStorage() {
  return typeof localStorage !== "undefined";
}

function coerceScore(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export class ScoreBoard {
  constructor(options = {}) {
    this.labels = {
      score: options.scoreLabel || "Score",
      highScore: options.highScoreLabel || "Best"
    };
    this.storageKey = options.storageKey || "highScore";
    this.className = options.className || "mchatai-scoreboard";
    this.formatScore =
      typeof options.formatScore === "function"
        ? options.formatScore
        : (value) => String(value);
    this.persistHighScore = options.persistHighScore !== false;
    this.onPersistError =
      typeof options.onPersistError === "function" ? options.onPersistError : null;
    this.score = coerceScore(options.initialScore, 0);
    this.highScore = coerceScore(options.initialHighScore, 0);
    this.element = this._createElement();
    this.scoreValueElement = this.element.querySelector("[data-role='score-value']");
    this.highScoreValueElement = this.element.querySelector("[data-role='high-score-value']");
    this.ready = this.loadHighScore();

    const mountTarget = resolveScoreBoardTarget(options.target);
    if (mountTarget) {
      mountTarget.appendChild(this.element);
    }

    this.render();
  }

  attach(target) {
    const mountTarget = resolveScoreBoardTarget(target);
    if (mountTarget) {
      mountTarget.appendChild(this.element);
    }
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  setScore(value) {
    this.score = coerceScore(value, this.score);

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this._persistHighScore();
    }

    this.render();
    return this.score;
  }

  add(points = 1) {
    return this.setScore(this.score + coerceScore(points, 0));
  }

  reset(value = 0) {
    this.score = coerceScore(value, 0);
    this.render();
    return this.score;
  }

  setHighScore(value, options = {}) {
    this.highScore = coerceScore(value, this.highScore);
    this.render();

    if (options.persist !== false) {
      this._persistHighScore();
    }

    return this.highScore;
  }

  async loadHighScore() {
    try {
      const storedValue = await this._readFromStorage();
      const parsedValue = coerceScore(storedValue, this.highScore);

      if (parsedValue > this.highScore) {
        this.highScore = parsedValue;
      }

      this.render();
      return this.highScore;
    } catch (error) {
      this._handlePersistError(error);
      return this.highScore;
    }
  }

  render() {
    if (this.scoreValueElement) {
      this.scoreValueElement.textContent = this.formatScore(this.score);
    }

    if (this.highScoreValueElement) {
      this.highScoreValueElement.textContent = this.formatScore(this.highScore);
    }

    return this.element;
  }

  _createElement() {
    if (typeof document === "undefined") {
      return {
        querySelector() {
          return null;
        },
        remove() {}
      };
    }

    const root = document.createElement("div");
    root.className = this.className;
    root.dataset.component = "scoreboard";
    root.innerHTML = `
      <div class="${this.className}__item" data-role="score">
        <span class="${this.className}__label">${this.labels.score}</span>
        <span class="${this.className}__value" data-role="score-value">0</span>
      </div>
      <div class="${this.className}__item" data-role="high-score">
        <span class="${this.className}__label">${this.labels.highScore}</span>
        <span class="${this.className}__value" data-role="high-score-value">0</span>
      </div>
    `;
    return root;
  }

  async _persistHighScore() {
    if (!this.persistHighScore) {
      return;
    }

    try {
      await this._writeToStorage(this.highScore);
    } catch (error) {
      this._handlePersistError(error);
    }
  }

  async _readFromStorage() {
    const bridgeStorage = globalThis?.window?.mChatAI?.storage;
    if (bridgeStorage && typeof bridgeStorage.get === "function") {
      return bridgeStorage.get(this.storageKey);
    }

    if (canUseLocalStorage()) {
      return localStorage.getItem(this.storageKey);
    }

    return null;
  }

  async _writeToStorage(value) {
    const bridgeStorage = globalThis?.window?.mChatAI?.storage;
    if (bridgeStorage && typeof bridgeStorage.set === "function") {
      await bridgeStorage.set(this.storageKey, value);
      return;
    }

    if (canUseLocalStorage()) {
      localStorage.setItem(this.storageKey, String(value));
    }
  }

  _handlePersistError(error) {
    if (this.onPersistError) {
      this.onPersistError(error, this);
      return;
    }

    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[ScoreBoard] persistence error", error);
    }
  }
}
