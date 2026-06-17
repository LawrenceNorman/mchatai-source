// BEGIN mChatAI Web Component: systems.save-state-3d
//
// Tiny versioned localStorage wrapper for high scores, progress, and settings.
// localStorage works under file:// in WKWebView, so saves persist across game
// restarts. Versioned with a migrate() hook so a schema change doesn't corrupt
// old saves, and a safe no-op fallback (in-memory) when storage is unavailable
// (private mode, quota, sandbox) -- the game never crashes on save.
//
// Dependency-free. Offline-safe.
//
// Usage:
//   import { SaveState } from './systems/save-state-3d.js';
//   const save = new SaveState({ key: 'my-game', version: 1, defaults: { best: 0, level: 1 } });
//   const data = save.load();              // -> { best, level }
//   if (score > data.best) { data.best = score; save.save(data); }
//   save.set('level', 3);                  // shorthand single-field set + persist
//   const best = save.get('best', 0);

function _hasStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const k = '__mchatai_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

export class SaveState {
  // opts:
  //   key       localStorage key (namespace your game). Required.
  //   version   integer schema version. Default 1.
  //   defaults  object returned when nothing is saved yet. Default {}.
  //   migrate   (oldData, oldVersion) -> newData, run when stored version < current.
  constructor(opts = {}) {
    this.key = opts.key || 'mchatai-3d-game';
    this.version = Number.isInteger(opts.version) ? opts.version : 1;
    this.defaults = opts.defaults && typeof opts.defaults === 'object' ? opts.defaults : {};
    this.migrate = typeof opts.migrate === 'function' ? opts.migrate : null;
    this._hasStorage = _hasStorage();
    this._memory = null; // fallback store when no localStorage
    this._cache = null;
  }

  load() {
    if (this._cache) return this._cache;
    let raw = null;
    if (this._hasStorage) {
      try { raw = localStorage.getItem(this.key); } catch (e) { raw = null; }
    } else if (this._memory) {
      raw = this._memory;
    }
    if (!raw) {
      this._cache = Object.assign({}, this.defaults);
      return this._cache;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || typeof parsed !== 'object') {
      this._cache = Object.assign({}, this.defaults);
      return this._cache;
    }
    let data = parsed.data || {};
    const storedVersion = parsed.version || 0;
    if (storedVersion < this.version && this.migrate) {
      try { data = this.migrate(data, storedVersion) || data; } catch (e) { /* keep data */ }
    }
    // Fill any missing default keys (forward-compatible).
    this._cache = Object.assign({}, this.defaults, data);
    return this._cache;
  }

  save(data) {
    const payload = data || this._cache || {};
    this._cache = payload;
    const wrapped = JSON.stringify({ version: this.version, data: payload });
    if (this._hasStorage) {
      try { localStorage.setItem(this.key, wrapped); return true; }
      catch (e) { this._memory = wrapped; return false; }
    }
    this._memory = wrapped;
    return false;
  }

  get(field, fallback) {
    const data = this.load();
    return field in data ? data[field] : fallback;
  }

  set(field, value) {
    const data = this.load();
    data[field] = value;
    return this.save(data);
  }

  // Record a high score; returns true if it was a new best.
  recordBest(field, value) {
    const data = this.load();
    const prev = data[field] != null ? data[field] : -Infinity;
    if (value > prev) {
      data[field] = value;
      this.save(data);
      return true;
    }
    return false;
  }

  clear() {
    this._cache = null;
    this._memory = null;
    if (this._hasStorage) {
      try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ }
    }
  }
}

// Module-level convenience helpers for one-off saves.
export function saveState(key, data, version = 1) {
  return new SaveState({ key, version }).save(data);
}
export function loadState(key, defaults = {}, version = 1) {
  return new SaveState({ key, version, defaults }).load();
}

// END mChatAI Web Component: systems.save-state-3d
