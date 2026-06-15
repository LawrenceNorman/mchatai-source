// BEGIN mChatAI Web Component: ui.three-hud-overlay
//
// An absolutely-positioned HTML/CSS overlay that floats above the WebGL canvas
// to show score, a transient toast message, and a centered menu / pause /
// game-over panel with buttons. This is the convergence target for all 3D HUD
// chrome -- every game in the web-components-3d catalog mounts one of these so
// score and menu styling stay consistent and the WebGL canvas itself stays
// pure (no DOM children that would confuse the render probe).
//
// Pure DOM. No three.js import, no network, no external CSS file -- all styles
// are injected inline and scoped under a unique root class so two overlays
// never collide. ASCII only. WebGL2-friendly: the overlay never touches the
// canvas or its GL context; it sits in a sibling stacking layer.
//
// The overlay host should be position:relative (the same wrapper that holds the
// canvas). The overlay fills it and uses pointer-events:none by default so
// gameplay clicks fall through to the canvas; only interactive children (menu
// buttons) re-enable pointer events.
//
// Usage:
//   import { ThreeHudOverlay } from './ui/three-hud-overlay.js';
//   const hud = new ThreeHudOverlay({ title: 'Sky Runner' });
//   hud.mount(document.getElementById('stage')); // wrapper around the canvas
//   hud.setScore(0);
//   hud.showMenu({ buttons: [{ label: 'Play', onClick: () => startGame() }] });
//   // in gameplay:
//   hud.setScore(score);
//   hud.showMessage('Checkpoint!', { duration: 1.5 });
//   // on game over:
//   hud.showGameOver({ score, buttons: [{ label: 'Retry', onClick: restart }] });
//   // teardown:
//   hud.dispose();

let __hudInstanceCounter = 0;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }
  return node;
}

function styleSheetFor(rootClass) {
  // All rules scoped under .rootClass so multiple overlays are isolated.
  const r = '.' + rootClass;
  return [
    r + ' { position: absolute; inset: 0; overflow: hidden;',
    '  pointer-events: none; font-family: -apple-system, BlinkMacSystemFont,',
    '  "Segoe UI", system-ui, sans-serif; color: #f4f7fb;',
    '  -webkit-user-select: none; user-select: none; z-index: 10; }',

    r + ' .hud-topbar { position: absolute; top: 0; left: 0; right: 0;',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  padding: 14px 18px; gap: 12px; }',

    r + ' .hud-title { font-size: 15px; font-weight: 600; letter-spacing: 0.02em;',
    '  text-shadow: 0 1px 3px rgba(0,0,0,0.6); opacity: 0.92; }',

    r + ' .hud-score { font-size: 22px; font-weight: 700; font-variant-numeric:',
    '  tabular-nums; text-shadow: 0 1px 4px rgba(0,0,0,0.7); }',

    r + ' .hud-score-label { font-size: 11px; font-weight: 600; opacity: 0.7;',
    '  text-transform: uppercase; letter-spacing: 0.08em; margin-right: 6px; }',

    r + ' .hud-toast { position: absolute; top: 22%; left: 50%;',
    '  transform: translate(-50%, -50%); padding: 10px 20px; border-radius: 12px;',
    '  background: rgba(12, 18, 30, 0.72); backdrop-filter: blur(6px);',
    '  font-size: 18px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.6);',
    '  opacity: 0; transition: opacity 180ms ease; }',
    r + ' .hud-toast.is-visible { opacity: 1; }',

    r + ' .hud-panel { position: absolute; inset: 0; display: none;',
    '  align-items: center; justify-content: center; flex-direction: column;',
    '  background: rgba(8, 12, 22, 0.62); backdrop-filter: blur(4px);',
    '  pointer-events: auto; }',
    r + ' .hud-panel.is-visible { display: flex; }',

    r + ' .hud-panel-card { min-width: 240px; max-width: 80%;',
    '  padding: 28px 32px; border-radius: 18px; text-align: center;',
    '  background: rgba(18, 24, 38, 0.92);',
    '  box-shadow: 0 18px 48px rgba(0,0,0,0.45);',
    '  border: 1px solid rgba(255,255,255,0.08); }',

    r + ' .hud-panel-title { font-size: 26px; font-weight: 700; margin: 0 0 6px; }',
    r + ' .hud-panel-subtitle { font-size: 14px; opacity: 0.78; margin: 0 0 20px;',
    '  line-height: 1.4; }',
    r + ' .hud-panel-score { font-size: 40px; font-weight: 800; margin: 4px 0 18px;',
    '  font-variant-numeric: tabular-nums; }',

    r + ' .hud-buttons { display: flex; flex-direction: column; gap: 10px;',
    '  align-items: stretch; }',
    r + ' .hud-btn { appearance: none; border: 0; cursor: pointer;',
    '  padding: 12px 22px; border-radius: 12px; font-size: 16px; font-weight: 600;',
    '  font-family: inherit; color: #0a0e16; background: #f4f7fb;',
    '  transition: transform 80ms ease, background 120ms ease; pointer-events: auto; }',
    r + ' .hud-btn:hover { background: #ffffff; }',
    r + ' .hud-btn:active { transform: scale(0.97); }',
    r + ' .hud-btn.is-secondary { color: #f4f7fb; background: rgba(255,255,255,0.12); }',
    r + ' .hud-btn.is-secondary:hover { background: rgba(255,255,255,0.2); }'
  ].join('\n');
}

export class ThreeHudOverlay {
  // opts:
  //   title       small top-left caption (game name). Default "".
  //   scoreLabel  label shown before the running score. Default "Score".
  //   showScore   whether the top-right score is visible. Default true.
  constructor(opts = {}) {
    __hudInstanceCounter += 1;
    this._rootClass = 'mchatai-hud-' + __hudInstanceCounter;
    this._styleId = 'mchatai-hud-style-' + __hudInstanceCounter;

    this._title = typeof opts.title === 'string' ? opts.title : '';
    this._scoreLabel = typeof opts.scoreLabel === 'string' ? opts.scoreLabel : 'Score';
    this._showScore = opts.showScore !== false;

    this._host = null;
    this._root = null;
    this._styleEl = null;
    this._scoreValueEl = null;
    this._toastEl = null;
    this._panelEl = null;
    this._panelCardEl = null;
    this._titleEl = null;

    this._toastTimer = null;
    this._score = 0;
    this._disposed = false;
    this._mounted = false;

    // Track button click handlers so dispose() removes them cleanly.
    this._buttonCleanups = [];
  }

  // mount(host): build the DOM under `host` (the wrapper around the canvas).
  // Ensures host is positioned so absolute children anchor to it.
  mount(host) {
    if (this._disposed) {
      return this;
    }
    if (this._mounted) {
      return this;
    }
    const target = host || (typeof document !== 'undefined' ? document.body : null);
    if (!target) {
      throw new Error('ThreeHudOverlay.mount requires a host element.');
    }
    this._host = target;

    // Make sure the host can anchor absolutely-positioned children.
    if (typeof window !== 'undefined') {
      const pos = window.getComputedStyle(target).position;
      if (pos === 'static') {
        target.style.position = 'relative';
      }
    }

    // Inject scoped stylesheet once.
    if (typeof document !== 'undefined' && !document.getElementById(this._styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = this._styleId;
      styleEl.textContent = styleSheetFor(this._rootClass);
      document.head.appendChild(styleEl);
      this._styleEl = styleEl;
    }

    const root = el('div', this._rootClass);

    // Top bar: title (left) + score (right).
    const topbar = el('div', 'hud-topbar');
    this._titleEl = el('div', 'hud-title', this._title);
    topbar.appendChild(this._titleEl);

    const scoreWrap = el('div', 'hud-score');
    if (this._showScore) {
      const label = el('span', 'hud-score-label', this._scoreLabel);
      this._scoreValueEl = el('span', null, '0');
      scoreWrap.appendChild(label);
      scoreWrap.appendChild(this._scoreValueEl);
    } else {
      scoreWrap.style.display = 'none';
    }
    topbar.appendChild(scoreWrap);
    root.appendChild(topbar);

    // Transient toast message.
    this._toastEl = el('div', 'hud-toast');
    root.appendChild(this._toastEl);

    // Centered modal panel (menu / pause / game over).
    this._panelEl = el('div', 'hud-panel');
    this._panelCardEl = el('div', 'hud-panel-card');
    this._panelEl.appendChild(this._panelCardEl);
    root.appendChild(this._panelEl);

    target.appendChild(root);
    this._root = root;
    this._mounted = true;
    return this;
  }

  // setScore(value): update the running score readout.
  setScore(value) {
    if (this._disposed) {
      return this;
    }
    this._score = isFiniteNumber(value) ? value : 0;
    if (this._scoreValueEl) {
      this._scoreValueEl.textContent = String(this._score);
    }
    return this;
  }

  getScore() {
    return this._score;
  }

  setTitle(text) {
    this._title = typeof text === 'string' ? text : '';
    if (this._titleEl) {
      this._titleEl.textContent = this._title;
    }
    return this;
  }

  // showMessage(text, opts): flash a toast. opts.duration is seconds (default 1.6).
  // duration <= 0 keeps it visible until the next showMessage / hideMessage.
  showMessage(text, opts = {}) {
    if (this._disposed || !this._toastEl) {
      return this;
    }
    this._toastEl.textContent = String(text === undefined || text === null ? '' : text);
    this._toastEl.classList.add('is-visible');

    if (this._toastTimer !== null) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    const duration = isFiniteNumber(opts.duration) ? opts.duration : 1.6;
    if (duration > 0) {
      this._toastTimer = setTimeout(() => {
        if (this._toastEl) {
          this._toastEl.classList.remove('is-visible');
        }
        this._toastTimer = null;
      }, duration * 1000);
    }
    return this;
  }

  hideMessage() {
    if (this._toastTimer !== null) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    if (this._toastEl) {
      this._toastEl.classList.remove('is-visible');
    }
    return this;
  }

  // Internal: render a panel card with title/subtitle/score/buttons.
  _renderPanel(config = {}) {
    if (this._disposed || !this._panelCardEl) {
      return this;
    }
    // Tear down any prior buttons' listeners before rebuilding the card.
    this._clearButtons();
    this._panelCardEl.textContent = '';

    if (config.title !== undefined && config.title !== null) {
      this._panelCardEl.appendChild(el('h2', 'hud-panel-title', config.title));
    }
    if (config.subtitle !== undefined && config.subtitle !== null) {
      this._panelCardEl.appendChild(el('p', 'hud-panel-subtitle', config.subtitle));
    }
    if (isFiniteNumber(config.score)) {
      this._panelCardEl.appendChild(el('div', 'hud-panel-score', String(config.score)));
    }

    const buttons = Array.isArray(config.buttons) ? config.buttons : [];
    if (buttons.length > 0) {
      const btnWrap = el('div', 'hud-buttons');
      for (let i = 0; i < buttons.length; i += 1) {
        const spec = buttons[i] || {};
        const cls = spec.secondary ? 'hud-btn is-secondary' : 'hud-btn';
        const btn = el('button', cls, spec.label || 'OK');
        btn.type = 'button';
        const handler = (event) => {
          event.preventDefault();
          if (typeof spec.onClick === 'function') {
            spec.onClick(event);
          }
        };
        btn.addEventListener('click', handler);
        this._buttonCleanups.push(() => btn.removeEventListener('click', handler));
        btnWrap.appendChild(btn);
      }
      this._panelCardEl.appendChild(btnWrap);
    }

    if (this._panelEl) {
      this._panelEl.classList.add('is-visible');
    }
    return this;
  }

  // showMenu(config): title/subtitle/buttons for the start or pause menu.
  showMenu(config = {}) {
    return this._renderPanel({
      title: config.title !== undefined ? config.title : this._title || 'Ready?',
      subtitle: config.subtitle,
      score: config.score,
      buttons: config.buttons
    });
  }

  // showGameOver(config): a panel with the final score and retry buttons.
  showGameOver(config = {}) {
    return this._renderPanel({
      title: config.title !== undefined ? config.title : 'Game Over',
      subtitle: config.subtitle,
      score: isFiniteNumber(config.score) ? config.score : this._score,
      buttons: config.buttons
    });
  }

  hidePanel() {
    if (this._panelEl) {
      this._panelEl.classList.remove('is-visible');
    }
    this._clearButtons();
    return this;
  }

  isPanelVisible() {
    return !!(this._panelEl && this._panelEl.classList.contains('is-visible'));
  }

  _clearButtons() {
    for (let i = 0; i < this._buttonCleanups.length; i += 1) {
      try {
        this._buttonCleanups[i]();
      } catch (e) {
        // Ignore: element may already be detached.
      }
    }
    this._buttonCleanups = [];
  }

  // dispose(): remove DOM, listeners, timers, and the injected stylesheet.
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    if (this._toastTimer !== null) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this._clearButtons();

    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    if (this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
    }

    this._root = null;
    this._styleEl = null;
    this._scoreValueEl = null;
    this._toastEl = null;
    this._panelEl = null;
    this._panelCardEl = null;
    this._titleEl = null;
    this._host = null;
    this._mounted = false;
  }
}

export default ThreeHudOverlay;

// END mChatAI Web Component: ui.three-hud-overlay
